// Measures smoothness while scrolling, which is the thing that actually gets
// felt: not average frame time but how many frames come late.
import { chromium } from 'playwright';
const b = await chromium.launch();
const p = await b.newPage({ viewport: { width: 1280, height: 800 } });
await p.goto('http://127.0.0.1:4199/', { waitUntil: 'domcontentloaded' });
await p.evaluate(() => localStorage.setItem('tier','low'));
await p.reload({ waitUntil: 'load' });
await p.waitForTimeout(3200);
const H = await p.evaluate(() => document.body.scrollHeight - innerHeight);

async function run(label, from, to) {
  await p.evaluate(y => window.scrollTo(0, y), Math.round(H*from));
  await p.waitForTimeout(1200);
  const r = await p.evaluate(([a, z, H]) => new Promise(res => {
    const t = []; let last = performance.now(); let n = 0;
    const N = 150;
    const tick = (now) => {
      t.push(now - last); last = now; n++;
      window.scrollTo(0, Math.round(H * (a + (z - a) * (n / N))));
      if (n < N) requestAnimationFrame(tick);
      else {
        const s = [...t].sort((x, y) => x - y);
        const med = s[Math.floor(s.length/2)];
        res({ p50: med, p95: s[Math.floor(s.length*0.95)], max: s[s.length-1],
              late: t.filter(v => v > med * 2).length });
      }
    };
    requestAnimationFrame(tick);
  }), [from, to, H]);
  console.log(`${label.padEnd(16)} p50 ${r.p50.toFixed(1)}ms  p95 ${r.p95.toFixed(1)}ms  max ${r.max.toFixed(1)}ms  late(>2x median) ${r.late}/150`);
}

await run('ascent', 0.05, 0.22);
await run('staging', 0.22, 0.34);
await run('warp', 0.44, 0.58);
await run('arcade', 0.60, 0.78);
await b.close();
