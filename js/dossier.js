// The five vision deep-dives, as full-screen dossiers.
//
// Overlays rather than routes on purpose. The flight behind this page is a
// live WebGL context running a simulation; navigating away and back would tear
// it down and rebuild it, which costs a black screen and a re-probe of the
// quality tier every time somebody reads about nuclear power. The hash still
// changes, so each dossier is linkable, shareable and works with the back
// button, which is the part of routing that actually matters here.

const el = (tag, cls, html) => {
  const n = document.createElement(tag);
  if (cls) n.className = cls;
  if (html !== undefined) n.innerHTML = html;
  return n;
};

export function mountDossier({ audio, onOpen, onClose, subscribe } = {}) {
  const themes = window.VISION || [];
  if (!themes.length) return null;

  const root = el('div');
  root.id = 'dossier';
  root.hidden = true;
  root.setAttribute('role', 'dialog');
  root.setAttribute('aria-modal', 'true');
  root.tabIndex = -1;
  document.body.appendChild(root);

  let current = null;
  let liveSim = null;

  const slugOf = () => {
    const m = /^#\/vision\/([a-z-]+)$/.exec(location.hash);
    return m ? m[1] : null;
  };

  function render(theme) {
    root.style.setProperty('--theme', theme.color);
    const idx = themes.indexOf(theme);

    root.innerHTML = `
      <div class="dos-bar">
        <div class="dos-nav">
          ${themes.map((t) => `<button class="btn" data-go="${t.slug}"
            ${t === theme ? 'aria-current="true"' : ''}>${t.title}</button>`).join('')}
        </div>
        <button class="btn" data-close>close</button>
      </div>
      <div class="dos-wrap">
        <p class="dos-eyebrow">${String(idx + 1).padStart(2, '0')} / ${theme.subtitle}</p>
        <h2 class="dos-title">${theme.title}</h2>
        <p class="dos-manifesto">${theme.manifesto}</p>
        <div class="dos-thesis">${theme.thesis.map((t) => `<p>${t}</p>`).join('')}</div>

        <div class="dos-numbers">
          ${theme.numbers.map((n) => `
            <div class="dos-num">
              <b>${n.value}</b>
              <span>${n.label}</span>
              <small>${n.note}</small>
            </div>`).join('')}
        </div>

        <p class="dos-h3">The argument</p>
        <div class="dos-pillars">
          ${theme.pillars.map((p) => `
            <div class="dos-pillar"><h4>${p.title}</h4><p>${p.body}</p></div>`).join('')}
        </div>

        ${theme.sim ? `<div class="dos-sim">
          <div class="row" style="margin-bottom:16px">
            <span class="mono">${theme.sim.label}</span>
            <button class="btn" data-sim="${theme.sim.id}">play</button>
          </div>
          <div data-simhost></div>
        </div>` : ''}

        <p class="dos-closing">${theme.closing}</p>

        <div class="row" style="margin-top:56px;border-top:1px solid var(--line);padding-top:20px">
          <button class="btn" data-go="${themes[(idx - 1 + themes.length) % themes.length].slug}">&larr; previous</button>
          <button class="btn" data-go="${themes[(idx + 1) % themes.length].slug}">next &rarr;</button>
        </div>
      </div>`;
    root.scrollTop = 0;
  }

  function destroySim() {
    liveSim?.destroy?.();
    liveSim = null;
  }

  async function open(slug, { push = true } = {}) {
    const theme = themes.find((t) => t.slug === slug);
    if (!theme) return;
    destroySim();
    current = theme;
    render(theme);
    root.hidden = false;
    // Next frame so the transition has a state to move from.
    requestAnimationFrame(() => root.classList.add('open'));
    document.body.style.overflow = 'hidden';
    root.focus();
    if (push && location.hash !== `#/vision/${slug}`) location.hash = `#/vision/${slug}`;
    onOpen?.(theme);
    audio?.blip?.();
  }

  function close({ push = true } = {}) {
    destroySim();
    current = null;
    root.classList.remove('open');
    document.body.style.overflow = '';
    setTimeout(() => { if (!current) root.hidden = true; }, 260);
    if (push && slugOf()) history.pushState('', '', location.pathname + location.search);
    onClose?.();
  }

  root.addEventListener('click', async (e) => {
    const go = e.target.closest('[data-go]');
    if (go) { open(go.dataset.go); return; }
    if (e.target.closest('[data-close]')) { close(); return; }

    const sim = e.target.closest('[data-sim]');
    if (sim) {
      const host = root.querySelector('[data-simhost]');
      if (!host) return;
      sim.textContent = 'loading';
      try {
        destroySim();
        host.innerHTML = '';
        const holder = el('div');
        holder.tabIndex = 0;
        holder.setAttribute('role', 'application');
        host.appendChild(holder);
        const mod = await import(`./games/${sim.dataset.sim}.js`);
        const { rng } = await import('./arcade.js');
        const seed = (Date.now() / 86400000) | 0;
        liveSim = mod.create({
          host: holder, seed, rng: rng(seed), audio,
          announce: () => {}, best: () => 0, submit: () => false,
          // The real page ticker, not a stub. Anything time-stepped in here
          // (the reactor's decay chain, most obviously) is frozen without it.
          subscribe: subscribe || (() => () => {}),
          stats: window.SITE?.stats, bench: window.SITE?.bench,
        });
        holder.focus();
        sim.textContent = 'restart';
      } catch (err) {
        host.innerHTML = `<p class="mono" style="color:#ff6b6b">${String(err.message || err)}</p>`;
        sim.textContent = 'play';
      }
    }
  });

  addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && !root.hidden) { e.preventDefault(); close(); }
  });

  // Deep links and the back button.
  addEventListener('hashchange', () => {
    const s = slugOf();
    if (s) open(s, { push: false });
    else if (!root.hidden) close({ push: false });
  });
  const initial = slugOf();
  if (initial) open(initial, { push: false });

  return {
    open,
    close,
    isOpen: () => !root.hidden,
  };
}
