import { createIsolatedMissionControlServer } from '../src/isolated-mc-server.mjs';
import { MissionControlClient } from '../src/mission-control-client.mjs';
import { runClosedLoop } from '../src/runtime.mjs';

const isolated = createIsolatedMissionControlServer({ port: Number(process.env.MISSION_CONTROL_PORT ?? 3015) });
const port = await isolated.listen();
const client = new MissionControlClient({ baseUrl: `http://127.0.0.1:${port}`, mode: 'isolated', dryRun: false });
try {
  await client.createTask({ id: 'integration-demo', title: 'isolated integration', status: 'backlog' });
  const claim = await client.claimTask('integration-demo', { owner: 'agent-infra', leaseMs: 1000 });
  await client.postEvidence('integration-demo', { evidence_id: 'integration-evidence', hash: 'fixture', dry_run: true }, { leaseToken: claim.lease_token });
  await client.postEvent({ agent: 'agent-infra', action: 'integration-verified', target: 'integration-demo' });
  const rejected = await runClosedLoop({ taskId: 'integration-rejection', faults: { timeout: true }, controlPlane: client });
  const task = await client.getTask('integration-demo');
  if (task.evidence?.length !== 1) throw new Error('isolated evidence was not persisted');
  if (rejected.status !== 'rejected' || !isolated.events.some((event) => event.action === 'rejected-and-rolled-back')) throw new Error('rollback event was not persisted');
  console.log(JSON.stringify({ port, task_id: task.id, evidence_count: task.evidence.length, events: isolated.events.length, rollback_event_persisted: true, production_untouched: true }));
} finally { await isolated.close(); }
