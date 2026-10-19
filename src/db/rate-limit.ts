// In-memory rate limiter (один процесс — как и само приложение на SQLite).
// Используется для защиты входа от перебора паролей.

type Bucket = {
  count: number;
  resetAt: number; // epoch ms
};

const buckets = new Map<string, Bucket>();

// периодическая уборка, чтобы Map не рос бесконечно
let lastSweep = Date.now();
function sweep(now: number) {
  if (now - lastSweep < 60_000) return;
  lastSweep = now;
  for (const [key, b] of buckets) {
    if (b.resetAt <= now) buckets.delete(key);
  }
}

export type RateVerdict = { ok: boolean; retryAfterSec: number; remaining: number };

/**
 * Счётчик попыток в скользящем окне: key → максимум max попыток за windowMs.
 * При превышении возвращает ok=false и секунды до разблокировки.
 */
export function rateLimit(key: string, max: number, windowMs: number): RateVerdict {
  const now = Date.now();
  sweep(now);
  const b = buckets.get(key);
  if (!b || b.resetAt <= now) {
    buckets.set(key, { count: 1, resetAt: now + windowMs });
    return { ok: true, retryAfterSec: 0, remaining: max - 1 };
  }
  b.count += 1;
  if (b.count > max) {
    return {
      ok: false,
      retryAfterSec: Math.max(1, Math.ceil((b.resetAt - now) / 1000)),
      remaining: 0,
    };
  }
  return { ok: true, retryAfterSec: 0, remaining: max - b.count };
}

/** IP клиента из заголовков прокси (за Caddy/nginx) или псевдо-IP для локальных вызовов. */
export function clientIp(req: Request): string {
  const fwd = req.headers.get("x-forwarded-for");
  if (fwd) {
    const first = fwd.split(",")[0].trim();
    if (first) return first;
  }
  return req.headers.get("x-real-ip") ?? "local";
}
