export async function executeAction({ context, adapter, plan, failure = null } = {}) {
  if (!context || !adapter || !plan) throw new TypeError('context, adapter, and plan are required');
  const before = await adapter.readState();
  if (failure === 'executor-failure') return { action: plan.action, action_key: `${context.run_id}:${plan.action}`, executed: false, duplicate_action_count: 0, reversible: true, before_state: before, after_state: before, compensation: { available: true, status: 'compensated' }, error: 'simulated executor failure' };
  const actionKey = `${context.run_id}:${plan.action}`;
  const after = structuredClone(before);
  let executed = false;
  if (plan.action === 'resynchronize-sensor-timestamps') {
    after.lidar_camera_offset_ms = 32;
    after.fusion_confidence = 0.91;
    after.position_covariance_m2 = 0.12;
    after.tracking_confidence = 0.92;
    after.planner_mode = 'nominal';
    after.action_generation += 1;
    executed = true;
  }
  return { action: plan.action, action_key: actionKey, executed, duplicate_action_count: 0, reversible: true, before_state: before, after_state: after, compensation: { available: true, action: `restore:${actionKey}` } };
}
