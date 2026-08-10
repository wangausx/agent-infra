import test from 'node:test';
import assert from 'node:assert/strict';
import { createIsolatedMissionControlServer } from '../src/isolated-mc-server.mjs';
import { MissionControlClient } from '../src/mission-control-client.mjs';

let now = 1000;
const isolated = createIsolatedMissionControlServer({ port: 0, leaseClock: () => now });
let native; let legacy;
test.before(async () => { const port = await isolated.listen(); native = new MissionControlClient({ baseUrl: `http://127.0.0.1:${port}`, mode: 'isolated', dryRun: false }); legacy = new MissionControlClient({ baseUrl: `http://127.0.0.1:${port}`, mode: 'isolated', protocol: 'legacy-fixture', dryRun: false }); });
test.after(async () => isolated.close());

const taskInput = (title) => ({ title, description: `${title}\n\n### Acceptance Criteria\n- [ ] Verify isolated create returns a task\n- [ ] Check review output is in-review`, status: 'backlog', assignee: 'main', priority: 'low', tags: ['agent-infra'], deliverables: [{ label: 'probe', path: '/tmp/agent-infra-probe.txt' }], task_contract: { version: 1, objective: title, execution: { mode: 'agent' }, acceptance: [{ id: 'acceptance-1', requirement: 'create returns task', required: true, status: 'pending', evidence: [] }, { id: 'acceptance-2', requirement: 'review returns in-review', required: true, status: 'pending', evidence: [] }], review: { verdict: 'pending', checks: [{ id: 'review-ready', requirement: 'summary and evidence', required: true, status: 'pending', evidence: [] }] } } });

test('native adapter creates, claims, reviews, and lists through MC v1 routes', async () => {
  const created = await native.createTask(taskInput('native integration'));
  const claim = await native.claimTask(created.id, { owner: 'main' });
  const heartbeat = await native.heartbeat({ taskId: created.id, claimId: claim.claim_id, claimGeneration: claim.claim_generation, workerPid: 1234, workerCommand: 'node adapter-test' });
  assert.equal(heartbeat.claimId, claim.claim_id);
  const reviewed = await native.submitReview(created.id, { summary: 'The isolated adapter submitted a verifiable review result.', actor: 'main', claimId: claim.claim_id, claimGeneration: claim.claim_generation, deliverables: taskInput('x').deliverables });
  assert.equal(reviewed.status, 'in-review'); assert.equal((await native.getTask(created.id)).id, created.id);
});

test('legacy fixture evidence rejects an expired lease', async () => {
  await legacy.createTask({ id: 'stale-task', title: 'stale', status: 'backlog' });
  const claim = await legacy.claimTask('stale-task', { owner: 'worker-a', leaseMs: 10 }); now = 1011;
  await assert.rejects(() => legacy.postEvidence('stale-task', { evidence_id: 'stale' }, { leaseToken: claim.lease_token }), (error) => error.status === 409 && /stale/.test(error.message));
});

test('production target writes are rejected unless explicitly enabled', async () => {
  const client = new MissionControlClient({ baseUrl: 'http://127.0.0.1:3005', mode: 'production', dryRun: false, fetchImpl: async () => { throw new Error('network write should not happen'); } });
  await assert.rejects(() => client.createTask(taskInput('must-not-write')), /production Mission Control writes/);
});

test('client sends auth and compatibility headers', async () => {
  let request;
  const client = new MissionControlClient({ baseUrl: 'http://127.0.0.1:3015', dryRun: false, authToken: 'fixture-token', apiVersion: '0.1.0', fetchImpl: async (...args) => { request = args; return new Response('{"tasks":[]}', { status: 200, headers: { 'x-mc-api-version': '0.1.0' } }); } });
  await client.listTasks();
  assert.equal(request[1].headers.authorization, 'Bearer fixture-token'); assert.equal(request[1].headers['x-mc-api-version'], '0.1.0');
});
