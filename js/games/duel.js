// Reaction duel, two players, one keyboard.
//
// The brief asked for multiplayer with a QR join. This page is static files on
// GitHub Pages with no server and no signalling, so a remote lobby would be a
// lie told with a QR code. Two people at one keyboard is real multiplayer, it
// works offline, and it is the version that actually gets played.
//
// The scoring is honest about what a reaction time is made of: anything under
// 100 ms is a guess, not a reaction, because the signal has not finished
// arriving yet. Guesses lose the round.
export function create({ host, rng, audio, announce, submit }) {
  const P = [
    { name: 'LEFT', key: 'a', tint: '#ff7a18', score: 0, times: [] },
    { name: 'RIGHT', key: 'l', tint: '#4d7cfe', score: 0, times: [] },
  ];
  const TARGET = 5;

  let state = 'idle';   // idle | armed | go | between | over
  let armedAt = 0;
  let timer = null;

  const wrap = document.createElement('div');
  wrap.innerHTML = `
    <p class="mono" style="font-size:12.5px;color:var(--dim);margin:0 0 16px">
      Two people, one keyboard. Left player is <span class="accent">A</span>, right player is
      <span class="accent">L</span>. First to ${TARGET} rounds. Pressing before the panel turns
      loses the round, and anything under 100 ms is scored as a guess because the signal has not
      arrived yet.</p>
    <div style="display:grid;grid-template-columns:1fr 1fr;gap:12px;max-width:720px">
      ${P.map((p, i) => `
        <div data-p="${i}" style="border:1px solid var(--line);border-radius:12px;padding:18px;
          background:var(--panel-2);text-align:center;transition:background 90ms linear">
          <p class="mono" style="margin:0;color:${p.tint};letter-spacing:.2em;font-size:11px">${p.name} &middot; ${p.key.toUpperCase()}</p>
          <p style="font:500 44px/1.1 var(--mono);margin:10px 0 4px" data-s>0</p>
          <p class="mono" style="margin:0;color:var(--faint);font-size:11px" data-t>-</p>
        </div>`).join('')}
    </div>
    <div data-pad style="margin-top:12px;max-width:720px;height:130px;border-radius:14px;
      border:1px solid var(--line);background:var(--panel-2);display:grid;place-items:center;
      font:500 clamp(15px,3vw,24px) var(--mono);color:var(--dim);transition:background 60ms linear">
      press space to start</div>
    <p class="mono" data-msg style="font-size:12.5px;min-height:4em;margin:16px 0 0"></p>`;
  host.appendChild(wrap);

  const pad = wrap.querySelector('[data-pad]');
  const msg = wrap.querySelector('[data-msg]');

  function paint() {
    P.forEach((p, i) => {
      const box = wrap.querySelector(`[data-p="${i}"]`);
      box.querySelector('[data-s]').textContent = p.score;
      box.querySelector('[data-s]').style.color = p.tint;
      const avg = p.times.length ? Math.round(p.times.reduce((a, b) => a + b, 0) / p.times.length) : 0;
      box.querySelector('[data-t]').textContent = avg ? `${avg} ms average` : '-';
      box.style.borderColor = p.score >= TARGET ? p.tint : 'var(--line)';
    });
  }

  function arm() {
    state = 'armed';
    pad.style.background = 'var(--panel-2)';
    pad.style.color = 'var(--faint)';
    pad.textContent = 'wait';
    timer = setTimeout(() => {
      state = 'go';
      armedAt = performance.now();
      pad.style.background = '#38d9a9';
      pad.style.color = '#04140f';
      pad.textContent = 'NOW';
      audio.blip();
    }, 1300 + rng() * 3200);
  }

  function award(i, ms) {
    const p = P[i];
    p.score += 1;
    if (ms) p.times.push(ms);
    paint();
    audio.good();
    if (p.score >= TARGET) {
      state = 'over';
      const other = P[1 - i];
      const a = p.times.length ? Math.round(p.times.reduce((x, y) => x + y, 0) / p.times.length) : 0;
      const b = other.times.length ? Math.round(other.times.reduce((x, y) => x + y, 0) / other.times.length) : 0;
      submit(Math.max(0, 600 - (a || 600)));
      audio.chime();
      announce(`${p.name} wins`);
      msg.innerHTML = `<b class="accent">${p.name} takes it ${p.score} to ${other.score}.</b>
        ${a && b ? `Averages ${a} ms against ${b} ms, a gap of ${Math.abs(a - b)} ms.
        For scale, the signal itself needs about 80 to 100 ms just to get from retina to finger,
        so the part either of you actually controls is the remainder.` : ''}
        Press space to run it again.`;
      pad.style.background = 'var(--panel-2)';
      pad.style.color = 'var(--dim)';
      pad.textContent = 'space for a new match';
      return;
    }
    state = 'between';
    pad.style.background = 'var(--panel-2)';
    pad.style.color = 'var(--dim)';
    pad.textContent = 'space for the next round';
  }

  function press(i) {
    if (state === 'idle' || state === 'over' || state === 'between') return;
    if (state === 'armed') {
      clearTimeout(timer);
      state = 'between';
      pad.style.background = '#ff4d4d';
      pad.style.color = '#1a0505';
      pad.textContent = `${P[i].name} jumped`;
      msg.innerHTML = `<span style="color:#ff4d4d">${P[i].name} went early.</span> Round to ${P[1 - i].name}.`;
      award(1 - i, 0);
      audio.bad();
      return;
    }
    const ms = performance.now() - armedAt;
    if (ms < 100) {
      state = 'between';
      msg.innerHTML = `<span style="color:#ff4d4d">${Math.round(ms)} ms is not a reaction.</span>
        Nerve conduction alone takes longer than that, so the key was already moving. Round to ${P[1 - i].name}.`;
      award(1 - i, 0);
      return;
    }
    msg.innerHTML = `${P[i].name} in <b class="accent">${Math.round(ms)} ms</b>.`;
    award(i, ms);
  }

  const onKey = (e) => {
    const k = e.key.toLowerCase();
    if (k === ' ') {
      e.preventDefault();
      if (state === 'over') { P.forEach((p) => { p.score = 0; p.times.length = 0; }); paint(); msg.textContent = ''; }
      if (state === 'idle' || state === 'between' || state === 'over') arm();
      return;
    }
    const i = P.findIndex((p) => p.key === k);
    if (i >= 0) { e.preventDefault(); press(i); }
  };
  host.addEventListener('keydown', onKey);

  paint();
  msg.textContent = 'No server, no lobby, no QR code that would not work. Two people, one keyboard.';
  return { destroy() { clearTimeout(timer); host.removeEventListener('keydown', onKey); wrap.remove(); } };
}
