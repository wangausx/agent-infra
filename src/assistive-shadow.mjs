const unique = (items) => [...new Set((items ?? []).filter((item) => typeof item === 'string' && item))];

function assertEpisode(episode) {
  if (!episode || typeof episode !== 'object' || !episode.episode_id) throw new Error('episode must include episode_id');
}

export function clusterAlerts(episode) {
  assertEpisode(episode);
  const incident = episode.observations?.incident ?? {};
  const rawAlertIds = Array.isArray(incident.alert_ids) ? incident.alert_ids : [];
  const rawSuppressed = Array.isArray(incident.suppressed_alert_ids) ? incident.suppressed_alert_ids : [];
  const alertIds = unique(rawAlertIds);
  const suppressed = unique(rawSuppressed).filter((id) => !alertIds.includes(id));
  return { incident_id: incident.id ?? null, alert_ids: alertIds, suppressed_alert_ids: suppressed, duplicate_count: rawAlertIds.length + rawSuppressed.length - alertIds.length - suppressed.length };
}

export function rankNextBestDiagnostics(episode) {
  assertEpisode(episode);
  const candidates = episode.hypotheses?.candidates ?? [];
  return candidates.flatMap((candidate) => unique(candidate.supporting_evidence ?? candidate.supporting).map((evidence, index) => ({ diagnostic: evidence, cause: candidate.cause, priority: Number(candidate.score ?? 0) - index }))).sort((a, b) => b.priority - a.priority || a.diagnostic.localeCompare(b.diagnostic));
}

export function retrieveSkills(episode, skillCatalog = []) {
  assertEpisode(episode);
  const action = episode.action?.selected ?? episode.decision?.policy?.action;
  if (!action || !Array.isArray(skillCatalog)) return [];
  return skillCatalog.filter((skill) => Array.isArray(skill.actions) && skill.actions.includes(action)).map((skill) => ({ skill_id: skill.skill_id, action, fallback: skill.fallback ?? 'deterministic-incumbent' }));
}

export function buildShadowRecommendations(episode, { skillCatalog = [] } = {}) {
  assertEpisode(episode);
  const candidates = episode.hypotheses?.candidates;
  if (!Array.isArray(candidates) || candidates.length === 0) return [];
  const ranking = candidates
    .filter((candidate) => candidate && typeof candidate.cause === 'string' && candidate.cause)
    .map((candidate) => {
      const supporting = unique(candidate.supporting_evidence ?? candidate.supporting);
      const disconfirming = unique(candidate.disconfirming_evidence ?? candidate.disconfirming);
      const score = Number.isFinite(candidate.score) ? candidate.score : supporting.length - disconfirming.length;
      return { cause: candidate.cause, score, supporting_evidence: supporting, disconfirming_evidence: disconfirming };
    })
    .sort((a, b) => b.score - a.score || a.cause.localeCompare(b.cause));
  if (!ranking.length) return [];
  const top = ranking[0];
  return [{
    schema: 'agent-infra/assistive-recommendation/v1',
    episode_id: episode.episode_id,
    mode: 'shadow',
    ranking,
    selected_cause: top.cause,
    evidence: unique(top.supporting_evidence),
    next_best_diagnostics: rankNextBestDiagnostics(episode).slice(0, 3),
    skill_matches: retrieveSkills(episode, skillCatalog),
    confidence: ranking.length > 1 ? Math.max(0, Math.min(1, (top.score - ranking[1].score + 1) / (Math.abs(top.score) + Math.abs(ranking[1].score) + 1))) : 1,
    fallback: 'deterministic-incumbent',
    authority: { can_execute: false, can_approve: false, production_writes: false }
  }];
}

export function computeAssistiveMetrics(episodes, recommendations) {
  const byId = new Map(episodes.map((episode) => [episode.episode_id, episode]));
  const labeled = recommendations.map((recommendation) => ({ recommendation, truth: byId.get(recommendation.episode_id)?.ground_truth?.cause ?? byId.get(recommendation.episode_id)?.outcomes?.confirmed_cause ?? byId.get(recommendation.episode_id)?.verification?.confirmed_cause })).filter(({ truth }) => typeof truth === 'string' && truth);
  const correct = labeled.filter(({ recommendation, truth }) => recommendation.selected_cause === truth).length;
  const brier = labeled.length ? labeled.reduce((sum, { recommendation, truth }) => sum + (recommendation.confidence - (recommendation.selected_cause === truth ? 1 : 0)) ** 2, 0) / labeled.length : null;
  const duplicateIds = episodes.length - new Set(episodes.map((episode) => episode.episode_id)).size;
  const latencies = episodes.map((episode) => episode.metadata?.shadow_latency_ms).filter((value) => Number.isFinite(value));
  const costs = episodes.map((episode) => episode.metadata?.shadow_cost_usd).filter((value) => Number.isFinite(value));
  return {
    labeled_precision: labeled.length ? correct / labeled.length : null,
    labeled_recall: labeled.length ? correct / labeled.length : null,
    calibration_brier: brier,
    replay_consistency: duplicateIds ? null : 1,
    mean_latency_ms: latencies.length ? latencies.reduce((sum, value) => sum + value, 0) / latencies.length : null,
    mean_cost_usd: costs.length ? costs.reduce((sum, value) => sum + value, 0) / costs.length : null,
    labeled_samples: labeled.length
  };
}

export function evaluateShadowBatch(episodes, { skillCatalog = [] } = {}) {
  if (!Array.isArray(episodes)) throw new Error('episodes must be an array');
  const recommendations = episodes.flatMap((episode) => buildShadowRecommendations(episode, { skillCatalog }));
  const comparable = recommendations.filter((recommendation) => episodes.find((episode) => episode.episode_id === recommendation.episode_id)?.hypotheses?.selected_cause);
  const agreements = comparable.filter((recommendation) => recommendation.selected_cause === episodes.find((episode) => episode.episode_id === recommendation.episode_id).hypotheses.selected_cause).length;
  const unsafe = recommendations.filter((recommendation) => recommendation.authority.can_execute || recommendation.authority.can_approve || recommendation.authority.production_writes).length;
  return {
    schema: 'agent-infra/assistive-shadow-evaluation/v1',
    mode: 'shadow',
    sample: { episodes: episodes.length, recommendations: recommendations.length, comparable: comparable.length },
    metrics: {
      incumbent_agreement: comparable.length ? agreements / comparable.length : null,
      evidence_coverage: recommendations.length ? recommendations.filter((recommendation) => recommendation.evidence.length > 0).length / recommendations.length : null,
      next_best_diagnostic_coverage: recommendations.length ? recommendations.filter((recommendation) => recommendation.next_best_diagnostics.length > 0).length / recommendations.length : null,
      skill_match_rate: recommendations.length ? recommendations.filter((recommendation) => recommendation.skill_matches.length > 0).length / recommendations.length : null,
      unsafe_recommendation_rate: recommendations.length ? unsafe / recommendations.length : 0,
      ...computeAssistiveMetrics(episodes, recommendations)
    },
    recommendations
  };
}
