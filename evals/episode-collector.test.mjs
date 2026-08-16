import assert from 'node:assert/strict';
import { mkdtemp, mkdir, readFile, writeFile, cp, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { collectEpisodeFromRun, collectEpisodes } from '../src/episode-collector.mjs';

const fixture = path.resolve('artifacts/runs/run-e921dfe97489eb24');

test('collector accepts a hash-bound run and preserves unknown outcomes', async () => {
  const episode = await collectEpisodeFromRun(fixture);
  assert.equal(episode.status, 'accepted');
  assert.equal(episode.schema, 'agent-infra/operational-episode/v1');
  assert.equal(episode.run_id, 'run-e921dfe97489eb24');
  assert.equal(episode.verification.verdict, 'PASS');
  assert.equal(episode.outcomes.immediate, 'verified');
  assert.equal(episode.outcomes.delayed, 'unknown');
  assert.equal(episode.dataset_membership.eligible_for_training, false);
  assert.equal(episode.decision.authority.production_writes, false);
});

test('collector quarantines tampered artifacts and does not emit an episode', async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), 'episode-collector-'));
  const runsRoot = path.join(root, 'runs');
  const tampered = path.join(runsRoot, 'tampered-run');
  await mkdir(runsRoot, { recursive: true });
  await cp(fixture, tampered, { recursive: true });
  await writeFile(path.join(tampered, 'action-result.json'), '{"executed":false}\n');
  const result = await collectEpisodes({ runsRoot });
  assert.equal(result.episodes.length, 0);
  assert.equal(result.quarantined.length, 1);
  assert.equal(result.quarantined[0].reason, 'artifact-integrity-failed');
  await rm(root, { recursive: true, force: true });
});

test('collector writes deterministic JSONL and repeated collection is idempotent', async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), 'episode-collector-'));
  const runsRoot = path.join(root, 'runs');
  const run = path.join(runsRoot, 'run-e921dfe97489eb24');
  await mkdir(runsRoot, { recursive: true });
  await cp(fixture, run, { recursive: true });
  const outputPath = path.join(root, 'dataset', 'episodes.jsonl');
  const quarantinePath = path.join(root, 'dataset', 'quarantine.jsonl');
  const first = await collectEpisodes({ runsRoot, outputPath, quarantinePath });
  const firstOutput = await readFile(outputPath, 'utf8');
  const second = await collectEpisodes({ runsRoot, outputPath, quarantinePath });
  assert.equal(first.episodes.length, 1);
  assert.equal(second.episodes.length, 1);
  assert.equal(await readFile(outputPath, 'utf8'), firstOutput);
  assert.equal((await readFile(outputPath, 'utf8')).trim().split('\n').length, 1);
  assert.equal(await readFile(quarantinePath, 'utf8'), '');
  await rm(root, { recursive: true, force: true });
});

test('collector handles empty input, malformed manifests, and partial failure without silent loss', async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), 'episode-collector-'));
  const runsRoot = path.join(root, 'runs');
  await mkdir(runsRoot, { recursive: true });
  const empty = await collectEpisodes({ runsRoot });
  assert.deepEqual(empty, { episodes: [], quarantined: [] });

  await mkdir(path.join(runsRoot, 'malformed'), { recursive: true });
  await writeFile(path.join(runsRoot, 'malformed', 'evidence-manifest.json'), '{not-json}\n');
  await cp(fixture, path.join(runsRoot, 'good'), { recursive: true });
  const partial = await collectEpisodes({ runsRoot });
  assert.equal(partial.episodes.length, 1);
  assert.equal(partial.quarantined.length, 1);
  assert.equal(partial.quarantined[0].reason, 'manifest-unreadable');
  await rm(root, { recursive: true, force: true });
});
