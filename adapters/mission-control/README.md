# Mission Control adapter

The adapter will provide a narrow HTTP client for task creation, claiming, heartbeats, evidence submission, verification, approval, and status retrieval.

Rules:

- Validate requests against `contracts/` before sending.
- Carry correlation/run IDs across agent, Skill, tool, and verifier operations.
- Default to isolated/dry-run configuration.
- Never import Mission Control source code or access its production data directory directly.
