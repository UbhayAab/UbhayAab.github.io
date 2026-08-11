// REACTOR: hold a fission reactor critical.
//
// The interesting part of reactor control is not the heat, it is xenon-135.
// It is a fission product with an enormous neutron cross-section, so it
// poisons the core; but it is also burned off by the very flux it suppresses.
// Drop power and xenon keeps building for hours from decaying iodine while
// there is no longer enough flux to consume it, so the core digs itself into a
// hole you cannot climb out of. That is what happened at Chernobyl, and it is
// what makes this a game rather than a slider.
//
// Reactivity in pcm, one-group point kinetics with a lumped delayed-neutron
// precursor. Not a licensing tool, but the shape is real.

const BETA = 0.0065;      // delayed neutron fraction, U-235
const LAMBDA = 0.0785;    // precursor decay constant, 1/s (lumped)
const GEN = 2e-5;         // prompt neutron generation time, s
const IODINE_L = 2.87e-5; // I-135 decay, 1/s (half-life 6.6 h)
const XENON_L = 2.09e-5;  // Xe-135 decay, 1/s (half-life 9.2 h)

export function create({ host, audio, announce, submit, subscribe }) {
  // Speed the clock up hard: xenon dynamics play out over hours.
  const CLOCK = 900;

  let rods = 0.5;          // 0 = fully withdrawn, 1 = fully inserted
  let power = 1.0;         // relative to nominal
  let precursor = 1.0;
  let iodine = 1.0;
  let xenon = 1.0;
  let temp = 300;          // C
  let t = 0;
  let score = 0;
  let over = false;
  let target = 1.0;
  let nextTargetAt = 25;

  const wrap = document.createElement('div');
  wrap.innerHTML = `
    <p class="mono" style="font-size:12.5px;color:var(--dim);margin:0 0 18px">
      Hold output on target with the control rods. Xenon-135 poisons the core after you
      throttle down and keeps building for hours, so a sharp cut costs you reactivity you
      will not get back quickly. Scram above 900 C.
      <span class="accent">Up and down for rods, enter to scram.</span>
    </p>
    <div class="grid" style="grid-template-columns:repeat(auto-fit,minmax(140px,1fr));gap:12px;margin-bottom:18px">
      <div class="card" style="padding:16px 18px"><span class="metric" data-pw>100<small>% output</small></span></div>
      <div class="card" style="padding:16px 18px"><span class="metric" data-tg>100<small>% target</small></span></div>
      <div class="card" style="padding:16px 18px"><span class="metric" data-tm>300<small>core degC</small></span></div>
      <div class="card" style="padding:16px 18px"><span class="metric" data-xe>0<small>pcm xenon</small></span></div>
      <div class="card" style="padding:16px 18px"><span class="metric" data-sc>0<small>score</small></span></div>
    </div>
    <div style="margin-bottom:8px">
      <div class="row"><span class="mono">rods inserted</span><span class="mono" data-rd>50%</span></div>
      <div class="bar" style="height:10px;margin-top:8px"><span data-rodbar></span></div>
    </div>
    <canvas data-chart style="width:100%;height:150px;display:block;background:var(--panel-2);
      border:1px solid var(--line);border-radius:10px;margin-top:16px"></canvas>
    <p class="mono" data-msg style="font-size:12.5px;min-height:3.2em;margin:14px 0 0"></p>`;
  host.appendChild(wrap);

  const canvas = wrap.querySelector('[data-chart]');
  const ctx = canvas.getContext('2d');
  const dpr = Math.min(devicePixelRatio || 1, 2);
  const resize = () => {
    canvas.width = canvas.clientWidth * dpr;
    canvas.height = 150 * dpr;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  };
  resize();
  const msg = wrap.querySelector('[data-msg]');
  const hist = [];

  const set = (sel, v) => { wrap.querySelector(sel).firstChild.textContent = v; };

  function step(dtReal) {
    if (over) return;
    const dt = Math.min(0.05, dtReal / 1000) * CLOCK;
    t += dt;

    // Rod worth, plus the xenon penalty, plus a negative temperature coefficient
    // which is the thing that makes a reactor self-stabilising.
    const rodWorth = (0.5 - rods) * 2400;                    // pcm
    const xePenalty = -xenon * 2600;                          // pcm
    const tempFb = -(temp - 300) * 2.2;                       // pcm
    const rho = (rodWorth + xePenalty + tempFb) / 1e5;        // absolute reactivity

    // Point kinetics.
    const dP = ((rho - BETA) / GEN) * power + LAMBDA * precursor;
    const dC = (BETA / GEN) * power - LAMBDA * precursor;
    power = Math.max(1e-6, power + dP * dt);
    precursor = Math.max(0, precursor + dC * dt);
    if (power > 12) power = 12;

    // Iodine feeds xenon; flux burns xenon.
    const dI = 0.0645 * power * IODINE_L / IODINE_L * IODINE_L - IODINE_L * iodine;
    const dX = IODINE_L * iodine - XENON_L * xenon - 3.5e-5 * power * xenon;
    iodine = Math.max(0, iodine + (dI + IODINE_L * (power - iodine) * 0.5) * dt);
    xenon = Math.max(0, xenon + dX * dt);

    temp += (power * 520 - (temp - 300) * 1.6) * dt * 0.0016;

    if (temp > 900) {
      over = true;
      msg.innerHTML = `<span style="color:#ff4d4d">SCRAM on high core temperature.</span>
        The negative temperature coefficient was not enough because you had already
        withdrawn the rods to fight the xenon. Final score <b class="accent">${Math.round(score)}</b>.`;
      audio.bad();
      submit(Math.round(score));
      return;
    }

    // Score accrues for being on target, which is the whole job.
    const err = Math.abs(power - target) / target;
    score += Math.max(0, 1 - err * 3) * dt * 0.09;

    if (t > nextTargetAt) {
      nextTargetAt = t + 240 + Math.random() * 200;
      target = 0.45 + Math.random() * 0.75;
      audio.tick();
      announce(`new target ${Math.round(target * 100)} percent`);
    }

    hist.push({ p: power, x: xenon, tgt: target });
    if (hist.length > 260) hist.shift();
    paint();
  }

  function paint() {
    set('[data-pw]', (power * 100).toFixed(0));
    set('[data-tg]', (target * 100).toFixed(0));
    set('[data-tm]', temp.toFixed(0));
    set('[data-xe]', (xenon * 2600).toFixed(0));
    set('[data-sc]', Math.round(score));
    wrap.querySelector('[data-rd]').textContent = `${(rods * 100).toFixed(0)}%`;
    wrap.querySelector('[data-rodbar]').parentElement.style.setProperty('--v', rods);
    wrap.querySelector('[data-tm]').style.color = temp > 780 ? '#ff4d4d' : '';

    const w = canvas.clientWidth, h = 150;
    ctx.clearRect(0, 0, w, h);
    const y = (v) => h - 10 - (v / 2.2) * (h - 20);
    ctx.strokeStyle = 'rgba(255,255,255,0.08)';
    ctx.beginPath(); ctx.moveTo(0, y(1)); ctx.lineTo(w, y(1)); ctx.stroke();
    const line = (key, colour) => {
      ctx.beginPath();
      hist.forEach((s, i) => {
        const x = (i / 260) * w;
        i ? ctx.lineTo(x, y(s[key])) : ctx.moveTo(x, y(s[key]));
      });
      ctx.strokeStyle = colour; ctx.lineWidth = 2; ctx.stroke();
    };
    line('tgt', 'rgba(255,255,255,0.28)');
    line('p', '#f59e0b');
    ctx.beginPath();
    hist.forEach((s, i) => {
      const x = (i / 260) * w;
      const yy = h - 10 - Math.min(1, s.x) * (h - 20) * 0.5;
      i ? ctx.lineTo(x, yy) : ctx.moveTo(x, yy);
    });
    ctx.strokeStyle = '#8b5cf6'; ctx.lineWidth = 1.5; ctx.stroke();
  }

  const onKey = (e) => {
    if (over && e.key === 'r') { location.reload(); return; }
    if (over) return;
    if (e.key === 'ArrowUp') { e.preventDefault(); rods = Math.max(0, rods - 0.02); audio.tick(); }
    else if (e.key === 'ArrowDown') { e.preventDefault(); rods = Math.min(1, rods + 0.02); audio.tick(); }
    else if (e.key === 'Enter') {
      e.preventDefault();
      rods = 1; over = true;
      msg.innerHTML = `Scrammed manually at ${Math.round(score)} points. Safe, and producing nothing.`;
      submit(Math.round(score));
    }
  };
  host.addEventListener('keydown', onKey);
  addEventListener('resize', resize);

  msg.innerHTML = 'Xenon is plotted in violet. Watch what it does after you throttle back.';
  paint();
  const unsub = subscribe(step);
  return { destroy() { host.removeEventListener('keydown', onKey); removeEventListener('resize', resize); unsub?.(); wrap.remove(); } };
}
