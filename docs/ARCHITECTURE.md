# Architecture et décisions

## Vue d'ensemble

```
multi-screen            (aucune dépendance DOM ni framework ; tourne aussi dans Node)
├─ types / validate     ScreenDefinition, ThemeSpec, DisplaySpec, DeviceInfo — JSON pur
├─ store                ScreenStore observable, versionné, persistance enfichable
├─ patch                JSON Merge Patch (RFC 7396), empreinte de contenu
├─ router               ScreenRouter : routes dynamiques au-dessus d'un RouterAdapter
├─ protocol / hub / device   régie ↔ appareils, accusés de réception
├─ transports           mémoire, BroadcastChannel, postMessage, WebSocket
└─ share                écran ⇄ lien (base64url, deflate-raw)

multi-screen/dockview   rendu : ScreenView, outlet, registre de panneaux, thèmes, affichage
multi-screen/react      reactPanel, ScreenOutletView, hooks (useSyncExternalStore)
multi-screen/server     relais WebSocket indépendant du serveur
```

Les couches ne dépendent que vers le bas : le cœur ignore dockview (il décrit la disposition structurellement), dockview ignore React, et le relais ignore tout du modèle d'écran.

## Décision 1 — Le routeur : `history` + `path-to-regexp`

**Besoin.** Des routes créées, remplacées et supprimées *pendant l'exécution*, souvent reçues par le réseau ; une URL par écran pour pouvoir recharger, partager, mettre en favori ; aucun framework imposé.

| Option | Routes au runtime | Indépendant d'un framework | Popularité | Verdict |
| --- | --- | --- | --- | --- |
| **`history` + `path-to-regexp`** | oui (la table de routes est à nous) | oui | `history` : socle de React Router jusqu'à la v6 ; `path-to-regexp` : moteur d'Express | **retenu** |
| React Router | non natif (arbre déclaré, `patchRoutesOnNavigation` limité) | non | très élevée | adaptateur possible |
| TanStack Router | non (arbre typé statiquement) | partiel (`router-core`) | élevée | adaptateur possible |
| Vue Router | oui (`addRoute`) | non | élevée | adaptateur possible |
| Navigo, universal-router, page.js | oui | oui | faible ou en déclin | écarté |
| `URLPattern` natif | — (correspondance seulement) | oui | standard récent | candidat futur pour remplacer `path-to-regexp` |

**Conséquences.**
- `ScreenRouter` ne dépend que de l'interface `RouterAdapter` (`location`, `navigate`, `subscribe`, `createHref?`). Les adaptateurs fournis (`browserRouter`, `hashRouter`, `memoryRouter`) enveloppent `history` ; une application qui a déjà un routeur fournit le sien et multi-screen se loge dans une sous-arborescence (`basePath`).
- La syntaxe des motifs est celle d'Express 5 (`:param`, `*splat`, `{/:optionnel}`), connue de la plupart des développeurs.
- Ordre de correspondance déterministe : `priority`, puis nombre de segments dynamiques, puis ordre d'ajout. Ajouter une route plus précise ne casse pas les autres.

## Décision 2 — `dockview` plutôt que `dockview-core`

Depuis dockview 8, `dockview-core` est déclaré interne. La bibliothèque dépend de `dockview` (pair facultatif, `>=4`) qui le réexporte. Les thèmes sont découverts en parcourant les exports `theme*` : une nouvelle version de dockview apporte ses thèmes sans modification ici. La feuille de style reste importée par l'application (`dockview/dist/styles/dockview.css`), comme le recommande dockview ; multi-screen injecte seulement ses quelques règles propres.

## Décision 3 — Les écrans sont des données

Une `ScreenDefinition` est du JSON : elle traverse un socket, une URL ou un `localStorage` sans adaptation, se compare (`deepEqual`, `contentHash`) et se modifie par patch. Le code des panneaux ne voyage jamais : un appareil n'affiche que des composants qu'il a enregistrés. C'est à la fois une limite (il faut déployer les composants) et une garantie de sécurité. Les panneaux intégrés `ms:*` couvrent les besoins sans code (texte, image, iframe, horloge, couleur).

Deux formes coexistent : `panels` (déclaratif, écrit à la main) et `layout` (sortie exacte de dockview, produite par un éditeur). `layout` l'emporte si les deux sont présents.

## Décision 4 — Mises à jour incrémentales

`ScreenView.render` calcule une clé de structure (panneaux et disposition sans paramètres ni titres). Si elle n'a pas changé, il appelle `updateParameters` et `setTitle` sur les panneaux existants : un graphique alimenté en direct n'est pas recréé à chaque valeur. Sinon la disposition est reconstruite. Un panneau sans méthode `update` est recréé à chaque changement de paramètres, ce qui reste correct.

## Décision 5 — Protocole : versions, empreintes et accusés

- Chaque message porte `ms: 1` (version du protocole) pour partager un canal avec d'autres trafics.
- L'appareil publie pour chaque écran détenu sa version **et** une empreinte FNV-1a du contenu : la régie détecte un appareil qui a divergé même à version égale, et lui renvoie l'écran complet au lieu d'un patch.
- Chaque commande reçoit un `ack` ; la régie résout ses promesses quand tous les appareils attendus (en ligne et ciblés) ont répondu, ou à l'expiration du délai. On sait toujours qui n'a pas reçu.
- Les appareils filtrent eux-mêmes par destinataire ; le relais route aussi par destinataire pour économiser la bande passante, mais reste sans état métier.

## Décision 6 — Thème et affichage à deux niveaux

L'écran porte un thème et un affichage « par défaut » ; chaque appareil peut recevoir une surcharge (`theme/set`, `display/set`) qui prend le dessus, champ par champ pour l'affichage, variables fusionnées pour le thème. On peut ainsi diffuser le même écran sur un mur paysage et une borne portrait.

L'affichage est calculé par une fonction pure (`computeStage`) testée sans DOM : la mise en page dockview reçoit la résolution virtuelle, puis un `transform` CSS ajuste, centre et fait pivoter la scène.

## Points d'extension

| Besoin | Point d'extension |
| --- | --- |
| Autre routeur | `RouterAdapter` |
| Autre canal | `Transport` (`send`, `subscribe`, `close?`, `onOpen?` pour réannoncer à la reconnexion) |
| Persistance serveur, IndexedDB | `ScreenStorage` (`load`, `save`, synchrones ou non) |
| Autre framework de composants | `PanelFactory`, `elementPanel`, `reactPanel` |
| Thème maison | `registerTheme(nom, themeDockview)` ou `variables` |
| Authentification | `accept` / `deny` (appareil), `acceptDevice` (régie), `authorize` (relais) |
| Commandes métier | `hub.command(cible, nom, données)` → évènement `custom` sur l'appareil |
| Options dockview | `dockview: Partial<DockviewOptions>` de `mountScreen` / `createScreenOutlet` |
