// Rooftop utility gauges: every Live building carries three slim bars —
// gold = CPU, teal = memory, green = network — that rise and fall with the
// real metrics. Two instanced draws for the whole city (tracks + fills);
// heights ease toward their targets every frame so the district visibly
// breathes between metric ticks.

import * as THREE from "three";

const MAX_BARS = 600; // 3 per building, 200 buildings
const BAR_W = 0.55;
const BAR_GAP = 0.85;
const BAR_MAX_H = 3.0;
const MIN_H = 0.1; // a live-but-idle building still shows a sliver

const COLORS = {
  cpu: new THREE.Color(0xf5a623),
  mem: new THREE.Color(0x39c0c8),
  net: new THREE.Color(0x74b06a),
};

export function createMeters(scene, layout, store) {
  // slim full-height tracks BEHIND the fills (thinner than them, never
  // enclosing them) so the gauge reads as a gauge even when idle
  const trackGeo = new THREE.BoxGeometry(BAR_W * 0.45, BAR_MAX_H, BAR_W * 0.45);
  trackGeo.translate(0, BAR_MAX_H / 2, 0);
  const tracks = new THREE.InstancedMesh(
    trackGeo,
    new THREE.MeshLambertMaterial({ color: 0x10161d }),
    MAX_BARS
  );
  tracks.count = 0;
  scene.add(tracks);

  // unit-height fill, scaled per instance; unlit basic material so the bars
  // read at full saturation day and night
  const fillGeo = new THREE.BoxGeometry(BAR_W, 1, BAR_W);
  fillGeo.translate(0, 0.5, 0);
  const fills = new THREE.InstancedMesh(fillGeo, new THREE.MeshBasicMaterial(), MAX_BARS);
  fills.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
  fills.count = 0;
  scene.add(fills);

  const dummy = new THREE.Object3D();
  // per-bar state: {x,y,z, current, target}
  let bars = [];

  const last = (s) => (s && s.length ? s[s.length - 1].v : 0);

  function targetsFor(app, metrics) {
    const m = metrics[app.name];
    if (!m) return null;
    const cpu01 = Math.min(1, last(m.cpu) / 100);
    // mem arrives as % of limit on the platform; raw-bytes fallback is
    // normalized against the series' own peak so the bar still moves
    let mem01;
    if (m.memIsPct !== false) {
      mem01 = Math.min(1, last(m.mem) / 100);
    } else {
      const peak = Math.max(...(m.mem || [{ v: 1 }]).map((p) => p.v), 1);
      mem01 = Math.min(1, last(m.mem) / peak);
    }
    const net01 = Math.min(1, last(m.net) / (1024 * 1024)); // ~1 MB/s = full
    return { cpu01, mem01, net01 };
  }

  // Rebuild bar placements from the current city (on store changes).
  function sync(state) {
    const prev = new Map(bars.map((b) => [b.key, b.current]));
    bars = [];
    for (const app of state.apps) {
      if (app.phase !== "Live") continue; // construction has cranes, failure has fire
      const b = layout.buildingOf(app.name);
      if (!b || b.group.userData.construction) continue;
      const t = targetsFor(app, state.metrics);
      // the generator recorded where the real roof is (top tiers differ per
      // archetype); fall back to the roofline center
      const ud = b.group.userData;
      const anchorLocal = ud.meterAnchor || [0, ud.topY || 6, 0];
      const anchor = b.group.localToWorld(new THREE.Vector3(...anchorLocal));
      const vals = t || { cpu01: 0, mem01: 0, net01: 0 };
      [["cpu", vals.cpu01], ["mem", vals.mem01], ["net", vals.net01]].forEach(([kind, v], i) => {
        if (bars.length >= MAX_BARS) return;
        const key = `${app.name}:${kind}`;
        bars.push({
          key,
          kind,
          x: anchor.x + (i - 1) * BAR_GAP,
          y: anchor.y + 0.12,
          z: anchor.z,
          current: prev.get(key) ?? MIN_H,
          target: t ? Math.max(MIN_H, v * BAR_MAX_H) : MIN_H,
          hasData: !!t,
        });
      });
    }

    tracks.count = bars.length;
    fills.count = bars.length;
    bars.forEach((bar, i) => {
      dummy.position.set(bar.x, bar.y, bar.z);
      dummy.scale.set(1, 1, 1);
      dummy.updateMatrix();
      tracks.setMatrixAt(i, dummy.matrix);
      // fills colored by kind; no-data bars go dim grey until metrics land
      fills.setColorAt(i, bar.hasData ? COLORS[bar.kind] : new THREE.Color(0x3a4250));
    });
    tracks.instanceMatrix.needsUpdate = true;
    if (fills.instanceColor) fills.instanceColor.needsUpdate = true;
  }

  // Ease heights toward targets — the "live" in live indicators.
  function update(dt) {
    if (!bars.length) return;
    const k = Math.min(1, dt * 2.2);
    let moved = false;
    bars.forEach((bar, i) => {
      const next = bar.current + (bar.target - bar.current) * k;
      if (Math.abs(next - bar.current) > 0.0004) moved = true;
      bar.current = next;
      dummy.position.set(bar.x, bar.y, bar.z);
      dummy.scale.set(1, Math.max(MIN_H, bar.current), 1);
      dummy.updateMatrix();
      fills.setMatrixAt(i, dummy.matrix);
    });
    if (moved) fills.instanceMatrix.needsUpdate = true;
  }

  return { sync, update };
}
