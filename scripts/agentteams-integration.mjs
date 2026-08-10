import { AgentTeamsAdapter, InMemoryRoomTransport } from '../src/agentteams-adapter.mjs';
import { makeEnvelope } from '../src/contracts.mjs';

const transport = new InMemoryRoomTransport();
const adapter = new AgentTeamsAdapter({ transport, dryRun: true });
const runId = `agentteams-smoke-${Date.now()}`;
await adapter.startRun({ runId, taskId: `${runId}-task`, objective: 'Run the isolated closed-loop collaboration scenario' });
await adapter.handoff({
  runId,
  envelope: makeEnvelope({ taskId: `${runId}-task`, sender: 'planner', recipient: 'executor', kind: 'plan', payload: { steps: ['inspect', 'prepare', 'verify'] } })
});
console.log(JSON.stringify({
  status: 'started',
  protocol: 'agentteams-v1',
  runtime_version: 'v1.2.2',
  run_id: runId,
  room_id: transport.list()[0].room_id,
  messages: transport.list().length,
  external_writes: false,
  production_mc_touched: false
}, null, 2));
