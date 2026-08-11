// SAMPLE CITY fixtures — standalone mode only, always behind the banner.
// Everything here is explicitly demonstration data ([SAMPLE] tags in the
// ticker); writes are disabled in this mode and say why. The shape matches
// what bridge.js normalizes from the real platform so everything downstream
// of the store is identical.

const T0 = Date.now() - 1000 * 60 * 60 * 24 * 30; // "a month ago"
const DAY = 1000 * 60 * 60 * 24;

export const SAMPLE_ORG = "sample";

export function sampleSnapshot() {
  return {
    launched: false,
    org: SAMPLE_ORG,
    platform: {
      caps: [
        "apps", "zones", "quota", "runtime-logs", "app-events",
        "volumes", "custom-domains", "metrics", "character",
      ],
      sizes: [
        { key: "xs", cpu: "250m", memory: "256Mi" },
        { key: "s", cpu: "500m", memory: "512Mi" },
        { key: "m", cpu: "1", memory: "1Gi" },
        { key: "l", cpu: "2", memory: "2Gi" },
      ],
      rates: null,
      regions: [],
      bands: null,
    },
    zones: [
      { name: "old-town", display_name: "Old Town", created_at: T0 },
      { name: "harborfront", display_name: "Harborfront", created_at: T0 + 4 * DAY },
      { name: "foundry", display_name: "The Foundry", created_at: T0 + 11 * DAY },
    ],
    apps: [
      app("city-gazette", "old-town", "Live", "m", 2, T0 + DAY, { url: "https://city-gazette.sample.example" }),
      app("bakery-pos", "old-town", "Live", "s", 1, T0 + 2 * DAY, {}),
      app("tram-scheduler", "old-town", "Live", "l", 3, T0 + 3 * DAY, { url: "https://trams.sample.example" }),
      app("tide-gauge", "harborfront", "Live", "xs", 1, T0 + 5 * DAY, {}),
      app("cargo-manifest", "harborfront", "Deploying", "m", 2, T0 + 6 * DAY, {}),
      app("crane-controller", "harborfront", "Pushing", "s", 1, T0 + 7 * DAY, {}),
      app("smelter-api", "foundry", "Building", "l", 1, T0 + 12 * DAY, {}),
      app("slag-reporter", "foundry", "Failed", "s", 1, T0 + 13 * DAY, {
        message: "build failed: branch 'prod' not found in repository",
      }),
    ],
    metrics: sampleMetrics(),
    quota: {
      plan: "sample",
      capped: true,
      cpu: { used: 6.25, limit: 12 },
      memory: { used: 6.5, limit: 16 },
      storage: { used: 4, limit: 20 },
    },
    character: null,
  };
}

function app(name, zone, phase, size, replicas, createdAt, extra) {
  return {
    name,
    app_name: name,
    zone_ref: zone,
    phase,
    statusMessage: extra.message || "",
    url: extra.url || "",
    public_url_enabled: !!extra.url,
    size,
    replicas,
    branch: "main",
    repo_name: `sample/${name}`,
    repo_url: `https://git.example.com/sample/${name}`,
    port: 8080,
    env: [],
    volume: null,
    custom_domain: "",
    created_at: createdAt,
  };
}

function series(base, wobble, n = 30) {
  const out = [];
  const now = Date.now();
  for (let i = n - 1; i >= 0; i--) {
    const v = Math.max(0, base + Math.sin((n - i) / 4) * wobble + (i % 5) * wobble * 0.1);
    out.push({ t: now - i * 120000, v });
  }
  return out;
}

function sampleMetrics() {
  return {
    "city-gazette": { cpu: series(42, 14), mem: series(48, 6), net: series(300000, 150000) },
    "bakery-pos": { cpu: series(12, 6), mem: series(30, 4), net: series(40000, 20000) },
    "tram-scheduler": { cpu: series(71, 18), mem: series(64, 8), net: series(700000, 250000) },
    "tide-gauge": { cpu: series(6, 3), mem: series(22, 3), net: series(9000, 4000) },
    "cargo-manifest": { cpu: series(20, 8), mem: series(35, 5), net: series(120000, 60000) },
  };
}

// M3 replaces this stub with the scripted timeline (a building cycling
// Building → Live so cranes and the ship moment demo themselves).
export function startSampleTimeline() {}
