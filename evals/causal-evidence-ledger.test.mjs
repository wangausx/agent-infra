import assert from 'node:assert/strict';
import test from 'node:test';
import { collectEpisodeFromRun } from '../src/episode-collector.mjs';
import { buildCausalEvidence, validateCausalEvidence, assertValidCausalEvidence } from '../src/causal-evidence-ledger.mjs';

const fixture = 'artifacts/runs/run-e921dfe97489eb24';

test('collector emits a typed observational causal ledger with bound evidence', async () => {
  const episode = await collectEpisodeFromRun(fixture);
  assert.deepEqual(validateCausalEvidence(episode.causal_evidence, episode.source.files), []);
  assert.equal(episode.causal_evidence.evidence_class, 'observational');
  assert.equal(episode.causal_evidence.baseline_control.type, 'deterministic-incumbent');
  assert.equal(episode.causal_evidence.observed_effect.outcome, 'verified');
  assert.doesNotThrow(() => assertValidCausalEvidence(episode.causal_evidence, episode.source.files));
});

test('causal ledger rejects unbound evidence and unsupported certainty', async () => {
  const episode = await collectEpisodeFromRun(fixture);
  const invalid = { ...episode.causal_evidence, evidence_class: 'controlled-intervention', intervention: { ...episode.causal_evidence.intervention, evidence_refs: [{ artifact: 'missing.json', pointer: '/' }] } };
  assert.match(validateCausalEvidence(invalid, episode.source.files).join('; '), /unsupported causal evidence class|not in source files/);
  assert.throws(() => assertValidCausalEvidence({ ...episode.causal_evidence, uncertainty: { ...episode.causal_evidence.uncertainty, level: 'certain' } }, episode.source.files), /uncertainty.level/);
});

test('causal ledger marks non-executed policy paths as observational, not intervention proof', () => {
  const ledger = buildCausalEvidence({ runId: 'run-1', scenario: 'synthetic', rca: {}, policy: { action: 'hold' }, action: { executed: false }, verifier: { verdict: 'FAIL' }, scorecard: { verdict: 'FAIL' } });
  assert.equal(ledger.intervention.type, 'policy-decision');
  assert.equal(ledger.evidence_class, 'observational');
  assert.equal(ledger.observed_effect.outcome, 'rejected');
});
