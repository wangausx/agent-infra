import { planner, executor, verifier } from './agents.mjs';
import { consolidateKnowledge } from './knowledge.mjs';
import { RollbackStack } from './rollback.mjs';
import { Trace } from './trace.mjs';

export async function runClosedLoop({ taskId = `demo-${Date.now()}`, objective = 'Safely inspect and prepare a remediation', dryRun = true, approved = false, faults = {}, controlPlane = null, clock } = {}) {
  const trace = new Trace({ clock }); const rollback = new RollbackStack();
  const result = { task_id: taskId, status: 'planned', dry_run: dryRun, approval_required: !approved, faults, trace };
  try {
    const task = { id: taskId, title: objective, status: 'in-progress', evidence: [] };
    if (controlPlane) await controlPlane.createTask(task);
    const planned = planner({ taskId, objective, trace }); result.plan = planned.plan;
    result.status = 'executing';
    const executed = executor({ taskId, plan: planned.plan, dryRun, approved, rollback, trace, faults }); result.evidence = executed.evidence;
    const checked = verifier({ taskId, plan: planned.plan, evidence: result.evidence, trace, faults }); result.verification = checked;
    if (checked.result.verdict !== 'PASS') throw new Error('independent verification failed');
    result.knowledge = consolidateKnowledge({ taskId, plan: planned.plan, verification: checked, trace });
    result.status = approved || dryRun ? 'verified' : 'awaiting-approval';
    if (controlPlane) await controlPlane.postEvent({ agent: 'verifier', action: `verified:${result.status}`, target: taskId });
  } catch (error) {
    result.error = error.message; result.status = 'rejected'; result.rollback = await rollback.run(trace);
    trace.emit('runtime.rejected', { taskId, error: error.message });
    if (controlPlane) await controlPlane.postEvent({ agent: 'runtime', action: 'rejected-and-rolled-back', target: taskId });
  }
  result.trace = trace.all();
  return result;
}
