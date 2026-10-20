import type { Queryable } from '../db.js';
import type { Task, TaskStatus } from '../types.js';
import { mapTask } from './mappers.js';

/** Tasks in a tenant, newest first. Live only unless includeArchived is set. */
export async function listTasks(
  db: Queryable,
  tenantId: string,
  includeArchived = false,
): Promise<Task[]> {
  const { rows } = await db.query(
    `SELECT * FROM tasks
      WHERE tenant_id = $1 ${includeArchived ? '' : 'AND archived_at IS NULL'}
      ORDER BY created_at DESC`,
    [tenantId],
  );
  return rows.map(mapTask);
}

export async function getTask(
  db: Queryable,
  tenantId: string,
  id: string,
): Promise<Task | null> {
  const { rows } = await db.query(
    `SELECT * FROM tasks WHERE tenant_id = $1 AND id = $2`,
    [tenantId, id],
  );
  return rows[0] ? mapTask(rows[0]) : null;
}

export interface CreateTaskInput {
  name: string;
  status?: TaskStatus;
}

export async function createTask(
  db: Queryable,
  tenantId: string,
  input: CreateTaskInput,
): Promise<Task> {
  const { rows } = await db.query(
    `INSERT INTO tasks (tenant_id, name, status)
     VALUES ($1, $2, $3::task_status)
     RETURNING *`,
    [tenantId, input.name.trim(), input.status ?? 'active'],
  );
  return mapTask(rows[0]);
}

export interface UpdateTaskInput {
  name?: string;
  status?: TaskStatus;
}

export async function updateTask(
  db: Queryable,
  tenantId: string,
  id: string,
  input: UpdateTaskInput,
): Promise<Task | null> {
  const { rows } = await db.query(
    `UPDATE tasks
        SET name   = COALESCE($3, name),
            status = COALESCE($4::task_status, status),
            updated_at = now()
      WHERE tenant_id = $1 AND id = $2 AND archived_at IS NULL
      RETURNING *`,
    [tenantId, id, input.name?.trim() ?? null, input.status ?? null],
  );
  return rows[0] ? mapTask(rows[0]) : null;
}

export async function archiveTask(
  db: Queryable,
  tenantId: string,
  id: string,
): Promise<Task | null> {
  const { rows } = await db.query(
    `UPDATE tasks
        SET archived_at = now()
      WHERE tenant_id = $1 AND id = $2 AND archived_at IS NULL
      RETURNING *`,
    [tenantId, id],
  );
  return rows[0] ? mapTask(rows[0]) : null;
}

export async function restoreTask(
  db: Queryable,
  tenantId: string,
  id: string,
): Promise<Task | null> {
  const { rows } = await db.query(
    `UPDATE tasks
        SET archived_at = NULL
      WHERE tenant_id = $1 AND id = $2 AND archived_at IS NOT NULL
      RETURNING *`,
    [tenantId, id],
  );
  return rows[0] ? mapTask(rows[0]) : null;
}
