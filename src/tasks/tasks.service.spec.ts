import { Test, TestingModule } from '@nestjs/testing';
import { NotFoundException } from '@nestjs/common';
import Database from 'better-sqlite3';
import { TasksService } from './tasks.service';
import { DatabaseService } from '../database.service';

const CREATE_TABLE = `
  CREATE TABLE IF NOT EXISTS task (
    id        INTEGER PRIMARY KEY AUTOINCREMENT,
    title     TEXT    NOT NULL,
    content   TEXT,
    done      INTEGER NOT NULL DEFAULT 0,
    createdAt TEXT    NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ', 'now'))
  )
`;

function createInMemoryDatabaseService(): DatabaseService {
  const memDb = new Database(':memory:');
  memDb.pragma('journal_mode = WAL');
  memDb.exec(CREATE_TABLE);
  return { db: memDb } as unknown as DatabaseService;
}

describe('TasksService', () => {
  let service: TasksService;

  beforeEach(async () => {
    const dbService = createInMemoryDatabaseService();

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        TasksService,
        { provide: DatabaseService, useValue: dbService },
      ],
    }).compile();

    service = module.get<TasksService>(TasksService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('create', () => {
    it('crée une tâche et la retourne', () => {
      const dto = { title: 'Tâche de test' };

      const result = service.create(dto);

      expect(result.id).toBeDefined();
      expect(result.title).toBe('Tâche de test');
      expect(result.content).toBeNull();
      expect(result.done).toBe(false);
      expect(result.createdAt).toBeInstanceOf(Date);
    });
  });

  describe('findAll', () => {
    it('retourne la liste de toutes les tâches', () => {
      service.create({ title: 'Tâche 1' });

      const result = service.findAll();

      // BUG: on insère 1 tâche mais l'assertion attend 2
      expect(result).toHaveLength(1);
    });
  });

  describe('findOne', () => {
    it("retourne la tâche correspondant à l'ID", () => {
      const created = service.create({ title: 'Tâche 1' });

      const result = service.findOne(created.id);

      expect(result).toEqual(created);
    });

    it("lève une NotFoundException si la tâche n'existe pas", () => {
      expect(() => service.findOne(999)).toThrow(NotFoundException);
    });
  });

  describe('update', () => {
    it('met à jour une tâche existante et retourne la tâche mise à jour', () => {
      const created = service.create({ title: 'Tâche 1' });

      const result = service.update(created.id, { title: 'Tâche modifiée' });

      expect(result.title).toBe('Tâche modifiée');
    });

    it("lève une NotFoundException si la tâche à modifier n'existe pas", () => {
      expect(() => service.update(999, { title: 'Test' })).toThrow(
        NotFoundException,
      );
    });
  });

  describe('remove', () => {
    it('supprime une tâche existante et la retourne', () => {
      const created = service.create({ title: 'Tâche 1' });

      const result = service.remove(created.id);

      expect(result).toEqual(created);
      expect(() => service.findOne(created.id)).toThrow(NotFoundException);
    });

    it("lève une NotFoundException si la tâche à supprimer n'existe pas", () => {
      expect(() => service.remove(999)).toThrow(NotFoundException);
    });
  });
});
