// Mounts the flight onto the page: owns the canvas, the director, and the
// telemetry readout, and exposes a tiny surface for boot.js to drive.
//
// It deliberately does not start its own requestAnimationFrame. The page has
// exactly one ticker and this subscribes to it, so the flight, the arcade and
// the scroll reveals all advance on the same clock.

import { createScene } from './scene.js';
import { createDirector, formatTelemetry, PHASES } from './director.js';
import { clamp, lerp } from './gfx.js';

export function mountFlight({ canvas, hud, subscribe, motion = () => 'full' }) {
  const tier = localStorage.getItem('tier') || 'high';
  const scene = createScene(canvas, { tier });
  if (!scene) return null;                 // caller keeps the CSS poster
  const director = createDirector();

  let targetP = 0;
  let smoothP = 0;
  let lastPhase = null;

  // Damped scroll. The raw value is fine for CSS but jumps on a trackpad
  // flick, and a rocket that teleports looks worse than one that lags.
  function tick(dt) {
    const m = motion();
    if (m === 'off') { smoothP = targetP; }
    else {
      const k = m === 'reduced' ? 0.35 : 0.12;
      smoothP += (targetP - smoothP) * Math.min(1, k * (dt / 16.67));
    }
  }

  function render(dt, now) {
    tick(dt);
    const f = director.state(smoothP);
    scene.render(f, Math.min(0.05, dt / 1000), now);
    if (hud) paintHud(f);
  }

  function paintHud(f) {
    const T = formatTelemetry(f.telemetry, f.phase);
    if (f.phase.id !== lastPhase) {
      lastPhase = f.phase.id;
      hud.dataset.phase = f.phase.id;
    }
    hud.innerHTML = `
      <div class="tl-row tl-head"><span>${T.phase}</span><span>${T.time}</span></div>
      <div class="tl-row"><span>ALT</span><b>${T.altitude}</b></div>
      <div class="tl-row"><span>VEL</span><b>${T.velocity}</b></div>
      <div class="tl-row"><span>MASS</span><b>${T.mass}</b></div>
      <div class="tl-row"><span>${T.stage}</span><b>${(T.orbitPct * 100).toFixed(0)}% orbital</b></div>
      <div class="tl-bar"><i style="width:${(T.orbitPct * 100).toFixed(1)}%"></i></div>`;
  }

  return {
    render,
    setScroll(p) { targetP = clamp(p, 0, 1); },
    resize: () => scene.resize(),
    setTier: (t) => scene.setTier(t),
    stats: () => ({ ...scene.stats(), phase: lastPhase, p: smoothP }),
    phases: PHASES,
    trajectory: director.traj,
  };
}

export { PHASES };
