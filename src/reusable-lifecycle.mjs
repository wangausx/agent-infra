import { evaluatePolicy, finalizeReview, runIndependentVerification, runParallelRca, buildOperationalDecomposition } from './operational-collaboration.mjs';

export const LIFECYCLE_CONTRACT = Object.freeze(['ALERT', 'INCIDENT', 'RCA', 'POLICY', 'ACTION', 'VERIFY', 'POSTMORTEM', 'REVIEW']);

export function createScenarioAdapter({ scenarioId, fixture }) {
  if (!scenarioId || !fixture || fixture.scenario_id !== scenarioId) throw new TypeError('scenarioId and matching fixture are required');
  if (fixture.safety?.production_writes !== false) throw new Error('scenario adapter requires production_writes=false');
  return Object.freeze({
    scenario_id: scenarioId,
    readIncident: () => structuredClone(fixture.incident),
    readState: () => structuredClone(fixture.state),
    safety: () => structuredClone(fixture.safety),
    recommend: () => fixture.recommendation,
    apply: ({ action }) => {
      if (action !== fixture.recommendation) throw new Error('action is not the fixture recommendation');
      return structuredClone(fixture.after_state);
    },
  });
}

export function runReusableLifecycle({ runId, correlationId, adapter }) {
  if (!runId || !correlationId || !adapter) throw new TypeError('runId, correlationId, and adapter are required');
  const incident = adapter.readIncident();
  const state = adapter.readState();
  const graph = buildOperationalDecomposition({ runId, correlationId, incident: { ...incident, context_version: incident.context_version ?? 1 } });
  const rca = runParallelRca({ incident: { ...incident, context_version: incident.context_version ?? 1 }, state });
  const policy = evaluatePolicy({ recommendation: rca.adjudication.selected === 'RCA-TimeSync' ? adapter.recommend() : 'hold', safety: adapter.safety(), reversible: true });
  const after = policy.decision === 'approve' ? adapter.apply({ action: adapter.recommend(), authorization: policy.authorization }) : state;
  const verification = runIndependentVerification({ observed: after, executor: { ok: policy.decision === 'approve' } });
  const postmortem = verification.verdict === 'passed' ? { lesson: `${adapter.scenario_id}: accepted recovery evidence` } : null;
  const review = postmortem ? finalizeReview({ verifier: { verdict: verification.verdict, evidence: [verification.observed_hash] }, postmortem }) : { review: 'rejected', knowledge: null };
  return { schema: 'agent-infra/reusable-lifecycle/v1', run_id: runId, correlation_id: correlationId, scenario_id: adapter.scenario_id, stages: LIFECYCLE_CONTRACT, graph, rca, policy, action: { executed: policy.decision === 'approve', before_state: state, after_state: after }, verification, postmortem, review, safety: adapter.safety() };
}
