import { readFile } from 'node:fs/promises';

function numberOrNull(value) {
  return typeof value === 'number' && Number.isFinite(value) ? value : null;
}

export function buildIncumbentBaseline(episodes) {
  if (!Array.isArray(episodes)) throw new Error('episodes must be an array');
  const total = episodes.length;
  const verified = episodes.filter((e) => e.outcomes?.immediate === 'verified').length;
  const rejected = episodes.filter((e) => e.outcomes?.immediate === 'rejected').length;
  const delayedUnknown = episodes.filter((e) => e.outcomes?.delayed === 'unknown').length;
  const productionWriteAttempts = episodes.filter((e) => e.decision?.authority?.production_writes === true).length;
  const rollbackObserved = episodes.filter((e) => e.action?.rollback != null).length;
  const durations = episodes.map((e) => numberOrNull(e.outcomes?.time_to_recovery_ms)).filter((value) => value !== null);
  const evidenceComplete = episodes.filter((e) => e.hypotheses?.evidence_complete === true).length;
  const rate = (count) => total ? Number((count / total).toFixed(6)) : 0;
  return {
    schema: 'agent-infra/incumbent-baseline/v1',
    method: 'deterministic-policy-and-verifier-outcomes',
    sample: { episodes: total, verified, rejected },
    outcome_rates: { verified: rate(verified), rejected: rate(rejected), delayed_unknown: rate(delayedUnknown) },
    safety: { production_write_attempts: productionWriteAttempts, production_write_attempt_rate: rate(productionWriteAttempts) },
    recovery: {
      rollback_observed: rollbackObserved,
      rollback_rate: rate(rollbackObserved),
      mean_time_to_recovery_ms: durations.length ? Number((durations.reduce((a, b) => a + b, 0) / durations.length).toFixed(3)) : null,
      observed_duration_samples: durations.length
    },
    evidence: { complete_hypothesis_rate: rate(evidenceComplete) },
    limitations: ['delayed outcomes are not yet labeled', 'baseline is observational and not causal', 'single-run samples are insufficient for promotion']
  };
}

export async function buildIncumbentBaselineFromJsonl(path) {
  const text = await readFile(path, 'utf8');
  const episodes = text.split(/\r?\n/).filter(Boolean).map((line, index) => {
    try { return JSON.parse(line); } catch (error) { throw new Error(`${path}:${index + 1}: invalid JSON (${error.message})`); }
  });
  return buildIncumbentBaseline(episodes);
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const input = process.argv[2];
  if (!input) throw new Error('usage: node src/incumbent-baseline.mjs <episodes.jsonl> [output.json]');
  const output = process.argv[3];
  const baseline = await buildIncumbentBaselineFromJsonl(input);
  const serialized = JSON.stringify(baseline, null, 2) + '\n';
  if (output) await (await import('node:fs/promises')).writeFile(output, serialized);
  console.log(serialized.trim());
}
