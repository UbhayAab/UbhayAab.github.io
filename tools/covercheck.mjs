import { chromium } from 'playwright';
const b = await chromium.launch();
const p = await b.newPage({ viewport: { width: 1280, height: 800 } });
await p.goto('http://127.0.0.1:4199/', { waitUntil: 'domcontentloaded' });
await p.evaluate(() => localStorage.setItem('tier','low'));
await p.reload({ waitUntil: 'load' });
await p.waitForTimeout(3000);
await p.evaluate(() => { window.__f = null; });
// expose the flight for inspection
await p.evaluate(() => {
  // boot.js keeps `flight` module-private; read the canvas backing store instead
});
const H = await p.evaluate(() => document.body.scrollHeight - innerHeight);
for (const f of [0.30, 0.55, 0.66, 0.72, 0.80, 0.95]) {
  await p.evaluate(y => window.scrollTo(0, y), Math.round(H*f));
  await p.waitForTimeout(1800);
  const info = await p.evaluate(() => {
    const c = document.getElementById('gl');
    const cover = ['#work-grid','#arcade-grid','#vision-grid','#ventures .grid'].reduce((s, sel) => {
      const n = document.querySelector(sel); if (!n) return s;
      const r = n.getBoundingClientRect();
      const t = Math.max(0, r.top), bo = Math.min(innerHeight, r.bottom);
      return bo > t ? s + (bo - t) / innerHeight : s;
    }, 0);
    return { backing: `${c.width}x${c.height}`, px: c.width*c.height, cover: +cover.toFixed(2) };
  });
  console.log(`doc ${f.toFixed(2)}  backing ${info.backing}  ${(info.px/1e6).toFixed(2)} Mpx  coverage ${info.cover}`);
}
await b.close();
