const HYPOTHESES = Object.freeze([
  { cause: 'lidar-camera-timestamp-skew', supporting: ['sensor-timestamp-drift', 'fusion-confidence-low', 'deployment-event'], disconfirming: ['gps-healthy', 'compute-healthy'] },
  { cause: 'localization-map-corruption', supporting: ['localization-covariance-high', 'route-progress-low'], disconfirming: ['map-match-healthy', 'sensor-timestamp-drift'] },
  { cause: 'compute-thermal-degradation', supporting: ['fusion-confidence-low'], disconfirming: ['compute-healthy', 'thermal-healthy'] }
]);

export function analyzeRca({ alerts, state, deployment } = {}) {
  if (!Array.isArray(alerts) || !state || !deployment) throw new TypeError('alerts, state, and deployment are required');
  const kinds = new Set(alerts.map((alert) => alert.kind));
  const hypotheses = HYPOTHESES.map((hypothesis) => {
    const supporting = hypothesis.supporting.filter((item) => kinds.has(item) || state[item] === true || deployment.environment === 'digital-twin' && item === 'deployment-event');
    const disconfirming = hypothesis.disconfirming.filter((item) => state[item] === true || (item === 'sensor-timestamp-drift' && kinds.has(item)));
    return { ...hypothesis, supporting_evidence: supporting, disconfirming_evidence: disconfirming, score: supporting.length - disconfirming.length };
  });
  hypotheses.sort((a, b) => b.score - a.score || a.cause.localeCompare(b.cause));
  return { selected_cause: hypotheses[0].cause, hypotheses, evidence_complete: hypotheses[0].supporting_evidence.length >= 2 };
}

export function planRemediation({ cause, safety } = {}) {
  if (!cause || !safety) throw new TypeError('cause and safety are required');
  const action = cause === 'lidar-camera-timestamp-skew' ? 'resynchronize-sensor-timestamps' : 'pause-for-approval';
  const allowed = safety.allowed_actions.includes(action);
  return { action, risk: allowed ? 'low' : 'high', approval_required: !allowed, allowed, reason: allowed ? 'allowlisted digital-twin recovery' : 'action is not allowlisted for automatic execution' };
}
