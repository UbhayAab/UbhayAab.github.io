import { chromium } from 'playwright';
const b = await chromium.launch();
const p = await b.newPage({ viewport: { width: 1400, height: 950 } });
const errs = [];
p.on('pageerror', e => errs.push(e.message));
await p.goto('http://127.0.0.1:4199/', { waitUntil: 'load' });
await p.waitForTimeout(3200);
await p.evaluate(() => document.querySelector('#arcade').scrollIntoView());
await p.waitForTimeout(900);
await p.screenshot({ path: 'shots/v/arcade-wall.png' });
// hover one cabinet
const c = p.locator('.cab[data-game="reactor"]');
await c.scrollIntoViewIfNeeded();
await c.hover();
await p.waitForTimeout(600);
await p.screenshot({ path: 'shots/v/arcade-hover.png' });
// open a game
await p.locator('[data-play="reactor"]').click({ force: true });
await p.waitForTimeout(900);
await p.screenshot({ path: 'shots/v/arcade-live.png' });
console.log('arcade height:', await p.evaluate(() => Math.round(document.querySelector('#arcade').offsetHeight)));
console.log('page height:', await p.evaluate(() => document.body.scrollHeight));
console.log(errs.length ? 'ERRORS: '+errs.join(' | ') : 'no page errors');
await b.close();
