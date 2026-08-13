import fs from 'node:fs/promises';

export const TEAM_TEMPLATE_SCHEMA = 'agent-infra/team-template/v1';
export const REQUIRED_INTERVENTIONS = Object.freeze(['approve', 'reject', 'pause', 'resume', 'retry', 'reassign', 'cancel']);

export function validateTeamTemplate(template) {
  if (!template || typeof template !== 'object') throw new TypeError('team template must be an object');
  if (template.schema !== TEAM_TEMPLATE_SCHEMA) throw new TypeError(`unsupported team template schema: ${template.schema}`);
  const spec = template.spec;
  if (!spec || !Array.isArray(spec.roles) || spec.roles.length < 2) throw new TypeError('team template requires roles');
  const names = new Set();
  for (const role of spec.roles) {
    for (const key of ['name', 'role', 'runtime']) if (!role[key]) throw new TypeError(`role missing ${key}`);
    if (names.has(role.name)) throw new TypeError(`duplicate role: ${role.name}`);
    names.add(role.name);
    if (!Array.isArray(role.skills) || !Array.isArray(role.tools)) throw new TypeError(`role ${role.name} requires skills and tools`);
  }
  if (!spec.approval_policy || typeof spec.approval_policy !== 'object') throw new TypeError('approval_policy required');
  if (spec.approval_policy.self_attestation !== false) throw new TypeError('self_attestation must be false');
  if (!Array.isArray(spec.dependency_rules) || !Array.isArray(spec.failure_policy)) throw new TypeError('dependency_rules and failure_policy required');
  const missing = REQUIRED_INTERVENTIONS.filter((item) => !spec.approval_policy.interventions?.includes(item));
  if (missing.length) throw new TypeError(`missing interventions: ${missing.join(',')}`);
  return template;
}

export async function loadTeamTemplate(file) {
  return validateTeamTemplate(JSON.parse(await fs.readFile(file, 'utf8')));
}
