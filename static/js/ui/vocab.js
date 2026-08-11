// The theme's vocabulary, mirroring theme-manifest.yaml. Every status.phase
// renders through PHASE_WORDS; the raw phase stays available in the
// inspector so the truth is never more than one glance away.

export const PHASE_WORDS = {
  Building: "UNDER CONSTRUCTION",
  Pushing: "TOPPING OUT",
  Deploying: "FINAL INSPECTION",
  Live: "OPEN FOR BUSINESS",
  Failed: "THREE-ALARM FIRE",
};

export const PHASE_COLORS = {
  Building: "#e0b83a",
  Pushing: "#e0b83a",
  Deploying: "#39c0c8",
  Live: "#74b06a",
  Failed: "#ff4d4d",
};

export const WORDS = {
  zone: "district",
  zones: "districts",
  claimZone: "Claim District",
  app: "building",
  apps: "buildings",
  construct: "Construct",
  shop: "City Hall",
  universe: "Metro Map",
  quota: "Power Grid",
  logs: "City Wire",
  volume: "basement warehouse",
  domain: "street address",
};

export function phaseWord(phase) {
  return PHASE_WORDS[phase] || String(phase || "UNKNOWN").toUpperCase();
}

export function phaseColor(phase) {
  return PHASE_COLORS[phase] || "#f3f5f7";
}
