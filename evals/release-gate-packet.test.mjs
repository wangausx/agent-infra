import assert from 'node:assert/strict';
import { mkdtemp, mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import test from 'node:test';

const script = path.resolve('scripts/release-gate-packet.mjs');

async function fixture({ ready, eligible }) {
  const root = await mkdtemp('/tmp/agent-infra-release-gate-');
  await mkdir(path.join(root, 'datasets'), { recursive: true });
  await writeFile(path.join(root, 'datasets', 'assistive-shadow-v1.json'), JSON.stringify({
    recommendations: [{ authority: { can_execute: false, can_approve: false, production_writes: false } }],
    metrics: { precision: null, recall: null }
  }));
  await writeFile(path.join(root, 'datasets', 'window-readiness-v1.json'), JSON.stringify({ ready, eligible_episodes: eligible }));
  await writeFile(path.join(root, 'datasets', 'snapshot-registry-v1.jsonl'), JSON.stringify({ snapshot_id: 'snapshot-fixture' }) + '\n');
  return root;
}

function run(root) {
  return spawnSync(process.execPath, [script, '--root', root, '--output', path.join(root, 'packet.json')], { encoding: 'utf8' });
}

test('release packet blocks an unready corpus', async () => {
  const result = run(await fixture({ ready: false, eligible: 0 }));
  assert.equal(result.status, 2);
  assert.match(result.stdout, /"promotable":false/);
});

test('release packet permits a synthetic corpus meeting every offline check', async () => {
  const result = run(await fixture({ ready: true, eligible: 3 }));
  assert.equal(result.status, 0);
  assert.match(result.stdout, /"promotable":true/);
});
