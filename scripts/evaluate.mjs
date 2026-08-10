import assert from 'node:assert/strict';
import { runStaleWorkerScenario, ALLOWED_ACTIONS } from '../scenarios/closed-loop-demo/stale-worker.mjs';
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

const scenarioCases = [
  ['stale-worker success', { caseName: 'success', seed: 'mvp-success', dryRun: false, approved: true }, 'verified'],
  ['approval pause', { caseName: 'approval', seed: 'mvp-approval', dryRun: false, approved: false }, 'awaiting-approval'],
  ['executor failure rollback', { caseName: 'executor-failure', seed: 'mvp-executor-failure' }, 'rejected'],
  ['verifier rejection rollback', { caseName: 'verifier-rejection', seed: 'mvp-verifier-failure' }, 'rejected'],
  ['rollback failure evidence', { caseName: 'rollback-failure', seed: 'mvp-rollback-failure' }, 'rejected']
];
for (const [name, options, expected] of scenarioCases) {
  const result = await runStaleWorkerScenario(options);
  assert.equal(result.status, expected, `${name}: status`);
  assert.equal(result.production_writes, false, `${name}: production writes`);
  assert.ok(result.report_hash.startsWith('sha256:'), `${name}: report hash`);
  if (name.includes('success')) {
    assert.equal(result.final_state.worker, 'running', `${name}: worker recovered`);
    assert.ok(result.handoffs.length >= 4, `${name}: handoff lineage`);
    assert.equal(result.roles.join('>'), 'planner>executor>verifier>consolidator', `${name}: roles`);
    const replay = await runStaleWorkerScenario(options);
    assert.equal(replay.run_id, result.run_id, `${name}: deterministic run id`);
    assert.equal(replay.report_hash, result.report_hash, `${name}: deterministic report`);
  }
  if (name.includes('rollback') && !name.includes('failure evidence')) assert.equal(result.rollback.restored, true, `${name}: restored`);
  if (name.includes('rollback failure')) assert.equal(result.rollback.restored, false, `${name}: failure preserved`);
  console.log(`PASS ${name}: ${result.status}`);
}
await assert.rejects(() => runStaleWorkerScenario({ seed: '', caseName: 'success' }), /seed is required/);
await assert.rejects(() => runStaleWorkerScenario({ seed: 'mvp-invalid', caseName: 'unknown' }), /unsupported scenario case/);
assert.deepEqual([...ALLOWED_ACTIONS], ['restart-stale-worker']);
console.log(`PASS scenario matrix: ${scenarioCases.length} cases + invalid-input checks`);
console.log(`PASS ${cases.length + scenarioCases.length} evaluation cases`);
