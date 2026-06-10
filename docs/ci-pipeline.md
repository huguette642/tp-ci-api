# Pipeline CI — Documentation détaillée

Ce document décrit ligne par ligne le workflow défini dans `.github/workflows/ci.yml`.

---

## Vue d'ensemble

```
install → format-lint → tests → build → security
```

Les jobs s'enchaînent séquentiellement (stratégie **fail-fast**) : si un job échoue, les suivants ne sont pas lancés. Le cache `node_modules` est partagé entre tous les jobs pour éviter de retélécharger les dépendances à chaque étape.

---

## En-tête du workflow

```yaml
name: CI
```
Nom affiché dans l'onglet **Actions** de GitHub.

```yaml
on:
  push:
    branches: ['**']
  pull_request:
    branches: [main]
```
Déclare les événements qui déclenchent le workflow :

- `push` sur `branches: ['**']` — s'exécute sur **tous les push**, quelle que soit la branche (`**` est un glob qui matche tout).
- `pull_request` sur `branches: [main]` — s'exécute quand une Pull Request cible la branche `main`.

---

## Job 1 — `install` : Installation des dépendances

```yaml
install:
  name: Installation des dépendances
  runs-on: ubuntu-latest
```
- `runs-on: ubuntu-latest` — le job tourne dans un runner GitHub hébergé sous la dernière version stable d'Ubuntu.

### Étapes

```yaml
- uses: actions/checkout@v4
```
Clone le dépôt Git dans le répertoire de travail du runner. Sans cette étape, aucun fichier source n'est disponible. `@v4` désigne la version 4 de cette action officielle GitHub.

```yaml
- name: Setup Node.js
  uses: actions/setup-node@v4
  with:
    node-version: '24'
    cache: 'npm'
```
- Installe Node.js 24 sur le runner.
- `cache: 'npm'` active le cache du **registre npm** (dossier `~/.npm`) géré nativement par `setup-node`. Ce cache accélère la résolution des packages lors de `npm ci` en évitant de les re-télécharger depuis le réseau si la version est déjà connue.

```yaml
- name: Restaurer le cache node_modules
  id: cache-node-modules
  uses: actions/cache@v4
  with:
    path: node_modules
    key: node-modules-${{ hashFiles('package-lock.json') }}
```
- `actions/cache@v4` tente de restaurer le dossier `node_modules` depuis le cache GitHub Actions.
- `key: node-modules-${{ hashFiles('package-lock.json') }}` — la clé de cache est calculée à partir du hash SHA-256 du fichier `package-lock.json`. Si ce fichier change (ajout/suppression/mise à jour d'une dépendance), la clé change et le cache est invalidé automatiquement.
- `id: cache-node-modules` donne un identifiant à cette étape pour pouvoir lire sa sortie dans l'étape suivante.

```yaml
- name: Installer les dépendances
  if: steps.cache-node-modules.outputs.cache-hit != 'true'
  run: npm ci
```
- `if: steps.cache-node-modules.outputs.cache-hit != 'true'` — cette condition vérifie si le cache précédent a été trouvé. Si `node_modules` est déjà en cache (cache hit), cette étape est **ignorée**, économisant 30 à 60 secondes.
- `npm ci` (abréviation de *clean install*) installe les dépendances exactement comme décrites dans `package-lock.json`, sans résolution de version. Préféré à `npm install` en CI car il est déterministe et plus rapide.

---

## Job 2 — `format-lint` : Formatage & Lint

```yaml
format-lint:
  name: Formatage & Lint
  runs-on: ubuntu-latest
  needs: [install]
```
- `needs: [install]` — ce job ne démarre qu'après la **réussite** du job `install`. C'est le mécanisme de dépendance entre jobs dans GitHub Actions.

### Étapes

```yaml
- uses: actions/checkout@v4
```
Même rôle que dans `install` : clone le dépôt.

```yaml
- name: Setup Node.js
  uses: actions/setup-node@v4
  with:
    node-version: '24'
```
Installe Node.js 24. Pas de `cache: 'npm'` ici car ce job ne lance pas `npm ci` — il n'en a pas besoin.

```yaml
- name: Restaurer le cache node_modules
  uses: actions/cache@v4
  with:
    path: node_modules
    key: node-modules-${{ hashFiles('package-lock.json') }}
```
Restaure `node_modules` depuis le cache créé par le job `install`. La clé est identique, donc le cache est toujours retrouvé. Le dossier `node_modules` est disponible en quelques secondes sans aucun téléchargement.

```yaml
- name: Vérifier le formatage (Prettier)
  run: npm run format:check
```
Exécute `prettier --check "src/**/*.ts" "test/**/*.ts"`. Prettier analyse chaque fichier TypeScript et vérifie qu'il respecte les règles de formatage (indentation, longueur de ligne, guillemets, etc.). Si un seul fichier n'est pas formaté, la commande retourne un code d'erreur non-zéro et le job échoue. Aucun fichier n'est modifié — c'est un contrôle en lecture seule.

```yaml
- name: Analyser le code (ESLint + SonarJS)
  run: npm run lint
```
Exécute `eslint src/`. ESLint parcourt les fichiers TypeScript de `src/` et applique les règles configurées dans `eslint.config.mjs`, dont le plugin **SonarJS** qui détecte les *code smells* (code dupliqué, complexité cyclomatique excessive, variables inutilisées, etc.). Un problème de niveau `error` fait échouer le job.

---

## Job 3 — `tests` : Tests unitaires

```yaml
tests:
  name: Tests unitaires
  runs-on: ubuntu-latest
  needs: [format-lint]
```
- `needs: [format-lint]` — démarre uniquement si le formatage et le lint ont réussi. Inutile de lancer les tests si le code n'est pas propre.

### Étapes

```yaml
- uses: actions/checkout@v4
- name: Setup Node.js
  uses: actions/setup-node@v4
  with:
    node-version: '24'
- name: Restaurer le cache node_modules
  uses: actions/cache@v4
  with:
    path: node_modules
    key: node-modules-${{ hashFiles('package-lock.json') }}
```
Même logique que `format-lint` : checkout + Node.js + restauration du cache.

```yaml
- name: Lancer les tests avec couverture
  run: npm run test:ci
```
Exécute `jest --coverage`. Jest :
1. Découvre tous les fichiers `*.spec.ts` sous `src/`.
2. Exécute chaque suite de tests.
3. Génère un rapport de couverture dans `coverage/`.
4. Vérifie le **seuil de couverture** défini dans `package.json` (`"lines": 80`). Si la couverture de lignes est inférieure à 80 %, la commande échoue.

Les tests utilisent une base SQLite **en mémoire** (`:memory:`), aucune base de données externe n'est requise.

---

## Job 4 — `build` : Compilation

```yaml
build:
  name: Build
  runs-on: ubuntu-latest
  needs: [tests]
```
- `needs: [tests]` — démarre uniquement si tous les tests passent.

### Étapes

```yaml
- uses: actions/checkout@v4
- name: Setup Node.js
  uses: actions/setup-node@v4
  with:
    node-version: '24'
- name: Restaurer le cache node_modules
  uses: actions/cache@v4
  with:
    path: node_modules
    key: node-modules-${{ hashFiles('package-lock.json') }}
```
Même logique.

```yaml
- name: Compiler l'application
  run: npm run build
```
Exécute `nest build`, qui invoque le compilateur TypeScript (`tsc`) via le CLI NestJS. Le code source TypeScript de `src/` est transpilé en JavaScript dans `dist/`. Si le code contient des erreurs de types, la compilation échoue et le job est marqué en erreur.

---

## Job 5 — `security` : Scan de sécurité

```yaml
security:
  name: Scan de sécurité (Trivy)
  runs-on: ubuntu-latest
  needs: [build]
```
- `needs: [build]` — dernière étape, lancée uniquement si le build réussit.
- Ce job ne restaure pas `node_modules` car Trivy analyse les fichiers de déclaration de dépendances directement, pas le dossier `node_modules`.

### Étapes

```yaml
- uses: actions/checkout@v4
```
Clone le dépôt pour avoir accès à `package.json` et `package-lock.json`.

```yaml
- name: Installer Trivy
  run: curl -sfL https://raw.githubusercontent.com/aquasecurity/trivy/main/contrib/install.sh | sh -s -- -b /usr/local/bin
```
Télécharge et installe le binaire **Trivy** (scanner de vulnérabilités open-source d'Aqua Security) dans `/usr/local/bin`. Détail des options :
- `curl -sfL` : téléchargement silencieux (`-s`), affiche les erreurs HTTP (`-f`), suit les redirections (`-L`).
- `sh -s -- -b /usr/local/bin` : exécute le script d'installation en passant `-b /usr/local/bin` comme dossier de destination du binaire.

```yaml
- name: Scanner les dépendances npm
  run: trivy fs --exit-code 0 --severity CRITICAL,HIGH --no-progress .
```
Lance un scan du système de fichiers courant (`.`) à la recherche de vulnérabilités connues dans les dépendances npm. Détail des options :
- `fs` : mode *filesystem scan*, analyse `package-lock.json` pour identifier les dépendances et les compare à la base de données CVE de Trivy.
- `--exit-code 0` : retourne toujours un code de succès, même si des vulnérabilités sont trouvées. Le job **ne bloque pas** la pipeline — il sert uniquement à informer. Changer cette valeur à `1` rendrait le scan bloquant.
- `--severity CRITICAL,HIGH` : filtre les résultats pour n'afficher que les vulnérabilités de sévérité **CRITICAL** ou **HIGH** (ignore LOW et MEDIUM).
- `--no-progress` : désactive la barre de progression (inutile dans les logs CI).

---

## Résumé du flux de cache

```
Job install
  └─ npm ci → stocke node_modules dans le cache
       clé : node-modules-<hash(package-lock.json)>

Jobs format-lint, tests, build
  └─ restaurent node_modules depuis le cache (lecture seule)
       même clé → cache toujours valide tant que package-lock.json ne change pas
```

Le cache est stocké côté GitHub Actions et persiste entre les runs. Il est automatiquement invalidé dès qu'une dépendance est ajoutée, supprimée ou mise à jour (changement du hash de `package-lock.json`).

Pour une explication détaillée du fonctionnement et des scénarios cache-hit / cache-miss, voir [`docs/fonctionnement-cache.md`](fonctionnement-cache.md).
