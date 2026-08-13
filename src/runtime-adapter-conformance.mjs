const REQUIRED = Object.freeze(['identity', 'health', 'capabilities', 'receiveTask', 'progress', 'handoff', 'result', 'heartbeat', 'pause', 'resume', 'adoptRestart']);

export function assertRuntimeAdapter(adapter) {
  if (!adapter || typeof adapter !== 'object') throw new TypeError('runtime adapter required');
  const missing = REQUIRED.filter((name) => typeof adapter[name] !== 'function');
  if (missing.length) throw new TypeError(`runtime adapter missing: ${missing.join(',')}`);
  return adapter;
}

export async function runRuntimeConformance(adapter, { runId = 'conformance-run', taskId = 'conformance-task' } = {}) {
  assertRuntimeAdapter(adapter);
  const identity = await adapter.identity();
  if (!identity?.name || !identity?.role || !identity?.runtime) throw new Error('identity incomplete');
  if (!(await adapter.health()).healthy) throw new Error('adapter unhealthy');
  const capabilities = await adapter.capabilities();
  if (!Array.isArray(capabilities)) throw new Error('capabilities must be an array');
  await adapter.receiveTask({ run_id: runId, task_id: taskId, objective: 'conformance' });
  await adapter.progress({ run_id: runId, task_id: taskId, state: 'running' });
  await adapter.heartbeat({ run_id: runId, task_id: taskId });
  await adapter.pause({ run_id: runId, task_id: taskId, reason: 'conformance' });
  await adapter.resume({ run_id: runId, task_id: taskId });
  await adapter.handoff({ run_id: runId, task_id: taskId, kind: 'result', payload: { ok: true } });
  await adapter.result({ run_id: runId, task_id: taskId, verdict: 'PASS' });
  const adopted = await adapter.adoptRestart({ run_id: runId, task_id: taskId });
  if (!adopted || adopted.task_id !== taskId) throw new Error('restart adoption failed');
  return { status: 'PASS', identity, capabilities, run_id: runId, task_id: taskId };
}

export class InMemoryRuntimeAdapter {
  constructor(identity = { name: 'Rex', role: 'executor', runtime: 'hermes' }) { this._identity = identity; this.state = new Map(); this.events = []; }
  async identity() { return { ...this._identity }; }
  async health() { return { healthy: true }; }
  async capabilities() { return ['task-receipt', 'progress', 'handoff', 'heartbeat', 'pause-resume', 'restart-adoption']; }
  _record(event) { this.events.push(event); return event; }
  async receiveTask(task) { this.state.set(task.task_id, { ...task, state: 'received' }); return this._record({ event: 'task.received', ...task }); }
  async progress(value) { const task = this.state.get(value.task_id); if (!task) throw new Error('unknown task'); task.state = value.state; return this._record({ event: 'task.progress', ...value }); }
  async heartbeat(value) { if (!this.state.has(value.task_id)) throw new Error('unknown task'); return this._record({ event: 'task.heartbeat', ...value }); }
  async pause(value) { const task = this.state.get(value.task_id); if (!task) throw new Error('unknown task'); task.state = 'paused'; return this._record({ event: 'task.paused', ...value }); }
  async resume(value) { const task = this.state.get(value.task_id); if (!task) throw new Error('unknown task'); task.state = 'running'; return this._record({ event: 'task.resumed', ...value }); }
  async handoff(value) { if (!this.state.has(value.task_id)) throw new Error('unknown task'); return this._record({ event: 'task.handoff', ...value }); }
  async result(value) { const task = this.state.get(value.task_id); if (!task) throw new Error('unknown task'); task.state = 'completed'; task.verdict = value.verdict; return this._record({ event: 'task.result', ...value }); }
  async adoptRestart(value) { const task = this.state.get(value.task_id); if (!task) throw new Error('unknown task'); return { task_id: task.task_id, state: task.state, adopted: true }; }
}
