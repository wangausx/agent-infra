import assert from 'node:assert/strict';
import test from 'node:test';
import { createTrustOpsGraph, DesiredStatusReconciler, InterventionLedger, INTERVENTIONS, TRUSTOPS_ROLES } from '../src/trustops.mjs';

test('TrustOps graph preserves named five-role identity and dependency edges', () => {
  const graph = createTrustOpsGraph({ teamId: 'team-1', roomId: 'room-1', projectId: 'project-1', taskId: 'task-1', runId: 'run-1', subtasks: [
    { subtask_id: 'inspect', objective: 'Inspect fixture', assignment: 'Rex', acceptance: ['before snapshot'] },
    { subtask_id: 'verify', objective: 'Independently verify', assignment: 'Dr. Sage', depends_on: ['inspect'], acceptance: ['after snapshot'] }
  ] });
  assert.equal(graph.schema, 'agent-infra/trustops/v1');
  assert.equal(graph.subtasks[1].depends_on[0], 'inspect');
  assert.equal(TRUSTOPS_ROLES.manager.identity, 'Danny');
  assert.equal(TRUSTOPS_ROLES.team_leader.identity, 'Morgan');
  assert.equal(TRUSTOPS_ROLES.executor.identity, 'Rex');
  assert.equal(TRUSTOPS_ROLES.verifier.identity, 'Dr. Sage');
  assert.equal(TRUSTOPS_ROLES.consolidator.identity, 'Juno');
});

test('Trust Room ledger records authorized append-only interventions with hash chain', () => {
  const ledger = new InterventionLedger({ runId: 'run-ledger', clock: () => '2026-08-11T00:00:00Z' });
  const first = ledger.append({ command: 'pause', actor: 'Jj', authorization: 'human-approval-token', previousState: 'open', newState: 'paused', reason: 'Inspect high-risk action', correlationId: 'corr-1', taskId: 'task-1', targetRole: 'Rex' });
  const second = ledger.append({ command: 'resume', actor: 'Jj', authorization: 'human-approval-token', previousState: 'paused', newState: 'open', reason: 'Approved after inspection', correlationId: 'corr-2', taskId: 'task-1', targetRole: 'Rex' });
  assert.deepEqual(INTERVENTIONS, ['approve', 'reject', 'pause', 'resume', 'retry', 'reassign', 'cancel']);
  assert.equal(second.previous_hash, first.event_hash);
  assert.equal(ledger.list().length, 2);
  assert.throws(() => ledger.append({ command: 'delete', actor: 'Jj', authorization: 'x', previousState: 'open', newState: 'closed', reason: 'bad', correlationId: 'c', taskId: 't' }), /unsupported intervention/);
});

test('reconciler reports drift, stale claims, unmanaged state, and duplicate prevention without applying writes', () => {
  const result = new DesiredStatusReconciler().reconcile({
    desired: [{ id: 'task-1', status: 'completed', claim_id: 'claim-new' }, { id: 'task-1', status: 'completed', claim_id: 'claim-new' }],
    observed: [{ id: 'task-1', status: 'open', claim_id: 'claim-old' }, { id: 'task-extra', status: 'open' }]
  });
  assert.equal(result.safe_to_apply, false);
  assert.ok(result.drift.some((item) => item.reason === 'stale-claim'));
  assert.ok(result.drift.some((item) => item.reason === 'duplicate-completed-work'));
  assert.ok(result.actions.some((item) => item.action === 'report-unmanaged' && item.id === 'task-extra'));
});

test('graph rejects unknown dependency before any side effect', () => {
  assert.throws(() => createTrustOpsGraph({ teamId: 't', roomId: 'r', projectId: 'p', taskId: 'x', runId: 'run', subtasks: [{ subtask_id: 'a', objective: 'a', assignment: 'Rex', depends_on: ['missing'] }] }), /unknown dependency/);
});
