export function consolidateKnowledge({ taskId, plan, verification, trace }) {
  const knowledge = { task_id: taskId, pattern: 'plan-execute-verify', lessons: [
    'Planner emits versioned handoff before execution.',
    'Executor emits hashed evidence for every mutation-capable step.',
    'Verifier is independent and cannot approve missing or malformed evidence.'
  ], verdict: verification.result.verdict, step_count: plan.steps.length };
  trace.emit('knowledge.consolidated', { taskId, lessonCount: knowledge.lessons.length });
  return knowledge;
}
