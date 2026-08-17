import { createHash } from 'node:crypto';
import { cp, mkdir, readFile, readdir, rm, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { appendOutcomeLabel, createOutcomeLabel } from '../src/outcome-label-ledger.mjs';

const projectRoot = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..');
const source = path.join(projectRoot, 'artifacts/runs/run-e921dfe97489eb24');
const output = path.resolve(process.argv[2] ?? '/tmp/agent-infra-simulated-learning');
const domains = ['autonomy-sensor-fusion', 'robotics-navigation', 'trading-risk'];
const dates = ['2026-08-03T16:00:00.000Z', '2026-08-10T16:00:00.000Z', '2026-08-17T16:00:00.000Z'];
const labels = { delayed: 'verified', recurrence: 'verified', collateral_impact: 'verified', human_override: 'rejected', business_impact: 'verified' };
const hash = (value) => createHash('sha256').update(value).digest('hex');

await rm(output, { recursive: true, force: true });
await mkdir(path.join(output, 'runs'), { recursive: true });
const ledger = path.join(output, 'outcome-label-ledger.jsonl');
for (let index = 0; index < domains.length; index += 1) {
  const runId = `sim-${index + 1}-${domains[index]}`;
  const runPath = path.join(output, 'runs', runId);
  await cp(source, runPath, { recursive: true });
  const manifestPath = path.join(runPath, 'evidence-manifest.json');
  const manifest = JSON.parse(await readFile(manifestPath, 'utf8'));
  manifest.run_id = runId;
  manifest.correlation_id = `corr-${runId}`;
  manifest.observed_at = dates[index];
  manifest.seed = `simulation-${domains[index]}`;
  manifest.team_id = `team-sim-${index + 1}`;
  manifest.room_id = `room-sim-${index + 1}`;
  manifest.project_id = `project-sim-${index + 1}`;
  manifest.task_id = `task-sim-${index + 1}`;
  manifest.identities = manifest.identities.map((identity) => `${identity}-${index + 1}`);
  manifest.safety.scenario = domains[index];
  manifest.safety.run_id = runId;
  const scorecardPath = path.join(runPath, 'scorecard.json');
  const scorecard = JSON.parse(await readFile(scorecardPath, 'utf8'));
  scorecard.scenario = domains[index];
  await writeFile(scorecardPath, JSON.stringify(scorecard, null, 2) + '\n');
  manifest.sha256 = {};
  for (const file of manifest.files) {
    if (file === 'evidence-manifest.json') continue;
    manifest.sha256[file] = hash(await readFile(path.join(runPath, file)));
  }
  await writeFile(manifestPath, JSON.stringify(manifest, null, 2) + '\n');
  await appendOutcomeLabel(ledger, createOutcomeLabel({
    labelId: `label-${runId}`, episodeId: runId, reviewer: 'simulation-reviewer',
    reviewerIdentity: { id: 'simulation-reviewer', role: 'agent-infra-reviewer', auth_method: 'fixture' },
    labeledAt: dates[index], labels, evidenceRefs: [`simulated/${runId}/outcome.json`]
  }));
}
console.log(JSON.stringify({ output, runs: domains.length, domains, weeks: dates.length, ledger }));
