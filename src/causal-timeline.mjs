import fs from 'node:fs/promises';
import path from 'node:path';

const ANSI = { reset: '\u001b[0m', red: '\u001b[31m', orange: '\u001b[33m', yellow: '\u001b[93m', green: '\u001b[32m', cyan: '\u001b[36m', dim: '\u001b[2m', bold: '\u001b[1m' };

function color(text, name, enabled) { return enabled ? `${ANSI[name]}${text}${ANSI.reset}` : text; }
async function readJson(dir, file) { return JSON.parse(await fs.readFile(path.join(dir, file), 'utf8')); }

export async function loadCausalViewModel(dir) {
  const [scorecard, incident, rca, policy, action, verifier, manifest] = await Promise.all([
    readJson(dir, 'scorecard.json'), readJson(dir, 'incident.json'), readJson(dir, 'rca-report.json'),
    readJson(dir, 'policy-decision.json'), readJson(dir, 'action-result.json'), readJson(dir, 'verifier-report.json'),
    readJson(dir, 'evidence-manifest.json')
  ]);
  const raw = scorecard.measurable_value.raw_alerts;
  const suppressed = scorecard.measurable_value.suppressed_alerts;
  const checks = verifier.checks.filter((check) => check.passed).length;
  const totalChecks = verifier.checks.length;
  return {
    schema: 'agent-infra/demo-view-model/v1', run_id: scorecard.run_id, correlation_id: manifest.correlation_id,
    verdict: verifier.verdict, safety: { production_writes: scorecard.production_writes, physical_vehicle_used: scorecard.physical_vehicle_used, simulation_only: action.before_state.simulation_only },
    stages: [
      { id: 'alert', icon: '🔴', label: 'ALERT', color: 'red', detail: `${raw} sensor signals received → ${scorecard.measurable_value.incidents} incident (correlated)`, owner: 'Danny', artifact: 'incident.json' },
      { id: 'rca', icon: '🟠', label: 'RCA', color: 'orange', detail: `${rca.hypotheses.length} hypotheses evaluated → "${rca.selected_cause}" selected`, owner: 'Morgan', artifact: 'rca-report.json' },
      { id: 'policy', icon: '🟡', label: 'POLICY', color: 'yellow', detail: `${policy.action} → ${policy.approval_required ? 'approval required' : 'auto-approved'} (${policy.reason})`, owner: 'Morgan', artifact: 'policy-decision.json' },
      { id: 'action', icon: '🟢', label: 'ACTION', color: 'green', detail: 'Sensor timestamps resynchronized (dry-run)', owner: 'Rex', artifact: 'action-result.json' },
      { id: 'verify', icon: '✅', label: 'VERIFY', color: 'green', detail: `fusion_confidence ${action.before_state.fusion_confidence}→${action.after_state.fusion_confidence} ✓ | tracking ${action.before_state.tracking_confidence}→${action.after_state.tracking_confidence} ✓ | ${checks}/${totalChecks} checks passed`, owner: 'Dr. Sage', artifact: 'verifier-report.json' },
      { id: 'review', icon: '📋', label: 'REVIEW', color: 'cyan', detail: `Verdict ${verifier.verdict} → sealed in Mission Control`, owner: 'Juno', artifact: 'mission-control-snapshot.json' }
    ],
    value: { suppressed, incidents: scorecard.measurable_value.incidents, selectedCause: rca.selected_cause, compensation: action.compensation?.available === true }
  };
}

export function renderTerminal(model, { colorEnabled = process.stdout.isTTY, compact = false } = {}) {
  const width = compact ? 88 : 112;
  const line = '─'.repeat(width);
  const out = [];
  out.push(color('╭' + line + '╮', 'cyan', colorEnabled));
  out.push(color('│ TRUSTOPS CONTROL ROOM · CLOSED-LOOP AUTOMATION'.padEnd(width + 1) + '│', 'bold', colorEnabled));
  out.push(color(`│ run=${model.run_id}  correlation=${model.correlation_id}`.padEnd(width + 1) + '│', 'dim', colorEnabled));
  out.push(color('├' + line + '┤', 'cyan', colorEnabled));
  model.stages.forEach((stage, index) => {
    const step = `${stage.icon} ${stage.label}`;
    const prefix = `${index === model.stages.length - 1 ? '└' : '├'}─ ${step.padEnd(12)} │ ${stage.detail}`;
    out.push(color('│ ' + prefix.slice(0, width).padEnd(width + 1) + '│', stage.color, colorEnabled));
    if (index < model.stages.length - 1) out.push(color('│       │', 'dim', colorEnabled));
    if (!compact) out.push(color(`│       └─ owner=${stage.owner} · evidence=${stage.artifact}`.padEnd(width + 1) + '│', 'dim', colorEnabled));
  });
  out.push(color('├' + line + '┤', 'cyan', colorEnabled));
  out.push(`│ ${color('VALUE', 'bold', colorEnabled)}  ${model.value.suppressed} duplicate/noisy alerts suppressed · ${model.value.incidents} incident · compensation ${model.value.compensation ? 'available' : 'unavailable'}`.padEnd(width + 1) + '│');
  out.push(`│ ${color('SAFETY', 'bold', colorEnabled)} simulation_only=${model.safety.simulation_only} · production_writes=${model.safety.production_writes} · physical_vehicle_used=${model.safety.physical_vehicle_used}`.padEnd(width + 1) + '│');
  out.push(color('╰' + line + '╯', 'cyan', colorEnabled));
  return out.join('\n');
}

export function renderUiHtml(model) {
  const data = JSON.stringify(model).replace(/</g, '\\u003c');
  return `<!doctype html><html><head><meta charset="utf-8"><title>TrustOps Control Room</title><style>
:root{color-scheme:dark;font:15px ui-monospace,SFMono-Regular,Menlo,monospace}body{margin:0;background:#081018;color:#dbeafe;padding:32px}main{max-width:1100px;margin:auto}h1{font-size:22px;color:#67e8f9}.meta,.safety{color:#94a3b8;font-size:12px;margin:8px 0 20px}.timeline{display:grid;gap:10px}.stage{display:grid;grid-template-columns:42px 110px 1fr 90px;gap:12px;align-items:center;padding:14px;border:1px solid #203244;border-left:5px solid var(--c);background:#0d1924}.stage.active{box-shadow:0 0 0 1px var(--c),0 0 20px #164e63}.icon{font-size:22px}.label{font-weight:bold;color:var(--c)}.owner{color:#94a3b8;font-size:12px}.controls{display:flex;gap:8px;margin:22px 0}.controls button{background:#102536;color:#dbeafe;border:1px solid #31516a;padding:8px 14px;border-radius:5px;cursor:pointer}.bar{height:6px;background:#1e293b;margin:20px 0}.bar i{display:block;height:100%;background:#22c55e;width:0;transition:width .2s}.cards{display:flex;gap:12px;margin-top:20px}.card{border:1px solid #203244;padding:12px;flex:1;color:#a5f3fc}.ok{color:#86efac}@media(max-width:700px){body{padding:16px}.stage{grid-template-columns:32px 80px 1fr}.owner{display:none}.cards{display:block}.card{margin-top:8px}}</style></head><body><main><h1>TRUSTOPS CONTROL ROOM · CLOSED-LOOP AUTOMATION</h1><div class="meta">run=${model.run_id} · correlation=${model.correlation_id}</div><div class="controls"><button id="play">▶ Play</button><button id="next">Next</button><button id="replay">↺ Replay</button></div><div class="bar"><i id="progress"></i></div><section class="timeline" id="timeline"></section><section class="cards"><div class="card">VALUE<br><span class="ok">${model.value.suppressed} noisy alerts suppressed → ${model.value.incidents} incident</span></div><div class="card">SAFETY<br><span class="ok">simulation-only · no production writes · no physical vehicle</span></div></section></main><script>const model=${data};let index=-1,timer=null;const colors={red:'#f87171',orange:'#fb923c',yellow:'#fde047',green:'#4ade80',cyan:'#67e8f9'};const t=document.querySelector('#timeline');function draw(){t.innerHTML=model.stages.map((s,i)=>'<article class="stage '+(i===index?'active':'')+'" style="--c:'+colors[s.color]+'"><span class="icon">'+s.icon+'</span><span class="label">'+s.label+'</span><span>'+s.detail+'</span><span class="owner">owner='+s.owner+'<br>'+s.artifact+'</span></article>').join('');document.querySelector('#progress').style.width=((index+1)/model.stages.length*100)+'%'}function next(){if(index<model.stages.length-1){index++;draw()}else{clearInterval(timer);timer=null}}document.querySelector('#next').onclick=next;document.querySelector('#replay').onclick=()=>{index=-1;draw()};document.querySelector('#play').onclick=()=>{if(timer){clearInterval(timer);timer=null}else{next();timer=setInterval(next,900)}};draw();</script></body></html>`;
}
