// MINE: prospect asteroids on a delta-v budget.
//
// Spectroscopy is the only thing you know before you arrive. Spectral class
// correlates with composition but does not determine it: M-types are the
// metallic ones and where the money is supposed to be, C-types are carbonaceous
// and mostly interesting for water, S-types are silicate and usually a waste of
// a burn. The correlation is real and loose, which is exactly the decision
// problem: spend delta-v to resolve uncertainty, or spend it arriving.

const CLASSES = {
  M: { label: 'M / metallic', mean: 72, spread: 30, tint: '#c9d4e6' },
  C: { label: 'C / carbonaceous', mean: 34, spread: 22, tint: '#6b7280' },
  S: { label: 'S / silicate', mean: 18, spread: 16, tint: '#a48a63' },
};

export function create({ host, rng, audio, announce, submit }) {
  const BUDGET = 7.4; // km/s
  const rocks = Array.from({ length: 9 }, (_, i) => {
    const k = ['M', 'C', 'S'][Math.floor(rng() * 3)];
    const c = CLASSES[k];
    // Truth is drawn around the class mean; the class is a hint, not an answer.
    const value = Math.max(2, c.mean + (rng() * 2 - 1) * c.spread);
    return {
      id: i,
      name: `${2000 + Math.floor(rng() * 9000)} ${String.fromCharCode(65 + Math.floor(rng() * 26))}${String.fromCharCode(65 + Math.floor(rng() * 26))}`,
      cls: k,
      dv: Number((0.6 + rng() * 2.4).toFixed(2)),
      surveyCost: 0.25,
      value,
      surveyed: false,
      mined: false,
    };
  });

  let spent = 0;
  let hauled = 0;
  let cursor = 0;
  let done = false;

  const wrap = document.createElement('div');
  wrap.innerHTML = `
    <p class="mono" style="font-size:12.5px;color:var(--dim);margin:0 0 18px">
      <b class="accent">${BUDGET} km/s</b> of delta-v, nine rocks. Spectral class is a hint, not a
      valuation. A survey costs 0.25 and tells you the truth; arriving costs whatever the
      transfer costs. <span class="accent">Arrows to move, s to survey, enter to mine, q to finish.</span>
    </p>
    <div class="table-scroll" style="margin-bottom:18px">
      <table class="data"><thead><tr>
        <th>Object</th><th>Class</th><th>Transfer</th><th>Assay</th><th>Status</th>
      </tr></thead><tbody data-rows></tbody></table>
    </div>
    <div class="row" style="align-items:flex-end;gap:26px;flex-wrap:wrap">
      <span class="metric" data-dv>0<small>of ${BUDGET} km/s spent</small></span>
      <span class="metric" data-hl>0<small>hauled</small></span>
      <button class="btn" data-fin>finish</button>
    </div>
    <div class="bar" style="height:8px;margin-top:16px"><span></span></div>
    <p class="mono" data-msg style="font-size:12.5px;min-height:3.4em;margin:14px 0 0"></p>`;
  host.appendChild(wrap);

  const tbody = wrap.querySelector('[data-rows]');
  const msg = wrap.querySelector('[data-msg]');
  rocks.forEach((r) => {
    const tr = document.createElement('tr');
    tr.dataset.i = String(r.id);
    tr.innerHTML = `<td class="num" data-n>${r.name}</td>
      <td style="color:${CLASSES[r.cls].tint}">${CLASSES[r.cls].label}</td>
      <td class="num">${r.dv} km/s</td><td data-a>unknown</td><td data-s></td>`;
    tbody.appendChild(tr);
  });

  function render() {
    rocks.forEach((r, i) => {
      const tr = tbody.children[i];
      tr.querySelector('[data-a]').innerHTML = r.surveyed
        ? `<span class="hi">${r.value.toFixed(0)}</span>`
        : `<span style="color:var(--faint)">unknown</span>`;
      tr.querySelector('[data-s]').textContent = r.mined ? 'mined' : '';
      tr.style.background = i === cursor && !done ? 'rgba(139,92,246,0.10)' : '';
      tr.querySelector('[data-n]').style.color = i === cursor && !done ? '#8b5cf6' : '';
      tr.style.opacity = r.mined ? 0.5 : 1;
    });
    wrap.querySelector('[data-dv]').firstChild.textContent = spent.toFixed(2);
    wrap.querySelector('[data-hl]').firstChild.textContent = Math.round(hauled);
    wrap.querySelector('.bar').style.setProperty('--v', spent / BUDGET);
    announce(`${spent.toFixed(1)} km/s spent, ${Math.round(hauled)} hauled`);
  }

  const spend = (dv) => {
    if (spent + dv > BUDGET + 1e-9) {
      msg.innerHTML = `<span style="color:#ff4d4d">Not enough delta-v.</span> ${(BUDGET - spent).toFixed(2)} left.`;
      audio.bad();
      return false;
    }
    spent += dv;
    return true;
  };

  function finish() {
    done = true;
    // What a perfect prospector would have taken with the same budget: greedy on
    // true value per km/s, no survey cost, which is the bound you cannot beat.
    const ideal = [...rocks].sort((a, b) => b.value / b.dv - a.value / a.dv);
    let dv = 0, best = 0;
    for (const r of ideal) { if (dv + r.dv <= BUDGET) { dv += r.dv; best += r.value; } }
    submit(Math.round(hauled));
    const pct = best > 0 ? (hauled / best) * 100 : 0;
    msg.innerHTML = `<b class="accent">${Math.round(hauled)} hauled</b> on ${spent.toFixed(2)} km/s.
      An oracle that already knew every assay would have taken <b class="accent">${Math.round(best)}</b>
      with the same budget, so you captured ${pct.toFixed(0)}% of what was there.
      Surveys are not free: every one you buy is a transfer you cannot make.`;
    (pct > 70 ? audio.good : audio.bad)();
    render();
  }

  const onKey = (e) => {
    if (done) return;
    const r = rocks[cursor];
    if (e.key === 'ArrowUp') { e.preventDefault(); cursor = (cursor - 1 + rocks.length) % rocks.length; render(); }
    else if (e.key === 'ArrowDown') { e.preventDefault(); cursor = (cursor + 1) % rocks.length; render(); }
    else if (e.key === 's') {
      e.preventDefault();
      if (r.surveyed || r.mined) return;
      if (!spend(r.surveyCost)) return;
      r.surveyed = true; audio.tick(); render();
    } else if (e.key === 'Enter') {
      e.preventDefault();
      if (r.mined) return;
      if (!spend(r.dv)) return;
      r.mined = true; r.surveyed = true; hauled += r.value;
      audio.good(); render();
    } else if (e.key === 'q') { e.preventDefault(); finish(); }
  };
  host.addEventListener('keydown', onKey);
  tbody.addEventListener('click', (e) => {
    const tr = e.target.closest('tr');
    if (tr && !done) { cursor = Number(tr.dataset.i); render(); }
  });
  wrap.querySelector('[data-fin]').addEventListener('click', finish);

  msg.textContent = 'M-types average the best and vary the most. That is the trap.';
  render();
  return { destroy() { host.removeEventListener('keydown', onKey); wrap.remove(); } };
}
