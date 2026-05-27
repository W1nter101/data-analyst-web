import { Queue } from 'bullmq';
import Redis from 'ioredis';

export const redisConnection = new Redis({
  host: process.env.REDIS_HOST || 'localhost',
  port: Number(process.env.REDIS_PORT) || 6379,
  maxRetriesPerRequest: null,
});

export const chatQueue = new Queue('chat-jobs', {
  connection: redisConnection,
  defaultJobOptions: {
    removeOnComplete: { age: 3600 },  // keep completed jobs for 1 hour
    removeOnFail: { age: 86400 },     // keep failed jobs for 24 hours
  },
});
