import { appendFile, mkdir, readFile } from 'node:fs/promises';
import path from 'node:path';

function validateRecord(record) {
  if (!record || typeof record !== 'object') throw new Error('snapshot registry record must be an object');
  if (!/^snapshot-[A-Za-z0-9_-]+$/.test(record.snapshot_id ?? '')) throw new Error('snapshot_id is required');
  if (!/^[a-f0-9]{64}$/.test(record.content_sha256 ?? '')) throw new Error('content_sha256 must be a SHA-256 hex digest');
  if (!Array.isArray(record.episode_ids)) throw new Error('episode_ids must be an array');
  if (!['pending-review', 'approved', 'superseded'].includes(record.approval_state)) throw new Error('unsupported approval_state');
}

export async function loadSnapshotRegistry(registryPath) {
  try {
    const text = await readFile(registryPath, 'utf8');
    return text.split(/\r?\n/).filter(Boolean).map((line, index) => {
      try { return JSON.parse(line); } catch (error) { throw new Error(`${registryPath}:${index + 1}: invalid JSON (${error.message})`); }
    });
  } catch (error) {
    if (error.code === 'ENOENT') return [];
    throw error;
  }
}

export async function appendSnapshotRegistry(registryPath, record) {
  validateRecord(record);
  const records = await loadSnapshotRegistry(registryPath);
  if (records.some((existing) => existing.snapshot_id === record.snapshot_id)) throw new Error(`duplicate snapshot_id: ${record.snapshot_id}`);
  await mkdir(path.dirname(registryPath), { recursive: true });
  await appendFile(registryPath, JSON.stringify({ ...record, registered_at: record.registered_at ?? new Date().toISOString() }) + '\n');
  return record.snapshot_id;
}
