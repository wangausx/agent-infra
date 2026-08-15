import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import test from 'node:test';
import {
  loadVehicleAutonomyTeam,
} from '../src/operational-collaboration.mjs';

const root = new URL('..', import.meta.url);
async function load(name) {
  return JSON.parse(await fs.readFile(new URL(`contracts/${name}`, root), 'utf8'));
}

test('vehicle autonomy has distinct domain agents with bounded responsibilities', async () => {
  const team = await loadVehicleAutonomyTeam();
  assert.equal(team.schema, 'agent-infra/vehicle-autonomy-agent-team/v1');
  assert.equal(team.metadata.scenario_id, 'autonomy-sensor-fusion');
  assert.equal(team.agents.length, 8);
  assert.equal(new Set(team.agents.map((agent) => agent.identity)).size, team.agents.length);
  assert.ok(team.agents.every((agent) => agent.identity.startsWith('Vehicle-')));
  assert.ok(team.agents.every((agent) => agent.inputs.length && agent.actions.length && agent.outputs.length && agent.artifacts.length));
  assert.ok(team.agents.every((agent) => agent.conditions && agent.authority && agent.host_mapping));
});

test('vehicle autonomy agents preserve separation of duty and safety boundary', async () => {
  const team = await load('vehicle-autonomy-agent-team-v1.json');
  assert.deepEqual(team.invariants, [
    'simulation_only=true',
    'production_writes=false',
    'physical_vehicle_connected=false',
    'policy_precedes_action',
    'verification_reads_observed_state',
    'rejected_evidence_is_retained_not_promoted',
    'run_id_and_correlation_id_are_preserved',
  ]);
  const policy = team.agents.find((agent) => agent.identity === 'Vehicle-Safety-Policy');
  const recovery = team.agents.find((agent) => agent.identity === 'Vehicle-Recovery');
  const verifier = team.agents.find((agent) => agent.identity === 'Vehicle-Independent-Verification');
  assert.ok(policy.authority.may.includes('approve'));
  assert.ok(policy.authority.must_not.includes('execute_action'));
  assert.ok(recovery.authority.must_not.includes('bypass_policy'));
  assert.ok(verifier.authority.must_not.includes('trust_executor_claim'));
});

test('vehicle autonomy flow documentation and package architecture entry point exist', async () => {
  for (const file of ['ARCHITECTURE.md', 'DISCLOSURE.md']) {
    const content = await fs.readFile(new URL(`../${file}`, import.meta.url), 'utf8');
    assert.match(content, /mermaid/);
    assert.match(content, /input|Input/);
    assert.match(content, /artifact|Artifact/);
  }
});
