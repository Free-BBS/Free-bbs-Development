import { createMemoryStore } from './memory-store.js';
import { createMySqlStore, type MySqlStoreHandle } from './mysql-store.js';
import type { DevelopmentStore } from './types.js';

export type DataMode = 'memory' | 'mysql';

export interface StoreHandle {
  mode: DataMode;
  store: DevelopmentStore;
  appliedMigrationCount(): Promise<number>;
  close(): Promise<void>;
}

export function createStore(environment: NodeJS.ProcessEnv = process.env): StoreHandle {
  const mode = environment.DATA_MODE?.trim() || 'memory';
  if (mode === 'memory') {
    return {
      mode,
      store: createMemoryStore(),
      appliedMigrationCount: async () => 0,
      close: async () => undefined,
    };
  }
  if (mode === 'mysql') {
    const handle: MySqlStoreHandle = createMySqlStore({ environment });
    return {
      mode,
      store: handle.store,
      appliedMigrationCount: handle.appliedMigrationCount,
      close: handle.close,
    };
  }
  throw new Error(`Unsupported DATA_MODE: ${mode}`);
}
