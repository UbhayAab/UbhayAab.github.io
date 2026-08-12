// Mounts the flight onto the page: owns the canvas, the director, and the
// telemetry readout, and exposes a tiny surface for boot.js to drive.
//
// It deliberately does not start its own requestAnimationFrame. The page has
// exactly one ticker and this subscribes to it, so the flight, the arcade and
// the scroll reveals all advance on the same clock.

import { createScene } from './scene.js';
import { createDirector, formatTelemetry, PHASES } from './director.js';
import { clamp, lerp } from './gfx.js';

export function mountFlight({ canvas, hud, subscribe, motion = () => 'full', theme = () => 'dark' }) {
  const tier = localStorage.getItem('tier') || 'high';
  const scene = createScene(canvas, { tier });
  if (!scene) return null;                 // caller keeps the CSS poster
  const director = createDirector();

  let targetP = 0;
  let smoothP = 0;
  let targetLat = 0;
  let smoothLat = 0;
  let day = theme() === 'light' ? 1 : 0;
  let lastPhase = null;

  // Damped scroll. The raw value is fine for CSS but jumps on a trackpad
  // flick, and a rocket that teleports looks worse than one that lags.
  //
  // The smoothing is frame-rate corrected rather than a fixed per-frame
  // fraction: `1 - (1-k)^(dt/16.67)` converges at the same wall-clock rate on
  // a 60 Hz panel and a 165 Hz one. The old `k * dt/16.67` form overshot
  // whenever a frame ran long, and an overshoot on a scrubbed camera is
  // exactly the small stutter you feel but cannot point at.
  function tick(dt) {
    const m = motion();
    if (m === 'off') { smoothP = targetP; smoothLat = targetLat; }
    else {
      const steps = Math.min(4, Math.max(0.1, dt / 16.67));
      const k = 1 - Math.pow(1 - (m === 'reduced' ? 0.35 : 0.14), steps);
      const kl = 1 - Math.pow(1 - 0.10, steps);
      smoothP += (targetP - smoothP) * k;
      smoothLat += (targetLat - smoothLat) * kl;
      // The theme crossfades rather than cutting, so toggling it mid-scroll
      // does not flash a black frame into a light page.
      const wantDay = theme() === 'light' ? 1 : 0;
      day += (wantDay - day) * (1 - Math.pow(1 - 0.16, steps));
      if (Math.abs(wantDay - day) < 0.004) day = wantDay;
    }
  }

  function render(dt, now) {
    tick(dt);
    const f = director.state(smoothP, smoothLat, day);
    scene.render(f, Math.min(0.05, dt / 1000), now);
    if (hud) paintHud(f);
  }

  /* ------------------------------------------------------------------ HUD */
  // Built once. The first version wrote the whole strip with innerHTML every
  // frame, which is an HTML parse plus six element constructions plus a style
  // recalculation at 60 Hz, for a readout where four numbers change and the
  // structure never does. Writing only changed text nodes takes it to zero
  // work on most frames.
  let cells = null;
  function buildHud() {
    hud.innerHTML = `
      <div class="tl-row tl-head"><span data-f="phase"></span><span data-f="time"></span></div>
      <div class="tl-row"><span>ALT</span><b data-f="alt"></b></div>
      <div class="tl-row"><span>VEL</span><b data-f="vel"></b></div>
      <div class="tl-row"><span>MASS</span><b data-f="mass"></b></div>
      <div class="tl-row"><span data-f="stage"></span><b data-f="orbit"></b></div>
      <div class="tl-bar"><i data-f="bar"></i></div>`;
    cells = {};
    for (const n of hud.querySelectorAll('[data-f]')) cells[n.dataset.f] = { node: n, last: null };
  }

  function put(key, value) {
    const c = cells[key];
    if (!c || c.last === value) return;
    c.last = value;
    c.node.textContent = value;
  }

  function paintHud(f) {
    if (!cells) buildHud();
    const T = formatTelemetry(f.telemetry, f.phase);
    if (f.phase.id !== lastPhase) {
      lastPhase = f.phase.id;
      hud.dataset.phase = f.phase.id;
    }
    put('phase', T.phase);
    put('time', T.time);
    put('alt', T.altitude);
    put('vel', T.velocity);
    put('mass', T.mass);
    put('stage', T.stage);
    const pct = (T.orbitPct * 100).toFixed(0);
    put('orbit', `${pct}% orbital`);
    const bar = cells.bar;
    const w = `${(T.orbitPct * 100).toFixed(1)}%`;
    if (bar.last !== w) { bar.last = w; bar.node.style.width = w; }
  }

  return {
    render,
    setScroll(p) { targetP = clamp(p, 0, 1); },
    setLateral(v) { targetLat = clamp(v, -1, 1); },
    // How much of the canvas is behind opaque content right now. The renderer
    // spends its pixel budget accordingly.
    setCoverage(v) { scene.setCoverage(v); },
    resize: () => scene.resize(),
    setTier: (t) => scene.setTier(t),
    stats: () => ({ ...scene.stats(), phase: lastPhase, p: smoothP }),
    phases: PHASES,
    trajectory: director.traj,
  };
}

export { PHASES };
