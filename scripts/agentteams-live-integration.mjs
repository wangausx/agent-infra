import fs from 'node:fs';
import { AgentTeamsAdapter, HttpRoomTransport } from '../src/agentteams-adapter.mjs';

const envFile = process.env.AGENTTEAMS_ENV_FILE;
const matrixBaseUrl = process.env.AGENTTEAMS_MATRIX_BASE_URL ?? 'http://127.0.0.1:18080';
const roomId = process.env.AGENTTEAMS_MANAGER_ROOM ?? process.env.AGENTTEAMS_ROOM_ID ?? process.env.AGENTTEAMS_EXECUTOR_ROOM;
const managerUserId = process.env.AGENTTEAMS_MANAGER_USER_ID ?? '';
const live = process.env.AGENTTEAMS_LIVE === 'true';

function parseEnv(file) {
  const values = {};
  for (const raw of fs.readFileSync(file, 'utf8').split(/\r?\n/)) {
    const line = raw.trim();
    if (!line || line.startsWith('#')) continue;
    const separator = line.indexOf('=');
    if (separator < 1) continue;
    const key = line.slice(0, separator).trim();
    let value = line.slice(separator + 1).trim();
    if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) value = value.slice(1, -1);
    values[key] = value;
  }
  return values;
}

if (!envFile) throw new Error('AGENTTEAMS_ENV_FILE is required; credentials must remain outside the repository');
if (!roomId) throw new Error('AGENTTEAMS_MANAGER_ROOM or AGENTTEAMS_ROOM_ID is required');
if (!fs.existsSync(envFile)) throw new Error(`AgentTeams env file not found: ${envFile}`);
const config = parseEnv(envFile);
if (!config.AGENTTEAMS_ADMIN_USER || !config.AGENTTEAMS_ADMIN_PASSWORD) throw new Error('AgentTeams env file lacks admin credentials');

const login = await fetch(`${matrixBaseUrl}/_matrix/client/v3/login`, {
  method: 'POST',
  headers: { 'content-type': 'application/json' },
  body: JSON.stringify({ type: 'm.login.password', user: config.AGENTTEAMS_ADMIN_USER, password: config.AGENTTEAMS_ADMIN_PASSWORD })
});
if (!login.ok) throw new Error(`AgentTeams Matrix login failed: HTTP ${login.status}`);
const { access_token: accessToken, user_id: userId } = await login.json();
const runId = `agent-infra-live-${Date.now()}`;
const transport = new HttpRoomTransport({ baseUrl: matrixBaseUrl, roomId, accessToken, mentionUserId: managerUserId, dryRun: !live, allowExternal: live, timeoutMs: 10000 });
const adapter = new AgentTeamsAdapter({ transport, roomId, dryRun: !live, allowExternal: live });
const result = await adapter.startRun({ runId, taskId: 'agent-infra-live-smoke', objective: 'Verify isolated AgentTeams Manager assignment delivery; do not perform production or external actions.' });

let verified = false;
if (live) {
  const history = await fetch(`${matrixBaseUrl}/_matrix/client/v3/rooms/${encodeURIComponent(roomId)}/messages?dir=b&limit=50`, { headers: { authorization: `Bearer ${accessToken}` } });
  if (!history.ok) throw new Error(`AgentTeams Matrix history read failed: HTTP ${history.status}`);
  const events = (await history.json()).chunk ?? [];
  verified = events.some((event) => event.content?.body?.includes(runId));
  if (!verified) throw new Error('live Manager assignment was not found in Matrix room history');
}
console.log(JSON.stringify({ status: live ? 'verified' : 'dry-run', run_id: runId, user_id: userId, room_id: roomId, recipient: 'planner', manager_mentioned: Boolean(managerUserId), external: result.external ?? false, http_status: result.status ?? null, read_back: verified, production_mc_touched: false }, null, 2));
