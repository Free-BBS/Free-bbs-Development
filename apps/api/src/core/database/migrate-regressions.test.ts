import type { PoolConnection } from 'mysql2/promise';
import { describe, expect, it, vi } from 'vitest';

import { applyMigration, splitSqlStatements } from './migrate.js';

describe('migration parser and integrity regressions', () => {
  it('does not split semicolons inside quoted values, identifiers or comments', () => {
    const statements = splitSqlStatements(`
      INSERT INTO notes (body) VALUES ('single;quote');
      -- line comment with ; delimiter
      INSERT INTO notes (body) VALUES ("double;quote");
      /* block comment with ; delimiter */ SELECT \`semi;identifier\` FROM notes;
    `);

    expect(statements).toHaveLength(3);
    expect(statements[0]).toContain("'single;quote'");
    expect(statements[1]).toContain('"double;quote"');
    expect(statements[2]).toContain('`semi;identifier`');
  });

  it('explicitly rejects DELIMITER directives', () => {
    expect(() => splitSqlStatements('DELIMITER //\nCREATE PROCEDURE p() SELECT 1//')).toThrow(
      'DELIMITER',
    );
  });

  it('rejects an already-applied migration whose checksum changed', async () => {
    const connection = {
      execute: vi.fn().mockResolvedValue([[{ name: '001_core.sql', checksum: 'old' }], []]),
    } as unknown as PoolConnection;

    await expect(
      applyMigration(connection, {
        name: '001_core.sql',
        path: 'must-not-be-read.sql',
        checksum: 'new',
      }),
    ).rejects.toThrow('Migration checksum mismatch: 001_core.sql');
  });
});
