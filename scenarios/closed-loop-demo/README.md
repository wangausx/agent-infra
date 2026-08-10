# Closed-loop demo scenario

Target flow:

1. Receive a simulated incident.
2. Planner decomposes and deduplicates it.
3. Executor performs an allowlisted dry-run remediation.
4. Verifier checks recovery independently.
5. Evidence and traces are sealed.
6. Approval/rollback behavior is exercised through fault injection.
7. Approved outcome is consolidated into reusable knowledge.
