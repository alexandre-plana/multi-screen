# Changelog

## 0.1.0 — non publiée

Première version.

- **Cœur sans framework** (`multi-screen`) : modèle `ScreenDefinition` en JSON, `ScreenStore` observable et versionné (persistance enfichable, `webStorage`), JSON Merge Patch, validation des données reçues, liens de partage compressés (`encodeScreen`, `createShareUrl`).
- **Routeur dynamique** : `ScreenRouter` sur le paquet `history` et `path-to-regexp`, routes ajoutées, remplacées et retirées à l'exécution, route générique `/screens/:screenId`, adaptateurs `browserRouter`, `hashRouter`, `memoryRouter` et interface `RouterAdapter` pour tout autre routeur.
- **Partage vers les appareils** : `ScreenHub` (régie) et `ScreenDevice` (écran), protocole versionné avec accusés de réception, ciblage par id, étiquette ou diffusion, mise à jour par patch avec repli sur l'envoi complet, surcharges de thème et d'affichage par appareil, identification, commandes applicatives.
- **Transports** : mémoire, BroadcastChannel, postMessage, WebSocket (reconnexion, file d'attente), `signedTransport` (HMAC-SHA256, anti-rejeu).
- **Playlists** : `createPlaylist` fait défiler des écrans par le routeur.
- **Rendu dockview** (`multi-screen/dockview`) : `mountScreen`, `createScreenOutlet`, registre de panneaux sans framework, panneaux intégrés (`ms:text`, `ms:image`, `ms:iframe`, `ms:clock`, `ms:color`), `elementPanel` pour les Web Components, thèmes dockview découverts automatiquement, affichage (résolution virtuelle, rotation, zoom, verrouillage, onglets masqués, curseur, plein écran, maintien de l'écran allumé).
- **React** (`multi-screen/react`) : `reactPanel`, `ScreenOutletView`, `useScreens`, `useScreen`, `useDevices`, `useRouteMatch`, `useDeviceState`.
- **Robustesse** (relecture de code) : validation des destinataires et des motifs de route reçus, décodage d'URL tolérant, ordre des routes « attrape-tout », chargement du store sans écraser les écritures récentes, limite de taille des liens, liste d'exclusion et option `allow` pour `elementPanel`, identité du relais liée après autorisation, pas de `device/bye` fantôme à la reconnexion, accusés limités aux appareils ciblés, file WebSocket expirée, `onLayoutChange` réservé aux changements de l'utilisateur, vue cohérente après un rendu en échec, verrou d'écran sans fuite.
- **Relais** (`multi-screen/server`) : `createRelay` indépendant du serveur, `attachWebSocketServer` pour `ws`, commande `multi-screen-relay`.
