const TOP_LEVEL_KEYS = [
  'schema', 'episode_id', 'run_id', 'correlation_id', 'source', 'context',
  'identities', 'claims', 'observations', 'hypotheses', 'decision', 'action',
  'verification', 'outcomes', 'versions', 'privacy', 'dataset_membership'
];
const OUTCOME_VALUES = new Set(['verified', 'rejected', 'unknown']);
const PRIVACY_CLASSIFICATIONS = new Set(['internal-synthetic', 'internal-sensitive', 'restricted', 'public']);
const REDACTION_STATUSES = new Set(['not-reviewed', 'not-required', 'required', 'complete']);
const DATASET_STATUSES = new Set(['pending-review', 'quarantined', 'approved', 'rejected']);

import { validateClaims } from './episode-claims.mjs';

const isObject = (value) => value !== null && typeof value === 'object' && !Array.isArray(value);

export function validateEpisode(episode) {
  const errors = [];
  if (!isObject(episode)) return ['episode must be an object'];
  for (const key of TOP_LEVEL_KEYS) if (!(key in episode)) errors.push(`missing top-level field: ${key}`);
  for (const key of ['episode_id', 'run_id', 'correlation_id']) {
    if (typeof episode[key] !== 'string' || !episode[key]) errors.push(`${key} must be a non-empty string`);
  }
  if (episode.schema !== 'agent-infra/operational-episode/v1') errors.push('unsupported episode schema');
  if (!isObject(episode.source) || !Array.isArray(episode.source.files) || !isObject(episode.source.sha256)) errors.push('source must contain files and sha256');
  if (!Array.isArray(episode.identities)) errors.push('identities must be an array');
  errors.push(...validateClaims(episode.claims, episode.source?.files ?? []));
  for (const section of ['observations', 'hypotheses', 'decision', 'action', 'verification', 'outcomes', 'versions', 'privacy', 'dataset_membership']) {
    if (!isObject(episode[section])) errors.push(`${section} must be an object`);
  }
  if (isObject(episode.outcomes)) {
    for (const field of ['immediate', 'delayed', 'recurrence', 'collateral_impact', 'human_override', 'business_impact']) {
      if (!OUTCOME_VALUES.has(episode.outcomes[field])) errors.push(`outcomes.${field} must be verified, rejected, or unknown`);
    }
    if (!Array.isArray(episode.outcomes.unknown_fields)) errors.push('outcomes.unknown_fields must be an array');
  }
  if (isObject(episode.privacy)) {
    if (!PRIVACY_CLASSIFICATIONS.has(episode.privacy.classification)) errors.push('unsupported privacy classification');
    if (!REDACTION_STATUSES.has(episode.privacy.redaction_status)) errors.push('unsupported redaction status');
    if (!Number.isInteger(episode.privacy.retention_days) || episode.privacy.retention_days <= 0) errors.push('privacy.retention_days must be a positive integer');
    if (!Array.isArray(episode.privacy.access_roles) || episode.privacy.access_roles.length === 0) errors.push('privacy.access_roles must be non-empty');
  }
  if (isObject(episode.dataset_membership)) {
    if (!DATASET_STATUSES.has(episode.dataset_membership.status)) errors.push('unsupported dataset membership status');
    if (episode.dataset_membership.eligible_for_training !== (episode.dataset_membership.status === 'approved')) errors.push('training eligibility must match approved dataset status');
  }
  return errors;
}

export function assertValidEpisode(episode) {
  const errors = validateEpisode(episode);
  if (errors.length) throw new Error(`episode contract invalid: ${errors.join('; ')}`);
  return episode;
}

export const episodeContract = Object.freeze({
  schema: 'agent-infra/operational-episode/v1',
  topLevelFields: TOP_LEVEL_KEYS,
  outcomeValues: [...OUTCOME_VALUES],
  privacyClassifications: [...PRIVACY_CLASSIFICATIONS],
  datasetStatuses: [...DATASET_STATUSES]
});
