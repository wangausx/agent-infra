import fs from 'node:fs/promises';
import path from 'node:path';
import { createIsolatedMissionControlServer } from '../src/isolated-mc-server.mjs';
import { MissionControlClient } from '../src/mission-control-client.mjs';
import { runStaleWorkerScenario } from '../scenarios/closed-loop-demo/stale-worker.mjs';

const port = Number(process.env.MISSION_CONTROL_PORT ?? 3015);
const reportPath = path.resolve(process.env.MISSION_CONTROL_REPORT ?? 'state/live-mc-e2e-report.json');
const isolated = createIsolatedMissionControlServer({ port });
const actualPort = await isolated.listen();
const client = new MissionControlClient({ baseUrl: `http://127.0.0.1:${actualPort}`, mode: 'isolated', dryRun: false, minRequestIntervalMs: 1 });
const contract = {
  version: 1,
  objective: 'Run the stale-worker collaboration scenario through native isolated Mission Control.',
  execution: { mode: 'agent' },
  acceptance: [
    { id: 'scenario-verified', requirement: 'Scenario completes with verified status', required: true, status: 'pending', evidence: [] },
    { id: 'native-review', requirement: 'Native Mission Control reaches in-review with evidence', required: true, status: 'pending', evidence: [] }
  ],
  review: { verdict: 'pending', checks: [{ id: 'evidence-present', requirement: 'Scenario report exists and is readable', required: true, status: 'pending', evidence: [] }] }
};
const controlPlane = {
  task: null,
  claim: null,
  async createTask(task) {
    const created = await client.createTask({
      title: task.title,
      description: `${task.description}\n\n### Acceptance Criteria\n- [ ] Verify scenario completes with a verified result\n- [ ] Check native Mission Control review contains executable evidence`,
      status: 'backlog', assignee: 'main', priority: 'medium', tags: ['agent-infra', 'agentteams', 'isolated'],
      deliverables: [{ label: 'live scenario report', path: reportPath }], task_contract: contract
    });
    this.task = created;
    this.claim = await client.claimTask(created.id, { owner: 'danny-hermes', driver: 'danny-hermes' });
    await client.heartbeat({ taskId: created.id, claimId: this.claim.claim_id, claimGeneration: this.claim.claim_generation, workerPid: process.pid, workerChildPid: process.pid, workerCommand: 'node scripts/live-mc-e2e.mjs' });
    return created;
  },
  async postEvent(event) {
    return client.postEvent({ ...event, target: this.task?.id ?? event.target, agent: event.agent ?? 'danny-hermes' });
  }
};

try {
  const report = await runStaleWorkerScenario({ seed: process.env.AGENT_INFRA_SEED ?? 'live-m31-seed-001', caseName: 'success', dryRun: false, approved: true, controlPlane });
  await fs.mkdir(path.dirname(reportPath), { recursive: true });
  await fs.writeFile(reportPath, `${JSON.stringify(report, null, 2)}\n`, { mode: 0o664 });
  const reviewed = await client.submitReview(controlPlane.task.id, {
    summary: `Live AgentTeams-compatible stale-worker scenario completed with status ${report.status}; native isolated Mission Control claim, heartbeat, evidence path, and review transition were exercised.`,
    taskContract: contract, actor: 'danny-hermes', claimId: controlPlane.claim.claim_id, claimGeneration: controlPlane.claim.claim_generation,
    deliverables: [{ label: 'live scenario report', path: reportPath }]
  });
  const finalTask = await client.getTask(controlPlane.task.id);
  const ok = report.status === 'verified' && finalTask.status === 'in-review' && isolated.events.some((event) => event.action === 'verified:verified');
  if (!ok) throw new Error(`live MC acceptance failed: scenario=${report.status}, task=${finalTask.status}`);
  console.log(JSON.stringify({ status: 'verified', port: actualPort, task_id: finalTask.id, task_status: finalTask.status, scenario_status: report.status, events: isolated.events.length, report_path: reportPath, production_untouched: true, review_written: Boolean(reviewed?.id ?? reviewed?.status ?? reviewed?.task_contract) }, null, 2));
} finally {
  await isolated.close();
}
