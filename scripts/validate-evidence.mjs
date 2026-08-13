import fs from 'node:fs/promises';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';

export const REQUIRED_FILES = Object.freeze(['scorecard.json','incident.json','suppression-evidence.jsonl','rca-report.json','policy-decision.json','action-result.json','verifier-report.json','postmortem.md','trace.jsonl','intervention-ledger.jsonl','mission-control-snapshot.json','evidence-manifest.json','metrics.json','replay-recording.json','disclosure.json']);
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const runs = path.join(ROOT, 'artifacts', 'runs');
const text = (value) => typeof value === 'string' && value.length > 0;
const json = (value, name) => { try { return JSON.parse(value); } catch (error) { throw new Error(`${name}: invalid JSON (${error.message})`); } };
function assertPath(name) {
  if (path.basename(name) !== name || name.includes('..') || path.isAbsolute(name)) throw new Error(`manifest path invalid: ${name}`);
}
function parseJsonl(raw, name) {
  const lines = raw.split(/\r?\n/).filter((line) => line.trim());
  if (!lines.length) throw new Error(`${name}: empty JSONL`);
  return lines.map((line, index) => json(line, `${name}:${index + 1}`));
}

export async function validateEvidenceBundle(dir) {
  const names = (await fs.readdir(dir, { withFileTypes: true })).filter((entry) => entry.isFile()).map((entry) => entry.name).sort();
  const manifest = json(await fs.readFile(path.join(dir, 'evidence-manifest.json'), 'utf8'), 'evidence-manifest.json');
  if (manifest.schema !== 'agent-infra/evidence-manifest/v2') throw new Error('manifest schema invalid');
  if (!text(manifest.run_id) || !text(manifest.correlation_id) || !text(manifest.task_id)) throw new Error('manifest lineage incomplete');
  if (!Array.isArray(manifest.files) || JSON.stringify(manifest.files) !== JSON.stringify(REQUIRED_FILES)) throw new Error('manifest file list invalid');
  for (const name of manifest.files) assertPath(name);
  if (JSON.stringify(names) !== JSON.stringify([...REQUIRED_FILES].sort())) throw new Error('bundle paths do not match manifest');
  const parsed = {};
  for (const name of REQUIRED_FILES) {
    const data = await fs.readFile(path.join(dir, name));
    if (!data.length) throw new Error(`${name}: empty`);
    if (name.endsWith('.json')) parsed[name] = json(data.toString('utf8'), name);
    if (name.endsWith('.jsonl')) parsed[name] = parseJsonl(data.toString('utf8'), name);
    if (name === 'postmortem.md' && !data.toString('utf8').includes(manifest.run_id)) throw new Error('postmortem disclosure missing run_id');
  }
  const hashed = REQUIRED_FILES.filter((name) => name !== 'evidence-manifest.json');
  if (!manifest.sha256 || Object.keys(manifest.sha256).sort().join() !== hashed.slice().sort().join()) throw new Error('manifest hash coverage invalid');
  for (const name of hashed) {
    const actual = crypto.createHash('sha256').update(await fs.readFile(path.join(dir, name))).digest('hex');
    if (manifest.sha256[name] !== actual) throw new Error(`hash mismatch: ${name}`);
  }
  const snapshot = parsed['mission-control-snapshot.json'];
  const scorecard = parsed['scorecard.json'];
  if (scorecard.schema !== 'agent-infra/zero-touch-scorecard/v1' || scorecard.verdict !== 'PASS') throw new Error('scorecard schema/verdict invalid');
  if (scorecard.run_id !== manifest.run_id || scorecard.production_writes !== false || scorecard.physical_vehicle_used !== false) throw new Error('scorecard lineage/safety invalid');
  if (snapshot.task?.id !== manifest.task_id || !Array.isArray(snapshot.events)) throw new Error('snapshot schema invalid');
  const events = [...snapshot.events, ...parsed['trace.jsonl']];
  for (const event of events) if (event.run_id !== manifest.run_id || event.correlation_id !== manifest.correlation_id || event.task_id !== manifest.task_id) throw new Error('event lineage invalid');
  const messages = snapshot.agentteams?.messages ?? [];
  if (!messages.length) throw new Error('handoff disclosure missing');
  for (const message of messages) if (message.run_id !== manifest.run_id || message.correlation_id !== manifest.correlation_id) throw new Error('handoff lineage invalid');
  const disclosure = parsed['disclosure.json'];
  if (!Array.isArray(disclosure.unavailable_tests) || !text(disclosure.reason)) throw new Error('disclosure schema invalid');
  const raw = await Promise.all(REQUIRED_FILES.map((name) => fs.readFile(path.join(dir, name), 'utf8')));
  if (raw.some((content) => /(api[_-]?key|access[_-]?token|password|secret)\s*[:=]/i.test(content))) throw new Error('credential-like field found in evidence bundle');
  return { dir, manifest };
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const entries = await fs.readdir(runs, { withFileTypes: true }).catch(() => []);
  const run = entries.filter((entry) => entry.isDirectory()).sort((a, b) => a.name.localeCompare(b.name)).at(-1);
  if (!run) throw new Error('no zero-touch run artifact found; run npm run zero-touch first');
  await validateEvidenceBundle(path.join(runs, run.name));
  console.log(`evidence bundle passed: ${path.join(runs, run.name)}`);
}
