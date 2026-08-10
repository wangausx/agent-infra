import test from 'node:test';
import assert from 'node:assert/strict';
import { assertEnvelope, makeEnvelope, makeEvidence } from '../src/contracts.mjs';
import { planner, verifier } from '../src/agents.mjs';
import { RollbackStack } from '../src/rollback.mjs';
import { Trace } from '../src/trace.mjs';
import { MissionControlClient } from '../src/mission-control-client.mjs';
import { runClosedLoop } from '../src/runtime.mjs';

test('context envelopes are versioned and chained', () => {
  const first = makeEnvelope({ taskId: 't', sender: 'planner', recipient: 'executor', kind: 'plan', payload: { x: 1 } });
  const second = makeEnvelope({ taskId: 't', sender: 'executor', recipient: 'verifier', kind: 'evidence', payload: { x: 2 }, previous: first });
  assert.equal(second.version, 2); assert.equal(second.previous_hash.length, 64); assert.doesNotThrow(() => assertEnvelope(second));
});

test('invalid envelope is rejected', () => assert.throws(() => assertEnvelope({ sender: 'planner' }), /missing envelope field/));

test('evidence is hashed and dry-run safe', () => { const e = makeEvidence({ taskId: 't', action: 'x', result: { status: 'simulated' }, dryRun: true }); assert.equal(e.hash.length, 64); assert.equal(e.dry_run, true); });

test('planner emits three ordered roles', () => { const out = planner({ taskId: 't', objective: 'x', trace: new Trace() }); assert.deepEqual(out.plan.steps.map((s) => s.role), ['executor','executor','verifier']); });

test('verifier rejects missing evidence', () => { const plan = { steps: [{ role: 'executor' }] }; const out = verifier({ taskId: 't', plan, evidence: [], trace: new Trace() }); assert.equal(out.result.verdict, 'FAIL'); });

test('rollback runs reverse order and continues after success', async () => { const seen = []; const stack = new RollbackStack(); stack.register('a', async () => seen.push('a')); stack.register('b', async () => seen.push('b')); const out = await stack.run(new Trace()); assert.deepEqual(seen, ['b','a']); assert.equal(out.every((x) => x.ok), true); });

test('runtime rejects timeout and emits rollback trace', async () => { const out = await runClosedLoop({ taskId: 'timeout', faults: { timeout: true } }); assert.equal(out.status, 'rejected'); assert.ok(out.trace.some((x) => x.event === 'runtime.rejected')); });

test('Mission Control writes are dry-run by default', async () => { const calls = []; const client = new MissionControlClient({ dryRun: true, fetchImpl: async (...args) => { calls.push(args); return new Response('{}', { status: 200 }); } }); const out = await client.createTask({ id: 'x' }); assert.equal(out.dry_run, true); assert.equal(calls.length, 0); });
