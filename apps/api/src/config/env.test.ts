import { describe, expect, it } from 'vitest';

import { loadEnvironment } from './env.js';

describe('API listener environment', () => {
  it('defaults the API to the production loopback listener', () => {
    expect(loadEnvironment({})).toMatchObject({ host: '127.0.0.1', port: 3100 });
  });

  it.each([
    [{ HOST: 'localhost' }, 'HOST'],
    [{ HOST: '0.0.0.0' }, 'HOST'],
    [{ HOST: 'not-an-ip' }, 'HOST'],
    [{ PORT: '0' }, 'PORT'],
    [{ PORT: '65536' }, 'PORT'],
    [{ PORT: '3100.5' }, 'PORT'],
  ])('rejects invalid listener configuration %#', (source, errorName) => {
    expect(() => loadEnvironment(source)).toThrow(errorName);
  });
});
