// PAGEFAULT: pack variable-length KV cache blocks into fixed-size pages.
//
// This is paged attention, which is the allocation strategy llama.cpp and
// vLLM both use to stop the KV cache from needing one contiguous slab per
// sequence. The failure mode being modelled is fragmentation: you have plenty
// of free memory in total and still cannot serve the next request because none
// of the free space is contiguous inside a page.
//
// Deliberately NOT Tetris. Rows never clear when they fill. You lose when a
// request arrives that cannot be placed, which is the actual thing that
// happens in a real server.

import { makeCanvas, COLORS as C } from '../arcade.js';

const COLS = 8;          // slots per page
const PAGES = 7;         // pages visible
const CELL = 44;
const GAP = 4;
const PAD = 20;
const HEADER = 34;

export function create({ host, rng, audio, announce, submit, subscribe }) {
  const W = PAD * 2 + COLS * CELL + (COLS - 1) * GAP + 96;
  const H = HEADER + PAD * 2 + PAGES * (CELL + GAP);
  const { canvas, ctx, w, h } = makeCanvas(host, W, H);

  // pages[p][slot] = null or a request id
  const pages = Array.from({ length: PAGES }, () => new Array(COLS).fill(null));
  const reqs = new Map();  // id -> {len, page, start, age, colour}
  let nextId = 1;
  let incoming = null;
  let aim = 0;
  let score = 0;
  let served = 0;
  let evictions = 0;
  let over = false;
  let tSince = 0;
  let interval = 2600;

  const info = document.createElement('p');
  info.className = 'mono';
  info.style.cssText = 'font-size:12.5px;color:var(--dim);margin:14px 0 0';
  host.appendChild(info);

  const PALETTE = ['#ff7a18', '#4d7cfe', '#38d9a9', '#c678dd', '#e5c07b', '#56b6c2'];

  const spawn = () => {
    // Length distribution is deliberately awkward: mostly small, occasionally
    // a 5 that will not fit anywhere once the pages are chewed up.
    const r = rng();
    const len = r < 0.42 ? 1 + Math.floor(rng() * 2) : r < 0.8 ? 3 : 4 + Math.floor(rng() * 2);
    incoming = { id: nextId++, len: Math.min(len, COLS), colour: PALETTE[nextId % PALETTE.length] };
    aim = 0;
  };

  const fits = (page, start, len) => {
    if (start < 0 || start + len > COLS) return false;
    for (let i = start; i < start + len; i += 1) if (pages[page][i] !== null) return false;
    return true;
  };

  const anyFit = (len) => {
    for (let p = 0; p < PAGES; p += 1) for (let s = 0; s <= COLS - len; s += 1) if (fits(p, s, len)) return true;
    return false;
  };

  // aim is a flat index over (page, startSlot) pairs that currently fit.
  const slots = () => {
    const out = [];
    if (!incoming) return out;
    for (let p = 0; p < PAGES; p += 1) {
      for (let s = 0; s <= COLS - incoming.len; s += 1) if (fits(p, s, incoming.len)) out.push({ p, s });
    }
    return out;
  };

  function place() {
    const list = slots();
    if (!list.length) return;
    const { p, s } = list[aim % list.length];
    for (let i = s; i < s + incoming.len; i += 1) pages[p][i] = incoming.id;
    reqs.set(incoming.id, { len: incoming.len, page: p, start: s, age: 0, colour: incoming.colour });
    score += incoming.len * 10;
    served += 1;
    audio.tick();
    incoming = null;
    tSince = 0;
    interval = Math.max(900, interval - 45);
    announce(`placed, score ${score}`);
  }

  function evict() {
    // Evicting the oldest request is what a real cache does under pressure. It
    // costs points, which is the whole tension.
    let oldest = null;
    for (const [id, r] of reqs) if (!oldest || r.age > oldest.r.age) oldest = { id, r };
    if (!oldest) return;
    for (let i = oldest.r.start; i < oldest.r.start + oldest.r.len; i += 1) pages[oldest.r.page][i] = null;
    reqs.delete(oldest.id);
    evictions += 1;
    score = Math.max(0, score - 25);
    audio.bad();
  }

  function fail() {
    over = true;
    const free = pages.flat().filter((x) => x === null).length;
    submit(score);
    info.innerHTML = `<span style="color:#ff4d4d">Cannot place a ${incoming.len}-slot request.</span>
      ${free} of ${PAGES * COLS} slots are free and not one run of ${incoming.len} is contiguous.
      That is fragmentation, and it is why paged attention exists.<br>
      Served <b class="accent">${served}</b> requests, evicted ${evictions}, final score <b class="accent">${score}</b>.
      Press <span class="accent">r</span> to restart.`;
    audio.bad();
  }

  function tick(dt) {
    if (over) return;
    tSince += dt;
    for (const r of reqs.values()) r.age += dt;
    if (!incoming && tSince > 380) spawn();
    if (incoming && tSince > interval) {
      if (!anyFit(incoming.len)) { fail(); return; }
      // Auto-place at the first fit if the player stalls, so the clock means
      // something without being instantly lethal.
      place();
    }
    draw();
  }

  function draw() {
    ctx.clearRect(0, 0, w, h);
    ctx.fillStyle = C.panel2;
    ctx.fillRect(0, 0, w, h);

    ctx.font = '11px ui-monospace, Consolas, monospace';
    ctx.fillStyle = C.dim;
    ctx.fillText(`score ${score}`, PAD, 20);
    ctx.fillText(`served ${served}`, PAD + 92, 20);
    ctx.fillText(`evicted ${evictions}`, PAD + 184, 20);

    const list = slots();
    const target = list.length ? list[aim % list.length] : null;

    for (let p = 0; p < PAGES; p += 1) {
      const y = HEADER + PAD + p * (CELL + GAP);
      ctx.fillStyle = C.faint;
      ctx.font = '10px ui-monospace, Consolas, monospace';
      ctx.fillText(`p${p}`, 2, y + CELL / 2 + 3);
      for (let s = 0; s < COLS; s += 1) {
        const x = PAD + s * (CELL + GAP);
        const id = pages[p][s];
        ctx.fillStyle = id === null ? C.panel : (reqs.get(id)?.colour || C.accent);
        ctx.globalAlpha = id === null ? 1 : 0.9;
        ctx.beginPath();
        ctx.roundRect(x, y, CELL, CELL, 6);
        ctx.fill();
        ctx.globalAlpha = 1;
        if (id === null) {
          ctx.strokeStyle = C.line;
          ctx.lineWidth = 1;
          ctx.stroke();
        }
      }
      // ghost of where the incoming block would land
      if (target && target.p === p && incoming) {
        const x = PAD + target.s * (CELL + GAP);
        const wid = incoming.len * CELL + (incoming.len - 1) * GAP;
        ctx.strokeStyle = incoming.colour;
        ctx.lineWidth = 2;
        ctx.setLineDash([5, 4]);
        ctx.beginPath();
        ctx.roundRect(x - 2, y - 2, wid + 4, CELL + 4, 8);
        ctx.stroke();
        ctx.setLineDash([]);
      }
    }

    // incoming request preview
    if (incoming) {
      const bx = PAD + COLS * (CELL + GAP) + 14;
      ctx.fillStyle = C.faint;
      ctx.font = '10px ui-monospace, Consolas, monospace';
      ctx.fillText('next', bx, HEADER + PAD - 6);
      for (let i = 0; i < incoming.len; i += 1) {
        ctx.fillStyle = incoming.colour;
        ctx.beginPath();
        ctx.roundRect(bx, HEADER + PAD + i * 16, 46, 13, 3);
        ctx.fill();
      }
      const pressure = Math.min(1, tSince / interval);
      ctx.fillStyle = C.line;
      ctx.fillRect(bx, h - PAD - 6, 46, 4);
      ctx.fillStyle = pressure > 0.75 ? '#ff4d4d' : C.accent;
      ctx.fillRect(bx, h - PAD - 6, 46 * pressure, 4);
    }
  }

  function restart() {
    pages.forEach((p) => p.fill(null));
    reqs.clear();
    score = 0; served = 0; evictions = 0; over = false; incoming = null; tSince = 0; interval = 2600;
    info.innerHTML = 'Left and right to choose a slot, down to place, <span class="accent">x</span> to evict the oldest block.';
    draw();
  }

  const onKey = (e) => {
    if (e.key === 'r') { e.preventDefault(); restart(); return; }
    if (over) return;
    if (e.key === 'ArrowLeft') { e.preventDefault(); aim = Math.max(0, aim - 1); audio.tick(); draw(); }
    else if (e.key === 'ArrowRight') { e.preventDefault(); aim += 1; audio.tick(); draw(); }
    else if (e.key === 'ArrowDown' || e.key === ' ') { e.preventDefault(); place(); }
    else if (e.key === 'x') { e.preventDefault(); evict(); draw(); }
  };
  host.addEventListener('keydown', onKey);
  canvas.addEventListener('pointerdown', () => { place(); });

  restart();
  // Drives off the page's single rAF ticker rather than starting its own.
  const unsub = subscribe(tick);

  return { destroy() { host.removeEventListener('keydown', onKey); unsub?.(); canvas.remove(); info.remove(); } };
}
