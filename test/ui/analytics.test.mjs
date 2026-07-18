import { describe, it, expect, vi } from 'vitest';
import { createAnalytics, shouldLog } from '../../src/analytics.mjs';

function stubStorage() {
  const m = new Map();
  return { getItem: (k) => (m.has(k) ? m.get(k) : null), setItem: (k, v) => m.set(k, String(v)) };
}

describe('shouldLog dedupe', () => {
  it('returns true once per (event, day), then false', () => {
    const s = stubStorage();
    expect(shouldLog(s, 'open', '2026-07-17')).toBe(true);
    expect(shouldLog(s, 'open', '2026-07-17')).toBe(false);
    expect(shouldLog(s, 'open', '2026-07-18')).toBe(true); // different day
  });
});

describe('createAnalytics', () => {
  it('fires open at most once per device per day across repeated calls', () => {
    const record = vi.fn();
    const a = createAnalytics({ deviceId: 'dev-1', storage: stubStorage(), record });
    a.logOpen('2026-07-17');
    a.logOpen('2026-07-17');
    a.logOpen('2026-07-17');
    expect(record).toHaveBeenCalledTimes(1);
    expect(record).toHaveBeenCalledWith({ deviceId: 'dev-1', event: 'open', puzzleDate: '2026-07-17' });
  });

  it('fires complete exactly once per finished puzzle', () => {
    const record = vi.fn();
    const a = createAnalytics({ deviceId: 'dev-1', storage: stubStorage(), record });
    a.logComplete('2026-07-17');
    a.logComplete('2026-07-17');
    expect(record).toHaveBeenCalledTimes(1);
  });

  it('tracks open and complete independently on the same day', () => {
    const record = vi.fn();
    const a = createAnalytics({ deviceId: 'dev-1', storage: stubStorage(), record });
    a.logOpen('2026-07-17');
    a.logComplete('2026-07-17');
    a.logShare('2026-07-17');
    expect(record).toHaveBeenCalledTimes(3);
  });
});
