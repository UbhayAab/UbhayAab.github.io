// Snake. Fixed timestep so speed is identical on any refresh rate.
import { makeCanvas, COLORS as C } from '../arcade.js';

const COLS = 26;
const ROWS = 18;
const CELL = 22;

export function create({ host, rng, audio, announce, submit, subscribe }) {
  const { canvas, ctx, w, h } = makeCanvas(host, COLS * CELL, ROWS * CELL);
  const info = document.createElement('p');
  info.className = 'mono';
  info.style.cssText = 'font-size:12.5px;color:var(--dim);margin:14px 0 0';
  host.appendChild(info);

  let body, dir, next, food, score, over, acc, stepMs;

  function place() {
    for (;;) {
      const f = { x: Math.floor(rng() * COLS), y: Math.floor(rng() * ROWS) };
      if (!body.some((s) => s.x === f.x && s.y === f.y)) return f;
    }
  }

  function reset() {
    body = [{ x: 8, y: 9 }, { x: 7, y: 9 }, { x: 6, y: 9 }];
    dir = { x: 1, y: 0 };
    next = dir;
    score = 0;
    over = false;
    acc = 0;
    stepMs = 118;
    food = place();
    info.innerHTML = 'Arrows or WASD. <span class="accent">r</span> restarts.';
    draw();
  }

  function tick(dtMs) {
    if (over) return;
    acc += dtMs;
    if (acc < stepMs) return;
    acc = 0;
    dir = next;
    const head = { x: body[0].x + dir.x, y: body[0].y + dir.y };

    if (head.x < 0 || head.y < 0 || head.x >= COLS || head.y >= ROWS
      || body.some((s) => s.x === head.x && s.y === head.y)) {
      over = true;
      submit(score);
      info.innerHTML = `<span style="color:#ff4d4d">Dead at ${score}.</span> <span class="accent">r</span> to restart.`;
      audio.bad();
      return;
    }

    body.unshift(head);
    if (head.x === food.x && head.y === food.y) {
      score += 10;
      stepMs = Math.max(58, stepMs - 3);
      food = place();
      audio.good();
      announce(`score ${score}`);
    } else body.pop();
    draw();
  }

  function draw() {
    ctx.clearRect(0, 0, w, h);
    ctx.fillStyle = C.panel2;
    ctx.fillRect(0, 0, w, h);

    ctx.fillStyle = C.accent;
    ctx.beginPath();
    ctx.roundRect(food.x * CELL + 4, food.y * CELL + 4, CELL - 8, CELL - 8, 4);
    ctx.fill();

    body.forEach((s, i) => {
      ctx.fillStyle = i === 0 ? '#eaf0ff' : `rgba(77,124,254,${0.95 - Math.min(0.6, i * 0.02)})`;
      ctx.beginPath();
      ctx.roundRect(s.x * CELL + 2, s.y * CELL + 2, CELL - 4, CELL - 4, 5);
      ctx.fill();
    });

    ctx.font = '12px ui-monospace, Consolas, monospace';
    ctx.fillStyle = C.dim;
    ctx.fillText(`score ${score}`, 10, 18);
  }

  const onKey = (e) => {
    const k = e.key.toLowerCase();
    if (k === 'r') { e.preventDefault(); reset(); return; }
    const m = { arrowleft: [-1, 0], a: [-1, 0], arrowright: [1, 0], d: [1, 0],
      arrowup: [0, -1], w: [0, -1], arrowdown: [0, 1], s: [0, 1] };
    if (!m[k]) return;
    e.preventDefault();
    const [x, y] = m[k];
    // No instant reversal into your own neck.
    if (x === -dir.x && y === -dir.y) return;
    next = { x, y };
  };
  host.addEventListener('keydown', onKey);

  reset();
  const unsub = subscribe(tick);
  return { destroy() { host.removeEventListener('keydown', onKey); unsub?.(); canvas.remove(); info.remove(); } };
}
