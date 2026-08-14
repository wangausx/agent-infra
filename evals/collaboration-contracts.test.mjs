import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import test from 'node:test';

const root = new URL('..', import.meta.url);
async function load(name) { return JSON.parse(await fs.readFile(new URL(`contracts/${name}`, root), 'utf8')); }

test('collaboration skill manifest covers reusable workflow skills and fail-closed boundaries', async () => {
  const manifest = await load('collaboration-skill-manifest-v1.json');
  assert.equal(manifest.schema, 'agent-infra/collaboration-skill-manifest/v1');
  assert.ok(manifest.skills.length >= 6);
  for (const skill of manifest.skills) {
    for (const field of ['id','purpose','inputs','outputs','invocation','dependent_tools','failure_handling','security_boundary','reusable_for','workflow_relationship']) assert.ok(skill[field], `${skill.id} missing ${field}`);
    assert.deepEqual(skill.reusable_for.sort(), ['autonomy', 'payment']);
    assert.match(skill.security_boundary, /read-only|simulation|authorization|append-only|cannot mutate/i);
  }
});

test('AgentTeams runtime map covers every lifecycle stage and safety invariants', async () => {
  const map = await load('agentteams-operational-runtime-map-v1.json');
  assert.equal(map.runtime, 'AgentTeams');
  assert.deepEqual(map.stages.map((stage) => stage.stage), ['ALERT','INCIDENT','RCA','POLICY','ACTION','VERIFY','POSTMORTEM','REVIEW']);
  assert.ok(map.stages.every((stage) => stage.primitive && stage.agent && stage.artifact));
  assert.ok(map.invariants.includes('production_writes=false'));
  assert.ok(map.invariants.includes('verification reads observed state'));
});
