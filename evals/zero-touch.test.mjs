import assert from 'node:assert/strict';
import test from 'node:test';

import { loadAutonomyFixture } from '../scenarios/autonomy-sensor-fusion/fixture.mjs';
import { runZeroTouchScenario } from '../src/zero-touch.mjs';

const REQUIRED_STAGES = [
  'ALERTS',
  'INCIDENT',
  'RCA',
  'POLICY',
  'ACTION',
  'VERIFY',
  'REVIEW'
];

function assertNoProductionSideEffects(report) {
  assert.equal(report.safety.production_writes, false);
  assert.equal(report.safety.physical_vehicle_used, false);
  assert.equal(report.safety.production_control_connected, false);
  assert.equal(report.safety.physical_vehicle_connected, false);
}

test('M3-02 zero-touch vehicle scenario satisfies the complete dry-run contract', async () => {
  const fixture = await loadAutonomyFixture();
  const report = await runZeroTouchScenario({ fixture, mode: 'dry-run' });

  assert.equal(report.schema, 'agent-infra/zero-touch-report/v1');
  assert.equal(report.seed, fixture.seed);
  assert.equal(report.incident.count, fixture.expected_report.expected_incident_count);
  assert.deepEqual(report.incident.suppressed_alert_ids, fixture.expected_report.expected_suppressed_alert_ids);
  assert.equal(report.rca.selected_cause, fixture.expected_report.expected_selected_cause);
  assert.equal(report.policy.action, fixture.expected_report.expected_action);
  assert.equal(report.verdict, fixture.expected_report.expected_verdict);
  assert.deepEqual(report.stages, REQUIRED_STAGES);
  assertNoProductionSideEffects(report);

  for (const evidence of fixture.expected_report.required_evidence) {
    assert.ok(report.evidence.includes(evidence), `missing required evidence: ${evidence}`);
  }
});

test('M3-02 zero-touch replay is deterministic and does not duplicate remediation', async () => {
  const fixture = await loadAutonomyFixture();
  const first = await runZeroTouchScenario({ fixture, mode: 'dry-run' });
  const replay = await runZeroTouchScenario({ fixture, mode: 'dry-run' });

  assert.equal(replay.run_id, first.run_id);
  assert.equal(replay.incident.id, first.incident.id);
  assert.equal(replay.rca.selected_cause, first.rca.selected_cause);
  assert.equal(replay.policy.action, first.policy.action);
  assert.equal(replay.verdict, first.verdict);
  assert.equal(replay.action.duplicate_action_count, 0);
  assertNoProductionSideEffects(replay);
});
