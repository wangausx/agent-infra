export class MissionControlClient {
  constructor({ baseUrl = process.env.MISSION_CONTROL_BASE_URL ?? 'http://127.0.0.1:3005', mode = process.env.MISSION_CONTROL_MODE ?? 'isolated', dryRun = process.env.DRY_RUN !== 'false', allowProductionWrites = false, authToken = process.env.MISSION_CONTROL_AUTH_TOKEN, apiVersion = '0.1.0', minRequestIntervalMs = 0, fetchImpl = fetch, clock = () => Date.now() } = {}) {
    this.baseUrl = baseUrl.replace(/\/$/, ''); this.mode = mode; this.dryRun = dryRun; this.allowProductionWrites = allowProductionWrites; this.authToken = authToken; this.apiVersion = apiVersion; this.minRequestIntervalMs = minRequestIntervalMs; this.fetch = fetchImpl; this.clock = clock; this.lastRequestAt = 0;
  }
  #assertWriteAllowed() {
    if (this.dryRun) return;
    const isProductionTarget = this.mode === 'production' || /:\s*3005(?:\/|$)/.test(this.baseUrl);
    if (isProductionTarget && !this.allowProductionWrites) throw new Error('production Mission Control writes require allowProductionWrites=true');
  }
  async request(path, { method = 'GET', body, headers = {} } = {}) {
    const elapsed = this.clock() - this.lastRequestAt;
    if (this.minRequestIntervalMs > elapsed) await new Promise((resolve) => setTimeout(resolve, this.minRequestIntervalMs - elapsed));
    const requestHeaders = { 'content-type': 'application/json', accept: `application/json; mc-api-version=${this.apiVersion}`, 'x-mc-api-version': this.apiVersion, ...headers };
    if (this.authToken) requestHeaders.authorization = `Bearer ${this.authToken}`;
    this.lastRequestAt = this.clock();
    const response = await this.fetch(`${this.baseUrl}${path}`, { method, headers: requestHeaders, body: body === undefined ? undefined : JSON.stringify(body) });
    const responseVersion = response.headers?.get?.('x-mc-api-version');
    if (responseVersion && responseVersion !== this.apiVersion) throw new Error(`Mission Control API version mismatch: expected ${this.apiVersion}, received ${responseVersion}`);
    const text = await response.text(); let data = text; try { data = text ? JSON.parse(text) : null; } catch {}
    if (!response.ok) { const error = new Error(`Mission Control ${method} ${path} failed: ${response.status} ${typeof data === 'string' ? data : JSON.stringify(data)}`); error.status = response.status; error.body = data; throw error; }
    return data;
  }
  getTask(id) { return this.request(`/api/tasks/${encodeURIComponent(id)}`); }
  listTasks() { return this.request('/api/tasks'); }
  async createTask(task) { if (this.dryRun) return { dry_run: true, task }; this.#assertWriteAllowed(); return this.request('/api/tasks', { method: 'POST', body: task }); }
  async claimTask(id, { owner, leaseMs = 3600000 } = {}) { if (this.dryRun) return { dry_run: true, task_id: id, owner, lease_ms: leaseMs }; this.#assertWriteAllowed(); return this.request(`/api/tasks/${encodeURIComponent(id)}/claim`, { method: 'POST', body: { owner, lease_ms: leaseMs } }); }
  async postEvidence(id, evidence, { leaseToken } = {}) { if (this.dryRun) return { dry_run: true, task_id: id, evidence }; this.#assertWriteAllowed(); return this.request(`/api/tasks/${encodeURIComponent(id)}/evidence`, { method: 'POST', body: { evidence }, headers: leaseToken ? { 'x-mc-lease-token': leaseToken } : {} }); }
  async postEvent(event) { if (this.dryRun) return { dry_run: true, event }; this.#assertWriteAllowed(); return this.request('/api/events', { method: 'POST', body: event }); }
}

export class MemoryControlPlane {
  constructor({ trace } = {}) { this.tasks = new Map(); this.events = []; this.trace = trace; }
  async createTask(task) { this.tasks.set(task.id, { ...task }); this.trace?.emit('control.task-created', { taskId: task.id }); return this.tasks.get(task.id); }
  async postEvent(event) { this.events.push({ ...event }); this.trace?.emit('control.event-posted', { action: event.action }); return event; }
  async getTask(id) { return this.tasks.get(id) ?? null; }
}
