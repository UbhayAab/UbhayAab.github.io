// Entry point. One requestAnimationFrame loop drives everything on this page:
// the shader, the quality probe and whichever game is open. There is never a
// second ticker, because two rAF loops racing each other is the single most
// common way these pages develop frame-pacing bugs.

import { mountFlight } from './flight/index.js';
import { mountTerminal } from './terminal.js';
import { mountArcade } from './arcade.js';
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

/* ---------------------------------------------------------------- the loop */
let flight = null;
let visible = true;
let gameOpen = false;
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
  mountTerminal({ stats, bench, projects: S.projects });
  mountArcade({ stats, bench, subscribe: (fn) => { subs.add(fn); return () => subs.delete(fn); }, audio });

  const stamp = $('#stamp');
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

  // Nav dots follow the section in view.
  const sections = $$('section[id]');
  const dots = new Map($$('.dots a').map((a) => [a.getAttribute('href').slice(1), a]));
  const navIO = new IntersectionObserver((entries) => {
    for (const e of entries) {
      if (!e.isIntersecting) continue;
      dots.forEach((a) => a.removeAttribute('aria-current'));
      dots.get(e.target.id)?.setAttribute('aria-current', 'true');
    }
  }, { threshold: 0.4 });
  sections.forEach((s) => navIO.observe(s));

  // The flight. Scroll position is the mission clock.
  const canvas = $('#gl');
  const telemetry = $('#telemetry');
  flight = mountFlight({
    canvas,
    hud: telemetry,
    motion: () => motion,
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

  const onScroll = () => {
    scrollP = scrollY / Math.max(1, document.body.scrollHeight - innerHeight);
    flight?.setScroll(scrollP);
    if (telemetry) telemetry.classList.toggle('on', scrollP > 0.02 && scrollP < 0.985);
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

  if (new URLSearchParams(location.search).has('debug')) {
    hud = el('div');
    hud.id = 'hud';
    document.body.appendChild(hud);
  }

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
}

if (document.readyState === 'loading') addEventListener('DOMContentLoaded', safeMain);
else safeMain();
