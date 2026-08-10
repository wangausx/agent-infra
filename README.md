# Agent Infra

Competition adaptation for **Multi-Agent Autonomous Collaboration for complex tasks**.

This repository is the collaboration and reproducibility layer. It does **not** copy or fork Mission Control implementation files.

## Boundary

- **Mission Control** remains the external durable control plane: task lifecycle, leases, dependencies, evidence, verification, approval gates, audit, and UI.
- **Agent Infra** owns AgentTeams-style orchestration, agent roles, context handoffs, Skills, tool/MCP adapters, scenarios, evaluation, traces, and packaging.

Integration target: `MISSION_CONTROL_BASE_URL` (default `http://127.0.0.1:3005`). Production writes are not the default: use `MISSION_CONTROL_MODE=isolated` and `DRY_RUN=true`.

## Repository map

```text
agents/       executable role boundaries: planner, executor, verifier
skills/       versioned reusable Skill manifests
adapters/     external integrations, including Mission Control API client
contracts/    API schemas, fixtures, and compatibility manifest
tools/        MCP/equivalent tool contracts and adapters
scenarios/    reproducible closed-loop competition scenarios
evals/        acceptance checks, fault injection, and scoring
deploy/       isolated demo and local runtime configuration
docs/         architecture, operations, disclosure, and plans
scripts/      deterministic setup/check/demo/reset helpers
```

## Quick start

```bash
cp .env.example .env
npm run check
npm test
npm run demo
```

The initial demo is intentionally a dry-run structure check. It must not mutate production Mission Control data.

## Non-goals

- No Mission Control source copy or submodule.
- No direct writes to production task data by default.
- No high-risk remediation without an explicit approval boundary.
