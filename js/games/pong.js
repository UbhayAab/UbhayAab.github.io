// Pong, two players on one keyboard, with a computer opponent available that
// is deliberately imperfect: it tracks the ball with a reaction delay and a
// small aim error, because an AI paddle that reads the ball's exact position
// every frame is unbeatable and therefore not a game.
import { makeCanvas, COLORS as C } from '../arcade.js';

const W = 720;
const H = 440;
const PH = 82;   // paddle height
const PW = 10;

export function create({ host, rng, audio, announce, submit, subscribe }) {
  const { canvas, ctx, w, h } = makeCanvas(host, W, H);
  const bar = document.createElement('div');
  bar.className = 'row';
  bar.style.cssText = 'gap:10px;margin-top:14px;flex-wrap:wrap';
  bar.innerHTML = `<button class="btn" data-mode>right side: computer</button>
    <button class="btn" data-serve>serve</button>`;
  host.appendChild(bar);
  const info = document.createElement('p');
  info.className = 'mono';
  info.style.cssText = 'font-size:12.5px;color:var(--dim);margin:12px 0 0;min-height:3.4em';
  host.appendChild(info);

  const keys = new Set();
  let left, right, ball, sL, sR, live, bot, botTarget, botLag, rally, longest;

  function reset(serveTo) {
    left = H / 2; right = H / 2;
    ball = { x: W / 2, y: H / 2, vx: (serveTo || (rng() < 0.5 ? -1 : 1)) * 300, vy: (rng() - 0.5) * 220 };
    live = false;
    rally = 0;
  }

  function init() {
    sL = 0; sR = 0; bot = true; botTarget = H / 2; botLag = 0; longest = 0;
    reset();
    info.innerHTML = 'Left: <span class="accent">W</span> and <span class="accent">S</span>. Right: <span class="accent">up</span> and <span class="accent">down</span>, or leave it on computer. First to 7.';
  }

  function tick(dtMs) {
    const dt = Math.min(0.033, dtMs / 1000);

    const lu = keys.has('w') ? 1 : 0, ld = keys.has('s') ? 1 : 0;
    left = Math.max(PH / 2, Math.min(H - PH / 2, left + (ld - lu) * 460 * dt));

    if (bot) {
      // Re-aims every ~110 ms and aims at a point offset from the true one.
      // Both numbers are what make it beatable.
      botLag -= dt;
      if (botLag <= 0) {
        botLag = 0.11;
        botTarget = ball.vx > 0 ? ball.y + (rng() - 0.5) * 64 : H / 2 + (rng() - 0.5) * 40;
      }
      const d = botTarget - right;
      right = Math.max(PH / 2, Math.min(H - PH / 2, right + Math.sign(d) * Math.min(Math.abs(d), 380 * dt)));
    } else {
      const ru = keys.has('arrowup') ? 1 : 0, rd = keys.has('arrowdown') ? 1 : 0;
      right = Math.max(PH / 2, Math.min(H - PH / 2, right + (rd - ru) * 460 * dt));
    }

    if (live) {
      for (let s = 0; s < 3; s += 1) {
        ball.x += ball.vx * dt / 3;
        ball.y += ball.vy * dt / 3;
        if (ball.y < 6) { ball.y = 6; ball.vy = Math.abs(ball.vy); audio.tick(); }
        if (ball.y > H - 6) { ball.y = H - 6; ball.vy = -Math.abs(ball.vy); audio.tick(); }

        // Same contact rule as breakout: where it hits sets where it goes.
        if (ball.vx < 0 && ball.x < 22 + PW && Math.abs(ball.y - left) < PH / 2 + 6) {
          const off = (ball.y - left) / (PH / 2);
          const sp = Math.min(620, Math.hypot(ball.vx, ball.vy) * 1.05);
          const a = off * 0.9;
          ball.vx = Math.cos(a) * sp; ball.vy = Math.sin(a) * sp;
          ball.x = 22 + PW + 1;
          rally += 1; longest = Math.max(longest, rally);
          audio.good();
        }
        if (ball.vx > 0 && ball.x > W - 22 - PW && Math.abs(ball.y - right) < PH / 2 + 6) {
          const off = (ball.y - right) / (PH / 2);
          const sp = Math.min(620, Math.hypot(ball.vx, ball.vy) * 1.05);
          const a = off * 0.9;
          ball.vx = -Math.cos(a) * sp; ball.vy = Math.sin(a) * sp;
          ball.x = W - 22 - PW - 1;
          rally += 1; longest = Math.max(longest, rally);
          audio.good();
        }

        if (ball.x < -20) { sR += 1; point(1); break; }
        if (ball.x > W + 20) { sL += 1; point(-1); break; }
      }
    }
    draw();
  }

  function point(serveTo) {
    audio.bad();
    announce(`${sL} to ${sR}`);
    if (sL >= 7 || sR >= 7) {
      const won = sL >= 7;
      submit(won ? 500 + longest * 20 : longest * 20);
      info.innerHTML = `<b class="accent">${won ? 'Left' : 'Right'} wins ${sL} to ${sR}.</b>
        Longest rally ${longest}. Press serve for a new game.`;
      sL = 0; sR = 0;
      audio.chime();
    }
    reset(serveTo);
  }

  function draw() {
    ctx.clearRect(0, 0, w, h);
    ctx.fillStyle = C.panel2;
    ctx.fillRect(0, 0, w, h);

    ctx.strokeStyle = '#1b2130';
    ctx.setLineDash([6, 10]);
    ctx.beginPath(); ctx.moveTo(W / 2, 0); ctx.lineTo(W / 2, H); ctx.stroke();
    ctx.setLineDash([]);

    ctx.fillStyle = C.accent;
    ctx.beginPath(); ctx.roundRect(22, left - PH / 2, PW, PH, 5); ctx.fill();
    ctx.fillStyle = bot ? '#7c8699' : C.accent2;
    ctx.beginPath(); ctx.roundRect(W - 22 - PW, right - PH / 2, PW, PH, 5); ctx.fill();

    ctx.fillStyle = '#eaf0ff';
    ctx.beginPath(); ctx.arc(ball.x, ball.y, 6, 0, 6.284); ctx.fill();

    ctx.font = '500 30px ui-monospace, Consolas, monospace';
    ctx.fillStyle = '#232b3c';
    ctx.fillText(String(sL), W / 2 - 56, 44);
    ctx.fillText(String(sR), W / 2 + 34, 44);
    ctx.font = '11px ui-monospace, Consolas, monospace';
    ctx.fillStyle = C.dim;
    ctx.fillText(`rally ${rally}`, 12, H - 12);
    if (!live) {
      ctx.fillStyle = C.accent;
      ctx.fillText('press serve or space', W / 2 - 62, H / 2 + 40);
    }
  }

  const down = (e) => {
    const k = e.key.toLowerCase();
    if (k === ' ') { e.preventDefault(); live = true; return; }
    if (['w', 's', 'arrowup', 'arrowdown'].includes(k)) { e.preventDefault(); keys.add(k); }
  };
  const up = (e) => keys.delete(e.key.toLowerCase());
  host.addEventListener('keydown', down);
  host.addEventListener('keyup', up);
  bar.addEventListener('click', (e) => {
    if (e.target.closest('[data-serve]')) { live = true; return; }
    if (e.target.closest('[data-mode]')) {
      bot = !bot;
      e.target.closest('[data-mode]').textContent = `right side: ${bot ? 'computer' : 'player two'}`;
      info.innerHTML = bot
        ? 'The computer re-aims every 110 ms with a random offset. That is why it can be beaten.'
        : 'Right side is now a person: <span class="accent">up</span> and <span class="accent">down</span>.';
    }
  });

  init();
  const unsub = subscribe(tick);
  return {
    destroy() {
      host.removeEventListener('keydown', down);
      host.removeEventListener('keyup', up);
      unsub?.(); canvas.remove(); bar.remove(); info.remove();
    },
  };
}
