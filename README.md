# theme-metropolis

Your org as a living low-poly 3D city. Districts are zones, buildings are
apps, cranes are builds, fires are failures, and the sun tracks your real
local time. A [Theme](https://konstruct.civo.com/docs/next/konduit/theme)
theme, `game` profile, full write surface. A
[Theme Labs](https://konstruct.civo.com/docs/next/konduit/labs) experiment —
unsupported, fun on purpose.

Upstream: [konstructio/theme-metropolis](https://github.com/konstructio/theme-metropolis).

Rendering: three.js (vendored in `static/vendor/`, no build step, no CDN).
Server: the starter theme's Go static server (`go:embed`), built by
Cloud Native Buildpacks (go-dist) — no Dockerfile.

## Develop

```bash
go run .            # http://localhost:8080 — standalone SAMPLE CITY mode
open harness.html   # mock Konstruct parent: launched mode with fixtures
```

Dev-only query params:

- `?time=HH:MM` — override the day/night clock (e.g. `?time=23:00` for neon night)

## Layout

- `theme-manifest.yaml` — source of truth for the theme's self-description
- `THEME.md` — header block generated from the manifest (never edit by hand)
- `static/theme.js` — byte-for-byte copy from theme-starter; never edit
- `static/js/` — `main.js` boot, `store.js` CityState, `bridge.js` (only module
  that touches `theme`), `city/` world geometry, `engine/` renderer +
  animation, `ui/` HUD/inspector/wizards/game screens
- `harness.html` — local-only mock parent window answering theme postMessages
  with fixtures; lives at repo root so it never ships in the embedded bundle
