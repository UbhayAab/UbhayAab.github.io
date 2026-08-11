// Speed typing over sentences from this site rather than lorem ipsum, scored
// the way typing tests are actually scored: a word is five characters, and
// accuracy is measured against the target string, not against how it felt.
const PASSAGES = [
  'A modular reactor is a manufacturing problem wearing a physics costume.',
  'Throughput is set by the slowest station on the line and by nothing else.',
  'Bytes on disk are parameters plus embeddings; throughput is what you touch.',
  'Xenon-135 keeps building for hours after the flux that burned it has gone.',
  'The critical impact parameter is three root three times the mass.',
  'Every rock you break becomes two smaller rocks moving faster than the first.',
  'Value per photon is the ranking that wins, not value per tray.',
  'Doubling your bet converts a frequent small win into a rare total loss.',
];

export function create({ host, rng, audio, announce, submit }) {
  let target = '';
  let typed = '';
  let t0 = 0;
  let running = false;
  let errors = 0;
  let done = false;

  const wrap = document.createElement('div');
  wrap.innerHTML = `
    <p class="mono" style="font-size:12.5px;color:var(--dim);margin:0 0 16px">
      Type the line. The clock starts on your first keystroke. A word is five characters,
      which is how every typing test you have ever taken defines it.</p>
    <div class="row" style="gap:26px;flex-wrap:wrap;margin-bottom:18px">
      <span class="metric" data-wpm>0<small>wpm</small></span>
      <span class="metric" data-acc>100<small>% accuracy</small></span>
      <span class="metric" data-time>0.0<small>seconds</small></span>
    </div>
    <p data-text style="font:400 clamp(16px,2.4vw,22px)/1.75 var(--mono);letter-spacing:0.005em;
      margin:0 0 20px;min-height:3.4em"></p>
    <input data-in aria-label="type here" autocomplete="off" autocapitalize="off" spellcheck="false"
      style="width:100%;max-width:720px;padding:14px 16px;border-radius:10px;border:1px solid var(--line);
      background:var(--panel-2);color:var(--text);font:400 15px var(--mono)" placeholder="start typing">
    <div class="row" style="gap:10px;margin-top:14px">
      <button class="btn" data-new>new line</button>
    </div>
    <p class="mono" data-msg style="font-size:12.5px;min-height:3.4em;margin:14px 0 0"></p>`;
  host.appendChild(wrap);

  const textEl = wrap.querySelector('[data-text]');
  const input = wrap.querySelector('[data-in]');
  const msg = wrap.querySelector('[data-msg]');
  const set = (sel, v) => { wrap.querySelector(sel).firstChild.textContent = v; };

  function load() {
    target = PASSAGES[Math.floor(rng() * PASSAGES.length)];
    typed = ''; errors = 0; running = false; done = false;
    input.value = '';
    set('[data-wpm]', 0); set('[data-acc]', 100); set('[data-time]', '0.0');
    msg.textContent = '';
    paint();
    input.focus();
  }

  function paint() {
    textEl.innerHTML = [...target].map((ch, i) => {
      const c = typed[i];
      const disp = ch === ' ' ? '&nbsp;' : ch.replace('<', '&lt;');
      if (c === undefined) {
        return i === typed.length
          ? `<span style="color:var(--text);border-bottom:2px solid var(--accent)">${disp}</span>`
          : `<span style="color:var(--faint)">${disp}</span>`;
      }
      return c === ch
        ? `<span style="color:var(--text)">${disp}</span>`
        : `<span style="color:#ff6b6b;background:rgba(255,90,90,.14)">${disp}</span>`;
    }).join('');
  }

  input.addEventListener('input', () => {
    if (done) return;
    if (!running) { running = true; t0 = performance.now(); }
    const prev = typed;
    typed = input.value;
    // Count a mistake once, when it is made, not every frame it remains.
    if (typed.length > prev.length) {
      const i = typed.length - 1;
      if (typed[i] !== target[i]) { errors += 1; audio.bad(); }
    }
    const secs = (performance.now() - t0) / 1000;
    const correct = [...typed].filter((c, i) => c === target[i]).length;
    set('[data-time]', secs.toFixed(1));
    set('[data-wpm]', Math.round((correct / 5) / Math.max(secs / 60, 0.001)));
    set('[data-acc]', Math.max(0, Math.round((1 - errors / Math.max(1, typed.length + errors)) * 100)));
    paint();

    if (typed.length >= target.length) {
      done = true;
      const wpm = Math.round((target.length / 5) / (secs / 60));
      const acc = Math.max(0, Math.round((1 - errors / Math.max(1, target.length + errors)) * 100));
      const net = Math.round(wpm * (acc / 100));
      submit(net);
      audio.chime();
      announce(`${net} net words per minute`);
      msg.innerHTML = `<b class="accent">${wpm} wpm gross, ${net} net</b> at ${acc}% accuracy over ${secs.toFixed(1)}s.
        Net is the number that matters: a typo costs the keystroke that made it and the two that fix it,
        so accuracy is worth roughly three times what raw speed is.`;
    }
  });

  wrap.querySelector('[data-new]').addEventListener('click', load);
  load();
  return { destroy() { wrap.remove(); } };
}
