import { createHash } from 'node:crypto';
import { readdir, readFile, stat, writeFile, mkdir } from 'node:fs/promises';
import path from 'node:path';
import { assertValidEpisode } from './episode-contract.mjs';
import { buildEpisodeClaims } from './episode-claims.mjs';

const MANIFEST_NAME = 'evidence-manifest.json';
const JSON_FILES = new Set([
  'incident.json',
  'rca-report.json',
  'policy-decision.json',
  'action-result.json',
  'verifier-report.json',
  'metrics.json',
  'scorecard.json',
  'mission-control-snapshot.json',
  'replay-recording.json',
  'disclosure.json'
]);

const sha256 = (bytes) => createHash('sha256').update(bytes).digest('hex');

async function readJson(filePath) {
  return JSON.parse(await readFile(filePath, 'utf8'));
}

function failure(runPath, runId, reason, details = {}) {
  return {
    status: 'quarantined',
    run_id: runId ?? path.basename(runPath),
    source_dir: runPath,
    reason,
    ...details
  };
}

function parseJsonLines(name, text, runPath, runId) {
  const rows = [];
  for (const [index, line] of text.split(/\r?\n/).entries()) {
    if (!line.trim()) continue;
    try {
      rows.push(JSON.parse(line));
    } catch (error) {
      throw new Error(`${name}:${index + 1}: invalid JSON (${error.message})`);
    }
  }
  return rows;
}

async function loadAndVerifyFiles(runPath, manifest) {
  const fileNames = [...new Set(manifest.files ?? [])];
  const loaded = {};
  const mismatches = [];
  for (const name of fileNames) {
    const filePath = path.join(runPath, name);
    let bytes;
    try {
      bytes = await readFile(filePath);
    } catch {
      mismatches.push({ file: name, reason: 'missing' });
      continue;
    }
    const expected = manifest.sha256?.[name];
    const actual = sha256(bytes);
    // The manifest cannot safely contain its own precomputed hash. Its bytes are
    // still read and parsed, while every other listed artifact must be hashed.
    if (name === MANIFEST_NAME && !expected) {
      loaded[name] = JSON.parse(bytes.toString('utf8'));
      continue;
    }
    if (!expected || expected !== actual) {
      mismatches.push({ file: name, reason: expected ? 'hash-mismatch' : 'hash-missing', expected, actual });
      continue;
    }
    if (name.endsWith('.json')) loaded[name] = JSON.parse(bytes.toString('utf8'));
    else if (name.endsWith('.jsonl')) loaded[name] = parseJsonLines(name, bytes.toString('utf8'), runPath, manifest.run_id);
    else loaded[name] = bytes.toString('utf8');
  }
  return { loaded, mismatches };
}

export async function collectEpisodeFromRun(runPath) {
  const manifestPath = path.join(runPath, MANIFEST_NAME);
  let manifest;
  try {
    manifest = await readJson(manifestPath);
  } catch (error) {
    return failure(runPath, undefined, 'manifest-unreadable', { detail: error.message });
  }

  const runId = manifest.run_id;
  if (!runId || !manifest.correlation_id || !Array.isArray(manifest.files) || !manifest.sha256) {
    return failure(runPath, runId, 'manifest-contract-invalid', {
      required: ['run_id', 'correlation_id', 'files', 'sha256']
    });
  }
  if (!String(manifest.schema ?? '').startsWith('agent-infra/evidence-manifest/')) {
    return failure(runPath, runId, 'manifest-schema-unsupported', { schema: manifest.schema });
  }

  let verified;
  try {
    verified = await loadAndVerifyFiles(runPath, manifest);
  } catch (error) {
    return failure(runPath, runId, 'artifact-unreadable', { detail: error.message });
  }
  if (verified.mismatches.length) {
    return failure(runPath, runId, 'artifact-integrity-failed', { files: verified.mismatches });
  }

  const files = verified.loaded;
  const scorecard = files['scorecard.json'] ?? {};
  const verifier = files['verifier-report.json'] ?? {};
  const policy = files['policy-decision.json'] ?? {};
  const action = files['action-result.json'] ?? {};
  const rca = files['rca-report.json'] ?? {};
  const incident = files['incident.json'] ?? {};
  const outcomeStatus = verifier.verdict === 'PASS' && scorecard.verdict === 'PASS' ? 'verified' : 'rejected';

  const episode = {
    status: 'accepted',
    schema: 'agent-infra/operational-episode/v1',
    episode_id: runId,
    run_id: runId,
    correlation_id: manifest.correlation_id,
    source: {
      manifest_schema: manifest.schema,
      source_dir: runPath,
      files: manifest.files,
      sha256: manifest.sha256
    },
    context: {
      seed: manifest.seed ?? null,
      scenario: scorecard.scenario ?? manifest.safety?.scenario ?? null,
      project_id: manifest.project_id ?? null,
      task_id: manifest.task_id ?? null,
      team_id: manifest.team_id ?? null,
      room_id: manifest.room_id ?? null
    },
    identities: manifest.identities ?? [],
    claims: buildEpisodeClaims({ runId, rca, policy, action, verifier }),
    observations: {
      incident,
      safety: manifest.safety ?? {},
      trajectory: files['trace.jsonl'] ?? []
    },
    hypotheses: {
      selected_cause: rca.selected_cause ?? null,
      candidates: rca.hypotheses ?? [],
      evidence_complete: rca.evidence_complete ?? false,
      evidence_class: 'observational'
    },
    decision: {
      policy,
      authority: {
        production_writes: manifest.safety?.production_writes ?? null,
        physical_vehicle_used: manifest.safety?.physical_vehicle_used ?? null,
        approval_required: policy.approval_required ?? null
      }
    },
    action: {
      selected: action.action ?? policy.action ?? null,
      executed: action.executed ?? false,
      before_state: action.before_state ?? null,
      after_state: action.after_state ?? null,
      reversible: action.reversible ?? null,
      rollback: action.compensation ?? null
    },
    verification: {
      verdict: verifier.verdict ?? null,
      checks: verifier.checks ?? [],
      evidence: verifier.evidence ?? []
    },
    outcomes: {
      immediate: outcomeStatus,
      delayed: 'unknown',
      recurrence: 'unknown',
      time_to_recovery_ms: files['metrics.json']?.duration_ms ?? null,
      collateral_impact: 'unknown',
      human_override: 'unknown',
      business_impact: 'unknown',
      unknown_fields: ['delayed', 'recurrence', 'collateral_impact', 'human_override', 'business_impact']
    },
    versions: {
      evidence_manifest: manifest.schema,
      scorecard: scorecard.schema ?? null
    },
    privacy: {
      classification: 'internal-synthetic',
      redaction_status: 'not-required',
      retention_days: 30,
      access_roles: ['agent-infra-reviewer'],
      retention_status: 'pending-review'
    },
    dataset_membership: {
      status: 'pending-review',
      eligible_for_training: false,
      reason: 'human outcome and privacy review required'
    }
  };
  try {
    assertValidEpisode(episode);
  } catch (error) {
    return failure(runPath, runId, 'episode-contract-invalid', { detail: error.message });
  }
  return episode;
}

async function listRunDirectories(runsRoot) {
  const entries = await readdir(runsRoot, { withFileTypes: true });
  return entries.filter((entry) => entry.isDirectory()).map((entry) => path.join(runsRoot, entry.name)).sort();
}

export async function collectEpisodes({ runsRoot, outputPath, quarantinePath }) {
  const runs = await listRunDirectories(runsRoot);
  const episodes = [];
  const quarantined = [];
  for (const runPath of runs) {
    const result = await collectEpisodeFromRun(runPath);
    if (result.status === 'accepted') episodes.push(result);
    else quarantined.push(result);
  }
  episodes.sort((a, b) => a.run_id.localeCompare(b.run_id));
  if (outputPath) {
    await mkdir(path.dirname(outputPath), { recursive: true });
    await writeFile(outputPath, episodes.map((episode) => JSON.stringify(episode)).join('\n') + (episodes.length ? '\n' : ''));
  }
  if (quarantinePath) {
    await mkdir(path.dirname(quarantinePath), { recursive: true });
    await writeFile(quarantinePath, quarantined.map((item) => JSON.stringify(item)).join('\n') + (quarantined.length ? '\n' : ''));
  }
  return { episodes, quarantined };
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const args = new Map();
  for (let index = 2; index < process.argv.length; index += 2) args.set(process.argv[index], process.argv[index + 1]);
  const runsRoot = args.get('--runs-root') ?? path.resolve('artifacts/runs');
  const outputPath = args.get('--out') ?? path.resolve('artifacts/datasets/episodes-v1.jsonl');
  const quarantinePath = args.get('--quarantine') ?? path.resolve('artifacts/datasets/quarantine-v1.jsonl');
  const result = await collectEpisodes({ runsRoot, outputPath, quarantinePath });
  console.log(JSON.stringify({ runs: result.episodes.length + result.quarantined.length, accepted: result.episodes.length, quarantined: result.quarantined.length, outputPath, quarantinePath }));
}
