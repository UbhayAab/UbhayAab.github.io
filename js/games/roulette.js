// European roulette, single zero. Thirty-seven pockets, every bet paid as if
// there were thirty-six. That one missing pocket is the entire business, and
// it prices every bet on the table at exactly the same minus 2.70%.
//
// The panel on the right proves it: pick any combination of bets and the
// expected value per spin is computed from the actual payout table.
const RED = new Set([1, 3, 5, 7, 9, 12, 14, 16, 18, 19, 21, 23, 25, 27, 30, 32, 34, 36]);
const WHEEL = [0, 32, 15, 19, 4, 21, 2, 25, 17, 34, 6, 27, 13, 36, 11, 30, 8, 23, 10, 5, 24,
  16, 33, 1, 20, 14, 31, 9, 22, 18, 29, 7, 28, 12, 35, 3, 26];

export function create({ host, rng, audio, announce, submit }) {
  const BETS = [
    { id: 'red', label: 'red', pays: 1, hit: (n) => n !== 0 && RED.has(n) },
    { id: 'black', label: 'black', pays: 1, hit: (n) => n !== 0 && !RED.has(n) },
    { id: 'odd', label: 'odd', pays: 1, hit: (n) => n !== 0 && n % 2 === 1 },
    { id: 'even', label: 'even', pays: 1, hit: (n) => n !== 0 && n % 2 === 0 },
    { id: 'low', label: '1 to 18', pays: 1, hit: (n) => n >= 1 && n <= 18 },
    { id: 'high', label: '19 to 36', pays: 1, hit: (n) => n >= 19 },
    { id: 'd1', label: '1st dozen', pays: 2, hit: (n) => n >= 1 && n <= 12 },
    { id: 'd2', label: '2nd dozen', pays: 2, hit: (n) => n >= 13 && n <= 24 },
    { id: 'd3', label: '3rd dozen', pays: 2, hit: (n) => n >= 25 },
    { id: 'zero', label: 'straight 0', pays: 35, hit: (n) => n === 0 },
  ];

  let bank = 300;
  let spins = 0;
  let staked = 0;
  const chips = Object.fromEntries(BETS.map((b) => [b.id, 0]));
  const recent = [];

  const wrap = document.createElement('div');
  wrap.innerHTML = `
    <p class="mono" style="font-size:12.5px;color:var(--dim);margin:0 0 16px">
      Thirty-seven pockets. Even money pays 1:1 on an 18-in-37 chance, a dozen pays 2:1 on 12
      in 37, a straight number pays 35:1 on 1 in 37. Every line prices out the same.</p>
    <div class="row" style="gap:26px;flex-wrap:wrap;margin-bottom:16px">
      <span class="metric" data-bank>300<small>bankroll</small></span>
      <span class="metric" data-spins>0<small>spins</small></span>
      <span class="metric" data-ev>0.00<small>EV of this layout</small></span>
      <span class="metric" data-res>-<small>last</small></span>
    </div>
    <div data-grid style="display:grid;grid-template-columns:repeat(auto-fit,minmax(min(100%,150px),1fr));
      gap:10px;margin-bottom:16px"></div>
    <div class="row" style="gap:10px;flex-wrap:wrap">
      <button class="btn" data-spin>spin</button>
      <button class="btn" data-clear>clear bets</button>
      <button class="btn" data-x50>auto 50 spins</button>
      <button class="btn" data-cash>cash out</button>
    </div>
    <p class="mono" data-hist style="font-size:12px;color:var(--faint);margin:16px 0 0;min-height:1.4em"></p>
    <p class="mono" data-msg style="font-size:12.5px;min-height:4em;margin:8px 0 0"></p>`;
  host.appendChild(wrap);

  const grid = wrap.querySelector('[data-grid]');
  const msg = wrap.querySelector('[data-msg]');
  const set = (sel, v) => { wrap.querySelector(sel).firstChild.textContent = v; };

  BETS.forEach((b) => {
    const el = document.createElement('button');
    el.dataset.bet = b.id;
    el.style.cssText = `text-align:left;padding:12px 14px;border-radius:10px;border:1px solid var(--line);
      background:var(--panel-2);color:var(--text);font:400 13px var(--mono);cursor:pointer`;
    el.innerHTML = `<span>${b.label}</span>
      <span style="float:right;color:var(--dim)">${b.pays}:1</span>
      <span style="display:block;margin-top:6px;color:var(--accent)" data-chip>0</span>`;
    grid.appendChild(el);
  });

  function ev() {
    // Sum over every bet: stake * (pays * p(hit) - (1 - p(hit))).
    let e = 0;
    for (const b of BETS) {
      const n = chips[b.id];
      if (!n) continue;
      let wins = 0;
      for (let k = 0; k <= 36; k += 1) if (b.hit(k)) wins += 1;
      const p = wins / 37;
      e += n * (b.pays * p - (1 - p));
    }
    return e;
  }

  function paint() {
    set('[data-bank]', Math.round(bank));
    set('[data-spins]', spins);
    const e = ev();
    set('[data-ev]', e.toFixed(2));
    wrap.querySelector('[data-ev]').style.color = e < 0 ? '#ff6b6b' : 'var(--dim)';
    BETS.forEach((b) => {
      const el = grid.querySelector(`[data-bet="${b.id}"] [data-chip]`);
      el.textContent = chips[b.id];
      grid.querySelector(`[data-bet="${b.id}"]`).style.borderColor = chips[b.id] ? 'var(--accent)' : 'var(--line)';
    });
    wrap.querySelector('[data-hist]').textContent = recent.length
      ? `last: ${recent.slice(-14).map((n) => (n === 0 ? '0' : RED.has(n) ? `${n}r` : `${n}b`)).join('  ')}`
      : '';
  }

  function spin() {
    const total = Object.values(chips).reduce((a, b) => a + b, 0);
    if (!total) { msg.textContent = 'Put a chip down first.'; return; }
    if (total > bank) { msg.innerHTML = '<b style="color:#ff4d4d">More on the layout than in the bankroll.</b>'; return; }
    bank -= total;
    staked += total;
    spins += 1;
    const n = WHEEL[Math.floor(rng() * WHEEL.length)];
    recent.push(n);
    let back = 0;
    for (const b of BETS) if (chips[b.id] && b.hit(n)) back += chips[b.id] * (b.pays + 1);
    bank += back;
    set('[data-res]', n === 0 ? '0' : `${n} ${RED.has(n) ? 'red' : 'black'}`);
    wrap.querySelector('[data-res]').style.color = n === 0 ? '#38d9a9' : RED.has(n) ? '#ff5a5a' : 'var(--text)';
    if (back > total) audio.good(); else if (back) audio.tick(); else audio.bad();
    paint();
    if (spins % 10 === 0) announce(`bankroll ${Math.round(bank)}`);
    if (bank <= 0) {
      submit(0);
      msg.innerHTML = `<b style="color:#ff4d4d">Cleaned out in ${spins} spins.</b>
        Expected loss on ${staked} staked was ${(staked * 0.027).toFixed(0)}. Variance did the rest,
        and variance is the only reason anybody plays a game with a fixed negative edge.`;
    }
    return back - total;
  }

  wrap.addEventListener('click', (e) => {
    const b = e.target.closest('[data-bet]');
    if (b) {
      chips[b.dataset.bet] += e.shiftKey ? -5 : 5;
      if (chips[b.dataset.bet] < 0) chips[b.dataset.bet] = 0;
      audio.tick();
      paint();
      msg.innerHTML = `This layout stakes ${Object.values(chips).reduce((x, y) => x + y, 0)} and returns
        ${ev().toFixed(2)} per spin on average. Shift-click to take chips back.`;
      return;
    }
    if (e.target.closest('[data-spin]')) { spin(); return; }
    if (e.target.closest('[data-clear]')) { BETS.forEach((x) => { chips[x.id] = 0; }); paint(); return; }
    if (e.target.closest('[data-x50]')) {
      const total = Object.values(chips).reduce((x, y) => x + y, 0);
      if (!total) { msg.textContent = 'Put a chip down first.'; return; }
      const before = bank;
      let n = 0;
      const t = setInterval(() => {
        if (n >= 50 || bank <= 0) {
          clearInterval(t);
          const swing = bank - before;
          msg.innerHTML = `<b class="accent">${n} spins, ${swing >= 0 ? '+' : ''}${Math.round(swing)}.</b>
            Expected was ${(ev() * n).toFixed(1)}. Run it again and the number moves; run it ten thousand
            times and it stops moving, at minus 2.70% of everything staked.`;
          return;
        }
        n += 1;
        spin();
      }, 60);
      return;
    }
    if (e.target.closest('[data-cash]')) {
      submit(Math.round(bank));
      msg.innerHTML = `<b class="accent">Cashed out at ${Math.round(bank)}</b> after ${spins} spins on
        ${staked} staked. The house expected ${(staked * 0.027).toFixed(0)} of that.
        Anything else in the number is noise.`;
      audio.chime();
    }
  });

  paint();
  msg.textContent = 'Click a bet to add 5, shift-click to remove. The EV readout updates as you build the layout.';
  return { destroy() { wrap.remove(); } };
}
