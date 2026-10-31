// End-to-end check of the demo in a real browser: a control page drives two
// device pages over BroadcastChannel. Run after `npm run build:examples`.
// Usage: node e2e/run.mjs [--screenshots]
import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { extname, join, resolve } from 'node:path';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const { chromium } = require('playwright');
const root = resolve(import.meta.dirname, '../examples/dist');
const shots = process.argv.includes('--screenshots');
const types = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.svg': 'image/svg+xml' };

const server = createServer(async (req, res) => {
  const path = new URL(req.url, 'http://x').pathname;
  try {
    const body = await readFile(join(root, path === '/' ? 'index.html' : path));
    res.writeHead(200, { 'content-type': types[extname(path)] ?? 'application/octet-stream' }).end(body);
  } catch {
    res.writeHead(404).end();
  }
});
await new Promise((r) => server.listen(0, '127.0.0.1', r));
const base = `http://127.0.0.1:${server.address().port}`;

const assert = (ok, message) => {
  if (!ok) throw new Error(`E2E: ${message}`);
  console.log(`  ✓ ${message}`);
};

const browser = await chromium.launch();
try {
  const context = await browser.newContext({ viewport: { width: 1280, height: 760 } });
  const errors = [];
  context.on('weberror', (e) => errors.push(String(e.error())));
  const a = await context.newPage();
  await a.setViewportSize({ width: 960, height: 540 });
  await a.goto(`${base}/device.html?id=ecran-a&name=Hall&tags=hall`);
  const b = await context.newPage();
  await b.setViewportSize({ width: 540, height: 960 });
  await b.goto(`${base}/device.html?id=ecran-b&name=Bureau&tags=bureau`);
  await a.getByText('Hall attend un écran').waitFor();

  const control = await context.newPage();
  await control.goto(`${base}/control.html`);
  await control.locator('#devices .item').nth(1).waitFor();
  assert((await control.locator('#devices .item').count()) === 2, 'the control page discovers both devices');

  // Send the "accueil" screen to the hall tag.
  await control.fill('#tag', 'hall');
  await control.selectOption('#screen', 'accueil');
  await control.click('#send');
  await a.getByText('Bienvenue au salon').waitFor();
  assert(a.url().endsWith('#/accueil'), 'device A routed to the screen route /accueil');
  assert((await b.getByText('Bienvenue au salon').count()) === 0, 'device B was not targeted');

  // Live update: edit the JSON and save.
  const json = JSON.parse(await control.inputValue('#json'));
  json.panels[0].params.text = 'Bienvenue à tous';
  await control.fill('#json', JSON.stringify(json));
  await control.click('#save');
  await a.getByText('Bienvenue à tous').waitFor();
  assert(true, 'saving a screen updates the device showing it, live');

  // Dynamic route with params + display on device B.
  await control.fill('#tag', 'bureau');
  await control.selectOption('#screen', 'mur');
  await control.click('#send');
  await control.fill('#path', '/mur/gauche');
  await control.click('#navigate');
  await b.waitForURL(/#\/mur\/gauche$/);
  assert(await b.locator('[data-component="ms:color"]').count() === 3, 'device B shows the wall through the dynamic route /mur/:position');

  await control.selectOption('#screen', 'ventes');
  await control.click('#send');
  await b.getByText("Chiffre d'affaires").first().waitFor();
  await control.selectOption('#theme', 'light');
  await control.click('#apply-theme');
  await b.locator('.ms-root[data-theme="light"]').waitFor();
  assert(true, 'theme override applied on device B');
  await control.selectOption('#resolution', '1080x1920');
  await control.check('#hideTabs');
  await control.click('#apply-display');
  await b.locator('.ms-root.ms-hide-tabs').waitFor();
  assert((await b.locator('.ms-stage').evaluate((el) => el.style.width)) === '1080px', 'display override: virtual 1080×1920 resolution, tabs hidden');

  // Identify.
  await control.locator('#devices .item', { hasText: 'Hall' }).getByRole('button', { name: 'Identifier' }).click();
  await a.locator('.ms-identify', { hasText: 'Hall' }).waitFor();
  assert(true, 'identify shows the device name');

  // Share link opened on a fresh device.
  await control.selectOption('#screen', 'accueil');
  await context.grantPermissions(['clipboard-read', 'clipboard-write'], { origin: base });
  await control.click('#share');
  await control.getByText('Lien copié').waitFor();
  const link = await control.evaluate(() => navigator.clipboard.readText());
  const c = await context.newPage();
  await c.goto(link.replace('device.html', 'device.html?id=ecran-c&name=Invité'));
  await c.getByText('Bienvenue à tous').waitFor();
  assert(c.url().endsWith('#/accueil'), 'a share link opens the screen without any server');

  if (shots) {
    await control.screenshot({ path: 'docs/assets/control.png' });
    await a.screenshot({ path: 'docs/assets/device-hall.png' });
    await b.screenshot({ path: 'docs/assets/device-portrait.png' });
  }
  assert(errors.length === 0, `no page errors${errors.length ? `: ${errors.join(' | ')}` : ''}`);
  console.log('E2E OK');
} finally {
  await browser.close();
  server.close();
}
