import { approveForTraining } from './episode-governance.mjs';
import { appendFile, readFile, writeFile } from 'node:fs/promises';

const LABEL_VALUES = new Set(['verified', 'rejected', 'unknown']);
const LABEL_FIELDS = ['delayed', 'recurrence', 'collateral_impact', 'human_override', 'business_impact'];

export function createOutcomeLabel({ labelId, episodeId, reviewer, labeledAt, labels, evidenceRefs = [], overturned = false }) {
  if (!labelId || !episodeId || !reviewer || !labeledAt) throw new Error('label_id, episode_id, reviewer, and labeled_at are required');
  if (!labels || typeof labels !== 'object') throw new Error('labels are required');
  for (const field of LABEL_FIELDS) if (!LABEL_VALUES.has(labels[field])) throw new Error(`labels.${field} must be verified, rejected, or unknown`);
  if (!Array.isArray(evidenceRefs)) throw new Error('evidence_refs must be an array');
  return { schema: 'agent-infra/outcome-label/v1', label_id: labelId, episode_id: episodeId, reviewer, labeled_at: labeledAt, labels, evidence_refs: evidenceRefs, overturned: Boolean(overturned) };
}

export function applyOutcomeLabel(episode, label) {
  if (label.episode_id !== episode.episode_id) throw new Error('label episode_id does not match episode');
  const validated = createOutcomeLabel({ labelId: label.label_id, episodeId: label.episode_id, reviewer: label.reviewer, labeledAt: label.labeled_at, labels: label.labels, evidenceRefs: label.evidence_refs, overturned: label.overturned });
  const outcomes = { ...episode.outcomes };
  for (const field of LABEL_FIELDS) outcomes[field] = validated.labels[field];
  outcomes.unknown_fields = LABEL_FIELDS.filter((field) => outcomes[field] === 'unknown');
  return { ...episode, outcomes, outcome_labels: [...(episode.outcome_labels ?? []), validated] };
}

export async function appendOutcomeLabel(ledgerPath, label) {
  const validated = createOutcomeLabel({
    labelId: label.labelId ?? label.label_id,
    episodeId: label.episodeId ?? label.episode_id,
    reviewer: label.reviewer,
    labeledAt: label.labeledAt ?? label.labeled_at,
    labels: label.labels,
    evidenceRefs: label.evidenceRefs ?? label.evidence_refs,
    overturned: label.overturned
  });
  let existing = [];
  try { existing = (await readFile(ledgerPath, 'utf8')).split(/\r?\n/).filter(Boolean).map(JSON.parse); } catch (error) { if (error.code !== 'ENOENT') throw error; }
  if (existing.some((row) => row.label_id === validated.label_id)) throw new Error(`duplicate label_id: ${validated.label_id}`);
  await appendFile(ledgerPath, JSON.stringify(validated) + '\n');
  return validated;
}

export async function applyLedgerToEpisodes(episodes, ledgerPath, { approve = false } = {}) {
  let labels = [];
  try { labels = (await readFile(ledgerPath, 'utf8')).split(/\r?\n/).filter(Boolean).map(JSON.parse); } catch (error) { if (error.code !== 'ENOENT') throw error; }
  const byEpisode = new Map();
  for (const label of labels) {
    if (label.overturned) continue;
    const current = byEpisode.get(label.episode_id);
    if (!current || current.labeled_at < label.labeled_at) byEpisode.set(label.episode_id, label);
  }
  return episodes.map((episode) => {
    const label = byEpisode.get(episode.episode_id);
    if (!label) return episode;
    const labeled = applyOutcomeLabel(episode, label);
    return approve ? approveForTraining(labeled, { reviewer: label.reviewer, reviewedAt: label.labeled_at, labels: label.labels }) : labeled;
  });
}

export async function writeLabeledEpisodes(path, episodes) {
  await writeFile(path, episodes.map((episode) => JSON.stringify(episode)).join('\n') + (episodes.length ? '\n' : ''));
}
