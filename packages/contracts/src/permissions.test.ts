import { describe, expect, it } from 'vitest';

import { validateTagScope } from './permissions.js';

describe('permission tag scopes', () => {
  it('requires a sports team scope for a sports team captain tag', () => {
    expect(validateTagScope('sports.team_captain', undefined)).toBe(false);
    expect(validateTagScope('sports.team_captain', { type: 'sports_team', id: '*' })).toBe(false);
    expect(validateTagScope('sports.team_captain', { type: 'sports_team', id: '' })).toBe(false);
    expect(validateTagScope('sports.team_captain', { type: 'sports_team', id: 'team-1' })).toBe(
      true,
    );
  });
});
