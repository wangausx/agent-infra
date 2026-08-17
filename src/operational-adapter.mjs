import { mkdir, readFile, rename, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { collectEpisodeFromRun } from './episode-collector.mjs';

async function readRows(filePath) {
  try {
    return (await readFile(filePath, 'utf8')).split(/\r?\n/).filter(Boolean).map(JSON.parse);
  } catch (error) {
    if (error.code === 'ENOENT') return [];
    throw error;
  }
}

async function appendUnique(filePath, row, identity) {
  const rows = await readRows(filePath);
  if (rows.some((existing) => existing[identity] === row[identity])) return { appended: false, duplicate: true };
  await mkdir(path.dirname(filePath), { recursive: true });
  const tempPath = `${filePath}.tmp-${process.pid}`;
  await writeFile(tempPath, rows.concat(row).map((item) => JSON.stringify(item)).join('\n') + '\n');
  await rename(tempPath, filePath);
  return { appended: true, duplicate: false };
}

export async function finalizeRun({ runPath, episodesPath, quarantinePath }) {
  if (!runPath || !episodesPath || !quarantinePath) throw new Error('runPath, episodesPath, and quarantinePath are required');
  const result = await collectEpisodeFromRun(path.resolve(runPath));
  if (result.status === 'accepted') {
    const write = await appendUnique(episodesPath, result, 'episode_id');
    return { status: result.status, run_id: result.run_id, ...write };
  }
  const write = await appendUnique(quarantinePath, result, 'run_id');
  return { status: result.status, run_id: result.run_id, reason: result.reason, ...write };
}
