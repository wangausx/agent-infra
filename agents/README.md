# Agent roles

The competition runtime will provide at least three executable, distinct roles:

- `planner`: decomposes an input into an executable plan and context handoffs.
- `executor`: invokes allowlisted Skills/tools and reports evidence.
- `verifier`: independently checks results, seals evidence, and recommends approval or rollback.
