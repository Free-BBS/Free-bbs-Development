import { readFile } from 'node:fs/promises';
import { describe, expect, it } from 'vitest';

import { splitSqlStatements } from './migrate.js';

describe('liaison problem-board migration', () => {
  it('adds five relational tables without changing the legacy liaison resource table', async () => {
    const sql = await readFile(
      new URL('../../../../../database/migrations/009_liaison_problem_board.sql', import.meta.url),
      'utf8',
    );
    expect(() => splitSqlStatements(sql)).not.toThrow();
    for (const table of [
      'liaison_problems',
      'liaison_teams',
      'liaison_team_members',
      'liaison_posts',
      'liaison_outcomes',
    ]) {
      expect(sql).toMatch(new RegExp(`CREATE TABLE ${table}\\b`, 'i'));
    }
    expect(sql).toContain('tags JSON NOT NULL');
    expect(sql.match(/DATETIME\(3\)/g)?.length).toBeGreaterThanOrEqual(14);
    expect(sql).toContain('UNIQUE KEY uq_liaison_team_member (problem_id, team_id, member_uid)');
    expect(sql).toContain('UNIQUE KEY uq_liaison_outcome_version (problem_id, team_id, version)');
    for (const constraint of [
      'fk_liaison_teams_problem',
      'fk_liaison_team_members_team',
      'fk_liaison_posts_problem',
      'fk_liaison_outcomes_team',
    ]) {
      expect(sql).toContain(`CONSTRAINT ${constraint}`);
    }
    expect(sql).not.toMatch(/\b(?:ALTER|DROP|DELETE|TRUNCATE)\s+(?:TABLE\s+)?liaison_resources\b/i);
  });

  it('defines searchable and lifecycle indexes for every board aggregate', async () => {
    const sql = await readFile(
      new URL('../../../../../database/migrations/009_liaison_problem_board.sql', import.meta.url),
      'utf8',
    );
    for (const index of [
      'idx_liaison_problems_status_deadline',
      'idx_liaison_problems_source',
      'idx_liaison_teams_problem_status',
      'idx_liaison_team_members_member',
      'idx_liaison_posts_problem_created',
      'idx_liaison_outcomes_problem_status',
    ]) {
      expect(sql).toContain(`INDEX ${index}`);
    }
  });
});
