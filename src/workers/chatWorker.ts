/**
 * chatWorker.ts — BullMQ Worker for async AI chat processing.
 *
 * Runs as a separate Node.js process:
 *   npm run worker
 *
 * Picks up jobs from the 'chat-jobs' queue and processes them
 * using the shared chatProcessor module.
 */

import { loadEnvConfig } from '@next/env';
loadEnvConfig(process.cwd());

import 'tsconfig-paths/register';
import { Worker } from 'bullmq';
import { redisConnection } from '@/lib/queue';
import { processChat, type ChatJobInput } from '@/lib/chatProcessor';

const worker = new Worker(
  'chat-jobs',
  async (job) => {
    const input = job.data as ChatJobInput;
    console.log(
      `[worker] Processing job ${job.id} | query: "${input.user_query.slice(0, 60)}..."`,
    );

    const result = await processChat(input);

    console.log(
      `[worker] Completed job ${job.id} | intent: ${result.intent}`,
    );
    return result;
  },
  {
    connection: redisConnection,
    concurrency: 2, // process up to 2 jobs in parallel
  },
);

worker.on('failed', (job, err) => {
  console.error(`[worker] Job ${job?.id} failed:`, err.message);
});

worker.on('error', (err) => {
  console.error('[worker] Worker error:', err);
});

console.log('[worker] Chat worker started, waiting for jobs...');
