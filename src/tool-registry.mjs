export class ToolRegistry {
  #tools = new Map();
  register({ name, version = '1.0.0', execute, sideEffect = false, requiresApproval = sideEffect }) {
    if (!name || typeof execute !== 'function') throw new TypeError('tool name and execute function are required');
    if (this.#tools.has(name)) throw new Error(`tool already registered: ${name}`);
    this.#tools.set(name, Object.freeze({ name, version, execute, sideEffect, requiresApproval }));
  }
  describe() { return [...this.#tools.values()].map(({ execute, ...tool }) => ({ ...tool })); }
  async call(name, input, { dryRun = true, approved = false } = {}) {
    const tool = this.#tools.get(name); if (!tool) throw new Error(`unknown tool: ${name}`);
    if (tool.requiresApproval && !dryRun && !approved) throw new Error(`approval required for tool: ${name}`);
    return tool.execute(input, { dryRun, approved });
  }
}
