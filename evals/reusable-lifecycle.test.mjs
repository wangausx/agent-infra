import assert from 'node:assert/strict';
import test from 'node:test';
import { createScenarioAdapter, LIFECYCLE_CONTRACT, runReusableLifecycle } from '../src/reusable-lifecycle.mjs';

function fixture(scenario_id, recommendation = 'resynchronize') {
  return { scenario_id, incident: { id: `${scenario_id}-incident`, context_version: 1 }, state: { synchronized: false, localization_confidence: 0.61 }, recommendation, after_state: { synchronized: true, localization_confidence: 0.96 }, safety: { simulation_only: true, production_writes: false } };
}

test('reusable lifecycle runs the same contract for autonomy and payment fixtures', () => {
  for (const id of ['autonomy-sensor-fusion', 'payment-stale-recovery']) {
    const result = runReusableLifecycle({ runId: `run-${id}`, correlationId: `corr-${id}`, adapter: createScenarioAdapter({ scenarioId: id, fixture: fixture(id) }) });
    assert.deepEqual(result.stages, LIFECYCLE_CONTRACT);
    assert.equal(result.policy.decision, 'approve');
    assert.equal(result.verification.verdict, 'passed');
    assert.equal(result.review.review, 'sealed');
  }
});

test('reusable adapter fails closed for production writes and unapproved action', () => {
  assert.throws(() => createScenarioAdapter({ scenarioId: 'payment-stale-recovery', fixture: { ...fixture('payment-stale-recovery'), safety: { production_writes: true } } }), /production_writes=false/);
  assert.throws(() => createScenarioAdapter({ scenarioId: 'payment-stale-recovery', fixture: fixture('payment-stale-recovery', 'charge-card') }).apply({ action: 'resynchronize' }), /fixture recommendation/);
});
