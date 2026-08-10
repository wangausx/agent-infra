import http from 'node:http';
import crypto from 'node:crypto';

export function createIsolatedMissionControlServer({ port = 0, leaseClock = () => Date.now() } = {}) {
  const tasks = new Map(); const events = [];
  const json = (res, status, body) => { res.writeHead(status, {'content-type':'application/json'}); res.end(JSON.stringify(body)); };
  const readBody = async (req) => { let raw=''; for await (const chunk of req) raw += chunk; return raw ? JSON.parse(raw) : {}; };
  const server = http.createServer(async (req, res) => {
    try {
      const url = new URL(req.url, 'http://127.0.0.1'); const parts = url.pathname.split('/').filter(Boolean);
      if (req.method === 'GET' && url.pathname === '/api/tasks') return json(res, 200, { tasks: [...tasks.values()] });
      if (req.method === 'POST' && url.pathname === '/api/tasks') {
        const body = await readBody(req); const id = body.id ?? `task-${crypto.randomUUID()}`;
        const task = { ...body, id, createdAt: new Date(leaseClock()).toISOString() }; delete task.idempotency_key;
        tasks.set(id, task); return json(res, 201, { task });
      }
      if (req.method === 'POST' && url.pathname === '/api/events') { const event = await readBody(req); events.push(event); return json(res, 201, { event }); }
      if (req.method === 'POST' && url.pathname === '/api/tasks/heartbeat') {
        const body = await readBody(req); const task = tasks.get(body.taskId);
        if (!task) return json(res, 404, { error: 'Not found' });
        if (task.claimId !== body.claimId || task.claimGeneration !== body.claimGeneration) return json(res, 409, { error: 'Stale claim rejected' });
        Object.assign(task, { lastHeartbeatAt: new Date(leaseClock()).toISOString(), leaseExpiresAt: leaseClock() + 3600000, workerPid: body.workerPid, workerCommand: body.workerCommand });
        return json(res, 200, { task });
      }
      if (req.method === 'POST' && url.pathname === '/api/tasks/recover-expired') {
        const body = await readBody(req); const task = tasks.get(body.taskId);
        if (!task) return json(res, 404, { error: 'TASK_NOT_FOUND' });
        if (task.leaseExpiresAt > leaseClock()) return json(res, 409, { error: 'LEASE_ACTIVE' });
        task.status = 'backlog'; delete task.claimId; return json(res, 200, { ok: true, task });
      }
      if (req.method === 'PATCH' && url.pathname === '/api/tasks') {
        const id = url.searchParams.get('id'); const task = tasks.get(id); if (!task) return json(res, 404, { error: 'Not found' });
        const body = await readBody(req);
        if (body.status === 'in-progress') { task.status = body.status; task.claimId = crypto.randomUUID(); task.claimGeneration = (task.claimGeneration ?? 0) + 1; task.leaseOwner = body.actor; task.leaseExpiresAt = leaseClock() + 3600000; }
        else { Object.assign(task, body); }
        return json(res, 200, { task });
      }
      if (parts[0] !== 'api' || parts[1] !== 'tasks' || !parts[2]) return json(res, 404, { error: 'not found' });
      const id = decodeURIComponent(parts[2]); const task = tasks.get(id);
      if (req.method === 'GET' && parts.length === 3) return task ? json(res, 200, task) : json(res, 404, { error: 'task not found' });
      if (req.method === 'POST' && parts[3] === 'claim') {
        if (!task) return json(res, 404, { error: 'task not found' });
        const body = await readBody(req); const leaseMs = Math.min(Math.max(Number(body.lease_ms ?? 3600000), 1), 3600000); const leaseToken = crypto.randomUUID();
        task.lease_owner = body.owner; task.lease_token = leaseToken; task.lease_expires_at = leaseClock() + leaseMs; task.status = 'in-progress'; return json(res, 200, { task_id: id, lease_token: leaseToken, lease_expires_at: task.lease_expires_at });
      }
      if (req.method === 'POST' && parts[3] === 'evidence') {
        if (!task) return json(res, 404, { error: 'task not found' });
        if (!task.lease_token || req.headers['x-mc-lease-token'] !== task.lease_token || leaseClock() >= task.lease_expires_at) return json(res, 409, { error: 'stale or missing lease' });
        const body = await readBody(req); task.evidence = [...(task.evidence ?? []), body.evidence]; return json(res, 201, { accepted: true, evidence_count: task.evidence.length });
      }
      return json(res, 404, { error: 'not found' });
    } catch (error) { return json(res, 400, { error: error.message }); }
  });
  return { server, tasks, events, async listen() { await new Promise((resolve) => server.listen(port, '127.0.0.1', resolve)); return server.address().port; }, async close() { await new Promise((resolve, reject) => server.close((error) => error ? reject(error) : resolve())); } };
}
