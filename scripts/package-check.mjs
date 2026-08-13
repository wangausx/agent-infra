import fs from 'node:fs';
import path from 'node:path';

const root = path.resolve(new URL('..', import.meta.url).pathname);
const required = [
  'README.md', 'package.json', '.env.example', 'docs/disclosure.md',
  'docs/solution-architecture.md', 'docs/m5-package.md', 'docs/agent-identity-list.md', 'docs/skill-checklist.md', 'docs/threat-model.md',
  'artifacts/trustops-solution-architecture.html',
  'scenarios/autonomy-sensor-fusion/fixture.mjs',
  'scenarios/autonomy-sensor-fusion/alerts.json',
  'scenarios/autonomy-sensor-fusion/expected-report.json',
  'scenarios/autonomy-sensor-fusion/failure-cases.json',
  'deploy/agentteams/team.yaml', 'deploy/isolated-demo.env',
  'scripts/setup.mjs', 'scripts/zero-touch.mjs', 'scripts/validate-evidence.mjs', 'scripts/package.mjs'
];
const missing = required.filter((file) => !fs.existsSync(path.join(root, file)));
if (missing.length) { console.error(JSON.stringify({ package: 'FAIL', missing }, null, 2)); process.exit(1); }
const expected = JSON.parse(fs.readFileSync(path.join(root, 'scenarios/autonomy-sensor-fusion/expected-report.json')));
const fixture = JSON.parse(fs.readFileSync(path.join(root, 'scenarios/autonomy-sensor-fusion/alerts.json')));
const failures = JSON.parse(fs.readFileSync(path.join(root, 'scenarios/autonomy-sensor-fusion/failure-cases.json')));
const authoritativeCategories = ['timeout', 'stale-claim', 'duplicate-retry', 'rejected-approval', 'tool-failure', 'verifier-disagreement', 'rollback-failure', 'restart-adoption', 'dependency-blockage', 'reassignment'];
const declaredCategories = failures.map((item) => item.category).filter(Boolean);
const categoriesCovered = authoritativeCategories.map((category) => ({ category, covered: declaredCategories.includes(category) }));
const packageRoots = path.join(root, 'artifacts', 'packages');
const latestPackage = fs.existsSync(packageRoots) ? fs.readdirSync(packageRoots, { withFileTypes: true }).filter((entry) => entry.isDirectory()).map((entry) => entry.name).sort().at(-1) : null;
const packageDir = latestPackage ? path.join(packageRoots, latestPackage) : null;
const packageRequired = ['package.json', '.env.example', '.github/workflows/ci.yml', 'scripts/setup.mjs', 'scripts/package.mjs', 'src/runtime.mjs', 'scenarios/autonomy-sensor-fusion/expected-report.json', 'package-manifest.json'];
const package_runnable = Boolean(packageDir && packageRequired.every((file) => fs.existsSync(path.join(packageDir, file))));
const checks = {
  fixture_versioned: expected.schema === 'agent-infra/autonomy-expected-report/v1' && expected.seed === 'autonomy-sensor-fusion-001',
  fixture_count_matches: fixture.length === expected.raw_alert_count,
  failure_matrix_complete: failures.length === 10,
  safety_defaults: fs.readFileSync(path.join(root, '.env.example'), 'utf8').includes('DRY_RUN=true') && fs.readFileSync(path.join(root, '.env.example'), 'utf8').includes('ALLOW_PRODUCTION_WRITES=false'),
  architecture_present: fs.statSync(path.join(root, 'artifacts/trustops-solution-architecture.html')).size > 1000,
  generated_package_runnable: package_runnable,
  authoritative_failure_categories: categoriesCovered.every((item) => item.covered)
};
const failed = Object.entries(checks).filter(([, value]) => !value);
console.log(JSON.stringify({ package: failed.length ? 'FAIL' : 'PASS', required_files: required.length, checks }, null, 2));
if (failed.length) process.exit(1);
