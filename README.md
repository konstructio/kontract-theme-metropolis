# kontract-theme-metropolis

Your org as a living low-poly 3D city. Districts are zones, buildings are
apps, cranes are builds, fires are failures, and the sun tracks your real
local time. A [Kontract](https://konstruct.civo.com/docs/next/konduit/kontract)
theme, `game` profile, full write surface.

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
- `KONTRACT.md` — header block generated from the manifest (never edit by hand)
- `static/kontract.js` — byte-for-byte copy from kontract-theme-starter; never edit
- `static/js/` — `main.js` boot, `store.js` CityState, `bridge.js` (only module
  that touches `kontract`), `city/` world geometry, `engine/` renderer +
  animation, `ui/` HUD/inspector/wizards/game screens
- `harness.html` — local-only mock parent window answering kontract postMessages
  with fixtures; lives at repo root so it never ships in the embedded bundle
