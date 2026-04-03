---
description: "Workflow DOJO : analyse → implémentation → validation → résumé. UNE amélioration par exécution."
agent: "agent"
argument-hint: "Décris l'amélioration ou le bug à traiter..."
---

# Workflow DOJO SHOW 2.0

Exécute ce workflow pour la demande utilisateur. Pas de sous-agents — tout se fait inline, en séquence.

## Phase 1 — Analyse rapide (PAS de sous-agent)
Avant de coder, produis un bloc compact (directement, sans invoquer d'agent) :

```
═══ PLAN ═══
📋 Demande : (reformulation en 1 phrase)
📂 Fichiers : (liste des fichiers à modifier)
⚠️ Risques : (0-2 points de vigilance)
✅ Étapes :
  1. ...
  2. ...
═════════════
```

Règles de l'analyse :
- Si la demande contient **plusieurs améliorations**, choisis la plus impactante. Liste les autres comme "à faire ensuite".
- Ne lis que les fichiers strictement nécessaires à l'implémentation — tu as déjà le contexte projet via `copilot-instructions.md` et le conversation summary.
- Maximum 10 lignes.

## Phase 2 — Implémentation
- Backend d'abord, frontend ensuite, CSS en dernier
- Utilise une todo list pour les sous-étapes
- Fais les edits en batch (`multi_replace_string_in_file`) quand possible
- Ne crée un fichier que si strictement nécessaire

## Phase 3 — Validation
- `get_errors` sur les fichiers modifiés
- Redémarrer le serveur (`node server.js`) et vérifier qu'il démarre sans erreur
- Si erreur → corriger immédiatement, ne pas continuer

## Phase 4 — Résumé (PAS de sous-agent)
Produis directement un bloc compact de résumé :

```
═══ DONE ═══
✅ Réalisé : (liste des changements factuels)
🔒 Sécurité : OK / point de vigilance
⚠️ Connu : (limitations restantes, ou RAS)
➡️ Prochains : (suggestions 1-2 lignes)
═════════════
```

## Règles absolues
- **UNE seule amélioration** par exécution
- **ZÉRO sous-agent** — tout est inline (analyse, risk review, résumé)
- Ne lis pas de fichier que tu as déjà lu dans cette conversation
- Privilégie `multi_replace_string_in_file` aux edits séquentiels
- Si un bug simple est détecté pendant l'implémentation, corrige-le sans le compter comme "l'amélioration"
