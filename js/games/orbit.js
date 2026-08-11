// Orbital rendezvous. Two burns, real two-body mechanics, no cheating.
//
// This is the manoeuvre the rocket behind this page performs on the way out,
// and it is the one thing about spaceflight that is genuinely counterintuitive:
// to catch something ahead of you, you slow down. Burning prograde raises your
// orbit, which lengthens your period, which drops you further behind.
//
// The integrator is the same RK4 used in the flight physics, on a normalised
// mu = 1 system where the starting orbit has radius 1 and period 2*pi.
export function create({ host, audio, announce, submit, subscribe }) {
  const MU = 1;
  const R0 = 1;
  const RT = 1.62;         // target radius; a Hohmann from 1 to 1.62 needs +0.117 then +0.100
  const DV_BUDGET = 0.42;

  let ship, target, trail, dvUsed, burns, t, done, bestGap;

  const wrap = document.createElement('div');
  wrap.innerHTML = `
    <p class="mono" style="font-size:12.5px;color:var(--dim);margin:0 0 16px">
      You are on the inner orbit. The station is on the outer one. Two prograde burns at the right
      moments put you alongside it. <span class="accent">up</span> and <span class="accent">down</span>
      burn, <span class="accent">r</span> resets. Watch what a prograde burn does to your period.</p>
    <div class="row" style="gap:24px;flex-wrap:wrap;margin-bottom:14px">
      <span class="metric" data-r>1.000<small>your radius</small></span>
      <span class="metric" data-ap>1.000<small>apoapsis</small></span>
      <span class="metric" data-dv>0.000<small>delta-v spent</small></span>
      <span class="metric" data-gap>-<small>closest approach</small></span>
    </div>
    <canvas data-c style="width:100%;max-width:620px;aspect-ratio:1;display:block;
      background:var(--panel-2);border-radius:12px"></canvas>
    <p class="mono" data-msg style="font-size:12.5px;min-height:4.4em;margin:14px 0 0"></p>`;
  host.appendChild(wrap);

  const canvas = wrap.querySelector('[data-c]');
  const dpr = Math.min(devicePixelRatio || 1, 2);
  canvas.width = 620 * dpr; canvas.height = 620 * dpr;
  const ctx = canvas.getContext('2d');
  ctx.scale(dpr, dpr);
  const msg = wrap.querySelector('[data-msg]');
  const set = (sel, v) => { wrap.querySelector(sel).firstChild.textContent = v; };
  const SC = 168;
  const CX = 310, CY = 310;

  function reset() {
    ship = { x: R0, y: 0, vx: 0, vy: Math.sqrt(MU / R0) };
    // Station placed so the transfer window is roughly a quarter orbit away.
    target = { th: 2.3, r: RT, w: Math.sqrt(MU / (RT ** 3)) };
    trail = [];
    dvUsed = 0; burns = 0; t = 0; done = false; bestGap = 99;
    msg.textContent = 'A prograde burn here raises the far side of your orbit. Do it, coast half an orbit, then burn again at the top.';
    draw();
  }

  const accel = (s) => {
    const r2 = s.x * s.x + s.y * s.y;
    const r = Math.sqrt(r2);
    const k = -MU / (r2 * r);
    return { ax: k * s.x, ay: k * s.y };
  };

  function rk4(s, dt) {
    const f = (st) => { const a = accel(st); return { x: st.vx, y: st.vy, vx: a.ax, vy: a.ay }; };
    const add = (st, d, h) => ({ x: st.x + d.x * h, y: st.y + d.y * h, vx: st.vx + d.vx * h, vy: st.vy + d.vy * h });
    const k1 = f(s);
    const k2 = f(add(s, k1, dt / 2));
    const k3 = f(add(s, k2, dt / 2));
    const k4 = f(add(s, k3, dt));
    return {
      x: s.x + (dt / 6) * (k1.x + 2 * k2.x + 2 * k3.x + k4.x),
      y: s.y + (dt / 6) * (k1.y + 2 * k2.y + 2 * k3.y + k4.y),
      vx: s.vx + (dt / 6) * (k1.vx + 2 * k2.vx + 2 * k3.vx + k4.vx),
      vy: s.vy + (dt / 6) * (k1.vy + 2 * k2.vy + 2 * k3.vy + k4.vy),
    };
  }

  function elements() {
    const r = Math.hypot(ship.x, ship.y);
    const v2 = ship.vx * ship.vx + ship.vy * ship.vy;
    const energy = v2 / 2 - MU / r;
    const a = -MU / (2 * energy);
    const h = ship.x * ship.vy - ship.y * ship.vx;
    const e = Math.sqrt(Math.max(0, 1 + (2 * energy * h * h) / (MU * MU)));
    return { r, a, e, ap: a * (1 + e), pe: a * (1 - e), escaped: energy >= 0 };
  }

  function burn(sign) {
    if (done) return;
    const dv = 0.006 * sign;
    if (dvUsed + Math.abs(dv) > DV_BUDGET) {
      msg.innerHTML = '<b style="color:#ff4d4d">Out of propellant.</b> Press r.';
      return;
    }
    const v = Math.hypot(ship.vx, ship.vy);
    ship.vx += (ship.vx / v) * dv;
    ship.vy += (ship.vy / v) * dv;
    dvUsed += Math.abs(dv);
    burns += 1;
    audio.tick();
  }

  function tick(dtMs) {
    const dt = Math.min(0.05, dtMs / 1000) * 0.9;
    if (!done) {
      // Two substeps keeps the ellipse from drifting over a long coast.
      ship = rk4(ship, dt / 2);
      ship = rk4(ship, dt / 2);
      t += dt;
      target.th += target.w * dt;

      trail.push([ship.x, ship.y]);
      if (trail.length > 900) trail.shift();

      const tx = Math.cos(target.th) * target.r;
      const ty = Math.sin(target.th) * target.r;
      const gap = Math.hypot(ship.x - tx, ship.y - ty);
      const relV = Math.hypot(ship.vx + Math.sin(target.th) * target.w * target.r,
        ship.vy - Math.cos(target.th) * target.w * target.r);
      bestGap = Math.min(bestGap, gap);

      const el = elements();
      set('[data-r]', el.r.toFixed(3));
      set('[data-ap]', el.escaped ? 'escape' : el.ap.toFixed(3));
      set('[data-dv]', dvUsed.toFixed(3));
      set('[data-gap]', bestGap.toFixed(3));

      if (gap < 0.06 && relV < 0.09) {
        done = true;
        const score = Math.max(0, Math.round((DV_BUDGET - dvUsed) * 4000 - burns * 4));
        submit(score);
        audio.chime();
        announce('rendezvous');
        msg.innerHTML = `<b class="accent">Rendezvous.</b> ${dvUsed.toFixed(3)} of ${DV_BUDGET} delta-v,
          ${burns} burns, closing at ${relV.toFixed(3)}. The ideal two-burn Hohmann for this pair costs
          <b>0.217</b>; you spent ${dvUsed.toFixed(3)}. Everything above 0.217 was spent fighting a
          phasing error, which is why launch windows exist at all.`;
      } else if (el.escaped) {
        done = true;
        submit(0);
        audio.bad();
        msg.innerHTML = '<span style="color:#ff4d4d">Escape trajectory.</span> You put in more than the escape velocity at that radius. Press r.';
      } else if (el.pe < 0.28) {
        done = true;
        submit(0);
        audio.bad();
        msg.innerHTML = '<span style="color:#ff4d4d">Periapsis inside the atmosphere.</span> Retrograde burns lower the far side, not the near one. Press r.';
      }
    }
    draw();
  }

  function draw() {
    ctx.clearRect(0, 0, 620, 620);
    ctx.fillStyle = '#101420';
    ctx.fillRect(0, 0, 620, 620);

    // Planet.
    const g = ctx.createRadialGradient(CX, CY, 4, CX, CY, 34);
    g.addColorStop(0, '#3a6bd8');
    g.addColorStop(1, '#0f1e3c');
    ctx.fillStyle = g;
    ctx.beginPath(); ctx.arc(CX, CY, 30, 0, 6.284); ctx.fill();

    // Target orbit.
    ctx.strokeStyle = 'rgba(124,134,153,.35)';
    ctx.setLineDash([4, 6]);
    ctx.beginPath(); ctx.arc(CX, CY, RT * SC, 0, 6.284); ctx.stroke();
    ctx.setLineDash([]);

    // Trail.
    if (trail.length > 1) {
      ctx.strokeStyle = 'rgba(255,122,24,.55)';
      ctx.lineWidth = 1.4;
      ctx.beginPath();
      trail.forEach(([x, y], i) => {
        const px = CX + x * SC, py = CY - y * SC;
        if (i) ctx.lineTo(px, py); else ctx.moveTo(px, py);
      });
      ctx.stroke();
    }

    const tx = CX + Math.cos(target.th) * RT * SC;
    const ty = CY - Math.sin(target.th) * RT * SC;
    ctx.fillStyle = '#38d9a9';
    ctx.beginPath(); ctx.arc(tx, ty, 6, 0, 6.284); ctx.fill();
    ctx.font = '11px ui-monospace, Consolas, monospace';
    ctx.fillText('station', tx + 10, ty + 4);

    const sx = CX + ship.x * SC, sy = CY - ship.y * SC;
    ctx.fillStyle = '#eaf0ff';
    ctx.beginPath(); ctx.arc(sx, sy, 5, 0, 6.284); ctx.fill();
    // Velocity vector, so prograde is never ambiguous.
    const v = Math.hypot(ship.vx, ship.vy) || 1;
    ctx.strokeStyle = '#ff7a18';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(sx, sy);
    ctx.lineTo(sx + (ship.vx / v) * 26, sy - (ship.vy / v) * 26);
    ctx.stroke();

    ctx.fillStyle = '#3c4457';
    ctx.fillText(`t ${t.toFixed(1)}`, 12, 22);
    ctx.fillStyle = '#7c8699';
    ctx.fillText('orange arrow is prograde', 12, 604);
  }

  const onKey = (e) => {
    const k = e.key.toLowerCase();
    if (k === 'r') { e.preventDefault(); reset(); return; }
    if (k === 'arrowup' || k === 'w') { e.preventDefault(); burn(1); }
    if (k === 'arrowdown' || k === 's') { e.preventDefault(); burn(-1); }
  };
  host.addEventListener('keydown', onKey);

  reset();
  const unsub = subscribe(tick);
  return { destroy() { host.removeEventListener('keydown', onKey); unsub?.(); wrap.remove(); } };
}
