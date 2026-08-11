// District placement and lot assignment. Stability is the design goal:
// districts sit on a golden-angle spiral ordered by creation, lots are
// claimed center-out and remembered, so nothing ever moves once built —
// the city only accretes, exactly like the real org it mirrors.

import * as THREE from "three";
import { fnv1a, mulberry32 } from "../util.js";
import { createBuilding } from "./buildings.js";
import { makeTree } from "./props.js";

const GOLDEN = 2.399963229728653;
const LOT = 13; // lot pitch (building pad + street margin)
const BASE_PLATE_HALF = 22;

function districtCenter(i) {
  // First district clears the ring road (radius 34 + width) so its plate
  // never sits under the boulevard.
  const r = 64 + 30 * (i === 0 ? 0 : Math.pow(i, 0.8));
  const a = i * GOLDEN;
  return new THREE.Vector3(Math.cos(a) * r, 0, Math.sin(a) * r);
}

// Center-out spiral of grid coordinates: (0,0), then ring 1, ring 2…
// Deterministic claim order; index n always lands on the same coord.
function lotCoord(n) {
  if (n === 0) return [0, 0];
  let k = 1;
  let count = 1;
  while (n >= count + 8 * k) {
    count += 8 * k;
    k++;
  }
  let i = n - count;
  // walk the ring of Chebyshev radius k, starting east, counter-clockwise
  const side = 2 * k;
  const edge = Math.floor(i / side);
  const step = i % side;
  switch (edge) {
    case 0: return [k, -k + step];
    case 1: return [k - step, k];
    case 2: return [-k, k - step];
    default: return [-k + step, -k];
  }
}

function ringOf(n) {
  const [x, z] = lotCoord(n);
  return Math.max(Math.abs(x), Math.abs(z));
}

export function createCityLayout(scene, roads) {
  const districts = new Map(); // zoneName -> {index, group, plate, center, hue, lots: Map(appName->lotIdx), nextLot, memorials: Set}
  const buildings = new Map(); // appName -> {group, zone, lotIdx, rev}
  let districtCount = 0;

  function ensureDistrict(zone) {
    let d = districts.get(zone.name);
    if (d) return d;

    const index = districtCount++;
    const center = districtCenter(index);
    const hue = fnv1a(zone.name) / 0xffffffff;

    const group = new THREE.Group();
    group.name = `district:${zone.name}`;
    group.position.copy(center);

    const plate = new THREE.Mesh(
      new THREE.BoxGeometry(BASE_PLATE_HALF * 2, 0.35, BASE_PLATE_HALF * 2),
      new THREE.MeshLambertMaterial({ color: new THREE.Color().setHSL(hue, 0.1, 0.42) })
    );
    plate.position.y = 0.05;
    plate.receiveShadow = true;
    plate.userData = { kind: "district", zone: zone.name };
    group.add(plate);

    // corner greenery, seeded by the district itself
    const rng = mulberry32(fnv1a(zone.name) ^ 0x7ee5);
    for (const [sx, sz] of [[1, 1], [-1, 1], [1, -1], [-1, -1]]) {
      if (rng() < 0.3) continue;
      const tree = makeTree(rng);
      tree.position.set(sx * (BASE_PLATE_HALF - 2.5), 0.2, sz * (BASE_PLATE_HALF - 2.5));
      group.add(tree);
    }

    scene.add(group);
    d = {
      index,
      group,
      plate,
      center,
      hue,
      plateHalf: BASE_PLATE_HALF,
      lots: new Map(),
      nextLot: 0,
      display: zone.display_name || zone.name,
    };
    districts.set(zone.name, d);
    syncRoads();
    return d;
  }

  function growPlateIfNeeded(d, lotIdx) {
    const needHalf = (ringOf(lotIdx) + 0.5) * LOT + 4;
    if (needHalf > d.plateHalf) {
      d.plateHalf = needHalf;
      d.plate.geometry.dispose();
      d.plate.geometry = new THREE.BoxGeometry(needHalf * 2, 0.35, needHalf * 2);
      syncRoads();
    }
  }

  function lotPosition(lotIdx) {
    const [gx, gz] = lotCoord(lotIdx);
    return new THREE.Vector3(gx * LOT, 0, gz * LOT);
  }

  function claimLot(d, appName) {
    if (d.lots.has(appName)) return d.lots.get(appName);
    const lotIdx = d.nextLot++;
    d.lots.set(appName, lotIdx);
    growPlateIfNeeded(d, lotIdx);
    return lotIdx;
  }

  function syncRoads() {
    if (!roads) return;
    roads.setDistricts(
      [...districts.entries()].map(([name, d]) => ({
        name,
        center: d.center,
        plateHalf: d.plateHalf,
      }))
    );
  }

  // A building's visual identity beyond its seed: rebuild when these change.
  function buildingRev(app, sizeIndex) {
    return `${sizeIndex}|${app.replicas}|${app.phase === "Failed" ? "F" : "-"}`;
  }

  function reconcile(state) {
    const zones = [...state.zones].sort(
      (a, b) => (a.created_at || 0) - (b.created_at || 0) || String(a.name).localeCompare(String(b.name))
    );
    for (const z of zones) ensureDistrict(z);

    // Districts for zones that no longer exist: buildings go, the plate
    // stays (the Metro Map remembers everything; the working city keeps
    // the streets it grew).
    const liveZones = new Set(zones.map((z) => z.name));

    const sizeIndexByKey = new Map(state.platform.sizes.map((s, i) => [s.key, i]));
    const apps = [...state.apps].sort(
      (a, b) => (a.created_at || 0) - (b.created_at || 0) || String(a.name).localeCompare(String(b.name))
    );
    const liveApps = new Set();

    for (const app of apps) {
      if (!liveZones.has(app.zone_ref) && !districts.has(app.zone_ref)) continue;
      liveApps.add(app.name);
      const d = districts.get(app.zone_ref) || ensureDistrict({ name: app.zone_ref, display_name: app.zone_ref });
      const lotIdx = claimLot(d, app.name);
      const sizeIndex = sizeIndexByKey.get(app.size) ?? 1;
      const rev = buildingRev(app, sizeIndex);

      const existing = buildings.get(app.name);
      if (existing && existing.rev === rev) continue;
      if (existing) {
        existing.group.removeFromParent();
        disposeGroup(existing.group);
      }

      const group = createBuilding(app, sizeIndex, d.hue);
      group.position.copy(lotPosition(lotIdx));
      d.group.add(group);
      buildings.set(app.name, { group, zone: app.zone_ref, lotIdx, rev });
    }

    // Demolished apps: building comes down, a pocket park keeps the lot.
    for (const [name, b] of buildings) {
      if (liveApps.has(name)) continue;
      const d = districts.get(b.zone);
      b.group.removeFromParent();
      disposeGroup(b.group);
      buildings.delete(name);
      if (d) {
        const park = makeMemorialPark(name, lotPosition(b.lotIdx));
        d.group.add(park);
      }
    }
  }

  function makeMemorialPark(appName, pos) {
    const g = new THREE.Group();
    g.name = `memorial:${appName}`;
    const lawn = new THREE.Mesh(
      new THREE.CylinderGeometry(4.2, 4.2, 0.2, 12),
      new THREE.MeshLambertMaterial({ color: 0x55804d })
    );
    lawn.position.y = 0.3;
    g.add(lawn);
    const plaque = new THREE.Mesh(
      new THREE.BoxGeometry(0.9, 0.7, 0.15),
      new THREE.MeshLambertMaterial({ color: 0x8f8a7c })
    );
    plaque.position.set(0, 0.75, 1.6);
    g.add(plaque);
    const rng = mulberry32(fnv1a(appName));
    for (let i = 0; i < 3; i++) {
      const tree = makeTree(rng);
      tree.position.set((rng() - 0.5) * 5, 0.3, (rng() - 0.5) * 5);
      g.add(tree);
    }
    g.userData = { kind: "memorial", app: appName };
    g.position.copy(pos);
    return g;
  }

  function disposeGroup(group) {
    group.traverse((o) => {
      if (o.isMesh) {
        o.geometry.dispose();
        if (o.material.dispose) o.material.dispose();
      }
    });
  }

  return {
    reconcile,
    districts,
    buildings,
    districtOf: (zoneName) => districts.get(zoneName),
    buildingOf: (appName) => buildings.get(appName),
  };
}
