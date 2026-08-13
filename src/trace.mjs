export class Trace {
  #events = [];
  constructor({ clock = () => new Date().toISOString(), runId = 'run-local', correlationId = 'corr-local' } = {}) {
    if (!runId || !correlationId) throw new TypeError('Trace requires runId and correlationId');
    this.clock = clock; this.runId = runId; this.correlationId = correlationId;
  }
  emit(event, fields = {}) {
    const record = { timestamp: this.clock(), event, run_id: fields.run_id ?? this.runId, correlation_id: fields.correlation_id ?? this.correlationId, ...fields };
    if (!record.run_id || !record.correlation_id) throw new TypeError('Trace event requires run_id and correlation_id');
    this.#events.push(Object.freeze(record));
    return record;
  }
  all() { return this.#events.map((item) => ({ ...item })); }
  byEvent(event) { return this.#events.filter((item) => item.event === event).map((item) => ({ ...item })); }
  toJSONL() { return this.#events.map((item) => JSON.stringify(item)).join('\n') + (this.#events.length ? '\n' : ''); }
}
