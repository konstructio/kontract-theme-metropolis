// The living-city layer: traffic on the road network, pedestrians, rooftop
// smog scaled by real CPU, three-alarm fires on Failed apps, blinking
// antenna tips and the fountain. Everything reads the store; nothing here
// ever calls the kontract.

import * as THREE from "three";
import { appVibe } from "../store.js";
import { mulberry32 } from "../util.js";

const MAX_CARS = 150;
const MAX_PEDS = 120;
const MAX_FIRE_LIGHTS = 4;

const CAR_COLORS = [0xd94f30, 0x3a76c4, 0xe0b83a, 0x74b06a, 0xb8b2a4, 0x513f8a, 0x39c0c8];

export function createAmbient(scene, roads, layout, particles) {
  // ---------- traffic ----------
  const carGeo = new THREE.BoxGeometry(1.1, 0.7, 2.1);
  carGeo.translate(0, 0.45, 0);
  const carMat = new THREE.MeshLambertMaterial();
  const cars = new THREE.InstancedMesh(carGeo, carMat, MAX_CARS);
  cars.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
  cars.count = 0;
  scene.add(cars);

  const carState = []; // {pathIdx, offset, speed}
  const rng = mulberry32(0xcab5);
  const dummy = new THREE.Object3D();
  const carColor = new THREE.Color();

  function pathLength(path) {
    let len = 0;
    for (let i = 1; i < path.points.length; i++) len += path.points[i].distanceTo(path.points[i - 1]);
    return len;
  }

  function pointAt(path, t) {
    // t in [0,1) along the polyline
    const total = path._len || (path._len = pathLength(path));
    let d = t * total;
    for (let i = 1; i < path.points.length; i++) {
      const seg = path.points[i].distanceTo(path.points[i - 1]);
      if (d <= seg) {
        const p = path.points[i - 1].clone().lerp(path.points[i], seg === 0 ? 0 : d / seg);
        const heading = Math.atan2(
          path.points[i].x - path.points[i - 1].x,
          path.points[i].z - path.points[i - 1].z
        );
        return { p, heading };
      }
      d -= seg;
    }
    const last = path.points[path.points.length - 1];
    return { p: last.clone(), heading: 0 };
  }

  const carHex = []; // remember each car's own paint for taxi-mode restore
  let taxiUntil = 0;

  function setTrafficDensity(liveApps) {
    const want = Math.min(MAX_CARS, 16 + liveApps * 9);
    while (carState.length < want) {
      const i = carState.length;
      carState.push({
        pathIdx: Math.floor(rng() * roads.lanePaths.length),
        offset: rng(),
        speed: 0.012 + rng() * 0.02, // fraction of path per second
      });
      carHex[i] = CAR_COLORS[Math.floor(rng() * CAR_COLORS.length)];
      carColor.setHex(performance.now() < taxiUntil ? 0x39c0c8 : carHex[i]);
      cars.setColorAt(i, carColor);
    }
    carState.length = want;
    cars.count = want;
    if (cars.instanceColor) cars.instanceColor.needsUpdate = true;
  }

  function paintFleet(hex) {
    for (let i = 0; i < carState.length; i++) {
      carColor.setHex(hex === null ? carHex[i] : hex);
      cars.setColorAt(i, carColor);
    }
    if (cars.instanceColor) cars.instanceColor.needsUpdate = true;
  }

  // easter egg: every car becomes a Civo taxi for a while
  function setTaxiMode(seconds) {
    taxiUntil = performance.now() + seconds * 1000;
    paintFleet(0x39c0c8);
    setTimeout(() => {
      if (performance.now() >= taxiUntil) paintFleet(null);
    }, seconds * 1000 + 100);
  }

  // ---------- pedestrians ----------
  const pedGeo = new THREE.CapsuleGeometry(0.16, 0.45, 2, 6);
  pedGeo.translate(0, 0.55, 0);
  const pedMat = new THREE.MeshLambertMaterial();
  const peds = new THREE.InstancedMesh(pedGeo, pedMat, MAX_PEDS);
  peds.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
  peds.count = 0;
  scene.add(peds);
  const pedState = []; // {center, radius, angle, speed, phase}
  const pedColor = new THREE.Color();

  function syncPedestrians(state) {
    // stroll loops near live buildings + around the plaza
    const spots = [{ center: new THREE.Vector3(0, 0, 0), radius: 20, weight: 3 }];
    for (const app of state.apps) {
      const vibe = appVibe(app, state.metrics);
      if (!vibe.live) continue;
      const b = layout.buildingOf(app.name);
      if (!b) continue;
      const world = new THREE.Vector3();
      b.group.getWorldPosition(world);
      spots.push({ center: world, radius: 4.5, weight: Math.min(4, vibe.replicas) });
    }
    const want = Math.min(MAX_PEDS, spots.reduce((n, s) => n + s.weight * 6, 0));
    while (pedState.length < want) {
      const i = pedState.length;
      const spot = spots[i % spots.length];
      pedState.push({
        center: spot.center,
        radius: spot.radius * (0.7 + rng() * 0.5),
        angle: rng() * Math.PI * 2,
        speed: (rng() < 0.5 ? 1 : -1) * (0.15 + rng() * 0.25),
        phase: rng() * Math.PI * 2,
      });
      pedColor.setHSL(rng(), 0.4, 0.5);
      peds.setColorAt(i, pedColor);
    }
    pedState.length = want;
    peds.count = want;
    if (peds.instanceColor) peds.instanceColor.needsUpdate = true;
  }

  // ---------- smoke / smog / fire ----------
  const emitters = new Map(); // appName -> {handle, kind}
  const fireLights = new Map(); // appName -> PointLight

  function syncSmoke(state) {
    const seen = new Set();
    let fireLightBudget = MAX_FIRE_LIGHTS;

    for (const app of state.apps) {
      const b = layout.buildingOf(app.name);
      if (!b) continue;
      const vibe = appVibe(app, state.metrics);
      const world = new THREE.Vector3();
      b.group.getWorldPosition(world);
      const topY = (b.group.userData && b.group.userData.topY) || 8;

      if (vibe.failed) {
        seen.add(app.name);
        let e = emitters.get(app.name);
        if (!e || e.kind !== "fire") {
          if (e) e.handle.remove();
          const handle = particles.addEmitter({
            pos: world.clone().setY(world.y + topY * 0.6),
            rate: 26,
            color: 0x1c1c1c,
            spread: 2.2,
            rise: 3.2,
            life: 3.2,
          });
          emitters.set(app.name, { handle, kind: "fire" });
        } else {
          e.handle.pos.copy(world).y += topY * 0.6;
        }
        if (!fireLights.has(app.name) && fireLightBudget > 0) {
          fireLightBudget--;
          const light = new THREE.PointLight(0xff5a1a, 30, 26, 1.8);
          light.position.copy(world).y += topY * 0.4;
          light.name = `fire:${app.name}`;
          scene.add(light);
          fireLights.set(app.name, light);
        }
      } else if (vibe.live && vibe.cpu01 > 0.5) {
        seen.add(app.name);
        let e = emitters.get(app.name);
        const rate = 2 + vibe.cpu01 * 6;
        if (!e || e.kind !== "smog") {
          if (e) e.handle.remove();
          const handle = particles.addEmitter({
            pos: world.clone().setY(world.y + topY + 0.5),
            rate,
            color: 0x8a8f96,
            spread: 1.2,
            rise: 1.4,
            life: 2.2,
          });
          emitters.set(app.name, { handle, kind: "smog" });
        } else {
          e.handle.setRate(rate);
        }
      }
    }

    for (const [name, e] of emitters) {
      if (!seen.has(name)) {
        e.handle.remove();
        emitters.delete(name);
      }
    }
    for (const [name, light] of fireLights) {
      if (!seen.has(name) || !emitters.get(name) || emitters.get(name).kind !== "fire") {
        light.removeFromParent();
        fireLights.delete(name);
      }
    }
  }

  // ---------- night dressing ----------
  const blinkTips = [];
  function collectBlinkers() {
    blinkTips.length = 0;
    scene.traverse((o) => {
      if (o.name === "antenna-tip") blinkTips.push(o);
    });
  }

  let fountainWater = null;

  // ---------- per-frame ----------
  let t = 0;
  function update(dt, isNight) {
    t += dt;

    for (let i = 0; i < carState.length; i++) {
      const c = carState[i];
      const path = roads.lanePaths[c.pathIdx % roads.lanePaths.length];
      c.offset += c.speed * dt * (path.loop ? 1 : 2.2);
      if (c.offset >= 1) {
        c.offset = 0;
        if (!path.loop) c.pathIdx = Math.floor(Math.random() * roads.lanePaths.length);
      }
      const { p, heading } = pointAt(path, c.offset);
      dummy.position.copy(p);
      dummy.rotation.set(0, heading, 0);
      dummy.updateMatrix();
      cars.setMatrixAt(i, dummy.matrix);
    }
    if (carState.length) cars.instanceMatrix.needsUpdate = true;

    for (let i = 0; i < pedState.length; i++) {
      const pd = pedState[i];
      pd.angle += pd.speed * dt;
      const bob = Math.abs(Math.sin(t * 6 + pd.phase)) * 0.08;
      dummy.position.set(
        pd.center.x + Math.cos(pd.angle) * pd.radius,
        pd.center.y + bob,
        pd.center.z + Math.sin(pd.angle) * pd.radius
      );
      dummy.rotation.set(0, -pd.angle + (pd.speed > 0 ? 0 : Math.PI), 0);
      dummy.updateMatrix();
      peds.setMatrixAt(i, dummy.matrix);
    }
    if (pedState.length) peds.instanceMatrix.needsUpdate = true;

    // fire flicker + antenna blink + fountain shimmer
    for (const light of fireLights.values()) {
      light.intensity = 22 + Math.sin(t * 17 + light.position.x) * 9 + Math.random() * 5;
    }
    const blinkOn = isNight && Math.sin(t * 2.4) > 0;
    for (const tip of blinkTips) {
      tip.material.color.setHex(blinkOn ? 0xff4d4d : 0x551515);
    }
    if (!fountainWater) fountainWater = scene.getObjectByName("fountain-water");
    if (fountainWater) fountainWater.position.y = 0.55 + Math.sin(t * 2) * 0.03;
  }

  // Data-driven refresh (cheap; called on store changes, not per frame).
  function sync(state) {
    const live = state.apps.filter((a) => a.phase === "Live").length;
    setTrafficDensity(live);
    syncPedestrians(state);
    syncSmoke(state);
    collectBlinkers();
  }

  return { update, sync, setTaxiMode };
}
