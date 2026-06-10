# cours-03-ci-api

API de gestion de tâches — support du TP cours-03 sur l'intégration continue.

## Objectifs pédagogiques

Ce dépôt sert de support à la partie pratique du cours-03.

À l'issue du TP, vous devez être capables de :

- lire et comprendre un workflow GitHub Actions,
- identifier un échec de pipeline en lisant les logs,
- réparer une CI cassée (qualité, tests, ordre des jobs),
- expliquer l'ordre logique d'une pipeline fail-fast,
- exécuter une pipeline CI localement avec `act`.

## Stack technique

| Outil | Rôle |
|---|---|
| Node 24 + NestJS 11 | Framework backend |
| better-sqlite3 | Base de données SQLite (requêtes SQL directes, aucun service à lancer) |
| Swagger | Documentation de l'API |
| Jest | Tests unitaires avec couverture |
| Prettier | Formatage du code |
| ESLint + SonarJS | Analyse statique et détection de code smells |
| Trivy | Scan de vulnérabilités des dépendances |
| `act` | Exécution locale des workflows GitHub Actions |

## Prérequis

### Sans DevContainer

- **Node.js 24** : https://nodejs.org
- **npm** (inclus avec Node)

### Avec DevContainer (recommandé)

- **Docker Desktop** : https://www.docker.com/products/docker-desktop
- **VS Code** avec l'extension **Dev Containers** (`ms-vscode-remote.remote-containers`)

---

## Installation et lancement — from scratch

### Avec DevContainer (Windows, Linux, macOS)

1. Ouvrir le dossier dans VS Code
2. Accepter la suggestion *"Reopen in Container"* (ou `Ctrl+Shift+P` → *Dev Containers: Reopen in Container*)
3. Attendre la fin du `postCreateCommand` (~2 min selon votre connexion)

Le DevContainer installe automatiquement : les dépendances npm, la base SQLite, `act` et `Trivy`.

### Sans DevContainer

```bash
# 1. Cloner le dépôt
git clone <url-du-depot>
cd cours-03-ci-api

# 2. Installer les dépendances
npm ci

# 3. Configurer l'environnement
cp .env.example .env

# 4. Initialiser la base de données
npx ts-node db/seed.ts
```

---

## Lancer l'application

```bash
npm run start:dev
```

L'API est accessible sur : http://localhost:3000  
La documentation Swagger : http://localhost:3000/api

---

## Lancer les tests unitaires

```bash
# Tests simples
npm test

# Tests avec rapport de couverture
npm run test:ci
```

Les tests utilisent des mocks et **ne nécessitent pas** de base de données active.

---

## Lancer la CI localement avec `act`

`act` exécute les workflows GitHub Actions dans un conteneur Docker local.

**Pré-requis :** Docker doit être en cours d'exécution.

```bash
# Exécuter tout le pipeline CI
act

# Exécuter un job spécifique
act -j format-lint
act -j tests
act -j build
act -j security
```

Le fichier `.actrc` configure l'image runner à utiliser. Si `act` demande quelle image choisir au premier lancement, sélectionnez **Medium**.

---

## Structure du pipeline CI

Le workflow `.github/workflows/ci.yml` exécute 5 jobs séquentiels :

```
install → format-lint → tests → build → security
```

| Job | Ce qu'il vérifie |
|---|---|
| `install` | Installation des dépendances npm et mise en cache de `node_modules` |
| `format-lint` | Formatage Prettier + analyse ESLint/SonarJS |
| `tests` | Tests unitaires avec couverture ≥ 80% |
| `build` | Compilation TypeScript |
| `security` | Scan de vulnérabilités Trivy |

Documentation détaillée :

- [`docs/ci-pipeline.md`](docs/ci-pipeline.md) — description ligne par ligne du workflow
- [`docs/fonctionnement-cache.md`](docs/fonctionnement-cache.md) — mécanisme de cache `node_modules` entre les jobs

---

## Exercices

Les exercices se trouvent sur des branches dédiées. Pour chaque exercice :

1. Basculer sur la branche de l'exercice
2. Lire le fichier `EXERCICE.md` à la racine
3. Observer l'état de la CI (localement avec `act` ou sur GitHub)
4. Identifier la cause du problème dans les logs
5. Corriger le code ou la configuration
6. Vérifier que la CI repasse au vert

### Liste des branches d'exercices

| Branche | Description |
|---|---|
| `exercise/01-format-lint` | La pipeline échoue à cause d'un problème de formatage |
| `exercise/02-test-failure` | Un test unitaire est cassé |
| `exercise/03-pipeline-order` | L'ordre des jobs ne respecte pas la stratégie fail-fast |
| `exercise/04-log-reading` | Une violation de code smell est détectée par SonarJS |
| `exercise/05-stabilize` | La pipeline comporte plusieurs problèmes à corriger |

### Exercice bonus (pour les plus rapides)

| Branche | Description |
|---|---|
| `bonus/parallelization` | Paralléliser des jobs indépendants dans la pipeline |

---

## Commandes utiles

```bash
# Réinitialiser la base de données
npx ts-node db/seed.ts

# Voir la base de données (outil en ligne de commande SQLite)
sqlite3 dev.db

# Vérifier le formatage
npm run format:check

# Corriger le formatage automatiquement
npm run format

# Lancer ESLint
npm run lint
```

---

## Endpoints de l'API

| Méthode | Route | Description |
|---|---|---|
| GET | `/tasks` | Lister toutes les tâches |
| GET | `/tasks/:id` | Récupérer une tâche par ID |
| POST | `/tasks` | Créer une tâche |
| PATCH | `/tasks/:id` | Mettre à jour une tâche |
| DELETE | `/tasks/:id` | Supprimer une tâche |

Exemple de corps pour `POST /tasks` :

```json
{
  "title": "Ma nouvelle tâche",
  "content": "Description optionnelle",
  "done": false
}
```
