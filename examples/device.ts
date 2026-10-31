import { createPlaylist, createScreenDevice, createScreenRouter, createScreenStore, decodeScreen, hashRouter, persistentDeviceId, webStorage, type PlaylistItem } from 'multi-screen';
import { createScreenOutlet } from 'multi-screen/dockview';
import { createDemoRegistry, transportFromUrl } from './shared';

const params = new URLSearchParams(location.search);
// Several devices in one browser: `?id=` keeps them apart.
const id = params.get('id') ?? persistentDeviceId();
const name = params.get('name') ?? `Écran ${id.slice(-4)}`;
const tags = (params.get('tags') ?? '').split(',').filter(Boolean);

const store = createScreenStore({ storage: webStorage(`multi-screen-demo:${id}`) });
const router = createScreenRouter({ adapter: hashRouter() });
const { transport } = transportFromUrl();

await store.ready;
const device = createScreenDevice({
  transport,
  store,
  router,
  info: { id, name, tags, kind: 'display', capabilities: ['fullscreen', 'wakeLock'] },
  persistOverrides: `multi-screen-demo:overrides:${id}`,
});
document.title = `${name} · multi-screen`;

// Shared links: #/share/<payload> shows the screen carried by the URL.
router.addRoute({ id: 'share', path: '/share/:payload', priority: 100 });
const openShared = () => {
  const match = router.current;
  if (match?.route.id !== 'share') return;
  decodeScreen(String(match.params.payload))
    .then((screen) => device.show(screen, { navigate: true }))
    .catch((error: Error) => console.warn('Lien de partage invalide :', error.message));
};
router.subscribe((event) => event.type === 'navigate' && openShared());
openShared();

createScreenOutlet(document.getElementById('device')!, {
  registry: createDemoRegistry(),
  router,
  device,
  empty: (el) => {
    el.textContent = `${name} attend un écran…`;
  },
  notFound: (el, match) => {
    if (match?.route.id !== 'share') el.textContent = `Aucun écran pour ${match?.location.pathname ?? 'cette adresse'}`;
  },
  onDisplayError: (feature) => {
    // Fullscreen needs a gesture: the next tap retries it.
    if (feature === 'fullscreen') addEventListener('pointerdown', () => void document.documentElement.requestFullscreen?.().catch(() => undefined), { once: true });
  },
});

// Application command sent by the control page: rotate through screens.
const playlist = createPlaylist({ router, items: [], autoStart: false });
device.subscribe((event) => {
  if (event.type !== 'custom' || event.name !== 'playlist') return;
  const items = Array.isArray(event.data) ? (event.data as PlaylistItem[]).filter((i) => typeof i?.screenId === 'string' && Number(i.durationMs) > 0) : [];
  playlist.setItems(items);
  if (items.length) playlist.play();
  else playlist.pause();
});
