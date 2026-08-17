import assert from 'node:assert/strict';
import test from 'node:test';
import { buildShadowRecommendations, clusterAlerts, computeAssistiveMetrics, evaluateShadowBatch, rankNextBestDiagnostics, retrieveSkills } from '../src/assistive-shadow.mjs';
import { appendOutcomeLabel, applyLedgerToEpisodes, createOutcomeLabel } from '../src/outcome-label-ledger.mjs';
import { assessWindowReadiness } from '../src/window-readiness.mjs';
import { finalizeRun } from '../src/operational-adapter.mjs';
import { appendSnapshotRegistry, loadSnapshotRegistry } from '../src/snapshot-registry.mjs';

const episode = (id, overrides = {}) => ({
  episode_id: id,
  run_id: `run-${id}`,
  correlation_id: `corr-${id}`,
  context: { scenario: 'autonomy', observed_at: '2026-08-15T00:00:00Z' },
  claims: [],
  hypotheses: { selected_cause: 'clock-skew', candidates: [
    { cause: 'clock-skew', supporting_evidence: ['clock-drift', 'fusion-low'], disconfirming_evidence: [], score: 2 },
    { cause: 'thermal', supporting_evidence: ['thermal-high'], disconfirming_evidence: ['clock-drift'], score: 0 }
  ] },
  verification: { verdict: 'PASS' },
  outcomes: { immediate: 'verified', delayed: 'verified', recurrence: 'unknown', time_to_recovery_ms: 100 },
  ...overrides
});

test('assistive shadow ranks evidence and RCA without granting action authority', () => {
  const [recommendation] = buildShadowRecommendations(episode('a'));
  assert.equal(recommendation.mode, 'shadow');
  assert.equal(recommendation.authority.production_writes, false);
  assert.equal(recommendation.authority.can_execute, false);
  assert.equal(recommendation.ranking[0].cause, 'clock-skew');
  assert.deepEqual(recommendation.evidence, ['clock-drift', 'fusion-low']);
  assert.equal(recommendation.next_best_diagnostics[0].diagnostic, 'clock-drift');
});

test('assistive shadow clusters alerts, ranks diagnostics, and retrieves matching Skills', () => {
  const item = episode('ops', {
    observations: { incident: { id: 'incident-1', alert_ids: ['a', 'a', 'b'], suppressed_alert_ids: ['b', 'c'] } },
    action: { selected: 'resync' }
  });
  assert.deepEqual(clusterAlerts(item), { incident_id: 'incident-1', alert_ids: ['a', 'b'], suppressed_alert_ids: ['c'], duplicate_count: 2 });
  assert.equal(rankNextBestDiagnostics(item)[0].diagnostic, 'clock-drift');
  assert.deepEqual(retrieveSkills(item, [{ skill_id: 'skill-resync', actions: ['resync'] }]), [{ skill_id: 'skill-resync', action: 'resync', fallback: 'deterministic-incumbent' }]);
});

test('assistive shadow handles empty and malformed hypotheses fail closed', () => {
  assert.deepEqual(buildShadowRecommendations(episode('empty', { hypotheses: {} })), []);
  assert.throws(() => buildShadowRecommendations(null), /episode/);
});

test('shadow evaluation reports usefulness, agreement, and unsafe recommendations', () => {
  const result = evaluateShadowBatch([episode('a'), episode('b', { hypotheses: { selected_cause: 'thermal', candidates: [{ cause: 'clock-skew', supporting_evidence: [], score: 1 }] } })]);
  assert.equal(result.schema, 'agent-infra/assistive-shadow-evaluation/v1');
  assert.equal(result.sample.episodes, 2);
  assert.equal(result.metrics.incumbent_agreement, 0.5);
  assert.equal(result.metrics.unsafe_recommendation_rate, 0);
});

test('outcome ledger applies the latest reviewer label and approves only when explicitly requested', async () => {
  const dir = await import('node:fs/promises');
  const path = '/tmp/agent-infra-outcome-ledger-test.jsonl';
  await dir.rm(path, { force: true });
  const labeled = createOutcomeLabel({ labelId: 'label-1', episodeId: 'a', reviewer: 'reviewer-1', labeledAt: '2026-08-16T00:00:00Z', labels: { delayed: 'verified', recurrence: 'rejected', collateral_impact: 'verified', human_override: 'rejected', business_impact: 'verified' }, evidenceRefs: ['outcome.json'] });
  await appendOutcomeLabel(path, labeled);
  const [result] = await applyLedgerToEpisodes([episode('a', { privacy: { redaction_status: 'not-required' }, dataset_membership: { status: 'pending-review', eligible_for_training: false }, outcomes: { immediate: 'verified', delayed: 'unknown', recurrence: 'unknown', collateral_impact: 'unknown', human_override: 'unknown', business_impact: 'unknown', unknown_fields: ['delayed'] } })], path, { approve: true });
  assert.equal(result.outcomes.delayed, 'verified');
  assert.equal(result.dataset_membership.status, 'approved');
  assert.equal(result.dataset_membership.eligible_for_training, true);
});
test('assistive metrics report labeled accuracy, calibration, replay, latency, and cost', () => {
  const labeled = episode('metric', { ground_truth: { cause: 'clock-skew' }, metadata: { shadow_latency_ms: 12, shadow_cost_usd: 0.02 } });
  const recommendations = buildShadowRecommendations(labeled);
  const metrics = computeAssistiveMetrics([labeled], recommendations);
  assert.equal(metrics.labeled_precision, 1);
  assert.equal(metrics.labeled_recall, 1);
  assert.equal(metrics.labeled_samples, 1);
  assert.equal(metrics.mean_latency_ms, 12);
  assert.equal(metrics.mean_cost_usd, 0.02);
  assert.equal(metrics.replay_consistency, 1);
});

test('operational finalization hook is idempotent for accepted runs', async () => {
  const fs = await import('node:fs/promises');
  const temp = await fs.mkdtemp('/tmp/agent-infra-finalize-');
  const runPath = new URL('../artifacts/runs/run-e921dfe97489eb24/', import.meta.url).pathname;
  const options = { runPath, episodesPath: `${temp}/episodes.jsonl`, quarantinePath: `${temp}/quarantine.jsonl` };
  const first = await finalizeRun(options);
  const second = await finalizeRun(options);
  assert.equal(first.status, 'accepted');
  assert.equal(first.appended, true);
  assert.equal(second.duplicate, true);
  assert.equal((await fs.readFile(options.episodesPath, 'utf8')).trim().split('\\n').length, 1);
});

test('window readiness passes only with three independent approved windows and domains', () => {
  const episodes = [
    episode('w1', { context: { scenario: 'autonomy', observed_at: '2026-08-03T00:00:00Z' }, dataset_membership: { status: 'approved', eligible_for_training: true } }),
    episode('w2', { context: { scenario: 'robotics', observed_at: '2026-08-10T00:00:00Z' }, dataset_membership: { status: 'approved', eligible_for_training: true } }),
    episode('w3', { context: { scenario: 'trading', observed_at: '2026-08-17T00:00:00Z' }, dataset_membership: { status: 'approved', eligible_for_training: true } })
  ];
  const report = assessWindowReadiness(episodes);
  assert.equal(report.ready, true);
  assert.equal(report.windows, 3);
  assert.equal(report.domains, 3);
  assert.equal(assessWindowReadiness(episodes.slice(0, 2)).ready, false);
});

test('snapshot registry appends immutable records and rejects duplicate IDs', async () => {
  const dir = await import('node:fs/promises');
  const path = '/tmp/agent-infra-snapshot-registry-test.jsonl';
  await dir.rm(path, { force: true });
  const record = { snapshot_id: 'snapshot-1', content_sha256: 'a'.repeat(64), episode_ids: ['e1'], approval_state: 'pending-review' };
  await appendSnapshotRegistry(path, record);
  const loaded = await loadSnapshotRegistry(path);
  assert.equal(loaded.length, 1);
  assert.deepEqual({ ...loaded[0], registered_at: undefined }, { ...record, registered_at: undefined });
  await assert.rejects(() => appendSnapshotRegistry(path, record), /duplicate snapshot_id/);
});
