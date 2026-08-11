# KONTRACT
version: v2
theme: metropolis
profile: game
capabilities: [apps, zones, shop, character, universe, quota, runtime-logs, app-events, volumes, custom-domains, metrics]
vocabulary:
  zone: { singular: district, plural: districts, verb: claim }
  app: { singular: building, plural: buildings, verb: construct }
  deploy: { verb: construct }
  shop: { name: "City Hall" }
  universe: { name: "Metro Map" }
  quota: { name: "Power Grid" }
  logs: { name: "City Wire" }
  volume: { singular: "basement warehouse", verb: attach }
  domain: { singular: "street address", verb: register }

This header is a faithful subset of `theme-manifest.yaml` — the manifest is
the source of truth; regenerate this block from it, never let the two drift.

## What this theme is

Metropolis renders the launched org as a living low-poly 3D city under a
real-time sun: districts are zones, buildings are apps, cranes rise while a
build runs, windows light with real CPU at night, and a Failed app is a
three-alarm fire you cannot miss. Every write the city offers is real —
claiming a district calls createZone, constructing a building calls shipApp,
demolition calls deleteApp — and every state shown traces to the platform.

Standalone (not launched from Konstruct) it shows an honest SAMPLE CITY with
a persistent banner; writes are disabled and say why.
