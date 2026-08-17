import { createHash } from 'node:crypto';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { assertReplayIntegrity } from './replay-audit.mjs';

const sha256 = (value) => createHash('sha256').update(value).digest('hex');
const identityKey = (identity) => typeof identity === 'string' ? identity : identity?.id ?? identity?.name ?? null;
const canonicalize = (value) => {
  if (Array.isArray(value)) return value.map(canonicalize);
  if (value && typeof value === 'object') return Object.fromEntries(Object.keys(value).sort().map((key) => [key, canonicalize(value[key])]));
  return value;
};

function episodeMetadata(episode) {
  if (!episode || typeof episode !== 'object') throw new Error('episode must be an object');
  if (!episode.episode_id || !episode.run_id || !episode.correlation_id) throw new Error('episode_id, run_id, and correlation_id are required');
  const observedAt = episode.context?.observed_at;
  if (!observedAt || Number.isNaN(Date.parse(observedAt))) throw new Error(`${episode.episode_id}: valid context.observed_at is required for temporal splits`);
  const identities = (episode.identities ?? []).map(identityKey).filter(Boolean);
  if (!identities.length) throw new Error(`${episode.episode_id}: at least one identity is required for leakage-safe splits`);
  if (episode.decision?.authority?.production_writes === true) throw new Error(`${episode.episode_id}: production_writes episodes cannot enter replay datasets`);
  return { observedAt, domain: episode.context?.scenario ?? 'unknown', identities };
}

function assertUniqueLineage(episodes) {
  const fields = ['episode_id', 'run_id', 'correlation_id'];
  for (const field of fields) {
    const seen = new Set();
    for (const episode of episodes) {
      if (seen.has(episode[field])) throw new Error(`duplicate ${field}: ${episode[field]}`);
      seen.add(episode[field]);
    }
  }
}

function validateSplitIsolation(splits) {
  const seen = new Map();
  for (const [split, episodes] of Object.entries(splits)) {
    for (const episode of episodes) {
      const keys = [
        `run:${episode.run_id}`,
        `correlation:${episode.correlation_id}`,
        `domain:${episode.context?.scenario ?? 'unknown'}`,
        ...(episode.identities ?? []).map(identityKey).filter(Boolean).map((id) => `identity:${id}`)
      ];
      for (const key of keys) {
        if (seen.has(key) && seen.get(key) !== split) throw new Error(`split leakage: ${key} appears in ${seen.get(key)} and ${split}`);
        seen.set(key, split);
      }
    }
  }
}

export function assignDatasetSplits(episodes) {
  if (!Array.isArray(episodes)) throw new Error('episodes must be an array');
  assertUniqueLineage(episodes);
  const groups = new Map();
  for (const episode of episodes) {
    const metadata = episodeMetadata(episode);
    // Keep each domain in one split; this prevents domain-specific behavior leaking across evaluation windows.
    const groupKey = metadata.domain;
    const group = groups.get(groupKey) ?? { episodes: [], observedAt: metadata.observedAt };
    group.episodes.push(episode);
    if (metadata.observedAt < group.observedAt) group.observedAt = metadata.observedAt;
    groups.set(groupKey, group);
  }
  const ordered = [...groups.values()].sort((a, b) => a.observedAt.localeCompare(b.observedAt) || a.episodes[0].episode_id.localeCompare(b.episodes[0].episode_id));
  const trainEnd = ordered.length < 3 ? ordered.length : Math.max(1, Math.floor(ordered.length * 0.6));
  const validationEnd = ordered.length < 3 ? ordered.length : Math.max(trainEnd + 1, Math.floor(ordered.length * 0.8));
  const splitFor = (index) => index < trainEnd ? 'train' : index < validationEnd ? 'validation' : 'test';
  const splits = { train: [], validation: [], test: [] };
  ordered.forEach((group, index) => splits[splitFor(index)].push(...group.episodes));
  for (const episodesInSplit of Object.values(splits)) episodesInSplit.sort((a, b) => a.episode_id.localeCompare(b.episode_id));
  validateSplitIsolation(splits);
  return splits;
}

export function buildDatasetSnapshot(episodes, { snapshotId = null, createdAt = null } = {}) {
  if (!Array.isArray(episodes)) throw new Error('episodes must be an array');
  assertReplayIntegrity(episodes);
  const splits = assignDatasetSplits(episodes);
  const productionWriteEpisodes = episodes.filter((episode) => episode.decision?.authority?.production_writes === true).length;
  const trainingEligible = episodes.filter((episode) => episode.dataset_membership?.status === 'approved' && episode.dataset_membership?.eligible_for_training === true);
  const trainingSplits = assignDatasetSplits(trainingEligible);
  const content = canonicalize({ episodes: [...episodes].sort((a, b) => a.episode_id.localeCompare(b.episode_id)), splits, trainingSplits });
  return {
    schema: 'agent-infra/dataset-snapshot/v1',
    snapshot_id: snapshotId ?? `snapshot-${sha256(JSON.stringify(content)).slice(0, 16)}`,
    created_at: createdAt ?? null,
    split_method: 'temporal-grouped-by-domain-with-lineage-isolation',
    sample: { episodes: episodes.length, train: splits.train.length, validation: splits.validation.length, test: splits.test.length },
    training_sample: { eligible_episodes: trainingEligible.length, train: trainingSplits.train.length, validation: trainingSplits.validation.length, test: trainingSplits.test.length },
    lineage: { episode_ids: episodes.map((episode) => episode.episode_id).sort(), run_ids: [...new Set(episodes.map((episode) => episode.run_id))].sort() },
    safety: { production_write_episodes: productionWriteEpisodes, replay_integrity: 'passed' },
    splits,
    training_splits: trainingSplits,
    content_sha256: sha256(JSON.stringify(content))
  };
}

export async function writeDatasetSnapshot(snapshot, outputDir) {
  await mkdir(outputDir, { recursive: true });
  await writeFile(path.join(outputDir, 'snapshot.json'), JSON.stringify({ ...snapshot, splits: undefined }, null, 2).replace(',\n  "splits": null', '') + '\n');
  for (const [split, episodes] of Object.entries(snapshot.splits)) await writeFile(path.join(outputDir, `${split}.jsonl`), episodes.map((episode) => JSON.stringify(episode)).join('\n') + (episodes.length ? '\n' : ''));
  for (const [split, episodes] of Object.entries(snapshot.training_splits)) await writeFile(path.join(outputDir, `training-${split}.jsonl`), episodes.map((episode) => JSON.stringify(episode)).join('\n') + (episodes.length ? '\n' : ''));
  return outputDir;
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const input = process.argv[2];
  const outputDir = process.argv[3] ?? 'artifacts/datasets/snapshot-v1';
  if (!input) throw new Error('usage: node src/dataset-snapshot.mjs <episodes.jsonl> [output-dir]');
  const episodes = (await readFile(input, 'utf8')).split(/\r?\n/).filter(Boolean).map((line, index) => {
    try { return JSON.parse(line); } catch (error) { throw new Error(`${input}:${index + 1}: invalid JSON (${error.message})`); }
  });
  const snapshot = buildDatasetSnapshot(episodes);
  await writeDatasetSnapshot(snapshot, outputDir);
  console.log(JSON.stringify({ snapshot_id: snapshot.snapshot_id, episodes: snapshot.sample.episodes, output_dir: path.resolve(outputDir), content_sha256: snapshot.content_sha256 }));
}
