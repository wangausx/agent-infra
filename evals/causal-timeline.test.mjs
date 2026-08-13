import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import { loadCausalViewModel, renderTerminal, renderUiHtml } from '../src/causal-timeline.mjs';

const dir = path.resolve('artifacts/runs/run-e921dfe97489eb24');
test('causal view model renders the evidence-backed closed loop', async () => {
  const model = await loadCausalViewModel(dir);
  assert.deepEqual(model.stages.map((stage) => stage.label), ['ALERT', 'RCA', 'POLICY', 'ACTION', 'VERIFY', 'REVIEW']);
  assert.match(model.stages[0].detail, /12 sensor signals received/);
  assert.match(model.stages[1].detail, /3 hypotheses evaluated/);
  assert.match(model.stages[4].detail, /0\.61→0\.91/);
  assert.equal(model.safety.production_writes, false);
  assert.equal(model.safety.physical_vehicle_used, false);
});

test('terminal and ui renderers expose stage owners and safety boundary', async () => {
  const model = await loadCausalViewModel(dir);
  const terminal = renderTerminal(model, { colorEnabled: false });
  assert.match(terminal, /🔴 ALERT/);
  assert.match(terminal, /🟠 RCA/);
  assert.match(terminal, /🟡 POLICY/);
  assert.match(terminal, /🟢 ACTION/);
  assert.match(terminal, /✅ VERIFY/);
  assert.match(terminal, /📋 REVIEW/);
  assert.match(terminal, /Dr\. Sage/);
  assert.match(terminal, /production_writes=false/);
  const html = renderUiHtml(model);
  assert.match(html, /id="play"/);
  assert.match(html, /id="progress"/);
  assert.match(html, /Dr\. Sage/);
  assert.match(html, /run-e921dfe97489eb24/);
  await fs.access(dir);
});
