# Protocole multi-screen (version 1)

Ce document permet d'écrire une régie ou un appareil dans un autre langage, ou un transport différent. Les messages sont des objets JSON ; sur WebSocket, un message par trame texte.

## Enveloppe

```jsonc
{
  "ms": 1,                 // version du protocole
  "id": "0c3f…",           // unique, sert de référence aux accusés
  "type": "screen/show",
  "from": "hub-1a2b",      // id de l'émetteur (régie ou appareil)
  "to": ["ecran-a", "tag:hall"], // facultatif ; absent = tout le monde
  "ts": 1793462400000,     // horloge de l'émetteur, en ms
  "payload": { }
}
```

Destinataires : un id d'appareil, `tag:<étiquette>`, ou `*`. Une liste vaut l'union. Un transport ne renvoie jamais un message à son émetteur.

## Messages

| Type | Sens | Charge utile | Effet |
| --- | --- | --- | --- |
| `hub/discover` | régie → tous | `{}` | chaque appareil répond par `device/hello` |
| `device/hello` | appareil → tous | `{ device: DeviceInfo, state: DeviceState }` | présence ; envoyé au démarrage, à chaque changement d'état et en battement (15 s par défaut) |
| `device/bye` | appareil → tous | `{}` | départ volontaire ; le relais l'émet aussi à la fermeture d'une connexion identifiée |
| `screen/show` | régie → appareils | `{ screen, navigate?, params? }` | stocke l'écran (version conservée), crée sa route, l'affiche si `navigate` ≠ `false` |
| `screen/patch` | régie → appareils | `{ screenId, patch, version? }` | applique un JSON Merge Patch ; `version` fixe la version résultante |
| `screen/remove` | régie → appareils | `{ screenId }` | supprime l'écran et sa route |
| `route/navigate` | régie → appareils | `{ path, replace? }` | navigation du routeur de l'appareil |
| `theme/set` | régie → appareils | `{ theme: ThemeSpec \| null }` | surcharge de thème ; `null` la retire |
| `display/set` | régie → appareils | `{ display: DisplaySpec \| null, merge? }` | surcharge d'affichage ; `merge` conserve les champs absents |
| `device/identify` | régie → appareils | `{ durationMs? }` | affiche le nom de l'appareil |
| `custom` | régie → appareils | `{ name, data? }` | commande applicative |
| `ack` | appareil → émetteur | `{ ref, ok, error? }` | accusé de toute commande ci-dessus (sauf `hub/discover`) |

`DeviceState` :

```jsonc
{
  "screenId": "accueil",
  "path": "/accueil",
  "screens": [{ "id": "accueil", "version": 3, "hash": "1x9k2a" }],
  "theme": { "base": "light" },          // surcharge active éventuelle
  "display": { "rotation": 90 }          // surcharge active éventuelle
}
```

`hash` est l'empreinte FNV-1a 32 bits (base 36) du JSON canonique (clés triées, `version` et `updatedAt` exclus) de l'écran. Il est facultatif ; sans lui, la régie se fie à la version.

## Règles

- Un appareil ignore les messages dont il n'est pas destinataire, et les siens.
- Toute donnée reçue est validée (`validateScreen`, `validateTheme`, `validateDisplay`) ; un échec produit un `ack` `ok: false` avec le message d'erreur.
- Une commande refusée par `accept` ou `deny` produit `ack` `{ ok: false, error: "refused" }`.
- Une régie considère un appareil hors ligne après `staleAfterMs` (45 s par défaut) sans message.
- Le relais refuse qu'une connexion change d'identité (`from`) après son premier message.

## Évolution

Les ajouts compatibles (nouveaux champs facultatifs, nouveaux types ignorés par les anciens pairs) gardent `ms: 1`. Une rupture incrémentera `ms`, et les pairs ignorent les messages d'une version qu'ils ne connaissent pas.
