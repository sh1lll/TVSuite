// Write a TradingView indicator in Python, JavaScript or Java syntax → Pine Script v6, which is the only
// language TradingView runs. Supports the indicator subset: inputs, series math, ta.* / math.* calls,
// history references (close[1]), conditions, if/else blocks, small functions, plots, shapes, background
// colours and alerts. Anything else (loops, classes, imports of other libraries) is reported with its line,
// so the AI translation can take over. Pure, unit-tested.

export class TranspileError extends Error {
  constructor(message, line) { super(line ? `Line ${line}: ${message}` : message); this.line = line; }
}

const KEYWORDS = {
  python: new Set(['if', 'elif', 'else', 'def', 'return', 'and', 'or', 'not', 'True', 'False', 'None', 'for', 'while', 'class', 'import', 'from', 'lambda', 'pass', 'global']),
  js: new Set(['if', 'else', 'function', 'return', 'const', 'let', 'var', 'true', 'false', 'null', 'undefined', 'for', 'while', 'do', 'class', 'import', 'export', 'new']),
  java: new Set(['if', 'else', 'return', 'true', 'false', 'null', 'for', 'while', 'do', 'class', 'import', 'new', 'final', 'var', 'int', 'double', 'float', 'long', 'boolean', 'String', 'color', 'public', 'private', 'static', 'void']),
};
const TYPE_WORDS = new Set(['int', 'double', 'float', 'long', 'boolean', 'bool', 'String', 'string', 'color', 'var', 'let', 'const', 'final', 'auto', 'series', 'simple']);

// ---------------- Lexer ----------------
function lex(src, lang) {
  const out = [];
  const lines = String(src).replace(/\r\n?/g, '\n').split('\n');
  const indents = [0];
  let depth = 0, inBlockComment = false;
  const push = (t, v, line) => out.push({ t, v, line });
  for (let li = 0; li < lines.length; li++) {
    let s = lines[li];
    const line = li + 1;
    let i = 0;
    if (inBlockComment) { const e = s.indexOf('*/'); if (e < 0) continue; i = e + 2; inBlockComment = false; }
    // Python indentation (only at bracket depth 0, on non-blank lines)
    if (lang === 'python' && depth === 0) {
      const body = s.replace(/#.*$/, '');
      if (!body.trim()) continue;
      const ind = s.match(/^[ \t]*/)[0].replace(/\t/g, '    ').length;
      if (ind > indents[indents.length - 1]) { indents.push(ind); push('indent', null, line); }
      while (ind < indents[indents.length - 1]) { indents.pop(); push('dedent', null, line); }
      if (ind !== indents[indents.length - 1]) throw new TranspileError('Indentation doesn’t match an outer block', line);
    }
    let any = false;
    while (i < s.length) {
      const c = s[i], rest = s.slice(i);
      if (c === ' ' || c === '\t') { i++; continue; }
      if (lang === 'python' && c === '#') break;
      if (lang !== 'python' && rest.startsWith('//')) {
        const m = rest.match(/^\/\/\s*@indicator\s*\((.*)\)\s*$/);
        if (m) { push('pragma', m[1], line); any = true; }
        break;
      }
      if (lang !== 'python' && rest.startsWith('/*')) { const e = s.indexOf('*/', i + 2); if (e < 0) { inBlockComment = true; break; } i = e + 2; continue; }
      let m;
      if ((m = rest.match(/^(\d+\.\d*|\.\d+|\d+)([eE][-+]?\d+)?[fFdDlL]?/))) { push('num', m[0].replace(/[fFdDlL]$/, ''), line); i += m[0].length; any = true; continue; }
      if (c === '"' || c === "'" || c === '`') {
        let j = i + 1, v = '';
        while (j < s.length && s[j] !== c) { if (s[j] === '\\' && j + 1 < s.length) { v += s[j + 1]; j += 2; } else v += s[j++]; }
        if (j >= s.length) throw new TranspileError('Unterminated string', line);
        if (c === '`' && /\$\{/.test(v)) throw new TranspileError('Template strings with ${…} aren’t supported — use + to join', line);
        push('str', v, line); i = j + 1; any = true; continue;
      }
      if ((m = rest.match(/^[A-Za-z_$][\w$]*/))) { push('id', m[0], line); i += m[0].length; any = true; continue; }
      const ops = ['===', '!==', '**=', '//=', '>>=', '<<=', '==', '!=', '<=', '>=', '&&', '||', '**', '//', '+=', '-=', '*=', '/=', '%=', '=>', '++', '--', '->'];
      const op = ops.find((o) => rest.startsWith(o) && !(o === '//' && lang !== 'python'));
      if (op) { push('op', op, line); i += op.length; any = true; continue; }
      if ('+-*/%<>=!?:.,;()[]{}&|^~@'.includes(c)) {
        if ('([{'.includes(c)) depth++;
        if (')]}'.includes(c)) depth = Math.max(0, depth - 1);
        push('op', c, line); i++; any = true; continue;
      }
      throw new TranspileError(`Unexpected character “${c}”`, line);
    }
    if (any && depth === 0) push('nl', null, line);
  }
  if (lang === 'python') while (indents.length > 1) { indents.pop(); out.push({ t: 'dedent', v: null, line: lines.length }); }
  out.push({ t: 'eof', v: null, line: lines.length });
  return out;
}

// ---------------- Parser ----------------
const BIN = { '||': 1, or: 1, '&&': 2, and: 2, '==': 4, '===': 4, '!=': 4, '!==': 4, '<': 5, '>': 5, '<=': 5, '>=': 5, '+': 6, '-': 6, '*': 7, '/': 7, '%': 7, '//': 7, '**': 9 };

function parse(tokens, lang) {
  let p = 0;
  const peek = (o = 0) => tokens[p + o];
  const next = () => tokens[p++];
  const is = (t, v) => { const k = peek(); return k.t === t && (v === undefined || k.v === v); };
  const eat = (t, v) => { if (is(t, v)) return next(); return null; };
  const expect = (t, v, what) => { const k = next(); if (k.t !== t || (v !== undefined && k.v !== v)) throw new TranspileError(`Expected ${what || v || t} but found “${k.v ?? k.t}”`, k.line); return k; };
  const skipNl = () => { while (eat('nl') || eat('op', ';')); };
  const isWord = (w) => is('id', w);

  function primary() {
    const k = next();
    if (k.t === 'num') return { type: 'num', v: k.v };
    if (k.t === 'str') return { type: 'str', v: k.v };
    if (k.t === 'op' && k.v === '(') { const e = expr(); expect('op', ')'); return { type: 'paren', e }; }
    if (k.t === 'op' && k.v === '{') { // JS object literal → named args
      const props = [];
      while (!is('op', '}')) { const key = next(); if (key.t !== 'id' && key.t !== 'str') throw new TranspileError('Bad object key', key.line); expect('op', ':'); props.push([key.v, expr()]); if (!eat('op', ',')) break; }
      expect('op', '}');
      return { type: 'obj', props };
    }
    if (k.t === 'op' && k.v === '[') throw new TranspileError('Arrays aren’t supported in the translated subset', k.line);
    if (k.t === 'id') {
      if (['true', 'True'].includes(k.v)) return { type: 'bool', v: true };
      if (['false', 'False'].includes(k.v)) return { type: 'bool', v: false };
      if (['null', 'None', 'undefined', 'na', 'NaN'].includes(k.v)) return { type: 'na' };
      if (k.v === 'new') throw new TranspileError('“new” objects aren’t supported', k.line);
      if (k.v === 'lambda') throw new TranspileError('lambda isn’t supported — use def', k.line);
      return { type: 'id', v: k.v, line: k.line };
    }
    throw new TranspileError(`Unexpected “${k.v ?? k.t}”`, k.line);
  }
  function postfix() {
    let e = primary();
    for (;;) {
      if (eat('op', '.')) { const n = expect('id', undefined, 'a name'); e = e.type === 'id' ? { type: 'id', v: `${e.v}.${n.v}`, line: n.line } : { type: 'member', obj: e, name: n.v }; continue; }
      if (is('op', '(')) {
        next();
        const args = [], kwargs = [];
        while (!is('op', ')')) {
          if (peek().t === 'id' && peek(1).t === 'op' && peek(1).v === '=' && lang === 'python') { const n = next().v; next(); kwargs.push([n, expr()]); }
          else { const a = expr(); if (a.type === 'obj' && lang !== 'python') kwargs.push(...a.props); else args.push(a); }
          if (!eat('op', ',')) break;
        }
        expect('op', ')');
        e = { type: 'call', callee: e, args, kwargs, line: peek().line };
        continue;
      }
      if (is('op', '[')) { next(); const idx = expr(); expect('op', ']'); e = { type: 'index', obj: e, idx }; continue; }
      if (is('op', '++') || is('op', '--')) throw new TranspileError('++/-- aren’t supported — write x = x + 1', peek().line);
      return e;
    }
  }
  function unary() {
    if (eat('op', '-')) return { type: 'unary', op: '-', e: unary() };
    if (eat('op', '+')) return unary();
    if (eat('op', '!') || eat('id', 'not')) return { type: 'unary', op: 'not', e: unary() };
    return postfix();
  }
  function binary(min) {
    let left = unary();
    for (;;) {
      const k = peek();
      const op = k.t === 'op' || (k.t === 'id' && (k.v === 'and' || k.v === 'or')) ? k.v : null;
      const prec = op != null ? BIN[op] : undefined;
      if (prec === undefined || prec < min) return left;
      next();
      const right = binary(op === '**' ? prec : prec + 1);
      left = { type: 'bin', op, l: left, r: right };
    }
  }
  function expr() {
    if (lang === 'js' && peek().t === 'op' && peek().v === '(') {
      // arrow function: (a, b) => expr
      let j = p + 1, ok = true;
      while (tokens[j] && !(tokens[j].t === 'op' && tokens[j].v === ')')) { if (!(tokens[j].t === 'id' || (tokens[j].t === 'op' && tokens[j].v === ','))) { ok = false; break; } j++; }
      if (ok && tokens[j + 1]?.t === 'op' && tokens[j + 1].v === '=>') {
        next(); const params = [];
        while (!is('op', ')')) { params.push(expect('id').v); eat('op', ','); }
        next(); next();
        if (is('op', '{')) return { type: 'arrow', params, body: block() };
        return { type: 'arrow', params, body: expr() };
      }
    }
    let e = binary(1);
    if (eat('op', '?')) { const a = expr(); expect('op', ':'); const b = expr(); return { type: 'tern', c: e, a, b }; }
    if (lang === 'python' && isWord('if')) { next(); const c = binary(1); expect('id', 'else'); const b = expr(); return { type: 'tern', c, a: e, b }; }
    return e;
  }

  function block() {
    const body = [];
    if (lang === 'python') {
      expect('op', ':');
      if (eat('nl')) { expect('indent', undefined, 'an indented block'); while (!is('dedent') && !is('eof')) { const s = stmt(); if (s) body.push(s); skipNl(); } eat('dedent'); }
      else { const s = stmt(); if (s) body.push(s); }
      return body;
    }
    if (eat('op', '{')) { skipNl(); while (!is('op', '}')) { if (is('eof')) throw new TranspileError('Missing }', peek().line); const s = stmt(); if (s) body.push(s); skipNl(); } next(); return body; }
    const s = stmt(); if (s) body.push(s);
    return body;
  }

  function stmt() {
    skipNl();
    const k = peek();
    if (k.t === 'eof') return null;
    if (k.t === 'pragma') { next(); return { type: 'pragma', v: k.v, line: k.line }; }
    if (k.t === 'id') {
      if (['for', 'while', 'do'].includes(k.v)) throw new TranspileError('Loops aren’t translated automatically — use “Translate with AI”', k.line);
      if (k.v === 'class' || (lang === 'java' && ['public', 'private', 'static'].includes(k.v))) throw new TranspileError('Write the indicator as plain statements (no class/method wrapper)', k.line);
      if (k.v === 'import' || k.v === 'from' || k.v === 'export') { while (!is('nl') && !is('eof')) next(); return null; } // imports are ignored
      if (k.v === 'pass') { next(); return null; }
      if (k.v === 'if') return ifStmt();
      if (k.v === 'return') { next(); const e = is('nl') || is('op', ';') || is('op', '}') ? null : expr(); return { type: 'return', e, line: k.line }; }
      if (k.v === 'def' || k.v === 'function') {
        next(); const name = expect('id', undefined, 'a function name').v; expect('op', '(');
        const params = []; while (!is('op', ')')) { const n = expect('id').v; if (lang !== 'python' && is('id')) { params.push(next().v); } else params.push(n); eat('op', ','); }
        next();
        return { type: 'func', name, params, body: block(), line: k.line };
      }
      // declarations: const/let/var/int/double/... name = expr   (Java: type name = expr)
      let decl = false;
      while (peek().t === 'id' && TYPE_WORDS.has(peek().v) && peek(1).t === 'id') { next(); decl = true; }
      if (peek().t === 'id' && peek(1).t === 'op' && ['=', '+=', '-=', '*=', '/=', '%='].includes(peek(1).v)) {
        const name = next().v; const op = next().v;
        if (lang === 'js' && op === '=' && is('op', '(')) { const e = expr(); if (e.type === 'arrow') return { type: 'func', name, params: e.params, body: Array.isArray(e.body) ? e.body : [{ type: 'return', e: e.body }], line: k.line }; return { type: 'assign', name, op, e, decl, line: k.line }; }
        return { type: 'assign', name, op, e: expr(), decl, line: k.line };
      }
    }
    const e = expr();
    return { type: 'expr', e, line: k.line };
  }
  function ifStmt() {
    const k = next();
    const test = lang === 'python' ? expr() : (expect('op', '('), (() => { const e = expr(); expect('op', ')'); return e; })());
    const cons = block();
    skipNlSoft();
    let alt = null;
    if (lang === 'python' && isWord('elif')) { tokens[p] = { ...tokens[p], v: 'if' }; alt = [ifStmt()]; }
    else if (isWord('else')) { next(); alt = isWord('if') ? [ifStmt()] : block(); }
    return { type: 'if', test, cons, alt, line: k.line };
  }
  function skipNlSoft() { let j = p; while (tokens[j] && (tokens[j].t === 'nl' || (tokens[j].t === 'op' && tokens[j].v === ';'))) j++; if (tokens[j] && tokens[j].t === 'id' && (tokens[j].v === 'else' || tokens[j].v === 'elif')) p = j; }

  const prog = [];
  while (!is('eof')) { const s = stmt(); if (s) prog.push(s); skipNl(); }
  return prog;
}

// ---------------- Pine code generation ----------------
const MATH = { abs: 'math.abs', max: 'math.max', min: 'math.min', round: 'math.round', sqrt: 'math.sqrt', log: 'math.log', exp: 'math.exp', pow: 'math.pow', floor: 'math.floor', ceil: 'math.ceil', sign: 'math.sign', avg: 'math.avg' };
const ALIASES = { isNaN: 'na', isnan: 'na', 'Math.PI': 'math.pi', 'math.PI': 'math.pi', 'Math.E': 'math.e' };
const HEX = /^#[0-9a-fA-F]{6}([0-9a-fA-F]{2})?$/;
const SHAPES = new Set(['triangleup', 'triangledown', 'circle', 'cross', 'xcross', 'diamond', 'square', 'arrowup', 'arrowdown', 'labelup', 'labeldown', 'flag']);
const LOCS = new Set(['abovebar', 'belowbar', 'top', 'bottom', 'absolute']);

function gen(prog, { name = 'My indicator' } = {}) {
  const declared = new Set();
  const funcs = new Set();
  let header = null;
  const out = [];
  const q = (s) => `"${String(s).replace(/\\/g, '\\\\').replace(/"/g, '\\"')}"`;

  function E(n, ctx = {}) {
    switch (n.type) {
      case 'num': return n.v;
      case 'str': return HEX.test(n.v) && ctx.allowColor !== false ? n.v : q(n.v);
      case 'bool': return String(n.v);
      case 'na': return 'na';
      case 'paren': return `(${E(n.e)})`;
      case 'id': {
        if (ALIASES[n.v]) return ALIASES[n.v];
        if (/^Math\./.test(n.v)) return `math.${n.v.slice(5)}`;
        if (/^shape\.|^location\.|^color\.|^ta\.|^math\.|^str\.|^input\.|^plot\.|^hline\./.test(n.v)) return n.v;
        return n.v;
      }
      case 'member': throw new TranspileError(`Member access on an expression (.${n.name}) isn’t supported`);
      case 'index': return `${E(n.obj)}[${E(n.idx)}]`;
      case 'unary': return n.op === 'not' ? `not ${E(n.e)}` : `-${E(n.e)}`;
      case 'tern': return `${E(n.c)} ? ${E(n.a)} : ${E(n.b)}`;
      case 'bin': {
        const map = { '&&': 'and', '||': 'or', '===': '==', '!==': '!=' };
        if (n.op === '**') return `math.pow(${E(n.l)}, ${E(n.r)})`;
        if (n.op === '//') return `math.floor(${E(n.l)} / ${E(n.r)})`;
        return `${E(n.l)} ${map[n.op] || n.op} ${E(n.r)}`;
      }
      case 'obj': throw new TranspileError('Objects are only allowed as the last argument of a call');
      case 'arrow': throw new TranspileError('Functions must be declared on their own line');
      case 'call': return call(n);
      default: throw new TranspileError(`Unsupported expression (${n.type})`);
    }
  }
  function call(n) {
    if (n.callee.type !== 'id') throw new TranspileError('Only named functions can be called', n.line);
    let fn = n.callee.v;
    if (MATH[fn] && !funcs.has(fn)) fn = MATH[fn];
    if (/^Math\./.test(fn)) fn = `math.${fn.slice(5)}`;
    if (ALIASES[fn]) fn = ALIASES[fn];
    if (['print', 'console.log', 'System.out.println', 'len', 'range'].includes(fn)) throw new TranspileError(`${fn}() has no Pine equivalent in the translated subset`, n.line);
    const args = n.args.map((a, i) => arg(fn, i, a));
    const kw = n.kwargs.map(([k, v]) => `${k}=${kwarg(fn, k, v)}`);
    if (fn === 'input') {
      const first = n.args[0];
      const kind = !first ? 'float' : first.type === 'num' ? (/[.eE]/.test(first.v) ? 'float' : 'int') : first.type === 'bool' ? 'bool' : first.type === 'str' ? (HEX.test(first.v) ? 'color' : 'string') : first.type === 'id' && ['open', 'high', 'low', 'close', 'volume', 'hl2', 'hlc3', 'ohlc4', 'hlcc4'].includes(first.v) ? 'source' : 'float';
      fn = `input.${kind}`;
    }
    return `${fn}(${[...args, ...kw].join(', ')})`;
  }
  function arg(fn, i, a) {
    if (fn === 'plotshape' && a.type === 'str') { if (i === 2 && SHAPES.has(a.v)) return `shape.${a.v}`; if (i === 3 && LOCS.has(a.v)) return `location.${a.v}`; }
    if ((fn === 'plot' || fn === 'plotshape' || fn === 'bgcolor' || fn === 'hline' || fn === 'barcolor' || fn === 'fill') && a.type === 'str' && HEX.test(a.v)) return a.v;
    return E(a, { allowColor: !['alertcondition', 'indicator', 'input', 'str.tostring'].includes(fn) || i > 1 });
  }
  function kwarg(fn, k, v) {
    if (k === 'style' && v.type === 'str') return SHAPES.has(v.v) ? `shape.${v.v}` : `plot.style_${v.v}`;
    if (k === 'location' && v.type === 'str' && LOCS.has(v.v)) return `location.${v.v}`;
    if (['title', 'text', 'message', 'shorttitle', 'tooltip', 'group'].includes(k)) return E(v, { allowColor: false });
    return E(v);
  }

  function S(st, ind, inFunc) {
    const pad = '    '.repeat(ind);
    switch (st.type) {
      case 'pragma': {
        const m = st.v.match(/^\s*["']([^"']+)["']\s*(?:,\s*(.*))?$/);
        header = `indicator(${q(m ? m[1] : name)}${m && m[2] ? `, ${m[2].replace(/\bTrue\b/g, 'true').replace(/\bFalse\b/g, 'false').replace(/:\s*/g, '=')}` : ', overlay=true'})`;
        return;
      }
      case 'expr': {
        if (st.e.type === 'call' && st.e.callee.type === 'id' && st.e.callee.v === 'indicator') {
          if (ind) throw new TranspileError('indicator() must be at the top level', st.line);
          header = call(st.e);
          if (!/overlay\s*=/.test(header) && st.e.args.length >= 2) header = header.replace(/,\s*(true|false)\)$/, ', overlay=$1)');
          return;
        }
        out.push(`${pad}${E(st.e)}`);
        return;
      }
      case 'assign': {
        const v = E(st.e);
        if (st.op !== '=') { out.push(`${pad}${st.name} ${st.op} ${v}`); return; }
        if (declared.has(st.name) && !(inFunc && !inFunc.has(st.name) && !st.decl)) { out.push(`${pad}${st.name} := ${v}`); return; }
        (inFunc || declared).add(st.name);
        out.push(`${pad}${st.name} = ${v}`);
        return;
      }
      case 'if': {
        // if / else if / else chains, as Pine writes them
        let cur = st, kw = 'if';
        for (;;) {
          if (!cur.cons.length) throw new TranspileError('Empty if block', cur.line);
          out.push(`${pad}${kw} ${E(cur.test)}`);
          for (const s of cur.cons) S(s, ind + 1, inFunc);
          if (!cur.alt) break;
          if (cur.alt.length === 1 && cur.alt[0].type === 'if') { cur = cur.alt[0]; kw = 'else if'; continue; }
          out.push(`${pad}else`);
          for (const s of cur.alt) S(s, ind + 1, inFunc);
          break;
        }
        return;
      }
      case 'func': {
        if (ind) throw new TranspileError('Functions must be at the top level', st.line);
        funcs.add(st.name);
        const body = st.body;
        if (body.length === 1 && body[0].type === 'return' && body[0].e) { out.push(`${st.name}(${st.params.join(', ')}) => ${E(body[0].e)}`); return; }
        out.push(`${st.name}(${st.params.join(', ')}) =>`);
        const local = new Set(st.params);
        body.forEach((s, i) => {
          if (s.type === 'return') {
            if (i !== body.length - 1 || !s.e) throw new TranspileError('return must be the last line of a function', s.line);
            out.push(`    ${E(s.e)}`);
          } else S(s, 1, local);
        });
        return;
      }
      case 'return': throw new TranspileError('return is only allowed in a function', st.line);
      default: throw new TranspileError(`Unsupported statement (${st.type})`, st.line);
    }
  }
  for (const st of prog) S(st, 0, null);
  return ['//@version=6', `// Translated by TVSuite — review before trading on it`, header || `indicator(${q(name)}, overlay=true)`, '', ...out].join('\n') + '\n';
}

export function detectLanguage(src) {
  const s = String(src);
  if (/^\s*(def |elif |import \w+\s*$)|:\s*\n\s{2,}\S|\bTrue\b|\bFalse\b|\bNone\b/m.test(s) && !/[{};]\s*$/m.test(s)) return 'python';
  if (/\b(int|double|boolean|float|String)\s+[A-Za-z_]\w*\s*=/.test(s)) return 'java';
  return 'js';
}

export function transpile(src, { lang = 'auto', name } = {}) {
  const L = lang === 'auto' ? detectLanguage(src) : lang === 'javascript' ? 'js' : lang;
  if (!['python', 'js', 'java'].includes(L)) throw new TranspileError(`Unknown language ${lang}`);
  const prog = parse(lex(src, L), L);
  if (!prog.length) throw new TranspileError('Nothing to translate');
  return { pine: gen(prog, { name }), lang: L };
}

export const EXAMPLES = {
  python: `indicator("EMA cross", overlay=True)
fast_len = input(9, "Fast length")
slow_len = input(21, "Slow length")
fast = ta.ema(close, fast_len)
slow = ta.ema(close, slow_len)
plot(fast, "Fast", color="#2962ff")
plot(slow, "Slow", color="#f23645")
cross_up = ta.crossover(fast, slow)
cross_down = ta.crossunder(fast, slow)
plotshape(cross_up, "Buy", "triangleup", "belowbar", "#22c55e")
plotshape(cross_down, "Sell", "triangledown", "abovebar", "#f23645")
bgcolor("#22c55e22" if fast > slow else None)
alertcondition(cross_up, "Cross up", "Fast EMA crossed above slow")
`,
  js: `// @indicator("RSI zones", overlay: false)
const len = input(14, "RSI length");
const r = ta.rsi(close, len);
let zone = 0;
if (r > 70) {
  zone = 1;
} else if (r < 30) {
  zone = -1;
}
plot(r, "RSI", "#9a6bff");
hline(70, "Overbought", "#f23645");
hline(30, "Oversold", "#22c55e");
bgcolor(zone === 1 ? "#f2364522" : zone === -1 ? "#22c55e22" : null);
alertcondition(ta.crossunder(r, 30), "Oversold", "RSI dropped below 30");
`,
  java: `indicator("Volatility bands", true);
int len = input(20, "Length");
double mult = input(2.0, "Multiplier");
double basis = ta.sma(close, len);
double width = mult * ta.atr(len);
double upper = basis + width;
double lower = basis - width;
plot(basis, "Basis", "#f7a600");
plot(upper, "Upper", "#5b8cff");
plot(lower, "Lower", "#5b8cff");
boolean breakout = close > upper && close[1] <= upper[1];
plotshape(breakout, "Breakout", "arrowup", "belowbar", "#22c55e");
`,
};
