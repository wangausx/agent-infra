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
      if (req.method === 'POST' && url.pathname === '/api/tasks') { const task = await readBody(req); if (!task.id) return json(res, 400, { error: 'task id required' }); tasks.set(task.id, { ...task }); return json(res, 201, tasks.get(task.id)); }
      if (parts[0] !== 'api' || parts[1] !== 'tasks' || !parts[2]) return req.method === 'POST' && url.pathname === '/api/events' ? (events.push(await readBody(req)), json(res, 201, { accepted: true })) : json(res, 404, { error: 'not found' });
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
