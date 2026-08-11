import { chromium } from 'playwright';
const b = await chromium.launch();
async function run(label, killCursor) {
  const p = await b.newPage({ viewport: { width: 1280, height: 900 } });
  await p.goto('http://127.0.0.1:4199/', { waitUntil: 'domcontentloaded' });
  await p.waitForTimeout(2600);
  if (killCursor) await p.evaluate(() => document.getElementById('cursor')?.remove());
  const H = await p.evaluate(() => document.body.scrollHeight - innerHeight);
  const out = {};
  for (const [name, frac] of [['ascent',0.25],['warp',0.63],['black hole',0.90]]) {
    await p.evaluate(y => window.scrollTo(0, y), H*frac);
    await p.waitForTimeout(1400);
    out[name] = await p.evaluate(() => new Promise(res => {
      const t=[]; let last=performance.now(); let n=0;
      const tick=(now)=>{t.push(now-last);last=now;n++;
        if(n<90) requestAnimationFrame(tick);
        else {t.sort((a,b)=>a-b); res(t[45]);}};
      requestAnimationFrame(tick);
    }));
  }
  console.log(label.padEnd(18), Object.entries(out).map(([k,v])=>`${k} ${v.toFixed(1)}ms`).join('  '));
  await p.close();
  return out;
}
const withCur = await run('with cursor', false);
const noCur = await run('cursor removed', true);
console.log('\ndelta (p50 ms, negative = cursor is cheaper):');
for (const k of Object.keys(withCur)) console.log(`  ${k.padEnd(12)} ${(withCur[k]-noCur[k]).toFixed(1)}`);
await b.close();
