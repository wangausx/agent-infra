import { access } from 'node:fs/promises';

const required = [
  'agents', 'skills', 'adapters/mission-control', 'contracts', 'tools',
  'scenarios/closed-loop-demo', 'evals', 'deploy', 'scripts',
  'package.json', '.env.example', 'LICENSE', 'DISCLOSURE.md', '.github/workflows/ci.yml'
];

for (const path of required) await access(path);
console.log(`structure ok: ${required.length} paths`);
