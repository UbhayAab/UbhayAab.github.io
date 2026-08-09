// TOKENIZE: place the boundaries a real tokenizer would place.
//
// Ground truth here is exact and ships in one line, because it is the
// pre-tokenization stage rather than the learned merges. GPT-2, GPT-4 and
// Llama-3 all run a regex split before BPE ever sees the text, and BPE is only
// allowed to merge *within* those pieces. So every boundary this regex
// produces is guaranteed to be a real token boundary. BPE may split further
// inside a piece; it can never merge across one.
//
// That constraint is what makes this honest without shipping a 1.5 MB merges
// table, and the regex is where all the counterintuitive behaviour lives:
// the leading space belongs to the following word, contractions detach, and
// runs of digits and punctuation clump.

const PRE = /'s|'t|'re|'ve|'m|'ll|'d| ?\p{L}+| ?\p{N}+| ?[^\s\p{L}\p{N}]+|\s+(?!\S)|\s+/gu;

const CORPUS = [
  "Tokenizers don't split on words.",
  'const kv = new Map();',
  'fix(rls): tighten invite scope',
  'offloaded 0/43 layers to GPU',
  "I'll re-run the benchmark at 3:30pm.",
  'llama.cpp supports Q4_K_M quantisation.',
  'RTX 5060 Laptop GPU, 8151 MiB',
  'https://github.com/UbhayAab/soop',
  'ubhayvatsaanand@gmail.com',
  "It isn't 100% deterministic, unfortunately.",
  'SELECT * FROM messages WHERE room_id = $1;',
  'per-layer embeddings (PLE)',
];

/** @returns {number[]} character offsets where a token starts, excluding 0 */
function truth(s) {
  const out = [];
  let at = 0;
  for (const m of s.matchAll(PRE)) {
    at = m.index;
    if (at > 0) out.push(at);
  }
  return out;
}

export function create({ host, rng, audio, announce, submit }) {
  let round = 0;
  let score = 0;
  const order = CORPUS.map((s, i) => ({ s, k: rng() * (i + 1) })).sort((a, b) => a.k - b.k).map((x) => x.s);
  let text = '';
  let cuts = new Set();
  let cursor = 0;
  let revealed = false;

  const wrap = document.createElement('div');
  wrap.innerHTML = `
    <p class="mono" style="font-size:12.5px;color:var(--dim);margin:0 0 18px">
      Click the gaps where a new token starts. These are the boundaries the pre-tokenizer regex
      produces before BPE runs, so every one of them is a real token boundary.
      <span class="accent">The space belongs to the word after it.</span> That is the whole trick.
    </p>
    <div data-strip style="font:400 clamp(16px,2.4vw,26px)/2.4 var(--mono);letter-spacing:.02em;
      background:var(--panel-2);border:1px solid var(--line);border-radius:10px;padding:22px 16px;
      overflow-x:auto;white-space:nowrap;user-select:none"></div>
    <div class="row" style="margin-top:20px;align-items:flex-end;gap:26px;flex-wrap:wrap">
      <span class="metric" data-score>0<small>score</small></span>
      <span class="metric" data-round style="color:var(--dim)">1/${CORPUS.length}<small>round</small></span>
      <button class="btn" data-check>check</button>
      <button class="btn" data-next hidden>next</button>
    </div>
    <p class="mono" data-msg style="font-size:12.5px;min-height:4em;margin:16px 0 0"></p>`;
  host.appendChild(wrap);

  const strip = wrap.querySelector('[data-strip]');
  const msg = wrap.querySelector('[data-msg]');
  const btnCheck = wrap.querySelector('[data-check]');
  const btnNext = wrap.querySelector('[data-next]');

  function render() {
    const t = truth(text);
    strip.innerHTML = '';
    for (let i = 0; i < text.length; i += 1) {
      if (i > 0) {
        const gap = document.createElement('span');
        gap.dataset.gap = String(i);
        const marked = cuts.has(i);
        const correct = t.includes(i);
        let colour = 'transparent';
        if (revealed) {
          if (marked && correct) colour = 'var(--good)';
          else if (marked && !correct) colour = '#ff4d4d';
          else if (!marked && correct) colour = 'var(--accent)';
        } else if (marked) colour = 'var(--accent)';
        gap.style.cssText = `display:inline-block;width:4px;height:1.5em;vertical-align:-0.35em;
          background:${colour};border-radius:2px;cursor:pointer;margin:0 -2px;position:relative;z-index:1;
          box-shadow:${i === cursor && !revealed ? '0 0 0 1px var(--dim)' : 'none'}`;
        strip.appendChild(gap);
      }
      const ch = document.createElement('span');
      ch.textContent = text[i] === ' ' ? '·' : text[i];
      ch.style.color = text[i] === ' ' ? 'var(--faint)' : 'var(--text)';
      strip.appendChild(ch);
    }
  }

  function load() {
    text = order[round];
    cuts = new Set();
    cursor = 1;
    revealed = false;
    btnCheck.hidden = false;
    btnNext.hidden = true;
    msg.innerHTML = '';
    wrap.querySelector('[data-round]').firstChild.textContent = `${round + 1}/${CORPUS.length}`;
    render();
  }

  function check() {
    const t = new Set(truth(text));
    let hit = 0, miss = 0, wrong = 0;
    for (const c of cuts) (t.has(c) ? hit += 1 : wrong += 1);
    for (const c of t) if (!cuts.has(c)) miss += 1;
    const gained = Math.max(0, hit * 10 - wrong * 6 - miss * 4);
    score += gained;
    revealed = true;
    render();
    wrap.querySelector('[data-score]').firstChild.textContent = String(score);
    btnCheck.hidden = true;
    btnNext.hidden = false;

    const pieces = [...text.matchAll(PRE)].map((m) => m[0]);
    const shown = pieces.map((p) => `<span style="background:var(--panel-2);border:1px solid var(--line);
      border-radius:4px;padding:2px 5px;margin:2px">${p.replace(/ /g, '·').replace(/</g, '&lt;')}</span>`).join('');

    const notes = [];
    if (miss) notes.push(`${miss} boundary you did not mark (orange)`);
    if (wrong) notes.push(`${wrong} you marked that are not real (red)`);
    msg.innerHTML = `<b class="${gained > 0 ? 'g' : 'a'}" style="color:${gained > 0 ? 'var(--good)' : 'var(--accent)'}">
      +${gained}</b> &nbsp; ${hit} correct${notes.length ? ', ' + notes.join(', ') : ', perfect'}.
      <br><br>${pieces.length} tokens: ${shown}`;
    (gained > 0 ? audio.good : audio.bad)();
    announce(`${hit} correct, score ${score}`);

    if (round === CORPUS.length - 1) {
      submit(score);
      btnNext.textContent = 'again';
    }
  }

  strip.addEventListener('click', (e) => {
    if (revealed) return;
    const g = e.target.closest('[data-gap]');
    if (!g) return;
    const i = Number(g.dataset.gap);
    cuts.has(i) ? cuts.delete(i) : cuts.add(i);
    cursor = i;
    audio.tick();
    render();
  });

  btnCheck.addEventListener('click', check);
  btnNext.addEventListener('click', () => {
    round = (round + 1) % CORPUS.length;
    if (round === 0) score = 0;
    load();
  });

  const onKey = (e) => {
    if (revealed) {
      if (e.key === 'Enter') { e.preventDefault(); btnNext.click(); }
      return;
    }
    if (e.key === 'ArrowLeft') { e.preventDefault(); cursor = Math.max(1, cursor - 1); render(); }
    else if (e.key === 'ArrowRight') { e.preventDefault(); cursor = Math.min(text.length - 1, cursor + 1); render(); }
    else if (e.key === ' ') { e.preventDefault(); cuts.has(cursor) ? cuts.delete(cursor) : cuts.add(cursor); audio.tick(); render(); }
    else if (e.key === 'Enter') { e.preventDefault(); check(); }
  };
  host.addEventListener('keydown', onKey);

  load();
  return { destroy() { host.removeEventListener('keydown', onKey); wrap.remove(); } };
}
