import assert from 'node:assert/strict';
import test from 'node:test';
import { ToolResponseRecorder, canonicalJson } from '../src/replay/tool-response-recorder.mjs';

test('tool response recorder persists requests and replays without invoking tools', async () => {
  const recorder = new ToolResponseRecorder();
  let calls = 0;
  const response = await recorder.call('fixture.read', { z: 2, a: 1 }, async () => { calls += 1; return { value: 42, nested: { b: 2, a: 1 } }; });
  assert.equal(calls, 1);
  const recording = recorder.finish();
  assert.deepEqual(recording.entries[0].request, { a: 1, z: 2 });

  const replay = new ToolResponseRecorder({ recording, mode: 'replay' });
  const replayed = await replay.call('fixture.read', { a: 1, z: 2 }, async () => { throw new Error('offline replay invoked the tool'); });
  replay.finish();
  assert.equal(canonicalJson(replayed), canonicalJson(response));
});

test('tool response replay rejects request drift and unused responses', async () => {
  const recorder = new ToolResponseRecorder();
  await recorder.call('fixture.read', { id: 'one' }, async () => ({ ok: true }));
  const recording = recorder.finish();
  const replay = new ToolResponseRecorder({ recording, mode: 'replay' });
  await assert.rejects(() => replay.call('fixture.read', { id: 'two' }, async () => ({})), /replay request mismatch/);
  assert.throws(() => replay.finish(), /unused/);
});
