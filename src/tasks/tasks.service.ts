import { Injectable, NotFoundException } from '@nestjs/common';
import { DatabaseService } from '../database.service';
import { CreateTaskDto } from './dto/create-task.dto';
import { UpdateTaskDto } from './dto/update-task.dto';
import { Task } from './entities/task.entity';

function toTask(row: Record<string, unknown>): Task {
  return {
    id: row.id as number,
    title: row.title as string,
    content: (row.content as string | null) ?? null,
    done: row.done === 1,
    createdAt: new Date(row.createdAt as string),
  };
}

@Injectable()
export class TasksService {
  constructor(private readonly db: DatabaseService) {}

  create(createTaskDto: CreateTaskDto): Task {
    const result = this.db.db
      .prepare('INSERT INTO task (title, content, done) VALUES (?, ?, ?)')
      .run(
        createTaskDto.title,
        createTaskDto.content ?? null,
        createTaskDto.done ? 1 : 0,
      );
    return this.findOne(result.lastInsertRowid as number);
  }

  findAll(): Task[] {
    const rows = this.db.db
      .prepare('SELECT * FROM task ORDER BY createdAt DESC')
      .all() as Record<string, unknown>[];
    return rows.map(toTask);
  }

  findOne(id: number): Task {
    const row = this.db.db
      .prepare('SELECT * FROM task WHERE id = ?')
      .get(id) as Record<string, unknown> | undefined;
    if (!row) {
      throw new NotFoundException(`Tâche #${id} introuvable`);
    }
    return toTask(row);
  }

  update(id: number, updateTaskDto: UpdateTaskDto): Task {
    this.findOne(id);
    const sets: string[] = [];
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const values: any[] = [];
    if (updateTaskDto.title !== undefined) {
      sets.push('title = ?');
      values.push(updateTaskDto.title);
    }
    if (updateTaskDto.content !== undefined) {
      sets.push('content = ?');
      values.push(updateTaskDto.content);
    }
    if (updateTaskDto.done !== undefined) {
      sets.push('done = ?');
      values.push(updateTaskDto.done ? 1 : 0);
    }
    if (sets.length > 0) {
      values.push(id);
      this.db.db
        .prepare(`UPDATE task SET ${sets.join(', ')} WHERE id = ?`)
        .run(...values);
    }
    return this.findOne(id);
  }

  remove(id: number): Task {
    const task = this.findOne(id);
    this.db.db.prepare('DELETE FROM task WHERE id = ?').run(id);
    return task;
  }
}
