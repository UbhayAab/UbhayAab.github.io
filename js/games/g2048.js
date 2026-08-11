// 2048. Seeded, so the same day gives everyone the same tile sequence.
export function create({ host, rng, audio, announce, submit }) {
  const N = 4;
  let g = Array.from({ length: N * N }, () => 0);
  let score = 0;
  let over = false;

  const wrap = document.createElement('div');
  wrap.innerHTML = `
    <p class="mono" style="font-size:12.5px;color:var(--dim);margin:0 0 16px">
      Arrow keys or WASD. <span class="accent">r</span> restarts.</p>
    <div class="row" style="margin-bottom:14px">
      <span class="metric" data-sc>0<small>score</small></span>
      <span class="mono" data-msg style="color:var(--dim)"></span>
    </div>
    <div data-board style="display:grid;grid-template-columns:repeat(4,1fr);gap:9px;
      max-width:420px;background:var(--panel-2);padding:9px;border-radius:12px;
      border:1px solid var(--line);aspect-ratio:1"></div>`;
  host.appendChild(wrap);
  const board = wrap.querySelector('[data-board]');
  const msg = wrap.querySelector('[data-msg]');

  const COLORS = {
    2: '#1b2130', 4: '#232c3f', 8: '#7c4a17', 16: '#96551a', 32: '#b3611b',
    64: '#d06d1c', 128: '#e07a1e', 256: '#e88a2c', 512: '#ef9a3a',
    1024: '#f5aa48', 2048: '#ff7a18',
  };

  const spawn = () => {
    const free = g.map((v, i) => (v ? -1 : i)).filter((i) => i >= 0);
    if (!free.length) return;
    g[free[Math.floor(rng() * free.length)]] = rng() < 0.9 ? 2 : 4;
  };

  function draw() {
    board.innerHTML = '';
    for (const v of g) {
      const c = document.createElement('div');
      c.style.cssText = `display:grid;place-items:center;border-radius:8px;
        background:${v ? COLORS[v] || '#ff5a18' : 'rgba(255,255,255,0.03)'};
        color:${v > 4 ? '#fff' : 'var(--dim)'};font:500 clamp(15px,4vw,26px) var(--mono);
        font-variant-numeric:tabular-nums`;
      c.textContent = v || '';
      board.appendChild(c);
    }
    wrap.querySelector('[data-sc]').firstChild.textContent = score;
  }

  /** Slide+merge one line toward index 0. */
  function collapse(line) {
    const a = line.filter(Boolean);
    for (let i = 0; i < a.length - 1; i += 1) {
      if (a[i] === a[i + 1]) { a[i] *= 2; score += a[i]; a.splice(i + 1, 1); }
    }
    while (a.length < N) a.push(0);
    return a;
  }

  function move(dx, dy) {
    if (over) return;
    const before = g.join(',');
    for (let k = 0; k < N; k += 1) {
      const idx = [];
      for (let i = 0; i < N; i += 1) {
        const x = dx ? (dx > 0 ? N - 1 - i : i) : k;
        const y = dy ? (dy > 0 ? N - 1 - i : i) : k;
        idx.push(y * N + x);
      }
      const merged = collapse(idx.map((i) => g[i]));
      idx.forEach((i, j) => { g[i] = merged[j]; });
    }
    if (g.join(',') === before) return;
    spawn();
    audio.tick();
    draw();
    announce(`score ${score}`);

    const full = g.every(Boolean);
    const stuck = full && !g.some((v, i) =>
      (i % N < N - 1 && g[i + 1] === v) || (i < N * (N - 1) && g[i + N] === v));
    if (stuck) {
      over = true;
      submit(score);
      msg.innerHTML = `<span style="color:#ff4d4d">No moves.</span> ${score} points.`;
      audio.bad();
    } else if (g.includes(2048) && !msg.textContent) {
      msg.innerHTML = '<span class="g" style="color:var(--good)">2048.</span> Keep going.';
      audio.good();
    }
  }

  function reset() { g = g.map(() => 0); score = 0; over = false; msg.textContent = ''; spawn(); spawn(); draw(); }

  const onKey = (e) => {
    const k = e.key.toLowerCase();
    const map = { arrowleft: [-1, 0], a: [-1, 0], arrowright: [1, 0], d: [1, 0],
      arrowup: [0, -1], w: [0, -1], arrowdown: [0, 1], s: [0, 1] };
    if (map[k]) { e.preventDefault(); move(...map[k]); }
    else if (k === 'r') { e.preventDefault(); reset(); }
  };
  host.addEventListener('keydown', onKey);
  reset();
  return { destroy() { host.removeEventListener('keydown', onKey); wrap.remove(); } };
}
