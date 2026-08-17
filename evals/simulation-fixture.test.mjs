import assert from 'node:assert/strict';
import { mkdtemp, readFile } from 'node:fs/promises';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import test from 'node:test';

const rootDir = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..');

test('simulation fixture reaches readiness and release-gate promotion without production writes', async () => {
  const output = await mkdtemp('/tmp/agent-infra-simulation-test-');
  const fixture = spawnSync(process.execPath, ['scripts/simulate-learning-fixture.mjs', output], { cwd: rootDir, encoding: 'utf8' });
  assert.equal(fixture.status, 0, fixture.stderr);
  const ledger = path.join(output, 'outcome-label-ledger.jsonl');
  const flywheel = spawnSync(process.execPath, ['scripts/learning-flywheel.mjs', '--root', output, '--runs-root', path.join(output, 'runs'), '--ledger', ledger, '--approve', 'true'], { cwd: rootDir, encoding: 'utf8' });
  assert.equal(flywheel.status, 0, flywheel.stderr);
  const packet = spawnSync(process.execPath, ['scripts/release-gate-packet.mjs', '--root', output], { cwd: rootDir, encoding: 'utf8' });
  assert.equal(packet.status, 0, packet.stderr);
  const readiness = JSON.parse(await readFile(path.join(output, 'datasets/window-readiness-v1.json'), 'utf8'));
  const release = JSON.parse(await readFile(path.join(output, 'release-gate-packet-v1.json'), 'utf8'));
  assert.deepEqual({ ready: readiness.ready, eligible: readiness.eligible_episodes, windows: readiness.windows, domains: readiness.domains }, { ready: true, eligible: 3, windows: 3, domains: 3 });
  assert.equal(release.promotable, true);
  assert.equal(release.mode, 'offline-review-only');
  assert.equal(release.checks.no_unsafe_authority, true);
});
