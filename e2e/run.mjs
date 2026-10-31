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

  // Playlist: device A rotates through the static screens.
  await control.fill('#tag', 'hall');
  await control.fill('#playlist-seconds', '2');
  await control.click('#playlist-start');
  await a.waitForURL(/#\/tableaux\/ventes$/, { timeout: 8000 });
  await control.click('#playlist-stop');
  assert(true, 'a playlist command rotates screens on the device');

  // Editor: create a screen by dropping predefined panels on the canvas.
  const editorPage = await context.newPage();
  await editorPage.setViewportSize({ width: 1280, height: 760 });
  await editorPage.goto(`${base}/editor.html`);
  await editorPage.getByRole('button', { name: '+ Nouvel écran' }).click();
  await editorPage.fill('.mse-title', 'Écran composé');
  const canvas = editorPage.locator('.mse-canvas');
  await editorPage.locator('[data-component="ms:text"]').dragTo(canvas);
  await editorPage.locator('.mse-canvas .dv-groupview').first().waitFor();
  assert((await editorPage.evaluate(() => window.editor.view.api.panels.length)) === 1, 'dragging a palette panel onto the empty canvas adds it');
  const group = editorPage.locator('.mse-canvas .dv-groupview').first();
  const box = await group.boundingBox();
  await editorPage.locator('[data-component="demo:kpi"]').dragTo(group, { targetPosition: { x: box.width - 12, y: box.height / 2 } });
  await editorPage.locator('[data-component="ms:clock"]').dragTo(group, { targetPosition: { x: box.width / 4, y: box.height - 12 } });
  const layout = await editorPage.evaluate(() => ({ panels: window.editor.view.api.panels.length, groups: window.editor.view.api.groups.length }));
  assert(layout.panels === 3 && layout.groups === 3, `dropping on a group edge splits it (${layout.panels} panels, ${layout.groups} groups)`);
  // Edit the text panel's parameters in the inspector.
  await editorPage.locator('.mse-canvas .dv-tab', { hasText: 'Texte' }).click();
  const textField = editorPage.locator('.mse-inspector .mse-field', { hasText: 'text' }).locator('textarea');
  await textField.fill('Composé dans l’éditeur');
  await textField.blur();
  await editorPage.locator('.mse-canvas', { hasText: 'Composé dans l’éditeur' }).waitFor();
  await editorPage.keyboard.press('Control+s');
  await editorPage.locator('.mse-status[data-state="clean"]').waitFor();
  // The control page (another tab) sees the new screen, and sends it to device A.
  await control.locator('#screen option', { hasText: 'Écran composé' }).waitFor({ state: 'attached' });
  assert(true, 'the saved screen appears in the control page library (cross-tab sync)');
  await editorPage.getByRole('button', { name: 'Envoyer à tous les écrans' }).click();
  await a.getByText('Composé dans l’éditeur').waitFor();
  assert((await a.locator('[data-component="demo:kpi"]').count()) === 1, 'the composed screen is shown on the devices');
  if (shots) await editorPage.screenshot({ path: 'docs/assets/editor.png' });

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
