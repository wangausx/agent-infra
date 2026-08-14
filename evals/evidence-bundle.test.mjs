import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';
import { validateEvidenceBundle } from '../scripts/validate-evidence.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const RUNS = path.join(ROOT, 'artifacts', 'runs');
const REQUIRED = ['scorecard.json', 'incident.json', 'suppression-evidence.jsonl', 'rca-report.json', 'policy-decision.json', 'action-result.json', 'verifier-report.json', 'postmortem.md', 'trace.jsonl', 'intervention-ledger.jsonl', 'mission-control-snapshot.json', 'evidence-manifest.json', 'metrics.json', 'replay-recording.json', 'disclosure.json'];

async function latestRun() {
  const dirs = (await fs.readdir(RUNS, { withFileTypes: true })).filter((entry) => entry.isDirectory()).map((entry) => entry.name).sort();
  assert.ok(dirs.length, 'run artifact required');
  return path.join(RUNS, dirs.at(-1));
}

async function readJson(dir, name) { return JSON.parse(await fs.readFile(path.join(dir, name), 'utf8')); }

test('evidence bundle binds identity, five-role lineage, and safety boundary', async () => {
  const dir = await latestRun();
  const manifest = await readJson(dir, 'evidence-manifest.json');
  const scorecard = await readJson(dir, 'scorecard.json');
  const snapshot = await readJson(dir, 'mission-control-snapshot.json');
  assert.deepEqual(manifest.files, REQUIRED);
  assert.equal(manifest.run_id, scorecard.run_id);
  assert.equal(manifest.correlation_id, snapshot.events[0].correlation_id);
  assert.equal(manifest.task_id, snapshot.task.id);
  assert.deepEqual(manifest.identities, ['Danny', 'Morgan', 'Rex', 'Dr. Sage', 'Juno']);
  assert.equal(scorecard.production_writes, false);
  assert.equal(scorecard.physical_vehicle_used, false);
  assert.equal(snapshot.task.status, 'in-review');
  assert.ok(snapshot.task.evidence.length >= 6);
  for (const name of REQUIRED) assert.ok((await fs.stat(path.join(dir, name))).size > 0, `${name} must be non-empty`);
});

test('handoff payload is complete and every event remains on the same run', async () => {
  const dir = await latestRun();
  const snapshot = await readJson(dir, 'mission-control-snapshot.json');
  const messages = snapshot.agentteams.messages;
  assert.equal(messages.length, 5);
  for (const message of messages) {
    assert.equal(message.run_id, snapshot.events[0].run_id);
    assert.ok(message.sender && message.recipient && message.kind);
    assert.ok(message.body?.data?.task_id || message.body?.data?.incident_id || message.body?.data?.action || message.body?.data?.verdict);
  }
  for (const event of snapshot.events) {
    assert.equal(event.run_id, snapshot.events[0].run_id);
    assert.equal(event.correlation_id, snapshot.events[0].correlation_id);
    assert.equal(event.task_id, snapshot.task.id);
  }
});

test('evidence validator rejects tampered content', async () => {
  const source = await latestRun();
  const temp = await fs.mkdtemp(path.join(ROOT, 'artifacts', 'evidence-test-'));
  await fs.cp(source, temp, { recursive: true });
  await fs.appendFile(path.join(temp, 'trace.jsonl'), '{"tampered":true}\n');
  await assert.rejects(() => validateEvidenceBundle(temp), /hash mismatch: trace.jsonl/);
  await fs.rm(temp, { recursive: true, force: true });
});
