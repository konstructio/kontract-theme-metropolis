// Roads: a ring boulevard around the civic plaza with one spoke out to each
// district. Geometry is decorative; the exported lane paths are what the
// M3 traffic system drives along.

import * as THREE from "three";

const ROAD_COLOR = 0x2c3138;
const RING_RADIUS = 34;
const RING_WIDTH = 6;

export function createRoadNetwork(scene) {
  const group = new THREE.Group();
  group.name = "roads";
  scene.add(group);

  const ring = new THREE.Mesh(
    new THREE.RingGeometry(RING_RADIUS - RING_WIDTH / 2, RING_RADIUS + RING_WIDTH / 2, 72),
    new THREE.MeshLambertMaterial({ color: ROAD_COLOR })
  );
  ring.rotation.x = -Math.PI / 2;
  ring.position.y = 0.03;
  ring.receiveShadow = true;
  group.add(ring);

  const spokes = new Map(); // districtName -> mesh
  const lanePaths = []; // [{points: Vector3[], loop: bool}]

  // Two ring lanes (clockwise + counter-clockwise) for traffic.
  for (const dir of [1, -1]) {
    const pts = [];
    const laneR = RING_RADIUS + dir * 1.4;
    for (let i = 0; i <= 64; i++) {
      const a = (dir * i * Math.PI * 2) / 64;
      pts.push(new THREE.Vector3(Math.cos(a) * laneR, 0.12, Math.sin(a) * laneR));
    }
    lanePaths.push({ points: pts, loop: true });
  }

  function setDistricts(districts) {
    // districts: [{name, center: Vector3, plateHalf: number}]
    const seen = new Set();
    for (const d of districts) {
      seen.add(d.name);
      if (spokes.has(d.name)) continue;

      const dirV = d.center.clone().setY(0);
      const dist = dirV.length();
      const from = dirV.clone().multiplyScalar(RING_RADIUS / dist);
      const to = dirV.clone().multiplyScalar((dist - d.plateHalf) / dist);
      const len = from.distanceTo(to);
      if (len < 1) continue;

      // A thin box rotated about Y only — no Euler-order surprises.
      const spoke = new THREE.Mesh(
        new THREE.BoxGeometry(5, 0.1, len),
        new THREE.MeshLambertMaterial({ color: ROAD_COLOR })
      );
      const mid = from.clone().add(to).multiplyScalar(0.5);
      spoke.position.set(mid.x, 0.03, mid.z);
      spoke.rotation.y = Math.atan2(to.x - from.x, to.z - from.z);
      spoke.receiveShadow = true;
      group.add(spoke);
      spokes.set(d.name, spoke);

      // Two offset lanes so opposing traffic doesn't drive through itself.
      const dir = to.clone().sub(from).normalize();
      const side = new THREE.Vector3(-dir.z, 0, dir.x).multiplyScalar(1.2);
      lanePaths.push({
        points: [from.clone().add(side).setY(0.12), to.clone().add(side).setY(0.12)],
        loop: false,
      });
      lanePaths.push({
        points: [to.clone().sub(side).setY(0.12), from.clone().sub(side).setY(0.12)],
        loop: false,
      });
    }
    // Roads accrete with the city; a deleted district keeps its spoke —
    // the working view removes buildings, the streets stay (they're real
    // in any city that ever grew).
  }

  return { group, setDistricts, lanePaths, RING_RADIUS };
}
