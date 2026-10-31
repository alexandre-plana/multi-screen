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

`hash` est l'empreinte de l'écran, `version` et `updatedAt` exclus. Elle est définie précisément pour pouvoir être recalculée dans un autre langage :

1. JSON canonique : clés d'objet triées par ordre des unités de code, valeurs `undefined` omises, aucun espace, chaînes et nombres sérialisés comme le fait `JSON.stringify` en JavaScript (nombres au format le plus court, `\uXXXX` seulement pour les caractères de contrôle).
2. FNV-1a 32 bits appliqué aux **unités de code UTF-16** de ce texte (et non à ses octets UTF-8) : `h = 0x811c9dc5 ; pour chaque unité u : h = (h XOR u) × 0x01000193 mod 2³²`.
3. Résultat en base 36, minuscules.

Le champ est facultatif ; sans lui, la régie se fie à la version. Une implémentation qui calcule une empreinte différente reste correcte, elle reçoit simplement l'écran complet au lieu d'un patch.

## Règles

- Un appareil ignore les messages dont il n'est pas destinataire, et les siens.
- Toute donnée reçue est validée (`validateScreen`, `validateTheme`, `validateDisplay`) ; un échec produit un `ack` `ok: false` avec le message d'erreur.
- Une commande refusée par `accept` ou `deny` produit `ack` `{ ok: false, error: "refused" }`.
- Une régie considère un appareil hors ligne après `staleAfterMs` (45 s par défaut) sans message.
- Une régie ne compte que les accusés des appareils ciblés et en ligne, un seul par appareil. Sans `signedTransport`, n'importe quel pair du canal peut émettre un accusé au nom d'un autre : la signature est la seule garantie d'authenticité.
- Un champ `to` qui n'est ni une chaîne ni une liste de chaînes rend le message invalide ; il est ignoré.
- Le transport WebSocket abandonne, à la reconnexion, les messages en attente depuis plus de `maxQueueAgeMs` (10 s par défaut), pour ne pas exécuter tard une commande que l'émetteur a déjà considérée comme perdue.
- Le relais lie l'identité d'une connexion (`from`, étiquettes) à son premier message **autorisé**, puis refuse qu'elle en change. Si un pair se reconnecte sur une nouvelle connexion, la fermeture de l'ancienne n'émet pas de `device/bye`.

## Évolution

Les ajouts compatibles (nouveaux champs facultatifs, nouveaux types ignorés par les anciens pairs) gardent `ms: 1`. Une rupture incrémentera `ms`, et les pairs ignorent les messages d'une version qu'ils ne connaissent pas.
