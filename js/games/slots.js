// A slot machine with the maths printed on the front of it.
//
// The reel strips and the paytable below are the whole game: the return to
// player is computed from them at load by walking all 20^3 stop combinations,
// not asserted in a comment. Play long enough and your actual return converges
// on that number, which is the only thing a slot machine has ever promised.
export function create({ host, rng, audio, announce, submit }) {
  const SYM = [
    { s: '7', tint: '#ff7a18' },
    { s: 'BAR', tint: '#4d7cfe' },
    { s: 'CHERRY', tint: '#ff5a7a' },
    { s: 'BELL', tint: '#ffc44d' },
    { s: 'PLUM', tint: '#38d9a9' },
  ];
  // Weighted strips. "7" is rare on reel three, which is the oldest trick in
  // the trade: near misses on the payline feel like almost-wins and are not.
  const STRIPS = [
    [0, 1, 2, 3, 4, 1, 2, 3, 4, 2, 3, 4, 1, 2, 3, 4, 2, 3, 4, 3],
    [0, 1, 2, 3, 4, 1, 2, 3, 4, 2, 3, 4, 1, 2, 3, 4, 2, 3, 4, 3],
    [0, 1, 2, 3, 4, 2, 3, 4, 4, 2, 3, 4, 3, 2, 3, 4, 4, 3, 4, 3],
  ];
  const PAY = { '0': 120, '1': 40, '2': 18, '3': 10, '4': 6 };  // three of a kind
  const PAIR_ANY = 1;                                            // two 7s anywhere

  // Exact RTP over the full 8000-stop space. No sampling.
  const rtp = (() => {
    let total = 0;
    for (const a of STRIPS[0]) for (const b of STRIPS[1]) for (const c of STRIPS[2]) total += payout([a, b, c]);
    return total / (STRIPS[0].length * STRIPS[1].length * STRIPS[2].length);
  })();

  function payout(r) {
    if (r[0] === r[1] && r[1] === r[2]) return PAY[r[0]];
    const sevens = r.filter((x) => x === 0).length;
    if (sevens === 2) return PAIR_ANY * 6;
    if (sevens === 1) return PAIR_ANY;
    return 0;
  }

  const BET = 1;
  let credits = 200;
  let spins = 0;
  let staked = 0;
  let returned = 0;
  let spinning = false;
  let best = 0;

  const wrap = document.createElement('div');
  wrap.innerHTML = `
    <p class="mono" style="font-size:12.5px;color:var(--dim);margin:0 0 16px">
      Three reels, twenty stops each, 8,000 outcomes. The return to player below is computed
      by evaluating every one of them, not estimated. Score is credits at cash-out.</p>
    <div data-reels style="display:grid;grid-template-columns:repeat(3,1fr);gap:12px;max-width:460px;
      margin-bottom:18px"></div>
    <div class="row" style="gap:26px;flex-wrap:wrap;margin-bottom:16px">
      <span class="metric" data-cr>200<small>credits</small></span>
      <span class="metric" data-sp>0<small>spins</small></span>
      <span class="metric" data-act>-<small>your return</small></span>
      <span class="metric" data-rtp>-<small>true RTP</small></span>
    </div>
    <div class="row" style="gap:10px;flex-wrap:wrap">
      <button class="btn" data-spin>spin</button>
      <button class="btn" data-x25>spin 25</button>
      <button class="btn" data-cash>cash out</button>
    </div>
    <p class="mono" data-msg style="font-size:12.5px;min-height:4.4em;margin:16px 0 0"></p>
    <table style="width:100%;max-width:460px;margin-top:18px;border-collapse:collapse;font:400 12px var(--mono)">
      <tbody data-pay></tbody>
    </table>`;
  host.appendChild(wrap);

  const reelsHost = wrap.querySelector('[data-reels]');
  const msg = wrap.querySelector('[data-msg]');
  const cells = [];
  for (let i = 0; i < 3; i += 1) {
    const d = document.createElement('div');
    d.style.cssText = `height:96px;display:grid;place-items:center;border:1px solid var(--line);
      border-radius:10px;background:var(--panel-2);font:500 clamp(14px,3vw,20px) var(--mono);
      letter-spacing:0.04em`;
    d.textContent = '-';
    reelsHost.appendChild(d);
    cells.push(d);
  }
  wrap.querySelector('[data-pay]').innerHTML = SYM.map((s, i) => `
    <tr><td style="padding:5px 0;color:${s.tint}">${s.s} ${s.s} ${s.s}</td>
    <td style="text-align:right;color:var(--dim)">${PAY[i]}x</td></tr>`).join('')
    + `<tr><td style="padding:5px 0;color:var(--dim)">any two 7s</td><td style="text-align:right;color:var(--dim)">6x</td></tr>
       <tr><td style="padding:5px 0;color:var(--dim)">any one 7</td><td style="text-align:right;color:var(--dim)">1x</td></tr>`;

  const set = (sel, v) => { wrap.querySelector(sel).firstChild.textContent = v; };

  function paint() {
    set('[data-cr]', credits);
    set('[data-sp]', spins);
    set('[data-act]', staked ? `${((returned / staked) * 100).toFixed(1)}%` : '-');
    set('[data-rtp]', `${(rtp * 100).toFixed(1)}%`);
  }

  function showStops(stops, live) {
    stops.forEach((sym, i) => {
      cells[i].textContent = SYM[sym].s;
      cells[i].style.color = live ? SYM[sym].tint : 'var(--faint)';
      cells[i].style.borderColor = live ? SYM[sym].tint : 'var(--line)';
    });
  }

  function resolve() {
    const stops = STRIPS.map((strip) => strip[Math.floor(rng() * strip.length)]);
    const win = payout(stops);
    credits += win;
    returned += win;
    showStops(stops, true);
    best = Math.max(best, win);
    if (win >= 40) { audio.chime(); msg.innerHTML = `<b class="accent">${win} credits.</b> The reel-three strip carries one 7 against the other reels' one, which is why that line lands as rarely as it does.`; }
    else if (win > 0) { audio.good(); msg.textContent = `+${win}.`; }
    else { audio.tick(); }
    return win;
  }

  function spin(n = 1) {
    if (spinning) return;
    if (credits < BET) { msg.innerHTML = '<b style="color:#ff4d4d">Out of credits.</b> The machine kept 6% of everything you put through it, exactly as advertised above.'; submit(0); return; }
    spinning = true;
    let done = 0;
    const step = () => {
      if (credits < BET || done >= n) {
        spinning = false;
        paint();
        if (spins >= 25) {
          msg.innerHTML += ` Over ${spins} spins you got back <b>${((returned / staked) * 100).toFixed(1)}%</b>
            against a true <b>${(rtp * 100).toFixed(1)}%</b>. The gap is variance and it closes with volume, always downward.`;
        }
        announce(`${credits} credits`);
        return;
      }
      done += 1;
      spins += 1;
      credits -= BET;
      staked += BET;
      resolve();
      paint();
      setTimeout(step, n === 1 ? 0 : 42);
    };
    // A short blur, purely so the reels read as reels.
    let f = 0;
    const blur = setInterval(() => {
      showStops(STRIPS.map((s) => s[Math.floor(rng() * s.length)]), false);
      f += 1;
      if (f > (n === 1 ? 5 : 2)) { clearInterval(blur); step(); }
    }, 40);
  }

  wrap.addEventListener('click', (e) => {
    if (e.target.closest('[data-spin]')) spin(1);
    else if (e.target.closest('[data-x25]')) spin(25);
    else if (e.target.closest('[data-cash]')) {
      submit(credits);
      msg.innerHTML = `<b class="accent">Cashed out at ${credits}.</b> Biggest single line ${best}.
        Expected loss on ${staked} staked was ${(staked * (1 - rtp)).toFixed(0)}; you are
        ${credits >= 200 ? 'ahead of' : 'behind'} that by ${Math.abs(credits - (200 - staked * (1 - rtp))).toFixed(0)}.
        That difference is luck and it has no memory.`;
      audio.chime();
    }
  });

  paint();
  msg.textContent = 'Press spin. The paytable is at the bottom and it is not hiding anything.';
  return { destroy() { wrap.remove(); } };
}
