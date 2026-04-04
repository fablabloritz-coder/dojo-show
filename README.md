# DOJO SHOW 2.0

Orchestrateur de tournoi temps réel pour événements gaming — matchs, brackets, affichage spectateur et gestion complète depuis une interface admin.

> Réécriture complète de [dojo-show v1](https://github.com/fablabloritz-coder/dojo-show) : architecture modulaire, code séparé (HTML/CSS/JS), état centralisé, synchronisation Socket.IO.

![Node.js](https://img.shields.io/badge/Node.js-18%2B-339933?logo=node.js&logoColor=white)
![Socket.IO](https://img.shields.io/badge/Socket.IO-4.7-010101?logo=socket.io)
![License](https://img.shields.io/badge/license-MIT-blue)

---

## Fonctionnalités

### Gestion des matchs

- Création de matchs (jeu, joueurs, poste, streaming, round)
- Cycle complet : **en attente → appel → en cours → terminé**
- Timer bidirectionnel (compte à rebours en appel, chronomètre en jeu)
- Scores en temps réel, gestion des forfaits (DQ)
- Undo du vainqueur, annulation, restauration depuis l'historique

### Affichage spectateur (1920×1080)

- **Grille de matchs** : layouts de 1×1 à 3×3, mise à l'échelle automatique des polices
- **Tableau d'attente (SNCF)** : file d'attente style gare avec images de jeu en fond
- **Bracket** : arbre de tournoi éliminatoire
- **Rotation automatique** entre les vues (configurable)
- **Spotlight** : mise en avant d'un match en 1×1 depuis l'admin
- Thème sombre avec couleur d'accent personnalisable
- Images de fond par jeu avec opacité réglable
- Couleurs personnalisées par jeu
- Avatars joueurs

### Administration

- Interface complète de gestion des matchs, joueurs et jeux
- Édition des scores live avec raccourcis (+1 / -1)
- Regroupement des matchs par jeu (accordéon)
- Import Start.gg robuste (jeux, joueurs, avatars)
- Données de test intégrées pour les démos

### Paramètres

- 8 polices Google Fonts au choix (Inter, Roboto, Poppins, Montserrat, Orbitron, Press Start 2P, Raleway, Oswald)
- Profils de taille de police par disposition (1×1 à 3×3)
- Couleur d'accent globale
- Taille des avatars
- Rotation automatique des vues
- Configuration Start.gg (clé API, slug tournoi)

### Start.gg (import avancé)

- Connexion via API GraphQL Start.gg (token requis)
- Import segmenté en **3 étapes indépendantes** :
  - Étape 1 : import des jeux (avec images)
  - Étape 2 : import paginé des joueurs par événement/jeu
  - Étape 3 : import des avatars joueurs séparé (plus lent)
- Filtrage par jeu pour les étapes joueurs et avatars
- Journal d'import en temps réel + barres de progression
- Gestion des gros tournois via pagination (réduction des erreurs de complexité)
- Les avatars distants sont téléchargés en local (`data/avatars/`) pour éviter les liens cassés

---

## Stack technique

| Composant | Technologie |
| --------- | ----------- |
| Backend | Node.js, Express, Socket.IO |
| Frontend | HTML / CSS / JS vanilla |
| Persistance | JSON (`data/state.json`), auto-save 30s |
| Temps réel | Socket.IO (pas de REST pour les mutations) |

---

## Installation

```bash
# Cloner le repo
git clone https://github.com/fablabloritz-coder/dojo-show.git
cd dojo-show

# Installer les dépendances
npm install

# Lancer le serveur
npm start
```

Le serveur démarre sur [`http://localhost:3000`](http://localhost:3000).

### Sous Windows

Double-cliquer sur `start.bat` pour un lanceur interactif avec :

- choix du navigateur (Chrome, Edge, Firefox, défaut)
- ouverture en mode app pour Chrome/Edge
- attente active du démarrage serveur avant ouverture du navigateur
- mémorisation du choix de navigateur pour les prochains lancements

---

## Interfaces

| URL | Rôle |
| --- | ---- |
| `/admin.html` | Interface organisateur — gestion des matchs, scores, joueurs |
| `/display.html` | Affichage spectateur — plein écran 1920×1080 |
| `/settings.html` | Paramètres — polices, couleurs, jeux, Start.gg |

---

## Structure du projet

```tree
├── server.js              # Backend complet : state, Socket.IO, persistence, API proxy
├── package.json
├── start.bat              # Lanceur Windows avec choix navigateur
├── public/
│   ├── admin.html         # Interface admin
│   ├── display.html       # Affichage spectateur
│   ├── settings.html      # Page paramètres
│   ├── css/
│   │   ├── admin.css
│   │   ├── display.css
│   │   └── settings.css
│   └── js/
│       ├── accent-color.js   # Utilitaire partagé couleur accent
│       ├── admin.js
│       ├── display.js
│       └── settings.js
├── data/                  # Créé automatiquement (gitignored)
│   └── state.json
└── .github/
    ├── copilot-instructions.md
    ├── agents/            # Agents Copilot spécialisés
    └── prompts/           # Prompts workflow (/dojo)
```

---

## Changelog v1 → v2

- **Architecture** : fichier unique monolithique → séparation HTML/CSS/JS par interface
- **État** : synchronisation complète via Socket.IO (plus de polling)
- **Affichage** : grille adaptative avec profils de police par layout
- **Bracket** : vue arbre de tournoi éliminatoire intégrée
- **Rotation** : cycle automatique matchs → attente → bracket
- **Spotlight** : mise en avant d'un match individuel en 1×1
- **Personnalisation** : polices Google Fonts, couleur d'accent, images/couleurs par jeu
- **Avatars** : support avatars joueurs dans admin et affichage
- **Import** : intégration Start.gg pour joueurs et jeux
- **Import Start.gg** : pipeline 3 étapes (jeux -> joueurs -> avatars), pagination et progression visuelle
- **Persistance** : auto-save JSON avec rechargement à chaud

---

## Licence

MIT
