// Shared world dressing: ground, the civic plaza (City Hall, Mayor statue,
// fountain), trees. Everything deterministic — a fixed seed scatters the
// greenery the same way every load.

import * as THREE from "three";
import { mulberry32 } from "../util.js";

export function createGround(scene) {
  const ground = new THREE.Mesh(
    new THREE.CircleGeometry(420, 96),
    new THREE.MeshLambertMaterial({ color: 0x5a6e5b })
  );
  ground.rotation.x = -Math.PI / 2;
  ground.receiveShadow = true;
  ground.name = "ground";
  scene.add(ground);
  return ground;
}

function lambert(color) {
  return new THREE.MeshLambertMaterial({ color });
}

export function makeTree(rng) {
  const g = new THREE.Group();
  const trunkH = 0.7 + rng() * 0.5;
  const trunk = new THREE.Mesh(new THREE.CylinderGeometry(0.12, 0.18, trunkH, 6), lambert(0x6b4f35));
  trunk.position.y = trunkH / 2;
  g.add(trunk);
  const crownH = 1.4 + rng() * 1.2;
  const crown = new THREE.Mesh(
    new THREE.ConeGeometry(0.8 + rng() * 0.5, crownH, 7),
    lambert(rng() < 0.2 ? 0x7d9a4f : 0x466e3f)
  );
  crown.position.y = trunkH + crownH / 2 - 0.1;
  crown.castShadow = true;
  g.add(crown);
  return g;
}

// The civic plaza at the city's origin: City Hall (shop), the Mayor's
// statue (character screen), and a fountain. Click targets carry userData.
export function createPlaza(scene) {
  const plaza = new THREE.Group();
  plaza.name = "plaza";

  const pavement = new THREE.Mesh(new THREE.CircleGeometry(28, 48), lambert(0xb8b2a4));
  pavement.rotation.x = -Math.PI / 2;
  pavement.position.y = 0.02;
  pavement.receiveShadow = true;
  plaza.add(pavement);

  // --- City Hall: a civic block with a golden dome and columned porch ---
  const hall = new THREE.Group();
  hall.name = "city-hall";
  const hallMat = lambert(0xd8d2c2);
  const body = new THREE.Mesh(new THREE.BoxGeometry(12, 5.5, 8), hallMat);
  body.position.y = 2.75;
  body.castShadow = true;
  hall.add(body);
  const steps = new THREE.Mesh(new THREE.BoxGeometry(8, 0.9, 2.4), lambert(0xc6c0b0));
  steps.position.set(0, 0.45, 5);
  hall.add(steps);
  for (let i = -2; i <= 2; i++) {
    const col = new THREE.Mesh(new THREE.CylinderGeometry(0.28, 0.32, 4.6, 8), hallMat);
    col.position.set(i * 1.7, 2.3, 4.2);
    col.castShadow = true;
    hall.add(col);
  }
  const pediment = new THREE.Mesh(new THREE.BoxGeometry(10, 1.1, 1.4), hallMat);
  pediment.position.set(0, 5.1, 4.2);
  hall.add(pediment);
  const domeBase = new THREE.Mesh(new THREE.CylinderGeometry(2.6, 2.9, 1.2, 12), hallMat);
  domeBase.position.y = 6.1;
  hall.add(domeBase);
  const dome = new THREE.Mesh(
    new THREE.SphereGeometry(2.5, 16, 12, 0, Math.PI * 2, 0, Math.PI / 2),
    new THREE.MeshLambertMaterial({ color: 0xf5a623, emissive: 0x664400, emissiveIntensity: 0.15 })
  );
  dome.position.y = 6.7;
  dome.castShadow = true;
  hall.add(dome);
  hall.position.set(0, 0, -16);
  hall.userData = { kind: "cityhall" };
  hall.traverse((o) => {
    if (o.isMesh) o.userData = hall.userData;
  });
  plaza.add(hall);

  // --- Mayor statue on the south side ---
  const statue = new THREE.Group();
  statue.name = "mayor-statue";
  const pedestal = new THREE.Mesh(new THREE.CylinderGeometry(1.3, 1.6, 1.6, 10), lambert(0x8f8a7c));
  pedestal.position.y = 0.8;
  statue.add(pedestal);
  const bronze = new THREE.MeshLambertMaterial({ color: 0xa07f3c, emissive: 0x2a1f08, emissiveIntensity: 0.2 });
  const torso = new THREE.Mesh(new THREE.CylinderGeometry(0.45, 0.6, 1.6, 8), bronze);
  torso.position.y = 2.4;
  torso.castShadow = true;
  statue.add(torso);
  const head = new THREE.Mesh(new THREE.SphereGeometry(0.38, 10, 10), bronze);
  head.position.y = 3.5;
  statue.add(head);
  const armUp = new THREE.Mesh(new THREE.CylinderGeometry(0.14, 0.14, 1.1, 6), bronze);
  armUp.position.set(0.55, 3.0, 0);
  armUp.rotation.z = -0.8;
  statue.add(armUp);
  statue.position.set(0, 0, 14);
  statue.userData = { kind: "mayor" };
  statue.traverse((o) => {
    if (o.isMesh) o.userData = statue.userData;
  });
  plaza.add(statue);

  // --- Fountain at dead center ---
  const fountain = new THREE.Group();
  const basin = new THREE.Mesh(new THREE.CylinderGeometry(3.2, 3.5, 0.7, 16), lambert(0x9aa4ab));
  basin.position.y = 0.35;
  fountain.add(basin);
  const water = new THREE.Mesh(
    new THREE.CylinderGeometry(2.9, 2.9, 0.5, 16),
    new THREE.MeshLambertMaterial({ color: 0x39c0c8, emissive: 0x0a3033, emissiveIntensity: 0.3 })
  );
  water.position.y = 0.55;
  water.name = "fountain-water";
  fountain.add(water);
  const jet = new THREE.Mesh(new THREE.CylinderGeometry(0.35, 0.5, 1.6, 8), lambert(0x9aa4ab));
  jet.position.y = 1.2;
  fountain.add(jet);
  plaza.add(fountain);

  // --- Deterministic greenery ring ---
  const rng = mulberry32(0xc1717);
  for (let i = 0; i < 14; i++) {
    const a = (i / 14) * Math.PI * 2 + rng() * 0.2;
    const r = 23 + rng() * 3;
    if (Math.abs(Math.cos(a)) > 0.92) continue; // keep road mouths clear
    const tree = makeTree(rng);
    tree.position.set(Math.cos(a) * r, 0, Math.sin(a) * r);
    plaza.add(tree);
  }

  scene.add(plaza);
  return plaza;
}
