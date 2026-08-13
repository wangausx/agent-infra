import { access } from 'node:fs/promises';

const required = [
  'agents', 'skills', 'adapters/mission-control', 'contracts', 'tools',
  'scenarios/closed-loop-demo', 'evals', 'deploy', 'docs', 'scripts',
  'package.json', '.env.example', '.github/workflows/ci.yml'
];

for (const path of required) await access(path);
console.log(`structure ok: ${required.length} paths`);
