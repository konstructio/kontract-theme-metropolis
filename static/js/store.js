// CityState — the single source of truth. bridge.js (or sample-data.js)
// writes in; city/engine/ui read out. Nothing downstream ever talks to the
// theme directly.

const state = {
  launched: false,
  org: "",
  platform: { caps: [], sizes: [], rates: null, regions: [], bands: null },
  zones: [], // [{name, display_name, created_at}]
  apps: [], // normalized: see normalizeApp in bridge/sample
  metrics: {}, // appName -> {cpu:[{t,v}], mem:[...], net:[...]}
  quota: null, // {plan, capped, cpu:{used,limit}, memory:{...}, storage:{...}}
  character: null,
  ticker: [], // [{ts, kind, text}] capped ring; text is plain text, never markup
  selection: null, // {type:'app'|'district'|'mayor'|'shop', id}
  celebration: null, // {app, friday, until}
};

const subscribers = new Set();
const TICKER_CAP = 60;

function emit(keys) {
  for (const fn of subscribers) fn(state, keys);
}

export const store = {
  get state() {
    return state;
  },

  // Patch one or more top-level keys and notify subscribers with the key set.
  update(patch) {
    const keys = Object.keys(patch);
    for (const k of keys) state[k] = patch[k];
    emit(new Set(keys));
  },

  addTicker(kind, text) {
    state.ticker.push({ ts: Date.now(), kind, text: String(text) });
    if (state.ticker.length > TICKER_CAP) state.ticker.splice(0, state.ticker.length - TICKER_CAP);
    emit(new Set(["ticker"]));
  },

  subscribe(fn) {
    subscribers.add(fn);
    return () => subscribers.delete(fn);
  },
};

// Derived per-building "vibe" — the one shape the animators care about.
// Recomputed on demand; cheap enough not to memoize yet.
export function appVibe(app, metrics) {
  const m = metrics[app.name];
  const last = (series) => (series && series.length ? series[series.length - 1].v : 0);
  const cpu01 = Math.min(1, last(m && m.cpu) / 100);
  const net01 = Math.min(1, last(m && m.net) / (1024 * 1024)); // ~1MB/s full
  return {
    phase: app.phase,
    building: app.phase === "Building" || app.phase === "Pushing" || app.phase === "Deploying",
    live: app.phase === "Live",
    failed: app.phase === "Failed",
    replicas: app.replicas || 1,
    cpu01,
    net01,
  };
}
