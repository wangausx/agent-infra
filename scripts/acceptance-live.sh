#!/usr/bin/env bash
set -euo pipefail
: "${AGENTTEAMS_ENV_FILE:?set AGENTTEAMS_ENV_FILE to the external AgentTeams env file}"
: "${AGENTTEAMS_MANAGER_ROOM:?set AGENTTEAMS_MANAGER_ROOM to the isolated Manager Matrix room}"
: "${AGENTTEAMS_MANAGER_USER_ID:?set AGENTTEAMS_MANAGER_USER_ID to the isolated Manager Matrix user ID}"
export AGENTTEAMS_LIVE=true
printf 'HEARTBEAT phase=tests\n'
npm test
printf 'HEARTBEAT phase=evaluate\n'
npm run evaluate
printf 'HEARTBEAT phase=isolated-mc\n'
npm run integration
printf 'HEARTBEAT phase=agentteams-contract\n'
npm run agentteams:integration
printf 'HEARTBEAT phase=agentteams-live-manager\n'
npm run agentteams:live
printf 'HEARTBEAT phase=native-mc-live\n'
npm run live:mc
printf 'HEARTBEAT phase=packaging\n'
npm run check
npm run package:check
git diff --check
printf 'ACCEPTANCE_LIVE_PASS\n'
