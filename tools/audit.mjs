// Full audit: every section, both themes, desktop and phone.
import { chromium, devices } from 'playwright';
import { mkdirSync } from 'node:fs';
const SECTIONS = ['hero','who','career','ventures','signal','work','rhythm','vision','arcade','receipts','contact'];
const b = await chromium.launch();
const errs = [];
for (const theme of ['dark','light']) {
  for (const view of ['desk','phone']) {
    const dir = `shots/audit/${theme}-${view}`;
    mkdirSync(dir, { recursive: true });
    const ctx = view === 'phone'
      ? await b.newContext({ ...devices['iPhone 13'] })
      : await b.newContext({ viewport: { width: 1440, height: 900 } });
    const p = await ctx.newPage();
    p.on('pageerror', e => errs.push(`${theme}/${view}: ${e.message}`));
    p.on('console', m => { if (m.type()==='error' && !/favicon|WebGL|GL Driver/i.test(m.text())) errs.push(`${theme}/${view}: ${m.text()}`); });
    await p.goto('http://127.0.0.1:4199/', { waitUntil: 'domcontentloaded' });
    await p.evaluate(t => { localStorage.setItem('theme', t); localStorage.setItem('tier','high'); }, theme);
    await p.reload({ waitUntil: 'load' });
    await p.waitForTimeout(3400);
    // overflow check
    const ow = await p.evaluate(() => [document.documentElement.scrollWidth, innerWidth]);
    if (ow[0] > ow[1] + 1) errs.push(`${theme}/${view}: horizontal overflow ${ow[0]} vs ${ow[1]}`);
    for (const id of SECTIONS) {
      await p.evaluate(s => document.getElementById(s)?.scrollIntoView({block:'start'}), id);
      await p.waitForTimeout(1000);
      await p.screenshot({ path: `${dir}/${id}.png` });
    }
    for (const [name, hash] of [['dossier','#/vision/nuclear'],['consult','#/consult']]) {
      await p.evaluate(h => { location.hash = h; }, hash);
      await p.waitForTimeout(1200);
      await p.screenshot({ path: `${dir}/${name}.png` });
      await p.evaluate(() => { history.replaceState('', '', location.pathname); location.hash=''; });
      await p.waitForTimeout(400);
    }
    await ctx.close();
    process.stdout.write(`${theme}/${view} `);
  }
}
console.log('\n' + (errs.length ? 'ERRORS:\n' + [...new Set(errs)].join('\n') : 'no errors anywhere'));
await b.close();
