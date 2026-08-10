import { makeEnvelope } from './contracts.mjs';
import { executeSkill } from './skills.mjs';

export function planner({ taskId, objective, trace }) {
  const plan = { plan_id: `plan-${taskId}`, objective, steps: [
    { id: 'inspect', role: 'executor', action: 'inspect-system', skill: 'safe-remediation' },
    { id: 'prepare', role: 'executor', action: 'prepare-remediation', skill: 'safe-remediation', depends_on: ['inspect'] },
    { id: 'verify', role: 'verifier', action: 'verify-evidence', depends_on: ['prepare'] }
  ]};
  trace.emit('planner.plan-created', { taskId, stepCount: plan.steps.length });
  return { plan, handoff: makeEnvelope({ taskId, sender: 'planner', recipient: 'executor', kind: 'plan', payload: plan }) };
}

export function executor({ taskId, plan, dryRun, approved, rollback, trace, faults = {} }) {
  if (faults.timeout) throw new Error('executor timeout');
  const evidence = [];
  for (const step of plan.steps.filter((item) => item.role === 'executor')) {
    if (faults.rejection && step.id === 'prepare') throw new Error('executor rejected unsafe action');
    const output = executeSkill(step.skill, { taskId, action: step.action, dryRun, approved, rollback });
    evidence.push(output.evidence);
    trace.emit('executor.step-completed', { taskId, step: step.id, evidenceId: output.evidence.evidence_id });
  }
  return { evidence, handoff: makeEnvelope({ taskId, sender: 'executor', recipient: 'verifier', kind: 'evidence', payload: { evidence } }) };
}

export function verifier({ taskId, plan, evidence, trace, faults = {} }) {
  const expected = plan.steps.filter((item) => item.role === 'executor').length;
  const valid = !faults.verification && evidence.length === expected && evidence.every((item) => item.task_id === taskId && item.hash);
  const result = { verdict: valid ? 'PASS' : 'FAIL', checked_evidence: evidence.length, expected_evidence: expected, independent: true };
  trace.emit(valid ? 'verifier.pass' : 'verifier.fail', { taskId, ...result });
  return { result, handoff: makeEnvelope({ taskId, sender: 'verifier', recipient: 'control-plane', kind: 'verification', payload: result }) };
}
