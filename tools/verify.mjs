import { chromium } from 'playwright';
import { mkdirSync } from 'node:fs';
mkdirSync('shots/v', { recursive: true });
const b = await chromium.launch();
const p = await b.newPage({ viewport: { width: 1400, height: 900 } });
p.setDefaultTimeout(9000);
const errs = [];
p.on('pageerror', e => errs.push('pageerror: ' + e.message));
p.on('console', m => { if (m.type()==='error' && !/favicon|GL Driver|WebGL/i.test(m.text())) errs.push(m.text()); });
await p.goto('http://127.0.0.1:4199/', { waitUntil: 'domcontentloaded' });
await p.waitForTimeout(2500);

console.log('game cards   :', await p.locator('#arcade-grid [data-play]').count());
console.log('categories   :', await p.locator('.cat-bar [data-cat]').count());
console.log('vision cards :', await p.locator('[data-vision]').count());

// Category filter
await p.locator('.cat-bar [data-cat="frontier"]').click();
await p.waitForTimeout(400);
console.log('frontier shown:', await p.locator('#arcade-grid .card:not([hidden])').count());
await p.locator('.cat-bar [data-cat="all"]').click();

// Every game launches
let fails = 0;
for (const id of ['reactor','farm','mine','factory','g2048','memory','snake','reaction','quant','tokenize','pagefault','bandit','scraper','orbit','shooter','breakout','flappy','martingale','slots','blackjack','roulette','minesweeper','ttt','typing','aim','simon','duel','pong','typerace']) {
  const before = errs.length;
  try {
    await p.locator(`[data-play="${id}"]`).click({ force: true, timeout: 8000 });
    await p.waitForTimeout(650);
    const box = await p.locator('#stage').boundingBox();
    const ok = box && box.height > 100 && errs.length === before;
    console.log(`${ok ? 'ok  ' : 'FAIL'} ${id.padEnd(10)} ${box ? Math.round(box.height) : 0}px`);
    if (!ok) { fails++; errs.slice(before).forEach(e => console.log('     ' + e)); }
    await p.locator('#stage [data-close]').click({ force: true, timeout: 5000 });
    await p.waitForTimeout(200);
  } catch (e) { fails++; console.log(`FAIL ${id}: ${String(e.message).split('\n')[0]}`); }
}

// Dossiers
for (const slug of ['nuclear','farming','space','robotics','media']) {
  await p.goto(`http://127.0.0.1:4199/#/vision/${slug}`, { waitUntil: 'domcontentloaded' });
  await p.waitForTimeout(1300);
  const t = (await p.locator('#dossier .dos-title').textContent().catch(()=>null)) || 'MISSING';
  console.log(`dossier ${slug.padEnd(9)} ${t}`);
  if (t === 'MISSING') fails++;
  await p.screenshot({ path: `shots/v/dos-${slug}.png` });
}
console.log('\n' + (errs.length ? 'ERRORS: ' + [...new Set(errs)].slice(0,4).join(' | ') : 'no console errors'));
console.log(fails ? `${fails} failures` : 'all good');
await b.close();
