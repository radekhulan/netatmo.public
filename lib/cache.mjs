import { logEvent } from './log.mjs';

export function cachedSource(source, load, ttl, maxAge = ttl * 6, periodKey) {
  let last;
  let pending;
  let pendingPeriod;
  let revision = 0;
  let pendingRevision;
  let retryAfter = 0;

  return {
    async get(force = false) {
      const now = Date.now();
      const period = periodKey?.(now);
      if (last && !force && period === last.period && now < last.startedAt + ttl && !retryAfter) {
        return { state: 'live', at: last.time, data: last.data };
      }
      if (pending) {
        if (period === pendingPeriod && revision === pendingRevision) return pending;
        await pending;
        return this.get(force);
      }
      if (!force && now < retryAfter) {
        if (last && now < last.time + maxAge) return { state: 'stale', at: last.time, data: last.data };
        return { state: 'error' };
      }
      pendingPeriod = period;
      const startedRevision = pendingRevision = revision;
      pending = Promise.resolve().then(async () => {
        try {
          const data = await load();
          const time = Date.now();
          logEvent('info', retryAfter ? 'poll.recovered' : 'poll.completed', {
            source, durationMs: time - now, intervalMs: ttl, offline: data?.offline || undefined,
          });
          if (revision === startedRevision) {
            last = { startedAt: now, time, data, period };
            retryAfter = 0;
          }
          return { state: 'live', at: time, data };
        } catch (error) {
          const retryMs = Math.min(ttl, 30_000);
          logEvent('warning', 'poll.failed', { source, durationMs: Date.now() - now, retryMs }, error);
          if (revision === startedRevision) retryAfter = Date.now() + retryMs;
          if (last && Date.now() < last.time + maxAge) {
            return { state: 'stale', at: last.time, data: last.data };
          }
          return { state: 'error' };
        } finally {
          pending = null;
        }
      });
      return pending;
    },
    invalidate() {
      revision++;
      last = undefined;
      retryAfter = 0;
    },
  };
}
