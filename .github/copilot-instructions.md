# DOJO SHOW 2.0 — Instructions Copilot

Ce projet est un orchestrateur de tournoi (webapp Node.js + Socket.IO).

## Stack technique
- **Backend** : Node.js, Express, Socket.IO — fichier unique `server.js`
- **Frontend** : HTML/CSS/JS vanilla dans `public/` (html à la racine, css dans `css/`, js dans `js/`)
- **Pas de framework frontend** — vanilla JS uniquement
- **État centralisé** côté serveur, synchronisation temps réel via Socket.IO (pas de REST pour les mutations)
- Persistance JSON dans `data/state.json`, auto-save toutes les 30s

## Conventions de code
- Thème dark : couleur accent paramétrable via `state.settings.accentColor` (défaut `#7b2ff7`), fond `#0a0a14`
- Toutes les couleurs accent passent par CSS custom properties (`--purple-primary`, `--purple-light`, `--purple-glow`, etc.) mises à jour dynamiquement par `applyAccentColor()` depuis `js/accent-color.js`
- Optimisé pour 1920×1080 sans zoom navigateur
- Échapper toute donnée utilisateur avec `esc()` avant injection HTML
- Validation des entrées côté serveur (regex, whitelist, sanitize)

## Fichiers clés
| Fichier | Rôle |
|---------|------|
| `server.js` | Backend complet (~1000 lignes) : state, Socket.IO handlers, persistence, API proxy |
| `public/admin.html` + `js/admin.js` + `css/admin.css` | Interface organisateur |
| `public/display.html` + `js/display.js` + `css/display.css` | Affichage spectateur (1920×1080) |
| `public/settings.html` + `js/settings.js` + `css/settings.css` | Page paramètres (Start.gg, jeux, joueurs, apparence) |
| `public/js/accent-color.js` | Utilitaire partagé : calcul et application de la couleur accent |
| `start.bat` | Lanceur avec choix de navigateur |

## Workflow
Utiliser le prompt `/dojo` pour le workflow structuré (analyse → implémentation → validation → résumé).
Le workflow est **inline** — pas de sous-agents, tout se fait dans le même contexte pour économiser les ressources.
