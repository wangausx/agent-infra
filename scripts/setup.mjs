import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';

const root = path.resolve(new URL('..', import.meta.url).pathname);
const envExample = path.join(root, '.env.example');
const envFile = path.join(root, '.env');
const required = { DRY_RUN: 'true', REQUIRE_APPROVAL: 'true', ALLOW_PRODUCTION_WRITES: 'false' };
const parse = (text) => Object.fromEntries(text.split(/\r?\n/).filter((line) => line && !line.startsWith('#') && line.includes('=')).map((line) => { const i = line.indexOf('='); return [line.slice(0, i).trim(), line.slice(i + 1).trim().replace(/^['"]|['"]$/g, '')]; }));
const envCreated = !fs.existsSync(envFile);
if (envCreated) fs.copyFileSync(envExample, envFile);
const values = parse(fs.readFileSync(envFile, 'utf8'));
const unsafe = Object.entries(required).filter(([key, expected]) => values[key] !== expected).map(([key, expected]) => `${key} must equal ${expected}`);
if (unsafe.length) { console.error(JSON.stringify({ setup: 'FAIL', env_created: envCreated, unsafe }, null, 2)); process.exit(1); }
const result = spawnSync(process.execPath, ['scripts/check-structure.mjs'], { cwd: root, stdio: 'inherit' });
if (result.status !== 0) process.exit(result.status ?? 1);
console.log(JSON.stringify({ setup: 'PASS', env_created: envCreated, dry_run: true, production_writes: false }, null, 2));
