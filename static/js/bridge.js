// The only module that touches the `theme` const. Feeds the store from
// the platform (polls + streams under a hard 3-stream budget) and exposes
// every write action the wizards and inspector call. Nothing else in the
// theme may talk to the platform.

import { store } from "./store.js";
import { friendlyError, parseCpu, parseMemGi } from "./util.js";

const APP_POLL_MS = 15000; // only when app-events is unavailable
const RECONCILE_MS = 60000; // safety net even in push mode
const ZONES_MS = 30000;
const QUOTA_MS = 60000;
const METRICS_TICK_MS = 20000; // metrics wheel: a few live apps per tick
const METRICS_PER_TICK = 3;

export function createBridge({ toast }) {
  /* global theme */
  const org = new URLSearchParams(window.location.search).get("org") || "";

  // ---------------- normalize ----------------
  function normalizeApp(a, idx) {
    const st = a.status || {};
    const urlReady = "url_ready" in st ? !!st.url_ready : true;
    return {
      name: a.name,
      app_name: a.app_name || a.name,
      zone_ref: a.zone_ref || "",
      phase: st.phase || "Building",
      statusMessage: st.message || "",
      url: urlReady ? st.url || "" : "",
      urlPending: !!st.url && !urlReady,
      public_url_enabled: !!a.public_url_enabled,
      size: a.size || "",
      replicas: a.replicas || 1,
      branch: a.branch || "main",
      repo_name: a.repo_name || "",
      repo_url: a.repo_url || "",
      port: a.port || 8080,
      env: Array.isArray(a.env) ? a.env : [],
      volume: a.volume && a.volume.size ? a.volume : null,
      custom_domain: a.custom_domain || "",
      domain_token: st.domain_token || "",
      domain_verified: !!st.domain_verified,
      // The API lists apps in a stable order; the index anchors lot
      // assignment so buildings never trade places between refreshes.
      created_at: idx,
    };
  }

  function normalizeZone(z, idx) {
    return {
      name: z.name,
      display_name: z.display_name || z.name,
      created_at: idx,
      status: z.status || {},
    };
  }

  // ---------------- stream budget (hard max 3) ----------------
  // Slot 1: appEvents (persistent). Slot 2: the one open logs stream.
  // Slot 3 stays free so a close-then-reopen never overlaps past the cap.
  let openCount = 0;
  function guardedSubscribe(open) {
    if (openCount >= 3) return null; // never trip the platform cap
    openCount++;
    let closed = false;
    const unsub = open(() => {
      // onClose from the platform side
      if (!closed) {
        closed = true;
        openCount--;
      }
    });
    return () => {
      if (!closed) {
        closed = true;
        openCount--;
        unsub();
      }
    };
  }

  // ---------------- refreshers ----------------
  let appsBusy = false;
  async function refreshApps() {
    if (appsBusy) return;
    appsBusy = true;
    try {
      const raw = (await theme.apps(org)) || [];
      store.update({ apps: raw.map(normalizeApp) });
    } catch (e) {
      console.warn("apps refresh failed:", e);
    } finally {
      appsBusy = false;
    }
  }

  async function refreshZones() {
    try {
      const raw = (await theme.zones(org)) || [];
      store.update({ zones: raw.map(normalizeZone) });
    } catch (e) {
      console.warn("zones refresh failed:", e);
    }
  }

  // Quota dimensions arrive as Kubernetes quantity strings ("2", "2Gi";
  // limit empty = uncapped) — normalize to numbers (cores / GiB) so the HUD
  // and fit preview do plain math. limit 0 downstream means "uncapped".
  function normalizeQuota(q) {
    const dim = (d, parse) => ({
      used: parse((d && d.used) || "0"),
      limit: parse((d && d.limit) || "0"),
    });
    return {
      plan: (q && q.plan) || "",
      capped: !!(q && q.capped),
      cpu: dim(q && q.cpu, parseCpu),
      memory: dim(q && q.memory, parseMemGi),
      storage: dim(q && q.storage, parseMemGi),
    };
  }

  async function refreshQuota() {
    const caps = store.state.platform.caps;
    if (!caps.includes("quota")) return;
    try {
      store.update({ quota: normalizeQuota(await theme.quota(org)) });
    } catch (e) {
      console.warn("quota refresh failed:", e);
    }
  }

  // metrics wheel — a few Live apps per tick so a big city never bursts.
  // NOTE: the platform does NOT advertise a "metrics" capability token
  // (platformCapabilities() in konstruct-api lists none) even though the
  // broker allows the op — so feature-detect by trying, and stand down only
  // after the op itself fails repeatedly.
  let wheelIdx = 0;
  let metricsFailStreak = 0;
  async function metricsTick() {
    if (metricsFailStreak >= 3) return; // op genuinely unavailable here
    const live = store.state.apps.filter((a) => a.phase === "Live");
    if (!live.length) return;
    const batch = [];
    for (let i = 0; i < Math.min(METRICS_PER_TICK, live.length); i++) {
      batch.push(live[(wheelIdx + i) % live.length]);
    }
    wheelIdx = (wheelIdx + METRICS_PER_TICK) % live.length;

    const metrics = { ...store.state.metrics };
    let okThisTick = 0;
    let failThisTick = 0;
    await Promise.all(
      batch.map(async (app) => {
        try {
          const res = await theme.metrics(org, app.name, { range: "1h", step: "2m" });
          const series = {};
          for (const s of (res && res.series) || []) series[s.name] = s.points || [];
          const lastOf = (s) => (s && s.length ? s[s.length - 1].v : 0);
          const cpuLimit = lastOf(series.cpu_limit);
          const memLimit = lastOf(series.memory_limit);
          const cpuPct = (p) => ({ t: p.t, v: cpuLimit > 0 ? (p.v / cpuLimit) * 100 : p.v * 100 });
          const memPct = (p) => ({ t: p.t, v: memLimit > 0 ? (p.v / memLimit) * 100 : p.v });
          metrics[app.name] = {
            cpu: (series.cpu || []).map(cpuPct),
            // memory as % of limit when the limit series exists (it does on
            // the platform); raw bytes otherwise — meters normalize either way
            mem: (series.memory || []).map(memPct),
            memIsPct: memLimit > 0,
            net: series.network_rx || series.network_tx || [],
          };
          okThisTick++;
        } catch (_) {
          failThisTick++; // decoration; skip quietly
        }
      })
    );
    if (okThisTick > 0) metricsFailStreak = 0;
    else if (failThisTick > 0) metricsFailStreak++;
    if (okThisTick > 0 || Object.keys(metrics).length) store.update({ metrics });
  }

  // ---------------- app sync: push if advertised, else poll ----------------
  let pollTimer = null;
  let eventsClose = null;
  function startPolling() {
    if (!pollTimer) pollTimer = setInterval(refreshApps, APP_POLL_MS);
  }

  function watchApps() {
    if (typeof theme.appEvents !== "function") return startPolling();
    const closer = guardedSubscribe((onPlatformClose) =>
      theme.appEvents(
        org,
        () => refreshApps(),
        (reason) => {
          onPlatformClose();
          eventsClose = null;
          if (/unsupported/i.test(reason || "")) return startPolling();
          setTimeout(watchApps, 5000);
        }
      )
    );
    if (!closer) return startPolling();
    eventsClose = closer;
    refreshApps();
  }

  // ---------------- runtime logs (slot 2) ----------------
  let logsClose = null;
  function openLogs(appName, onLine, onClosed) {
    closeLogs();
    const caps = store.state.platform.caps;
    if (!caps.includes("runtime-logs")) {
      onClosed("runtime logs not available on this platform");
      return () => {};
    }
    const closer = guardedSubscribe((onPlatformClose) =>
      theme.logs(
        org,
        appName,
        (payload) => {
          if (payload && typeof payload === "object") {
            const pod = payload.pod ? String(payload.pod).slice(-12) : "";
            const line = payload.line != null ? String(payload.line) : JSON.stringify(payload);
            onLine(pod ? `[${pod}] ${line}` : `◆ ${line}`);
          } else {
            onLine(String(payload));
          }
        },
        (reason) => {
          onPlatformClose();
          logsClose = null;
          onClosed(reason || "stream ended — reopen to resume");
        }
      )
    );
    if (!closer) {
      onClosed("stream budget exhausted — close another panel first");
      return () => {};
    }
    logsClose = closer;
    return closeLogs;
  }

  function closeLogs() {
    if (logsClose) {
      logsClose();
      logsClose = null;
    }
  }

  // ---------------- writes (called by wizards/inspector, M6) ----------------
  const actions = {
    org: () => org,

    async createZone(name, displayName) {
      await theme.createZone(org, { name, display_name: displayName });
      setTimeout(refreshZones, 1500); // ship-it pattern: give the CR a beat
      setTimeout(refreshQuota, 1600);
    },

    async deleteZone(name) {
      await theme.deleteZone(org, name);
      setTimeout(refreshZones, 1200);
    },

    async shipApp(payload) {
      // exact ship-it payload shape; namespace pinned to the launched org
      await theme.shipApp({ ...payload, namespace: org });
      await refreshApps();
      refreshQuota();
    },

    async updateApp(name, body) {
      await theme.updateApp(org, name, body);
      await refreshApps();
      refreshQuota();
    },

    async deleteApp(name) {
      await theme.deleteApp(org, name);
      await refreshApps();
      refreshQuota();
    },

    async redeploy(name) {
      await theme.redeploy(org, name);
      await refreshApps();
    },

    buildLogs: (name) => theme.buildLogs(org, name),
    deployments: (name) => theme.deployments(org, name),

    async appRepos() {
      try {
        const repos = (await theme.appRepos(org)) || [];
        if (repos.length) return repos;
      } catch (_) {
        /* fall through to derivation */
      }
      // ship-it fallback: derive repos from existing apps; honest empty
      // state if the org has never registered one
      const seen = new Map();
      for (const a of store.state.apps) {
        if (a.repo_name && !seen.has(a.repo_name)) {
          seen.set(a.repo_name, { repo_name: a.repo_name, repo_url: a.repo_url || "" });
        }
      }
      return [...seen.values()];
    },

    character: () => theme.character(org),
    saveCharacter: (spec) => theme.saveCharacter(org, spec),
    openLogs,
    closeLogs,
    refreshApps,
    refreshZones,
    refreshQuota,
  };

  // ---------------- boot ----------------
  async function boot() {
    store.update({ launched: true, org });
    let disc;
    try {
      disc = await theme.discover(org);
    } catch (e) {
      toast("CITY OFFLINE", friendlyError(e), "error");
      store.addTicker("error", `discovery failed: ${friendlyError(e)}`);
      return actions;
    }

    const caps = disc.capabilities || [];
    store.update({
      platform: {
        caps,
        sizes: disc.app_sizes || [],
        rates: disc.rates || null,
        regions: [],
        bands: disc.bands || null,
      },
      org: (disc.org && disc.org.name) || org,
    });

    await Promise.all([refreshZones(), refreshApps()]);
    refreshQuota();
    metricsTick();

    if (typeof theme.regions === "function") {
      theme.regions(org).then(
        (r) => store.update({ platform: { ...store.state.platform, regions: r || [] } }),
        () => {}
      );
    }

    if (caps.includes("app-events")) watchApps();
    else startPolling();
    setInterval(refreshApps, RECONCILE_MS); // truth wins even in push mode
    setInterval(refreshZones, ZONES_MS);
    setInterval(refreshQuota, QUOTA_MS);
    setInterval(metricsTick, METRICS_TICK_MS);

    store.addTicker("info", `Welcome back, Mayor — ${store.state.org} is on the map.`);
    return actions;
  }

  return { boot, actions };
}
