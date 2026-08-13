import assert from 'node:assert/strict';
import test from 'node:test';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { fileURLToPath } from 'node:url';

const run = promisify(execFile);
const cwd = fileURLToPath(new URL('..', import.meta.url));

test('M4 zero-touch failure matrix executes all declared cases', async () => {
  const { stdout } = await run(process.execPath, ['scripts/zero-touch.mjs', 'failure-matrix'], { cwd, maxBuffer: 1024 * 1024 });
  const matrix = JSON.parse(stdout);
  assert.equal(matrix.schema, 'agent-infra/failure-matrix/v1');
  assert.equal(matrix.status, 'PASS');
  assert.equal(matrix.cases.length, 10);
  assert.ok(matrix.cases.every((item) => item.status === 'PASS'));
  assert.deepEqual(matrix.cases.map((item) => item.case_id), [
    'duplicate-alerts-only', 'false-rca-hypothesis', 'executor-failure', 'verifier-failure',
    'rollback-failure', 'approval-pause', 'stale-lease-restart', 'new-alert-during-recovery',
    'malformed-alert', 'empty-input'
  ]);
});
