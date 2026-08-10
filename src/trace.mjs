export class Trace {
  #events = [];
  constructor({ clock = () => new Date().toISOString() } = {}) { this.clock = clock; }
  emit(event, fields = {}) {
    const record = { timestamp: this.clock(), event, ...fields };
    this.#events.push(Object.freeze(record));
    return record;
  }
  all() { return this.#events.map((item) => ({ ...item })); }
  byEvent(event) { return this.#events.filter((item) => item.event === event).map((item) => ({ ...item })); }
  toJSONL() { return this.#events.map((item) => JSON.stringify(item)).join('\n') + (this.#events.length ? '\n' : ''); }
}
