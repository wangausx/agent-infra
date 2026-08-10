#!/usr/bin/env bash
set -euo pipefail
printf 'HEARTBEAT phase=tests\n'
npm test
printf 'HEARTBEAT phase=demo\n'
npm run demo
printf 'HEARTBEAT phase=evaluate\n'
npm run evaluate
printf 'HEARTBEAT phase=isolated-integration\n'
npm run integration
printf 'HEARTBEAT phase=agentteams-contract\n'
npm run agentteams:integration
printf 'HEARTBEAT phase=packaging\n'
npm run check
npm run package:check
git diff --check
printf 'ACCEPTANCE_MVP_PASS\n'
