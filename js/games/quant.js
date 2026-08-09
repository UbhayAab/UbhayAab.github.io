// QUANT: fit a model under a hard VRAM budget without wrecking it.
//
// The board is not invented. The tensor groups and their parameter counts are
// the real shapes of an 8B Llama-class model (4096 hidden, 14336 FFN, 32
// layers, 128256 vocab, 8 KV heads), and the bits-per-weight column is the
// llama.cpp quantisation table.
//
// The sensitivity column is the interesting part. attn_v and ffn_down are the
// tensors that hurt most when you crush them, which is exactly why the real
// Q4_K_M recipe silently upcasts those two to Q6_K instead of quantising
// everything uniformly. Par in this game IS that recipe. Beating it is
// possible, and most people do not.

const M = 1e6;

const GROUPS = [
  { id: 'token_embd', label: 'token_embd', params: 525 * M, sens: 0.60, note: 'vocab 128256 x 4096' },
  { id: 'attn_q', label: 'attn_q', params: 537 * M, sens: 0.50, note: '32 x 4096 x 4096' },
  { id: 'attn_k', label: 'attn_k', params: 134 * M, sens: 0.70, note: '32 x 4096 x 1024, GQA' },
  { id: 'attn_v', label: 'attn_v', params: 134 * M, sens: 1.40, note: 'most sensitive tensor in the model' },
  { id: 'attn_o', label: 'attn_o', params: 537 * M, sens: 0.50, note: '32 x 4096 x 4096' },
  { id: 'ffn_gate', label: 'ffn_gate', params: 1879 * M, sens: 0.60, note: '32 x 4096 x 14336' },
  { id: 'ffn_up', label: 'ffn_up', params: 1879 * M, sens: 0.60, note: '32 x 4096 x 14336' },
  { id: 'ffn_down', label: 'ffn_down', params: 1879 * M, sens: 1.30, note: 'second most sensitive' },
  { id: 'output', label: 'output', params: 525 * M, sens: 1.00, note: 'the head, quantise at your peril' },
];

const QUANTS = [
  { id: 'F16', bits: 16.0, penalty: 0.000 },
  { id: 'Q8_0', bits: 8.50, penalty: 0.006 },
  { id: 'Q6_K', bits: 6.56, penalty: 0.020 },
  { id: 'Q5_K_M', bits: 5.68, penalty: 0.045 },
  { id: 'Q4_K_M', bits: 4.83, penalty: 0.095 },
  { id: 'Q3_K_M', bits: 3.91, penalty: 0.260 },
  { id: 'Q2_K', bits: 3.35, penalty: 0.750 },
];

// The shipped Q4_K_M recipe, tensor for tensor.
const PAR = {
  token_embd: 'Q4_K_M', attn_q: 'Q4_K_M', attn_k: 'Q4_K_M', attn_v: 'Q6_K',
  attn_o: 'Q4_K_M', ffn_gate: 'Q4_K_M', ffn_up: 'Q4_K_M', ffn_down: 'Q6_K', output: 'Q6_K',
};

// 8 GB card, minus what the KV cache and context actually take at 4096 tokens.
const BUDGET_GB = 6.8;

const gb = (bytes) => bytes / 1e9;
const sizeOf = (pick) => GROUPS.reduce((a, g) => a + (g.params * QUANTS.find((q) => q.id === pick[g.id]).bits) / 8, 0);
const lossOf = (pick) => GROUPS.reduce((a, g) => a + g.sens * QUANTS.find((q) => q.id === pick[g.id]).penalty, 0);
const scoreOf = (pick) => Math.round(10000 / (1 + lossOf(pick)));

export function create({ host, audio, announce, submit, best }) {
  const pick = Object.fromEntries(GROUPS.map((g) => [g.id, 'Q4_K_M']));
  let cursor = 0;
  let done = false;

  const parSize = sizeOf(PAR);
  const parScore = scoreOf(PAR);

  const wrap = document.createElement('div');
  wrap.innerHTML = `
    <p class="mono" style="font-size:12.5px;color:var(--dim);margin:0 0 18px">
      8B model, real tensor shapes. Budget is <b class="accent">${BUDGET_GB} GB</b>, which is an 8 GB card
      minus the KV cache at 4096 context. Pick a quantisation per tensor group. Lower bits means
      smaller and worse. Sensitivity says how much worse.
    </p>
    <div class="table-scroll" style="margin-bottom:18px">
      <table class="data"><thead><tr>
        <th>Tensor</th><th>Params</th><th>Sensitivity</th><th>Quant</th><th>Size</th><th></th>
      </tr></thead><tbody data-rows></tbody></table>
    </div>
    <div class="row" style="align-items:flex-end;gap:26px;flex-wrap:wrap">
      <span class="metric" data-size>-<small>of ${BUDGET_GB} GB budget</small></span>
      <span class="metric" data-score>-<small>score, higher is better</small></span>
      <span class="metric" data-par style="color:var(--dim)">${parScore}<small>par: the shipped Q4_K_M recipe</small></span>
      <button class="btn" data-submit>submit</button>
    </div>
    <div class="bar" style="height:8px;margin-top:16px"><span></span></div>
    <p class="mono" data-msg style="font-size:12.5px;min-height:3.4em;margin:16px 0 0"></p>`;
  host.appendChild(wrap);

  const tbody = wrap.querySelector('[data-rows]');
  const bar = wrap.querySelector('.bar');
  const msg = wrap.querySelector('[data-msg]');

  GROUPS.forEach((g, i) => {
    const tr = document.createElement('tr');
    tr.dataset.i = String(i);
    tr.innerHTML = `
      <td class="num" data-label>${g.label}</td>
      <td>${(g.params / 1e6).toFixed(0)}M</td>
      <td>${g.sens.toFixed(2)}${g.sens >= 1.3 ? ' <span class="hi">high</span>' : ''}</td>
      <td><span data-q class="hi"></span></td>
      <td class="num" data-sz></td>
      <td style="color:var(--faint);font-size:11px">${g.note}</td>`;
    tbody.appendChild(tr);
  });

  function render() {
    const size = sizeOf(pick);
    const over = gb(size) > BUDGET_GB;
    GROUPS.forEach((g, i) => {
      const tr = tbody.children[i];
      const q = QUANTS.find((x) => x.id === pick[g.id]);
      tr.querySelector('[data-q]').textContent = pick[g.id];
      tr.querySelector('[data-sz]').textContent = `${gb((g.params * q.bits) / 8).toFixed(2)} GB`;
      tr.style.background = i === cursor ? 'rgba(255,122,24,0.07)' : '';
      tr.querySelector('[data-label]').style.color = i === cursor ? 'var(--accent)' : '';
    });
    wrap.querySelector('[data-size]').firstChild.textContent = `${gb(size).toFixed(2)} GB`;
    wrap.querySelector('[data-size]').style.color = over ? '#ff4d4d' : 'var(--accent)';
    wrap.querySelector('[data-score]').firstChild.textContent = over ? 'over' : String(scoreOf(pick));
    bar.style.setProperty('--v', Math.min(1.35, gb(size) / BUDGET_GB));
    bar.style.setProperty('background', over ? 'rgba(255,77,77,.25)' : 'var(--line)');
    announce(`${gb(size).toFixed(2)} gigabytes, score ${over ? 'over budget' : scoreOf(pick)}`);
  }

  function move(d) {
    cursor = (cursor + d + GROUPS.length) % GROUPS.length;
    audio.tick();
    render();
  }
  function change(d) {
    const g = GROUPS[cursor];
    const i = QUANTS.findIndex((q) => q.id === pick[g.id]);
    const next = Math.max(0, Math.min(QUANTS.length - 1, i + d));
    if (next === i) return;
    pick[g.id] = QUANTS[next].id;
    audio.tick();
    render();
  }

  function finish() {
    const size = sizeOf(pick);
    if (gb(size) > BUDGET_GB) {
      msg.innerHTML = `<span style="color:#ff4d4d">Does not fit.</span> ${gb(size).toFixed(2)} GB against a ${BUDGET_GB} GB budget.
        On a real card this is not a warning, it is an out-of-memory abort partway through loading.`;
      audio.bad();
      return;
    }
    const s = scoreOf(pick);
    const isBest = submit(s);
    done = true;
    const delta = s - parScore;
    if (delta > 0) {
      msg.innerHTML = `<span class="g">${s}, beating par by ${delta}.</span>
        You found ${gb(parSize - size) > 0 ? `${gb(parSize - size).toFixed(2)} GB of headroom and ` : ''}a better
        precision split than the shipped recipe. The trick is always the same: spend your bits on
        <span class="accent">attn_v</span> and <span class="accent">ffn_down</span>, take them back from
        attn_q and attn_o, which barely notice.${isBest ? ' New personal best.' : ''}`;
      audio.good();
    } else if (delta === 0) {
      msg.innerHTML = `<span class="g">${s}. Exactly par.</span> You independently rederived the Q4_K_M recipe.`;
      audio.good();
    } else {
      msg.innerHTML = `${s}, which is ${-delta} short of par (${parScore}).
        Par keeps <span class="accent">attn_v</span> and <span class="accent">ffn_down</span> at Q6_K and
        pushes everything else to Q4_K_M. Those two tensors are 24% of the parameters and most of the damage.`;
      audio.bad();
    }
  }

  const onKey = (e) => {
    const k = e.key;
    if (k === 'ArrowUp') { e.preventDefault(); move(-1); }
    else if (k === 'ArrowDown') { e.preventDefault(); move(1); }
    else if (k === 'ArrowLeft') { e.preventDefault(); change(-1); }
    else if (k === 'ArrowRight') { e.preventDefault(); change(1); }
    else if (k === 'Enter') { e.preventDefault(); finish(); }
  };
  host.addEventListener('keydown', onKey);

  tbody.addEventListener('click', (e) => {
    const tr = e.target.closest('tr');
    if (!tr) return;
    cursor = Number(tr.dataset.i);
    change(1);
  });
  wrap.querySelector('[data-submit]').addEventListener('click', finish);

  render();
  return { destroy() { host.removeEventListener('keydown', onKey); wrap.remove(); } };
}
