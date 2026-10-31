// Packs the library, installs the tarball in a scratch project and imports
// every public entry point, as a consumer would.
import { execFileSync } from 'node:child_process';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';

const root = resolve(import.meta.dirname, '..');
const dir = mkdtempSync(join(tmpdir(), 'multi-screen-pack-'));
const run = (cmd, args, cwd) => execFileSync(cmd, args, { cwd, stdio: ['ignore', 'pipe', 'inherit'] }).toString();
try {
  const tarball = run('npm', ['pack', '--silent', '--pack-destination', dir], root).trim().split('\n').at(-1);
  writeFileSync(join(dir, 'package.json'), JSON.stringify({ name: 'consumer', private: true, type: 'module' }));
  run('npm', ['install', '--silent', '--no-audit', '--no-fund', join(dir, tarball), `dockview@${process.env.DOCKVIEW_VERSION ?? "8.8.3"}`, 'ws@8'], dir);
  writeFileSync(
    join(dir, 'check.mjs'),
    `
import * as core from 'multi-screen';
import * as server from 'multi-screen/server';
const expect = (ok, what) => { if (!ok) { console.error('missing: ' + what); process.exit(1); } };
for (const name of ['createScreenStore', 'createScreenRouter', 'createScreenHub', 'createScreenDevice', 'webSocketTransport', 'encodeScreen', 'hashRouter'])
  expect(typeof core[name] === 'function', name);
expect(typeof server.createRelay === 'function', 'createRelay');
const router = core.createScreenRouter();
router.addRoute({ path: '/hall/:zone', resolve: (p) => 'hall-' + p.zone });
expect(router.match('/hall/a')?.screenId === 'hall-a', 'router match');
console.log('package OK:', Object.keys(core).length, 'core exports');
`,
  );
  process.stdout.write(run('node', ['check.mjs'], dir));
  for (const entry of ['multi-screen/dockview', 'multi-screen/react']) {
    run('node', ['--input-type=module', '-e', `import.meta.resolve('${entry}')`], dir);
  }
  const files = run('npm', ['pack', '--dry-run', '--json'], root);
  const list = JSON.parse(files)[0].files.map((f) => f.path);
  if (list.some((f) => f.startsWith('src/') || f.startsWith('tests/'))) throw new Error('sources leaked in the package');
  console.log(`tarball OK: ${list.length} files`);
} finally {
  rmSync(dir, { recursive: true, force: true });
}
