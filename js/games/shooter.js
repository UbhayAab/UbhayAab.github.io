// Space shooter. Waves of debris on Kessler-ish rules: every rock you break
// becomes two smaller, faster rocks, so clearing a wave gets harder the more
// of it you have already cleared. That is the actual argument against letting
// low orbit fill up, compressed into ninety seconds.
import { makeCanvas, COLORS as C } from '../arcade.js';

const W = 720;
const H = 460;

export function create({ host, rng, audio, announce, submit, subscribe }) {
  const { canvas, ctx, w, h } = makeCanvas(host, W, H);
  const info = document.createElement('p');
  info.className = 'mono';
  info.style.cssText = 'font-size:12.5px;color:var(--dim);margin:14px 0 0';
  host.appendChild(info);

  const keys = new Set();
  let ship, shots, rocks, sparks, score, lives, wave, cool, over, shake;

  function spawnWave(n) {
    for (let i = 0; i < n; i += 1) {
      const edge = rng();
      rocks.push({
        x: edge < 0.5 ? -30 : W + 30,
        y: rng() * H,
        vx: (edge < 0.5 ? 1 : -1) * (24 + rng() * 34),
        vy: (rng() - 0.5) * 48,
        r: 30,
        gen: 0,
        spin: (rng() - 0.5) * 2,
        a: rng() * 6.28,
      });
    }
  }

  function reset() {
    ship = { x: W / 2, y: H - 54, vx: 0, a: -Math.PI / 2 };
    shots = []; rocks = []; sparks = [];
    score = 0; lives = 3; wave = 1; cool = 0; over = false; shake = 0;
    spawnWave(3);
    info.innerHTML = 'Left and right to steer, <span class="accent">space</span> to fire, <span class="accent">r</span> to restart.';
  }

  function burst(x, y, n, tint) {
    for (let i = 0; i < n; i += 1) {
      const a = rng() * 6.28;
      const s = 40 + rng() * 190;
      sparks.push({ x, y, vx: Math.cos(a) * s, vy: Math.sin(a) * s, life: 0.5 + rng() * 0.4, t: 0, tint });
    }
  }

  function hitShip() {
    lives -= 1;
    shake = 1;
    burst(ship.x, ship.y, 26, '#ff5a5a');
    audio.bad();
    ship.x = W / 2; ship.vx = 0;
    if (lives <= 0) {
      over = true;
      submit(score);
      info.innerHTML = `<span style="color:#ff4d4d">Overwhelmed on wave ${wave} at ${score}.</span>
        Every break doubled the target count. <span class="accent">r</span> to restart.`;
    }
  }

  function tick(dtMs) {
    const dt = Math.min(0.05, dtMs / 1000);
    if (shake > 0) shake = Math.max(0, shake - dt * 3);
    if (!over) {
      // Ship. Momentum, not teleporting, so aiming costs something.
      const push = (keys.has('arrowright') || keys.has('d') ? 1 : 0) - (keys.has('arrowleft') || keys.has('a') ? 1 : 0);
      ship.vx += push * 900 * dt;
      ship.vx *= Math.pow(0.0012, dt);
      ship.x = Math.max(18, Math.min(W - 18, ship.x + ship.vx * dt));
      ship.a = -Math.PI / 2 + ship.vx * 0.0012;

      cool -= dt;
      if ((keys.has(' ') || keys.has('arrowup') || keys.has('w')) && cool <= 0) {
        cool = 0.16;
        shots.push({ x: ship.x, y: ship.y - 16, vy: -520 });
        audio.tick();
      }

      for (const s of shots) s.y += s.vy * dt;
      shots = shots.filter((s) => s.y > -10);

      for (const r of rocks) {
        r.x += r.vx * dt; r.y += r.vy * dt; r.a += r.spin * dt;
        if (r.x < -60) r.x = W + 50; if (r.x > W + 60) r.x = -50;
        if (r.y < -60) r.y = H + 50; if (r.y > H + 60) r.y = -50;
      }

      // Shot versus rock. A break makes two children, which is the whole point.
      for (let i = rocks.length - 1; i >= 0; i -= 1) {
        const r = rocks[i];
        let killed = false;
        for (let j = shots.length - 1; j >= 0; j -= 1) {
          const s = shots[j];
          if ((s.x - r.x) ** 2 + (s.y - r.y) ** 2 < r.r * r.r) {
            shots.splice(j, 1);
            killed = true;
            break;
          }
        }
        if (!killed) {
          const d2 = (ship.x - r.x) ** 2 + (ship.y - r.y) ** 2;
          if (d2 < (r.r + 12) ** 2) { rocks.splice(i, 1); hitShip(); }
          continue;
        }
        rocks.splice(i, 1);
        score += 10 * (r.gen + 1);
        burst(r.x, r.y, 12, C.accent);
        audio.good();
        if (r.gen < 2) {
          for (let k = 0; k < 2; k += 1) {
            const a = rng() * 6.28;
            const sp = 60 + r.gen * 55 + rng() * 60;
            rocks.push({
              x: r.x, y: r.y, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp,
              r: r.r * 0.58, gen: r.gen + 1, spin: (rng() - 0.5) * 3.4, a: rng() * 6.28,
            });
          }
        }
        if (!rocks.length) {
          wave += 1;
          announce(`wave ${wave}`);
          audio.chime();
          spawnWave(2 + wave);
        }
      }
    }

    for (const p of sparks) { p.t += dt; p.x += p.vx * dt; p.y += p.vy * dt; p.vy += 120 * dt; }
    sparks = sparks.filter((p) => p.t < p.life);
    draw();
  }

  function draw() {
    ctx.save();
    if (shake > 0) ctx.translate((rng() - 0.5) * 9 * shake, (rng() - 0.5) * 9 * shake);
    ctx.fillStyle = C.panel2;
    ctx.fillRect(-12, -12, w + 24, h + 24);

    for (const p of sparks) {
      const k = 1 - p.t / p.life;
      ctx.fillStyle = p.tint === C.accent ? `rgba(255,122,24,${k})` : `rgba(255,90,90,${k})`;
      ctx.fillRect(p.x - 1.5, p.y - 1.5, 3, 3);
    }

    ctx.strokeStyle = '#8e9ab4';
    ctx.lineWidth = 1.4;
    for (const r of rocks) {
      ctx.save();
      ctx.translate(r.x, r.y);
      ctx.rotate(r.a);
      ctx.beginPath();
      for (let i = 0; i < 9; i += 1) {
        const a = (i / 9) * 6.283;
        const rad = r.r * (0.74 + 0.26 * Math.abs(Math.sin(i * 2.3 + r.gen)));
        const x = Math.cos(a) * rad, y = Math.sin(a) * rad;
        if (i) ctx.lineTo(x, y); else ctx.moveTo(x, y);
      }
      ctx.closePath();
      ctx.stroke();
      ctx.restore();
    }

    ctx.fillStyle = '#eaf0ff';
    for (const s of shots) ctx.fillRect(s.x - 1.5, s.y - 9, 3, 11);

    if (!over) {
      ctx.save();
      ctx.translate(ship.x, ship.y);
      ctx.rotate(ship.a + Math.PI / 2);
      ctx.beginPath();
      ctx.moveTo(0, -16); ctx.lineTo(11, 13); ctx.lineTo(0, 8); ctx.lineTo(-11, 13);
      ctx.closePath();
      ctx.fillStyle = '#eaf0ff';
      ctx.fill();
      ctx.restore();
    }

    ctx.restore();
    ctx.font = '12px ui-monospace, Consolas, monospace';
    ctx.fillStyle = C.dim;
    ctx.fillText(`score ${score}`, 10, 18);
    ctx.fillText(`wave ${wave}`, 110, 18);
    ctx.fillText(`rocks ${rocks.length}`, 190, 18);
    ctx.fillStyle = lives > 1 ? C.dim : '#ff6b6b';
    ctx.fillText('|'.repeat(Math.max(0, lives)), w - 34, 18);
  }

  const down = (e) => {
    const k = e.key.toLowerCase();
    if (k === 'r') { e.preventDefault(); reset(); return; }
    if ([' ', 'arrowleft', 'arrowright', 'arrowup', 'a', 'd', 'w'].includes(k)) {
      e.preventDefault();
      keys.add(k);
    }
  };
  const up = (e) => keys.delete(e.key.toLowerCase());
  host.addEventListener('keydown', down);
  host.addEventListener('keyup', up);

  reset();
  const unsub = subscribe(tick);
  return {
    destroy() {
      host.removeEventListener('keydown', down);
      host.removeEventListener('keyup', up);
      unsub?.(); canvas.remove(); info.remove();
    },
  };
}
