import { createScreenHub, createScreenStore, webStorage } from 'multi-screen';
import { createScreenManager, managerLabelsFr } from 'multi-screen/dockview';
import { createDemoRegistry, presets, transportFromUrl } from './shared';

// The same library as the editor and the control page (synchronised across tabs).
const store = createScreenStore({ storage: webStorage('multi-screen-demo:library') });
await store.ready;
for (const preset of presets) if (!store.has(preset.id)) store.put(preset);

const { transport, label } = transportFromUrl();
document.getElementById('transport')!.textContent = label;
const hub = createScreenHub({ transport, store });

const withSearch = (page: string, params: Record<string, string> = {}) => {
  const url = new URL(page, location.href);
  url.search = location.search;
  for (const [k, v] of Object.entries(params)) url.searchParams.set(k, v);
  return url.toString();
};

createScreenManager(document.getElementById('manager')!, {
  store,
  hub,
  registry: createDemoRegistry(),
  labels: managerLabelsFr,
  locale: 'fr-FR',
  onEdit: (screenId) => location.assign(withSearch('./editor.html', { screen: screenId })),
  shareBaseUrl: new URL('./device.html', location.href).toString(),
});
