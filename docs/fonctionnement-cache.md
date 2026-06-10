# Guide : Comprendre le fonctionnement du Cache dans notre pipeline CI/CD (GitHub Actions & `act`)

Ce document est conçu pour vous aider à comprendre comment est optimisé le pipeline d'Intégration Continue (CI) de ce projet. Lorsque des tests ou des vérifications de code automatisées sont exécutés, l'une des étapes les plus longues est souvent le téléchargement et l'installation des dépendances (`node_modules`).

Pour éviter de perdre du temps à chaque modification de code, nous utilisons un mécanisme de **cache**.

---

## 🛠 L'Environnement : GitHub Actions & `act`

Dans un environnement de production classique, GitHub Actions s'exécute sur des serveurs distants (le Cloud de GitHub). À chaque exécution, une nouvelle machine virtuelle vierge est créée.

Dans notre projet, pour travailler en local et économiser des ressources, nous utilisons l'outil **`act`** à l'intérieur d'un **DevContainer**.

- **`act`** simule le comportement de GitHub Actions sur votre machine en créant des conteneurs Docker pour chaque job.
- Le mécanisme de cache décrit ci-dessous fonctionne de la même manière sur GitHub et en local avec `act` (qui stocke le cache dans un dossier local de votre machine).

---

## 🔁 L'Architecture en Cascade du Pipeline

Notre fichier de configuration définit 5 étapes ordonnées (appelées _jobs_) :
`install` ➡️ `format-lint` ➡️ `tests` ➡️ `build` ➡️ `security`

Chaque job s'exécute dans un conteneur Docker **complètement isolé** des autres. Cela signifie que le dossier `node_modules` créé dans le premier job (`install`) **n'existe pas** dans le job suivant (`format-lint`). C'est là que le cache devient indispensable pour faire passer les fichiers d'un job à l'autre sans tout retélécharger !

---

## 🔍 Analyse précise du fonctionnement du Cache

Dans notre workflow, le cache intervient à deux niveaux complémentaires.

### 1. Le cache de l'installateur (`actions/setup-node`)

Dans le premier job (`install`), vous pouvez observer cette configuration :

```yaml
- name: Setup Node.js
  uses: actions/setup-node@v4
  with:
    node-version: '24'
    cache: 'npm' # <- Activation du cache global npm
```

- **Qu'est-ce que c'est ?** Cela demande à GitHub `act` de sauvegarder le dossier de téléchargement global de npm (l'équivalent de `~/.npm`).
- **À quoi ça sert ?** Si jamais nous devons installer des paquets, npm n'ira pas les chercher sur Internet, mais directement dans ce dossier local compressé. C'est le "filet de sécurité".

### 2. Le cache direct du dossier `node_modules` (Le cœur de l'optimisation)

Dans **tous** les jobs du fichier, vous retrouverez ce bloc de code :

```yaml
- name: Restaurer le cache node_modules
  id: cache-node-modules # (id présent dans le job install)
  uses: actions/cache@v4
  with:
    path: node_modules
    key: node-modules-${{ hashFiles('package-lock.json') }}
```

Détaillons les trois propriétés fondamentales de ce bloc :

1. **`path: node_modules`** : C'est le dossier exact que l'on souhaite sauvegarder et restaurer. Il contient toutes les bibliothèques prêtes à l'emploi pour notre application Node.js.
2. **`key: node-modules-${{ hashFiles('package-lock.json') }}`** : C'est la clé d'identification unique de notre cache.

- La fonction `hashFiles('package-lock.json')` va lire votre fichier `package-lock.json` (qui liste la version exacte de chaque dépendance du projet) et générer une empreinte unique (ex: `node-modules-a1b2c3d4...`).
- **Si le fichier `package-lock.json` ne change pas**, l'empreinte reste identique à l'exécution précédente. Le cache est considéré comme valide.
- **Si vous installez un nouveau paquet**, le fichier change, l'empreinte change, et l'ancienne clé devient obsolète.

---

## 🏃‍♂️ Scénario pas à pas lors d'une exécution

Voici concrètement ce qu'il se passe selon la situation de votre projet :

### Scénario A : Le `package-lock.json` n'a pas changé (Cas le plus fréquent)

1. **Job `install` :** \* L'action `actions/cache@v4` cherche un cache correspondant à la clé générée. Elle le trouve (**Cache Hit**).

- Le dossier `node_modules` complet est instantanément téléchargé et extrait dans le conteneur.
- L'étape d'après possède une condition : `if: steps.cache-node-modules.outputs.cache-hit != 'true'`. Comme on a trouvé le cache, cette condition est fausse : **l'étape `npm ci` est totalement sautée**. Vous gagnez plusieurs minutes.

2. **Jobs suivants (`format-lint`, `tests`, `build`) :**

- Chaque job démarre dans un conteneur vide.
- Chacun exécute l'action `actions/cache@v4` avec la même clé.
- Le dossier `node_modules` est restauré à chaque fois en quelques secondes, permettant aux commandes comme `npm run lint` ou `npm run test:ci` de s'exécuter immédiatement.

### Scénario B : Vous venez d'ajouter une nouvelle dépendance npm

1. **Job `install` :**

- Le fichier `package-lock.json` a été modifié. La clé générée est inédite.
- L'action cherche dans les serveurs/stockage local mais ne trouve rien (**Cache Miss**). Le dossier `node_modules` reste vide.
- La condition `if: steps.cache-node-modules.outputs.cache-hit != 'true'` devient vraie. La commande **`npm ci` est exécutée**.
- `npm ci` va télécharger les paquets. (Note: C'est ici que le cache de `setup-node` aide à aller plus vite en fournissant les fichiers `.tar.gz` déjà connus !).
- **Étape invisible (Post-Run) :** À la toute fin du job `install`, si tout s'est bien passé, l'action de cache s'exécute à nouveau en arrière-plan pour compresser le tout nouveau dossier `node_modules` et le sauvegarder sous la nouvelle clé.

2. **Jobs suivants :**

- Ils vont bénéficier instantanément du nouveau cache qui vient tout juste d'être créé et sauvegardé par le job `install`.

---

## 🧠 Résumé

- **Pourquoi on fait ça ?** Pour diviser le temps d'exécution de la CI par 3 ou 4.
- **Quand le cache est-il mis à jour ?** Uniquement lorsque vous modifiez le fichier `package-lock.json` (via un `npm install` par exemple).
- **Pourquoi le mettre dans chaque job ?** Parce que chaque job s'exécute dans un environnement jetable et isolé. Le cache est le pont qui transmet les dépendances d'un job à l'autre.

---

## _Bonus : Où est localisé le cache ?_

### 1. En local (dans le DevContainer avec `act`)

Le cache reste en local sur la machine hôte, mais dans un dossier géré automatiquement.

- **Où est-il stocké ?** `act` crée un dossier spécial sur la machine hôte (souvent dans le répertoire utilisateur, par exemple `~/.actcache/` ou directement lié au dossier du projet selon la configuration).
- **Comment ça se passe avec le DevContainer ?** Le DevContainer est un conteneur Docker. Les jobs lancés par `act` créent _d'autres_ conteneurs Docker. `act` monte un volume partagé entre la machine et ces conteneurs de job. Lorsque le job écrit dans `node_modules`, l'action de cache copie ce dossier vers le volume lié au disque dur local.

> 📁 **En clair en local :** Le cache est un simple fichier compressé (`.tar.gz`) stocké dans les dossiers cachés de la machine.

---

### 2. Sur le Cloud (Le vrai GitHub Actions)

Lorsque le code est puché sur GitHub, l'environnement change complètement.

- **Où est-il stocké ?** GitHub utilise son propre service de stockage cloud hautement optimisé (similaire à AWS S3 ou Azure Blob Storage), dédié spécifiquement aux caches du dépôt.
- **Comment ça se passe ?** Le job `install` s'exécute sur un serveur de GitHub. À la fin du job, l'action compresse le dossier `node_modules` et l'envoie via le réseau (HTTPS) vers cet espace de stockage cloud de GitHub. Lorsque les jobs suivants (`tests`, `build`, etc.) démarrent sur d'autres serveurs de GitHub, ils s'authentifient et téléchargent cette archive depuis le cloud pour la décompresser.

> 🌐 **En clair sur le Cloud :** Le cache se trouve sur les serveurs d'infrastructure de GitHub.
