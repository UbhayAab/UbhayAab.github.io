import { chromium } from 'playwright';
const b = await chromium.launch();
const p = await b.newPage({ viewport: { width: 1280, height: 900 } });
await p.goto('http://127.0.0.1:4199/', { waitUntil: 'domcontentloaded' });
await p.waitForTimeout(2500);

async function sample(label, scrollTo) {
  await p.evaluate(y => window.scrollTo(0, y), scrollTo);
  await p.waitForTimeout(1200);
  const r = await p.evaluate(() => new Promise(res => {
    const t = []; let last = performance.now(); let n = 0;
    const tick = (now) => { t.push(now - last); last = now; n++;
      if (n < 90) requestAnimationFrame(tick);
      else { t.sort((a,b)=>a-b); res({ p50: t[45], p75: t[67], p95: t[85], max: t[89] }); } };
    requestAnimationFrame(tick);
  }));
  console.log(`${label.padEnd(22)} p50 ${r.p50.toFixed(1)}ms  p75 ${r.p75.toFixed(1)}ms  p95 ${r.p95.toFixed(1)}ms  max ${r.max.toFixed(1)}ms`);
  return r;
}

const H = await p.evaluate(() => document.body.scrollHeight - innerHeight);
await sample('hero / pad', 0);
await sample('ascent', H * 0.25);
await sample('staging', H * 0.38);
await sample('warp', H * 0.63);
await sample('black hole', H * 0.90);
const tier = await p.evaluate(() => localStorage.getItem('tier'));
console.log('\nquality tier settled at:', tier);
await b.close();
