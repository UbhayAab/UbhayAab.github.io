// Arcade shell: registry, lazy loader, and the small shared runtime every game
// gets. Games are dynamically imported on first play, so none of this code
// costs anything until somebody actually presses a card.
//
// Shared rules for every game in here:
//   - seeded RNG, so two people can compare a score on the same seed
//   - keyboard playable, with the controls written in visible text
//   - score announcements throttled to once a second for screen readers
//   - best score in localStorage, never a server

export const CATEGORIES = [
  { id: 'all', label: 'All' },
  { id: 'frontier', label: 'Frontier' },
  { id: 'systems', label: 'Systems' },
  { id: 'puzzle', label: 'Puzzle' },
  { id: 'action', label: 'Action' },
  { id: 'casino', label: 'Casino' },
  { id: 'reflex', label: 'Reflex' },
  { id: 'versus', label: 'Two player' },
];

const GAMES = [
  {
    id: 'reactor',
    name: 'REACTOR',
    cat: 'frontier',
    tag: 'nuclear, xenon poisoning',
    blurb: 'Hold a core critical while xenon-135 builds behind you. Throttle down sharply and the poison keeps growing for hours after the flux that burned it has gone. This is the mechanism that destroyed Chernobyl.',
    controls: 'up and down for rods, enter to scram',
  },
  {
    id: 'farm',
    name: 'FARM',
    cat: 'frontier',
    tag: 'vertical farming, photon budget',
    blurb: 'Six trays, one energy budget. Every crop has a daily light integral it needs and every photon is on the meter. The ranking that wins is value per photon, not value per tray.',
    controls: 'arrows to allocate, enter to harvest',
  },
  {
    id: 'mine',
    name: 'MINE',
    cat: 'frontier',
    tag: 'asteroids, explore or arrive',
    blurb: 'Nine rocks, a delta-v budget, and spectral classes that hint at composition without settling it. Every survey you buy is a transfer you cannot make.',
    controls: 'arrows, s to survey, enter to mine, q to finish',
  },
  {
    id: 'factory',
    name: 'FACTORY',
    cat: 'frontier',
    tag: 'robotics, line balancing',
    blurb: 'Ten robots, six stations. Throughput is set by the slowest station and nothing else, and the tasks that most need help are the dexterous ones that accept it worst.',
    controls: 'arrows to assign, enter to run the shift',
  },
  {
    id: 'quant',
    name: 'QUANT',
    cat: 'systems',
    tag: 'knapsack, 8 GB cap',
    blurb: 'Assign a quantisation to every layer of a model and fit it under a hard VRAM budget without wrecking quality. Par is a real mixed-precision recipe.',
    controls: 'arrow keys to move and change, enter to submit',
  },
  {
    id: 'tokenize',
    name: 'TOKENIZE',
    cat: 'puzzle',
    tag: 'you versus a BPE tokenizer',
    blurb: 'Split a sentence into tokens the way the tokenizer would. You will be wrong about spaces, and that is the entire lesson.',
    controls: 'click between characters, or arrow keys and space',
  },
  {
    id: 'pagefault',
    name: 'PAGEFAULT',
    cat: 'systems',
    tag: 'KV cache, fragmented',
    blurb: 'Pack variable-length attention blocks into fixed pages. Not Tetris: rows never clear, and you lose to fragmentation rather than to height.',
    controls: 'left and right to aim, down to drop, x to evict',
  },
  {
    id: 'bandit',
    name: 'BANDIT',
    cat: 'systems',
    tag: 'explore versus exploit',
    blurb: 'Fourteen days, a fixed daily ad budget, twelve keywords with hidden click-through rates. Spend to learn or spend to earn.',
    controls: 'arrow keys to allocate, enter to run the day',
  },
  {
    id: 'scraper',
    name: 'SCRAPER',
    cat: 'systems',
    tag: 'ride the rate limit',
    blurb: 'Hold a crawl as close to a hidden token bucket as you dare. Too slow wastes the night, too fast eats a 429 that costs more than it saved. Latency is your only warning.',
    controls: 'up and down for rate, b to back off, r to restart',
  },
  {
    id: 'g2048',
    name: '2048',
    cat: 'puzzle',
    tag: 'slide and merge',
    blurb: 'The one everybody has lost an evening to. Seeded daily, so the tile sequence is the same for everyone who plays today.',
    controls: 'arrows or wasd, r to restart',
  },
  {
    id: 'memory',
    name: 'MEMORY',
    cat: 'puzzle',
    tag: 'eight pairs',
    blurb: 'Matching pairs, dealt from the actual language breakdown of the repositories above. Perfect recall clears it in eight moves.',
    controls: 'click a card',
  },
  {
    id: 'snake',
    name: 'SNAKE',
    cat: 'action',
    tag: 'it speeds up',
    blurb: 'Fixed timestep so it runs identically on a 60 Hz panel and a 165 Hz one, which most browser versions of this get wrong.',
    controls: 'arrows or wasd, r to restart',
  },
  {
    id: 'reaction',
    name: 'REACTION',
    cat: 'reflex',
    tag: 'five rounds',
    blurb: 'Simple visual reaction time over five rounds, scored against real population data. Most of your number is nerve conduction, not decision.',
    controls: 'click or space',
  },
  {
    id: 'orbit',
    name: 'RENDEZVOUS',
    cat: 'frontier',
    tag: 'two burns, real mechanics',
    blurb: 'Catch a station on a higher orbit. To catch something ahead of you, you slow down. RK4 on a normalised two-body system, and the ideal Hohmann cost is printed against yours at the end.',
    controls: 'up and down to burn, r to reset',
  },
  {
    id: 'shooter',
    name: 'KESSLER',
    cat: 'action',
    tag: 'every break makes two',
    blurb: 'Waves of debris where breaking a rock produces two smaller, faster rocks. Clearing the wave is what makes the wave harder. That is the actual argument about low orbit, in ninety seconds.',
    controls: 'left and right, space to fire',
  },
  {
    id: 'breakout',
    name: 'BREAKOUT',
    cat: 'action',
    tag: 'the paddle is a steering wheel',
    blurb: 'With the rule the original had and most clones drop: where the ball lands on the paddle sets the angle it leaves at. Without it the game is luck.',
    controls: 'arrows or mouse, space launches',
  },
  {
    id: 'flappy',
    name: 'LANDING BURN',
    cat: 'action',
    tag: 'one button, real propellant',
    blurb: 'A one-button flyer where every tap is a thruster firing and spends propellant. When the tank runs dry, gravity is the only thing left with an opinion.',
    controls: 'space or click to burn',
  },
  {
    id: 'martingale',
    name: 'MARTINGALE',
    cat: 'casino',
    tag: 'the system that always works',
    blurb: 'Double after every loss and you win a unit almost every time, until the once you cannot cover. Charted, so the shape of the ruin is visible rather than argued about.',
    controls: 'buttons, or run 100 automatically',
  },
  {
    id: 'slots',
    name: 'SLOTS',
    cat: 'casino',
    tag: 'RTP computed, not claimed',
    blurb: 'Three reels, twenty stops each. The return to player is calculated by evaluating all 8,000 outcomes at load and shown next to what you actually got.',
    controls: 'spin, or spin 25 at once',
  },
  {
    id: 'blackjack',
    name: 'BLACKJACK',
    cat: 'casino',
    tag: 'with basic strategy on tap',
    blurb: 'Six decks, dealer stands soft 17, 3:2 on naturals. The advisor is a real basic-strategy table and the counter tracks how often you disagree with it.',
    controls: 'deal, hit, stand, double',
  },
  {
    id: 'roulette',
    name: 'ROULETTE',
    cat: 'casino',
    tag: 'every bet prices the same',
    blurb: 'Single-zero wheel. Build any layout you like and the panel computes its expected value from the payout table. It is always minus 2.70%.',
    controls: 'click to bet, shift-click to remove',
  },
  {
    id: 'minesweeper',
    name: 'MINESWEEPER',
    cat: 'puzzle',
    tag: 'first click is always safe',
    blurb: 'With the two fixes 1990 never got: an opening click that cannot lose and a solver that tells you whether a forced move still exists, so you know when you are guessing.',
    controls: 'click to open, right-click to flag',
  },
  {
    id: 'ttt',
    name: 'TIC-TAC-TOE',
    cat: 'puzzle',
    tag: 'against full minimax',
    blurb: 'You cannot win. It will show you the game-theoretic value of every square you could play, which is the whole point of a solved game.',
    controls: 'click a square',
  },
  {
    id: 'typing',
    name: 'SPEED TYPING',
    cat: 'reflex',
    tag: 'net wpm, not gross',
    blurb: 'Lines drawn from this site rather than lorem ipsum. Scored on net words per minute, because a typo costs the keystroke that made it and the two that fix it.',
    controls: 'just type',
  },
  {
    id: 'aim',
    name: 'AIM TRAINER',
    cat: 'reflex',
    tag: 'fits Fitts to your own hand',
    blurb: 'Twenty-two targets of varying size and distance, then a least-squares fit of your own movement time against Fitts’s law. Most people come out above r-squared 0.8.',
    controls: 'click the circles',
  },
  {
    id: 'simon',
    name: 'SIMON',
    cat: 'reflex',
    tag: 'four items, then chunking',
    blurb: 'A growing sequence with real oscillator tones. It watches the gaps between your presses to tell whether you are recalling a list or replaying a rhythm.',
    controls: 'q w a s, or click the pads',
  },
  {
    id: 'duel',
    name: 'REACTION DUEL',
    cat: 'versus',
    tag: 'two people, one keyboard',
    blurb: 'First to five. Anything under 100 ms is scored as a guess, because the signal has not finished arriving yet. No server here, so no lobby that would pretend to be one.',
    controls: 'a versus l, space to arm',
  },
  {
    id: 'pong',
    name: 'PONG',
    cat: 'versus',
    tag: 'or a beatable computer',
    blurb: 'The computer opponent re-aims every 110 ms with a random offset, which is the only reason it can be beaten. A paddle that reads the ball every frame is not a game.',
    controls: 'w s versus up down',
  },
  {
    id: 'typerace',
    name: 'TYPING RACE',
    cat: 'versus',
    tag: 'against your own ghost',
    blurb: 'A keystroke-for-keystroke replay of your fastest clean run, stored locally. Your own best is the only opponent on this page whose numbers are definitely real.',
    controls: 'just type',
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

  // Category filter, as the brief asks for. Cards are hidden rather than
  // rebuilt so their reveal state and best-score badges survive filtering.
  const bar = el('div', 'cat-bar');
  bar.setAttribute('role', 'group');
  bar.setAttribute('aria-label', 'Filter games by category');
  bar.innerHTML = CATEGORIES.map((c, i) => {
    const n = c.id === 'all' ? GAMES.length : GAMES.filter((g) => g.cat === c.id).length;
    return n ? `<button class="btn" data-cat="${c.id}" aria-pressed="${i === 0}">${c.label} <span style="opacity:.55">${n}</span></button>` : '';
  }).join('');
  grid.parentElement.insertBefore(bar, grid);

  GAMES.forEach((g, i) => {
    const card = el('article', 'card rise');
    card.dataset.cat = g.cat;
    card.style.setProperty('--d', `${120 + (i % 6) * 60}ms`);
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

  bar.addEventListener('click', (e) => {
    const b = e.target.closest('[data-cat]');
    if (!b) return;
    const cat = b.dataset.cat;
    [...bar.children].forEach((x) => x.setAttribute('aria-pressed', String(x === b)));
    [...grid.children].forEach((card) => {
      card.hidden = cat !== 'all' && card.dataset.cat !== cat;
    });
    audio.tick();
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
    // Lets the page stand the flight down while a game has focus.
    dispatchEvent(new CustomEvent('arcade:open', { detail: { id } }));

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
      dispatchEvent(new CustomEvent('arcade:close'));
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
