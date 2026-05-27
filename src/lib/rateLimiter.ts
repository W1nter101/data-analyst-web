import { redisConnection } from './queue';

export async function rateLimit(
  ip: string,
  limit: number = 20,
  windowSec: number = 60
): Promise<{ allowed: boolean; remaining: number; resetIn: number }> {
  const key = `ratelimit:${ip}`;
  const current = await redisConnection.incr(key);
  if (current === 1) {
    await redisConnection.expire(key, windowSec);
  }
  const ttl = await redisConnection.ttl(key);
  return {
    allowed: current <= limit,
    remaining: Math.max(0, limit - current),
    resetIn: ttl,
  };
}
