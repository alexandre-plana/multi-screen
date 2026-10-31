# Changelog

## 0.1.0 — non publiée

Première version.

- **Cœur sans framework** (`multi-screen`) : modèle `ScreenDefinition` en JSON, `ScreenStore` observable et versionné (persistance enfichable, `webStorage`), JSON Merge Patch, validation des données reçues, liens de partage compressés (`encodeScreen`, `createShareUrl`).
- **Routeur dynamique** : `ScreenRouter` sur le paquet `history` et `path-to-regexp`, routes ajoutées, remplacées et retirées à l'exécution, route générique `/screens/:screenId`, adaptateurs `browserRouter`, `hashRouter`, `memoryRouter` et interface `RouterAdapter` pour tout autre routeur.
- **Partage vers les appareils** : `ScreenHub` (régie) et `ScreenDevice` (écran), protocole versionné avec accusés de réception, ciblage par id, étiquette ou diffusion, mise à jour par patch avec repli sur l'envoi complet, surcharges de thème et d'affichage par appareil, identification, commandes applicatives.
- **Transports** : mémoire, BroadcastChannel, postMessage, WebSocket (reconnexion, file d'attente).
- **Rendu dockview** (`multi-screen/dockview`) : `mountScreen`, `createScreenOutlet`, registre de panneaux sans framework, panneaux intégrés (`ms:text`, `ms:image`, `ms:iframe`, `ms:clock`, `ms:color`), `elementPanel` pour les Web Components, thèmes dockview découverts automatiquement, affichage (résolution virtuelle, rotation, zoom, verrouillage, onglets masqués, curseur, plein écran, maintien de l'écran allumé).
- **React** (`multi-screen/react`) : `reactPanel`, `ScreenOutletView`, `useScreens`, `useScreen`, `useDevices`, `useRouteMatch`, `useDeviceState`.
- **Relais** (`multi-screen/server`) : `createRelay` indépendant du serveur, `attachWebSocketServer` pour `ws`, commande `multi-screen-relay`.
