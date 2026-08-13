import crypto from 'node:crypto';

export const ZERO_TOUCH_SCHEMA = 'agent-infra/zero-touch-report/v1';

function hash(value) {
  return crypto.createHash('sha256').update(JSON.stringify(value)).digest('hex').slice(0, 16);
}

export function createRunContext({ fixture, mode = 'dry-run' } = {}) {
  if (!fixture || typeof fixture !== 'object') throw new TypeError('fixture is required');
  if (mode !== 'dry-run') throw new Error('zero-touch scenario only permits dry-run mode');
  const seed = fixture.seed;
  const identity = `${seed}:${mode}`;
  return Object.freeze({
    schema: 'agent-infra/zero-touch-context/v1',
    seed,
    mode,
    run_id: `run-${hash(identity)}`,
    correlation_id: `corr-${hash(`${identity}:correlation`)}`,
    team_id: `team-${hash(`${identity}:team`)}`,
    room_id: `room-${hash(`${identity}:room`)}`,
    project_id: `project-${hash(`${identity}:project`)}`,
    task_id: `task-${hash(`${identity}:task`)}`
  });
}

export function createAutonomyAdapter(fixture, { recorder = null } = {}) {
  if (!fixture?.scenario_id || fixture.scenario_id !== 'autonomy-sensor-fusion') throw new TypeError('unsupported autonomy scenario');
  if (fixture.safety?.simulation_only !== true || fixture.safety?.production_control_connected !== false || fixture.safety?.physical_vehicle_connected !== false) {
    throw new Error('autonomy adapter safety boundary rejected');
  }
  return Object.freeze({
    name: 'autonomy-sensor-fusion',
    fixture,
    readAlerts: () => recorder ? recorder.call('autonomy.readAlerts', { scenario_id: fixture.scenario_id }, async () => fixture.alerts.map((alert) => structuredClone(alert))) : fixture.alerts.map((alert) => structuredClone(alert)),
    readState: () => recorder ? recorder.call('autonomy.readState', { scenario_id: fixture.scenario_id }, async () => structuredClone(fixture.digital_twin)) : structuredClone(fixture.digital_twin),
    deployment: () => recorder ? recorder.call('autonomy.deployment', { scenario_id: fixture.scenario_id }, async () => structuredClone(fixture.deployment)) : structuredClone(fixture.deployment),
    safety: () => recorder ? recorder.call('autonomy.safety', { scenario_id: fixture.scenario_id }, async () => structuredClone(fixture.safety)) : structuredClone(fixture.safety)
  });
}
