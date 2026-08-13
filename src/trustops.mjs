import crypto from 'node:crypto';

export const TRUSTOPS_SCHEMA = 'agent-infra/trustops/v1';
export const TRUSTOPS_ROLES = Object.freeze({
  manager: Object.freeze({ identity: 'Danny', title: 'Manager', may: ['accept', 'route', 'approve-request'], self_attestation: false }),
  team_leader: Object.freeze({ identity: 'Morgan', title: 'Team Leader', may: ['decompose', 'sequence', 'aggregate'], self_attestation: false }),
  executor: Object.freeze({ identity: 'Rex', title: 'Executor', may: ['execute'], self_attestation: false }),
  verifier: Object.freeze({ identity: 'Dr. Sage', title: 'Verifier', may: ['verify', 'reject'], self_attestation: false }),
  consolidator: Object.freeze({ identity: 'Juno', title: 'Consolidator', may: ['consolidate'], self_attestation: false })
});

export const INTERVENTIONS = Object.freeze(['approve', 'reject', 'pause', 'resume', 'retry', 'reassign', 'cancel']);
export const LIFECYCLE_STATES = Object.freeze(['new', 'open', 'blocked', 'paused', 'rejected', 'closed']);

function text(value, name) {
  if (typeof value !== 'string' || value.trim() === '') throw new TypeError(`${name} must be a non-empty string`);
  return value.trim();
}
function hash(value) { return `sha256:${crypto.createHash('sha256').update(JSON.stringify(value)).digest('hex')}`; }
function clone(value) { return JSON.parse(JSON.stringify(value)); }

export function createTrustOpsGraph({ teamId, roomId, projectId, taskId, runId, subtasks = [], risk = 'low', assignment = 'Morgan', lifecycle = 'new' } = {}) {
  for (const [value, name] of [[teamId, 'teamId'], [roomId, 'roomId'], [projectId, 'projectId'], [taskId, 'taskId'], [runId, 'runId'], [assignment, 'assignment']]) text(value, name);
  if (!['low', 'medium', 'high', 'critical'].includes(risk)) throw new TypeError('risk must be low, medium, high, or critical');
  if (!LIFECYCLE_STATES.includes(lifecycle)) throw new TypeError(`invalid lifecycle state: ${lifecycle}`);
  if (!Array.isArray(subtasks)) throw new TypeError('subtasks must be an array');
  const ids = new Set();
  const normalized = subtasks.map((item) => {
    const id = text(item?.subtask_id, 'subtask_id');
    if (ids.has(id)) throw new TypeError(`duplicate subtask_id: ${id}`);
    ids.add(id);
    const owner = text(item.assignment, `assignment for ${id}`);
    if (!Object.values(TRUSTOPS_ROLES).some((role) => role.identity === owner)) throw new TypeError(`unknown assignment: ${owner}`);
    const dependsOn = item.depends_on ?? [];
    if (!Array.isArray(dependsOn) || dependsOn.some((dep) => typeof dep !== 'string')) throw new TypeError(`invalid dependencies for ${id}`);
    return { subtask_id: id, objective: text(item.objective, `objective for ${id}`), assignment: owner, depends_on: [...dependsOn], acceptance: Array.isArray(item.acceptance) ? [...item.acceptance] : [] };
  });
  for (const item of normalized) for (const dep of item.depends_on) if (!ids.has(dep)) throw new TypeError(`unknown dependency ${dep} for ${item.subtask_id}`);
  const graph = { schema: TRUSTOPS_SCHEMA, team_id: teamId, room_id: roomId, project_id: projectId, task_id: taskId, run_id: runId, risk, assignment, lifecycle, subtasks: normalized };
  return Object.freeze({ ...graph, graph_hash: hash(graph) });
}

export class InterventionLedger {
  #events = [];
  constructor({ runId, clock = () => new Date().toISOString() } = {}) { this.runId = text(runId, 'runId'); this.clock = clock; }
  append({ command, actor, authorization, previousState, newState, reason, correlationId, taskId, targetRole } = {}) {
    if (!INTERVENTIONS.includes(command)) throw new TypeError(`unsupported intervention: ${command}`);
    for (const [value, name] of [[actor, 'actor'], [authorization, 'authorization'], [previousState, 'previousState'], [newState, 'newState'], [reason, 'reason'], [correlationId, 'correlationId'], [taskId, 'taskId']]) text(value, name);
    if (!LIFECYCLE_STATES.includes(previousState) || !LIFECYCLE_STATES.includes(newState)) throw new TypeError('invalid intervention lifecycle state');
    const event = { schema: TRUSTOPS_SCHEMA, event_id: `intervention-${this.#events.length + 1}`, run_id: this.runId, task_id: taskId, correlation_id: correlationId, command, actor, target_role: targetRole ?? null, previous_state: previousState, new_state: newState, reason, authorization, created_at: this.clock(), previous_hash: this.#events.at(-1)?.event_hash ?? null };
    event.event_hash = hash(event); this.#events.push(Object.freeze(event)); return clone(event);
  }
  list() { return this.#events.map(clone); }
}

export class DesiredStatusReconciler {
  reconcile({ desired = [], observed = [] } = {}) {
    if (!Array.isArray(desired) || !Array.isArray(observed)) throw new TypeError('desired and observed must be arrays');
    const byId = new Map(observed.map((item) => [item.id, item]));
    const actions = []; const drift = []; const seenCompleted = new Set();
    for (const item of desired) {
      if (!item?.id) throw new TypeError('desired item id is required');
      const current = byId.get(item.id);
      if (!current) { actions.push({ action: 'adopt-or-create', id: item.id }); continue; }
      if (item.status === 'completed' && seenCompleted.has(item.id)) { drift.push({ id: item.id, reason: 'duplicate-completed-work' }); continue; }
      if (item.status === 'completed') seenCompleted.add(item.id);
      if (item.claim_id && current.claim_id && item.claim_id !== current.claim_id) drift.push({ id: item.id, reason: 'stale-claim', desired_claim_id: item.claim_id, observed_claim_id: current.claim_id });
      if (item.status !== current.status) drift.push({ id: item.id, reason: 'status-drift', desired: item.status, observed: current.status });
    }
    for (const item of observed) if (!desired.some((wanted) => wanted.id === item.id)) actions.push({ action: 'report-unmanaged', id: item.id });
    return { schema: TRUSTOPS_SCHEMA, actions, drift, safe_to_apply: false };
  }
}
