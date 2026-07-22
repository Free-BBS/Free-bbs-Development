import { createHash } from 'node:crypto';
import { readdir, readFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

import { createPool, type Pool, type PoolConnection, type RowDataPacket } from 'mysql2/promise';

import { splitSqlStatements } from './sql-splitter.js';

export { splitSqlStatements } from './sql-splitter.js';

export interface MigrationFile {
  name: string;
  path: string;
  checksum: string;
}

export interface MySqlConfig {
  host: string;
  port: number;
  user: string;
  password: string;
  database: string;
}

export function calculateChecksum(contents: string): string {
  return createHash('sha256').update(contents, 'utf8').digest('hex');
}

export async function discoverMigrations(directory: string): Promise<MigrationFile[]> {
  const names = (await readdir(directory))
    .filter((name) => /^\d+_[a-z0-9_-]+\.sql$/i.test(name))
    .sort((left, right) => left.localeCompare(right));
  return Promise.all(
    names.map(async (name) => {
      const path = join(directory, name);
      return { name, path, checksum: calculateChecksum(await readFile(path, 'utf8')) };
    }),
  );
}

function requireEnvironment(environment: NodeJS.ProcessEnv, name: string): string {
  const value = environment[name]?.trim();
  if (!value) throw new Error(`${name} is required when DATA_MODE=mysql`);
  return value;
}

export function loadMySqlConfig(environment: NodeJS.ProcessEnv = process.env): MySqlConfig {
  const portText = environment.MYSQL_PORT?.trim() || '3306';
  const port = Number(portText);
  if (!Number.isInteger(port) || port < 1 || port > 65535) {
    throw new Error('MYSQL_PORT must be an integer between 1 and 65535');
  }
  return {
    host: requireEnvironment(environment, 'MYSQL_HOST'),
    port,
    user: requireEnvironment(environment, 'MYSQL_USER'),
    password: requireEnvironment(environment, 'MYSQL_PASSWORD'),
    database: requireEnvironment(environment, 'MYSQL_DATABASE'),
  };
}

interface AppliedMigrationRow extends RowDataPacket {
  name: string;
  checksum: string;
}

export async function applyMigration(
  connection: PoolConnection,
  migration: MigrationFile,
): Promise<void> {
  const [rows] = await connection.execute<AppliedMigrationRow[]>(
    'SELECT name, checksum FROM schema_migrations WHERE name = ?',
    [migration.name],
  );
  const applied = rows[0];
  if (applied) {
    if (applied.checksum !== migration.checksum) {
      throw new Error(`Migration checksum mismatch: ${migration.name}`);
    }
    return;
  }

  const contents = await readFile(migration.path, 'utf8');
  await connection.beginTransaction();
  try {
    for (const statement of splitSqlStatements(contents)) {
      await connection.execute(statement);
    }
    await connection.execute(
      'INSERT INTO schema_migrations (name, checksum, applied_at) VALUES (?, ?, NOW(3))',
      [migration.name, migration.checksum],
    );
    await connection.commit();
  } catch (error) {
    await connection.rollback();
    throw error;
  }
}

export interface MigrationOptions {
  pool?: Pool;
  directory?: string;
  environment?: NodeJS.ProcessEnv;
}

export async function runMigrations(options: MigrationOptions = {}): Promise<string[]> {
  const ownPool = !options.pool;
  const pool =
    options.pool ?? createPool({ ...loadMySqlConfig(options.environment), connectionLimit: 2 });
  const connection = await pool.getConnection();
  try {
    await connection.execute(`
      CREATE TABLE IF NOT EXISTS schema_migrations (
        name VARCHAR(255) PRIMARY KEY,
        checksum CHAR(64) NOT NULL,
        applied_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci
    `);
    const defaultDirectory = resolve(process.cwd(), 'database/migrations');
    const migrations = await discoverMigrations(options.directory ?? defaultDirectory);
    for (const migration of migrations) await applyMigration(connection, migration);
    return migrations.map(({ name }) => name);
  } finally {
    connection.release();
    if (ownPool) await pool.end();
  }
}

const invokedPath = process.argv[1] ? pathToFileURL(process.argv[1]).href : '';
if (import.meta.url === invokedPath) {
  runMigrations()
    .then((migrations) => {
      process.stdout.write(`Database migrations verified: ${migrations.join(', ')}\n`);
    })
    .catch((error: unknown) => {
      const message = error instanceof Error ? error.message : String(error);
      process.stderr.write(`Database migration failed: ${message}\n`);
      process.exitCode = 1;
    });
}
