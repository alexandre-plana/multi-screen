import { createScreenHub, createScreenStore, webStorage } from 'multi-screen';
import { createScreenEditor, editorLabelsFr } from 'multi-screen/dockview';
import { createDemoRegistry, presets, transportFromUrl } from './shared';

// Same library as the control page: screens saved here appear there.
const store = createScreenStore({ storage: webStorage('multi-screen-demo:library') });
await store.ready;
for (const preset of presets) if (!store.has(preset.id)) store.put(preset);

const { transport, label } = transportFromUrl();
document.getElementById('transport')!.textContent = label;
const hub = createScreenHub({ transport, store });

const status = (text: string) => {
  const el = document.querySelector<HTMLElement>('.mse-status');
  if (el) el.textContent = text;
};

const editor = createScreenEditor(document.getElementById('editor')!, {
  registry: createDemoRegistry(),
  store,
  labels: editorLabelsFr,
  screenId: new URLSearchParams(location.search).get('screen') ?? undefined,
  actions: [
    {
      label: 'Envoyer à tous les écrans',
      run: async (screen) => {
        const result = await hub.show('*', screen);
        status(`Envoyé à ${result.acks.filter((a) => a.ok).length} écran(s)`);
      },
    },
    {
      label: 'Mettre à jour les écrans',
      run: async (screen) => {
        const results = await hub.sync(screen.id);
        status(`${results.reduce((n, r) => n + r.acks.filter((a) => a.ok).length, 0)} écran(s) mis à jour`);
      },
    },
  ],
});

// Exposed for debugging and end-to-end tests.
(window as unknown as { editor: typeof editor }).editor = editor;
