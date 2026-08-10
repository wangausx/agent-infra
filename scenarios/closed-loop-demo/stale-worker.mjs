import crypto from 'node:crypto';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

const ALLOWED_ACTIONS = new Set(['restart-stale-worker']);
const ROLE_ORDER = ['planner', 'executor', 'verifier', 'consolidator'];

function stable(value) {
  if (Array.isArray(value)) return `[${value.map(stable).join(',')}]`;
  if (value && typeof value === 'object') return `{${Object.keys(value).sort().map((key) => `${JSON.stringify(key)}:${stable(value[key])}`).join(',')}}`;
  return JSON.stringify(value);
}

function hash(value) {
  return crypto.createHash('sha256').update(stable(value)).digest('hex');
}

function id(seed, label) {
  return `${label}-${hash({ seed, label }).slice(0, 16)}`;
}

async function readState(file) {
  return JSON.parse(await fs.readFile(file, 'utf8'));
}

async function writeState(file, state) {
  await fs.writeFile(file, `${JSON.stringify(state, null, 2)}\n`, { mode: 0o600 });
}

function envelope({ runId, sender, recipient, kind, payload, parentId = null }) {
  const body = { schema: 'agent-infra/handoff/v1', envelope_id: id(`${runId}:${sender}:${kind}`, 'env'), run_id: runId, sender, recipient, kind, parent_id: parentId, payload, payload_hash: `sha256:${hash(payload)}` };
  return { ...body, envelope_hash: `sha256:${hash(body)}` };
}

function evidence({ runId, taskId, action, before, after, dryRun, approved }) {
  const body = { schema: 'agent-infra/evidence/v1', evidence_id: id(`${runId}:${action}`, 'evidence'), run_id: runId, task_id: taskId, action, before, after, dry_run: dryRun, approved, observed: after.status === 'healthy' && after.worker === 'running' ? 'recovered' : 'stale' };
  return { ...body, hash: `sha256:${hash(body)}` };
}

export async function runStaleWorkerScenario({ seed = 'mvp-seed-001', caseName = 'success', dryRun = false, approved = true, controlPlane = null } = {}) {
  const validCases = new Set(['success', 'approval', 'executor-failure', 'verifier-rejection', 'rollback-failure']);
  if (!seed || typeof seed !== 'string') throw new TypeError('seed is required');
  if (!validCases.has(caseName)) throw new TypeError(`unsupported scenario case: ${caseName}`);
  const runId = id(seed, 'run');
  const taskId = id(seed, 'task');
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'agent-infra-stale-worker-'));
  const stateFile = path.join(root, 'service-state.json');
  const initial = { service: 'payments-worker', status: 'degraded', worker: 'stale', generation: 1 };
  await writeState(stateFile, initial);
  const trace = [];
  const handoffs = [];
  const artifacts = [];
  const emit = (event, data = {}) => trace.push({ event, run_id: runId, correlation_id: id(`${runId}:${trace.length}`, 'corr'), ...data });
  const plan = { plan_id: id(seed, 'plan'), objective: 'Recover one stale payments worker safely', bounded: true, allowed_actions: [...ALLOWED_ACTIONS], steps: [{ id: 'diagnose', role: 'executor', action: 'inspect-stale-worker' }, { id: 'remediate', role: 'executor', action: 'restart-stale-worker', reversible: true }, { id: 'verify', role: 'verifier', action: 'verify-worker-recovery' }] };
  emit('planner.plan-created', { role: 'planner', plan_id: plan.plan_id });
  const plannerHandoff = envelope({ runId, sender: 'planner', recipient: 'executor', kind: 'plan', payload: plan });
  handoffs.push(plannerHandoff);
  if (controlPlane) {
    await controlPlane.createTask({ id: taskId, title: 'Stale worker MVP', description: 'Isolated stale worker scenario', status: 'in-progress', assignee: 'agent-infra', priority: 'medium', tags: ['agent-infra', 'isolated'], deliverables: [{ label: 'scenario evidence', path: stateFile }] });
    await controlPlane.postEvent({ run_id: runId, agent: 'planner', action: 'plan-created', target: taskId });
  }

  const before = await readState(stateFile);
  let status = 'planned';
  let error = null;
  let rollback = { attempted: false, restored: false };
  let actionEvidence = null;
  try {
    status = 'executing';
    if (caseName === 'executor-failure') throw new Error('injected executor failure');
    if (!ALLOWED_ACTIONS.has(plan.steps[1].action)) throw new Error('action not allowlisted');
    if (!dryRun && !approved) {
      status = 'awaiting-approval';
      emit('policy.approval-required', { role: 'executor', action: plan.steps[1].action });
    } else {
      if (dryRun) emit('executor.dry-run', { action: plan.steps[1].action });
      else {
        const changed = { ...before, status: 'healthy', worker: 'running', generation: before.generation + 1 };
        await writeState(stateFile, changed);
        emit('executor.action-applied', { action: plan.steps[1].action });
      }
      const afterAction = await readState(stateFile);
      actionEvidence = evidence({ runId, taskId, action: plan.steps[1].action, before, after: afterAction, dryRun, approved });
      artifacts.push(actionEvidence);
      handoffs.push(envelope({ runId, sender: 'executor', recipient: 'verifier', kind: 'evidence', payload: actionEvidence, parentId: plannerHandoff.envelope_id }));
      if (caseName === 'verifier-rejection') throw new Error('injected verifier rejection');
      if (caseName === 'rollback-failure') throw new Error('injected failure requiring rollback');
      const verified = !dryRun && (await readState(stateFile)).worker === 'running';
      if (!verified) throw new Error('independent verifier could not prove recovery');
      emit('verifier.pass', { role: 'verifier', evidence_hash: actionEvidence.hash });
      handoffs.push(envelope({ runId, sender: 'verifier', recipient: 'consolidator', kind: 'verdict', payload: { verdict: 'PASS', evidence_hash: actionEvidence.hash }, parentId: handoffs.at(-1).envelope_id }));
      const lesson = { schema: 'agent-infra/lesson/v1', lesson_id: id(seed, 'lesson'), provenance: [actionEvidence.hash], statement: 'A stale worker can be recovered only after independent before/after verification.' };
      artifacts.push(lesson);
      handoffs.push(envelope({ runId, sender: 'consolidator', recipient: 'control-plane', kind: 'lesson', payload: lesson, parentId: handoffs.at(-1).envelope_id }));
      status = 'verified';
    }
  } catch (caught) {
    error = caught.message;
    status = 'rejected';
    rollback = { attempted: true, restored: false };
    try {
      if (caseName === 'rollback-failure') throw new Error('injected rollback failure');
      await writeState(stateFile, before);
      rollback.restored = stable(await readState(stateFile)) === stable(before);
      emit('rollback.completed', { restored: rollback.restored });
    } catch (rollbackError) {
      rollback.error = rollbackError.message;
      emit('rollback.failed', { error: rollbackError.message });
    }
    emit('verifier.fail', { role: 'verifier', error });
  }
  const finalState = await readState(stateFile);
  const report = { schema: 'agent-infra/scenario-report/v1', run_id: runId, task_id: taskId, seed, case: caseName, roles: ROLE_ORDER, status, error, initial_state: initial, final_state: finalState, plan, handoffs, artifacts, trace, rollback, isolated_root: root, production_writes: false };
  report.report_hash = `sha256:${hash({ ...report, isolated_root: '<temporary-fixture>' })}`;
  if (controlPlane) await controlPlane.postEvent({ run_id: runId, agent: status === 'verified' ? 'verifier' : 'runtime', action: status === 'verified' ? 'verified:verified' : 'rejected-and-rolled-back', target: taskId });
  await writeState(path.join(root, 'report.json'), report);
  return report;
}

export { ALLOWED_ACTIONS };
