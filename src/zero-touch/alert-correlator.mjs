export const ALERT_SCHEMA = 'agent-infra/zero-touch-alert/v1';

function required(value, name) {
  if (typeof value !== 'string' || value.length === 0) throw new TypeError(`${name} is required`);
  return value;
}

export function normalizeAlert(alert) {
  if (!alert || typeof alert !== 'object' || Array.isArray(alert)) throw new TypeError('alert must be an object');
  for (const field of ['alert_id', 'occurred_at', 'source', 'kind', 'component', 'message']) required(alert[field], field);
  if (!Number.isFinite(Date.parse(alert.occurred_at))) throw new TypeError('occurred_at must be an ISO timestamp');
  return {
    schema: ALERT_SCHEMA,
    alert_id: alert.alert_id,
    occurred_at: alert.occurred_at,
    source: alert.source,
    kind: alert.kind,
    severity: alert.severity ?? 'unknown',
    component: alert.component,
    metric: alert.metric ?? null,
    value: alert.value ?? null,
    threshold: alert.threshold ?? null,
    message: alert.message,
    duplicate_of: alert.duplicate_of ?? null
  };
}

export function correlateAlerts(alerts, { deployment } = {}) {
  if (!Array.isArray(alerts) || alerts.length === 0) throw new TypeError('alerts must be a non-empty array');
  const normalized = alerts.map(normalizeAlert);
  const seen = new Set();
  const suppression = [];
  const primary = [];
  for (const alert of normalized) {
    const key = alert.duplicate_of ?? `${alert.kind}:${alert.component}`;
    if (alert.duplicate_of || seen.has(key)) {
      suppression.push({ alert_id: alert.alert_id, reason: alert.duplicate_of ? 'declared-duplicate' : 'symptom-duplicate', duplicate_of: alert.duplicate_of ?? [...seen].find((item) => item === key) ?? null, source: alert.source });
    } else {
      seen.add(key);
      primary.push(alert);
    }
  }
  const incident = {
    id: `incident-${primary.map((item) => item.alert_id).join('-')}`,
    count: 1,
    alert_ids: primary.map((item) => item.alert_id),
    suppressed_alert_ids: suppression.map((item) => item.alert_id),
    deployment_event: normalized.find((item) => item.kind === 'deployment-event')?.alert_id ?? deployment?.deployment_id ?? null
  };
  return { normalized, primary, suppression, incident };
}
