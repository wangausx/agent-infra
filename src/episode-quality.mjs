import { readFile, writeFile } from 'node:fs/promises';
export function buildQualityDashboard(episodes) {
  if (!Array.isArray(episodes)) throw new Error('episodes must be an array');
  const total = episodes.length;
  const count = (predicate) => episodes.filter(predicate).length;
  const rate = (value) => total ? Number((value / total).toFixed(6)) : 0;
  const labeled = count((e) => (e.outcome_labels ?? []).length > 0);
  const unknownOutcome = count((e) => (e.outcomes?.unknown_fields ?? []).length > 0);
  const evidenceFailures = count((e) => e.verification?.verdict !== 'PASS' || e.hypotheses?.evidence_complete !== true);
  const durations = episodes.map((e) => e.outcomes?.time_to_recovery_ms).filter((v) => Number.isFinite(v));
  const distributions = Object.fromEntries(['immediate', 'delayed', 'recurrence'].map((field) => [field, Object.fromEntries(['verified', 'rejected', 'unknown'].map((value) => [value, count((e) => e.outcomes?.[field] === value)]))]));
  const labelAgreement = episodes.filter((e) => (e.outcome_labels ?? []).length > 1).map((e) => {
    const rows = e.outcome_labels.map((label) => JSON.stringify(label.labels));
    return new Set(rows).size === 1;
  });
  return {
    schema: 'agent-infra/episode-quality/v1',
    sample: { episodes: total, labeled, labeled_rate: rate(labeled) },
    completeness: { unknown_outcome_rate: rate(unknownOutcome), evidence_failure_rate: rate(evidenceFailures), complete_episode_rate: rate(count((e) => !(e.outcomes?.unknown_fields ?? []).length && e.hypotheses?.evidence_complete === true)) },
    safety: { rollback_rate: rate(count((e) => e.action?.rollback != null)), human_override_rate: rate(count((e) => e.outcomes?.human_override === 'verified')), production_write_attempts: count((e) => e.decision?.authority?.production_writes === true) },
    outcomes: distributions,
    labels: { multi_label_episodes: labelAgreement.length, agreement_rate: labelAgreement.length ? Number((labelAgreement.filter(Boolean).length / labelAgreement.length).toFixed(6)) : null },
    performance: { mean_time_to_recovery_ms: durations.length ? Number((durations.reduce((a, b) => a + b, 0) / durations.length).toFixed(3)) : null, observed_duration_samples: durations.length },
    drift: { status: 'not-computed', reason: 'requires at least two approved time windows' }
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
