import crypto from 'node:crypto';

export const ROLES = Object.freeze(['planner', 'executor', 'verifier']);
export const STATUSES = Object.freeze(['planned', 'executing', 'verified', 'rejected', 'rolled-back']);

export function sha256(value) {
  const bytes = Buffer.isBuffer(value) ? value : Buffer.from(typeof value === 'string' ? value : JSON.stringify(value));
  return crypto.createHash('sha256').update(bytes).digest('hex');
}

export function assertEnvelope(envelope) {
  if (!envelope || typeof envelope !== 'object') throw new TypeError('context envelope must be an object');
  for (const key of ['envelope_id', 'task_id', 'sender', 'recipient', 'kind', 'version', 'payload', 'created_at']) {
    if (envelope[key] === undefined || envelope[key] === null) throw new TypeError(`missing envelope field: ${key}`);
  }
  if (!ROLES.includes(envelope.sender) && envelope.sender !== 'system') throw new TypeError('invalid envelope sender');
  if (!ROLES.includes(envelope.recipient) && envelope.recipient !== 'control-plane') throw new TypeError('invalid envelope recipient');
  if (!Number.isInteger(envelope.version) || envelope.version < 1) throw new TypeError('envelope version must be a positive integer');
  return envelope;
}

export function makeEnvelope({ taskId, sender, recipient, kind, payload, previous = null, clock = () => new Date().toISOString() }) {
  const body = { task_id: taskId, sender, recipient, kind, version: previous ? previous.version + 1 : 1, payload, previous_hash: previous ? sha256(previous) : null };
  const envelope = { envelope_id: `env-${sha256(body).slice(0, 16)}`, ...body, created_at: clock() };
  return assertEnvelope(envelope);
}

export function makeEvidence({ taskId, action, result, dryRun, approved = false }) {
  const evidence = { task_id: taskId, action, result, dry_run: dryRun, approved, captured_at: new Date().toISOString() };
  return { ...evidence, evidence_id: `ev-${sha256(evidence).slice(0, 16)}`, hash: sha256(evidence) };
}
