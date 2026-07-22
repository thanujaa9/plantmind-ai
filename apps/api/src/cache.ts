type CacheEntry = { value: unknown; expiresAt: number };
const localCache = new Map<string, CacheEntry>();

const redisUrl = process.env.UPSTASH_REDIS_REST_URL;
const redisToken = process.env.UPSTASH_REDIS_REST_TOKEN;

export async function cacheGet<T>(key: string): Promise<T | undefined> {
  if (redisUrl && redisToken) {
    try {
      const response = await fetch(`${redisUrl}/get/${encodeURIComponent(key)}`, { headers: { Authorization: `Bearer ${redisToken}` } });
      const payload = await response.json() as { result?: string | null };
      return payload.result ? JSON.parse(payload.result) as T : undefined;
    } catch { return undefined; }
  }
  const entry = localCache.get(key);
  if (!entry || entry.expiresAt < Date.now()) { localCache.delete(key); return undefined; }
  return entry.value as T;
}

export async function cacheSet(key: string, value: unknown, ttlSeconds = 900) {
  if (redisUrl && redisToken) {
    try {
      await fetch(redisUrl, { method: "POST", headers: { Authorization: `Bearer ${redisToken}`, "Content-Type": "application/json" }, body: JSON.stringify(["SET", key, JSON.stringify(value), "EX", ttlSeconds]) });
      return;
    } catch { /* local fallback below */ }
  }
  localCache.set(key, { value, expiresAt: Date.now() + ttlSeconds * 1000 });
}

export function cacheBackend() {
  return redisUrl && redisToken ? "redis" : "local";
}

export function redisAvailable() {
  return Boolean(redisUrl && redisToken);
}

export async function redisCommand<T = unknown>(command: Array<string | number>): Promise<T | undefined> {
  if (!redisUrl || !redisToken) return undefined;
  try {
    const response = await fetch(redisUrl, { method: "POST", headers: { Authorization: `Bearer ${redisToken}`, "Content-Type": "application/json" }, body: JSON.stringify(command) });
    if (!response.ok) return undefined;
    return ((await response.json()) as { result?: T }).result;
  } catch { return undefined; }
}
