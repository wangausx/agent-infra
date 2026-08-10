import { makeEvidence } from './contracts.mjs';

export const skills = Object.freeze({
  'safe-remediation': Object.freeze({ name: 'safe-remediation', version: '1.0.0', requiresApproval: true, dryRunDefault: true }),
  'rollback-action': Object.freeze({ name: 'rollback-action', version: '1.0.0', requiresApproval: true, dryRunDefault: true }),
  'evidence-bundle': Object.freeze({ name: 'evidence-bundle', version: '1.0.0', requiresApproval: false, dryRunDefault: true })
});

export function executeSkill(name, { taskId, action, dryRun = true, approved = false, rollback }) {
  const skill = skills[name];
  if (!skill) throw new Error(`unknown skill: ${name}`);
  if (skill.requiresApproval && !dryRun && !approved) throw new Error(`approval required for skill: ${name}`);
  const result = { status: dryRun ? 'simulated' : 'executed', action, skill: name };
  const evidence = makeEvidence({ taskId, action, result, dryRun, approved });
  if (rollback) rollback.register(`${name}:${action}`, async () => ({ status: 'compensated', action }));
  return { result, evidence };
}
