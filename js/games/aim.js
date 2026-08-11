// Aim trainer that reports Fitts's law instead of just a number.
//
// Fitts, 1954: movement time is a + b*log2(2D/W). Every shot here records the
// distance travelled and the target width, so at the end the page fits your
// own a and b by least squares and tells you how predictable you are. Most
// people come out with an r-squared above 0.8, which is the surprising part.
import { makeCanvas, COLORS as C } from '../arcade.js';

const W = 720;
const H = 440;
const SHOTS = 22;

export function create({ host, rng, audio, announce, submit, subscribe }) {
  const { canvas, ctx, w, h } = makeCanvas(host, W, H);
  const info = document.createElement('p');
  info.className = 'mono';
  info.style.cssText = 'font-size:12.5px;color:var(--dim);margin:14px 0 0;min-height:4.4em';
  host.appendChild(info);

  let target = null;
  let last = { x: W / 2, y: H / 2 };
  let shots = [];
  let misses = 0;
  let tStart = 0;
  let running = false;
  let cursor = { x: W / 2, y: H / 2 };

  function spawn() {
    const r = 12 + rng() * 34;
    target = {
      x: r + 8 + rng() * (W - 2 * r - 16),
      y: r + 8 + rng() * (H - 2 * r - 16),
      r,
      born: performance.now(),
    };
  }

  function start() {
    shots = []; misses = 0; running = true;
    tStart = performance.now();
    last = { x: W / 2, y: H / 2 };
    info.innerHTML = `Click the circles. ${SHOTS} of them.`;
    spawn();
  }

  function fit() {
    // Least squares on MT = a + b*ID, where ID = log2(2D/W).
    const n = shots.length;
    const sx = shots.reduce((s, p) => s + p.id, 0);
    const sy = shots.reduce((s, p) => s + p.mt, 0);
    const sxx = shots.reduce((s, p) => s + p.id * p.id, 0);
    const sxy = shots.reduce((s, p) => s + p.id * p.mt, 0);
    const b = (n * sxy - sx * sy) / Math.max(1e-9, n * sxx - sx * sx);
    const a = (sy - b * sx) / n;
    const my = sy / n;
    const ssTot = shots.reduce((s, p) => s + (p.mt - my) ** 2, 0);
    const ssRes = shots.reduce((s, p) => s + (p.mt - (a + b * p.id)) ** 2, 0);
    return { a, b, r2: 1 - ssRes / Math.max(1e-9, ssTot) };
  }

  function shoot(x, y) {
    if (!running) { start(); return; }
    if (!target) return;
    const d = Math.hypot(x - target.x, y - target.y);
    if (d > target.r) {
      misses += 1;
      audio.bad();
      return;
    }
    const dist = Math.hypot(target.x - last.x, target.y - last.y);
    const id = Math.log2((2 * dist) / (target.r * 2) + 1);
    shots.push({ mt: performance.now() - target.born, id, d: dist, w: target.r * 2 });
    last = { x: target.x, y: target.y };
    audio.good();

    if (shots.length >= SHOTS) {
      running = false;
      target = null;
      const total = (performance.now() - tStart) / 1000;
      const avg = shots.reduce((s, p) => s + p.mt, 0) / shots.length;
      const acc = shots.length / (shots.length + misses);
      const { a, b, r2 } = fit();
      const score = Math.max(0, Math.round((1200 - avg) * acc));
      submit(score);
      audio.chime();
      announce(`${Math.round(avg)} milliseconds average`);
      info.innerHTML = `<b class="accent">${Math.round(avg)} ms average</b> over ${SHOTS} targets,
        ${Math.round(acc * 100)}% first-click accuracy, ${total.toFixed(1)}s total. Score ${score}.<br>
        Your Fitts fit is <b>MT = ${a.toFixed(0)} + ${(b * 1).toFixed(0)}&middot;ID</b> ms with
        r&sup2; = <b>${r2.toFixed(2)}</b>. The ${a.toFixed(0)} ms is what you spend regardless of where
        the target is; the ${(b).toFixed(0)} is what each doubling of difficulty costs you.
        ${r2 > 0.7 ? 'A fit that tight means your aiming is a physical law with your name on the constants.'
          : 'A loose fit usually means the first few targets were warm-up. Run it again.'}`;
      return;
    }
    spawn();
  }

  function tick() {
    ctx.clearRect(0, 0, w, h);
    ctx.fillStyle = C.panel2;
    ctx.fillRect(0, 0, w, h);

    if (target) {
      const age = (performance.now() - target.born) / 1000;
      ctx.strokeStyle = 'rgba(255,122,24,.35)';
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(last.x, last.y); ctx.lineTo(target.x, target.y); ctx.stroke();

      ctx.fillStyle = C.accent;
      ctx.beginPath();
      ctx.arc(target.x, target.y, target.r, 0, 6.284);
      ctx.fill();
      ctx.fillStyle = '#06070b';
      ctx.beginPath();
      ctx.arc(target.x, target.y, Math.max(2, target.r * 0.22), 0, 6.284);
      ctx.fill();

      ctx.strokeStyle = `rgba(255,122,24,${Math.max(0, 0.5 - age * 0.5)})`;
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.arc(target.x, target.y, target.r + age * 60, 0, 6.284);
      ctx.stroke();
    }

    ctx.strokeStyle = 'rgba(234,240,255,.55)';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(cursor.x - 9, cursor.y); ctx.lineTo(cursor.x + 9, cursor.y);
    ctx.moveTo(cursor.x, cursor.y - 9); ctx.lineTo(cursor.x, cursor.y + 9);
    ctx.stroke();

    ctx.font = '12px ui-monospace, Consolas, monospace';
    ctx.fillStyle = C.dim;
    ctx.fillText(`${shots.length}/${SHOTS}`, 12, 24);
    ctx.fillText(`misses ${misses}`, 90, 24);
    if (!running && !shots.length) {
      ctx.fillStyle = C.accent;
      ctx.fillText('click anywhere to start', W / 2 - 70, H / 2);
    }
  }

  const toLocal = (e) => {
    const r = canvas.getBoundingClientRect();
    return { x: ((e.clientX - r.left) / r.width) * W, y: ((e.clientY - r.top) / r.height) * H };
  };
  const onDown = (e) => { const p = toLocal(e); cursor = p; shoot(p.x, p.y); };
  const onMove = (e) => { cursor = toLocal(e); };
  canvas.addEventListener('pointerdown', onDown);
  canvas.addEventListener('pointermove', onMove);
  const onKey = (e) => { if (e.key === 'r') { e.preventDefault(); start(); } };
  host.addEventListener('keydown', onKey);

  info.innerHTML = 'Click to start. Twenty-two targets, then the page fits Fitts\'s law to your own numbers.';
  const unsub = subscribe(tick);
  return {
    destroy() { host.removeEventListener('keydown', onKey); unsub?.(); canvas.remove(); info.remove(); },
  };
}
