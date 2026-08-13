import assert from 'node:assert/strict';
import test from 'node:test';
import { InMemoryRuntimeAdapter, runRuntimeConformance } from '../src/runtime-adapter-conformance.mjs';

test('M4 runtime adapter conformance covers lifecycle and restart adoption', async () => {
  const result = await runRuntimeConformance(new InMemoryRuntimeAdapter());
  assert.equal(result.status, 'PASS');
  assert.equal(result.task_id, 'conformance-task');
});

test('M4 runtime adapter conformance rejects incomplete adapters', async () => {
  await assert.rejects(() => runRuntimeConformance({}), /runtime adapter missing/);
});
