#!/bin/bash
set -ex

echo "==> Installation des dépendances npm..."
npm ci

echo "==> Création de la base de données SQLite et initialisation des données de démonstration..."
DATABASE_URL="./dev.db" npx ts-node db/seed.ts

echo "==> Installation de act (exécution locale des GitHub Actions)..."
# 1. On télécharge le script d'installation officiel
curl -s https://raw.githubusercontent.com/nektos/act/master/install.sh -o install_act.sh

# 2. On l'exécute explicitement en forçant le dossier système de destination
sudo bash install_act.sh -b /usr/local/bin/

# 3. On nettoie le script temporaire
rm install_act.sh

# 4. On s'assure que le binaire est exécutable par tout le monde
sudo chmod +x /usr/local/bin/act

echo "==> Pré-téléchargement de l'image Docker pour act..."
docker pull catthehacker/ubuntu:act-24.04

echo "==> Installation de Trivy (scan de sécurité)..."
curl -sfL https://raw.githubusercontent.com/aquasecurity/trivy/main/contrib/install.sh | sudo sh -s -- -b /usr/local/bin

echo ""
echo "✅ Environnement prêt !"
echo "   - Application : npm run start:dev  →  http://localhost:3000"
echo "   - Swagger      : http://localhost:3000/api"
echo "   - Tests        : npm test"
echo "   - CI locale    : act"
