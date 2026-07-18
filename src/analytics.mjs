// First-party analytics client (U9, KTD6). Fires open/complete/share to
// record_event. The server dedupes authoritatively on (device, event,
// puzzle_date); this adds a client-side once-per-day courtesy dedupe so a reload
// storm doesn't hammer the RPC. No IP, no user-agent, no third-party analytics.
import { recordEvent } from './backend.mjs';

const LOG_PREFIX = 'cg:ev:';

function memStorage() {
  const m = new Map();
  return { getItem: (k) => (m.has(k) ? m.get(k) : null), setItem: (k, v) => m.set(k, String(v)) };
}

// Pure dedupe predicate — testable. Returns true the first time an (event,
// puzzleDate) pair is seen for this storage, false afterwards.
export function shouldLog(storage, event, puzzleDate) {
  const key = `${LOG_PREFIX}${event}:${puzzleDate}`;
  if (storage.getItem(key)) return false;
  storage.setItem(key, '1');
  return true;
}

export function createAnalytics({
  deviceId,
  storage = typeof localStorage !== 'undefined' ? localStorage : memStorage(),
  record = recordEvent,
} = {}) {
  function log(event, puzzleDate) {
    if (!shouldLog(storage, event, puzzleDate)) return false;
    record({ deviceId, event, puzzleDate });
    return true;
  }
  return {
    logOpen: (d) => log('open', d),
    logComplete: (d) => log('complete', d),
    logShare: (d) => log('share', d),
  };
}
