// FARM: run one grow cycle inside a fixed energy budget.
//
// The whole economics of vertical farming sits in one number: photons cost
// money indoors. Every crop has a daily light integral it needs, measured in
// mol/m2/day, and giving it less than that costs yield faster than linearly.
// Give it more and you are burning electricity for nothing. The game is that
// the budget is not enough for every tray, so the answer is never "everything".

const CROPS = [
  { name: 'Butterhead lettuce', dli: 14, price: 3.1, area: 6 },
  { name: 'Basil', dli: 18, price: 5.4, area: 4 },
  { name: 'Baby spinach', dli: 13, price: 3.6, area: 6 },
  { name: 'Strawberry', dli: 22, price: 12.5, area: 5 },
  { name: 'Coriander', dli: 15, price: 4.2, area: 4 },
  { name: 'Wasabi', dli: 9, price: 41.0, area: 3 },
];

// Photosynthetic efficacy of a decent horticultural LED, micromoles per joule.
const PPE = 2.8;
const BUDGET_KWH = 420;

export function create({ host, audio, announce, submit }) {
  const light = CROPS.map((c) => Math.round(c.dli * 0.6));
  let cursor = 0;
  let done = false;

  const energyFor = (i) => (light[i] * CROPS[i].area * 1e6) / (PPE * 3.6e6);
  const totalEnergy = () => light.reduce((a, _, i) => a + energyFor(i), 0);
  // Yield saturates: below the requirement it falls off hard, above it plateaus.
  const yieldOf = (i) => {
    const r = light[i] / CROPS[i].dli;
    return r <= 1 ? Math.pow(r, 1.7) : 1 + Math.min(0.12, (r - 1) * 0.18);
  };
  const revenue = () => CROPS.reduce((a, c, i) => a + yieldOf(i) * c.price * c.area, 0);
  const energyCost = () => totalEnergy() * 0.11;
  const profit = () => revenue() - energyCost();

  const wrap = document.createElement('div');
  wrap.innerHTML = `
    <p class="mono" style="font-size:12.5px;color:var(--dim);margin:0 0 18px">
      Six trays, one <b class="accent">${BUDGET_KWH} kWh</b> budget for the cycle. Each crop has a
      daily light integral it needs; under-light it and yield collapses, over-light it and you
      are paying for photons the plant cannot use. Electricity at 0.11 a kWh.
      <span class="accent">Arrows to allocate, enter to harvest.</span>
    </p>
    <div class="table-scroll" style="margin-bottom:18px">
      <table class="data"><thead><tr>
        <th>Crop</th><th>Needs</th><th>Given</th><th>Yield</th><th>kWh</th><th>Value</th>
      </tr></thead><tbody data-rows></tbody></table>
    </div>
    <div class="row" style="align-items:flex-end;gap:26px;flex-wrap:wrap">
      <span class="metric" data-en>0<small>of ${BUDGET_KWH} kWh</small></span>
      <span class="metric" data-pf>0<small>profit</small></span>
      <button class="btn" data-go>harvest</button>
    </div>
    <div class="bar" style="height:8px;margin-top:16px"><span></span></div>
    <p class="mono" data-msg style="font-size:12.5px;min-height:3.4em;margin:14px 0 0"></p>`;
  host.appendChild(wrap);

  const tbody = wrap.querySelector('[data-rows]');
  const msg = wrap.querySelector('[data-msg]');
  CROPS.forEach((c, i) => {
    const tr = document.createElement('tr');
    tr.dataset.i = String(i);
    tr.innerHTML = `<td class="num" data-n>${c.name}</td><td>${c.dli} mol</td>
      <td class="num hi" data-g></td><td data-y></td><td class="num" data-e></td><td data-v></td>`;
    tbody.appendChild(tr);
  });

  function render() {
    CROPS.forEach((c, i) => {
      const tr = tbody.children[i];
      tr.querySelector('[data-g]').textContent = `${light[i]} mol`;
      tr.querySelector('[data-y]').textContent = `${(yieldOf(i) * 100).toFixed(0)}%`;
      tr.querySelector('[data-e]').textContent = energyFor(i).toFixed(0);
      tr.querySelector('[data-v]').textContent = (yieldOf(i) * c.price * c.area).toFixed(1);
      tr.style.background = i === cursor ? 'rgba(34,197,94,0.09)' : '';
      tr.querySelector('[data-n]').style.color = i === cursor ? '#22c55e' : '';
    });
    const e = totalEnergy();
    const over = e > BUDGET_KWH;
    wrap.querySelector('[data-en]').firstChild.textContent = e.toFixed(0);
    wrap.querySelector('[data-en]').style.color = over ? '#ff4d4d' : 'var(--accent)';
    wrap.querySelector('[data-pf]').firstChild.textContent = profit().toFixed(0);
    wrap.querySelector('.bar').style.setProperty('--v', Math.min(1.3, e / BUDGET_KWH));
    announce(`${e.toFixed(0)} kilowatt hours, profit ${profit().toFixed(0)}`);
  }

  function harvest() {
    if (totalEnergy() > BUDGET_KWH) {
      msg.innerHTML = `<span style="color:#ff4d4d">Over budget by ${(totalEnergy() - BUDGET_KWH).toFixed(0)} kWh.</span>
        In a real facility that is not a warning, it is the month you discover the farm loses money.`;
      audio.bad();
      return;
    }
    done = true;
    const p = profit();
    submit(Math.round(p));
    // The optimum is heavily weighted to value density per photon.
    const best = [...CROPS].map((c, i) => ({ i, ratio: (c.price * c.area) / (c.dli * c.area) }))
      .sort((a, b) => b.ratio - a.ratio)[0];
    msg.innerHTML = `<b class="accent">${p.toFixed(0)} profit.</b>
      The ranking that matters is value per photon, not value per tray:
      <b class="accent">${CROPS[best.i].name}</b> returns the most for every mole you spend on it.
      Wasabi looks absurd until you notice it wants the least light and sells for the most.`;
    audio.good();
  }

  const onKey = (e) => {
    if (done) return;
    const step = e.shiftKey ? 3 : 1;
    if (e.key === 'ArrowUp') { e.preventDefault(); cursor = (cursor - 1 + CROPS.length) % CROPS.length; render(); }
    else if (e.key === 'ArrowDown') { e.preventDefault(); cursor = (cursor + 1) % CROPS.length; render(); }
    else if (e.key === 'ArrowRight') { e.preventDefault(); light[cursor] = Math.min(40, light[cursor] + step); audio.tick(); render(); }
    else if (e.key === 'ArrowLeft') { e.preventDefault(); light[cursor] = Math.max(0, light[cursor] - step); audio.tick(); render(); }
    else if (e.key === 'Enter') { e.preventDefault(); harvest(); }
  };
  host.addEventListener('keydown', onKey);
  tbody.addEventListener('click', (e) => {
    const tr = e.target.closest('tr');
    if (tr && !done) { cursor = Number(tr.dataset.i); render(); }
  });
  wrap.querySelector('[data-go]').addEventListener('click', harvest);

  msg.textContent = 'Everything starts at 60% of what it wants, which grows nothing well.';
  render();
  return { destroy() { host.removeEventListener('keydown', onKey); wrap.remove(); } };
}
