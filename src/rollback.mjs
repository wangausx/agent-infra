export class RollbackStack {
  #actions = [];
  register(label, undo) {
    if (typeof undo !== 'function') throw new TypeError('rollback handler must be a function');
    this.#actions.push({ label, undo, completed: false });
  }
  async run(trace) {
    const results = [];
    for (const action of [...this.#actions].reverse()) {
      try { const result = await action.undo(); action.completed = true; results.push({ label: action.label, ok: true, result }); trace?.emit('rollback.completed', { label: action.label }); }
      catch (error) { results.push({ label: action.label, ok: false, error: error.message }); trace?.emit('rollback.failed', { label: action.label, error: error.message }); }
    }
    return results;
  }
  get size() { return this.#actions.length; }
}
