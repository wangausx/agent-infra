import assert from 'node:assert/strict';
import test from 'node:test';

import { loadAutonomyFixture, validateAutonomyFixture } from '../scenarios/autonomy-sensor-fusion/fixture.mjs';
import { runZeroTouchScenario } from '../src/zero-touch.mjs';
import { createAutonomyAdapter } from '../src/zero-touch/scenario-adapter.mjs';
import { normalizeAlert } from '../src/zero-touch/alert-correlator.mjs';
import { planRemediation } from '../src/zero-touch/rca-engine.mjs';

test('zero-touch rejects empty, malformed, and unsafe inputs before execution', async () => {
  await assert.rejects(() => runZeroTouchScenario(), /fixture is required/);
  assert.throws(() => normalizeAlert({}), /alert_id is required/);
  const fixture = await loadAutonomyFixture();
  const unsafe = structuredClone(fixture);
  unsafe.safety.production_control_connected = true;
  assert.throws(() => createAutonomyAdapter(unsafe), /safety boundary rejected/);
  assert.equal(validateAutonomyFixture({ ...fixture, alerts: [] }).valid, false);
});

test('zero-touch policy pauses actions outside the allowlist', () => {
  const policy = planRemediation({ cause: 'unknown-cause', safety: { allowed_actions: [] } });
  assert.equal(policy.action, 'pause-for-approval');
  assert.equal(policy.approval_required, true);
  assert.equal(policy.allowed, false);
});
