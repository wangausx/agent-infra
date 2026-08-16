import assert from 'node:assert/strict';
import test from 'node:test';
import { collectEpisodeFromRun } from '../src/episode-collector.mjs';
import { validateEpisode, assertValidEpisode } from '../src/episode-contract.mjs';
import { applyGovernance, approveForTraining, quarantineEpisode } from '../src/episode-governance.mjs';
import { buildIncumbentBaseline } from '../src/incumbent-baseline.mjs';
import { createOutcomeLabel, applyOutcomeLabel } from '../src/outcome-label-ledger.mjs';
import { assertNoLeakage, validateNoLeakage, assertReplayIntegrity } from '../src/replay-audit.mjs';
import { buildQualityDashboard } from '../src/episode-quality.mjs';

const fixture = 'artifacts/runs/run-e921dfe97489eb24';

test('episode contract validates the collected episode and rejects unsafe eligibility', async () => {
  const episode = await collectEpisodeFromRun(fixture);
  assert.deepEqual(validateEpisode(episode), []);
  assert.equal(episode.claims.length, 4);
  assert.doesNotThrow(() => assertValidEpisode(episode));
  assert.throws(() => assertValidEpisode({ ...episode, dataset_membership: { ...episode.dataset_membership, eligible_for_training: true } }), /training eligibility/);
});

test('governance applies synthetic retention policy and requires delayed labels', async () => {
  const episode = await collectEpisodeFromRun(fixture);
  const governed = applyGovernance(episode, { reviewer: 'reviewer-1', reviewedAt: '2026-08-15T00:00:00Z' });
  assert.equal(governed.privacy.classification, 'internal-synthetic');
  assert.equal(governed.privacy.retention_days, 30);
  assert.equal(governed.privacy.retention_status, 'reviewed');
  assert.equal(governed.dataset_membership.eligible_for_training, false);
  assert.throws(() => approveForTraining(governed, { reviewer: 'reviewer-1', reviewedAt: '2026-08-15T00:00:00Z', labels: {} }), /delayed outcome/);
  assert.equal(quarantineEpisode(governed, 'missing-outcome').dataset_membership.status, 'quarantined');
});

test('incumbent baseline reports deterministic outcomes and safety boundaries', async () => {
  const episode = await collectEpisodeFromRun(fixture);
  const baseline = buildIncumbentBaseline([episode]);
  assert.equal(baseline.schema, 'agent-infra/incumbent-baseline/v1');
  assert.equal(baseline.sample.episodes, 1);
  assert.equal(baseline.outcome_rates.verified, 1);
  assert.equal(baseline.outcome_rates.delayed_unknown, 1);
  assert.equal(baseline.safety.production_write_attempts, 0);
  assert.equal(baseline.recovery.observed_duration_samples, 1);
});

test('outcome label ledger creates auditable labels and updates only labeled fields', async () => {
  const episode = await collectEpisodeFromRun(fixture);
  const label = createOutcomeLabel({ labelId: 'label-1', episodeId: episode.episode_id, reviewer: 'reviewer-1', labeledAt: '2026-08-15T01:00:00Z', labels: { delayed: 'verified', recurrence: 'verified', collateral_impact: 'verified', human_override: 'unknown', business_impact: 'verified' }, evidenceRefs: [{ artifact: 'metrics.json', pointer: '/' }] });
  const labeled = applyOutcomeLabel(episode, label);
  assert.equal(labeled.outcomes.delayed, 'verified');
  assert.deepEqual(labeled.outcomes.unknown_fields, ['human_override']);
  assert.equal(labeled.outcome_labels[0].reviewer, 'reviewer-1');
});

test('replay audit rejects cross-split lineage leakage and unsafe replay writes', async () => {
  const episode = await collectEpisodeFromRun(fixture);
  assert.doesNotThrow(() => assertReplayIntegrity([episode]));
  assert.deepEqual(validateNoLeakage({ train: [episode], validation: [], test: [] }), []);
  assert.throws(() => assertNoLeakage({ train: [episode], validation: [{ ...episode, episode_id: 'other' }], test: [] }), /leakage detected/);
  assert.throws(() => assertReplayIntegrity([{ ...episode, decision: { authority: { production_writes: true } } }]), /production_writes/);
});

test('quality dashboard reports completeness, labels, safety, and deferred drift honestly', async () => {
  const episode = await collectEpisodeFromRun(fixture);
  const dashboard = buildQualityDashboard([episode]);
  assert.equal(dashboard.schema, 'agent-infra/episode-quality/v1');
  assert.equal(dashboard.sample.episodes, 1);
  assert.equal(dashboard.completeness.unknown_outcome_rate, 1);
  assert.equal(dashboard.safety.production_write_attempts, 0);
  assert.equal(dashboard.drift.status, 'not-computed');
});
