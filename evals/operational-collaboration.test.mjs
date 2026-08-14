import assert from 'node:assert/strict';
import test from 'node:test';
import {
  buildOperationalDecomposition,
  createHandoff,
  evaluatePolicy,
  finalizeReview,
  loadOperationalTeam,
  runIndependentVerification,
  runParallelRca,
} from '../src/operational-collaboration.mjs';

const autonomy = {
  scenario_id: 'autonomy-sensor-fusion',
  seed: 'collab-fixture-v1',
  incident: { id: 'incident-1', context_version: 1, signals: ['a', 'b'] },
  state: { synchronized: false, localization_confidence: 0.61, tracking: 'degraded' },
  safety: { simulation_only: true, production_writes: false },
};

test('operational identity manifest separates domain agents from infrastructure hosts', async () => {
  const team = await loadOperationalTeam();
  assert.ok(team.operational_agents.length >= 3);
  assert.ok(new Set(team.operational_agents.map((agent) => agent.identity)).size >= 3);
  assert.ok(team.infrastructure_hosts.length >= 3);
  assert.ok(team.operational_agents.every((agent) => agent.layer === 'operational'));
  assert.ok(team.operational_agents.every((agent) => agent.host_mapping));
});

test('decomposition materializes lifecycle stages and parallel RCA dependencies', () => {
  const graph = buildOperationalDecomposition({ runId: 'run-1', correlationId: 'corr-1', incident: autonomy.incident });
  assert.deepEqual(graph.stages.map((stage) => stage.stage), ['ALERT', 'INCIDENT', 'RCA', 'POLICY', 'ACTION', 'VERIFY', 'POSTMORTEM', 'REVIEW']);
  assert.equal(graph.subtasks.filter((task) => task.stage === 'RCA').length, 3);
  assert.ok(graph.subtasks.filter((task) => task.stage === 'RCA').every((task) => task.depends_on.includes('incident-1')));
  assert.ok(graph.subtasks.find((task) => task.stage === 'POLICY').depends_on.length === 3);
});

test('parallel RCA returns independent evidence and deterministic adjudication', () => {
  const result = runParallelRca(autonomy);
  assert.equal(result.hypotheses.length, 3);
  assert.equal(new Set(result.hypotheses.map((item) => item.agent_identity)).size, 3);
  assert.ok(result.hypotheses.every((item) => item.context_version === 1));
  assert.equal(result.adjudication.selected, 'RCA-TimeSync');
  assert.equal(result.adjudication.rejected.length, 2);
});

test('handoff preserves lineage and rejects stale context', () => {
  const handoff = createHandoff({ runId: 'run-1', correlationId: 'corr-1', taskId: 'task-1', sender: 'RCA-TimeSync', recipient: 'Policy-Safety', contextVersion: 2, inputArtifacts: ['rca-1'], permittedAction: 'recommend', rollbackCondition: 'never-authorize' });
  assert.equal(handoff.layer, 'operational');
  assert.equal(handoff.host.identity, 'Morgan');
  assert.throws(() => createHandoff({ ...handoff, contextVersion: 1 }), /stale context/);
});

test('policy blocks unsafe actions before execution and approves reversible simulation action', () => {
  assert.equal(evaluatePolicy({ recommendation: 'resynchronize', safety: autonomy.safety, reversible: true }).decision, 'approve');
  assert.equal(evaluatePolicy({ recommendation: 'charge-card', safety: autonomy.safety, reversible: false }).decision, 'reject');
});

test('independent verifier reads observed state, not executor self-report', () => {
  const rejected = runIndependentVerification({ observed: { synchronized: false }, executor: { ok: true, claimed: 'fixed' } });
  assert.equal(rejected.verdict, 'rejected');
  assert.equal(rejected.compensation.required, true);
  const passed = runIndependentVerification({ observed: { synchronized: true, localization_confidence: 0.95 }, executor: { ok: true } });
  assert.equal(passed.verdict, 'passed');
});

test('review and knowledge consolidation only accept verifier-approved evidence', () => {
  const report = finalizeReview({ verifier: { verdict: 'passed', evidence: ['state-hash'] }, postmortem: { lesson: 'resync before deploy' }, executor: { claimed: 'fixed' } });
  assert.equal(report.review, 'sealed');
  assert.deepEqual(report.knowledge.sources, ['state-hash']);
  assert.throws(() => finalizeReview({ verifier: { verdict: 'rejected', evidence: ['bad'] }, postmortem: { lesson: 'unsafe' } }), /verifier-approved/);
});
