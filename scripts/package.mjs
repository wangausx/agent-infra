import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';

const root = path.resolve(new URL('..', import.meta.url).pathname);
const packageRoots = path.join(root, 'artifacts', 'packages');
fs.rmSync(packageRoots, { recursive: true, force: true });
const run = (args) => { const r = spawnSync('npm', args, { cwd: root, stdio: 'inherit', env: { ...process.env, CI: 'true' } }); if (r.status !== 0) process.exit(r.status ?? 1); };
const commands = [['run', 'setup'], ['run', 'check'], ['test'], ['run', 'integration'], ['run', 'evaluate'], ['run', 'zero-touch:reset'], ['run', 'zero-touch'], ['run', 'zero-touch:validate'], ['run', 'zero-touch:replay'], ['run', 'zero-touch:evaluate']];
for (const args of commands) { console.log(`\n$ npm ${args.join(' ')}`); run(args); }
const runRoot = path.join(root, 'artifacts', 'runs');
const runs = fs.readdirSync(runRoot, { withFileTypes: true }).filter((entry) => entry.isDirectory()).map((entry) => entry.name).sort();
const runId = runs.at(-1); if (!runId) throw new Error('no run artifact generated');
const source = path.join(runRoot, runId); const packageDir = path.join(root, 'artifacts', 'packages', `m5-${runId}`);
fs.rmSync(packageDir, { recursive: true, force: true }); fs.mkdirSync(packageDir, { recursive: true });
const copies = ['package.json', 'package-lock.json', '.env.example', '.github', 'README.md', 'scripts', 'src', 'evals', 'adapters', 'agents', 'skills', 'tools', 'contracts', 'docs', 'deploy', 'scenarios', 'artifacts/trustops-solution-architecture.html'];
for (const file of copies) { const from = path.join(root, file); if (!fs.existsSync(from)) continue; const target = path.join(packageDir, file); fs.mkdirSync(path.dirname(target), { recursive: true }); fs.cpSync(from, target, { recursive: true }); }
const packagedRunDir = path.join(packageDir, 'artifacts', 'runs', runId);
fs.mkdirSync(packagedRunDir, { recursive: true });
for (const file of fs.readdirSync(source)) fs.cpSync(path.join(source, file), path.join(packagedRunDir, file), { recursive: true });
const manifest = { schema: 'agent-infra/m5-package/v1', run_id: runId, package_dir: packageDir, generated_at: new Date().toISOString(), production_writes: false, physical_vehicle_used: false, runnable: true, required_commands: ['npm run setup', 'npm test', 'npm run zero-touch'] };
fs.writeFileSync(path.join(packageDir, 'package-manifest.json'), `${JSON.stringify(manifest, null, 2)}\n`);
const countFiles = (dir) => fs.readdirSync(dir, { withFileTypes: true }).reduce((count, entry) => count + (entry.isDirectory() ? countFiles(path.join(dir, entry.name)) : 1), 0);
const packageCheck = spawnSync('npm', ['run', 'package:check'], { cwd: root, stdio: 'inherit', env: { ...process.env, CI: 'true' } });
if (packageCheck.status !== 0) process.exit(packageCheck.status ?? 1);
console.log(JSON.stringify({ package: 'PASS', run_id: runId, package_dir: packageDir, files: countFiles(packageDir) }, null, 2));
