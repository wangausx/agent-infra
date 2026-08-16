const CLAIM_TYPES = new Set(['hypothesis', 'decision', 'action', 'verification', 'lesson']);
const EVIDENCE_CLASSES = new Set(['observational', 'replay', 'controlled', 'human-label', 'derived']);

export function createClaim({ claimId, claim, claimType, producer, confidence, evidenceClass, evidenceRefs, status = 'active' }) {
  if (!claimId || !claim || !producer) throw new Error('claim_id, claim, and producer are required');
  if (!CLAIM_TYPES.has(claimType)) throw new Error(`unsupported claim type: ${claimType}`);
  if (!EVIDENCE_CLASSES.has(evidenceClass)) throw new Error(`unsupported evidence class: ${evidenceClass}`);
  if (!Number.isFinite(confidence) || confidence < 0 || confidence > 1) throw new Error('confidence must be between 0 and 1');
  if (!Array.isArray(evidenceRefs) || evidenceRefs.length === 0) throw new Error('evidence_refs must be non-empty');
  return { claim_id: claimId, claim, claim_type: claimType, producer, confidence, evidence_class: evidenceClass, evidence_refs: evidenceRefs, status };
}

export function buildEpisodeClaims({ runId, rca, policy, action, verifier }) {
  const refs = (file, pointer) => [{ artifact: file, pointer }];
  const claims = [];
  if (rca.selected_cause) claims.push(createClaim({ claimId: `${runId}:hypothesis:selected-cause`, claim: rca.selected_cause, claimType: 'hypothesis', producer: 'rca-report', confidence: Number(rca.confidence ?? 0), evidenceClass: 'observational', evidenceRefs: refs('rca-report.json', '/selected_cause') }));
  if (policy.action || policy.approval_required != null) claims.push(createClaim({ claimId: `${runId}:decision:policy`, claim: JSON.stringify({ action: policy.action ?? null, approval_required: policy.approval_required ?? null }), claimType: 'decision', producer: 'policy-decision', confidence: 1, evidenceClass: 'observational', evidenceRefs: refs('policy-decision.json', '/') }));
  if (action.action || action.executed != null) claims.push(createClaim({ claimId: `${runId}:action:execution`, claim: JSON.stringify({ action: action.action ?? null, executed: action.executed ?? false }), claimType: 'action', producer: 'action-result', confidence: 1, evidenceClass: 'observational', evidenceRefs: refs('action-result.json', '/') }));
  if (verifier.verdict) claims.push(createClaim({ claimId: `${runId}:verification:verdict`, claim: verifier.verdict, claimType: 'verification', producer: 'verifier-report', confidence: verifier.verdict === 'PASS' ? 1 : 0.95, evidenceClass: 'observational', evidenceRefs: refs('verifier-report.json', '/verdict') }));
  return claims;
}

export function validateClaims(claims, sourceFiles = []) {
  const errors = [];
  if (!Array.isArray(claims)) return ['claims must be an array'];
  const ids = new Set();
  for (const claim of claims) {
    if (ids.has(claim.claim_id)) errors.push(`duplicate claim_id: ${claim.claim_id}`);
    ids.add(claim.claim_id);
    try { createClaim({ claimId: claim.claim_id, claim: claim.claim, claimType: claim.claim_type, producer: claim.producer, confidence: claim.confidence, evidenceClass: claim.evidence_class, evidenceRefs: claim.evidence_refs, status: claim.status }); } catch (error) { errors.push(`${claim.claim_id ?? 'unknown'}: ${error.message}`); }
    for (const ref of claim.evidence_refs ?? []) if (!sourceFiles.includes(ref.artifact)) errors.push(`${claim.claim_id}: evidence ref not in source files: ${ref.artifact}`);
  }
  return errors;
}
