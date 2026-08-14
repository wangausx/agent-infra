import fs from 'node:fs/promises';
import path from 'node:path';
import crypto from 'node:crypto';

const ROOT = path.resolve(new URL('.', import.meta.url).pathname, '..');
const TEAM_FILE = path.join(ROOT, 'contracts', 'operational-agent-team.json');
const VEHICLE_TEAM_FILE = path.join(ROOT, 'contracts', 'vehicle-autonomy-agent-team-v1.json');
const HOSTS = new Map([
  ['Signal-Incident', 'Morgan'], ['RCA-TimeSync', 'Morgan'], ['RCA-Calibration', 'Morgan'], ['RCA-Environment', 'Morgan'],
  ['Policy-Safety', 'Danny'], ['Remediation', 'Rex'], ['Independent-Verification', 'Dr. Sage'],
  ['Learning-Postmortem', 'Juno'], ['Operations-Review', 'Juno'],
]);
const STAGES = Object.freeze(['ALERT', 'INCIDENT', 'RCA', 'POLICY', 'ACTION', 'VERIFY', 'POSTMORTEM', 'REVIEW']);
const hash = (value) => crypto.createHash('sha256').update(JSON.stringify(value)).digest('hex').slice(0, 16);

export async function loadOperationalTeam(file = TEAM_FILE) {
  const team = JSON.parse(await fs.readFile(file, 'utf8'));
  if (team.schema !== 'agent-infra/operational-agent-team/v1') throw new TypeError('unsupported operational team schema');
  if (!Array.isArray(team.operational_agents) || team.operational_agents.length < 3) throw new TypeError('at least three operational agents required');
  const identities = new Set(team.operational_agents.map((agent) => agent.identity));
  if (identities.size !== team.operational_agents.length) throw new TypeError('duplicate operational identity');
  for (const agent of team.operational_agents) {
    for (const field of ['identity', 'layer', 'stage', 'objective', 'inputs', 'outputs', 'skills', 'tools', 'authority', 'prohibited_actions', 'failure_behavior', 'escalation', 'host_mapping']) if (agent[field] === undefined) throw new TypeError(`operational agent missing ${field}`);
    if (agent.layer !== 'operational') throw new TypeError(`operational agent ${agent.identity} has invalid layer`);
  }
  const hosts = JSON.parse(await fs.readFile(path.join(path.dirname(file), 'infrastructure-agent-team.json'), 'utf8'));
  return { ...team, infrastructure_hosts: hosts.infrastructure_hosts };
}

export async function loadVehicleAutonomyTeam(file = VEHICLE_TEAM_FILE) {
  const team = JSON.parse(await fs.readFile(file, 'utf8'));
  if (team.schema !== 'agent-infra/vehicle-autonomy-agent-team/v1' || team.metadata?.scenario_id !== 'autonomy-sensor-fusion') throw new TypeError('unsupported vehicle autonomy team schema');
  if (!Array.isArray(team.agents) || team.agents.length < 3) throw new TypeError('at least three vehicle autonomy agents required');
  const identities = new Set(team.agents.map((agent) => agent.identity));
  if (identities.size !== team.agents.length) throw new TypeError('duplicate vehicle autonomy identity');
  for (const agent of team.agents) {
    for (const field of ['identity', 'stage', 'responsibility', 'inputs', 'actions', 'outputs', 'artifacts', 'conditions', 'authority', 'skills', 'tools', 'host_mapping']) if (agent[field] === undefined) throw new TypeError(`vehicle autonomy agent missing ${field}`);
    if (!agent.identity.startsWith('Vehicle-')) throw new TypeError(`non-domain identity ${agent.identity}`);
  }
  return team;
}

export function buildOperationalDecomposition({ runId, correlationId, incident } = {}) {
  if (!runId || !correlationId || !incident?.id) throw new TypeError('runId, correlationId, and incident.id are required');
  const stageIds = Object.fromEntries(STAGES.map((stage) => [stage, `${stage.toLowerCase()}-${hash(`${runId}:${stage}`)}`]));
  const rca = ['RCA-TimeSync', 'RCA-Calibration', 'RCA-Environment'].map((agent, index) => ({ id: `rca-${index + 1}-${hash(agent)}`, stage: 'RCA', agent, depends_on: [incident.id], run_id: runId, correlation_id: correlationId }));
  const subtasks = [{ id: stageIds.ALERT, stage: 'ALERT', agent: 'Signal-Incident', depends_on: [] }, { id: incident.id, stage: 'INCIDENT', agent: 'Signal-Incident', depends_on: [stageIds.ALERT] }, ...rca, { id: stageIds.POLICY, stage: 'POLICY', agent: 'Policy-Safety', depends_on: rca.map((task) => task.id) }, { id: stageIds.ACTION, stage: 'ACTION', agent: 'Remediation', depends_on: [stageIds.POLICY] }, { id: stageIds.VERIFY, stage: 'VERIFY', agent: 'Independent-Verification', depends_on: [stageIds.ACTION] }, { id: stageIds.POSTMORTEM, stage: 'POSTMORTEM', agent: 'Learning-Postmortem', depends_on: [stageIds.VERIFY] }, { id: stageIds.REVIEW, stage: 'REVIEW', agent: 'Operations-Review', depends_on: [stageIds.POSTMORTEM] }].map((task) => ({ ...task, run_id: runId, correlation_id: correlationId, state: 'planned' }));
  return { schema: 'agent-infra/operational-decomposition/v1', run_id: runId, correlation_id: correlationId, stages: STAGES.map((stage) => ({ stage, id: stageIds[stage] })), subtasks };
}

export function runParallelRca({ incident, state } = {}) {
  if (!incident?.id || !Number.isInteger(incident.context_version)) throw new TypeError('incident with context_version is required');
  const base = { incident_id: incident.id, context_version: incident.context_version, state_hash: hash(state ?? {}) };
  const hypotheses = [{ agent_identity: 'RCA-TimeSync', recommendation: 'resynchronize', confidence: 0.91, supporting: ['timestamp-skew'], disconfirming: ['calibration-within-tolerance'], ...base }, { agent_identity: 'RCA-Calibration', recommendation: 'recalibrate', confidence: 0.58, supporting: ['minor-drift'], disconfirming: ['timestamp-skew-dominant'], ...base }, { agent_identity: 'RCA-Environment', recommendation: 'hold-for-environment', confidence: 0.22, supporting: [], disconfirming: ['controlled-simulation'], ...base }];
  return { hypotheses, adjudication: { selected: 'RCA-TimeSync', rejected: hypotheses.slice(1).map((item) => item.agent_identity), input_hash: hash(hypotheses) } };
}

export function createHandoff(input = {}) {
  const runId = input.runId ?? input.run_id;
  const correlationId = input.correlationId ?? input.correlation_id;
  const taskId = input.taskId ?? input.task_id;
  const sender = input.sender;
  const recipient = input.recipient;
  const permittedAction = input.permittedAction ?? input.permitted_action;
  const rollbackCondition = input.rollbackCondition ?? input.rollback_condition;
  const priorVersion = Number.isInteger(input.context_version) ? input.context_version : 0;
  const requestedVersion = input.contextVersion ?? input.context_version;
  if (Number.isInteger(priorVersion) && Number.isInteger(requestedVersion) && requestedVersion < priorVersion) throw new TypeError('stale context version');
  if (!Number.isInteger(requestedVersion) || requestedVersion < 1) throw new TypeError('context version is required');
  if (Number.isInteger(input.previousContextVersion) && requestedVersion < input.previousContextVersion) throw new TypeError('stale context version');
  if (!runId || !correlationId || !taskId || !sender || !recipient || !permittedAction || !rollbackCondition) throw new TypeError('handoff lineage, identity, authority, and rollback fields are required');
  return { schema: 'agent-infra/agent-handoff-v1', handoff_id: `handoff-${hash(input)}`, run_id: runId, correlation_id: correlationId, task_id: taskId, sender, recipient, layer: 'operational', context_version: requestedVersion, input_artifacts: [...(input.inputArtifacts ?? input.input_artifacts ?? [])], permitted_action: permittedAction, rollback_condition: rollbackCondition, host: { identity: HOSTS.get(sender) ?? HOSTS.get(recipient) ?? 'Morgan', layer: 'infrastructure' } };
}

export function evaluatePolicy({ recommendation, safety, reversible } = {}) {
  if (!recommendation || !safety) throw new TypeError('recommendation and safety are required');
  const safe = safety.simulation_only === true && safety.production_writes === false && reversible === true;
  return { decision: safe && recommendation === 'resynchronize' ? 'approve' : 'reject', rationale: safe ? 'bounded reversible simulation action' : 'unsafe, non-reversible, or prohibited action', risk: safe ? 'low' : 'high', authorization: safe ? `policy-${hash({ recommendation, safety })}` : null };
}

export function runIndependentVerification({ observed, executor } = {}) {
  if (!observed || !executor) throw new TypeError('observed and executor are required');
  const passed = observed.synchronized === true && Number(observed.localization_confidence) >= 0.9;
  return { verifier_identity: 'Independent-Verification', observed_hash: hash(observed), executor_claim_ignored: executor.claimed ?? null, verdict: passed ? 'passed' : 'rejected', compensation: { required: !passed, reason: passed ? null : 'invariants not satisfied' } };
}

export function finalizeReview({ verifier, postmortem } = {}) {
  if (verifier?.verdict !== 'passed') throw new Error('knowledge requires verifier-approved evidence');
  if (!postmortem?.lesson) throw new TypeError('postmortem lesson is required');
  return { review: 'sealed', knowledge: { lesson: postmortem.lesson, sources: [...(verifier.evidence ?? [])], accepted_only: true }, rejected_evidence: [] };
}
