import assert from 'node:assert/strict';
import test from 'node:test';
import { buildDatasetSnapshot, assignDatasetSplits } from '../src/dataset-snapshot.mjs';

const episode = (id, overrides = {}) => ({
  episode_id: id,
  run_id: `run-${id}`,
  correlation_id: `corr-${id}`,
  identities: ['operator-a'],
  context: { scenario: 'autonomy-sensor-fusion', observed_at: '2026-08-15T00:00:00Z' },
  source: { files: ['scorecard.json'], sha256: { 'scorecard.json': 'hash' } },
  claims: [],
  decision: { authority: { production_writes: false } },
  outcomes: { immediate: 'verified', delayed: 'verified', recurrence: 'unknown', collateral_impact: 'unknown', human_override: 'unknown', business_impact: 'unknown', unknown_fields: ['recurrence', 'collateral_impact', 'human_override', 'business_impact'] },
  ...overrides
});

test('dataset snapshot is deterministic and split-safe by run, domain, and operator', () => {
  const episodes = [
    episode('a', { context: { scenario: 'autonomy', observed_at: '2026-08-01T00:00:00Z' } }),
    episode('b', { context: { scenario: 'payment', observed_at: '2026-08-02T00:00:00Z' }, identities: ['operator-b'] }),
    episode('c', { context: { scenario: 'autonomy', observed_at: '2026-08-03T00:00:00Z' }, identities: ['operator-c'] })
  ];
  const snapshot = buildDatasetSnapshot(episodes, { snapshotId: 'snapshot-1' });
  assert.equal(snapshot.schema, 'agent-infra/dataset-snapshot/v1');
  assert.equal(snapshot.sample.episodes, 3);
  assert.equal(snapshot.splits.train.length + snapshot.splits.validation.length + snapshot.splits.test.length, 3);
  assert.deepEqual(assignDatasetSplits(episodes), snapshot.splits);
  assert.equal(snapshot.safety.production_write_episodes, 0);
  assert.equal(snapshot.training_sample.eligible_episodes, 0);
  assert.deepEqual(snapshot.training_splits, { train: [], validation: [], test: [] });
  assert.match(snapshot.content_sha256, /^[a-f0-9]{64}$/);
});

test('dataset snapshot exposes only explicitly approved episodes to training exports', () => {
  const approved = episode('approved', {
    dataset_membership: { status: 'approved', eligible_for_training: true },
    privacy: { classification: 'internal-synthetic', redaction_status: 'not-required', retention_days: 30, access_roles: ['agent-infra-reviewer'] }
  });
  const pending = episode('pending');
  const snapshot = buildDatasetSnapshot([approved, pending]);
  assert.equal(snapshot.sample.episodes, 2);
  assert.equal(snapshot.training_sample.eligible_episodes, 1);
  assert.deepEqual(snapshot.training_splits.train.map((item) => item.episode_id), ['approved']);
});

test('dataset snapshot rejects duplicate lineage, unsafe writes, and missing timestamps', () => {
  assert.throws(() => buildDatasetSnapshot([episode('a'), episode('a')]), /duplicate episode_id/);
  assert.throws(() => buildDatasetSnapshot([episode('a', { decision: { authority: { production_writes: true } } })]), /production_writes/);
  assert.throws(() => buildDatasetSnapshot([episode('a', { context: { scenario: 'autonomy' } })]), /observed_at/);
});

test('dataset split assignment rejects cross-split lineage and invalid episodes', () => {
  assert.throws(() => assignDatasetSplits([episode('a', { run_id: '' })]), /run_id/);
  assert.throws(() => assignDatasetSplits([episode('a', { identities: [] })]), /identity/);
});
