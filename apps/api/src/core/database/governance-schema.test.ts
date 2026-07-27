import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';

import { describe, expect, it } from 'vitest';

const migrationPath = fileURLToPath(
  new URL('../../../../../database/migrations/004_production_governance.sql', import.meta.url),
);

describe('production governance migration', () => {
  it('creates tag permissions and adds governance foreign keys', async () => {
    const sql = await readFile(migrationPath, 'utf8');

    expect(sql).toContain('CREATE TABLE tag_permissions');
    expect(sql).toContain('FOREIGN KEY (role_key) REFERENCES roles(role_key)');
    expect(sql).toContain(
      'FOREIGN KEY (action, resource) REFERENCES permissions(action, resource)',
    );
    expect(sql).toContain('FOREIGN KEY (subject_uid) REFERENCES subjects(uid)');
    expect(sql).toContain('FOREIGN KEY (tag_key) REFERENCES tag_definitions(tag_key)');
    expect(sql).toContain('FOREIGN KEY (module_id) REFERENCES modules(module_id)');
    expect(sql).not.toMatch(/FOREIGN KEY \(owner_id\)/i);
  });

  it('rejects orphan governance rows before adding constraints', async () => {
    const sql = await readFile(migrationPath, 'utf8');
    const firstForeignKey = sql.indexOf('FOREIGN KEY');

    expect(sql).toMatch(/SIGNAL SQLSTATE '45000'/);
    expect(sql).toMatch(/orphan role_permissions/i);
    expect(sql).toMatch(/orphan role_assignments/i);
    expect(sql).toMatch(/orphan tag_permissions/i);
    expect(sql).toMatch(/orphan tag_assignments/i);
    expect(sql).toMatch(/orphan module_owners/i);
    expect(sql.indexOf('SIGNAL SQLSTATE')).toBeLessThan(firstForeignKey);
  });
});
