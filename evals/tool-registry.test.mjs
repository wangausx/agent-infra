import test from 'node:test';
import assert from 'node:assert/strict';
import { ToolRegistry } from '../src/tool-registry.mjs';

test('tool registry enforces approval for side effects', async () => {
  const registry = new ToolRegistry();
  registry.register({ name: 'write-demo', sideEffect: true, execute: async (_, ctx) => ctx });
  const dry = await registry.call('write-demo', {}, { dryRun: true });
  assert.equal(dry.dryRun, true);
  await assert.rejects(() => registry.call('write-demo', {}, { dryRun: false }), /approval required/);
  const live = await registry.call('write-demo', {}, { dryRun: false, approved: true });
  assert.equal(live.approved, true);
});
