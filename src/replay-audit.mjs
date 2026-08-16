const identityKey = (identity) => typeof identity === 'string' ? identity : identity?.id ?? identity?.name ?? null;

function groupKeys(episode) {
  return [
    `run:${episode.run_id}`,
    `correlation:${episode.correlation_id}`,
    ...(episode.identities ?? []).map(identityKey).filter(Boolean).map((value) => `identity:${value}`)
  ];
}

export function validateNoLeakage({ train = [], validation = [], test = [] }) {
  const errors = [];
  const seen = new Map();
  for (const [split, episodes] of Object.entries({ train, validation, test })) {
    for (const episode of episodes) {
      for (const key of groupKeys(episode)) {
        if (seen.has(key) && seen.get(key) !== split) errors.push(`${key} appears in ${seen.get(key)} and ${split}`);
        else seen.set(key, split);
      }
    }
  }
  return [...new Set(errors)].sort();
}

export function assertNoLeakage(splits) {
  const errors = validateNoLeakage(splits);
  if (errors.length) throw new Error(`dataset leakage detected: ${errors.join('; ')}`);
  return splits;
}

export function validateReplayIntegrity(episodes) {
  const errors = [];
  const ids = new Set();
  for (const episode of episodes) {
    if (ids.has(episode.episode_id)) errors.push(`duplicate episode_id: ${episode.episode_id}`);
    ids.add(episode.episode_id);
    for (const claim of episode.claims ?? []) for (const ref of claim.evidence_refs ?? []) if (!(episode.source?.files ?? []).includes(ref.artifact)) errors.push(`${episode.episode_id}: unbound evidence ref ${ref.artifact}`);
    if (episode.decision?.authority?.production_writes === true) errors.push(`${episode.episode_id}: production_writes must remain false for replay dataset`);
    if (!episode.run_id || !episode.correlation_id) errors.push(`${episode.episode_id}: missing replay lineage`);
  }
  return [...new Set(errors)].sort();
}

export function assertReplayIntegrity(episodes) {
  const errors = validateReplayIntegrity(episodes);
  if (errors.length) throw new Error(`replay integrity failed: ${errors.join('; ')}`);
  return episodes;
}
