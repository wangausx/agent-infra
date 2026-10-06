#!/usr/bin/env bash
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
RUN_ID="${AUTOPILOT_RUN_ID:-autopilot-$(date -u +%Y%m%dT%H%M%SZ)-$$}"
OUT_DIR="$ROOT/state/autopilot-canary/$RUN_ID"
CHECKPOINT="$OUT_DIR/checkpoint.json"
HEARTBEAT="$OUT_DIR/heartbeat.jsonl"
NOTIFICATION="$OUT_DIR/completion-notification.json"
REPORT="$OUT_DIR/live-mc-e2e-report.json"
mkdir -p "$OUT_DIR"

write_checkpoint() {
  local phase="$1" status="$2"
  python3 - "$CHECKPOINT" "$RUN_ID" "$phase" "$status" "$REPORT" <<'PY'
import json,sys,time,os
path,run_id,phase,status,report=sys.argv[1:]
obj={"schema":"agent-infra/autopilot-checkpoint/v1","run_id":run_id,"phase":phase,"status":status,"updated_at":time.strftime('%Y-%m-%dT%H:%M:%SZ',time.gmtime()),"report_path":report}
tmp=path+'.tmp'; open(tmp,'w').write(json.dumps(obj,indent=2)+'\n'); os.replace(tmp,path)
PY
}

heartbeat_loop() {
  while :; do
    printf '%s\n' "{\"run_id\":\"$RUN_ID\",\"timestamp\":\"$(date -u +%Y-%m-%dT%H:%M:%SZ)\",\"phase\":\"running\"}" >> "$HEARTBEAT"
    sleep "${AUTOPILOT_HEARTBEAT_SECONDS:-10}"
  done
}

write_checkpoint "starting" "running"
heartbeat_loop &
HEARTBEAT_PID=$!
cleanup() { kill "$HEARTBEAT_PID" 2>/dev/null || true; wait "$HEARTBEAT_PID" 2>/dev/null || true; }
trap cleanup EXIT

write_checkpoint "scenario" "running"
set +e
MISSION_CONTROL_PORT=0 MISSION_CONTROL_REPORT="$REPORT" node "$ROOT/scripts/live-mc-e2e.mjs" > "$OUT_DIR/runner.log" 2>&1
RC=$?
set -e
if [ "$RC" -eq 0 ]; then
  write_checkpoint "completed" "passed"
else
  write_checkpoint "completed" "failed"
fi
python3 - "$NOTIFICATION" "$RUN_ID" "$RC" "$CHECKPOINT" "$HEARTBEAT" "$REPORT" <<'PY'
import json,sys,time,os
path,run_id,rc,checkpoint,heartbeat,report=sys.argv[1:]
obj={"schema":"agent-infra/autopilot-completion/v1","run_id":run_id,"status":"passed" if rc=="0" else "failed","exit_code":int(rc),"completed_at":time.strftime('%Y-%m-%dT%H:%M:%SZ',time.gmtime()),"checkpoint":checkpoint,"heartbeat":heartbeat,"report":report,"runner_log":os.path.join(os.path.dirname(path),'runner.log')}
open(path,'w').write(json.dumps(obj,indent=2)+'\n')
PY
cat "$NOTIFICATION"
exit "$RC"
