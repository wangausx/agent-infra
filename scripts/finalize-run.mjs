import path from 'node:path';
import { finalizeRun } from '../src/operational-adapter.mjs';

const args = new Map();
for (let index = 2; index < process.argv.length; index += 2) args.set(process.argv[index], process.argv[index + 1]);
const runPath = args.get('--run');
const root = path.resolve(args.get('--root') ?? 'artifacts');
if (!runPath) throw new Error('--run is required');
const result = await finalizeRun({
  runPath,
  episodesPath: args.get('--episodes') ?? path.join(root, 'datasets/episodes-v1.jsonl'),
  quarantinePath: args.get('--quarantine') ?? path.join(root, 'datasets/quarantine-v1.jsonl')
});
console.log(JSON.stringify(result));
