# multi-screen

**Compose screens from [dockview](https://dockview.dev) panels, create their routes at runtime, and drive them remotely.**
TypeScript · framework-free (React optional) · MIT

The main documentation is in French ([README](../../README.md)); this page is a condensed English version.

A screen is **JSON data**: a set of dockview panels, a theme and display settings. It can be stored, patched, turned into a link, or **sent to a device** that shows it right away. From a control page you discover connected screens, send them a composition, update it live, change their theme, rotate or lock them.

## Install

```bash
npm install multi-screen dockview
```

| Entry point | Contents | Needs |
| --- | --- | --- |
| `multi-screen` | model, store, runtime router, hub, device, transports, share links, playlists | `history`, `path-to-regexp` |
| `multi-screen/dockview` | rendering, panel registry, themes, display | `dockview` (≥ 4) |
| `multi-screen/react` | `reactPanel`, `ScreenOutletView`, hooks | `react`, `react-dom` |
| `multi-screen/server` | WebSocket relay, `multi-screen-relay` CLI | `ws` or any WebSocket server |

## Device

```ts
import 'dockview/dist/styles/dockview.css';
import { broadcastChannelTransport, createScreenDevice, createScreenRouter, hashRouter } from 'multi-screen';
import { createPanelRegistry, createScreenOutlet, registerBuiltinPanels } from 'multi-screen/dockview';

const registry = registerBuiltinPanels(createPanelRegistry());
const device = createScreenDevice({
  transport: broadcastChannelTransport(),
  router: createScreenRouter({ adapter: hashRouter() }),
  info: { name: 'Lobby', tags: ['lobby'] },
});
createScreenOutlet(document.getElementById('app')!, { registry, router: device.router, device });
```

## Control

```ts
const hub = createScreenHub({ transport: broadcastChannelTransport() });
hub.store.put({
  id: 'welcome',
  route: '/welcome',
  theme: { base: 'abyss' },
  panels: [
    { id: 'title', component: 'ms:text', params: { text: 'Welcome' } },
    { id: 'clock', component: 'ms:clock', position: { referencePanel: 'title', direction: 'below' } },
  ],
});
await hub.show('tag:lobby', 'welcome');                 // stored, routed (/welcome) and shown
await hub.update('welcome', { title: 'Hello' });        // patched live on every device holding it
await hub.setTheme('*', { base: 'light' });
await hub.setDisplay('tag:lobby', { rotation: 90, resolution: { width: 1080, height: 1920 }, hideTabs: true, locked: true });
await hub.navigate('*', '/welcome');
await hub.identify('*');
```

## Key ideas

- **Runtime routes** — `router.addRoute({ path: '/hall/:zone', resolve: ({ zone }) => \`hall-${zone}\` })`, replace by id, remove with the returned function; every stored screen is also reachable at `/screens/:screenId`. Built on `history` (browser, hash, memory); bring your own router through the three-member `RouterAdapter`.
- **Incremental updates** — when only params or titles change, panels are updated in place (`updateParameters`); the layout is rebuilt only when its structure changes.
- **Panels** — plain functions `({ element, params, api }) => ({ update, dispose })`, React components (`reactPanel`), or custom elements (`elementPanel`: Lit, Vue, Svelte, Angular Elements). Built-ins usable without shipping code: `ms:text`, `ms:image`, `ms:iframe`, `ms:clock`, `ms:color`.
- **Two-level theme and display** — the screen carries defaults, each device can receive overrides.
- **Transports** — BroadcastChannel, WebSocket (with relay), postMessage, in-memory, plus `signedTransport` (HMAC-SHA256, replay protection). Any `{ send, subscribe }` object works.
- **Screen editor** — `createScreenEditor(element, { registry, store })`: screen library, a palette of predefined panels dragged onto a dockview canvas to arrange them, an inspector for panel params and screen settings, save with the exact layout. English labels by default, `editorLabelsFr` provided.
- **Screen manager** — `createScreenManager(element, { store, registry?, hub?, onEdit? })`: every created screen as a live thumbnail, search and sort, which devices show it, send to chosen devices, duplicate, share link, JSON import/export, single or bulk delete.
- **Share links** — `createShareUrl(screen, { baseUrl })` puts the whole screen in the URL fragment, compressed.
- **Acknowledgements** — every command resolves with the devices expected, their acks and the silent ones.

See [ARCHITECTURE.md](../ARCHITECTURE.md) (design decisions, including the router choice) and [PROTOCOL.md](../PROTOCOL.md) (wire protocol, to implement devices in other languages) — both in French.
