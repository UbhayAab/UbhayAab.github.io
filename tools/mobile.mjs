import { chromium, devices } from 'playwright';
const b = await chromium.launch();
const p = await b.newPage({ ...devices['iPhone 13'] });
const errs = [];
p.on('pageerror', e => errs.push(e.message));
await p.goto('http://127.0.0.1:4199/', { waitUntil: 'load' });
await p.waitForTimeout(3200);
const check = (n,c,d='') => console.log(`${c?'PASS':'FAIL'} ${n}${d?'  '+d:''}`);
check('no horizontal overflow', await p.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1),
  await p.evaluate(() => `${document.documentElement.scrollWidth} vs ${innerWidth}`));
check('cursor absent on touch', await p.locator('#cursor').count() === 0 || !(await p.locator('#cursor').isVisible()));
check('nav links hidden, cta visible', !(await p.locator('#topnav nav').isVisible()) && await p.locator('#topnav .cta').isVisible());
check('telemetry one line', await p.locator('#telemetry').evaluate(n => n.getBoundingClientRect().height < 40),
  await p.locator('#telemetry').evaluate(n => Math.round(n.getBoundingClientRect().height)+'px'));
await p.evaluate(() => document.querySelector('#arcade').scrollIntoView());
await p.waitForTimeout(900);
await p.screenshot({ path: 'shots/v/m-arcade.png' });
await p.evaluate(() => location.hash = '#/consult');
await p.waitForTimeout(1200);
check('consult on mobile', await p.locator('#consult .con-grid .card').first().isVisible());
await p.screenshot({ path: 'shots/v/m-consult.png' });
await p.evaluate(() => location.hash = '#/vision/nuclear');
await p.waitForTimeout(1200);
await p.screenshot({ path: 'shots/v/m-dossier.png' });
check('dossier on mobile', await p.locator('#dossier .dos-title').isVisible());
console.log(errs.length ? 'ERRORS: '+errs.join(' | ') : 'no page errors');
await b.close();
