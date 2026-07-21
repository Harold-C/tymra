import { randomUUID } from "node:crypto";

import { createClient, type RedisClientType } from "redis";

type JsonValue = string | number | boolean | null | JsonValue[] | { [key: string]: JsonValue };

const globalRedis = globalThis as unknown as { tymraRedis?: RedisClientType };

export function getRedisClient(redisUrl: string = process.env.REDIS_URL ?? "redis://127.0.0.1:6379"): RedisClientType {
  if (!globalRedis.tymraRedis) {
    globalRedis.tymraRedis = createClient({ url: redisUrl, socket: { connectTimeout: 2_000, reconnectStrategy: (retries) => Math.min(2_000, 100 * 2 ** retries) } });
    globalRedis.tymraRedis.on("error", (error) => {
      process.stderr.write(JSON.stringify({ service: "tymra-redis", event: "redis_error", message: error.message }) + "\n");
    });
  }
  return globalRedis.tymraRedis;
}

export async function connectRedis(redisUrl?: string): Promise<RedisClientType> {
  const client = getRedisClient(redisUrl);
  if (!client.isOpen) await client.connect();
  return client;
}

export async function redisHealth(redisUrl?: string): Promise<{ healthy: boolean; latencyMs: number; message: string }> {
  const started = Date.now();
  try {
    const client = await connectRedis(redisUrl);
    const response = await client.ping();
    return { healthy: response === "PONG", latencyMs: Date.now() - started, message: response };
  } catch (error) {
    return { healthy: false, latencyMs: Date.now() - started, message: error instanceof Error ? error.message : "Redis health check failed" };
  }
}

export async function getJsonCache<T extends JsonValue>(key: string, redisUrl?: string): Promise<T | null> {
  const value = await (await connectRedis(redisUrl)).get(namespaced(key));
  return value ? JSON.parse(value) as T : null;
}

export async function setJsonCache(key: string, value: JsonValue, ttlSeconds: number, redisUrl?: string): Promise<void> {
  await (await connectRedis(redisUrl)).set(namespaced(key), JSON.stringify(value), { EX: ttlSeconds });
}

export async function withRedisLock<T>(key: string, ttlMs: number, operation: () => Promise<T>, redisUrl?: string): Promise<T> {
  const client = await connectRedis(redisUrl);
  const lockKey = namespaced(`lock:${key}`);
  const token = randomUUID();
  const acquired = await client.set(lockKey, token, { NX: true, PX: ttlMs });
  if (acquired !== "OK") throw new RedisLockUnavailableError(key);
  try {
    return await operation();
  } finally {
    await client.eval("if redis.call('get', KEYS[1]) == ARGV[1] then return redis.call('del', KEYS[1]) else return 0 end", { keys: [lockKey], arguments: [token] });
  }
}

export async function closeRedis(): Promise<void> {
  const client = globalRedis.tymraRedis;
  if (client?.isOpen) await client.quit();
  globalRedis.tymraRedis = undefined;
}

export class RedisLockUnavailableError extends Error {
  constructor(readonly key: string) {
    super(`Redis lock is already held for ${key}`);
    this.name = "RedisLockUnavailableError";
  }
}

function namespaced(key: string): string {
  return `tymra:v1:${key}`;
}
