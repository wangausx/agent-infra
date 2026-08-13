# TrustOps Automation

**Multi-Agent Autonomous Collaboration for Complex Tasks**

TrustOps Automation is a universal closed-loop operations fabric for multi-agent systems.

The competition submission uses vehicle autonomy as the preliminary demonstration scenario, while the same contracts support later payments, infrastructure, and other operational scenarios.

This repository is the collaboration, governance-adapter, scenario, and reproducibility layer. It does **not** copy or fork Mission Control implementation files. The repository identifier remains `agent-infra`; **TrustOps Automation** is the generic product/submission name.

## Implemented phases

- **Phase 1:** standalone repository, compatibility contract, HTTP adapter, isolated config.
- **Phase 2:** executable planner, executor, verifier, versioned handoffs, Skill registry, rollback stack, and evidence hashing.
- **Phase 3:** closed-loop scenario, traces, knowledge consolidation, failure injection, reproducible evaluation, and packaging checks.

## Design and progress plan

The refined architecture, native Mission Control boundary, phased implementation plan, acceptance matrix, and next checkpoint are tracked in [`docs/design-and-plan.md`](docs/design-and-plan.md).

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

## Mission Control target

Agent Infra task-board operations use the isolated board at `http://192.168.1.140:3015`. Set `MISSION_CONTROL_BASE_URL` to that endpoint. The production `:3005` instance is read-only reference data for this project and the client rejects it by default.

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
artifacts/    generated scorecards, traces, evidence manifests, and replay bundles
```

M5 package references:

- [`docs/m5-package.md`](docs/m5-package.md): exact setup/demo/package reproduction.
- [`docs/agent-identity-list.md`](docs/agent-identity-list.md): named role authorities and prohibitions.
- [`docs/skill-checklist.md`](docs/skill-checklist.md): Skill permissions and failure modes.
- [`docs/threat-model.md`](docs/threat-model.md): trust boundaries, mitigations, and residual risks.

## Safety

No production writes by default. High-risk Skills require approval when not in dry-run. Mission Control source and data are outside this repository and are not modified by the demo or tests.
