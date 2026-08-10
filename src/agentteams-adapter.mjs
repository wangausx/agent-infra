import crypto from 'node:crypto';
import { assertEnvelope } from './contracts.mjs';

export const AGENTTEAMS_PROTOCOL = 'agentteams-v1';
export const AGENTTEAMS_VERSION = 'v1.2.2';

export const AGENTTEAMS_TEAM = Object.freeze({
  apiVersion: 'agentteams.agentscope.ai/v1alpha1',
  kind: 'Team',
  metadata: { name: 'agent-infra-collaboration' },
  spec: {
    manager: { runtime: 'openclaw', role: 'planner' },
    workers: [
      { name: 'executor', runtime: 'hermes', role: 'executor' },
      { name: 'verifier', runtime: 'hermes', role: 'verifier' }
    ],
    room: { human_intervention: true, visible_handoffs: true }
  }
});

function id(prefix, value) {
  return `${prefix}-${crypto.createHash('sha256').update(String(value)).digest('hex').slice(0, 16)}`;
}

export function validateAgentTeamsEnvelope(message) {
  if (!message || message.protocol !== AGENTTEAMS_PROTOCOL) throw new TypeError('invalid AgentTeams protocol');
  if (!message.run_id || !message.room_id || !message.sender || !message.recipient) throw new TypeError('missing AgentTeams message identity');
  if (!message.body || typeof message.body !== 'object') throw new TypeError('AgentTeams message body must be an object');
  return message;
}

export class InMemoryRoomTransport {
  constructor() { this.messages = []; }
  async send(message) { this.messages.push(message); return message; }
  list() { return [...this.messages]; }
}

export class HttpRoomTransport {
  constructor({ baseUrl, roomId, accessToken = '', timeoutMs = 5000, dryRun = true, allowExternal = false, mentionUserId = '' } = {}) {
    if (!baseUrl || !roomId) throw new TypeError('baseUrl and roomId are required');
    const url = new URL(baseUrl);
    if (url.protocol !== 'http:' && url.protocol !== 'https:') throw new TypeError('AgentTeams transport URL must use HTTP(S)');
    if (!dryRun && !allowExternal) throw new Error('external AgentTeams writes require explicit allowExternal=true');
    this.baseUrl = url.toString().replace(/\/$/, '');
    this.roomId = roomId;
    this.accessToken = accessToken;
    this.timeoutMs = timeoutMs;
    this.dryRun = dryRun;
    this.allowExternal = allowExternal;
    this.mentionUserId = mentionUserId;
  }

  async send(message) {
    validateAgentTeamsEnvelope(message);
    if (this.dryRun) return { dry_run: true, message };
    const endpoint = `${this.baseUrl}/_matrix/client/v3/rooms/${encodeURIComponent(this.roomId)}/send/m.room.message/${encodeURIComponent(message.message_id)}`;
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), this.timeoutMs);
    try {
      const response = await fetch(endpoint, {
        method: 'PUT',
        headers: {
          'content-type': 'application/json',
          ...(this.accessToken ? { authorization: `Bearer ${this.accessToken}` } : {})
        },
        body: JSON.stringify({
          msgtype: message.body.msgtype,
          body: this.mentionUserId ? `${this.mentionUserId} ${JSON.stringify(message)}` : JSON.stringify(message),
          format: message.body.format,
          ...(this.mentionUserId ? { 'm.mentions': { user_ids: [this.mentionUserId] } } : {})
        }),
        signal: controller.signal
      });
      if (!response.ok) throw new Error(`AgentTeams room transport HTTP ${response.status}`);
      return { external: true, status: response.status, body: await response.json().catch(() => ({})), message };
    } finally {
      clearTimeout(timer);
    }
  }
}

export class AgentTeamsAdapter {
  constructor({ transport, roomId = 'agent-infra-isolated', dryRun = true, allowExternal = false, team = AGENTTEAMS_TEAM } = {}) {
    if (!transport || typeof transport.send !== 'function') throw new TypeError('AgentTeams transport.send is required');
    if (!dryRun && !allowExternal) throw new Error('external AgentTeams writes require explicit allowExternal=true');
    this.transport = transport;
    this.roomId = roomId;
    this.dryRun = dryRun;
    this.allowExternal = allowExternal;
    this.team = team;
  }

  async publish({ runId, sender, recipient, kind, body, envelope = null }) {
    if (!runId || !sender || !recipient || !kind) throw new TypeError('runId, sender, recipient, and kind are required');
    if (envelope) assertEnvelope(envelope);
    const message = {
      message_id: id('msg', `${runId}:${sender}:${recipient}:${kind}:${JSON.stringify(body)}`),
      protocol: AGENTTEAMS_PROTOCOL,
      runtime_version: AGENTTEAMS_VERSION,
      room_id: this.roomId,
      run_id: runId,
      sender,
      recipient,
      kind,
      mtype: 'm.room.message',
      body: { msgtype: 'm.text', format: 'org.matrix.custom.html', data: body },
      dry_run: this.dryRun,
      envelope_id: envelope?.envelope_id ?? null
    };
    return this.transport.send(message);
  }

  async startRun({ runId, taskId, objective, manager = 'planner' }) {
    if (!runId || !taskId || !objective) throw new TypeError('runId, taskId, and objective are required');
    return this.publish({
      runId, sender: 'human', recipient: manager, kind: 'task.assign',
      body: { task_id: taskId, objective, team: this.team.metadata.name, acceptance: ['independent verification', 'MC review'] }
    });
  }

  async handoff({ runId, envelope }) {
    assertEnvelope(envelope);
    return this.publish({ runId, sender: envelope.sender, recipient: envelope.recipient, kind: `handoff.${envelope.kind}`, body: envelope.payload, envelope });
  }

  static decode(message) { return validateAgentTeamsEnvelope(message); }
}
