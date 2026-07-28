import { afterEach, describe, expect, it, vi } from 'vitest';

import { ApiClient, AUTH_TOKEN_STORAGE_KEY } from './client.js';

const originalFetch = globalThis.fetch;

afterEach(() => {
  globalThis.fetch = originalFetch;
  vi.restoreAllMocks();
});

describe('ApiClient browser transport', () => {
  it('keeps the shared main-site token storage contract', () => {
    expect(AUTH_TOKEN_STORAGE_KEY).toBe('free_bbs_auth_token');
  });
  it('binds the native global fetch receiver', async () => {
    globalThis.fetch = vi.fn(function (this: unknown) {
      expect(this).toBe(globalThis);
      return Promise.resolve(
        new Response(JSON.stringify({ data: { ok: true }, requestId: 'request-1' }), {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        }),
      );
    }) as typeof fetch;

    const client = new ApiClient({ authMode: 'main' });
    await expect(client.request<{ ok: boolean }>('/health')).resolves.toEqual({ ok: true });
    expect(globalThis.fetch).toHaveBeenCalledOnce();
  });
});
