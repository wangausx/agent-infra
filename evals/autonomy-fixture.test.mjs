import assert from 'node:assert/strict';
import test from 'node:test';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';

import {
  AUTONOMY_FIXTURE_SCHEMA,
  loadAutonomyFixture,
  validateAutonomyFixture
} from '../scenarios/autonomy-sensor-fusion/fixture.mjs';

const scenarioUrl = new URL('../scenarios/autonomy-sensor-fusion/', import.meta.url);

function canonical(value) {
  if (Array.isArray(value)) return `[${value.map(canonical).join(',')}]`;
  if (value && typeof value === 'object') {
    return `{${Object.keys(value).sort().map((key) => `${JSON.stringify(key)}:${canonical(value[key])}`).join(',')}}`;
  }
  return JSON.stringify(value);
}

test('M3-01 fixture loads offline with deterministic normalized input', async () => {
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async () => { throw new Error('network access is forbidden for fixture loading'); };
  try {
    const first = await loadAutonomyFixture();
    const second = await loadAutonomyFixture();
    assert.equal(first.schema, AUTONOMY_FIXTURE_SCHEMA);
    assert.equal(canonical(first), canonical(second));
    assert.equal(first.alerts.length >= 12, true);
    assert.equal(new Set(first.alerts.map((alert) => alert.source)).size >= 6, true);
    assert.equal(first.safety.physical_vehicle_connected, false);
    assert.equal(first.safety.production_control_connected, false);
    assert.equal(first.digital_twin.simulation_only, true);
    assert.equal(first.route.waypoints.length >= 3, true);
    assert.equal(first.safety_corridor.polygon.length >= 4, true);
    assert.equal(first.deployment.component, 'perception-stack');
    assert.deepEqual(validateAutonomyFixture(first), { valid: true, errors: [] });
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test('M3-01 fixture declares expected report and all required failure cases', async () => {
  const fixture = await loadAutonomyFixture();
  assert.equal(fixture.expected_report.raw_alert_count, fixture.alerts.length);
  assert.equal(fixture.expected_report.expected_incident_count, 1);
  assert.equal(fixture.expected_report.production_writes, false);
  assert.deepEqual(fixture.expected_report.expected_selected_cause, 'lidar-camera-timestamp-skew');
  assert.deepEqual(fixture.expected_report.expected_action, 'resynchronize-sensor-timestamps');
  const requiredCases = [
    'duplicate-alerts-only', 'false-rca-hypothesis', 'executor-failure',
    'verifier-failure', 'rollback-failure', 'approval-pause',
    'stale-lease-restart', 'new-alert-during-recovery', 'malformed-alert', 'empty-input'
  ];
  assert.deepEqual(fixture.failure_cases.map((item) => item.case_id), requiredCases);
});

test('M3-01 validator rejects invalid and boundary-breaching fixtures before execution', async () => {
  const fixture = await loadAutonomyFixture();
  assert.equal(validateAutonomyFixture(null).valid, false);
  assert.match(validateAutonomyFixture({}).errors.join('\n'), /schema/);

  const tooFewAlerts = structuredClone(fixture);
  tooFewAlerts.alerts = tooFewAlerts.alerts.slice(0, 11);
  assert.match(validateAutonomyFixture(tooFewAlerts).errors.join('\n'), /at least 12 alerts/);

  const physical = structuredClone(fixture);
  physical.safety.physical_vehicle_connected = true;
  assert.match(validateAutonomyFixture(physical).errors.join('\n'), /physical vehicle/);

  const duplicateId = structuredClone(fixture);
  duplicateId.alerts[1].alert_id = duplicateId.alerts[0].alert_id;
  assert.match(validateAutonomyFixture(duplicateId).errors.join('\n'), /unique alert_id/);
});

test('M3-01 required JSON artifacts are valid and contain no endpoint or credential fields', async () => {
  for (const name of ['alerts.json', 'expected-report.json', 'failure-cases.json']) {
    const text = await readFile(new URL(name, scenarioUrl), 'utf8');
    assert.doesNotThrow(() => JSON.parse(text));
    assert.doesNotMatch(text, /\b(?:api[_-]?key|authorization|password|token|https?:\/\/|wss?:\/\/)\b/i);
  }
  assert.equal(fileURLToPath(scenarioUrl).includes('autonomy-sensor-fusion'), true);
});
