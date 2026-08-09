// BANDIT: fourteen days, a fixed daily ad budget, twelve keywords whose true
// click-through rates you cannot see.
//
// This is the actual decision problem inside the KDP ads work: you only learn
// a keyword's value by spending money on it, and every unit spent learning is
// a unit not spent earning. Straight out of the multi-armed bandit literature,
// with the twist that the arms cost different amounts per click.
//
// At the end your revenue is scored against two reference policies run on the
// identical seed: a greedy one that always backs the current leader, and
// Thompson sampling. Beating greedy is common. Beating Thompson is not.

const KEYWORDS = [
  'cozy mystery paperback', 'sudoku book for adults', 'journal for men',
  'kids activity book 6-8', 'planner 2027', 'coloring book adults',
  'crossword large print', 'travel guide iceland', 'notebook dotted a5',
  'recipe binder', 'workbook grade 3', 'sketchbook hardcover',
];

const DAYS = 14;
const BUDGET = 100;
const REVENUE_PER_CONV = 9.4;

// Beta sample via two gammas, so Thompson sampling is real rather than a
// hand-waved "pick the best with noise".
function gammaSample(k, rand) {
  if (k < 1) return gammaSample(k + 1, rand) * Math.pow(rand(), 1 / k);
  const d = k - 1 / 3;
  const c = 1 / Math.sqrt(9 * d);
  for (;;) {
    let x, v;
    do { const u1 = rand(), u2 = rand();
      x = Math.sqrt(-2 * Math.log(u1 || 1e-9)) * Math.cos(2 * Math.PI * u2);
      v = 1 + c * x;
    } while (v <= 0);
    v = v * v * v;
    const u = rand();
    if (u < 1 - 0.0331 * x * x * x * x) return d * v;
    if (Math.log(u || 1e-9) < 0.5 * x * x + d * (1 - v + Math.log(v))) return d * v;
  }
}
const betaSample = (a, b, rand) => {
  const x = gammaSample(a, rand), y = gammaSample(b, rand);
  return x / (x + y);
};

export function create({ host, rng, audio, announce, submit }) {
  // Hidden truth, fixed by the seed so everyone plays the same board today.
  const arms = KEYWORDS.map((name) => ({
    name,
    cpc: 0.18 + rng() * 0.55,          // cost per click
    ctr: 0.02 + rng() * rng() * 0.22,  // conversion rate, skewed so most are duds
  }));

  const you = arms.map(() => ({ spend: 0, clicks: 0, convs: 0 }));
  const alloc = arms.map(() => Math.round(BUDGET / arms.length));
  let day = 0;
  let revenue = 0;
  let spent = 0;
  let cursor = 0;
  let over = false;

  const wrap = document.createElement('div');
  wrap.innerHTML = `
    <p class="mono" style="font-size:12.5px;color:var(--dim);margin:0 0 18px">
      ${DAYS} days, <b class="accent">${BUDGET} units</b> of budget per day, ${arms.length} keywords with
      hidden conversion rates. Spending on a keyword is the only way to learn what it is worth.
      Arrow keys to allocate, <span class="accent">enter</span> to run the day.
    </p>
    <div class="table-scroll" style="margin-bottom:18px">
      <table class="data"><thead><tr>
        <th>Keyword</th><th>Budget</th><th>Spent</th><th>Clicks</th><th>Conv</th><th>Observed CVR</th><th>True CVR</th>
      </tr></thead><tbody data-rows></tbody></table>
    </div>
    <div class="row" style="align-items:flex-end;gap:26px;flex-wrap:wrap">
      <span class="metric" data-day>1/${DAYS}<small>day</small></span>
      <span class="metric" data-rev>0<small>revenue</small></span>
      <span class="metric" data-alloc style="color:var(--dim)">${BUDGET}<small>allocated of ${BUDGET}</small></span>
      <button class="btn" data-run>run day</button>
    </div>
    <p class="mono" data-msg style="font-size:12.5px;min-height:4.5em;margin:16px 0 0"></p>`;
  host.appendChild(wrap);

  const tbody = wrap.querySelector('[data-rows]');
  const msg = wrap.querySelector('[data-msg]');

  arms.forEach((a, i) => {
    const tr = document.createElement('tr');
    tr.dataset.i = String(i);
    tr.innerHTML = `<td class="num" data-name>${a.name}</td><td class="num hi" data-b></td>
      <td data-s></td><td data-c></td><td data-v></td><td data-o></td><td data-t style="color:var(--faint)">hidden</td>`;
    tbody.appendChild(tr);
  });

  const total = () => alloc.reduce((x, y) => x + y, 0);

  function render() {
    arms.forEach((a, i) => {
      const tr = tbody.children[i];
      const y = you[i];
      tr.querySelector('[data-b]').textContent = alloc[i];
      tr.querySelector('[data-s]').textContent = y.spend ? y.spend.toFixed(0) : '-';
      tr.querySelector('[data-c]').textContent = y.clicks || '-';
      tr.querySelector('[data-v]').textContent = y.convs || '-';
      tr.querySelector('[data-o]').textContent = y.clicks ? `${((y.convs / y.clicks) * 100).toFixed(1)}%` : '-';
      if (over) {
        const t = tr.querySelector('[data-t]');
        t.textContent = `${(a.ctr * 100).toFixed(1)}%`;
        t.style.color = a.ctr > 0.14 ? 'var(--good)' : 'var(--faint)';
      }
      tr.style.background = i === cursor && !over ? 'rgba(255,122,24,0.07)' : '';
      tr.querySelector('[data-name]').style.color = i === cursor && !over ? 'var(--accent)' : '';
    });
    wrap.querySelector('[data-day]').firstChild.textContent = `${Math.min(day + 1, DAYS)}/${DAYS}`;
    wrap.querySelector('[data-rev]').firstChild.textContent = revenue.toFixed(0);
    const t = total();
    const al = wrap.querySelector('[data-alloc]');
    al.firstChild.textContent = String(t);
    al.style.color = t > BUDGET ? '#ff4d4d' : 'var(--dim)';
  }

  /** One day of spend for an arbitrary allocation. Shared by you and the bots. */
  function simulate(a, allocation, rand, acc) {
    let rev = 0;
    allocation.forEach((budget, i) => {
      if (budget <= 0) return;
      const clicks = Math.floor(budget / a[i].cpc);
      let convs = 0;
      for (let c = 0; c < clicks; c += 1) if (rand() < a[i].ctr) convs += 1;
      rev += convs * REVENUE_PER_CONV;
      if (acc) { acc[i].spend += budget; acc[i].clicks += clicks; acc[i].convs += convs; }
    });
    return rev;
  }

  function referencePolicies() {
    // Both bots replay the same 14 days with their own private RNG stream.
    const mk = (seed) => { let s = seed; return () => { s = (s * 1664525 + 1013904223) >>> 0; return s / 4294967296; }; };

    // greedy: split evenly for 3 days, then everything on the observed leader
    const gRand = mk(11);
    const gAcc = arms.map(() => ({ spend: 0, clicks: 0, convs: 0 }));
    let gRev = 0;
    for (let d = 0; d < DAYS; d += 1) {
      let a;
      if (d < 3) a = arms.map(() => BUDGET / arms.length);
      else {
        const rates = gAcc.map((x) => (x.clicks ? x.convs / x.clicks : 0));
        const best = rates.indexOf(Math.max(...rates));
        a = arms.map((_, i) => (i === best ? BUDGET : 0));
      }
      gRev += simulate(arms, a, gRand, gAcc);
    }

    // thompson: sample a plausible CVR per arm from its beta posterior and
    // spread the budget over the top three samples
    const tRand = mk(29);
    const tAcc = arms.map(() => ({ spend: 0, clicks: 0, convs: 0 }));
    let tRev = 0;
    for (let d = 0; d < DAYS; d += 1) {
      const draws = tAcc.map((x) => betaSample(1 + x.convs, 1 + Math.max(0, x.clicks - x.convs), tRand));
      const rank = draws.map((v, i) => [v, i]).sort((p, q) => q[0] - p[0]);
      const a = arms.map(() => 0);
      a[rank[0][1]] = BUDGET * 0.6;
      a[rank[1][1]] = BUDGET * 0.25;
      a[rank[2][1]] = BUDGET * 0.15;
      tRev += simulate(arms, a, tRand, tAcc);
    }
    return { greedy: gRev, thompson: tRev };
  }

  function runDay() {
    if (over) return;
    if (total() > BUDGET) { msg.innerHTML = `<span style="color:#ff4d4d">Over budget by ${total() - BUDGET}.</span>`; audio.bad(); return; }
    revenue += simulate(arms, alloc, rng, you);
    spent += total();
    day += 1;
    audio.tick();
    if (day >= DAYS) return finish();
    render();
    announce(`day ${day}, revenue ${revenue.toFixed(0)}`);
  }

  function finish() {
    over = true;
    const ref = referencePolicies();
    const oracle = (() => {
      const best = arms.reduce((a, b) => (b.ctr / b.cpc > a.ctr / a.cpc ? b : a));
      return DAYS * Math.floor(BUDGET / best.cpc) * best.ctr * REVENUE_PER_CONV;
    })();
    submit(Math.round(revenue));
    render();
    const beat = [];
    if (revenue > ref.greedy) beat.push('greedy');
    if (revenue > ref.thompson) beat.push('Thompson sampling');
    msg.innerHTML = `<b class="accent">${revenue.toFixed(0)}</b> revenue on ${spent} units of spend.
      Greedy scored ${ref.greedy.toFixed(0)}, Thompson sampling ${ref.thompson.toFixed(0)},
      and a perfect oracle that knew the rates up front would have made ${oracle.toFixed(0)}.
      ${beat.length ? `You beat <b class="accent">${beat.join(' and ')}</b>.` : 'Both reference policies beat you, which is the usual result the first time.'}
      <br><br>True conversion rates are now revealed in the last column. The keywords worth having
      were rarely the ones that looked best after three days.`;
    (beat.length ? audio.good : audio.bad)();
  }

  const onKey = (e) => {
    if (over) return;
    const step = e.shiftKey ? 10 : 5;
    if (e.key === 'ArrowUp') { e.preventDefault(); cursor = (cursor - 1 + arms.length) % arms.length; render(); }
    else if (e.key === 'ArrowDown') { e.preventDefault(); cursor = (cursor + 1) % arms.length; render(); }
    else if (e.key === 'ArrowRight') { e.preventDefault(); alloc[cursor] += step; audio.tick(); render(); }
    else if (e.key === 'ArrowLeft') { e.preventDefault(); alloc[cursor] = Math.max(0, alloc[cursor] - step); audio.tick(); render(); }
    else if (e.key === 'Enter') { e.preventDefault(); runDay(); }
  };
  host.addEventListener('keydown', onKey);
  tbody.addEventListener('click', (e) => {
    const tr = e.target.closest('tr');
    if (!tr || over) return;
    cursor = Number(tr.dataset.i);
    render();
  });
  wrap.querySelector('[data-run]').addEventListener('click', runDay);

  msg.innerHTML = 'Everything starts split evenly. That is a defensible first day and a terrible fourteenth.';
  render();
  return { destroy() { host.removeEventListener('keydown', onKey); wrap.remove(); } };
}
