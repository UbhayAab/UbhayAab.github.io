// Entry point. One requestAnimationFrame loop drives everything on this page:
// the shader, the quality probe and whichever game is open. There is never a
// second ticker, because two rAF loops racing each other is the single most
// common way these pages develop frame-pacing bugs.

import { mountFlight } from './flight/index.js';
import { mountTerminal } from './terminal.js';
import { mountArcade } from './arcade.js';
import { mountDossier } from './dossier.js';
import { mountConsult } from './consult.js';
import { audio } from './audio.js';

const S = (window.SITE || {});
const stats = S.stats || {};
const bench = S.bench || null;
const $ = (sel, root = document) => root.querySelector(sel);
const $$ = (sel, root = document) => [...root.querySelectorAll(sel)];
const int = (v) => Number(v || 0).toLocaleString('en-US');
const el = (tag, cls, html) => {
  const n = document.createElement(tag);
  if (cls) n.className = cls;
  if (html !== undefined) n.innerHTML = html;
  return n;
};
const bytes = (v) => {
  const u = ['B', 'KB', 'MB', 'GB'];
  let x = Number(v), i = 0;
  while (x >= 1024 && i < u.length - 1) { x /= 1024; i += 1; }
  return `${x < 10 ? x.toFixed(1) : Math.round(x)} ${u[i]}`;
};
const clamp = (v, lo, hi) => (v < lo ? lo : v > hi ? hi : v);

/* ------------------------------------------------------------------ motion */
// Three states, not a boolean. "Reduced" keeps colour and short fades and
// kills parallax, scrubbing and particles; stripping 200ms fades as well just
// punishes people for having the setting on.
const MOTION = ['full', 'reduced', 'off'];
const prefersReduced = matchMedia('(prefers-reduced-motion: reduce)').matches;
let motion = localStorage.getItem('motion') || (prefersReduced ? 'reduced' : 'full');

function applyMotion() {
  document.documentElement.style.setProperty('--mo', motion === 'full' ? 1 : motion === 'reduced' ? 0.55 : 0.001);
  const btn = $('#motion');
  if (btn) {
    btn.textContent = `motion: ${motion}`;
    btn.setAttribute('aria-pressed', String(motion !== 'full'));
  }
  localStorage.setItem('motion', motion);
}

/* --------------------------------------------------------- theme and warp */
// Theme is a class on <html>, persisted. The dark palette is the default and
// the one everything else on the page was designed against; light is a real
// second palette rather than a filter, so it gets its own token block in CSS.
function applyTheme(next) {
  document.documentElement.classList.toggle('light', next === 'light');
  document.querySelector('meta[name="theme-color"]')?.setAttribute('content', next === 'light' ? '#eef0f6' : '#06070b');
  const btn = document.getElementById('theme');
  if (btn) {
    btn.innerHTML = next === 'light' ? '&#9789;' : '&#9788;';
    btn.setAttribute('aria-label', next === 'light' ? 'Switch to dark theme' : 'Switch to light theme');
  }
  localStorage.setItem('theme', next);
}

// One warp wipe, replayed by removing and re-adding the class. Restarting a
// CSS animation needs a reflow between the two, which is what the offsetWidth
// read is doing; without it a second call inside the same frame does nothing.
function warp() {
  if (motion === 'off') return;
  const w = document.getElementById('warp');
  if (!w) return;
  w.classList.remove('go');
  void w.offsetWidth;
  w.classList.add('go');
}

/* ---------------------------------------------------------------- the loop */
let flight = null;
let visible = true;
let gameOpen = false;
let dossier = null;
let scrollP = 0;
const frames = [];
let tier = localStorage.getItem('tier') || 'high';
let probed = tier !== 'high' || localStorage.getItem('tier') !== null;
const subs = new Set();
let last = performance.now();

function frame(now) {
  requestAnimationFrame(frame);
  const dt = Math.min(64, now - last);
  last = now;

  // The flight runs behind the whole page, so it renders whenever the tab is
  // visible rather than only over the hero.
  //
  // Except while a game is open. Rendering a rocket behind a game nobody is
  // looking at costs a game that feels sluggish, and it measurably starves
  // input handling: with the flight running, clicks inside the arcade took
  // seconds to register.
  if (flight && visible && !gameOpen) flight.render(dt, now);

  // Adaptive tier. Boot optimistically, sample 40 frames, then commit and
  // persist so a repeat visit starts correct instead of flickering down.
  if (!probed && flight) {
    frames.push(dt);
    if (frames.length === 40) {
      const sorted = [...frames].sort((a, b) => a - b);
      const p75 = sorted[Math.floor(sorted.length * 0.75)];
      const next = p75 > 22 ? 'low' : p75 > 13 ? 'mid' : 'high';
      if (next !== tier) { tier = next; flight.setTier(tier); }
      localStorage.setItem('tier', tier);
      probed = true;
    }
  }

  for (const fn of subs) fn(dt, now);
  if (hud) drawHUD(dt);
}

/* --------------------------------------------------------------- rendering */
function fillTicker() {
  const peakTps = bench?.summary?.fastestTps;
  const map = {
    repos: int(stats.repos?.total),
    commits: int(stats.repos?.totalCommits),
    langs: String(stats.languages?.length ?? '-'),
    tps: peakTps ? peakTps.toFixed(1) : '-',
    push: stats.latestCommit?.ago?.replace(' ago', '') || '-',
  };
  $$('[data-k]').forEach((n) => { if (map[n.dataset.k] !== undefined) n.textContent = map[n.dataset.k]; });
}

function fillBench() {
  const tb = $('#bench-rows');
  if (!tb || !bench) return;
  const fastest = bench.summary?.fastestTps || 1;
  for (const r of bench.results) {
    const tr = el('tr');
    const vram = r.gpuFraction === null || r.gpuFraction === undefined
      ? '-' : `${(r.gpuFraction * 100).toFixed(0)}%`;
    tr.innerHTML = `
      <td class="num">${r.model}</td>
      <td>${r.params || '-'}</td>
      <td>${r.quant || '-'}</td>
      <td class="num">${r.sizeGB} GB</td>
      <td${r.gpuFraction === 0 ? ' class="hi"' : ''}>${vram}</td>
      <td class="num hi">${r.genTps ?? 'failed'}<span class="bar" style="--v:${(r.genTps || 0) / fastest}"></span></td>
      <td class="num">${r.promptTps ? r.promptTps.toFixed(0) : '-'}</td>`;
    tb.appendChild(tr);
  }

  const ok = bench.results.filter((r) => r.genTps);
  let inv = null;
  for (const fast of [...ok].sort((a, b) => b.genTps - a.genTps)) {
    const slow = ok.find((r) => r.sizeGB < fast.sizeGB && r.genTps < fast.genTps);
    if (slow) { inv = { fast, slow }; break; }
  }
  const note = $('#bench-note');
  if (!note) return;
  const parts = [];
  if (inv) {
    parts.push(`<b class="accent">${inv.fast.model}</b> is ${(inv.fast.sizeGB - inv.slow.sizeGB).toFixed(1)} GB
      <i>larger</i> on disk than ${inv.slow.model} and generates
      <b class="accent">${(inv.fast.genTps / inv.slow.genTps).toFixed(1)}x faster</b>.
      Bytes on disk are parameters plus embeddings; throughput is set by how many of those
      parameters have to be touched per token. That gap is the entire argument for the
      Gemma 4 per-layer-embedding port.`);
  }
  if (bench.gpuUsed === false && bench.gpu?.present) {
    parts.push(`<br><br><b class="accent">An unplanned result.</b> Every model in this run reported
      <span class="mono">size_vram = 0</span>. The ${bench.gpu.name} is present with
      ${bench.gpu.vramGB} GB and driver ${bench.gpu.driver}, and the runtime logged
      <span class="mono">offloaded 0/43 layers to GPU</span>. These are CPU numbers on a machine
      with a perfectly good GPU in it. Publishing them as GPU numbers would have been the easy
      mistake, so they are labelled as what they are.`);
  }
  note.innerHTML = parts.join('');
}

function fillWork() {
  const grid = $('#work-grid');
  if (!grid) return;
  const feats = (S.projects?.featured) || [];
  feats.forEach((cfg, i) => {
    const r = (stats.topRepos || []).find((x) => x.name === cfg.repo);
    if (!r) return;
    const card = el('article', 'card rise');
    card.style.setProperty('--d', `${120 + i * 70}ms`);
    card.innerHTML = `
      <span class="spine" style="background:${r.languageColor || 'var(--accent)'}"></span>
      <div class="row" style="margin-bottom:14px">
        <span class="mono">${r.name}</span>
        <span class="chip ${r.isPrivate ? 'priv' : 'pub'}">${r.isPrivate ? 'private' : 'public'}</span>
      </div>
      <h3>${cfg.title}</h3>
      <p>${cfg.lines.join(' ')}</p>
      <div class="chips">${cfg.stack.map((s) => `<span class="chip">${s}</span>`).join('')}</div>
      <div class="row" style="align-items:flex-end">
        <span class="metric">${int(r.commits)}<small>commits &middot; ${bytes(r.diskKB * 1024)}</small></span>
        <a class="mono" href="${r.url}" style="color:var(--dim)">open &rarr;</a>
      </div>`;
    grid.appendChild(card);
  });

  // One delegated handler for the whole grid. The rect is read on enter, never
  // inside pointermove, so this cannot thrash layout.
  let rect = null, target = null;
  grid.addEventListener('pointerover', (e) => {
    const c = e.target.closest('.card');
    if (c && c !== target) { target = c; rect = c.getBoundingClientRect(); }
  });
  grid.addEventListener('pointermove', (e) => {
    if (!target || !rect) return;
    target.style.setProperty('--mx', `${e.clientX - rect.left}px`);
    target.style.setProperty('--my', `${e.clientY - rect.top}px`);
  }, { passive: true });
  grid.addEventListener('pointerleave', () => { target = null; rect = null; });
}

function fillHeat() {
  const host = $('#heat');
  const R = stats.rhythm;
  if (!host || !R) return;
  const DAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
  const max = Math.max(1, R.max);

  host.appendChild(el('span', 'lbl', ''));
  for (let h = 0; h < 24; h += 1) host.appendChild(el('span', 'hr', h % 3 === 0 ? String(h).padStart(2, '0') : ''));

  for (let d = 0; d < 7; d += 1) {
    host.appendChild(el('span', 'lbl', DAYS[d]));
    for (let h = 0; h < 24; h += 1) {
      const v = R.cells[d][h];
      const cell = el('i');
      if (v > 0) {
        const t = Math.sqrt(v / max);
        cell.style.background = `color-mix(in oklab, var(--accent) ${(t * 100).toFixed(0)}%, var(--accent-2))`;
        cell.style.opacity = String(0.28 + 0.72 * t);
      }
      cell.title = `${DAYS[d]} ${String(h).padStart(2, '0')}:00 - ${v} commit${v === 1 ? '' : 's'}`;
      host.appendChild(cell);
    }
  }

  const note = $('#rhythm-note');
  if (note) {
    const night = (R.nightShare * 100).toFixed(0);
    note.innerHTML = `${int(R.sampled)} real commit timestamps, bucketed by weekday and hour in
      <span class="mono">${R.tz}</span>. Not a contribution calendar: this shows when work
      actually happens. Busiest slot is <b class="accent">${DAYS[R.peak.weekday]} at
      ${String(R.peak.hour).padStart(2, '0')}:00</b>, and ${night}% of all commits land between
      23:00 and 06:00.`;
  }
}

/* ------------------------------------------------------------------ person */
const P = window.PROFILE || null;

function fillWho() {
  if (!P) return;
  const name = $('#who-name');
  const role = $('#who-role');
  const sum = $('#who-summary');
  if (name) name.textContent = `${P.name}.`;
  if (role) role.innerHTML = `${P.role} &middot; ${P.location}`;
  if (sum) sum.innerHTML = P.summary.map((s) => `<p>${s}</p>`).join('');
}

function fillVentures() {
  const grid = $('#ventures-grid');
  if (!grid || !P) return;
  P.ventures.forEach((v, i) => {
    const c = el('article', 'card rise');
    c.style.setProperty('--d', `${120 + i * 70}ms`);
    c.innerHTML = `
      <span class="spine"></span>
      <div class="row" style="margin-bottom:14px">
        <span class="mono">${v.role}</span>
      </div>
      <h3>${v.title}</h3>
      <p>${v.description}</p>
      <span class="metric">${v.metric}<small>${v.metricLabel}</small></span>`;
    grid.appendChild(c);
  });
}

function fillVision() {
  const grid = $('#vision-grid');
  if (!grid || !P) return;
  // Slugs come from the deep-dive data so a card and its dossier cannot drift.
  const deep = window.VISION || [];
  P.vision.forEach((v, i) => {
    const d = deep[i];
    const c = el('article', 'card rise');
    c.style.setProperty('--d', `${100 + i * 55}ms`);
    c.innerHTML = `
      <span class="spine" style="background:${v.color}"></span>
      <div class="row" style="margin-bottom:12px"><span class="mono">${v.subtitle}</span></div>
      <h3>${v.title}</h3>
      <p>${v.desc}</p>
      ${d ? `<div class="row"><button class="btn" data-vision="${d.slug}">read the thesis</button>
        ${d.sim ? `<span class="mono" style="font-size:10.5px">includes ${d.sim.id}</span>` : ''}</div>` : ''}`;
    grid.appendChild(c);
  });

  const ars = $('#arsenal');
  if (ars) {
    ars.innerHTML = `<div class="grid">${P.arsenal.map((a) => `
      <div class="card" style="padding:20px 22px">
        <div class="row" style="margin-bottom:12px"><span class="mono">${a.category}</span></div>
        <div class="chips">${a.items.map((i) => `<span class="chip">${i}</span>`).join('')}</div>
      </div>`).join('')}</div>`;
  }
}

/**
 * Career, as a horizontal rail.
 *
 * The section is made tall enough that the vertical distance scrolled equals
 * the horizontal distance the track has to travel, so the mapping is 1:1 and
 * the cards move at the speed the wheel says they should.
 */
function mountCareer() {
  const section = $('#career');
  const track = $('#career-track');
  const rail = $('#career-rail');
  if (!section || !track || !P) return null;

  P.experience.forEach((e) => {
    const c = el('article', 'hcard');
    c.innerHTML = `
      <span class="spine"></span>
      <p class="role">${e.role}</p>
      <h3>${e.company}</h3>
      <p class="period">${e.product} &middot; ${e.period}</p>
      <p class="sum">${e.summary}</p>
      <ul>${e.points.map((x) => `<li>${x}</li>`).join('')}</ul>
      <div class="chips">${e.tags.map((t) => `<span class="chip">${t}</span>`).join('')}</div>
      <span class="metric">${e.metric}<small>${e.metricLabel}</small></span>`;
    track.appendChild(c);
  });

  let travel = 0;
  const measure = () => {
    // How far the track has to move for its last card to reach the right edge.
    travel = Math.max(0, track.scrollWidth - innerWidth + 24);
    section.style.height = `${innerHeight + travel}px`;
    section.classList.add('ready');
  };
  measure();
  new ResizeObserver(measure).observe(track);
  addEventListener('resize', measure, { passive: true });

  return {
    /** @returns {number} -1..1 lateral hint for the flight, 0 when inactive */
    update() {
      const r = section.getBoundingClientRect();
      const total = r.height - innerHeight;
      if (total <= 0) return 0;
      const t = clamp(-r.top / total, 0, 1);
      track.style.transform = `translate3d(${-t * travel}px,0,0)`;
      if (rail) rail.style.width = `${(t * 100).toFixed(1)}%`;
      // Active only while the section is actually pinned on screen.
      const live = r.top <= 1 && r.bottom >= innerHeight;
      return live ? t * 2 - 1 : 0;
    },
  };
}

function fillReceipts() {
  const grid = $('#receipts-grid');
  if (!grid) return;
  const items = [
    ['Every image on the profile README', 'Generated by a script in that repo and committed as a file. Nothing is fetched from a third-party image service at read time.',
      'github-readme-stats returns 503 DEPLOYMENT_PAUSED and github-profile-trophy returns 402 right now. Both are embedded in hundreds of thousands of profiles.'],
    ['Commit timestamps', `${int(stats.rhythm?.sampled)} real committedDate values pulled through the GitHub GraphQL API and bucketed with Intl in Asia/Kolkata.`,
      'Day-resolution contribution calendars cannot produce this. The hour axis needs actual commit objects.'],
    ['Model throughput', bench ? `${bench.results.length} models, ${bench.method}` : 'Pending.',
      bench?.gpuUsed === false ? 'Reported as CPU numbers because that is what they are. The GPU was present and unused.' : ''],
    ['This page', 'One hand-rolled WebGL2 fragment shader, no three.js. One rAF loop. No animation library, no smooth-scroll library, no framework.',
      'Add ?debug to the URL for a live frame-time and backing-store readout.'],
  ];
  items.forEach(([h, body, foot], i) => {
    const c = el('article', 'card rise');
    c.style.setProperty('--d', `${120 + i * 60}ms`);
    c.innerHTML = `<h3>${h}</h3><p>${body}</p>${foot ? `<p class="mono" style="font-size:12px;color:var(--faint);margin:0">${foot}</p>` : ''}`;
    grid.appendChild(c);
  });
}

/* -------------------------------------------------------------------- HUD */
let hud = null;
let hudAcc = 0, hudFrames = 0;
function drawHUD(dt) {
  hudAcc += dt; hudFrames += 1;
  if (hudAcc < 500) return;
  const fps = (hudFrames * 1000) / hudAcc;
  const g = flight ? flight.stats() : null;
  hud.innerHTML = `<b>frame</b> ${(hudAcc / hudFrames).toFixed(1)}ms  ${fps.toFixed(0)}fps
<b>tier</b>  ${tier}${probed ? '' : ' (probing)'}
<b>gl</b>    ${g ? g.backing : 'none'}
<b>px</b>    ${g ? (g.pixels / 1e6).toFixed(2) + 'M' : '-'}
<b>phase</b> ${g ? g.phase : '-'}  p=${g ? g.p.toFixed(3) : '-'}
<b>bh</b>    ${g ? g.bhSteps + ' steps' : '-'}
<b>gpu</b>   ${g ? String(g.renderer).slice(0, 26) : '-'}
<b>motion</b>${motion}`;
  hudAcc = 0; hudFrames = 0;
}

/* ------------------------------------------------------------------- init */
function main() {
  // Everything that injects .rise elements must run BEFORE the observer is
  // wired, otherwise those elements are never observed and sit at opacity 0
  // for the life of the page. That is exactly what the arcade grid did.
  fillTicker(); fillBench(); fillWork(); fillHeat(); fillReceipts();
  fillWho(); fillVentures(); fillVision();
  const career = mountCareer();
  mountTerminal({ stats, bench, projects: S.projects });
  mountArcade({ stats, bench, subscribe: (fn) => { subs.add(fn); return () => subs.delete(fn); }, audio });
  // Reading a dossier pauses the flight for the same reason a game does.
  dossier = mountDossier({
    audio,
    subscribe: (fn) => { subs.add(fn); return () => subs.delete(fn); },
    onOpen: () => { gameOpen = true; warp(); },
    onClose: () => { gameOpen = false; },
  });
  mountConsult({
    audio,
    warp,
    onOpen: () => { gameOpen = true; },
    onClose: () => { gameOpen = false; },
  });

  const stamp = $('#stamp');
  const hint = stamp?.parentElement;
  if (hint && !hint.querySelector('.code-hint')) {
    const s = el('span', 'code-hint mono');
    s.style.cssText = 'color:var(--faint);font-size:10.5px';
    s.textContent = 'try typing secret codes';
    hint.appendChild(s);
  }
  if (stamp && stats.generatedAt) {
    stamp.textContent = `data generated ${new Date(stats.generatedAt).toISOString().slice(0, 16).replace('T', ' ')} UTC`;
  }

  // Reveals. The resting state in CSS is visible, so if this never runs the
  // page is still readable rather than a column of invisible sections.
  const io = new IntersectionObserver((entries) => {
    for (const e of entries) {
      if (e.isIntersecting) { e.target.classList.add('in'); io.unobserve(e.target); }
    }
  }, { rootMargin: '0px 0px -8% 0px', threshold: 0.05 });
  $$('.rise').forEach((n) => io.observe(n));

  // Nav dots and the top nav both follow the section in view.
  const sections = $$('section[id]');
  const dots = new Map($$('.dots a').map((a) => [a.getAttribute('href').slice(1), a]));
  const topLinks = new Map($$('#topnav [data-nav]').map((a) => [a.dataset.nav, a]));
  const navIO = new IntersectionObserver((entries) => {
    for (const e of entries) {
      if (!e.isIntersecting) continue;
      dots.forEach((a) => a.removeAttribute('aria-current'));
      dots.get(e.target.id)?.setAttribute('aria-current', 'true');
      topLinks.forEach((a) => a.removeAttribute('aria-current'));
      topLinks.get(e.target.id)?.setAttribute('aria-current', 'true');
    }
  }, { threshold: 0.4 });
  sections.forEach((s) => navIO.observe(s));

  // Top nav: hide going down, show coming back up. The threshold is 6px so a
  // trackpad's inertia jitter cannot flap it.
  const topnav = $('#topnav');
  let lastY = scrollY;
  const navScroll = () => {
    const y = scrollY;
    if (topnav) {
      topnav.classList.toggle('stuck', y > 24);
      if (Math.abs(y - lastY) > 6) {
        topnav.classList.toggle('up', y > lastY && y > 220);
        lastY = y;
      }
    }
  };
  addEventListener('scroll', navScroll, { passive: true });

  // The flight. Scroll position is the mission clock.
  const canvas = $('#gl');
  const telemetry = $('#telemetry');
  flight = mountFlight({
    canvas,
    hud: telemetry,
    motion: () => motion,
    theme: () => (document.documentElement.classList.contains('light') ? 'light' : 'dark'),
  });
  if (flight) {
    new ResizeObserver(() => flight.resize()).observe(canvas);
    // Telemetry appears once the vehicle does, and leaves before the black hole.
    telemetry.classList.add('on');
  } else {
    // No WebGL2: the CSS poster gradient stays and the page reads normally.
    canvas.style.position = 'fixed';
    telemetry?.remove();
  }

  /* ------------------------------------------------ scroll to story time */
  // Raw scroll fraction is the wrong clock for the flight. The arcade went
  // from 5 cards to 29 and swallowed most of the black hole approach with it,
  // because every phase boundary in the director is a hardcoded fraction of a
  // page whose length depends on how much content happens to be in it.
  //
  // This maps document position to story position through the section
  // boundaries themselves: each section owns a fixed slice of the mission, so
  // "the warp fires at the thesis" and "the hole arrives at the arcade" stay
  // true whether a section is one screen tall or five.
  const BEATS = [
    ['hero', 0.00], ['who', 0.11], ['career', 0.20], ['ventures', 0.33],
    ['signal', 0.44], ['work', 0.50], ['rhythm', 0.545], ['vision', 0.575],
    ['arcade', 0.665], ['receipts', 0.82], ['contact', 0.92],
  ];
  let anchors = [];
  // Cached, because reading document.body.scrollHeight inside a scroll handler
  // forces a synchronous layout on every single scroll event, after the style
  // writes the previous frame just made. That is a reflow per event for a
  // number that only changes when the page does.
  let maxScroll = 1;
  function measureAnchors() {
    const max = Math.max(1, document.body.scrollHeight - innerHeight);
    maxScroll = max;
    anchors = BEATS
      .map(([id, story]) => {
        const el = document.getElementById(id);
        return el ? { doc: clamp(el.offsetTop / max, 0, 1), story } : null;
      })
      .filter(Boolean)
      .sort((a, b) => a.doc - b.doc);
    // Both ends have to be pinned or the first and last segments extrapolate.
    if (!anchors.length || anchors[0].doc > 0) anchors.unshift({ doc: 0, story: 0 });
    anchors.push({ doc: 1, story: 1 });
  }
  function storyAt(docP) {
    if (anchors.length < 2) return docP;
    for (let i = 1; i < anchors.length; i += 1) {
      const b = anchors[i];
      if (docP <= b.doc || i === anchors.length - 1) {
        const a = anchors[i - 1];
        const span = Math.max(1e-6, b.doc - a.doc);
        return a.story + ((clamp(docP, a.doc, b.doc) - a.doc) / span) * (b.story - a.story);
      }
    }
    return docP;
  }
  measureAnchors();
  new ResizeObserver(() => measureAnchors()).observe(document.body);

  // How much of the viewport the card grids are covering. Measured from the
  // real rectangles rather than assumed per section, so it stays right when a
  // category filter shortens the arcade or a card wraps.
  const DENSE = ['#work-grid', '#arcade-grid', '#vision-grid', '#ventures .grid'];
  let coverTimer = 0;
  function measureCoverage() {
    let covered = 0;
    for (const sel of DENSE) {
      const n = $(sel);
      if (!n) continue;
      const r = n.getBoundingClientRect();
      const top = Math.max(0, r.top);
      const bottom = Math.min(innerHeight, r.bottom);
      if (bottom > top) covered += (bottom - top) / innerHeight;
    }
    flight?.setCoverage(Math.min(1, covered));
  }

  const onScroll = () => {
    const docP = scrollY / maxScroll;
    scrollP = storyAt(docP);
    flight?.setScroll(scrollP);
    // Horizontal sections slide the vehicle sideways, so the sideways motion
    // of the content and the sideways motion of the rocket are the same event.
    flight?.setLateral(career ? career.update() : 0);
    if (telemetry) telemetry.classList.toggle('on', scrollP > 0.02 && scrollP < 0.985);
    // Throttled: this reads layout, and reading layout inside a scroll handler
    // on every event is its own stutter.
    if (!coverTimer) {
      coverTimer = setTimeout(() => { coverTimer = 0; measureCoverage(); }, 120);
    }
  };
  addEventListener('scroll', onScroll, { passive: true });
  onScroll();

  document.addEventListener('visibilitychange', () => { visible = !document.hidden; });

  // The arcade tells us when a game is up so the flight can stand down.
  addEventListener('arcade:open', () => {
    gameOpen = true;
    $('#telemetry')?.classList.remove('on');
  });
  addEventListener('arcade:close', () => {
    gameOpen = false;
    onScroll();
  });

  // Controls
  $('#motion').addEventListener('click', () => {
    motion = MOTION[(MOTION.indexOf(motion) + 1) % MOTION.length];
    applyMotion();
    audio.blip();
  });
  const sBtn = $('#sound');
  sBtn.addEventListener('click', () => {
    const on = audio.toggle();
    sBtn.textContent = `sound: ${on ? 'on' : 'off'}`;
    sBtn.setAttribute('aria-pressed', String(on));
  });
  applyMotion();

  $('#theme')?.addEventListener('click', () => {
    applyTheme(document.documentElement.classList.contains('light') ? 'dark' : 'light');
    audio.blip();
  });

  /* ------------------------------------------------------- magnetic cursor */
  // Only on a device with a real pointer, and only at full motion. A custom
  // cursor that lags behind the real one is worse than not having one, and on
  // touch there is nothing to attach it to.
  if (matchMedia('(hover: hover) and (pointer: fine)').matches) {
    const cur = el('div');
    cur.id = 'cursor';
    document.body.appendChild(cur);
    // Label by what the thing does, not by what it is.
    const labelFor = (n) => {
      if (n.matches('[data-play]')) return 'PLAY';
      if (n.matches('[data-vision]')) return 'READ';
      if (n.matches('a[href^="#/"], .cta')) return 'OPEN';
      if (n.matches('a[href^="http"]')) return 'VISIT';
      if (n.matches('button, .btn, a')) return 'SELECT';
      return '';
    };
    let tx = innerWidth / 2, ty = innerHeight / 2, cx = tx, cy = ty, snapped = null;
    addEventListener('pointermove', (e) => {
      if (e.pointerType !== 'mouse') return;
      tx = e.clientX; ty = e.clientY;
      cur.classList.add('on');
      const hit = e.target.closest('button, .btn, a, [data-play], [data-vision]');
      if (hit !== snapped) {
        snapped = hit;
        const label = hit ? labelFor(hit) : '';
        cur.classList.toggle('snap', Boolean(label));
        if (label) cur.dataset.label = label;
      }
    }, { passive: true });
    addEventListener('pointerdown', () => cur.style.setProperty('transform', 'scale(.82)'));
    addEventListener('pointerup', () => cur.style.removeProperty('transform'));
    addEventListener('mouseout', (e) => { if (!e.relatedTarget) cur.classList.remove('on'); });
    // Followed with damping on the shared ticker, which is what makes it read
    // as magnetic: it eases toward the centre of whatever it has snapped to.
    subs.add(() => {
      if (snapped) {
        const r = snapped.getBoundingClientRect();
        // Pull a third of the way toward the element centre, so the cursor
        // still tracks the hand but visibly wants the target.
        tx += (r.left + r.width / 2 - tx) * 0.34;
        ty += (r.top + r.height / 2 - ty) * 0.34;
      }
      cx += (tx - cx) * 0.28;
      cy += (ty - cy) * 0.28;
      cur.style.left = `${cx.toFixed(1)}px`;
      cur.style.top = `${cy.toFixed(1)}px`;
    });
  }

  if (new URLSearchParams(location.search).has('debug')) {
    hud = el('div');
    hud.id = 'hud';
    document.body.appendChild(hud);
  }

  // Vision cards open their dossier.
  $('#vision-grid')?.addEventListener('click', (e) => {
    const b = e.target.closest('[data-vision]');
    if (b) dossier?.open(b.dataset.vision);
  });

  /* ------------------------------------------------------------ secret codes */
  // From the design brief: UBHAY rains, POWER bursts, NEXUS launches something.
  const fx = el('canvas');
  fx.id = 'fx';
  fx.hidden = true;
  document.body.appendChild(fx);
  const fxc = fx.getContext('2d');
  let fxKind = null;
  let fxUntil = 0;
  let drops = [];
  let bits = [];

  const startFx = (kind, ms) => {
    fx.width = innerWidth; fx.height = innerHeight;
    fx.hidden = false;
    fxKind = kind;
    fxUntil = performance.now() + ms;
    if (kind === 'matrix') {
      drops = Array.from({ length: Math.floor(innerWidth / 15) }, () => Math.random() * -innerHeight);
    } else {
      bits = Array.from({ length: 220 }, () => ({
        x: innerWidth / 2, y: innerHeight * 0.62,
        vx: (Math.random() - 0.5) * 17, vy: -Math.random() * 15 - 4,
        c: ['#ff7a18', '#4d7cfe', '#38d9a9', '#ec4899', '#f5c542'][Math.floor(Math.random() * 5)],
        r: 2 + Math.random() * 4,
      }));
    }
    audio.chime();
  };

  subs.add((dt, now) => {
    if (!fxKind) return;
    if (now > fxUntil && fxKind !== 'matrix') { fxKind = null; fx.hidden = true; return; }
    if (now > fxUntil) { fxKind = null; fx.hidden = true; return; }
    const s = dt / 16.67;
    if (fxKind === 'matrix') {
      fxc.fillStyle = 'rgba(6,7,11,0.14)';
      fxc.fillRect(0, 0, fx.width, fx.height);
      fxc.font = '15px ui-monospace, monospace';
      drops.forEach((y, i) => {
        fxc.fillStyle = Math.random() < 0.08 ? '#d9ffe9' : '#38d9a9';
        fxc.fillText(String.fromCharCode(0x30a0 + Math.floor(Math.random() * 96)), i * 15, y);
        drops[i] = y > fx.height + Math.random() * 400 ? 0 : y + 17 * s;
      });
    } else {
      fxc.clearRect(0, 0, fx.width, fx.height);
      bits.forEach((b) => {
        b.x += b.vx * s; b.y += b.vy * s; b.vy += 0.42 * s; b.vx *= 0.995;
        fxc.fillStyle = b.c;
        fxc.globalAlpha = Math.max(0, (fxUntil - now) / 2600);
        fxc.beginPath(); fxc.arc(b.x, b.y, b.r, 0, 7); fxc.fill();
      });
      fxc.globalAlpha = 1;
    }
  });

  const CODES = {
    UBHAY: () => startFx('matrix', 6500),
    POWER: () => startFx('confetti', 2600),
    NEXUS: () => {
      const cards = $$('#arcade-grid [data-play]');
      if (!cards.length) return;
      $('#arcade')?.scrollIntoView({ behavior: 'smooth' });
      setTimeout(() => cards[Math.floor(Math.random() * cards.length)].click(), 700);
    },
  };
  let typed = '';
  addEventListener('keydown', (e) => {
    if (e.key.length !== 1 || /^(INPUT|TEXTAREA)$/.test(document.activeElement?.tagName || '')) return;
    typed = (typed + e.key.toUpperCase()).slice(-6);
    for (const code of Object.keys(CODES)) {
      if (typed.endsWith(code)) { typed = ''; CODES[code](); break; }
    }
  });

  // Konami. Flips the whole page into its loud alternate palette.
  const SEQ = ['ArrowUp', 'ArrowUp', 'ArrowDown', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'ArrowLeft', 'ArrowRight', 'b', 'a'];
  let k = 0;
  addEventListener('keydown', (e) => {
    k = (e.key === SEQ[k] || e.key.toLowerCase() === SEQ[k]) ? k + 1 : 0;
    if (k !== SEQ.length) return;
    k = 0;
    document.documentElement.classList.toggle('neon');
    audio.chime();
  });

  requestAnimationFrame(frame);
}

// If anything in here throws, drop the .js class so CSS stops hiding content
// for a scroll reveal that is never going to run. A broken effect should cost
// the effect, not the page.
function safeMain() {
  try {
    main();
  } catch (err) {
    document.documentElement.classList.remove('js');
    console.error('boot failed, falling back to the static document', err);
  }
  dismissBoot();
}

/* ------------------------------------------------------------- boot screen */
// The pre-loader the brief asks for, with one rule: it must never be able to
// trap the page behind it. It is removed when boot finishes, when the window
// load event fires, and unconditionally after 2.6 seconds, whichever is first.
// Any one of those three failing still clears it.
let bootGone = false;
function dismissBoot() {
  if (bootGone) return;
  bootGone = true;
  const b = document.getElementById('boot');
  if (!b) return;
  const bar = b.querySelector('.boot-bar i');
  if (bar) bar.style.width = '100%';
  const log = document.getElementById('boot-log');
  if (log) log.textContent = 'all systems nominal';
  setTimeout(() => {
    b.classList.add('gone');
    setTimeout(() => b.remove(), 460);
  }, 160);
}

// Fill the bar against real milestones rather than a fake timer, so the
// progress means something: stylesheet parsed, module evaluated, WebGL probed.
(() => {
  const bar = document.querySelector('#boot .boot-bar i');
  const log = document.getElementById('boot-log');
  const step = (pct, text) => {
    if (bar) bar.style.width = `${pct}%`;
    if (log) log.textContent = text;
  };
  step(28, 'module loaded');
  const probe = document.createElement('canvas').getContext('webgl2');
  step(62, probe ? 'WebGL2 available' : 'WebGL2 unavailable, using the poster');
  addEventListener('load', dismissBoot, { once: true });
  setTimeout(dismissBoot, 2600);
})();

applyTheme(localStorage.getItem('theme') || 'dark');
if (document.readyState === 'loading') addEventListener('DOMContentLoaded', safeMain);
else safeMain();
