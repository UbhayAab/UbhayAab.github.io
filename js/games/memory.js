// Memory match, over the language glyphs from the real repository stats, so
// the cards are the same set the rest of the page is about.
export function create({ host, rng, audio, announce, submit, stats }) {
  const langs = (stats?.languages || []).slice(0, 8);
  const faces = langs.length >= 8
    ? langs.map((l) => ({ key: l.name, colour: l.color || '#7c8699', label: l.name.slice(0, 3) }))
    : ['C++', 'JS', 'PY', 'TS', 'SQL', 'CSS', 'GO', 'RS'].map((s, i) => ({
      key: s, colour: ['#f34b7d', '#f1e05a', '#3572A5', '#3178c6', '#336790', '#663399', '#00ADD8', '#dea584'][i], label: s,
    }));

  const deck = [...faces, ...faces]
    .map((f) => ({ f, k: rng() }))
    .sort((a, b) => a.k - b.k)
    .map((x, i) => ({ ...x.f, id: i, up: false, done: false }));

  let first = null;
  let lock = false;
  let moves = 0;
  let matched = 0;
  const started = performance.now();

  const wrap = document.createElement('div');
  wrap.innerHTML = `
    <p class="mono" style="font-size:12.5px;color:var(--dim);margin:0 0 16px">
      Sixteen cards, eight pairs, drawn from the languages in the repositories above.
      Fewer moves is better.</p>
    <div class="row" style="margin-bottom:14px">
      <span class="metric" data-mv>0<small>moves</small></span>
      <span class="metric" data-pr>0<small>of 8 pairs</small></span>
    </div>
    <div data-grid style="display:grid;grid-template-columns:repeat(4,1fr);gap:10px;max-width:460px"></div>
    <p class="mono" data-msg style="font-size:12.5px;min-height:2.6em;margin:14px 0 0"></p>`;
  host.appendChild(wrap);
  const grid = wrap.querySelector('[data-grid]');
  const msg = wrap.querySelector('[data-msg]');

  deck.forEach((card) => {
    const b = document.createElement('button');
    b.dataset.id = String(card.id);
    b.style.cssText = `aspect-ratio:3/4;border-radius:10px;border:1px solid var(--line);
      background:var(--panel-2);color:var(--faint);font:500 15px var(--mono);cursor:pointer;
      transition:background 140ms var(--ease),color 140ms var(--ease),border-color 140ms var(--ease)`;
    b.textContent = '?';
    grid.appendChild(b);
  });

  const paint = () => {
    deck.forEach((c, i) => {
      const b = grid.children[i];
      const face = c.up || c.done;
      b.textContent = face ? c.label : '?';
      b.style.background = face ? c.colour : 'var(--panel-2)';
      b.style.color = face ? '#06070b' : 'var(--faint)';
      b.style.borderColor = c.done ? c.colour : 'var(--line)';
      b.style.opacity = c.done ? 0.55 : 1;
    });
    wrap.querySelector('[data-mv]').firstChild.textContent = moves;
    wrap.querySelector('[data-pr]').firstChild.textContent = matched;
  };

  grid.addEventListener('click', (e) => {
    const b = e.target.closest('[data-id]');
    if (!b || lock) return;
    const card = deck[Number(b.dataset.id)];
    if (card.up || card.done) return;
    card.up = true;
    audio.tick();
    paint();

    if (!first) { first = card; return; }
    moves += 1;
    if (first.key === card.key) {
      first.done = card.done = true;
      first = null;
      matched += 1;
      audio.good();
      paint();
      announce(`${matched} of 8`);
      if (matched === 8) {
        const secs = (performance.now() - started) / 1000;
        // Sixteen cards can be cleared in eight moves with perfect recall.
        const score = Math.max(0, Math.round(1000 - (moves - 8) * 45 - secs * 4));
        submit(score);
        msg.innerHTML = `<b class="accent">Cleared in ${moves} moves</b> and ${secs.toFixed(0)}s.
          Perfect recall is 8. Score ${score}.`;
        audio.chime();
      }
    } else {
      lock = true;
      const a = first;
      first = null;
      setTimeout(() => { a.up = card.up = false; lock = false; paint(); }, 620);
      paint();
    }
  });

  paint();
  return { destroy() { wrap.remove(); } };
}
