import { beforeEach, describe, expect, it, vi } from 'vitest';

const fakes = vi.hoisted(() => {
  type Listener = (...args: unknown[]) => void;

  const listeners = new Map<string, Set<Listener>>();
  const listen = vi.fn();
  const server = {
    listening: false,
    once: vi.fn((event: string, listener: Listener) => {
      const wrapped: Listener = (...args) => {
        server.removeListener(event, wrapped);
        listener(...args);
      };
      const eventListeners = listeners.get(event) ?? new Set<Listener>();
      eventListeners.add(wrapped);
      listeners.set(event, eventListeners);
      return server;
    }),
    on: vi.fn((event: string, listener: Listener) => {
      const eventListeners = listeners.get(event) ?? new Set<Listener>();
      eventListeners.add(listener);
      listeners.set(event, eventListeners);
      return server;
    }),
    removeListener: vi.fn((event: string, listener: Listener) => {
      listeners.get(event)?.delete(listener);
      return server;
    }),
    emit: vi.fn((event: string, ...args: unknown[]) => {
      for (const listener of [...(listeners.get(event) ?? [])]) {
        listener(...args);
      }
      return listeners.has(event);
    }),
    close: vi.fn((callback?: (error?: Error) => void) => {
      server.listening = false;
      callback?.();
      return server;
    }),
  };
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
  return {
    listeners,
    listen,
    server,
    app,
    appliedMigrationCount,
    close,
    handle,
    createStore,
    createApp,
  };
});

vi.mock('./core/database/create-store.js', () => ({ createStore: fakes.createStore }));
vi.mock('./app.js', () => ({ createApp: fakes.createApp }));

describe('production server composition', () => {
  beforeEach(() => {
    vi.resetModules();
    vi.clearAllMocks();
    fakes.listeners.clear();
    fakes.server.listening = false;
    fakes.listen.mockImplementation(() => {
      queueMicrotask(() => {
        fakes.server.listening = true;
        fakes.server.emit('listening');
      });
      return fakes.server;
    });
    fakes.appliedMigrationCount.mockResolvedValue(4);
    fakes.close.mockResolvedValue(undefined);
    fakes.createStore.mockReturnValue(fakes.handle);
    fakes.createApp.mockReturnValue(fakes.app);
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

  it('closes the store when app creation fails', async () => {
    fakes.createApp.mockImplementationOnce(() => {
      throw new Error('app creation failed');
    });

    await expect(import('./server.js')).rejects.toThrow('app creation failed');
    expect(fakes.listen).not.toHaveBeenCalled();
    expect(fakes.close).toHaveBeenCalledOnce();
  });

  it('closes the store when listen throws synchronously', async () => {
    fakes.listen.mockImplementationOnce(() => {
      throw new Error('listen failed');
    });

    await expect(import('./server.js')).rejects.toThrow('listen failed');
    expect(fakes.close).toHaveBeenCalledOnce();
  });

  it('closes the store when the server errors before listening', async () => {
    fakes.listen.mockImplementationOnce(() => {
      queueMicrotask(() => {
        fakes.server.emit('error', new Error('bind failed'));
      });
      return fakes.server;
    });

    await expect(import('./server.js')).rejects.toThrow('bind failed');
    expect(fakes.close).toHaveBeenCalledOnce();
    expect(fakes.listeners.get('error')?.size).toBe(1);
  });

  it('closes the server and store only once when shutdown repeats', async () => {
    const { startServerRuntime } = await import('./server-runtime.js');
    const runtime = await startServerRuntime({ port: 3100 });

    await Promise.all([runtime.close(), runtime.close()]);

    expect(fakes.server.close).toHaveBeenCalledOnce();
    expect(fakes.close).toHaveBeenCalledOnce();
  });
});
