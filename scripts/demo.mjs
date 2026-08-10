import { runClosedLoop } from '../src/runtime.mjs';
import { MemoryControlPlane } from '../src/mission-control-client.mjs';

const controlPlane = new MemoryControlPlane();
const result = await runClosedLoop({ objective: 'Closed-loop isolated competition demo', controlPlane, dryRun: true });
console.log(JSON.stringify({ task_id: result.task_id, status: result.status, evidence: result.evidence, verification: result.verification?.result, knowledge: result.knowledge, metrics: result.metrics, trace_events: result.trace.map((e) => e.event), control_events: controlPlane.events }, null, 2));
if (result.status !== 'verified' || result.verification?.result.verdict !== 'PASS') process.exitCode = 1;
