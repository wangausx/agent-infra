import { readFile } from 'node:fs/promises';

export const AUTONOMY_FIXTURE_SCHEMA = 'agent-infra/autonomy-fixture/v1';
const BASE_URL = new URL('./', import.meta.url);
const REQUIRED_FAILURE_CASES = Object.freeze([
  'duplicate-alerts-only',
  'false-rca-hypothesis',
  'executor-failure',
  'verifier-failure',
  'rollback-failure',
  'approval-pause',
  'stale-lease-restart',
  'new-alert-during-recovery',
  'malformed-alert',
  'empty-input'
]);

const FIXTURE = Object.freeze({
  schema: AUTONOMY_FIXTURE_SCHEMA,
  scenario_id: 'autonomy-sensor-fusion',
  seed: 'autonomy-sensor-fusion-001',
  clock: {
    started_at: '2026-08-12T16:00:00.000Z',
    tick_ms: 5000,
    observation_window_ms: 60000
  },
  safety: {
    simulation_only: true,
    physical_vehicle_connected: false,
    production_control_connected: false,
    production_mission_control_writes: false,
    network_required: false,
    allowed_actions: [
      'restart-sensor-fusion-worker',
      'resynchronize-sensor-timestamps'
    ],
    approval_required_actions: [
      'switch-degraded-perception-mode',
      'stop-in-simulated-safe-zone',
      'rollback-perception-deployment'
    ]
  },
  route: {
    route_id: 'shuttle-loop-a',
    coordinate_system: 'local-meters',
    waypoints: [
      { id: 'wp-01', x: 0, y: 0, expected_at_s: 0 },
      { id: 'wp-02', x: 45, y: 0, expected_at_s: 20 },
      { id: 'wp-03', x: 82, y: 24, expected_at_s: 40 },
      { id: 'wp-04', x: 108, y: 58, expected_at_s: 60 }
    ]
  },
  safety_corridor: {
    corridor_id: 'corridor-shuttle-loop-a',
    coordinate_system: 'local-meters',
    polygon: [
      { x: -6, y: -8 },
      { x: 116, y: -8 },
      { x: 116, y: 66 },
      { x: -6, y: 66 },
      { x: -6, y: -8 }
    ],
    max_cross_track_error_m: 2,
    physical_boundary: false
  },
  deployment: {
    deployment_id: 'deploy-perception-0042',
    component: 'perception-stack',
    previous_version: 'perception-2.8.3',
    deployed_version: 'perception-2.9.0',
    completed_at: '2026-08-12T15:59:40.000Z',
    environment: 'digital-twin',
    production: false
  },
  digital_twin: {
    twin_id: 'shuttle-dt-01',
    simulation_only: true,
    vehicle_mode: 'autonomous-simulated',
    position: { x: 39, y: 0.3 },
    inside_safety_corridor: true,
    lidar_camera_offset_ms: 146,
    fusion_confidence: 0.61,
    position_covariance_m2: 0.43,
    tracking_confidence: 0.67,
    planner_mode: 'conservative',
    max_speed_mps: 2.2,
    route_progress_ratio: 0.71,
    gps_healthy: true,
    map_match_healthy: true,
    compute_healthy: true,
    thermal_healthy: true,
    action_generation: 0
  }
});

async function readJson(name) {
  return JSON.parse(await readFile(new URL(name, BASE_URL), 'utf8'));
}

function isPlainObject(value) {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function validTimestamp(value) {
  return typeof value === 'string' && Number.isFinite(Date.parse(value));
}

export function validateAutonomyFixture(fixture) {
  const errors = [];
  if (!isPlainObject(fixture)) return { valid: false, errors: ['fixture must be an object'] };
  if (fixture.schema !== AUTONOMY_FIXTURE_SCHEMA) errors.push(`schema must be ${AUTONOMY_FIXTURE_SCHEMA}`);
  if (typeof fixture.seed !== 'string' || fixture.seed.length === 0) errors.push('seed is required');
  if (!isPlainObject(fixture.route) || !Array.isArray(fixture.route.waypoints) || fixture.route.waypoints.length < 3) errors.push('route must contain at least 3 waypoints');
  if (!isPlainObject(fixture.safety_corridor) || !Array.isArray(fixture.safety_corridor.polygon) || fixture.safety_corridor.polygon.length < 4) errors.push('safety corridor must contain at least 4 polygon points');
  if (!isPlainObject(fixture.deployment) || fixture.deployment.environment !== 'digital-twin' || fixture.deployment.production !== false) errors.push('deployment must target the non-production digital twin');
  if (!isPlainObject(fixture.digital_twin) || fixture.digital_twin.simulation_only !== true) errors.push('digital twin must be simulation only');
  if (!isPlainObject(fixture.safety)) errors.push('safety boundary is required');
  else {
    if (fixture.safety.physical_vehicle_connected !== false) errors.push('physical vehicle connection must be false');
    if (fixture.safety.production_control_connected !== false) errors.push('production control connection must be false');
    if (fixture.safety.production_mission_control_writes !== false) errors.push('production Mission Control writes must be false');
    if (fixture.safety.network_required !== false) errors.push('fixture must not require network access');
  }
  if (!Array.isArray(fixture.alerts) || fixture.alerts.length < 12) errors.push('fixture must contain at least 12 alerts');
  else {
    const ids = new Set();
    for (const [index, alert] of fixture.alerts.entries()) {
      if (!isPlainObject(alert)) {
        errors.push(`alert ${index} must be an object`);
        continue;
      }
      for (const field of ['alert_id', 'source', 'kind', 'component', 'message']) {
        if (typeof alert[field] !== 'string' || alert[field].length === 0) errors.push(`alert ${index} missing ${field}`);
      }
      if (!validTimestamp(alert.occurred_at)) errors.push(`alert ${index} has invalid occurred_at`);
      if (ids.has(alert.alert_id)) errors.push('alerts must have unique alert_id values');
      ids.add(alert.alert_id);
    }
  }
  if (!isPlainObject(fixture.expected_report)) errors.push('expected report is required');
  else {
    if (fixture.expected_report.seed !== fixture.seed) errors.push('expected report seed must match fixture seed');
    if (fixture.expected_report.raw_alert_count !== fixture.alerts?.length) errors.push('expected raw alert count must match alerts');
    if (fixture.expected_report.production_writes !== false) errors.push('expected report must prohibit production writes');
  }
  if (!Array.isArray(fixture.failure_cases)) errors.push('failure cases are required');
  else {
    const actual = fixture.failure_cases.map((item) => item.case_id);
    if (JSON.stringify(actual) !== JSON.stringify(REQUIRED_FAILURE_CASES)) errors.push('failure cases must match the required deterministic order');
  }
  return { valid: errors.length === 0, errors };
}

export async function loadAutonomyFixture() {
  const alerts = await readJson('alerts.json');
  const expectedReport = await readJson('expected-report.json');
  const failureCases = await readJson('failure-cases.json');
  const fixture = structuredClone({
    ...FIXTURE,
    alerts,
    expected_report: expectedReport,
    failure_cases: failureCases
  });
  const validation = validateAutonomyFixture(fixture);
  if (!validation.valid) throw new TypeError(`invalid autonomy fixture: ${validation.errors.join('; ')}`);
  return fixture;
}

export { REQUIRED_FAILURE_CASES };
