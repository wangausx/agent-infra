import assert from 'node:assert/strict';
import test from 'node:test';
import { makeEnvelope } from '../src/contracts.mjs';
import { AgentTeamsAdapter, InMemoryRoomTransport, AGENTTEAMS_PROTOCOL, AGENTTEAMS_TEAM } from '../src/agentteams-adapter.mjs';

test('AgentTeams adapter starts an isolated manager-worker run', async () => {
  const transport = new InMemoryRoomTransport();
  const adapter = new AgentTeamsAdapter({ transport, dryRun: true });
  await adapter.startRun({ runId: 'run-agentteams-1', taskId: 'task-agentteams-1', objective: 'inspect isolated service' });
  const [message] = transport.list();
  assert.equal(message.protocol, AGENTTEAMS_PROTOCOL);
  assert.equal(message.recipient, 'planner');
  assert.equal(message.dry_run, true);
  assert.equal(message.body.data.team, AGENTTEAMS_TEAM.metadata.name);
});

test('AgentTeams adapter carries versioned planner-to-executor handoff', async () => {
  const transport = new InMemoryRoomTransport();
  const adapter = new AgentTeamsAdapter({ transport, dryRun: true });
  const envelope = makeEnvelope({ taskId: 'task-agentteams-2', sender: 'planner', recipient: 'executor', kind: 'plan', payload: { steps: ['inspect', 'prepare'] } });
  await adapter.handoff({ runId: 'run-agentteams-2', envelope });
  const decoded = AgentTeamsAdapter.decode(transport.list()[0]);
  assert.equal(decoded.kind, 'handoff.plan');
  assert.equal(decoded.envelope_id, envelope.envelope_id);
  assert.deepEqual(decoded.body.data.steps, ['inspect', 'prepare']);
});

test('AgentTeams adapter rejects external writes unless explicitly enabled', () => {
  const transport = new InMemoryRoomTransport();
  assert.throws(() => new AgentTeamsAdapter({ transport, dryRun: false }), /allowExternal/);
});

test('AgentTeams adapter rejects malformed inbound messages', () => {
  assert.throws(() => AgentTeamsAdapter.decode({ protocol: AGENTTEAMS_PROTOCOL }), /missing AgentTeams message identity/);
});
