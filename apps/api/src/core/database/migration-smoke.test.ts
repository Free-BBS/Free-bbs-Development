import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';

import { describe, expect, it } from 'vitest';

import { calculateChecksum, discoverMigrations } from './migrate.js';

const databaseDirectory = fileURLToPath(new URL('../../../../../database/', import.meta.url));

describe('database migrations', () => {
  it('defines every core and domain table in explicit migrations', async () => {
    const migrations = await discoverMigrations(`${databaseDirectory}/migrations`);
    expect(migrations.map(({ name }) => name)).toEqual(['001_core.sql', '002_domains.sql']);

    const sql = (await Promise.all(migrations.map(({ path }) => readFile(path, 'utf8')))).join(
      '\n',
    );
    const requiredTables = [
      'schema_migrations',
      'subjects',
      'roles',
      'permissions',
      'role_permissions',
      'role_assignments',
      'tag_definitions',
      'tag_assignments',
      'modules',
      'module_owners',
      'audit_logs',
      'knowledge_entries',
      'announcements',
      'consultations',
      'clubs',
      'club_memberships',
      'activities',
      'activity_registrations',
      'sports_teams',
      'sports_checkins',
      'liaison_resources',
      'finance_records',
    ];

    for (const table of requiredTables) {
      expect(sql).toMatch(
        new RegExp(`CREATE\\s+TABLE\\s+(?:IF\\s+NOT\\s+EXISTS\\s+)?${table}\\b`, 'i'),
      );
    }
  });

  it('calculates stable checksums and includes useful demo records', async () => {
    expect(calculateChecksum('SELECT 1;')).toBe(calculateChecksum('SELECT 1;'));
    expect(calculateChecksum('SELECT 1;')).not.toBe(calculateChecksum('SELECT 2;'));

    const seed = await readFile(`${databaseDirectory}/seeds/001_demo.sql`, 'utf8');
    for (const table of [
      'knowledge_entries',
      'announcements',
      'consultations',
      'clubs',
      'activities',
      'sports_teams',
      'liaison_resources',
      'finance_records',
    ]) {
      expect(
        seed.match(new RegExp(`INSERT\\s+INTO\\s+${table}\\b`, 'gi'))?.length,
      ).toBeGreaterThanOrEqual(1);
      const values =
        seed.match(new RegExp(`INSERT\\s+INTO\\s+${table}[\\s\\S]*?;`, 'i'))?.[0] ?? '';
      expect((values.match(/\),\s*\(/g) ?? []).length).toBeGreaterThanOrEqual(1);
    }
  });
});
