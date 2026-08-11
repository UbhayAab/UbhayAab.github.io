// Simon. Four pads, a sequence that grows by one each round, and the honest
// fact underneath it: unaided human working memory holds about four chunks,
// not seven. Everything past round five is chunking or rhythm, and the game
// tracks which one you are doing by how your recall timing changes.
const PADS = [
  { tint: '#ff7a18', hz: 329.63, key: 'q' },
  { tint: '#4d7cfe', hz: 392.00, key: 'w' },
  { tint: '#38d9a9', hz: 440.00, key: 'a' },
  { tint: '#ffc44d', hz: 523.25, key: 's' },
];

export function create({ host, rng, audio, announce, submit }) {
  let seq = [];
  let at = 0;
  let phase = 'idle';   // idle | show | input | dead
  let timers = [];
  const gaps = [];
  let lastPress = 0;
  let actx = null;

  const wrap = document.createElement('div');
  wrap.innerHTML = `
    <p class="mono" style="font-size:12.5px;color:var(--dim);margin:0 0 16px">
      Watch, then repeat. The sequence grows by one each round. Keys are
      <span class="accent">q w a s</span> and they match the pads.</p>
    <div class="row" style="gap:26px;flex-wrap:wrap;margin-bottom:18px">
      <span class="metric" data-r>0<small>round</small></span>
      <span class="metric" data-b>0<small>best</small></span>
      <span class="metric" data-t>-<small>ms between presses</small></span>
    </div>
    <div data-pads style="display:grid;grid-template-columns:repeat(2,1fr);gap:12px;max-width:340px"></div>
    <div class="row" style="gap:10px;margin-top:16px">
      <button class="btn" data-start>start</button>
    </div>
    <p class="mono" data-msg style="font-size:12.5px;min-height:4em;margin:14px 0 0"></p>`;
  host.appendChild(wrap);

  const padsHost = wrap.querySelector('[data-pads]');
  const msg = wrap.querySelector('[data-msg]');
  const set = (sel, v) => { wrap.querySelector(sel).firstChild.textContent = v; };

  const els = PADS.map((p, i) => {
    const b = document.createElement('button');
    b.dataset.p = String(i);
    b.setAttribute('aria-label', `pad ${i + 1}, key ${p.key}`);
    b.style.cssText = `aspect-ratio:1;border-radius:16px;border:1px solid var(--line);
      background:color-mix(in oklab, ${p.tint} 16%, #0b0d13);cursor:pointer;
      font:500 13px var(--mono);color:${p.tint};transition:background 90ms linear,transform 90ms linear`;
    b.textContent = p.key.toUpperCase();
    padsHost.appendChild(b);
    return b;
  });

  function tone(i, ms) {
    try {
      actx = actx || new (window.AudioContext || window.webkitAudioContext)();
      const o = actx.createOscillator();
      const g = actx.createGain();
      o.type = 'sine';
      o.frequency.value = PADS[i].hz;
      g.gain.setValueAtTime(0.0001, actx.currentTime);
      g.gain.exponentialRampToValueAtTime(0.13, actx.currentTime + 0.012);
      g.gain.exponentialRampToValueAtTime(0.0001, actx.currentTime + ms / 1000);
      o.connect(g).connect(actx.destination);
      o.start();
      o.stop(actx.currentTime + ms / 1000 + 0.02);
    } catch { audio.tick(); }
  }

  function flash(i, ms = 340) {
    const b = els[i];
    b.style.background = PADS[i].tint;
    b.style.transform = 'scale(0.97)';
    tone(i, ms);
    timers.push(setTimeout(() => {
      b.style.background = `color-mix(in oklab, ${PADS[i].tint} 16%, #0b0d13)`;
      b.style.transform = '';
    }, ms * 0.72));
  }

  function clearTimers() { timers.forEach(clearTimeout); timers = []; }

  function show() {
    phase = 'show';
    clearTimers();
    // Speeds up with length, so the later rounds are a rhythm problem as much
    // as a memory one. This is what the arcade cabinet did.
    const step = Math.max(210, 620 - seq.length * 26);
    seq.forEach((s, i) => {
      timers.push(setTimeout(() => flash(s, step * 0.62), i * step));
    });
    timers.push(setTimeout(() => { phase = 'input'; at = 0; lastPress = performance.now(); }, seq.length * step + 120));
  }

  function next() {
    seq.push(Math.floor(rng() * 4));
    set('[data-r]', seq.length);
    announce(`round ${seq.length}`);
    show();
  }

  function press(i) {
    if (phase !== 'input') return;
    flash(i, 200);
    const now = performance.now();
    if (at > 0) gaps.push(now - lastPress);
    lastPress = now;
    if (gaps.length) set('[data-t]', Math.round(gaps.slice(-6).reduce((a, b) => a + b, 0) / Math.min(6, gaps.length)));

    if (seq[at] !== i) {
      phase = 'dead';
      submit(seq.length - 1);
      audio.bad();
      const mean = gaps.length ? gaps.reduce((a, b) => a + b, 0) / gaps.length : 0;
      msg.innerHTML = `<span style="color:#ff4d4d">Wrong at position ${at + 1} of ${seq.length}.</span>
        You held ${seq.length - 1} clean rounds. Unaided working memory holds about four items;
        everything past that is chunking, and your ${Math.round(mean)} ms average gap
        ${mean < 420 ? 'is fast enough that you were replaying a rhythm rather than recalling a list, which is the right technique.'
          : 'suggests you were recalling item by item. Grouping them in threes goes further.'}`;
      set('[data-b]', Math.max(Number(wrap.querySelector('[data-b]').firstChild.textContent), seq.length - 1));
      return;
    }
    at += 1;
    if (at >= seq.length) {
      audio.good();
      set('[data-b]', Math.max(Number(wrap.querySelector('[data-b]').firstChild.textContent), seq.length));
      phase = 'show';
      timers.push(setTimeout(next, 620));
    }
  }

  padsHost.addEventListener('click', (e) => {
    const b = e.target.closest('[data-p]');
    if (b) press(Number(b.dataset.p));
  });
  const onKey = (e) => {
    const i = PADS.findIndex((p) => p.key === e.key.toLowerCase());
    if (i >= 0) { e.preventDefault(); press(i); }
  };
  host.addEventListener('keydown', onKey);

  wrap.querySelector('[data-start]').addEventListener('click', () => {
    clearTimers();
    seq = []; gaps.length = 0; at = 0;
    msg.textContent = 'Watch.';
    set('[data-t]', '-');
    next();
  });

  msg.textContent = 'Press start.';
  return { destroy() { clearTimers(); host.removeEventListener('keydown', onKey); wrap.remove(); } };
}
