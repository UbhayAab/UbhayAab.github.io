// Breakout, with the one rule the arcade original had and most clones drop:
// where the ball lands on the paddle sets the angle it leaves at. Without that
// the game is luck, and with it the paddle is a steering wheel.
import { makeCanvas, COLORS as C } from '../arcade.js';

const W = 720;
const H = 480;
const COLS = 11;
const ROWS = 6;
const PAD = 26;

export function create({ host, rng, audio, announce, submit, subscribe }) {
  const { canvas, ctx, w, h } = makeCanvas(host, W, H);
  const info = document.createElement('p');
  info.className = 'mono';
  info.style.cssText = 'font-size:12.5px;color:var(--dim);margin:14px 0 0';
  host.appendChild(info);

  const bw = (W - PAD * 2) / COLS;
  const bh = 20;
  const TINTS = ['#ff7a18', '#ffa24d', '#4d7cfe', '#7ba0ff', '#38d9a9', '#8ef0d0'];

  let bricks, ball, paddle, score, lives, launched, over, keys;

  function reset() {
    bricks = [];
    for (let r = 0; r < ROWS; r += 1) {
      for (let c = 0; c < COLS; c += 1) {
        bricks.push({ c, r, alive: true, pts: (ROWS - r) * 10 });
      }
    }
    paddle = { x: W / 2, w: 108 };
    ball = { x: W / 2, y: H - 60, vx: 0, vy: 0, r: 7 };
    score = 0; lives = 3; launched = false; over = false;
    keys = new Set();
    info.innerHTML = 'Left and right or the mouse, <span class="accent">space</span> launches, <span class="accent">r</span> restarts.';
  }

  function launch() {
    if (launched || over) return;
    launched = true;
    const a = (-70 + rng() * 40) * Math.PI / 180;
    const sp = 330;
    ball.vx = Math.sin(a) * sp;
    ball.vy = -Math.abs(Math.cos(a) * sp);
    audio.blip();
  }

  function lose() {
    lives -= 1;
    launched = false;
    ball = { x: paddle.x, y: H - 60, vx: 0, vy: 0, r: 7 };
    audio.bad();
    if (lives <= 0) {
      over = true;
      submit(score);
      const left = bricks.filter((b) => b.alive).length;
      info.innerHTML = `<span style="color:#ff4d4d">Out of balls at ${score}</span>, ${left} bricks standing.
        <span class="accent">r</span> to restart.`;
    }
  }

  function tick(dtMs) {
    const dt = Math.min(0.033, dtMs / 1000);
    if (!over) {
      const push = (keys.has('arrowright') || keys.has('d') ? 1 : 0) - (keys.has('arrowleft') || keys.has('a') ? 1 : 0);
      paddle.x = Math.max(paddle.w / 2, Math.min(W - paddle.w / 2, paddle.x + push * 620 * dt));
      if (!launched) { ball.x = paddle.x; ball.y = H - 60; }
    }

    if (launched && !over) {
      // Substepped so a fast ball cannot tunnel through a brick row.
      const steps = 3;
      for (let s = 0; s < steps; s += 1) {
        ball.x += ball.vx * dt / steps;
        ball.y += ball.vy * dt / steps;

        if (ball.x < ball.r) { ball.x = ball.r; ball.vx = Math.abs(ball.vx); audio.tick(); }
        if (ball.x > W - ball.r) { ball.x = W - ball.r; ball.vx = -Math.abs(ball.vx); audio.tick(); }
        if (ball.y < ball.r) { ball.y = ball.r; ball.vy = Math.abs(ball.vy); audio.tick(); }

        const py = H - 32;
        if (ball.vy > 0 && ball.y > py - ball.r && ball.y < py + 12 && Math.abs(ball.x - paddle.x) < paddle.w / 2 + ball.r) {
          // Contact point sets the exit angle, capped at 62 degrees so a ball
          // can never end up crawling along the ceiling forever.
          const off = (ball.x - paddle.x) / (paddle.w / 2);
          const a = off * (62 * Math.PI / 180);
          const sp = Math.min(560, Math.hypot(ball.vx, ball.vy) * 1.012);
          ball.vx = Math.sin(a) * sp;
          ball.vy = -Math.cos(a) * sp;
          ball.y = py - ball.r;
          audio.tick();
        }

        for (const b of bricks) {
          if (!b.alive) continue;
          const bx = PAD + b.c * bw, by = 56 + b.r * (bh + 6);
          if (ball.x > bx && ball.x < bx + bw && ball.y > by && ball.y < by + bh) {
            b.alive = false;
            score += b.pts;
            audio.good();
            // Bounce on the axis with the shallower penetration.
            const ox = Math.min(ball.x - bx, bx + bw - ball.x);
            const oy = Math.min(ball.y - by, by + bh - ball.y);
            if (ox < oy) ball.vx = -ball.vx; else ball.vy = -ball.vy;
            if (!bricks.some((x) => x.alive)) {
              over = true;
              submit(score + lives * 250);
              info.innerHTML = `<b class="accent">Cleared with ${lives} balls in hand.</b>
                Score ${score + lives * 250}. <span class="accent">r</span> to restart.`;
              audio.chime();
            }
            break;
          }
        }

        if (ball.y > H + 20) { lose(); break; }
      }
    }
    draw();
  }

  function draw() {
    ctx.clearRect(0, 0, w, h);
    ctx.fillStyle = C.panel2;
    ctx.fillRect(0, 0, w, h);

    for (const b of bricks) {
      if (!b.alive) continue;
      ctx.fillStyle = TINTS[b.r % TINTS.length];
      ctx.globalAlpha = 0.9;
      ctx.beginPath();
      ctx.roundRect(PAD + b.c * bw + 2, 56 + b.r * (bh + 6), bw - 4, bh, 4);
      ctx.fill();
    }
    ctx.globalAlpha = 1;

    ctx.fillStyle = '#eaf0ff';
    ctx.beginPath();
    ctx.roundRect(paddle.x - paddle.w / 2, H - 32, paddle.w, 11, 6);
    ctx.fill();

    ctx.beginPath();
    ctx.arc(ball.x, ball.y, ball.r, 0, 6.284);
    ctx.fill();

    ctx.font = '12px ui-monospace, Consolas, monospace';
    ctx.fillStyle = C.dim;
    ctx.fillText(`score ${score}`, 12, 24);
    ctx.fillText(`bricks ${bricks.filter((b) => b.alive).length}`, 120, 24);
    ctx.fillStyle = lives > 1 ? C.dim : '#ff6b6b';
    ctx.fillText('o'.repeat(Math.max(0, lives)), w - 40, 24);
    if (!launched && !over) {
      ctx.fillStyle = C.accent;
      ctx.fillText('space to launch', paddle.x - 46, H - 46);
    }
  }

  const down = (e) => {
    const k = e.key.toLowerCase();
    if (k === 'r') { e.preventDefault(); reset(); return; }
    if (k === ' ') { e.preventDefault(); launch(); return; }
    if (['arrowleft', 'arrowright', 'a', 'd'].includes(k)) { e.preventDefault(); keys.add(k); }
  };
  const up = (e) => keys.delete(e.key.toLowerCase());
  const move = (e) => {
    if (over) return;
    const r = canvas.getBoundingClientRect();
    const x = ((e.clientX - r.left) / r.width) * W;
    paddle.x = Math.max(paddle.w / 2, Math.min(W - paddle.w / 2, x));
  };
  host.addEventListener('keydown', down);
  host.addEventListener('keyup', up);
  canvas.addEventListener('pointermove', move);
  canvas.addEventListener('pointerdown', launch);

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
