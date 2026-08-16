const CLASSIFICATION_POLICY = Object.freeze({
  'internal-synthetic': { retention_days: 30, redaction_status: 'not-required', access_roles: ['agent-infra-reviewer'] },
  'internal-sensitive': { retention_days: 30, redaction_status: 'required', access_roles: ['agent-infra-reviewer', 'privacy-reviewer'] },
  restricted: { retention_days: 7, redaction_status: 'required', access_roles: ['privacy-reviewer'] },
  public: { retention_days: 365, redaction_status: 'not-required', access_roles: ['agent-infra-reviewer'] }
});

export function applyGovernance(episode, { classification = 'internal-synthetic', reviewer = null, reviewedAt = null } = {}) {
  const policy = CLASSIFICATION_POLICY[classification];
  if (!policy) throw new Error(`unsupported privacy classification: ${classification}`);
  const reviewed = Boolean(reviewer && reviewedAt);
  return {
    ...episode,
    privacy: {
      ...episode.privacy,
      classification,
      redaction_status: policy.redaction_status,
      retention_days: policy.retention_days,
      access_roles: [...policy.access_roles],
      retention_status: reviewed ? 'reviewed' : 'pending-review',
      reviewed_by: reviewer,
      reviewed_at: reviewedAt
    },
    dataset_membership: {
      ...episode.dataset_membership,
      status: 'pending-review',
      eligible_for_training: false,
      governance_review: reviewed ? 'complete' : 'required'
    }
  };
}

export function approveForTraining(episode, { reviewer, reviewedAt, labels } = {}) {
  if (!reviewer || !reviewedAt) throw new Error('human reviewer and review timestamp are required');
  if (episode.privacy.redaction_status === 'required') throw new Error('redaction must be complete before training approval');
  if (episode.outcomes.delayed === 'unknown') throw new Error('delayed outcome must be labeled before training approval');
  if (!labels || typeof labels !== 'object') throw new Error('human outcome labels are required');
  return {
    ...episode,
    dataset_membership: {
      ...episode.dataset_membership,
      status: 'approved',
      eligible_for_training: true,
      approved_by: reviewer,
      approved_at: reviewedAt,
      labels
    }
  };
}

export function quarantineEpisode(episode, reason) {
  if (!reason) throw new Error('quarantine reason is required');
  return {
    ...episode,
    dataset_membership: {
      ...episode.dataset_membership,
      status: 'quarantined',
      eligible_for_training: false,
      quarantine_reason: reason
    }
  };
}

export const classificationPolicy = CLASSIFICATION_POLICY;
