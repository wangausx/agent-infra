import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';
import { loadTeamTemplate, validateTeamTemplate } from '../src/team-template.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

test('M4 team template validates named roles, policy, dependencies, and failures', async () => {
  const template = await loadTeamTemplate(path.join(ROOT, 'contracts', 'team-template.json'));
  assert.equal(template.spec.roles.length, 5);
  assert.equal(template.spec.approval_policy.self_attestation, false);
});

test('M4 team template rejects duplicate roles and missing interventions', () => {
  const base = { schema: 'agent-infra/team-template/v1', spec: { roles: [{name:'A',role:'x',runtime:'y',skills:[],tools:[]},{name:'A',role:'z',runtime:'y',skills:[],tools:[]}], approval_policy:{self_attestation:false,interventions:[]}, dependency_rules:[], failure_policy:[] } };
  assert.throws(() => validateTeamTemplate(base), /duplicate role/);
  base.spec.roles[1].name = 'B';
  assert.throws(() => validateTeamTemplate(base), /missing interventions/);
});
