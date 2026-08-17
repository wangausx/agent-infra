import { readFile, writeFile } from 'node:fs/promises';

const numeric = (value) => typeof value === 'number' && Number.isFinite(value);
const round = (value) => Number(value.toFixed(6));

export function computeWindowDrift(referenceEpisodes, currentEpisodes) {
  if (!Array.isArray(referenceEpisodes) || !Array.isArray(currentEpisodes)) throw new Error('drift windows must be arrays');
  const fields = ['immediate', 'delayed', 'recurrence'];
  const categorical = {};
  for (const field of fields) {
    const values = ['verified', 'rejected', 'unknown'];
    const distribution = (episodes) => Object.fromEntries(values.map((value) => [value, episodes.filter((episode) => episode.outcomes?.[field] === value).length / (episodes.length || 1)]));
    const before = distribution(referenceEpisodes);
    const after = distribution(currentEpisodes);
    categorical[field] = { reference: before, current: after, total_variation: round(values.reduce((sum, value) => sum + Math.abs(before[value] - after[value]), 0) / 2) };
  }
  const durations = (episodes) => episodes.map((episode) => episode.outcomes?.time_to_recovery_ms).filter(numeric);
  const beforeDurations = durations(referenceEpisodes);
  const afterDurations = durations(currentEpisodes);
  const mean = (values) => values.length ? values.reduce((sum, value) => sum + value, 0) / values.length : null;
  const beforeMean = mean(beforeDurations);
  const afterMean = mean(afterDurations);
  return {
    status: 'computed',
    reference_episodes: referenceEpisodes.length,
    current_episodes: currentEpisodes.length,
    categorical,
    performance: { reference_mean_time_to_recovery_ms: beforeMean === null ? null : round(beforeMean), current_mean_time_to_recovery_ms: afterMean === null ? null : round(afterMean), mean_delta_ms: beforeMean === null || afterMean === null ? null : round(afterMean - beforeMean) }
  };
}

export function buildQualityDashboard(episodes, { referenceWindow = null, currentWindow = null } = {}) {
  if (!Array.isArray(episodes)) throw new Error('episodes must be an array');
  const total = episodes.length;
  const count = (predicate) => episodes.filter(predicate).length;
  const rate = (value) => total ? Number((value / total).toFixed(6)) : 0;
  const labeled = count((e) => (e.outcome_labels ?? []).length > 0);
  const unknownOutcome = count((e) => (e.outcomes?.unknown_fields ?? []).length > 0);
  const evidenceFailures = count((e) => e.verification?.verdict !== 'PASS' || e.hypotheses?.evidence_complete !== true);
  const durations = episodes.map((e) => e.outcomes?.time_to_recovery_ms).filter(numeric);
  const distributions = Object.fromEntries(['immediate', 'delayed', 'recurrence'].map((field) => [field, Object.fromEntries(['verified', 'rejected', 'unknown'].map((value) => [value, count((e) => e.outcomes?.[field] === value)]))]));
  const labelAgreement = episodes.filter((e) => (e.outcome_labels ?? []).length > 1).map((e) => new Set(e.outcome_labels.map((label) => JSON.stringify(label.labels))).size === 1);
  const drift = referenceWindow && currentWindow ? computeWindowDrift(referenceWindow, currentWindow) : { status: 'not-computed', reason: 'requires two explicit approved time windows' };
  return {
    schema: 'agent-infra/episode-quality/v1',
    sample: { episodes: total, labeled, labeled_rate: rate(labeled) },
    completeness: { unknown_outcome_rate: rate(unknownOutcome), evidence_failure_rate: rate(evidenceFailures), complete_episode_rate: rate(count((e) => !(e.outcomes?.unknown_fields ?? []).length && e.hypotheses?.evidence_complete === true)) },
    safety: { rollback_rate: rate(count((e) => e.action?.rollback != null)), human_override_rate: rate(count((e) => e.outcomes?.human_override === 'verified')), production_write_attempts: count((e) => e.decision?.authority?.production_writes === true) },
    outcomes: distributions,
    labels: { multi_label_episodes: labelAgreement.length, agreement_rate: labelAgreement.length ? Number((labelAgreement.filter(Boolean).length / labelAgreement.length).toFixed(6)) : null },
    performance: { mean_time_to_recovery_ms: durations.length ? Number((durations.reduce((a, b) => a + b, 0) / durations.length).toFixed(3)) : null, observed_duration_samples: durations.length },
    drift
  };
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const input = process.argv[2];
  const output = process.argv[3];
  if (!input) throw new Error('usage: node src/episode-quality.mjs <episodes.jsonl> [output.json]');
  const episodes = (await readFile(input, 'utf8')).split(/\r?\n/).filter(Boolean).map(JSON.parse);
  const dashboard = buildQualityDashboard(episodes);
  const serialized = JSON.stringify(dashboard, null, 2) + '\n';
  if (output) await writeFile(output, serialized);
  console.log(serialized.trim());
}
