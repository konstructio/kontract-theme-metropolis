// Procedural buildings. Every visual choice flows from one seed —
// hash(zone/app) — so a building looks identical on every visit, on every
// machine, and only changes when the app itself changes (size, replicas).

import * as THREE from "three";
import { fnv1a, mulberry32, clamp, pick } from "../util.js";

export const FLOOR_H = 1.15;
// Floors by *index* into discover().app_sizes — never by key name; the
// platform owns the size vocabulary.
const FLOORS_BY_SIZE_INDEX = [4, 7, 11, 15, 19, 23];

const ARCHETYPES = ["tower", "slab", "setback", "twin"];

export function buildingSeed(app) {
  return fnv1a(`${app.zone_ref}/${app.name}`);
}

export function floorsFor(app, sizeIndex, rng) {
  const base = FLOORS_BY_SIZE_INDEX[clamp(sizeIndex, 0, FLOORS_BY_SIZE_INDEX.length - 1)] ?? 7;
  return Math.max(3, base + Math.floor(rng() * 5) - 2);
}

function facadeMaterial(rng, districtHue) {
  const accent = rng() < 0.12;
  const color = new THREE.Color();
  if (accent) {
    color.setHSL(pick(rng, [0.51, 0.08]), 0.55, 0.55); // teal or gold pop
  } else {
    const h = (districtHue + (rng() - 0.5) * 0.1 + 1) % 1;
    color.setHSL(h, 0.18 + rng() * 0.2, 0.52 + rng() * 0.16);
  }
  return new THREE.MeshLambertMaterial({ color });
}

function box(w, h, d, material, x, y, z) {
  const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), material);
  m.position.set(x, y + h / 2, z);
  m.castShadow = true;
  m.receiveShadow = true;
  return m;
}

function roofProps(rng, group, topY, w, d, material) {
  if (rng() < 0.55) {
    // water tank
    const tank = new THREE.Mesh(
      new THREE.CylinderGeometry(0.7, 0.7, 1.2, 10),
      new THREE.MeshLambertMaterial({ color: 0x7a6a58 })
    );
    tank.position.set((rng() - 0.5) * w * 0.5, topY + 0.6, (rng() - 0.5) * d * 0.5);
    tank.castShadow = true;
    group.add(tank);
  }
  if (rng() < 0.7) {
    // AC units
    const n = 1 + Math.floor(rng() * 3);
    for (let i = 0; i < n; i++) {
      const ac = new THREE.Mesh(
        new THREE.BoxGeometry(0.8, 0.5, 0.8),
        new THREE.MeshLambertMaterial({ color: 0x9aa4ab })
      );
      ac.position.set((rng() - 0.5) * w * 0.6, topY + 0.25, (rng() - 0.5) * d * 0.6);
      group.add(ac);
    }
  }
  if (rng() < 0.4) {
    // antenna
    const mast = new THREE.Mesh(
      new THREE.CylinderGeometry(0.05, 0.08, 2.4, 6),
      new THREE.MeshLambertMaterial({ color: 0x8a939b })
    );
    mast.position.set((rng() - 0.5) * w * 0.4, topY + 1.2, (rng() - 0.5) * d * 0.4);
    group.add(mast);
    const tip = new THREE.Mesh(
      new THREE.SphereGeometry(0.12, 6, 6),
      new THREE.MeshBasicMaterial({ color: 0xff4d4d })
    );
    tip.position.copy(mast.position).y += 1.25;
    tip.name = "antenna-tip"; // blinks at night (M3)
    group.add(tip);
  }
  if (rng() < 0.25) {
    // rooftop garden
    const green = new THREE.Mesh(
      new THREE.BoxGeometry(w * 0.5, 0.18, d * 0.4),
      new THREE.MeshLambertMaterial({ color: 0x4f7d4a })
    );
    green.position.set((rng() - 0.5) * w * 0.3, topY + 0.09, (rng() - 0.5) * d * 0.3);
    group.add(green);
  }
}

// The main body meshes for one tower; height in floors.
function towerBody(rng, material, floors, w, d) {
  const parts = [];
  const h = floors * FLOOR_H;
  parts.push(box(w, h, d, material, 0, 0, 0));
  // parapet lip
  const lip = new THREE.Mesh(
    new THREE.BoxGeometry(w + 0.24, 0.22, d + 0.24),
    material
  );
  lip.position.y = h + 0.11;
  lip.castShadow = true;
  parts.push(lip);
  return { parts, topY: h };
}

export function createBuilding(app, sizeIndex, districtHue) {
  const rng = mulberry32(buildingSeed(app));
  const group = new THREE.Group();
  group.name = `building:${app.name}`;

  const material = facadeMaterial(rng, districtHue);
  const archetype = pick(rng, ARCHETYPES);
  const floors = floorsFor(app, sizeIndex, rng);
  const replicas = Math.max(1, app.replicas || 1);

  let mainW = 4.6 + rng() * 1.6;
  let mainD = 4.6 + rng() * 1.6;
  let topY = 0;

  if (archetype === "slab") {
    mainW += 2.6;
    const body = towerBody(rng, material, Math.max(3, floors - 2), mainW, mainD);
    body.parts.forEach((p) => group.add(p));
    topY = body.topY;
  } else if (archetype === "setback") {
    // wedding-cake: 2-3 tiers shrinking as they rise
    const tiers = 2 + (rng() < 0.5 ? 1 : 0);
    let w = mainW + 1.6;
    let d = mainD + 1.6;
    let y = 0;
    const per = Math.max(2, Math.floor(floors / tiers));
    for (let t = 0; t < tiers; t++) {
      const h = per * FLOOR_H;
      group.add(box(w, h, d, material, 0, y, 0));
      y += h;
      w *= 0.72;
      d *= 0.72;
    }
    topY = y;
  } else if (archetype === "twin") {
    const h = Math.max(3, floors - 1) * FLOOR_H;
    const w = mainW * 0.62;
    group.add(box(w, h, mainD * 0.7, material, -w * 0.75, 0, 0));
    group.add(box(w, h, mainD * 0.7, material, w * 0.75, 0, 0));
    group.add(box(mainW * 1.9, FLOOR_H * 1.6, mainD * 0.85, material, 0, 0, 0)); // podium
    topY = h;
  } else {
    const body = towerBody(rng, material, floors, mainW, mainD);
    body.parts.forEach((p) => group.add(p));
    topY = body.topY;
  }

  roofProps(rng, group, topY, mainW, mainD, material);

  // Replicas made visible: 2-3 grow wings, 4+ raises sibling towers.
  if (replicas >= 2 && replicas <= 3) {
    for (let i = 0; i < replicas - 1; i++) {
      const wingH = topY * (0.35 + rng() * 0.15);
      const side = i === 0 ? 1 : -1;
      group.add(box(mainW * 0.7, wingH, mainD * 0.7, material, side * (mainW * 0.85), 0, (rng() - 0.5) * 2));
    }
  } else if (replicas >= 4) {
    const sibs = Math.min(replicas - 1, 3);
    const corners = [
      [1, 1],
      [-1, 1],
      [-1, -1],
    ];
    for (let i = 0; i < sibs; i++) {
      const [sx, sz] = corners[i];
      const sibH = topY * (0.5 + rng() * 0.2);
      group.add(box(mainW * 0.55, sibH, mainD * 0.55, material, sx * mainW * 1.05, 0, sz * mainD * 1.05));
    }
  }

  group.userData = { kind: "building", app: app.name, topY, footprint: Math.max(mainW, mainD) };
  group.traverse((o) => {
    if (o.isMesh) o.userData = group.userData;
  });
  return group;
}

// A building mid-construction: the tower risen to `progress01` of its final
// height, wrapped in scaffolding, with a working crane alongside. Same seed
// as the finished building so the emerging tower matches what it becomes.
export function createConstructionSite(app, sizeIndex, districtHue, progress01) {
  const rng = mulberry32(buildingSeed(app));
  const group = new THREE.Group();
  group.name = `construction:${app.name}`;

  const material = facadeMaterial(rng, districtHue);
  pick(rng, ARCHETYPES); // consume the archetype roll to stay seed-aligned
  const floors = floorsFor(app, sizeIndex, rng);
  const targetH = floors * FLOOR_H;
  const risenFloors = Math.max(1, Math.round(floors * clamp(progress01, 0, 1)));
  const h = risenFloors * FLOOR_H;

  const w = 4.9;
  const d = 4.9;

  // ground works: pad + material stacks
  const pad = new THREE.Mesh(
    new THREE.BoxGeometry(w + 4.5, 0.18, d + 4.5),
    new THREE.MeshLambertMaterial({ color: 0x9d9483 })
  );
  pad.position.y = 0.09;
  pad.receiveShadow = true;
  group.add(pad);
  for (let i = 0; i < 3; i++) {
    const stack = new THREE.Mesh(
      new THREE.BoxGeometry(1.2, 0.5, 0.8),
      new THREE.MeshLambertMaterial({ color: i === 0 ? 0xb06a2f : 0x8a939b })
    );
    stack.position.set(w / 2 + 1.6, 0.35 + 0, d / 2 - i * 1.1);
    group.add(stack);
  }

  // the rising tower
  const body = box(w, h, d, material, 0, 0, 0);
  group.add(body);

  // scaffolding: edge lattice one floor taller than the risen structure
  const scafH = Math.min(targetH, h + FLOOR_H * 1.5);
  const scafGeo = new THREE.BoxGeometry(w + 0.7, scafH, d + 0.7);
  const edges = new THREE.LineSegments(
    new THREE.EdgesGeometry(scafGeo),
    new THREE.LineBasicMaterial({ color: 0xd9a441 })
  );
  edges.position.y = scafH / 2;
  group.add(edges);
  // horizontal scaffold rings each floor
  for (let f = 1; f <= risenFloors + 1 && f * FLOOR_H <= scafH; f += 2) {
    const ring = new THREE.LineSegments(
      new THREE.EdgesGeometry(new THREE.BoxGeometry(w + 0.7, 0.01, d + 0.7)),
      new THREE.LineBasicMaterial({ color: 0xd9a441 })
    );
    ring.position.y = f * FLOOR_H;
    group.add(ring);
  }

  // the crane: mast beside the pad, jib overhead — parts named for animation
  const crane = new THREE.Group();
  crane.name = "crane";
  const steel = new THREE.MeshLambertMaterial({ color: 0xe0b83a });
  const mastH = targetH + 6;
  const mast = new THREE.Mesh(new THREE.BoxGeometry(0.55, mastH, 0.55), steel);
  mast.position.y = mastH / 2;
  mast.castShadow = true;
  crane.add(mast);

  const pivot = new THREE.Group();
  pivot.name = "crane-pivot";
  pivot.position.y = mastH;
  const jib = new THREE.Mesh(new THREE.BoxGeometry(0.4, 0.4, 9.5), steel);
  jib.position.z = 3.6;
  crane.userData.jibLen = 9.5;
  pivot.add(jib);
  const counter = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.5, 2.4), steel);
  counter.position.z = -2.2;
  pivot.add(counter);
  const weight = new THREE.Mesh(
    new THREE.BoxGeometry(0.9, 1.1, 0.7),
    new THREE.MeshLambertMaterial({ color: 0x6b7076 })
  );
  weight.position.set(0, -0.7, -3.1);
  pivot.add(weight);

  const hook = new THREE.Group();
  hook.name = "crane-hook";
  hook.position.set(0, -0.2, 7.6);
  const cable = new THREE.Mesh(new THREE.CylinderGeometry(0.03, 0.03, 5, 4), new THREE.MeshBasicMaterial({ color: 0x333333 }));
  cable.position.y = -2.5;
  hook.add(cable);
  const beam = new THREE.Mesh(new THREE.BoxGeometry(1.6, 0.22, 0.3), new THREE.MeshLambertMaterial({ color: 0xb06a2f }));
  beam.position.y = -5;
  hook.add(beam);
  pivot.add(hook);
  crane.add(pivot);

  crane.position.set(w / 2 + 2.6, 0, -(d / 2 + 2.6));
  group.add(crane);

  group.userData = {
    kind: "building",
    app: app.name,
    topY: h,
    footprint: w,
    construction: true,
  };
  group.traverse((o) => {
    if (o.isMesh || o.isLineSegments) o.userData = group.userData;
  });
  return group;
}
