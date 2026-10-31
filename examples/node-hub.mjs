// A hub running in Node: it drives the screens connected to a relay, with no
// browser involved. Typical for a scheduler, a back-office or a CI job.
//
//   npm run build
//   npm run relay                                   # terminal 1
//   open "http://localhost:5173/device.html?relay=ws://localhost:8787"   # npm run dev
//   node examples/node-hub.mjs ws://localhost:8787  # terminal 2
import { createScreenHub, webSocketTransport } from '../dist/core/index.js';

const relay = process.argv[2] ?? 'ws://localhost:8787';
const transport = webSocketTransport({ url: `${relay}/?room=demo` }); // global WebSocket: Node 22+
const hub = createScreenHub({ transport });

hub.store.put({
  id: 'annonce',
  title: 'Annonce',
  route: '/annonce',
  theme: { base: 'dracula' },
  display: { hideTabs: true },
  panels: [
    { id: 'texte', component: 'ms:text', params: { text: 'Envoyé depuis Node', size: '3em' } },
    { id: 'heure', component: 'ms:clock', position: { referencePanel: 'texte', direction: 'below' }, initialHeight: 140 },
  ],
});

await new Promise((resolve) => setTimeout(resolve, 1000)); // let devices answer the discovery
console.log('Écrans :', hub.devices().map((d) => d.info.name ?? d.info.id).join(', ') || 'aucun');
console.log('Envoi :', (await hub.show('*', 'annonce')).acks);

let n = 0;
const timer = setInterval(async () => {
  n++;
  const [result] = await hub.update('annonce', { panels: [{ id: 'texte', component: 'ms:text', params: { text: `Mise à jour n° ${n}`, size: '3em' } }, { id: 'heure', component: 'ms:clock', position: { referencePanel: 'texte', direction: 'below' }, initialHeight: 140 }] });
  console.log(`Mise à jour ${n} :`, result?.acks.length ?? 0, 'écran(s)');
  if (n === 3) {
    clearInterval(timer);
    hub.dispose();
    transport.close();
  }
}, 2000);
