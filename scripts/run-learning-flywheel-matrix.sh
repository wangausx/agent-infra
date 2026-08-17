#!/usr/bin/env bash
set -u -o pipefail
cd /srv/agent-platform/projects/agent-infra
checkpoint="/tmp/agent-infra-learning-flywheel-checkpoint-$$.log"
: > "$checkpoint"
step=0
run_step() {
  step=$((step + 1))
  name="$1"
  shift
  printf '%s START step=%s %s\n' "$(date -Is)" "$step" "$name" | tee -a "$checkpoint"
  "$@" 2>&1 | tee -a "$checkpoint"
  rc=${PIPESTATUS[0]}
  printf '%s HEARTBEAT step=%s %s exit=%s\n' "$(date -Is)" "$step" "$name" "$rc" | tee -a "$checkpoint"
  if [ "$rc" -ne 0 ]; then
    printf '%s COMPLETE status=failed step=%s checkpoint=%s\n' "$(date -Is)" "$step" "$checkpoint" | tee -a "$checkpoint"
    exit "$rc"
  fi
}
run_step episodes-test npm run episodes:test
run_step structure-check npm run check
run_step full-test npm test
run_step evaluation npm run evaluate
run_step operational-shadow npm run episodes:shadow -- --root "/tmp/agent-infra-learning-flywheel-run-$$" --runs-root artifacts/runs
run_step diff-check git diff --check
printf '%s COMPLETE status=passed checkpoint=%s\n' "$(date -Is)" "$checkpoint" | tee -a "$checkpoint"
