import { startServerRuntime } from './server-runtime.js';

const port = Number(process.env.PORT ?? 3100);
if (!Number.isSafeInteger(port) || port < 1 || port > 65_535) {
  throw new Error('PORT must be an integer between 1 and 65535');
}

const runtime = await startServerRuntime({ port });

async function shutdown(): Promise<void> {
  try {
    await runtime.close();
  } catch (error) {
    console.error('Failed to shut down the API server cleanly', error);
    process.exitCode = 1;
  }
}

process.once('SIGINT', shutdown);
process.once('SIGTERM', shutdown);
