function windowKey(timestamp) {
  const date = new Date(timestamp);
  if (Number.isNaN(date.getTime())) return null;
  const day = date.getUTCDay() || 7;
  date.setUTCDate(date.getUTCDate() - day + 1);
  return date.toISOString().slice(0, 10);
}

export function assessWindowReadiness(episodes, { minWindows = 3, minDomains = 3 } = {}) {
  if (!Array.isArray(episodes)) throw new Error('episodes must be an array');
  const eligible = episodes.filter((episode) => episode?.dataset_membership?.status === 'approved' && episode.dataset_membership.eligible_for_training === true);
  const windows = new Set();
  const domains = new Set();
  const invalid = [];
  for (const episode of eligible) {
    const key = windowKey(episode.context?.observed_at);
    const domain = episode.context?.scenario;
    if (!key || !domain) { invalid.push(episode.episode_id ?? null); continue; }
    windows.add(key);
    domains.add(domain);
  }
  const failures = [];
  if (windows.size < minWindows) failures.push(`need at least ${minWindows} independent UTC weeks`);
  if (domains.size < minDomains) failures.push(`need at least ${minDomains} independent domains`);
  if (invalid.length) failures.push('eligible episodes must include valid context.observed_at and context.scenario');
  return { schema: 'agent-infra/window-readiness/v1', ready: failures.length === 0, eligible_episodes: eligible.length, windows: windows.size, domains: domains.size, window_keys: [...windows].sort(), domain_keys: [...domains].sort(), invalid_episode_ids: invalid, failures };
}
