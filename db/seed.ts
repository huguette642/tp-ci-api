import 'dotenv/config';
import Database from 'better-sqlite3';

const url = process.env.DATABASE_URL ?? './dev.db';
const dbPath = url.startsWith('file:') ? url.slice(5) : url;

const db = new Database(dbPath);
db.pragma('journal_mode = WAL');

db.exec(`
  CREATE TABLE IF NOT EXISTS task (
    id        INTEGER PRIMARY KEY AUTOINCREMENT,
    title     TEXT    NOT NULL,
    content   TEXT,
    done      INTEGER NOT NULL DEFAULT 0,
    createdAt TEXT    NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ', 'now'))
  )
`);

const insert = db.prepare(
  'INSERT INTO task (title, content, done) VALUES (?, ?, ?)',
);

const seed = db.transaction(() => {
  insert.run('Mettre à jour le README', 'Ajouter les instructions de lancement et les exemples curl', 0);
  insert.run('Corriger le bug #42', 'Le endpoint GET /tasks renvoie une erreur 500 quand la liste est vide', 1);
  insert.run('Ajouter les tests unitaires', 'Couvrir les cas limites du service TasksService', 0);
  insert.run('Revoir la PR de Sarah', null, 0);
  insert.run('Configurer le pipeline CI', 'Mettre en place le workflow GitHub Actions avec lint, tests, build et scan sécurité', 0);
});

seed();
db.close();

console.log('Base de données initialisée avec des données de démonstration');
