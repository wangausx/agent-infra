# Agent Infra project execution contract

- Work only inside `/srv/agent-platform/projects/agent-infra`.
- Use the `generic-orchestrator` project profile and the `agent-infra` Mission Control board (`:3015`).
- Long-running evaluation, build, or matrix work must run as a durable background job with checkpoints, heartbeats, bounded retries, and completion notification.
- Do not claim a Mission Control task unless the worker is bound to the exact task and claim generation.
- Persist executable evidence under this project or the Mission Control deliverables directory before handing work to review.
