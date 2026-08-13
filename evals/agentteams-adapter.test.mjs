import assert from 'node:assert/strict';
import http from 'node:http';
import test from 'node:test';
import { makeEnvelope } from '../src/contracts.mjs';
import { AgentTeamsAdapter, HttpRoomTransport, InMemoryRoomTransport, AGENTTEAMS_PROTOCOL, AGENTTEAMS_TEAM } from '../src/agentteams-adapter.mjs';

test('AgentTeams adapter starts an isolated manager-worker run', async () => {
  const transport = new InMemoryRoomTransport();
  const adapter = new AgentTeamsAdapter({ transport, dryRun: true });
  await adapter.startRun({ runId: 'run-agentteams-1', taskId: 'task-agentteams-1', objective: 'inspect isolated service' });
  const [message] = transport.list();
  assert.equal(message.protocol, AGENTTEAMS_PROTOCOL);
  assert.equal(message.recipient, 'manager');
  assert.equal(message.dry_run, true);
  assert.equal(message.body.data.team, AGENTTEAMS_TEAM.metadata.name);
});

test('AgentTeams adapter carries versioned planner-to-executor handoff', async () => {
  const transport = new InMemoryRoomTransport();
  const adapter = new AgentTeamsAdapter({ transport, dryRun: true });
  const envelope = makeEnvelope({ taskId: 'task-agentteams-2', runId: 'run-agentteams-2', correlationId: 'corr-agentteams-2', sender: 'planner', recipient: 'executor', kind: 'plan', payload: { steps: ['inspect', 'prepare'] } });
  await adapter.handoff({ runId: 'run-agentteams-2', envelope });
  const decoded = AgentTeamsAdapter.decode(transport.list()[0]);
  assert.equal(decoded.kind, 'handoff.plan');
  assert.equal(decoded.envelope_id, envelope.envelope_id);
  assert.deepEqual(decoded.body.data.steps, ['inspect', 'prepare']);
});

test('HTTP room transport posts a Matrix-compatible event to an isolated endpoint', async () => {
  let received;
  const server = http.createServer(async (request, response) => {
    let body = '';
    for await (const chunk of request) body += chunk;
    received = { method: request.method, url: request.url, body: JSON.parse(body) };
    response.writeHead(200, { 'content-type': 'application/json' });
    response.end(JSON.stringify({ event_id: '$isolated-agentteams-event' }));
  });
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  try {
    const address = server.address();
    const transport = new HttpRoomTransport({ baseUrl: `http://127.0.0.1:${address.port}`, roomId: '!isolated:local', dryRun: false, allowExternal: true });
    const adapter = new AgentTeamsAdapter({ transport, roomId: '!isolated:local', dryRun: false, allowExternal: true });
    const result = await adapter.startRun({ runId: 'run-agentteams-http', taskId: 'task-agentteams-http', objective: 'isolated HTTP transport' });
    assert.equal(result.body.event_id, '$isolated-agentteams-event');
    assert.equal(received.method, 'PUT');
    assert.match(received.url, /_matrix\/client\/v3\/rooms/);
    assert.equal(JSON.parse(received.body.body).protocol, AGENTTEAMS_PROTOCOL);
  } finally {
    await new Promise((resolve) => server.close(resolve));
  }
});

test('AgentTeams adapter rejects external writes unless explicitly enabled', () => {
  const transport = new InMemoryRoomTransport();
  assert.throws(() => new AgentTeamsAdapter({ transport, dryRun: false }), /allowExternal/);
  assert.throws(() => new HttpRoomTransport({ baseUrl: 'http://127.0.0.1:9', roomId: 'room', dryRun: false }), /allowExternal/);
});

test('AgentTeams adapter rejects malformed inbound messages', () => {
  assert.throws(() => AgentTeamsAdapter.decode({ protocol: AGENTTEAMS_PROTOCOL }), /missing AgentTeams message identity/);
});
