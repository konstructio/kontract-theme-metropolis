// Shared world dressing: the ground, and (from M2 on) trees, streetlights,
// the plaza, City Hall, and construction props. Geometries and materials are
// created once and shared.

import * as THREE from "three";

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
