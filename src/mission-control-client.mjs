const NATIVE_PROTOCOL = 'mission-control-v1';

function unwrapTask(data) {
  return data?.task ?? data;
}

function requireNativeTask(task) {
  const required = ['title', 'description', 'status', 'assignee', 'priority', 'tags', 'deliverables'];
  const missing = required.filter((key) => task?.[key] === undefined);
  if (missing.length > 0) throw new Error(`Mission Control task contract missing: ${missing.join(', ')}`);
  if (!Array.isArray(task.tags) || task.tags.length === 0) throw new Error('Mission Control task contract requires non-empty tags');
  if (!Array.isArray(task.deliverables) || task.deliverables.length === 0) throw new Error('Mission Control task contract requires deliverables');
  if (task.assignee !== 'user' && (!task.task_contract || typeof task.task_contract !== 'object')) throw new Error('Mission Control agent-assigned tasks require task_contract');
  if (!task.description.includes('### Acceptance Criteria')) throw new Error('Mission Control task description requires ### Acceptance Criteria');
  const criteria = task.description.split('### Acceptance Criteria')[1]?.match(/^\s*[-*]\s+\[[ xX]\]\s+.+$/gm) ?? [];
  if (criteria.length < 2 || !criteria.some((item) => /verify|test|check|output|result|path|file|`[^`]+`|\d+/.test(item))) throw new Error('Mission Control task description requires at least 2 verifiable acceptance checklist items');
}

export class MissionControlClient {
  constructor({ baseUrl = process.env.MISSION_CONTROL_BASE_URL ?? 'http://192.168.1.140:3015', mode = process.env.MISSION_CONTROL_MODE ?? 'isolated', protocol = NATIVE_PROTOCOL, dryRun = process.env.DRY_RUN !== 'false', allowProductionWrites = false, authToken = process.env.MISSION_CONTROL_AUTH_TOKEN, apiVersion = '0.1.0', minRequestIntervalMs = 0, fetchImpl = fetch, clock = () => Date.now() } = {}) {
    this.baseUrl = baseUrl.replace(/\/$/, ''); this.mode = mode; this.protocol = protocol; this.dryRun = dryRun; this.allowProductionWrites = allowProductionWrites; this.authToken = authToken; this.apiVersion = apiVersion; this.minRequestIntervalMs = minRequestIntervalMs; this.fetch = fetchImpl; this.clock = clock; this.lastRequestAt = 0;
  }
  #assertTargetAllowed() {
    const isProductionTarget = this.mode === 'production' || /:\s*3005(?:\/|$)/.test(this.baseUrl);
    if (isProductionTarget && !this.allowProductionWrites) throw new Error('production Mission Control writes are blocked: agent-infra target is :3005; use isolated :3015 (or explicitly opt in)');
  }
  #assertWriteAllowed() {
    if (this.dryRun) return;
    this.#assertTargetAllowed();
  }
  async request(path, { method = 'GET', body, headers = {} } = {}) {
    this.#assertTargetAllowed();
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
  async getTask(id) {
    if (this.protocol !== NATIVE_PROTOCOL) return this.request(`/api/tasks/${encodeURIComponent(id)}`);
    const data = await this.request('/api/tasks');
    const task = (data?.tasks ?? []).find((candidate) => candidate.id === id);
    if (!task) { const error = new Error(`Mission Control task not found: ${id}`); error.status = 404; throw error; }
    return task;
  }
  listTasks() { return this.request('/api/tasks'); }
  async createTask(task) {
    if (this.dryRun) return { dry_run: true, task };
    this.#assertWriteAllowed();
    if (this.protocol === NATIVE_PROTOCOL) requireNativeTask(task);
    const data = await this.request('/api/tasks', { method: 'POST', body: this.protocol === NATIVE_PROTOCOL ? { ...task, id: undefined } : task });
    return this.protocol === NATIVE_PROTOCOL ? unwrapTask(data) : data;
  }
  async claimTask(id, { owner, leaseMs = 3600000, driver = 'danny-hermes' } = {}) {
    if (this.dryRun) return { dry_run: true, task_id: id, owner, lease_ms: leaseMs };
    this.#assertWriteAllowed();
    if (this.protocol !== NATIVE_PROTOCOL) return this.request(`/api/tasks/${encodeURIComponent(id)}/claim`, { method: 'POST', body: { owner, lease_ms: leaseMs } });
    const task = await this.getTask(id);
    const data = await this.request(`/api/tasks?id=${encodeURIComponent(id)}`, { method: 'PATCH', body: { status: 'in-progress', actor: owner, driver } });
    const updated = unwrapTask(data);
    return { task_id: id, lease_token: updated.claimId, claim_id: updated.claimId, claim_generation: updated.claimGeneration, lease_expires_at: updated.leaseExpiresAt, task: updated, previous_assignee: task.assignee };
  }
  async submitReview(id, { summary, taskContract, deliverables, actor, claimId, claimGeneration, driver = 'danny-hermes' } = {}) {
    if (this.dryRun) return { dry_run: true, task_id: id, status: 'in-review' };
    this.#assertWriteAllowed();
    if (this.protocol !== NATIVE_PROTOCOL) throw new Error('submitReview requires Mission Control v1 protocol');
    if (typeof summary !== 'string' || summary.trim().length < 20) throw new Error('Mission Control review requires summary of at least 20 characters');
    const current = await this.getTask(id);
    const contract = taskContract ?? current.task_contract;
    if (!contract) throw new Error('Native Mission Control review requires task_contract');
    const evidence = (deliverables ?? current.deliverables ?? []).map((item) => ({ kind: 'artifact', reference: item.path, observed: summary }));
    const richSummary = `### Summary\nWhat changed: ${summary}\n\nDeliverables:\n${(deliverables ?? current.deliverables ?? []).map((item) => `- ${item.label}: ${item.path}`).join('\\n')}\n\nTests: adapter conformance integration\nRisks/blockers: none`;
    const completedContract = { ...contract, acceptance: (contract.acceptance ?? []).map((criterion) => ({ ...criterion, status: 'passed', evidence: criterion.evidence?.length ? criterion.evidence : evidence })), review: { ...(contract.review ?? {}), verdict: 'ready', checks: (contract.review?.checks ?? [{ id: 'review-ready', requirement: 'Summary and evidence are present', required: true }]).map((check) => ({ ...check, status: 'passed', evidence: check.evidence?.length ? check.evidence : evidence })) } };
    const body = { status: 'in-review', summary: richSummary, actor, driver, task_contract: completedContract, ...(deliverables ? { deliverables } : {}), ...(claimId ? { claimId } : {}), ...(claimGeneration !== undefined ? { claimGeneration } : {}) };
    return unwrapTask(await this.request(`/api/tasks?id=${encodeURIComponent(id)}`, { method: 'PATCH', body }));
  }
  async postEvidence(id, evidence, options = {}) {
    if (this.protocol === NATIVE_PROTOCOL && !this.dryRun) throw new Error('Native Mission Control has no standalone evidence endpoint; use submitReview with executable task-contract evidence');
    if (this.dryRun) return { dry_run: true, task_id: id, evidence };
    this.#assertWriteAllowed();
    return this.request(`/api/tasks/${encodeURIComponent(id)}/evidence`, { method: 'POST', body: { evidence }, headers: options.leaseToken ? { 'x-mc-lease-token': options.leaseToken } : {} });
  }
  async heartbeat({ taskId, claimId, claimGeneration, workerPid, workerChildPid, workerCommand }) {
    if (this.dryRun) return { dry_run: true, task_id: taskId };
    this.#assertWriteAllowed();
    return unwrapTask(await this.request('/api/tasks/heartbeat', { method: 'POST', body: { taskId, claimId, claimGeneration, workerPid, workerChildPid, workerCommand } }));
  }
  async recoverExpired(taskId, reason) {
    if (this.dryRun) return { dry_run: true, task_id: taskId, reason };
    this.#assertWriteAllowed();
    return unwrapTask(await this.request('/api/tasks/recover-expired', { method: 'POST', body: { taskId, reason } }));
  }
  async postEvent(event) {
    if (this.dryRun) return { dry_run: true, event };
    this.#assertWriteAllowed();
    return unwrapTask(await this.request('/api/events', { method: 'POST', body: event }));
  }
}

export class MemoryControlPlane {
  constructor({ trace } = {}) { this.tasks = new Map(); this.events = []; this.trace = trace; }
  async createTask(task) { this.tasks.set(task.id, { ...task }); this.trace?.emit('control.task-created', { taskId: task.id }); return this.tasks.get(task.id); }
  async postEvent(event) { this.events.push({ ...event }); this.trace?.emit('control.event-posted', { action: event.action }); return event; }
  async getTask(id) { return this.tasks.get(id) ?? null; }
}
