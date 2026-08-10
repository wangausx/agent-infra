import fs from 'node:fs';
import path from 'node:path';
const root = path.resolve(new URL('..', import.meta.url).pathname);
const required = ['src/agents.mjs','src/agentteams-adapter.mjs','src/collaboration-runtime.mjs','src/contracts.mjs','src/isolated-mc-server.mjs','src/knowledge.mjs','src/metrics.mjs','src/mission-control-client.mjs','src/rollback.mjs','src/runtime.mjs','src/skills.mjs','src/tool-registry.mjs','src/trace.mjs','adapters/mission-control/client.mjs','scripts/agentteams-integration.mjs','scripts/demo.mjs','scripts/evaluate.mjs','scripts/integration.mjs','docs/disclosure.md','deploy/agentteams/team.yaml','deploy/isolated-demo.env'];
const missing = required.filter((file) => !fs.existsSync(path.join(root, file)));
if (missing.length) { console.error(`missing: ${missing.join(', ')}`); process.exit(1); }
for (const file of required) if (fs.statSync(path.join(root, file)).size === 0) { console.error(`empty: ${file}`); process.exit(1); }
const packageJson = JSON.parse(fs.readFileSync(path.join(root, 'package.json')));
for (const script of ['demo','evaluate','integration','package:check','test']) if (!packageJson.scripts?.[script]) { console.error(`missing npm script: ${script}`); process.exit(1); }
if (!fs.readFileSync(path.join(root, '.env.example'), 'utf8').includes('DRY_RUN=true')) { console.error('unsafe default: DRY_RUN=true missing'); process.exit(1); }
if (!fs.readFileSync(path.join(root, '.env.example'), 'utf8').includes('ALLOW_PRODUCTION_WRITES=false')) { console.error('unsafe default: production writes not denied'); process.exit(1); }
console.log(`package check passed: ${required.length} required artifacts`);
