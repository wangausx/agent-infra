import { readFile, mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { collectEpisodes } from '../src/episode-collector.mjs';
import { buildDatasetSnapshot, writeDatasetSnapshot } from '../src/dataset-snapshot.mjs';
import { evaluateShadowBatch } from '../src/assistive-shadow.mjs';
import { appendSnapshotRegistry } from '../src/snapshot-registry.mjs';
import { applyLedgerToEpisodes, writeLabeledEpisodes } from '../src/outcome-label-ledger.mjs';
import { assessWindowReadiness } from '../src/window-readiness.mjs';

const args = new Map();
for (let index = 2; index < process.argv.length; index += 2) args.set(process.argv[index], process.argv[index + 1]);
const root = path.resolve(args.get('--root') ?? 'artifacts');
const runsRoot = args.get('--runs-root') ?? path.join(root, 'runs');
const datasetDir = args.get('--dataset-dir') ?? path.join(root, 'datasets/snapshot-v1');
const episodesPath = args.get('--episodes') ?? path.join(root, 'datasets/episodes-v1.jsonl');
const quarantinePath = args.get('--quarantine') ?? path.join(root, 'datasets/quarantine-v1.jsonl');
const registryPath = args.get('--registry') ?? path.join(root, 'datasets/snapshot-registry-v1.jsonl');
const shadowPath = args.get('--shadow') ?? path.join(root, 'datasets/assistive-shadow-v1.json');
const ledgerPath = args.get('--ledger');
const approve = args.get('--approve') === 'true';
const readinessPath = args.get('--readiness') ?? path.join(root, 'datasets/window-readiness-v1.json');

await mkdir(runsRoot, { recursive: true });
const collected = await collectEpisodes({ runsRoot, outputPath: episodesPath, quarantinePath });
const labeledEpisodes = ledgerPath ? await applyLedgerToEpisodes(collected.episodes, ledgerPath, { approve }) : collected.episodes;
if (ledgerPath) await writeLabeledEpisodes(episodesPath, labeledEpisodes);
const snapshot = buildDatasetSnapshot(labeledEpisodes);
await writeDatasetSnapshot(snapshot, datasetDir);
await appendSnapshotRegistry(registryPath, {
  snapshot_id: snapshot.snapshot_id,
  content_sha256: snapshot.content_sha256,
  episode_ids: snapshot.lineage.episode_ids,
  approval_state: snapshot.training_sample.eligible_episodes ? 'approved' : 'pending-review',
  source_episodes_path: episodesPath,
  training_sample: snapshot.training_sample
});
const evaluation = evaluateShadowBatch(labeledEpisodes);
const readiness = assessWindowReadiness(labeledEpisodes);
await mkdir(path.dirname(shadowPath), { recursive: true });
await writeFile(shadowPath, JSON.stringify(evaluation, null, 2) + '\n');
await writeFile(readinessPath, JSON.stringify(readiness, null, 2) + '\n');
console.log(JSON.stringify({
  accepted: collected.episodes.length,
  quarantined: collected.quarantined.length,
  snapshot_id: snapshot.snapshot_id,
  training_eligible: snapshot.training_sample.eligible_episodes,
  shadow_recommendations: evaluation.sample.recommendations,
  readiness,
  registry: registryPath,
  shadow: shadowPath,
  readiness_artifact: readinessPath
}));
