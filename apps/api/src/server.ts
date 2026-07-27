import { createApp } from './app.js';
import { createStore } from './core/database/create-store.js';

const port = Number(process.env.PORT ?? 3100);
if (!Number.isSafeInteger(port) || port < 1 || port > 65_535) {
  throw new Error('PORT must be an integer between 1 and 65535');
}

const handle = createStore();
let appliedMigrationCount: number;
try {
  appliedMigrationCount = await handle.appliedMigrationCount();
} catch (error) {
  await handle.close();
  throw error;
}
const server = createApp({
  store: handle.store,
  databaseMode: handle.mode,
  appliedMigrationCount,
}).listen(port);

async function shutdown(): Promise<void> {
  server.close(async () => {
    await handle.close();
  });
}

process.once('SIGINT', shutdown);
process.once('SIGTERM', shutdown);
