import { beforeEach, describe, expect, it, vi } from 'vitest';

const fakes = vi.hoisted(() => {
  const listen = vi.fn();
  const server = { close: vi.fn() };
  const app = { listen };
  const appliedMigrationCount = vi.fn();
  const close = vi.fn();
  const handle = {
    mode: 'mysql' as const,
    store: { marker: 'store' },
    appliedMigrationCount,
    close,
  };
  const createStore = vi.fn(() => handle);
  const createApp = vi.fn(() => app);
  return { listen, server, app, appliedMigrationCount, close, handle, createStore, createApp };
});

vi.mock('./core/database/create-store.js', () => ({ createStore: fakes.createStore }));
vi.mock('./app.js', () => ({ createApp: fakes.createApp }));

describe('production server composition', () => {
  beforeEach(() => {
    vi.resetModules();
    vi.clearAllMocks();
    fakes.listen.mockReturnValue(fakes.server);
    fakes.appliedMigrationCount.mockResolvedValue(4);
  });

  it('awaits and injects the applied migration count before listening', async () => {
    await import('./server.js');

    expect(fakes.appliedMigrationCount).toHaveBeenCalledOnce();
    expect(fakes.createApp).toHaveBeenCalledWith({
      store: fakes.handle.store,
      databaseMode: 'mysql',
      appliedMigrationCount: 4,
    });
    expect(fakes.listen).toHaveBeenCalledOnce();
  });

  it('fails startup and closes the store when migration count cannot be read', async () => {
    fakes.appliedMigrationCount.mockRejectedValueOnce(new Error('schema_migrations unavailable'));

    await expect(import('./server.js')).rejects.toThrow('schema_migrations unavailable');
    expect(fakes.createApp).not.toHaveBeenCalled();
    expect(fakes.listen).not.toHaveBeenCalled();
    expect(fakes.close).toHaveBeenCalledOnce();
  });
});
