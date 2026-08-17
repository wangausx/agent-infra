const EVIDENCE_CLASSES = new Set(['correlation-only', 'observational', 'controlled-intervention', 'verified-operational-effect']);
const UNCERTAINTY_LEVELS = new Set(['low', 'medium', 'high', 'unknown']);
const isObject = (value) => value !== null && typeof value === 'object' && !Array.isArray(value);

function validateRefs(refs, sourceFiles, field, errors) {
  if (!Array.isArray(refs) || refs.length === 0) {
    errors.push(`${field}.evidence_refs must be non-empty`);
    return;
  }
  for (const ref of refs) {
    if (!isObject(ref) || typeof ref.artifact !== 'string' || typeof ref.pointer !== 'string') errors.push(`${field}.evidence_refs entries require artifact and pointer`);
    else if (!sourceFiles.includes(ref.artifact)) errors.push(`${field}: evidence ref not in source files: ${ref.artifact}`);
  }
}

export function validateCausalEvidence(ledger, sourceFiles = []) {
  const errors = [];
  if (!isObject(ledger)) return ['causal_evidence must be an object'];
  if (ledger.schema !== 'agent-infra/causal-evidence/v1') errors.push('unsupported causal evidence schema');
  for (const field of ['intervention', 'baseline_control', 'expected_effect', 'observed_effect', 'uncertainty']) {
    if (!isObject(ledger[field])) errors.push(`causal_evidence.${field} must be an object`);
  }
  if (!EVIDENCE_CLASSES.has(ledger.evidence_class)) errors.push('unsupported causal evidence class');
  if (isObject(ledger.uncertainty) && !UNCERTAINTY_LEVELS.has(ledger.uncertainty.level)) errors.push('causal_evidence.uncertainty.level is invalid');
  if (!Array.isArray(ledger.confounders)) errors.push('causal_evidence.confounders must be an array');
  for (const field of ['intervention', 'baseline_control', 'expected_effect', 'observed_effect']) if (isObject(ledger[field])) validateRefs(ledger[field].evidence_refs, sourceFiles, `causal_evidence.${field}`, errors);
  if (isObject(ledger.uncertainty)) validateRefs(ledger.uncertainty.evidence_refs, sourceFiles, 'causal_evidence.uncertainty', errors);
  return errors;
}

export function assertValidCausalEvidence(ledger, sourceFiles = []) {
  const errors = validateCausalEvidence(ledger, sourceFiles);
  if (errors.length) throw new Error(`causal evidence invalid: ${errors.join('; ')}`);
  return ledger;
}

export function buildCausalEvidence({ runId, scenario, rca, policy, action, verifier, scorecard }) {
  const ref = (artifact, pointer) => [{ artifact, pointer }];
  const executed = action.executed === true;
  const verdict = verifier.verdict === 'PASS' && scorecard.verdict === 'PASS' ? 'verified' : 'rejected';
  return {
    schema: 'agent-infra/causal-evidence/v1',
    episode_id: runId,
    evidence_class: 'observational',
    intervention: {
      type: executed ? 'executed-action' : 'policy-decision',
      action: action.action ?? policy.action ?? null,
      target: scenario ?? null,
      evidence_refs: executed ? ref('action-result.json', '/') : ref('policy-decision.json', '/')
    },
    baseline_control: {
      type: 'deterministic-incumbent',
      reference: 'current-policy-and-verifier-path',
      evidence_refs: ref('policy-decision.json', '/')
    },
    expected_effect: {
      description: action.expected_effect ?? policy.expected_effect ?? 'restore the declared operational invariant without production writes',
      evidence_refs: ref(executed ? 'action-result.json' : 'policy-decision.json', '/')
    },
    observed_effect: {
      outcome: verdict,
      description: verifier.verdict ?? 'no verifier verdict recorded',
      evidence_refs: ref('verifier-report.json', '/')
    },
    confounders: Array.isArray(rca.confounders) ? rca.confounders : [],
    uncertainty: {
      level: rca.uncertainty_level ?? (rca.confidence != null && Number(rca.confidence) >= 0.9 ? 'medium' : 'high'),
      rationale: rca.uncertainty_reason ?? 'observational evidence is not a controlled intervention',
      evidence_refs: ref('rca-report.json', '/')
    }
  };
}
