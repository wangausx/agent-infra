export function verifyAutonomy({ fixture, before, after, action, failure = null } = {}) {
  if (!fixture || !before || !after || !action) throw new TypeError('fixture, before, after, and action are required');
  const checks = [
    ['sensor-timestamp', after.lidar_camera_offset_ms <= fixture.expected_report.expected_final_state.lidar_camera_offset_ms_max],
    ['fusion-confidence', after.fusion_confidence >= fixture.expected_report.expected_final_state.fusion_confidence_min],
    ['localization-covariance', after.position_covariance_m2 <= fixture.expected_report.expected_final_state.position_covariance_m2_max],
    ['tracking-confidence', after.tracking_confidence >= fixture.expected_report.expected_final_state.tracking_confidence_min],
    ['planner-mode', after.planner_mode === fixture.expected_report.expected_final_state.planner_mode],
    ['safety-corridor', after.inside_safety_corridor === true],
    ['observation-window', fixture.clock.observation_window_ms === 60000],
    ['duplicate-action', action.duplicate_action_count === 0]
  ];
  if (failure === 'verifier-failure' || failure === 'rollback-failure') checks[1][1] = false;
  const evidence = checks.map(([name, passed]) => ({ check: name, passed }));
  return { verdict: evidence.every((item) => item.passed) ? 'PASS' : 'FAIL', checks: evidence, evidence: evidence.filter((item) => item.passed).map((item) => `verification:${item.check}`), compensation: failure === 'rollback-failure' ? { status: 'failed', error: 'simulated rollback failure' } : undefined };
}

export function createPostmortem({ context, incident, rca, policy, action, verification } = {}) {
  if (!context || !incident || !rca || !policy || !action || !verification) throw new TypeError('postmortem inputs are required');
  return { schema: 'agent-infra/zero-touch-postmortem/v1', run_id: context.run_id, summary: `${incident.id} recovered via ${policy.action}`, root_cause: rca.selected_cause, action: policy.action, verdict: verification.verdict, lessons: ['correlate deployment events with sensor symptoms', 'verify digital-twin invariants independently', 'retain compensation for every action'] };
}
