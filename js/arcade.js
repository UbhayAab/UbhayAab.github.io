// Arcade shell: registry, lazy loader, and the small shared runtime every game
// gets. Games are dynamically imported on first play, so none of this code
// costs anything until somebody actually presses a card.
//
// Shared rules for every game in here:
//   - seeded RNG, so two people can compare a score on the same seed
//   - keyboard playable, with the controls written in visible text
//   - score announcements throttled to once a second for screen readers
//   - best score in localStorage, never a server

const GAMES = [
  {
    id: 'quant',
    name: 'QUANT',
    tag: 'knapsack, 8 GB cap',
    blurb: 'Assign a quantisation to every layer of a model and fit it under a hard VRAM budget without wrecking quality. Par is a real mixed-precision recipe.',
    controls: 'arrow keys to move and change, enter to submit',
  },
  {
    id: 'tokenize',
    name: 'TOKENIZE',
    tag: 'you versus a BPE tokenizer',
    blurb: 'Split a sentence into tokens the way the tokenizer would. You will be wrong about spaces, and that is the entire lesson.',
    controls: 'click between characters, or arrow keys and space',
  },
  {
    id: 'pagefault',
    name: 'PAGEFAULT',
    tag: 'KV cache, fragmented',
    blurb: 'Pack variable-length attention blocks into fixed pages. Not Tetris: rows never clear, and you lose to fragmentation rather than to height.',
    controls: 'left and right to aim, down to drop, x to evict',
  },
  {
    id: 'bandit',
    name: 'BANDIT',
    tag: 'explore versus exploit',
    blurb: 'Fourteen days, a fixed daily ad budget, twelve keywords with hidden click-through rates. Spend to learn or spend to earn.',
    controls: 'arrow keys to allocate, enter to run the day',
  },
  {
    id: 'scraper',
    name: 'SCRAPER',
    tag: 'ride the rate limit',
    blurb: 'Hold a crawl as close to a hidden token bucket as you dare. Too slow wastes the night, too fast eats a 429 that costs more than it saved. Latency is your only warning.',
    controls: 'up and down for rate, b to back off, r to restart',
  },
];

// mulberry32. Same seed, same game, every time and on every machine.
export function rng(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const el = (tag, cls, html) => {
  const n = document.createElement(tag);
  if (cls) n.className = cls;
  if (html !== undefined) n.innerHTML = html;
  return n;
};

export function mountArcade({ stats, bench, subscribe, audio }) {
  const grid = document.getElementById('arcade-grid');
  const stage = document.getElementById('stage');
  if (!grid || !stage) return;

  let live = null;

  const best = (id) => Number(localStorage.getItem(`best:${id}`) || 0);
  const setBest = (id, v) => {
    if (v > best(id)) { localStorage.setItem(`best:${id}`, String(v)); return true; }
    return false;
  };

  GAMES.forEach((g, i) => {
    const card = el('article', 'card rise');
    card.style.setProperty('--d', `${120 + i * 60}ms`);
    card.innerHTML = `
      <span class="spine"></span>
      <div class="row" style="margin-bottom:14px">
        <span class="mono">${g.tag}</span>
        <span class="mono" data-best>${best(g.id) ? `best ${best(g.id)}` : ''}</span>
      </div>
      <h3>${g.name}</h3>
      <p>${g.blurb}</p>
      <div class="row">
        <button class="btn" data-play="${g.id}">play</button>
        <span class="mono" style="font-size:10.5px">${g.controls}</span>
      </div>`;
    grid.appendChild(card);
  });

  grid.addEventListener('click', async (e) => {
    const btn = e.target.closest('[data-play]');
    if (!btn) return;
    const id = btn.dataset.play;
    audio.blip();
    btn.textContent = 'loading';
    try {
      await launch(id);
    } catch (err) {
      stage.hidden = false;
      stage.innerHTML = `<div class="card" style="margin-top:26px"><h3>${id} failed to load</h3>
        <p class="mono">${String(err && err.message || err)}</p></div>`;
    } finally {
      btn.textContent = 'play';
    }
  });

  // One live region for the whole arcade, throttled. Announcing every score
  // change unthrottled makes a screen reader unusable during a game.
  const liveRegion = el('div');
  liveRegion.setAttribute('aria-live', 'polite');
  liveRegion.setAttribute('role', 'status');
  liveRegion.style.cssText = 'position:absolute;width:1px;height:1px;overflow:hidden;clip:rect(0 0 0 0)';
  document.body.appendChild(liveRegion);
  let lastSaid = 0;
  const announce = (text) => {
    const now = performance.now();
    if (now - lastSaid < 1000) return;
    lastSaid = now;
    liveRegion.textContent = text;
  };

  async function launch(id) {
    const meta = GAMES.find((g) => g.id === id);
    if (live) { live.destroy?.(); live = null; }
    stage.innerHTML = '';
    stage.hidden = false;

    const shell = el('div', 'card');
    shell.style.marginTop = '26px';
    shell.innerHTML = `
      <div class="row" style="margin-bottom:18px">
        <span><b class="mono" style="font-size:15px">${meta.name}</b>
          <span class="mono" style="color:var(--faint);margin-left:10px">${meta.controls}</span></span>
        <button class="btn" data-close>close</button>
      </div>
      <div data-host role="application" aria-label="${meta.name} game" tabindex="0"></div>`;
    stage.appendChild(shell);
    shell.querySelector('[data-close]').addEventListener('click', () => {
      live?.destroy?.(); live = null; stage.hidden = true; stage.innerHTML = '';
    });

    const host = shell.querySelector('[data-host]');
    const mod = await import(`./games/${id}.js`);
    const seed = (Date.now() / 86400000) | 0; // one shared board per day
    live = mod.create({
      host,
      seed,
      rng: rng(seed),
      stats,
      bench,
      audio,
      subscribe,
      announce,
      best: () => best(id),
      submit: (score) => {
        const isBest = setBest(id, score);
        const badge = grid.querySelector(`[data-play="${id}"]`)?.closest('.card')?.querySelector('[data-best]');
        if (badge) badge.textContent = `best ${best(id)}`;
        return isBest;
      },
    });
    host.focus();
    stage.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
  }
}

/** Canvas boilerplate shared by the two canvas games. */
export function makeCanvas(host, w, h) {
  const c = document.createElement('canvas');
  c.style.cssText = `width:100%;max-width:${w}px;aspect-ratio:${w}/${h};display:block;background:var(--panel-2);border-radius:10px;touch-action:none`;
  const dpr = Math.min(devicePixelRatio || 1, 2);
  c.width = w * dpr; c.height = h * dpr;
  host.appendChild(c);
  const ctx = c.getContext('2d');
  ctx.scale(dpr, dpr);
  return { canvas: c, ctx, w, h };
}

export const COLORS = {
  ink: '#06070b', panel: '#0b0d13', panel2: '#101420', line: '#1b2130',
  text: '#edf0f7', dim: '#7c8699', faint: '#3c4457',
  accent: '#ff7a18', accent2: '#4d7cfe', good: '#38d9a9',
};
