# Agent Infra

Competition adaptation for **Multi-Agent Autonomous Collaboration for complex tasks**.

This repository is the collaboration and reproducibility layer. It does **not** copy or fork Mission Control implementation files.

## Implemented phases

- **Phase 1:** standalone repository, compatibility contract, HTTP adapter, isolated config.
- **Phase 2:** executable planner, executor, verifier, versioned handoffs, Skill registry, rollback stack, and evidence hashing.
- **Phase 3:** closed-loop scenario, traces, knowledge consolidation, failure injection, reproducible evaluation, and packaging checks.

## Quick start

```bash
cp .env.example .env
npm run check
npm test
npm run evaluate
npm run demo
npm run package:check
```

The demo is deterministic, in-memory, isolated, and dry-run. It does not mutate production Mission Control.

## Boundary

- **Mission Control** remains the external durable control plane: task lifecycle, leases, dependencies, evidence, verification, approval gates, audit, and UI.
- **Agent Infra** owns AgentTeams-style orchestration, agent roles, context handoffs, Skills, tool/MCP adapters, scenarios, evaluation, traces, and packaging.

## Repository map

```text
src/          executable collaboration runtime and API client
agents/       role boundary documentation
skills/       versioned reusable Skill manifests
adapters/     external integration boundary documentation
contracts/    API compatibility, schemas, and fixtures
tools/        MCP/equivalent tool contract documentation
scenarios/    reproducible scenario documentation
evals/        runtime tests and fault-injection checks
deploy/       isolated demo configuration
docs/         architecture, operations, disclosure, and plans
scripts/      deterministic setup/check/demo/evaluation helpers
```

## Safety

No production writes by default. High-risk Skills require approval when not in dry-run. Mission Control source and data are outside this repository and are not modified by the demo or tests.
