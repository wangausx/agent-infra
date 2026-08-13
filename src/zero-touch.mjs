import { createAutonomyAdapter, createRunContext, ZERO_TOUCH_SCHEMA } from './zero-touch/scenario-adapter.mjs';
import { correlateAlerts } from './zero-touch/alert-correlator.mjs';
import { analyzeRca, planRemediation } from './zero-touch/rca-engine.mjs';
import { executeAction } from './zero-touch/action-executor.mjs';
import { createPostmortem, verifyAutonomy } from './zero-touch/verification.mjs';

export async function runZeroTouchScenario({ fixture, mode = 'dry-run', recorder = null, failure = null } = {}) {
  const context = createRunContext({ fixture, mode });
  const adapter = createAutonomyAdapter(fixture, { recorder });
  const alerts = await adapter.readAlerts();
  const deployment = await adapter.deployment();
  const correlation = correlateAlerts(alerts, { deployment });
  const state = await adapter.readState();
  const rca = analyzeRca({ alerts: correlation.primary, state, deployment });
  const policy = planRemediation({ cause: rca.selected_cause, safety: await adapter.safety() });
  if (!policy.allowed) throw new Error('zero-touch policy refused automatic action');
  const action = await executeAction({ context, adapter, plan: policy, failure });
  const verification = verifyAutonomy({ fixture, before: action.before_state, after: action.after_state, action, failure });
  const postmortem = createPostmortem({ context, incident: correlation.incident, rca, policy, action, verification });
  const evidence = [
    'incident', 'suppression-decisions', 'rca-hypotheses', 'policy-decision', 'before-state', 'after-state',
    'verifier-report', 'postmortem', 'trace', 'manifest', ...verification.evidence
  ];
  return {
    schema: ZERO_TOUCH_SCHEMA,
    run_id: context.run_id,
    correlation_id: context.correlation_id,
    seed: context.seed,
    mode: context.mode,
    manifest: context,
    stages: ['ALERTS', 'INCIDENT', 'RCA', 'POLICY', 'ACTION', 'VERIFY', 'REVIEW'],
    safety: { production_writes: false, physical_vehicle_used: false, production_control_connected: false, physical_vehicle_connected: false },
    incident: correlation.incident,
    suppression: correlation.suppression,
    rca,
    policy,
    action,
    verifier: verification,
    verdict: verification.verdict,
    postmortem,
    evidence
  };
}
