export class MissionControlClient {
  constructor({ baseUrl = process.env.MISSION_CONTROL_BASE_URL ?? 'http://127.0.0.1:3005', mode = process.env.MISSION_CONTROL_MODE ?? 'isolated', dryRun = process.env.DRY_RUN !== 'false', fetchImpl = fetch } = {}) {
    this.baseUrl = baseUrl.replace(/\/$/, ''); this.mode = mode; this.dryRun = dryRun; this.fetch = fetchImpl;
    if (mode === 'production' && !dryRun) throw new Error('production mode requires an explicit non-dry-run client construction');
  }
  async request(path, { method = 'GET', body } = {}) {
    const response = await this.fetch(`${this.baseUrl}${path}`, { method, headers: { 'content-type': 'application/json' }, body: body === undefined ? undefined : JSON.stringify(body) });
    const text = await response.text(); let data = text; try { data = text ? JSON.parse(text) : null; } catch {}
    if (!response.ok) throw new Error(`Mission Control ${method} ${path} failed: ${response.status} ${typeof data === 'string' ? data : JSON.stringify(data)}`);
    return data;
  }
  getTask(id) { return this.request(`/api/tasks/${encodeURIComponent(id)}`); }
  listTasks() { return this.request('/api/tasks'); }
  async createTask(task) { if (this.dryRun) return { dry_run: true, task }; return this.request('/api/tasks', { method: 'POST', body: task }); }
  async postEvent(event) { if (this.dryRun) return { dry_run: true, event }; return this.request('/api/events', { method: 'POST', body: event }); }
}

export class MemoryControlPlane {
  constructor({ trace } = {}) { this.tasks = new Map(); this.events = []; this.trace = trace; }
  async createTask(task) { this.tasks.set(task.id, { ...task }); this.trace?.emit('control.task-created', { taskId: task.id }); return this.tasks.get(task.id); }
  async postEvent(event) { this.events.push({ ...event }); this.trace?.emit('control.event-posted', { action: event.action }); return event; }
  async getTask(id) { return this.tasks.get(id) ?? null; }
}
