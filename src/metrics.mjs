export function summarizeMetrics(trace, { status, evidence = [] } = {}) {
  const events = Array.isArray(trace) ? trace : trace.all();
  const first = events[0]?.timestamp ? Date.parse(events[0].timestamp) : null;
  const last = events.at(-1)?.timestamp ? Date.parse(events.at(-1).timestamp) : null;
  const name = (event) => event.event ?? event.action ?? '';
  return { status, event_count: events.length, evidence_count: evidence.length, planner_events: events.filter((e) => name(e).startsWith('planner.')).length, executor_events: events.filter((e) => name(e).startsWith('executor.')).length, verifier_events: events.filter((e) => name(e).startsWith('verifier.')).length, rollback_events: events.filter((e) => name(e).startsWith('rollback.')).length, duration_ms: first !== null && last !== null ? Math.max(0, last - first) : 0 };
}
