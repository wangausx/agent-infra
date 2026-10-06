import { MissionControlClient } from '../src/mission-control-client.mjs';
const client = new MissionControlClient({baseUrl:'http://127.0.0.1:3015',mode:'isolated',dryRun:false,minRequestIntervalMs:1});
const runId = `run-${Date.now()}`;
const runDir = `/srv/agent-platform/projects/agent-infra/state/autopilot-canary/${runId}`;
const report = `${runDir}/report.json`;
const notification = `${runDir}/notification.json`;
const contract = {version:1,objective:'Execute the existing isolated autopilot canary through the real poller and service-owned worker launcher.',scope:['isolated Mission Control :3015','no source changes','no production writes'],execution:{mode:'agent'},acceptance:[
{id:'launch',requirement:'Real poller launches a service-owned worker and records the actual worker PID',required:true,status:'pending',evidence:[]},
{id:'progress',requirement:'Worker posts substantive progress and heartbeat evidence',required:true,status:'pending',evidence:[]},
{id:'artifacts',requirement:'Inspect checkpoint, heartbeat, report, and notification artifacts',required:true,status:'pending',evidence:[]},
{id:'review',requirement:'Verify independent evidence reaches in-review exactly once',required:true,status:'pending',evidence:[]},
{id:'safety',requirement:'Production Mission Control :3005 remains untouched',required:true,status:'pending',evidence:[]}
],review:{verdict:'pending',checks:[{id:'artifacts',requirement:'Checkpoint, heartbeat, report, and notification artifacts are readable',required:true,status:'pending',evidence:[]}]}};
const task = await client.createTask({title:`[CANARY] Real poller service-owned autopilot closure ${Date.now()}`,description:'Run the existing isolated autopilot canary through the real mc-agent-poll.sh path. Do not modify source files.\n\n### Acceptance Criteria\n- [ ] Real poller launches a service-owned worker and records the actual worker PID\n- [ ] Worker posts substantive progress and heartbeat evidence\n- [ ] Inspect checkpoint, heartbeat, report, and notification artifacts\n- [ ] Verify independent evidence reaches in-review exactly once\n- [ ] Production Mission Control :3005 remains untouched',status:'backlog',assignee:'main',priority:'high',tags:['agent-infra','autopilot','isolated','canary'],project_slug:'agent-infra',project_root:'/srv/agent-platform/projects/agent-infra',project_profile:'generic-orchestrator',deliverables:[{label:'durable canary notification',path:notification},{label:'durable canary report',path:report}],task_contract:contract});
console.log(JSON.stringify({id:task.id,title:task.title,status:task.status,assignee:task.assignee},null,2));
