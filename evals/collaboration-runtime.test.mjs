import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { CollaborationRuntime, RunInterrupted, createLaunchDescriptors, createRunManifest } from '../src/collaboration-runtime.mjs';

test('run manifest captures launch, skill, tool, and configuration hashes', () => {
  const descriptors = createLaunchDescriptors({ modelProvider: 'test-provider', model: 'test-model', skillVersions: { 'safe-remediation': '1.0.0' }, toolPermissions: { inspect: 'read-only' } });
  const manifest = createRunManifest({ runId: 'run-manifest-1', taskId: 'task-manifest-1', seed: 'seed-1', launchDescriptors: descriptors, config: { dry_run: true } });
  assert.equal(manifest.schema, 'agent-infra/collaboration-runtime/v1');
  assert.equal(manifest.launch_descriptors[1].skills['safe-remediation'], '1.0.0');
  assert.match(manifest.config_hash, /^sha256:/);
  assert.match(manifest.manifest_hash, /^sha256:/);
});

test('runtime resumes from durable handoff without repeating completed work', async () => {
  const stateDir = await fs.mkdtemp(path.join(os.tmpdir(), 'agent-infra-runtime-'));
  const calls = [];
  const runtime = new CollaborationRuntime({ stateDir, executeStep: async (step) => { calls.push(step.id); return { output: step.id }; } });
  const steps = [
    { id: 'planner-1', role: 'planner', payload: { objective: 'inspect' } },
    { id: 'executor-1', role: 'executor', payload: { action: 'prepare' } },
    { id: 'verifier-1', role: 'verifier', payload: { check: 'result' } }
  ];
  await runtime.initialize({ runId: 'run-resume-1', taskId: 'task-resume-1', seed: 'seed-resume-1' });
  await assert.rejects(() => runtime.run({ runId: 'run-resume-1', steps, interruptAfter: 'executor-1' }), RunInterrupted);
  const interrupted = await runtime.inspect('run-resume-1');
  assert.deepEqual(interrupted.completed_steps, ['planner-1']);
  const resumed = await runtime.run({ runId: 'run-resume-1', steps });
  assert.equal(resumed.status, 'completed');
  assert.deepEqual(calls, ['planner-1', 'executor-1', 'verifier-1']);
  assert.deepEqual(resumed.completed_steps, ['planner-1', 'executor-1', 'verifier-1']);
  await fs.rm(stateDir, { recursive: true, force: true });
});

test('runtime rejects empty step lists before side effects', async () => {
  const stateDir = await fs.mkdtemp(path.join(os.tmpdir(), 'agent-infra-runtime-empty-'));
  const runtime = new CollaborationRuntime({ stateDir });
  await runtime.initialize({ runId: 'run-empty-1', taskId: 'task-empty-1', seed: 'seed-empty-1' });
  await assert.rejects(() => runtime.run({ runId: 'run-empty-1', steps: [] }), /non-empty array/);
  await fs.rm(stateDir, { recursive: true, force: true });
});
