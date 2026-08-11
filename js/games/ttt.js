// Tic-tac-toe against a solver that cannot lose.
//
// The opponent is full minimax over the 5,478 reachable positions, memoised,
// with depth in the score so it takes the fastest win and the slowest loss.
// You cannot beat it. That is the interesting part: the game is a solved draw,
// and the readout shows you the exact value of every move you could make.
const LINES = [[0, 1, 2], [3, 4, 5], [6, 7, 8], [0, 3, 6], [1, 4, 7], [2, 5, 8], [0, 4, 8], [2, 4, 6]];

export function create({ host, audio, announce, submit }) {
  let board = new Array(9).fill(0);   // 1 = you (X), -1 = solver (O)
  let turn = 1;
  let over = false;
  let games = 0;
  let draws = 0;
  let losses = 0;
  let level = 'perfect';
  const memo = new Map();

  const winner = (b) => {
    for (const [a, c, d] of LINES) if (b[a] && b[a] === b[c] && b[c] === b[d]) return b[a];
    return b.every(Boolean) ? 0 : null;
  };

  // Negamax with depth so it prefers to win now and lose later.
  function value(b, p, depth) {
    const w = winner(b);
    if (w !== null) return w === 0 ? 0 : (w === p ? 10 - depth : depth - 10);
    const key = b.join('') + p;
    if (memo.has(key)) return memo.get(key);
    let best = -99;
    for (let i = 0; i < 9; i += 1) {
      if (b[i]) continue;
      b[i] = p;
      const v = -value(b, -p, depth + 1);
      b[i] = 0;
      if (v > best) best = v;
    }
    memo.set(key, best);
    return best;
  }

  function moveScores(b, p) {
    return b.map((c, i) => {
      if (c) return null;
      b[i] = p;
      const v = -value(b, -p, 1);
      b[i] = 0;
      return v;
    });
  }

  const wrap = document.createElement('div');
  wrap.innerHTML = `
    <p class="mono" style="font-size:12.5px;color:var(--dim);margin:0 0 16px">
      You are X and you move first, which is the advantage. The opponent is full minimax and
      has never lost a game of anything. Best you can do is draw, so the score is your draw rate.</p>
    <div class="row" style="gap:26px;flex-wrap:wrap;margin-bottom:16px">
      <span class="metric" data-g>0<small>games</small></span>
      <span class="metric" data-d>0<small>draws held</small></span>
      <span class="metric" data-l>0<small>losses</small></span>
    </div>
    <div data-board style="display:grid;grid-template-columns:repeat(3,1fr);gap:8px;max-width:300px"></div>
    <div class="row" style="gap:10px;margin-top:16px;flex-wrap:wrap">
      <button class="btn" data-new>new game</button>
      <button class="btn" data-level>opponent: perfect</button>
      <button class="btn" data-show>show me the move values</button>
    </div>
    <p class="mono" data-msg style="font-size:12.5px;min-height:4em;margin:14px 0 0"></p>`;
  host.appendChild(wrap);

  const bd = wrap.querySelector('[data-board]');
  const msg = wrap.querySelector('[data-msg]');
  const set = (sel, v) => { wrap.querySelector(sel).firstChild.textContent = v; };

  for (let i = 0; i < 9; i += 1) {
    const b = document.createElement('button');
    b.dataset.i = String(i);
    b.style.cssText = `aspect-ratio:1;border-radius:12px;border:1px solid var(--line);
      background:var(--panel-2);color:var(--text);font:500 34px var(--mono);cursor:pointer;
      transition:border-color 140ms var(--ease),color 140ms var(--ease)`;
    bd.appendChild(b);
  }

  function paint(scores) {
    board.forEach((v, i) => {
      const b = bd.children[i];
      b.textContent = v === 1 ? 'X' : v === -1 ? 'O' : (scores && scores[i] !== null ? '' : '');
      b.style.color = v === 1 ? '#ff7a18' : v === -1 ? '#4d7cfe' : 'var(--faint)';
      b.style.borderColor = 'var(--line)';
      if (!v && scores && scores[i] !== null) {
        const s = scores[i];
        b.textContent = s > 0 ? 'win' : s < 0 ? 'loss' : 'draw';
        b.style.font = '500 13px var(--mono)';
        b.style.color = s > 0 ? '#38d9a9' : s < 0 ? '#ff6b6b' : 'var(--dim)';
      } else {
        b.style.font = '500 34px var(--mono)';
      }
    });
    set('[data-g]', games); set('[data-d]', draws); set('[data-l]', losses);
  }

  function finish(w) {
    over = true;
    games += 1;
    if (w === 0) { draws += 1; audio.chime(); msg.innerHTML = '<b class="accent">Draw.</b> That is the correct result and it took perfect play from you to get it.'; }
    else if (w === -1) { losses += 1; audio.bad(); msg.innerHTML = '<span style="color:#ff4d4d">Loss.</span> There was a move that held the draw; press <b>show me the move values</b> next game and it will be the one marked draw.'; }
    else { audio.chime(); msg.innerHTML = '<b class="accent">You won.</b> Against perfect play that is not possible, so the opponent was on <b>flawed</b>.'; }
    submit(Math.round((draws / Math.max(1, games)) * 1000));
    announce(w === 0 ? 'draw' : w === -1 ? 'loss' : 'win');
    paint();
  }

  function reply() {
    if (over) return;
    const moves = [];
    for (let i = 0; i < 9; i += 1) if (!board[i]) moves.push(i);
    let pick;
    if (level === 'flawed' && moves.length && Math.abs(Math.sin(games * 7.13 + moves.length)) > 0.72) {
      // A deliberate, reproducible blunder rate so "beatable" is honest about
      // being beatable rather than pretending to be a weaker search.
      pick = moves[Math.floor(Math.abs(Math.sin(games * 3.7 + moves.length)) * moves.length) % moves.length];
    } else {
      const scores = moveScores(board, -1);
      let best = -99;
      for (const i of moves) if (scores[i] > best) { best = scores[i]; pick = i; }
    }
    board[pick] = -1;
    turn = 1;
    audio.tick();
    const w = winner(board);
    if (w !== null) finish(w); else paint();
  }

  bd.addEventListener('click', (e) => {
    const b = e.target.closest('[data-i]');
    if (!b || over || turn !== 1) return;
    const i = Number(b.dataset.i);
    if (board[i]) return;
    board[i] = 1;
    turn = -1;
    audio.blip();
    const w = winner(board);
    if (w !== null) { finish(w); return; }
    paint();
    setTimeout(reply, 260);
  });

  wrap.addEventListener('click', (e) => {
    if (e.target.closest('[data-new]')) {
      board = new Array(9).fill(0); turn = 1; over = false;
      msg.textContent = 'Your move. The centre and the corners are not equivalent.';
      paint();
      return;
    }
    if (e.target.closest('[data-level]')) {
      level = level === 'perfect' ? 'flawed' : 'perfect';
      e.target.closest('[data-level]').textContent = `opponent: ${level}`;
      msg.textContent = level === 'flawed'
        ? 'It will now throw one about a third of the time. Beating that proves nothing and is more fun.'
        : 'Back to minimax. It will not lose.';
      return;
    }
    if (e.target.closest('[data-show]')) {
      if (over) { msg.textContent = 'Start a game first.'; return; }
      paint(moveScores(board, 1));
      msg.innerHTML = `Each empty square now shows the game-theoretic value of playing there,
        assuming both sides play perfectly afterwards. From the opening position all nine are
        <b>draw</b>, which is what "solved" means: the first move never mattered.`;
    }
  });

  paint();
  msg.textContent = 'Your move.';
  return { destroy() { wrap.remove(); } };
}
