// Typing race against your own best run.
//
// The ghost is not a bot with an invented speed. It is a replay of the fastest
// run you have recorded on this machine, keystroke timing and all, stored in
// localStorage. First time through you race nothing; after that you race the
// only opponent whose numbers are definitely real.
const LINES = [
  'The bet is not that fission gets better. The bet is that it gets boring.',
  'Every plant built as a bespoke civil project relearns its lessons from scratch.',
  'Throughput is set by the slowest station on the line and by nothing else.',
  'To catch something ahead of you in orbit, you have to slow down.',
  'A break makes two rocks, and both of them are faster than the one you broke.',
];

const KEY = 'ghost:typerace';

export function create({ host, rng, audio, announce, submit }) {
  let target = LINES[Math.floor(rng() * LINES.length)];
  let typed = '';
  let t0 = 0;
  let running = false;
  let done = false;
  let stamps = [];          // ms offset of every correct character this run
  let ghost = null;         // the recorded run, if there is one
  let ghostAt = 0;
  let raf = 0;

  try {
    const raw = JSON.parse(localStorage.getItem(KEY) || 'null');
    if (raw && raw.text && Array.isArray(raw.stamps)) ghost = raw;
  } catch { ghost = null; }
  // A ghost only makes sense on the line it was recorded against.
  if (ghost) target = ghost.text;

  const wrap = document.createElement('div');
  wrap.innerHTML = `
    <p class="mono" style="font-size:12.5px;color:var(--dim);margin:0 0 16px">
      You against a keystroke-for-keystroke replay of your own fastest run on this machine.
      Beat it and the recording is replaced.</p>
    <div class="row" style="gap:26px;flex-wrap:wrap;margin-bottom:16px">
      <span class="metric" data-wpm>0<small>your wpm</small></span>
      <span class="metric" data-gw>-<small>ghost wpm</small></span>
      <span class="metric" data-lead>-<small>characters ahead</small></span>
    </div>
    <div style="margin-bottom:8px">
      <div style="height:8px;background:var(--panel-2);border-radius:5px;overflow:hidden">
        <i data-you style="display:block;height:100%;width:0;background:var(--accent)"></i></div>
      <p class="mono" style="font-size:10.5px;color:var(--faint);margin:5px 0 12px">you</p>
      <div style="height:8px;background:var(--panel-2);border-radius:5px;overflow:hidden">
        <i data-ghost style="display:block;height:100%;width:0;background:var(--dim)"></i></div>
      <p class="mono" style="font-size:10.5px;color:var(--faint);margin:5px 0 0" data-glabel>no ghost recorded yet</p>
    </div>
    <p data-text style="font:400 clamp(15px,2.1vw,19px)/1.8 var(--mono);margin:20px 0;min-height:3.6em"></p>
    <input data-in aria-label="type here" autocomplete="off" spellcheck="false"
      style="width:100%;max-width:720px;padding:13px 15px;border-radius:10px;border:1px solid var(--line);
      background:var(--panel-2);color:var(--text);font:400 15px var(--mono)" placeholder="start typing to begin">
    <div class="row" style="gap:10px;margin-top:14px;flex-wrap:wrap">
      <button class="btn" data-again>reset the race</button>
      <button class="btn" data-clear>delete my ghost</button>
    </div>
    <p class="mono" data-msg style="font-size:12.5px;min-height:3.6em;margin:14px 0 0"></p>`;
  host.appendChild(wrap);

  const textEl = wrap.querySelector('[data-text]');
  const input = wrap.querySelector('[data-in]');
  const msg = wrap.querySelector('[data-msg]');
  const youBar = wrap.querySelector('[data-you]');
  const ghostBar = wrap.querySelector('[data-ghost]');
  const set = (sel, v) => { wrap.querySelector(sel).firstChild.textContent = v; };

  if (ghost) {
    const gw = Math.round((ghost.text.length / 5) / (ghost.stamps[ghost.stamps.length - 1] / 60000));
    set('[data-gw]', gw);
    wrap.querySelector('[data-glabel]').textContent = `ghost: your ${gw} wpm run`;
  }

  function paintText() {
    textEl.innerHTML = [...target].map((ch, i) => {
      const c = typed[i];
      const disp = ch === ' ' ? '&nbsp;' : ch.replace('<', '&lt;');
      if (c === undefined) {
        return i === typed.length
          ? `<span style="color:var(--text);border-bottom:2px solid var(--accent)">${disp}</span>`
          : `<span style="color:var(--faint)">${disp}</span>`;
      }
      return c === ch ? `<span style="color:var(--text)">${disp}</span>`
        : `<span style="color:#ff6b6b;background:rgba(255,90,90,.14)">${disp}</span>`;
    }).join('');
  }

  function frame() {
    if (!running) return;
    const el = performance.now() - t0;
    // Where the ghost is right now: the number of its stamps already elapsed.
    if (ghost) {
      while (ghostAt < ghost.stamps.length && ghost.stamps[ghostAt] <= el) ghostAt += 1;
      ghostBar.style.width = `${(ghostAt / ghost.text.length) * 100}%`;
      set('[data-lead]', typed.length - ghostAt);
      wrap.querySelector('[data-lead]').style.color = typed.length >= ghostAt ? 'var(--good)' : '#ff6b6b';
    }
    const correct = [...typed].filter((c, i) => c === target[i]).length;
    set('[data-wpm]', Math.round((correct / 5) / Math.max(el / 60000, 1e-6)));
    raf = requestAnimationFrame(frame);
  }

  input.addEventListener('input', () => {
    if (done) return;
    if (!running) { running = true; t0 = performance.now(); ghostAt = 0; raf = requestAnimationFrame(frame); }
    const prev = typed;
    typed = input.value;
    if (typed.length > prev.length && typed[typed.length - 1] === target[typed.length - 1]) {
      stamps.push(performance.now() - t0);
    }
    youBar.style.width = `${(typed.length / target.length) * 100}%`;
    paintText();

    if (typed.length >= target.length) {
      done = true;
      running = false;
      cancelAnimationFrame(raf);
      const el = performance.now() - t0;
      const wpm = Math.round((target.length / 5) / (el / 60000));
      const errors = [...typed].filter((c, i) => c !== target[i]).length;
      submit(Math.max(0, wpm - errors * 3));
      const beat = !ghost || el < ghost.stamps[ghost.stamps.length - 1];
      if (beat && errors === 0 && stamps.length === target.length) {
        localStorage.setItem(KEY, JSON.stringify({ text: target, stamps }));
        msg.innerHTML = `<b class="accent">${wpm} wpm, new ghost recorded.</b>
          The next run races this one, keystroke for keystroke.`;
        audio.chime();
      } else if (beat) {
        msg.innerHTML = `<b class="accent">${wpm} wpm</b>, but with ${errors} character${errors === 1 ? '' : 's'} wrong,
          so the ghost stands. A clean run is what gets recorded.`;
        audio.good();
      } else {
        const gms = ghost.stamps[ghost.stamps.length - 1];
        msg.innerHTML = `<b>${wpm} wpm.</b> The ghost finished ${((el - gms) / 1000).toFixed(2)}s ahead of you.
          Your own best is the only opponent on this page whose numbers are definitely real.`;
        audio.bad();
      }
      announce(`${wpm} words per minute`);
    }
  });

  wrap.addEventListener('click', (e) => {
    if (e.target.closest('[data-again]')) {
      typed = ''; done = false; running = false; stamps = []; ghostAt = 0;
      cancelAnimationFrame(raf);
      input.value = '';
      youBar.style.width = '0'; ghostBar.style.width = '0';
      set('[data-wpm]', 0); set('[data-lead]', '-');
      msg.textContent = '';
      paintText();
      input.focus();
      return;
    }
    if (e.target.closest('[data-clear]')) {
      localStorage.removeItem(KEY);
      ghost = null;
      set('[data-gw]', '-');
      wrap.querySelector('[data-glabel]').textContent = 'no ghost recorded yet';
      ghostBar.style.width = '0';
      msg.textContent = 'Ghost deleted. The next clean run becomes the new one.';
    }
  });

  paintText();
  msg.textContent = ghost ? 'Ghost loaded. Start typing.' : 'No ghost yet. This run becomes one if you finish it clean.';
  return { destroy() { cancelAnimationFrame(raf); wrap.remove(); } };
}
