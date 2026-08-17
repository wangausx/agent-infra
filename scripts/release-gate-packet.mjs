import { createHash } from 'node:crypto';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';

const args = new Map(process.argv.slice(2).reduce((pairs, value, index, values) => value.startsWith('--') ? [...pairs, [value, values[index + 1]]] : pairs, []));
const root = path.resolve(args.get('--root') ?? process.cwd());
const output = path.resolve(args.get('--output') ?? path.join(root, 'release-gate-packet-v1.json'));
const required = ['datasets/assistive-shadow-v1.json', 'datasets/window-readiness-v1.json', 'datasets/snapshot-registry-v1.jsonl'];

async function load(relative) {
  const file = path.join(root, relative);
  try {
    const content = await readFile(file, 'utf8');
    return { path: relative, sha256: createHash('sha256').update(content).digest('hex'), value: relative.endsWith('.jsonl') ? content.trim().split('\n').filter(Boolean).map(JSON.parse) : JSON.parse(content) };
  } catch (error) {
    return { path: relative, missing: error.code === 'ENOENT', error: error.code === 'ENOENT' ? undefined : error.message };
  }
}

const artifacts = await Promise.all(required.map(load));
const shadow = artifacts.find((artifact) => artifact.path.endsWith('assistive-shadow-v1.json'))?.value;
const readiness = artifacts.find((artifact) => artifact.path.endsWith('window-readiness-v1.json'))?.value;
const registry = artifacts.find((artifact) => artifact.path.endsWith('snapshot-registry-v1.jsonl'))?.value ?? [];
const checks = {
  artifacts_present: artifacts.every((artifact) => !artifact.missing && !artifact.error),
  readiness_passed: readiness?.ready === true,
  training_eligible: Number(readiness?.eligible_episodes ?? 0) > 0,
  no_unsafe_authority: (shadow?.recommendations ?? []).every((recommendation) => recommendation.authority?.can_execute === false && recommendation.authority?.can_approve === false && recommendation.authority?.production_writes === false),
  registry_nonempty: registry.length > 0
};
const packet = {
  schema: 'agent-infra/release-gate-packet/v1',
  generated_at: new Date().toISOString(),
  mode: 'offline-review-only',
  promotable: Object.values(checks).every(Boolean),
  checks,
  artifacts,
  metrics: shadow?.metrics ?? null,
  readiness: readiness ?? null,
  registry_records: registry.length,
  blockers: Object.entries(checks).filter(([, passed]) => !passed).map(([name]) => name)
};
await mkdir(path.dirname(output), { recursive: true });
await writeFile(output, JSON.stringify(packet, null, 2) + '\n');
console.log(JSON.stringify({ output, promotable: packet.promotable, blockers: packet.blockers, artifacts: artifacts.length }));
process.exitCode = packet.promotable ? 0 : 2;
