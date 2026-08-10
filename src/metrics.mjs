export function summarizeMetrics(trace, { status, evidence = [] } = {}) {
  const events = Array.isArray(trace) ? trace : trace.all();
  const first = events[0]?.timestamp ? Date.parse(events[0].timestamp) : null;
  const last = events.at(-1)?.timestamp ? Date.parse(events.at(-1).timestamp) : null;
  return { status, event_count: events.length, evidence_count: evidence.length, planner_events: events.filter((e) => e.event.startsWith('planner.')).length, executor_events: events.filter((e) => e.event.startsWith('executor.')).length, verifier_events: events.filter((e) => e.event.startsWith('verifier.')).length, rollback_events: events.filter((e) => e.event.startsWith('rollback.')).length, duration_ms: first !== null && last !== null ? Math.max(0, last - first) : 0 };
}
