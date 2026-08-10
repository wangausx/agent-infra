import fs from 'node:fs';
import path from 'node:path';
const root = path.resolve(new URL('..', import.meta.url).pathname);
const required = ['src/agents.mjs','src/contracts.mjs','src/knowledge.mjs','src/mission-control-client.mjs','src/rollback.mjs','src/runtime.mjs','src/skills.mjs','src/tool-registry.mjs','src/trace.mjs','adapters/mission-control/client.mjs','scripts/demo.mjs','scripts/evaluate.mjs','docs/disclosure.md','deploy/isolated-demo.env'];
const missing = required.filter((file) => !fs.existsSync(path.join(root, file)));
if (missing.length) { console.error(`missing: ${missing.join(', ')}`); process.exit(1); }
for (const file of required) if (fs.statSync(path.join(root, file)).size === 0) { console.error(`empty: ${file}`); process.exit(1); }
const packageJson = JSON.parse(fs.readFileSync(path.join(root, 'package.json')));
for (const script of ['demo','evaluate','package:check','test']) if (!packageJson.scripts?.[script]) { console.error(`missing npm script: ${script}`); process.exit(1); }
if (!fs.readFileSync(path.join(root, '.env.example'), 'utf8').includes('DRY_RUN=true')) { console.error('unsafe default: DRY_RUN=true missing'); process.exit(1); }
console.log(`package check passed: ${required.length} required artifacts`);
