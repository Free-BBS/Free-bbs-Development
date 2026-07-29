import { describe, expect, it } from 'vitest';

import { DEMO_USER_IDS } from './client.js';

describe('demo preview identities', () => {
  it('exposes the complete representative identity matrix', () => {
    expect(DEMO_USER_IDS).toEqual([
      'demo-student',
      'demo-admin',
      'demo-rights-member',
      'demo-liaison-member',
      'demo-sports-lead',
      'demo-sports-director',
      'demo-captain',
      'demo-tuanwei-lead',
    ]);
  });
});
