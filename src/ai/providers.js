// Model providers for generated skins. Runs in the extension background service worker,
// which holds the user's API key; the TradingView page never sees the key.
import Anthropic from '@anthropic-ai/sdk';
import { SKIN_SCHEMA, SYSTEM_PROMPT, userPrompt, extractJson, checkGenerated } from './prompt.js';

export const DEFAULT_AI = {
  provider: 'anthropic',            // 'anthropic' | 'openai-compatible'
  model: 'claude-opus-5-5',
  apiKey: '',
  baseUrl: 'https://api.openai.com/v1', // for openai-compatible (OpenAI, OpenRouter, Ollama at http://localhost:11434/v1, ...)
};

// Server-side refusal fallback is supported on these models; Haiku has none.
const FALLBACK_MODELS = /^claude-(opus-5|opus-5-5|fable-5|fable-5-1|sonnet-5-5)$/;

async function generateAnthropic(cfg, description) {
  if (!cfg.apiKey) throw new Error('Add your Anthropic API key in TVSuite options');
  const client = new Anthropic({ apiKey: cfg.apiKey, dangerouslyAllowBrowser: true, maxRetries: 2 });
  const useFallback = FALLBACK_MODELS.test(cfg.model);
  const response = await client.beta.messages.create({
    model: cfg.model || DEFAULT_AI.model,
    max_tokens: 16000,
    system: SYSTEM_PROMPT,
    messages: [{ role: 'user', content: userPrompt(description) }],
    output_config: { format: { type: 'json_schema', schema: SKIN_SCHEMA } },
    ...(useFallback ? { betas: ['server-side-fallback-2026-07-01'], fallbacks: 'default' } : {}),
  });
  if (response.stop_reason === 'refusal') {
    throw new Error(`The model declined this prompt${response.stop_details?.category ? ` (${response.stop_details.category})` : ''}. Try a different description.`);
  }
  if (response.stop_reason === 'max_tokens') throw new Error('The response was cut off; try a simpler description');
  const text = response.content.filter((b) => b.type === 'text').map((b) => b.text).join('');
  return checkGenerated(extractJson(text));
}

async function generateOpenAICompatible(cfg, description) {
  const base = (cfg.baseUrl || DEFAULT_AI.baseUrl).replace(/\/+$/, '');
  const res = await fetch(`${base}/chat/completions`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', ...(cfg.apiKey ? { authorization: `Bearer ${cfg.apiKey}` } : {}) },
    body: JSON.stringify({
      model: cfg.model,
      messages: [
        { role: 'system', content: `${SYSTEM_PROMPT}\nRespond with only a JSON object with keys name, description, params, code.` },
        { role: 'user', content: userPrompt(description) },
      ],
      response_format: { type: 'json_object' },
    }),
  });
  if (!res.ok) throw new Error(`Provider returned HTTP ${res.status}: ${(await res.text()).slice(0, 200)}`);
  const data = await res.json();
  const text = data?.choices?.[0]?.message?.content;
  if (!text) throw new Error('Provider returned no content');
  return checkGenerated(extractJson(text));
}

export async function generateSkin(cfg, description) {
  if (!description || !String(description).trim()) throw new Error('Describe the skin you want');
  return cfg.provider === 'openai-compatible' ? generateOpenAICompatible(cfg, description) : generateAnthropic(cfg, description);
}

// ---- Indicator translation (Python / JavaScript / Java / anything → Pine Script v6) ----
const PINE_SCHEMA = {
  type: 'object',
  properties: { pine: { type: 'string' }, notes: { type: 'string' } },
  required: ['pine', 'notes'],
  additionalProperties: false,
};
const PINE_SYSTEM = `You translate trading indicators into TradingView Pine Script version 6.
Output a complete script that starts with //@version=6 and an indicator(...) declaration, compiles in TradingView, and preserves the original logic.
Use Pine built-ins (ta.*, math.*, input.*) instead of re-implementing them. Remember Pine's series semantics: code runs once per bar, history is accessed with [n], reassignment uses :=, and 'var' persists across bars.
If something cannot be expressed in Pine (file or network access, arbitrary data structures), approximate it faithfully and explain in notes.
Put a short plain-English summary of the translation and anything the user must check in notes.`;

function checkPine(out) {
  const pine = String(out?.pine || '').trim();
  if (!/^\/\/\s*@version=\d/.test(pine) || !/\b(indicator|strategy|library)\s*\(/.test(pine)) throw new Error('The model did not return a Pine script');
  return { pine: `${pine}\n`, notes: String(out?.notes || '').slice(0, 2000) };
}

export async function translateToPine(cfg, code, lang = 'auto') {
  if (!code || !String(code).trim()) throw new Error('Paste the indicator code first');
  const user = `Translate this ${lang === 'auto' ? '' : `${lang} `}indicator to Pine Script v6:\n\n\`\`\`\n${String(code).slice(0, 60000)}\n\`\`\``;
  if (cfg.provider === 'openai-compatible') {
    const base = (cfg.baseUrl || DEFAULT_AI.baseUrl).replace(/\/+$/, '');
    const res = await fetch(`${base}/chat/completions`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', ...(cfg.apiKey ? { authorization: `Bearer ${cfg.apiKey}` } : {}) },
      body: JSON.stringify({ model: cfg.model, messages: [{ role: 'system', content: `${PINE_SYSTEM}\nRespond with only a JSON object with keys pine and notes.` }, { role: 'user', content: user }], response_format: { type: 'json_object' } }),
    });
    if (!res.ok) throw new Error(`Provider returned HTTP ${res.status}: ${(await res.text()).slice(0, 200)}`);
    const text = (await res.json())?.choices?.[0]?.message?.content;
    if (!text) throw new Error('Provider returned no content');
    return checkPine(extractJson(text));
  }
  if (!cfg.apiKey) throw new Error('Add your Anthropic API key in TVSuite options');
  const client = new Anthropic({ apiKey: cfg.apiKey, dangerouslyAllowBrowser: true, maxRetries: 2 });
  const useFallback = FALLBACK_MODELS.test(cfg.model);
  const stream = client.beta.messages.stream({
    model: cfg.model || DEFAULT_AI.model,
    max_tokens: 32000,
    thinking: { type: 'adaptive' },
    system: PINE_SYSTEM,
    messages: [{ role: 'user', content: user }],
    output_config: { format: { type: 'json_schema', schema: PINE_SCHEMA } },
    ...(useFallback ? { betas: ['server-side-fallback-2026-07-01'], fallbacks: 'default' } : {}),
  });
  const response = await stream.finalMessage();
  if (response.stop_reason === 'refusal') throw new Error('The model declined to translate this code');
  if (response.stop_reason === 'max_tokens') throw new Error('The translation was cut off; try a shorter script');
  return checkPine(extractJson(response.content.filter((b) => b.type === 'text').map((b) => b.text).join('')));
}
