#!/usr/bin/env node
/*
 * Rendu du film multi-screen.
 *   node render.cjs cues                 → out/cues.json (repères pour la musique)
 *   node render.cjs stills 1.5,8,14 DIR  → images de contrôle PNG
 *   node render.cjs board                → out/storyboard.png (planche) et out/poster.png
 *   node render.cjs video [fps]          → out/multi-screen-demo.mp4 (avec out/music.wav s'il existe)
 */
const { chromium } = require('playwright');
const { spawn } = require('node:child_process');
const fs = require('node:fs');
const path = require('node:path');

const ROOT = __dirname;
const OUT = path.join(ROOT, 'out');
const URL = 'file://' + path.join(ROOT, 'index.html') + '?capture';
const VIDEO = path.join(OUT, 'multi-screen-demo.mp4');

async function openPage(browser) {
  const ctx = await browser.newContext({ viewport: { width: 1920, height: 1080 }, deviceScaleFactor: 1 });
  const page = await ctx.newPage();
  page.on('pageerror', (e) => { console.error('Erreur page :', e.message); process.exitCode = 1; });
  await page.goto(URL);
  await page.evaluate(() => window.ready);
  return page;
}
const png = async (page, t) => Buffer.from((await page.evaluate((x) => window.frameToPNG(x), t)).split(',')[1], 'base64');

async function board(page) {
  // Planche : neuf images en 3 × 3, légendées, composées dans la page elle-même.
  const url = await page.evaluate(() => {
    const TW = 640, TH = 360, M = 56, G = 28, L = 64;
    const cols = 3, rows = Math.ceil(MS.BOARD.length / cols);
    const big = document.createElement('canvas');
    big.width = M * 2 + cols * TW + (cols - 1) * G; big.height = M * 2 + rows * (TH + L) + (rows - 1) * 8;
    const b = big.getContext('2d');
    b.fillStyle = '#F6F7F9'; b.fillRect(0, 0, big.width, big.height);
    const src = document.getElementById('c'); const ctx = src.getContext('2d');
    MS.BOARD.forEach(([t, label], i) => {
      MS.render(ctx, t);
      const x = M + (i % cols) * (TW + G), y = M + Math.floor(i / cols) * (TH + L + 8);
      b.drawImage(src, x, y, TW, TH);
      b.strokeStyle = '#D9DDE3'; b.lineWidth = 1; b.strokeRect(x + 0.5, y + 0.5, TW - 1, TH - 1);
      const [tc, ...rest] = label.split('  ');
      b.textBaseline = 'middle'; b.fillStyle = '#5D6673'; b.font = '500 20px "IBM Plex Mono"'; b.fillText(tc, x, y + TH + 32);
      b.fillStyle = '#1B1F24'; b.font = '500 22px Inter'; b.fillText(rest.join('  '), x + b.measureText(tc).width + 14, y + TH + 32);
    });
    return big.toDataURL('image/png');
  });
  fs.writeFileSync(path.join(OUT, 'storyboard.png'), Buffer.from(url.split(',')[1], 'base64'));
  fs.writeFileSync(path.join(OUT, 'poster.png'), await png(page, 58));
  console.log('out/storyboard.png · out/poster.png');
}

async function main() {
  const [mode = 'video', arg, dir] = process.argv.slice(2);
  fs.mkdirSync(OUT, { recursive: true });
  const browser = await chromium.launch();
  try {
    if (mode === 'cues') {
      const page = await openPage(browser);
      const data = await page.evaluate(() => ({ duration: MS.DURATION, cues: MS.CUES }));
      fs.writeFileSync(path.join(OUT, 'cues.json'), JSON.stringify(data));
      console.log(`${data.cues.length} repères écrits dans out/cues.json`);
    } else if (mode === 'stills') {
      const page = await openPage(browser);
      const target = dir || path.join(OUT, 'img');
      fs.mkdirSync(target, { recursive: true });
      for (const t of String(arg).split(',').map(Number)) {
        const f = path.join(target, `still-${t.toFixed(2).padStart(5, '0')}.png`);
        fs.writeFileSync(f, await png(page, t)); console.log(f);
      }
    } else if (mode === 'board') {
      await board(await openPage(browser));
    } else {
      const fps = Number(arg || 60); const N = Math.round(fps * 60);
      const music = path.join(OUT, 'music.wav');
      const args = ['-y', '-loglevel', 'error', '-f', 'image2pipe', '-framerate', String(fps), '-c:v', 'png', '-i', '-'];
      if (fs.existsSync(music)) args.push('-i', music, '-c:a', 'aac', '-b:a', '256k', '-shortest');
      args.push('-c:v', 'libx264', '-preset', 'slow', '-crf', '16', '-tune', 'animation', '-pix_fmt', 'yuv420p', '-colorspace', 'bt709', '-color_primaries', 'bt709', '-color_trc', 'bt709', '-movflags', '+faststart', VIDEO);
      const ff = spawn('ffmpeg', args, { stdio: ['pipe', 'inherit', 'inherit'] });
      const workers = Number(process.env.WORKERS || 4); const pages = await Promise.all(Array.from({ length: workers }, () => openPage(browser)));
      const done = new Map(); let next = 0, written = 0; const t0 = Date.now();
      const flush = async () => {
        while (done.has(written)) {
          const buf = done.get(written); done.delete(written);
          if (!ff.stdin.write(buf)) await new Promise((r) => ff.stdin.once('drain', r));
          written++;
          if (written % (fps * 2) === 0) process.stdout.write(`\r${written}/${N} images · ${((Date.now() - t0) / 1000).toFixed(0)} s`);
        }
      };
      let chain = Promise.resolve();
      await Promise.all(pages.map(async (page) => {
        while (true) {
          const i = next++; if (i >= N) break;
          done.set(i, await png(page, i / fps));
          while (done.size > 48 && !done.has(written)) await new Promise((r) => setTimeout(r, 5));
          chain = chain.then(flush); await chain;
        }
      }));
      await chain; ff.stdin.end();
      await new Promise((r, j) => ff.on('close', (c) => (c === 0 ? r() : j(new Error('ffmpeg ' + c)))));
      console.log(`\nVidéo écrite : out/multi-screen-demo.mp4 (${((Date.now() - t0) / 1000).toFixed(0)} s)`);
    }
  } finally { await browser.close(); }
}
main().catch((e) => { console.error(e); process.exit(1); });
