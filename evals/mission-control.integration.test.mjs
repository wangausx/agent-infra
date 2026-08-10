import test from 'node:test';
import assert from 'node:assert/strict';
import { createIsolatedMissionControlServer } from '../src/isolated-mc-server.mjs';
import { MissionControlClient } from '../src/mission-control-client.mjs';

let now = 1000;
const isolated = createIsolatedMissionControlServer({ port: 0, leaseClock: () => now });
test.before(async () => { const port = await isolated.listen(); isolated.client = new MissionControlClient({ baseUrl: `http://127.0.0.1:${port}`, mode: 'isolated', dryRun: false }); });
test.after(async () => isolated.close());

test('isolated HTTP integration creates, claims, and accepts evidence', async () => {
  await isolated.client.createTask({ id: 'integration-task', title: 'isolated', status: 'backlog' });
  const claim = await isolated.client.claimTask('integration-task', { owner: 'agent-infra', leaseMs: 100 });
  const evidence = { evidence_id: 'e1', hash: 'h1', dry_run: true };
  const accepted = await isolated.client.postEvidence('integration-task', evidence, { leaseToken: claim.lease_token });
  assert.deepEqual(accepted, { accepted: true, evidence_count: 1 });
  assert.equal((await isolated.client.getTask('integration-task')).evidence.length, 1);
});

test('isolated HTTP integration rejects expired lease', async () => {
  await isolated.client.createTask({ id: 'stale-task', title: 'stale', status: 'backlog' });
  const claim = await isolated.client.claimTask('stale-task', { owner: 'worker-a', leaseMs: 10 }); now = 1011;
  await assert.rejects(() => isolated.client.postEvidence('stale-task', { evidence_id: 'stale' }, { leaseToken: claim.lease_token }), (error) => error.status === 409 && /stale/.test(error.message));
});

test('production target writes are rejected unless explicitly enabled', async () => {
  const client = new MissionControlClient({ baseUrl: 'http://127.0.0.1:3005', mode: 'production', dryRun: false, fetchImpl: async () => { throw new Error('network write should not happen'); } });
  await assert.rejects(() => client.createTask({ id: 'must-not-write' }), /production Mission Control writes/);
});

test('client sends auth and compatibility headers', async () => {
  let request;
  const client = new MissionControlClient({ baseUrl: 'http://127.0.0.1:3015', dryRun: false, authToken: 'fixture-token', apiVersion: '0.1.0', fetchImpl: async (...args) => { request = args; return new Response('{"ok":true}', { status: 200, headers: { 'x-mc-api-version': '0.1.0' } }); } });
  await client.listTasks();
  assert.equal(request[1].headers.authorization, 'Bearer fixture-token'); assert.equal(request[1].headers['x-mc-api-version'], '0.1.0');
});
