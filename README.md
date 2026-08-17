# TrustOps Automation

**Universal, policy-governed closed-loop operations for multi-agent systems**

TrustOps Automation is an AgentTeams-style collaboration and governance-adapter runtime for taking high-risk operational work through:

```text
DETECT -> UNDERSTAND -> DECIDE -> ACT -> VERIFY -> LEARN -> REVIEW
```

It turns fragmented alerts into traceable, replayable, auditable task chains. Domain Agents correlate signals, investigate competing causes, request policy approval, execute bounded reversible actions, independently verify outcomes, recover safely, and produce reviewable evidence.

## Architecture

Agent Infra owns the collaboration runtime: operational roles and handoffs, Skill/tool contracts, domain adapters, scenarios, evaluation, traces, and replay bundles. Mission Control remains the external durable control plane for task graphs, leases, approvals, evidence sealing, review gates, audit, and UI. This repository does not copy, fork, or vendor Mission Control implementation files.

The reference collaboration model separates Manager, Team Leader, Executor, Verifier, and Consolidator responsibilities. The runtime records active responsibility, host identity, authority, and evidence producer separately, preserving separation of duty even when compatible roles are co-located.

The same core contracts support vehicle sensor-fusion and payment stale/recovery scenarios. Domain differences are expressed through adapters, Skills, tools, policies, fixtures, and invariants—not core forks.

See [`ARCHITECTURE.md`](ARCHITECTURE.md) for the runtime boundary, lifecycle, responsibility model, safety controls, evidence model, and learning roadmap.

## Current capabilities

- Versioned context envelopes, lineage, task decomposition, and dependency-aware orchestration.
- Native `mission-control-v1` compatibility adapter for task lifecycle, claims, heartbeats, review/evidence handoff, recovery, and events.
- Skill registry, approval enforcement, bounded tool execution, rollback/compensation, traces, and knowledge consolidation.
- Deterministic in-memory and isolated HTTP control-plane harnesses.
- Evidence hashing, tamper rejection, replay validation, failure injection, and reproducible evaluation.
- Operational-learning foundation: versioned episode contracts, read-only episode collection, typed claims, privacy/retention governance, delayed outcome labels, validated reviewer identity, incumbent baselines, replay audits, quality dashboards, deterministic snapshots, window-readiness gating, and release-gate packets.
- Offline synthetic-learning fixture that exercises three weeks/domains and proves the readiness/release packet path without production writes.
- Read-only Scenario Run View integration with explicit production-write prohibition.

## Safety boundary

The default configuration is isolated and dry-run-safe:

```text
MISSION_CONTROL_MODE=isolated
DRY_RUN=true
REQUIRE_APPROVAL=true
ALLOW_PRODUCTION_WRITES=false
```

No production writes occur by default. High-risk Skills require approval outside dry-run. Side-effecting interfaces must declare target identity, capability scope, authorization, idempotency, timeout, independent observation, rollback or safe-stop behavior, and evidence output. Physical-vehicle control, payment settlement, customer-account access, and real-money movement are outside the repository fixtures.

## Quick start

Requires Node.js 20 or newer.

```bash
cp .env.example .env
npm install
npm run check
npm test
npm run evaluate
npm run demo
npm run episodes:test
npm run episodes:baseline
npm run episodes:quality
npm run episodes:simulate
npm run release:packet
npm run package:check
```

The demo is deterministic, in-memory, isolated, and dry-run. It does not mutate production Mission Control. Set `MISSION_CONTROL_BASE_URL` to an explicitly approved isolated endpoint when using the HTTP adapter; production targets are rejected by default.

## Repository map

```text
src/          executable collaboration runtime, episode contracts, and learning foundation
agents/       role boundary documentation
skills/       versioned reusable Skill manifests
adapters/     external integration boundary documentation
contracts/    API compatibility, schemas, and fixtures
tools/        MCP/equivalent tool contract documentation
scenarios/    reproducible scenario documentation
evals/        runtime, failure-injection, and learning-foundation tests
deploy/       isolated demo configuration
scripts/      deterministic setup/check/demo/evaluation/acceptance helpers
artifacts/    generated scorecards, traces, evidence manifests, and replay bundles
```

## Learning roadmap

The learning flywheel is deliberately staged:

```text
observe -> normalize -> seal trajectory -> label outcome
  -> offline replay/evaluation -> shadow recommendation
  -> bounded canary -> independent verification
  -> review/rollback -> release
```

Recommendations must first run in shadow mode beside the deterministic incumbent. They cannot approve themselves, modify their own labels, expand their authority, or bypass Mission Control review. Bounded reinforcement learning is a later step after replay, outcome quality, rollback, and independent-verification evidence are sufficient.

## Public-release boundary

The public repository contains the sanitized collaboration, governance-adapter, scenario, evaluation, and reproducibility layer. The operational-learning implementation includes offline synthetic fixtures, reviewer-identity validation, deterministic snapshot/readiness checks, and release-gate verification. These fixtures prove pipeline behavior only; they are not real-world performance evidence and do not authorize production writes or model promotion.

Internal planning, research, runtime state, credentials, model/provider configuration, private hostnames, deployment paths, production telemetry, reviewer records, and operational data are not tracked in the public tree. Real-world release dependencies remain: approved telemetry integration, three real UTC weeks/domains of labeled episodes, live reviewer identity/UI integration, ground-truth metrics, privacy/retention review, and an explicitly approved bounded sandbox canary.

## License

MIT. See [`LICENSE`](LICENSE), [`DISCLOSURE.md`](DISCLOSURE.md), and [`SECURITY.md`](SECURITY.md).
