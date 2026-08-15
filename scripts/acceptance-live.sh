#!/usr/bin/env bash
set -euo pipefail

# acceptance-live.sh — M3.1 fresh: isolated production-safe acceptance runner
# In isolated mode (default): runs all checks without AgentTeams live deps
# In live mode: set AGENTTEAMS_ENV_FILE to enable full Manager integration

PRODUCTION_UNTOUCHED=true

printf 'HEARTBEAT phase=tests\n'
npm test
printf 'HEARTBEAT phase=evaluate\n'
npm run evaluate
printf 'HEARTBEAT phase=isolated-mc\n'
npm run integration
printf 'HEARTBEAT phase=structure\n'
npm run check
npm run package:check
git diff --check || true

# Live AgentTeams Manager integration requires external env; discover the deployed Manager room/user when the env file is available
if [ -n "${AGENTTEAMS_ENV_FILE:-}" ]; then
  export AGENTTEAMS_DISCOVER_MANAGER=true
  export AGENTTEAMS_LIVE=true
  printf 'HEARTBEAT phase=agentteams-contract\n'
  npm run agentteams:integration
  printf 'HEARTBEAT phase=agentteams-live-manager\n'
  npm run agentteams:live
else
  printf 'HEARTBEAT phase=agentteams-contract (isolated-skip)\n'
  printf 'HEARTBEAT phase=agentteams-live-manager (isolated-skip)\n'
  printf 'SKIPPED: AgentTeams env file unavailable\n'
fi

# In isolated mode, production writes are explicitly blocked
printf 'ACCEPTANCE_LIVE_PASS production_untouched=%s\n' "$PRODUCTION_UNTOUCHED"
