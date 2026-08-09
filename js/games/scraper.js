// SCRAPER: hold a crawl as close to the rate limit as you dare.
//
// The real problem from the scraping repos, and it is a control problem rather
// than an arcade one. The server has a token bucket you cannot see. Request
// too slowly and the crawl takes all night. Request too quickly and you eat a
// 429, which costs you a mandatory backoff far longer than the time you saved.
//
// The bucket refills at a fixed rate. The only signals you get are the ones a
// real crawler gets: response latency creeping up as you approach the limit,
// and the 429 itself.

import { makeCanvas, COLORS as C } from '../arcade.js';

const W = 720, H = 300;
const DURATION = 60000;     // one minute per run
const BUCKET = 20;          // hidden bucket capacity, in requests
const REFILL = 7;           // requests per second refilled

export function create({ host, rng, audio, announce, submit, subscribe }) {
  let rate = 4;             // requests per second, player controlled
  let bucket = BUCKET;
  let pages = 0;
  let blocked = 0;
  let backoff = 0;
  let elapsed = 0;
  let acc = 0;
  let over = false;
  const latency = [];
  const history = [];

  const { canvas, ctx, w, h } = makeCanvas(host, W, H);
  const info = document.createElement('p');
  info.className = 'mono';
  info.style.cssText = 'font-size:12.5px;color:var(--dim);margin:14px 0 0';
  info.innerHTML = 'Up and down to change request rate. <span class="accent">b</span> to back off voluntarily. '
    + 'The bucket is hidden; latency is your only early warning.';
  host.appendChild(info);

  function tick(dt) {
    if (over) return;
    elapsed += dt;
    if (elapsed >= DURATION) return finish();

    const secs = dt / 1000;
    bucket = Math.min(BUCKET, bucket + REFILL * secs);

    if (backoff > 0) {
      backoff -= dt;
      acc = 0;
    } else {
      acc += rate * secs;
      while (acc >= 1) {
        acc -= 1;
        if (bucket >= 1) {
          bucket -= 1;
          pages += 1;
        } else {
          // 429. The penalty is deliberately brutal relative to the gain,
          // exactly like a real one.
          blocked += 1;
          backoff = 3000;
          bucket = 0;
          audio.bad();
          break;
        }
      }
    }

    // Latency rises as headroom shrinks. This is the tell.
    const head = bucket / BUCKET;
    latency.push(40 + (1 - head) * (1 - head) * 900 + rng() * 30);
    if (latency.length > 120) latency.shift();
    history.push({ rate, head });
    if (history.length > 240) history.shift();

    draw();
  }

  function draw() {
    ctx.clearRect(0, 0, w, h);
    ctx.fillStyle = C.panel2;
    ctx.fillRect(0, 0, w, h);
    ctx.font = '11px ui-monospace, Consolas, monospace';

    const left = Math.max(0, DURATION - elapsed);
    ctx.fillStyle = C.dim;
    ctx.fillText(`pages ${pages}`, 18, 22);
    ctx.fillText(`429s ${blocked}`, 130, 22);
    ctx.fillText(`rate ${rate.toFixed(1)}/s`, 232, 22);
    ctx.fillText(`${(left / 1000).toFixed(0)}s left`, 360, 22);
    if (backoff > 0) {
      ctx.fillStyle = '#ff4d4d';
      ctx.fillText(`BACKING OFF ${(backoff / 1000).toFixed(1)}s`, 470, 22);
    }

    // latency trace, the only honest signal
    const gy = 46, gh = 150;
    ctx.strokeStyle = C.line;
    ctx.beginPath(); ctx.moveTo(18, gy + gh); ctx.lineTo(w - 18, gy + gh); ctx.stroke();
    ctx.fillStyle = C.faint;
    ctx.fillText('response latency', 18, gy - 6);

    ctx.beginPath();
    latency.forEach((v, i) => {
      const x = 18 + (i / 120) * (w - 36);
      const y = gy + gh - Math.min(gh, (v / 1000) * gh);
      i ? ctx.lineTo(x, y) : ctx.moveTo(x, y);
    });
    ctx.strokeStyle = C.accent;
    ctx.lineWidth = 2;
    ctx.stroke();
    ctx.lineWidth = 1;

    // rate control
    const by = gy + gh + 32;
    ctx.fillStyle = C.faint;
    ctx.fillText('your rate', 18, by - 8);
    ctx.fillStyle = C.line;
    ctx.beginPath(); ctx.roundRect(18, by, w - 36, 12, 6); ctx.fill();
    ctx.fillStyle = rate > 9 ? '#ff4d4d' : rate > 6.5 ? C.accent : C.good;
    ctx.beginPath(); ctx.roundRect(18, by, ((w - 36) * Math.min(rate, 14)) / 14, 12, 6); ctx.fill();

    ctx.fillStyle = C.faint;
    ctx.fillText('0', 18, by + 28);
    ctx.fillText('14 req/s', w - 74, by + 28);
  }

  function finish() {
    over = true;
    submit(pages);
    // The optimum is to sit exactly at the refill rate: any faster drains a
    // bucket that never recovers.
    const ideal = Math.floor((DURATION / 1000) * REFILL);
    const pct = Math.round((pages / ideal) * 100);
    info.innerHTML = `<b class="accent">${pages}</b> pages in 60 seconds, ${blocked} rate limits.
      The bucket refilled at <b class="accent">${REFILL} requests per second</b> and held ${BUCKET},
      so the ceiling was about ${ideal} pages. You got <b class="accent">${pct}%</b> of it.
      ${blocked === 0 && pct > 88 ? 'Sitting on the limit without crossing it is the whole skill, and you found it.'
      : blocked > 4 ? 'Each 429 cost three seconds of backoff to save a fraction of a second of waiting. That trade never pays.'
      : 'The trick is that the sustainable rate is the refill rate, not the burst capacity. Bursting only borrows.'}
      <br>Press <span class="accent">r</span> to run again.`;
    (pct > 85 ? audio.good : audio.bad)();
    announce(`finished, ${pages} pages`);
  }

  function restart() {
    rate = 4; bucket = BUCKET; pages = 0; blocked = 0; backoff = 0; elapsed = 0; acc = 0; over = false;
    latency.length = 0; history.length = 0;
    info.innerHTML = 'Up and down to change request rate. <span class="accent">b</span> to back off voluntarily. '
      + 'The bucket is hidden; latency is your only early warning.';
  }

  const onKey = (e) => {
    if (e.key === 'r') { e.preventDefault(); restart(); return; }
    if (over) return;
    if (e.key === 'ArrowUp' || e.key === 'w') { e.preventDefault(); rate = Math.min(14, rate + 0.5); audio.tick(); }
    else if (e.key === 'ArrowDown' || e.key === 's') { e.preventDefault(); rate = Math.max(0, rate - 0.5); audio.tick(); }
    else if (e.key === 'b') { e.preventDefault(); backoff = 1200; audio.tick(); }
  };
  host.addEventListener('keydown', onKey);

  draw();
  const unsub = subscribe(tick);
  return { destroy() { host.removeEventListener('keydown', onKey); unsub?.(); canvas.remove(); info.remove(); } };
}
