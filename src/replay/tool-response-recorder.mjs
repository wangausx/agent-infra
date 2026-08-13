import fs from 'node:fs/promises';
import path from 'node:path';

export const TOOL_RECORDING_SCHEMA = 'agent-infra/tool-response-recording/v1';

function canonical(value) {
  if (Array.isArray(value)) return value.map(canonical);
  if (value && typeof value === 'object') return Object.fromEntries(Object.keys(value).sort().map((key) => [key, canonical(value[key])]));
  return value;
}

export function canonicalJson(value) { return JSON.stringify(canonical(value)); }

export class ToolResponseRecorder {
  constructor({ recording = null, mode = 'record' } = {}) {
    if (!['record', 'replay'].includes(mode)) throw new TypeError('mode must be record or replay');
    this.mode = mode;
    this.entries = recording?.entries ? structuredClone(recording.entries) : [];
    this.index = 0;
    if (mode === 'replay' && recording?.schema !== TOOL_RECORDING_SCHEMA) throw new TypeError(`recording schema must be ${TOOL_RECORDING_SCHEMA}`);
  }

  async call(tool, request, operation) {
    if (!tool || typeof operation !== 'function') throw new TypeError('tool and operation are required');
    const requestCanonical = canonical(request);
    if (this.mode === 'replay') {
      const entry = this.entries[this.index];
      if (!entry) throw new Error(`replay exhausted before tool ${tool}`);
      if (entry.tool !== tool || canonicalJson(entry.request) !== canonicalJson(requestCanonical)) {
        throw new Error(`replay request mismatch at ${this.index}: expected ${entry.tool}, received ${tool}`);
      }
      this.index += 1;
      return structuredClone(entry.response);
    }
    const response = await operation();
    const storedResponse = canonical(response);
    this.entries.push({ sequence: this.entries.length, tool, request: requestCanonical, response: storedResponse });
    return structuredClone(storedResponse);
  }

  finish() {
    if (this.mode === 'replay' && this.index !== this.entries.length) throw new Error(`replay left ${this.entries.length - this.index} recorded tool response(s) unused`);
    return { schema: TOOL_RECORDING_SCHEMA, version: 1, entries: structuredClone(this.entries) };
  }
}

export async function readToolRecording(file) { return JSON.parse(await fs.readFile(file, 'utf8')); }
export async function writeToolRecording(file, recording) {
  await fs.mkdir(path.dirname(file), { recursive: true });
  await fs.writeFile(file, `${JSON.stringify(recording, null, 2)}\n`);
}
