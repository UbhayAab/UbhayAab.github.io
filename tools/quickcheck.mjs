import { chromium } from 'playwright';
const b = await chromium.launch();
const p = await b.newPage({ viewport: { width: 1280, height: 900 } });
p.setDefaultTimeout(8000);
const errs = [];
p.on('console', m => { if (m.type() === 'error' && !/favicon|GL Driver|WebGL/i.test(m.text())) errs.push(m.text()); });
p.on('pageerror', e => errs.push('pageerror: ' + e.message));
await p.goto('http://127.0.0.1:4199/', { waitUntil: 'domcontentloaded' });
await p.waitForTimeout(1500);
let fails = 0;
for (const id of ['quant','tokenize','pagefault','bandit','scraper']) {
  const before = errs.length;
  try {
    await p.locator(`[data-play="${id}"]`).click({ timeout: 8000, force: true });
    await p.waitForTimeout(700);
    const box = await p.locator('#stage').boundingBox();
    const ok = box && box.height > 120 && errs.length === before;
    console.log(`${ok ? 'ok  ' : 'FAIL'} ${id.padEnd(11)} stage ${box ? Math.round(box.height) : 0}px`);
    if (!ok) { fails++; errs.slice(before).forEach(e => console.log('     ' + e)); }
    await p.locator('#stage [data-close]').click({ timeout: 5000, force: true });
    await p.waitForTimeout(250);
  } catch (e) { fails++; console.log(`FAIL ${id}: ${String(e.message).split('\n')[0]}`); }
}
await p.keyboard.press('Backquote'); await p.waitForTimeout(400);
const term = await p.locator('#term:not([hidden])').count();
console.log(term ? 'ok   terminal    opens' : 'FAIL terminal'); if (!term) fails++;
await p.keyboard.press('Escape');
for (const k of ['ArrowUp','ArrowUp','ArrowDown','ArrowDown','ArrowLeft','ArrowRight','ArrowLeft','ArrowRight','b','a']) await p.keyboard.press(k);
await p.waitForTimeout(500);
const neon = await p.locator('html.neon').count();
console.log(neon ? 'ok   konami      fires' : 'FAIL konami'); if (!neon) fails++;
console.log(`\n${7 - fails}/7 passed`);
await b.close();
process.exit(fails ? 1 : 0);
