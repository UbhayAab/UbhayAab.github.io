// The martingale. Double after every loss and you win one unit, reliably,
// until the one time you cannot cover the next double. The system is real; the
// edge it claims to beat is not. This runs the coin honestly and keeps the
// tally so the shape of the ruin is visible rather than argued about.
export function create({ host, rng, audio, announce, submit }) {
  const START = 500;
  const BASE = 5;
  const P_WIN = 0.49;   // a fair-looking coin with a 2% house tax on it

  let bank = START;
  let bet = BASE;
  let peak = START;
  let flips = 0;
  let streak = 0;
  let worst = 0;
  let auto = null;
  const history = [];

  const wrap = document.createElement('div');
  wrap.innerHTML = `
    <p class="mono" style="font-size:12.5px;color:var(--dim);margin:0 0 16px">
      500 to start, 5 a flip, and the coin lands your way 49% of the time. Double after a loss
      and you recover the whole run plus one unit. Score is the bankroll you walk away with.</p>
    <div class="row" style="gap:26px;flex-wrap:wrap;margin-bottom:18px">
      <span class="metric" data-bank>500<small>bankroll</small></span>
      <span class="metric" data-bet>5<small>next bet</small></span>
      <span class="metric" data-flips>0<small>flips</small></span>
      <span class="metric" data-worst>0<small>worst streak</small></span>
    </div>
    <canvas data-chart style="width:100%;max-width:640px;aspect-ratio:16/6;display:block;
      background:var(--panel-2);border-radius:10px"></canvas>
    <div class="row" style="gap:10px;margin-top:16px;flex-wrap:wrap">
      <button class="btn" data-flip>flip</button>
      <button class="btn" data-double>double up</button>
      <button class="btn" data-reset-bet>back to 5</button>
      <button class="btn" data-auto>run 100 on martingale</button>
      <button class="btn" data-cash>cash out</button>
    </div>
    <p class="mono" data-msg style="font-size:12.5px;min-height:4em;margin:16px 0 0"></p>`;
  host.appendChild(wrap);

  const msg = wrap.querySelector('[data-msg]');
  const canvas = wrap.querySelector('[data-chart]');
  const dpr = Math.min(devicePixelRatio || 1, 2);
  canvas.width = 640 * dpr; canvas.height = 240 * dpr;
  const ctx = canvas.getContext('2d');
  ctx.scale(dpr, dpr);

  const set = (sel, v) => { wrap.querySelector(sel).firstChild.textContent = v; };

  function paint() {
    set('[data-bank]', Math.round(bank));
    set('[data-bet]', Math.min(bet, Math.max(0, Math.floor(bank))));
    set('[data-flips]', flips);
    set('[data-worst]', worst);

    ctx.clearRect(0, 0, 640, 240);
    ctx.fillStyle = '#101420';
    ctx.fillRect(0, 0, 640, 240);
    const hi = Math.max(peak, START) * 1.1;
    ctx.strokeStyle = '#1b2130';
    ctx.beginPath();
    const y0 = 232 - (START / hi) * 224;
    ctx.moveTo(0, y0); ctx.lineTo(640, y0); ctx.stroke();
    ctx.fillStyle = '#3c4457';
    ctx.font = '11px ui-monospace, Consolas, monospace';
    ctx.fillText('start', 6, y0 - 6);

    if (history.length > 1) {
      ctx.strokeStyle = bank >= START ? '#38d9a9' : '#ff7a18';
      ctx.lineWidth = 1.8;
      ctx.beginPath();
      history.forEach((v, i) => {
        const px = (i / (history.length - 1)) * 636 + 2;
        const py = 232 - (Math.max(0, v) / hi) * 224;
        if (i) ctx.lineTo(px, py); else ctx.moveTo(px, py);
      });
      ctx.stroke();
    }
  }

  function bust() {
    stopAuto();
    submit(0);
    msg.innerHTML = `<b style="color:#ff4d4d">Busted after ${flips} flips.</b>
      The martingale did exactly what it promises: it won a unit almost every time, and then
      once it met a run of ${worst} it needed ${(BASE * 2 ** worst).toLocaleString()} to
      continue and the table did not have it. Doubling converts a small frequent win into a
      rare total loss; it never touches the expected value, which was
      &minus;2% of everything staked from the first flip.`;
    audio.bad();
  }

  function flip(betNow) {
    const stake = Math.min(betNow, bank);
    if (stake <= 0 || bank <= 0) { bust(); return; }
    flips += 1;
    const won = rng() < P_WIN;
    bank += won ? stake : -stake;
    peak = Math.max(peak, bank);
    history.push(bank);
    if (history.length > 620) history.shift();

    if (won) {
      streak = 0;
      bet = BASE;
      audio.good();
    } else {
      streak += 1;
      worst = Math.max(worst, streak);
      bet = stake * 2;
      audio.tick();
    }
    if (bank <= 0) { bank = 0; paint(); bust(); return; }
    paint();
    if (flips % 10 === 0) announce(`bankroll ${Math.round(bank)}`);
  }

  function stopAuto() {
    if (auto) { clearInterval(auto); auto = null; wrap.querySelector('[data-auto]').textContent = 'run 100 on martingale'; }
  }

  wrap.addEventListener('click', (e) => {
    const t = e.target;
    if (t.closest('[data-flip]')) { flip(BASE); return; }
    if (t.closest('[data-double]')) { flip(bet); return; }
    if (t.closest('[data-reset-bet]')) { bet = BASE; paint(); return; }
    if (t.closest('[data-cash]')) {
      stopAuto();
      submit(Math.round(bank));
      const staked = history.length ? 'a lot' : '0';
      msg.innerHTML = `<b class="accent">Cashed out at ${Math.round(bank)}</b> after ${flips} flips,
        ${bank >= START ? 'up' : 'down'} ${Math.abs(Math.round(bank - START))}. Walking away early
        is the only strategy on this table with a positive expectation, and it works by
        reducing the number of flips rather than by improving any of them.
        ${staked === '0' ? '' : ''}`;
      audio.chime();
      return;
    }
    if (t.closest('[data-auto]')) {
      if (auto) { stopAuto(); return; }
      wrap.querySelector('[data-auto]').textContent = 'stop';
      let n = 0;
      auto = setInterval(() => {
        if (bank <= 0 || n >= 100) { stopAuto(); return; }
        n += 1;
        flip(bet);
      }, 55);
    }
  });

  paint();
  msg.innerHTML = 'Flat 5 a flip loses slowly. The martingale loses rarely and then all at once. Both have the same expected value.';
  return { destroy() { stopAuto(); wrap.remove(); } };
}
