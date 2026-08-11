// Reaction time, five rounds, reported honestly against real population data.
export function create({ host, rng, audio, announce, submit }) {
  const ROUNDS = 5;
  const times = [];
  let state = 'idle';   // idle | waiting | go | done
  let armedAt = 0;
  let timer = null;

  const wrap = document.createElement('div');
  wrap.innerHTML = `
    <p class="mono" style="font-size:12.5px;color:var(--dim);margin:0 0 16px">
      Five rounds. Click or press space the moment the panel turns. Going early costs you the round.</p>
    <button data-pad style="width:100%;max-width:640px;aspect-ratio:16/7;border-radius:14px;
      border:1px solid var(--line);background:var(--panel-2);color:var(--dim);cursor:pointer;
      font:500 clamp(16px,3vw,26px) var(--mono);transition:background 60ms linear">
      click to start</button>
    <div class="row" style="margin-top:16px;gap:24px;flex-wrap:wrap">
      <span class="metric" data-last>-<small>last ms</small></span>
      <span class="metric" data-avg>-<small>average ms</small></span>
      <span class="metric" data-rd>0<small>of ${ROUNDS}</small></span>
    </div>
    <p class="mono" data-msg style="font-size:12.5px;min-height:3em;margin:14px 0 0"></p>`;
  host.appendChild(wrap);

  const pad = wrap.querySelector('[data-pad]');
  const msg = wrap.querySelector('[data-msg]');
  const set = (sel, v) => { wrap.querySelector(sel).firstChild.textContent = v; };

  function arm() {
    state = 'waiting';
    pad.style.background = 'var(--panel-2)';
    pad.textContent = 'wait';
    pad.style.color = 'var(--faint)';
    // 1.2 to 4.2 s, long enough that anticipation does not pay.
    timer = setTimeout(() => {
      state = 'go';
      armedAt = performance.now();
      pad.style.background = '#38d9a9';
      pad.style.color = '#04140f';
      pad.textContent = 'NOW';
      audio.blip();
    }, 1200 + rng() * 3000);
  }

  function hit() {
    if (state === 'idle' || state === 'done') {
      times.length = 0;
      set('[data-last]', '-'); set('[data-avg]', '-'); set('[data-rd]', 0);
      msg.textContent = '';
      arm();
      return;
    }
    if (state === 'waiting') {
      clearTimeout(timer);
      state = 'idle';
      pad.style.background = '#ff4d4d';
      pad.style.color = '#1a0505';
      pad.textContent = 'too early';
      msg.innerHTML = 'Jumped the gun. Click to try that round again.';
      audio.bad();
      return;
    }
    if (state === 'go') {
      const ms = performance.now() - armedAt;
      times.push(ms);
      set('[data-last]', Math.round(ms));
      set('[data-avg]', Math.round(times.reduce((a, b) => a + b, 0) / times.length));
      set('[data-rd]', times.length);
      announce(`${Math.round(ms)} milliseconds`);
      audio.tick();
      if (times.length >= ROUNDS) {
        state = 'done';
        const avg = times.reduce((a, b) => a + b, 0) / times.length;
        // Lower is better, so score inverts. 200 ms is a good human number.
        submit(Math.max(0, Math.round(600 - avg)));
        pad.style.background = 'var(--panel-2)';
        pad.style.color = 'var(--dim)';
        pad.textContent = 'again';
        msg.innerHTML = `<b class="accent">${Math.round(avg)} ms average.</b>
          Median simple visual reaction time in adults sits around 250 ms, and roughly
          80 to 100 ms of any score is signal transport rather than decision: retina to cortex
          to muscle. Nobody is beating physics, only the part in between.`;
        audio.chime();
        return;
      }
      state = 'idle';
      pad.style.background = 'var(--panel-2)';
      pad.style.color = 'var(--dim)';
      pad.textContent = 'click for next';
    }
  }

  pad.addEventListener('click', hit);
  const onKey = (e) => { if (e.key === ' ') { e.preventDefault(); hit(); } };
  host.addEventListener('keydown', onKey);

  return {
    destroy() { clearTimeout(timer); host.removeEventListener('keydown', onKey); wrap.remove(); },
  };
}
