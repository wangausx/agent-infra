import crypto from 'node:crypto';
import fs from 'node:fs/promises';
import path from 'node:path';

export const COLLABORATION_RUNTIME_SCHEMA = 'agent-infra/collaboration-runtime/v1';

function stable(value) {
  if (Array.isArray(value)) return `[${value.map(stable).join(',')}]`;
  if (value && typeof value === 'object') return `{${Object.keys(value).sort().map((key) => `${JSON.stringify(key)}:${stable(value[key])}`).join(',')}}`;
  return JSON.stringify(value);
}

function sha256(value) {
  return `sha256:${crypto.createHash('sha256').update(stable(value)).digest('hex')}`;
}

function required(value, name) {
  if (!value) throw new TypeError(`${name} is required`);
}

export function createLaunchDescriptors({ modelProvider = 'configured', model = 'configured', skillVersions = {}, toolPermissions = {} } = {}) {
  return Object.freeze([
    { role: 'planner', identity: 'planner', model_provider: modelProvider, model, input_schema: 'scenario/v1', output_schema: 'plan/v1', skills: Object.freeze({}), tools: Object.freeze({}) },
    { role: 'executor', identity: 'executor', model_provider: modelProvider, model, input_schema: 'plan/v1', output_schema: 'evidence/v1', skills: Object.freeze({ ...skillVersions }), tools: Object.freeze({ ...toolPermissions }) },
    { role: 'verifier', identity: 'verifier', model_provider: modelProvider, model, input_schema: 'evidence/v1', output_schema: 'verdict/v1', skills: Object.freeze({ ...skillVersions }), tools: Object.freeze({}) },
    { role: 'consolidator', identity: 'consolidator', model_provider: modelProvider, model, input_schema: 'verdict/v1', output_schema: 'knowledge/v1', skills: Object.freeze({ ...skillVersions }), tools: Object.freeze({}) }
  ]);
}

export function createRunManifest({ runId, taskId, seed, launchDescriptors, config = {} } = {}) {
  required(runId, 'runId'); required(taskId, 'taskId'); required(seed, 'seed'); required(launchDescriptors, 'launchDescriptors');
  const manifest = {
    schema: COLLABORATION_RUNTIME_SCHEMA,
    run_id: runId,
    task_id: taskId,
    seed,
    launch_descriptors: launchDescriptors,
    config,
    config_hash: sha256(config)
  };
  return Object.freeze({ ...manifest, manifest_hash: sha256(manifest) });
}

export class RunInterrupted extends Error {
  constructor(runId, stepId) { super(`run interrupted after step ${stepId}`); this.name = 'RunInterrupted'; this.runId = runId; this.stepId = stepId; }
}

export class CollaborationRuntime {
  constructor({ stateDir = '.agent-infra-runs', executeStep = async (step) => ({ ok: true, step_id: step.id }) } = {}) {
    this.stateDir = path.resolve(stateDir);
    this.executeStep = executeStep;
  }

  statePath(runId) { required(runId, 'runId'); return path.join(this.stateDir, `${runId}.json`); }

  async initialize({ runId, taskId, seed, launchDescriptors = createLaunchDescriptors(), config = {} } = {}) {
    const manifest = createRunManifest({ runId, taskId, seed, launchDescriptors, config });
    const state = { manifest, status: 'ready', completed_steps: [], handoffs: [], results: [] };
    await this.#write(runId, state);
    return state;
  }

  async inspect(runId) { return JSON.parse(await fs.readFile(this.statePath(runId), 'utf8')); }

  async run({ runId, steps, interruptAfter = null } = {}) {
    required(runId, 'runId');
    if (!Array.isArray(steps) || steps.length === 0) throw new TypeError('steps must be a non-empty array');
    const state = await this.inspect(runId);
    state.status = 'running';
    for (const step of steps) {
      required(step?.id, 'step.id'); required(step?.role, 'step.role');
      if (state.completed_steps.includes(step.id)) continue;
      if (!state.handoffs.some((handoff) => handoff.step_id === step.id)) {
        state.handoffs.push({ step_id: step.id, role: step.role, status: 'ready', payload_hash: sha256(step.payload ?? {}) });
        await this.#write(runId, state);
      }
      if (interruptAfter === step.id) {
        state.status = 'interrupted';
        await this.#write(runId, state);
        throw new RunInterrupted(runId, step.id);
      }
      const result = await this.executeStep(step, state.manifest);
      state.results.push({ step_id: step.id, result });
      state.completed_steps.push(step.id);
      const handoff = state.handoffs.find((item) => item.step_id === step.id);
      handoff.status = 'completed';
      await this.#write(runId, state);
    }
    state.status = 'completed';
    await this.#write(runId, state);
    return state;
  }

  async #write(runId, state) {
    await fs.mkdir(this.stateDir, { recursive: true });
    const target = this.statePath(runId);
    const temporary = `${target}.${process.pid}.tmp`;
    await fs.writeFile(temporary, `${JSON.stringify(state, null, 2)}\n`, { mode: 0o600 });
    await fs.rename(temporary, target);
  }
}
