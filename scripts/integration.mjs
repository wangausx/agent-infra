import { createIsolatedMissionControlServer } from '../src/isolated-mc-server.mjs';
import { MissionControlClient, MemoryControlPlane } from '../src/mission-control-client.mjs';
import { runClosedLoop } from '../src/runtime.mjs';

// Use an ephemeral fixture port by default so the project test cannot collide with the persistent isolated MC service on :3015.
const isolated = createIsolatedMissionControlServer({ port: Number(process.env.MISSION_CONTROL_PORT ?? 0) });
const port = await isolated.listen();
const client = new MissionControlClient({ baseUrl: `http://127.0.0.1:${port}`, mode: 'isolated', dryRun: false });
const taskContract = { version: 1, objective: 'Verify native adapter flow', execution: { mode: 'agent' }, acceptance: [{ id: 'acceptance-1', requirement: 'create returns task', required: true, status: 'pending', evidence: [] }, { id: 'acceptance-2', requirement: 'review returns in-review', required: true, status: 'pending', evidence: [] }], review: { verdict: 'pending', checks: [{ id: 'review-ready', requirement: 'summary and evidence', required: true, status: 'pending', evidence: [] }] } };
try {
  await client.createTask({ title: 'isolated integration', description: 'Integration task\n\n### Acceptance Criteria\n- [ ] Verify native create returns a task\n- [ ] Check review output is in-review', status: 'backlog', assignee: 'main', priority: 'low', tags: ['agent-infra'], deliverables: [{ label: 'adapter documentation', path: '/srv/agent-platform/projects/agent-infra/README.md' }], task_contract: taskContract });
  const task = (await client.listTasks()).tasks[0];
  const claim = await client.claimTask(task.id, { owner: 'main' });
  await client.submitReview(task.id, { summary: 'The isolated adapter submitted a verifiable review result.', actor: 'main', claimId: claim.claim_id, claimGeneration: claim.claim_generation, deliverables: [{ label: 'adapter documentation', path: '/srv/agent-platform/projects/agent-infra/README.md' }] });
  await client.postEvent({ agent: 'danny-hermes', action: 'integration-verified', target: task.id });
  const rejected = await runClosedLoop({ taskId: 'integration-rejection', faults: { timeout: true }, controlPlane: new MemoryControlPlane() });
  const updated = await client.getTask(task.id);
  if (updated.status !== 'in-review' || rejected.status !== 'rejected') throw new Error('native adapter integration criteria failed');
  console.log(JSON.stringify({ port, task_id: updated.id, status: updated.status, events: isolated.events.length, rollback_verified: true, production_untouched: true }));
} finally { await isolated.close(); }
