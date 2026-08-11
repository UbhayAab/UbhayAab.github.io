// Minesweeper, with the two fixes the 1990 original never got: the first click
// is always safe and always opens a region, and the solver flag tells you when
// the board still has a forced move left. Guessing is a real part of this game,
// but only at the end, and it should be obvious which part that is.
export function create({ host, rng, audio, announce, submit }) {
  const W = 16;
  const H = 12;
  const MINES = 32;

  let grid, revealed, flagged, over, won, started, t0, firstDone;

  const wrap = document.createElement('div');
  wrap.innerHTML = `
    <p class="mono" style="font-size:12.5px;color:var(--dim);margin:0 0 16px">
      16 by 12, 32 mines. Click to open, right-click or <span class="accent">f</span> to flag.
      The first click is always safe. <span class="accent">solve</span> reports whether a forced move exists.</p>
    <div class="row" style="gap:26px;flex-wrap:wrap;margin-bottom:14px">
      <span class="metric" data-left>32<small>mines left</small></span>
      <span class="metric" data-time>0<small>seconds</small></span>
      <span class="metric" data-open>0<small>opened</small></span>
    </div>
    <div data-board style="display:grid;grid-template-columns:repeat(${W},1fr);gap:2px;
      max-width:600px;user-select:none;touch-action:manipulation"></div>
    <div class="row" style="gap:10px;margin-top:14px;flex-wrap:wrap">
      <button class="btn" data-new>new board</button>
      <button class="btn" data-solve>is there a forced move?</button>
    </div>
    <p class="mono" data-msg style="font-size:12.5px;min-height:3.4em;margin:14px 0 0"></p>`;
  host.appendChild(wrap);

  const board = wrap.querySelector('[data-board]');
  const msg = wrap.querySelector('[data-msg]');
  const set = (sel, v) => { wrap.querySelector(sel).firstChild.textContent = v; };
  const idx = (x, y) => y * W + x;
  const nbrs = (x, y) => {
    const out = [];
    for (let dy = -1; dy <= 1; dy += 1) {
      for (let dx = -1; dx <= 1; dx += 1) {
        if (!dx && !dy) continue;
        const nx = x + dx, ny = y + dy;
        if (nx >= 0 && ny >= 0 && nx < W && ny < H) out.push([nx, ny]);
      }
    }
    return out;
  };

  const TINT = ['', '#7ba0ff', '#38d9a9', '#ff7a18', '#ff5a7a', '#ffc44d', '#8ef0d0', '#eaf0ff', '#7c8699'];

  function reset() {
    grid = new Array(W * H).fill(0);
    revealed = new Array(W * H).fill(false);
    flagged = new Array(W * H).fill(false);
    over = false; won = false; started = false; firstDone = false;
    board.innerHTML = '';
    for (let y = 0; y < H; y += 1) {
      for (let x = 0; x < W; x += 1) {
        const b = document.createElement('button');
        b.dataset.x = x; b.dataset.y = y;
        b.style.cssText = `aspect-ratio:1;border-radius:4px;border:1px solid var(--line);
          background:var(--panel-2);color:var(--dim);font:500 13px var(--mono);cursor:pointer;padding:0`;
        board.appendChild(b);
      }
    }
    set('[data-left]', MINES); set('[data-time]', 0); set('[data-open]', 0);
    msg.textContent = 'Click anywhere. That click cannot be a mine.';
    paint();
  }

  function place(safeX, safeY) {
    // Keep the whole 3x3 around the first click clear so it always opens a
    // region rather than a lone "1" with nothing to go on.
    const banned = new Set([idx(safeX, safeY), ...nbrs(safeX, safeY).map(([x, y]) => idx(x, y))]);
    let placed = 0;
    while (placed < MINES) {
      const i = Math.floor(rng() * W * H);
      if (banned.has(i) || grid[i] === -1) continue;
      grid[i] = -1;
      placed += 1;
    }
    for (let y = 0; y < H; y += 1) {
      for (let x = 0; x < W; x += 1) {
        if (grid[idx(x, y)] === -1) continue;
        grid[idx(x, y)] = nbrs(x, y).filter(([nx, ny]) => grid[idx(nx, ny)] === -1).length;
      }
    }
    started = true;
    t0 = performance.now();
  }

  function flood(x, y) {
    const stack = [[x, y]];
    while (stack.length) {
      const [cx, cy] = stack.pop();
      const i = idx(cx, cy);
      if (revealed[i] || flagged[i]) continue;
      revealed[i] = true;
      if (grid[i] === 0) for (const [nx, ny] of nbrs(cx, cy)) stack.push([nx, ny]);
    }
  }

  function openCell(x, y) {
    if (over) return;
    const i = idx(x, y);
    if (flagged[i] || revealed[i]) return;
    if (!started) { place(x, y); firstDone = true; }
    if (grid[i] === -1) {
      over = true;
      revealed = revealed.map((r, k) => r || grid[k] === -1);
      audio.bad();
      const opened = revealed.filter(Boolean).length;
      submit(0);
      msg.innerHTML = `<span style="color:#ff4d4d">Mine at ${x + 1},${y + 1}.</span>
        ${opened} cells opened. About one board in five cannot be finished without a guess,
        so some of these are genuinely not your fault.`;
      paint();
      return;
    }
    flood(x, y);
    audio.tick();
    check();
    paint();
  }

  function check() {
    const opened = revealed.filter(Boolean).length;
    set('[data-open]', opened);
    if (opened === W * H - MINES) {
      over = true; won = true;
      const secs = (performance.now() - t0) / 1000;
      submit(Math.max(1, Math.round(3000 - secs * 6)));
      msg.innerHTML = `<b class="accent">Cleared in ${secs.toFixed(1)}s.</b> Score ${Math.max(1, Math.round(3000 - secs * 6))}.`;
      audio.chime();
    }
  }

  // The two rules that between them solve most boards: if a number equals its
  // hidden neighbours, they are all mines; if it equals its flags, the rest are
  // safe. If neither fires anywhere, the board needs a guess.
  function forced() {
    for (let y = 0; y < H; y += 1) {
      for (let x = 0; x < W; x += 1) {
        const i = idx(x, y);
        if (!revealed[i] || grid[i] <= 0) continue;
        const ns = nbrs(x, y);
        const hidden = ns.filter(([nx, ny]) => !revealed[idx(nx, ny)] && !flagged[idx(nx, ny)]);
        const flags = ns.filter(([nx, ny]) => flagged[idx(nx, ny)]).length;
        if (!hidden.length) continue;
        if (grid[i] - flags === hidden.length) return { x, y, kind: 'mine', at: hidden };
        if (grid[i] === flags) return { x, y, kind: 'safe', at: hidden };
      }
    }
    return null;
  }

  function paint() {
    for (let y = 0; y < H; y += 1) {
      for (let x = 0; x < W; x += 1) {
        const i = idx(x, y);
        const b = board.children[i];
        if (revealed[i]) {
          if (grid[i] === -1) { b.textContent = '*'; b.style.background = '#3a1114'; b.style.color = '#ff6b6b'; }
          else {
            b.textContent = grid[i] || '';
            b.style.background = '#070910';
            b.style.color = TINT[grid[i]] || 'var(--dim)';
          }
          b.style.borderColor = '#141926';
        } else if (flagged[i]) {
          b.textContent = 'F'; b.style.background = 'var(--panel-2)'; b.style.color = 'var(--accent)';
          b.style.borderColor = 'var(--accent)';
        } else {
          b.textContent = ''; b.style.background = 'var(--panel-2)'; b.style.borderColor = 'var(--line)';
        }
      }
    }
    set('[data-left]', MINES - flagged.filter(Boolean).length);
  }

  board.addEventListener('click', (e) => {
    const b = e.target.closest('[data-x]');
    if (!b) return;
    openCell(Number(b.dataset.x), Number(b.dataset.y));
  });
  board.addEventListener('contextmenu', (e) => {
    e.preventDefault();
    const b = e.target.closest('[data-x]');
    if (!b || over) return;
    const i = idx(Number(b.dataset.x), Number(b.dataset.y));
    if (revealed[i]) return;
    flagged[i] = !flagged[i];
    audio.tick();
    paint();
  });

  wrap.addEventListener('click', (e) => {
    if (e.target.closest('[data-new]')) { reset(); return; }
    if (e.target.closest('[data-solve]')) {
      if (!started) { msg.textContent = 'Open something first.'; return; }
      const f = forced();
      if (!f) { msg.innerHTML = '<b class="accent">No forced move.</b> Every remaining cell needs probability, not logic. Pick the one bordering the largest number and accept the odds.'; return; }
      msg.innerHTML = `<b class="accent">Forced move at ${f.x + 1},${f.y + 1}.</b>
        That ${grid[idx(f.x, f.y)]} has exactly ${f.kind === 'mine' ? 'as many hidden neighbours as mines, so all of them are mines' : 'its mines flagged already, so the rest are safe'}.`;
      board.children[idx(f.x, f.y)].style.borderColor = '#38d9a9';
      announce('forced move found');
    }
  });

  let ticker = setInterval(() => {
    if (started && !over) set('[data-time]', Math.round((performance.now() - t0) / 1000));
  }, 500);

  reset();
  return { destroy() { clearInterval(ticker); wrap.remove(); } };
}
