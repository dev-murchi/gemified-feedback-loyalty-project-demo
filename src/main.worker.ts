import { startWorker } from './composition/start-worker.js';

const worker = await startWorker();
try {
  await worker.stopped;
} catch {
  // The reason is already logged. Exit now: after a timeout, a job may still hold the event loop.
  process.exit(1);
}
