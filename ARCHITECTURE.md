# TrustOps Automation Architecture

TrustOps Automation is a universal, policy-governed closed-loop operations layer for multi-agent systems. It adapts AgentTeams-style collaboration to operational work without copying or forking Mission Control.

## System boundary

```text
Domain Agents / Skills / Tools
          |
          v
Agent Infra collaboration runtime
  intake -> decompose -> investigate -> decide -> act
          -> verify -> learn -> review
          |
          v
mission-control-v1 HTTP adapter
          |
          v
Mission Control durable control plane
```

**Agent Infra owns** operational identities, role boundaries, context handoffs, Skill and tool contracts, domain adapters, scenarios, evaluation, traces, and package/replay generation.

**Mission Control owns** durable task state, dependencies, leases and fencing, approvals, intervention history, evidence sealing, review gates, audit, and the operational UI. Agent Infra never imports or vendors Mission Control implementation code.

## Closed-loop lifecycle

Every governed run follows the same contract:

```text
DETECT -> UNDERSTAND -> DECIDE -> ACT -> VERIFY -> LEARN -> REVIEW
```

The operational path is:

```text
Signal / Incident
  -> parallel RCA and evidence collection
  -> policy, risk, and approval gate
  -> bounded reversible remediation
  -> independent observation and verification
  -> recovery / compensation when required
  -> outcome labeling and postmortem
  -> review and sealed evidence
```

The core orchestrator, evidence model, governance adapter, and review path are reusable. A domain adapter supplies only its Skills, tools, policies, fixtures, and invariants. Vehicle sensor-fusion and payment stale/recovery scenarios therefore exercise the same lifecycle without a core fork.

## Responsibility model

| Responsibility | Agent Infra | Mission Control |
|---|---|---|
| Agent identity, roles, and handoffs | Authoritative | Observes through tasks/events |
| Decomposition and orchestration | Authoritative | Persists task graph |
| Skill/tool capability and policy | Authoritative | Receives lifecycle/evidence events |
| Leases, fencing, and durable state | Consumes native API | Authoritative |
| Candidate evidence and replay bundle | Produces | Seals and verifies |
| Approval and completion gates | Requests transition | Authoritative |
| Rollback/compensation | Plans and executes bounded actions | Audits outcome |
| UI, audit, and operational task history | Not duplicated | Authoritative |

The reference collaboration roles are Manager, Team Leader, Executor, Verifier, and Consolidator. Their active operational responsibility, host identity, authority, and evidence producer remain separate even when a compact deployment co-locates compatible responsibilities. Execution, independent verification, and final review retain separation-of-duty boundaries.

## Safety and isolation

- `MISSION_CONTROL_MODE=isolated` and `.runtime/mission-control-data` are the default integration boundary; deployments may choose an isolated local port.
- `DRY_RUN=true`, `REQUIRE_APPROVAL=true`, and `ALLOW_PRODUCTION_WRITES=false` are the safe defaults.
- Side-effecting Skills must declare target identity, capability scope, authorization, idempotency, timeout, independent observation, safe-stop/rollback behavior, and evidence output.
- Production writes, physical-vehicle control, payment settlement, customer-account access, and real-money movement are outside the preliminary fixtures.
- The adapter fails closed on production targets and does not allow an executor to certify its own success.

## Evidence and operational learning

Each run binds a `run_id` and `correlation_id` to the task graph, versioned handoffs, observations, hypotheses, decisions, actions, approvals, before/after state, verifier result, rollback result, and review outcome. Evidence is hashed, replayable, and rejected when incomplete, tampered, stale, duplicated, or unbound.

The learning foundation is:

```text
observe -> normalize -> seal trajectory -> label outcome
  -> offline replay/evaluation -> shadow recommendation
  -> bounded canary -> independent verification
  -> review/rollback -> dataset/model/Skill release
```

The current foundation includes a versioned episode contract, read-only collection, typed claims, privacy/retention governance, delayed outcome labels, incumbent baselines, replay-integrity checks, and quality reporting. Learned components begin in shadow mode and cannot change tasks, approvals, tool calls, or production state. Bounded reinforcement learning is a later, reviewed step—not the current execution authority.

## Verification surface

```bash
npm run check
npm test
npm run episodes:test
npm run episodes:baseline
npm run episodes:quality
npm run package:check
```

The canonical progress and acceptance tracker is [`design-and-plan.md`](design-and-plan.md). It distinguishes implemented isolated evidence, read-only production illustrations, and live integration gates that remain open.
