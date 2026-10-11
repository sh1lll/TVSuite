// Minimal synchronous event bus shared by all modules.
export class Bus {
  constructor() { this.handlers = new Map(); }

  on(type, fn) {
    if (!this.handlers.has(type)) this.handlers.set(type, new Set());
    this.handlers.get(type).add(fn);
    return () => this.handlers.get(type)?.delete(fn);
  }

  emit(type, payload) {
    for (const fn of this.handlers.get(type) ?? []) {
      try { fn(payload); } catch (err) { console.error('[TVSuite] handler for', type, 'failed:', err); }
    }
  }
}
