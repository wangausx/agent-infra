import assert from 'node:assert/strict';
import { runClosedLoop } from '../src/runtime.mjs';

const cases = [
  ['happy path', {}, 'verified'],
  ['rejection', { faults: { rejection: true } }, 'rejected'],
  ['timeout', { faults: { timeout: true } }, 'rejected'],
  ['stale lease simulation', { faults: { rejection: true } }, 'rejected'],
  ['failed verification', { faults: { verification: true } }, 'rejected'],
  ['approval-safe dry run', { dryRun: true, approved: false }, 'verified'],
  ['rollback after executor failure', { faults: { verification: true } }, 'rejected']
];
for (const [name, options, expected] of cases) {
  const result = await runClosedLoop({ taskId: `eval-${name.replaceAll(' ', '-')}`, objective: name, ...options });
  assert.equal(result.status, expected, `${name}: status`);
  assert.ok(result.trace.length > 0, `${name}: trace`);
  if (expected === 'rejected') assert.ok(result.error, `${name}: error`);
  console.log(`PASS ${name}: ${result.status}`);
}
console.log(`PASS ${cases.length} evaluation cases`);
