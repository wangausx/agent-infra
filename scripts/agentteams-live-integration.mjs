import fs from 'node:fs';
import { AgentTeamsAdapter, HttpRoomTransport } from '../src/agentteams-adapter.mjs';

const envFile = process.env.AGENTTEAMS_ENV_FILE;
const matrixBaseUrl = process.env.AGENTTEAMS_MATRIX_BASE_URL ?? 'http://127.0.0.1:18080';
let roomId = process.env.AGENTTEAMS_MANAGER_ROOM ?? process.env.AGENTTEAMS_ROOM_ID ?? process.env.AGENTTEAMS_EXECUTOR_ROOM;
let managerUserId = process.env.AGENTTEAMS_MANAGER_USER_ID ?? '';
const live = process.env.AGENTTEAMS_LIVE === 'true';
const discoverManager = process.env.AGENTTEAMS_DISCOVER_MANAGER !== 'false';

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
if (discoverManager && (!roomId || !managerUserId)) {
  const joined = await fetch(`${matrixBaseUrl}/_matrix/client/v3/joined_rooms`, { headers: { authorization: `Bearer ${accessToken}` } });
  if (!joined.ok) throw new Error(`AgentTeams joined-room discovery failed: HTTP ${joined.status}`);
  const rooms = (await joined.json()).joined_rooms ?? [];
  for (const candidate of rooms) {
    const stateResponse = await fetch(`${matrixBaseUrl}/_matrix/client/v3/rooms/${encodeURIComponent(candidate)}/state`, { headers: { authorization: `Bearer ${accessToken}` } });
    if (!stateResponse.ok) continue;
    const state = await stateResponse.json();
    if (!state.some((event) => event.type === 'm.room.name' && event.content?.name === 'Manager: default')) continue;
    roomId ??= candidate;
    if (!managerUserId) {
      const membersResponse = await fetch(`${matrixBaseUrl}/_matrix/client/v3/rooms/${encodeURIComponent(candidate)}/joined_members`, { headers: { authorization: `Bearer ${accessToken}` } });
      if (membersResponse.ok) managerUserId = Object.keys((await membersResponse.json()).joined ?? {}).find((member) => member.startsWith('@manager:')) ?? '';
    }
    break;
  }
}
if (!roomId) throw new Error('Manager room could not be discovered; set AGENTTEAMS_MANAGER_ROOM');
if (!managerUserId) throw new Error('Manager user could not be discovered; set AGENTTEAMS_MANAGER_USER_ID');
const runId = `agent-infra-live-${Date.now()}`;
const taskId = process.env.AGENTTEAMS_TASK_ID ?? `agent-infra-live-${Date.now()}`;
const objective = process.env.AGENTTEAMS_TASK_OBJECTIVE ?? `Use the finite-task workflow to delegate task ${taskId} to Rex. Create and push the task spec, register it in state.json, and notify Rex in Rex's worker room. Rex must acknowledge the task. Do not perform production or external actions.`;
const transport = new HttpRoomTransport({ baseUrl: matrixBaseUrl, roomId, accessToken, mentionUserId: managerUserId, dryRun: !live, allowExternal: live, timeoutMs: 10000 });
const adapter = new AgentTeamsAdapter({ transport, roomId, dryRun: !live, allowExternal: live });
const startedAt = Date.now();
const result = await adapter.startRun({ runId, taskId, objective });

let verified = false;
if (live) {
  const deadline = Date.now() + Number(process.env.AGENTTEAMS_VERIFY_TIMEOUT_MS ?? 120000);
  while (Date.now() < deadline) {
    const history = await fetch(`${matrixBaseUrl}/_matrix/client/v3/rooms/${encodeURIComponent(roomId)}/messages?dir=b&limit=100`, { headers: { authorization: `Bearer ${accessToken}` } });
    if (!history.ok) throw new Error(`AgentTeams Matrix history read failed: HTTP ${history.status}`);
    const events = (await history.json()).chunk ?? [];
    verified = events.some((event) => {
      const body = event.content?.body ?? '';
      return event.sender?.startsWith('@manager:') && Number(event.origin_server_ts ?? 0) >= startedAt && /assigned|dispatch|executor|worker|acknowledge|registered/i.test(body);
    });
    if (verified) break;
    await new Promise((resolve) => setTimeout(resolve, 2000));
  }
  if (!verified) throw new Error('live Manager did not acknowledge or process the assignment before timeout');
}
console.log(JSON.stringify({ status: live ? 'verified' : 'dry-run', run_id: runId, user_id: userId, room_id: roomId, recipient: 'planner', manager_mentioned: Boolean(managerUserId), external: result.external ?? false, http_status: result.status ?? null, read_back: verified, production_mc_touched: false }, null, 2));
