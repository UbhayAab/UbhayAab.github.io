// One-button flyer, dressed as a landing burn. The physics is a real thruster
// rather than a jump: every tap spends propellant, and when the tank is empty
// gravity is the only thing left with an opinion.
import { makeCanvas, COLORS as C } from '../arcade.js';

const W = 720;
const H = 460;
const G = 980;          // px/s^2
const KICK = 330;       // delta-v per burn
const GAP = 152;
const SPACING = 260;

export function create({ host, rng, audio, announce, submit, subscribe }) {
  const { canvas, ctx, w, h } = makeCanvas(host, W, H);
  const info = document.createElement('p');
  info.className = 'mono';
  info.style.cssText = 'font-size:12.5px;color:var(--dim);margin:14px 0 0';
  host.appendChild(info);

  let y, vy, gates, x, score, fuel, over, started, plume;

  function reset() {
    y = H / 2; vy = 0; x = 0; score = 0; fuel = 100; over = false; started = false; plume = 0;
    gates = [];
    for (let i = 0; i < 4; i += 1) gates.push(makeGate(W * 0.75 + i * SPACING));
    info.innerHTML = '<span class="accent">space</span> or click to burn, <span class="accent">r</span> to restart. Burns cost propellant.';
  }

  function makeGate(gx) {
    return { x: gx, y: 90 + rng() * (H - 180), passed: false };
  }

  function die(reason) {
    if (over) return;
    over = true;
    submit(score);
    audio.bad();
    info.innerHTML = `<span style="color:#ff4d4d">${reason} at ${score}.</span>
      <span class="accent">r</span> to restart.`;
  }

  function burn() {
    if (over) { reset(); return; }
    started = true;
    if (fuel <= 0) return;
    fuel = Math.max(0, fuel - 3.4);
    vy = -KICK;
    plume = 1;
    audio.tick();
  }

  function tick(dtMs) {
    const dt = Math.min(0.033, dtMs / 1000);
    plume = Math.max(0, plume - dt * 4);
    if (!over && started) {
      vy += G * dt;
      y += vy * dt;
      const speed = 190 + score * 3.4;
      x += speed * dt;
      for (const g of gates) g.x -= speed * dt;
      if (gates[0].x < -70) { gates.shift(); gates.push(makeGate(gates[gates.length - 1].x + SPACING)); }

      for (const g of gates) {
        if (!g.passed && g.x < 90) {
          g.passed = true;
          score += 1;
          fuel = Math.min(100, fuel + 6);   // a clean pass tops you back up a little
          audio.good();
          announce(`${score}`);
        }
        if (Math.abs(g.x - 90) < 34 && (y < g.y - GAP / 2 || y > g.y + GAP / 2)) die('Clipped a gate');
      }
      if (y > H - 12) die('Ground');
      if (y < 8) { y = 8; vy = 0; }
    }
    draw();
  }

  function draw() {
    ctx.clearRect(0, 0, w, h);
    ctx.fillStyle = C.panel2;
    ctx.fillRect(0, 0, w, h);

    // Parallax terrain, purely so speed reads.
    ctx.fillStyle = '#0e1220';
    for (let i = 0; i < 22; i += 1) {
      const bx = ((i * 90 - x * 0.35) % (W + 180)) - 90;
      ctx.fillRect(bx, H - 40 - (i % 5) * 9, 62, 60);
    }

    for (const g of gates) {
      ctx.fillStyle = '#1b2130';
      ctx.fillRect(g.x - 22, 0, 44, g.y - GAP / 2);
      ctx.fillRect(g.x - 22, g.y + GAP / 2, 44, H);
      ctx.fillStyle = C.accent;
      ctx.fillRect(g.x - 22, g.y - GAP / 2 - 4, 44, 4);
      ctx.fillRect(g.x - 22, g.y + GAP / 2, 44, 4);
    }

    ctx.save();
    ctx.translate(90, y);
    ctx.rotate(Math.max(-0.5, Math.min(0.9, vy / 620)));
    if (plume > 0) {
      const grd = ctx.createLinearGradient(0, 8, 0, 8 + 34 * plume);
      grd.addColorStop(0, `rgba(255,190,90,${0.9 * plume})`);
      grd.addColorStop(1, 'rgba(255,90,20,0)');
      ctx.fillStyle = grd;
      ctx.beginPath();
      ctx.moveTo(-6, 8); ctx.lineTo(6, 8); ctx.lineTo(0, 8 + 36 * plume);
      ctx.closePath(); ctx.fill();
    }
    ctx.fillStyle = '#eaf0ff';
    ctx.beginPath();
    ctx.moveTo(0, -15); ctx.lineTo(8, 9); ctx.lineTo(-8, 9);
    ctx.closePath(); ctx.fill();
    ctx.restore();

    ctx.font = '12px ui-monospace, Consolas, monospace';
    ctx.fillStyle = C.dim;
    ctx.fillText(`gates ${score}`, 12, 24);
    ctx.fillText('prop', 120, 24);
    ctx.fillStyle = '#1b2130';
    ctx.fillRect(158, 15, 120, 10);
    ctx.fillStyle = fuel > 25 ? C.good : '#ff6b6b';
    ctx.fillRect(158, 15, 120 * (fuel / 100), 10);
    if (!started && !over) {
      ctx.fillStyle = C.accent;
      ctx.fillText('space to start the burn', W / 2 - 74, H / 2 - 40);
    }
  }

  const down = (e) => {
    const k = e.key.toLowerCase();
    if (k === 'r') { e.preventDefault(); reset(); return; }
    if (k === ' ' || k === 'arrowup' || k === 'w') { e.preventDefault(); burn(); }
  };
  host.addEventListener('keydown', down);
  canvas.addEventListener('pointerdown', burn);

  reset();
  const unsub = subscribe(tick);
  return {
    destroy() { host.removeEventListener('keydown', down); unsub?.(); canvas.remove(); info.remove(); },
  };
}
