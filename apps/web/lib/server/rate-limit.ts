type Bucket = { count: number; resetsAt: number };

const globalBuckets = globalThis as unknown as { tymraRateLimits?: Map<string, Bucket> };
const buckets = globalBuckets.tymraRateLimits ?? new Map<string, Bucket>();
if (process.env.NODE_ENV !== "production") globalBuckets.tymraRateLimits = buckets;

export function consumeRateLimit(request: Request, scope: string, limit: number, windowMs = 60_000) {
  const now = Date.now();
  const forwarded = request.headers.get("x-forwarded-for")?.split(",")[0]?.trim();
  const identifier = forwarded || request.headers.get("x-real-ip") || "local";
  const key = `${scope}:${identifier}`;
  const current = buckets.get(key);
  const bucket = !current || current.resetsAt <= now ? { count: 0, resetsAt: now + windowMs } : current;
  bucket.count += 1;
  buckets.set(key, bucket);
  return {
    allowed: bucket.count <= limit,
    limit,
    remaining: Math.max(0, limit - bucket.count),
    retryAfterSeconds: Math.max(1, Math.ceil((bucket.resetsAt - now) / 1_000)),
  };
}
