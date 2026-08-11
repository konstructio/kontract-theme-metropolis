// One shared particle pool (a single THREE.Points) for smoke, construction
// dust, and fireworks. Emitters borrow particles from the pool; everything
// renders in one draw call.

import * as THREE from "three";

const MAX = 900;

export function createParticles(scene) {
  const positions = new Float32Array(MAX * 3);
  const colors = new Float32Array(MAX * 3);
  const geo = new THREE.BufferGeometry();
  geo.setAttribute("position", new THREE.BufferAttribute(positions, 3));
  geo.setAttribute("color", new THREE.BufferAttribute(colors, 3));

  const mat = new THREE.PointsMaterial({
    size: 1.1,
    vertexColors: true,
    transparent: true,
    opacity: 0.8,
    depthWrite: false,
    sizeAttenuation: true,
  });
  const points = new THREE.Points(geo, mat);
  points.frustumCulled = false;
  scene.add(points);

  // particle slots
  const alive = new Uint8Array(MAX);
  const vel = new Float32Array(MAX * 3);
  const life = new Float32Array(MAX); // seconds remaining
  const fade = new Float32Array(MAX); // starting life for alpha ramp
  const grav = new Float32Array(MAX);
  const baseCol = new Float32Array(MAX * 3);
  let cursor = 0;

  const emitters = new Set();

  function spawn(x, y, z, vx, vy, vz, r, g, b, seconds, gravity) {
    // ring allocator; overwrite the oldest slot if full
    const i = cursor;
    cursor = (cursor + 1) % MAX;
    alive[i] = 1;
    positions[i * 3] = x;
    positions[i * 3 + 1] = y;
    positions[i * 3 + 2] = z;
    vel[i * 3] = vx;
    vel[i * 3 + 1] = vy;
    vel[i * 3 + 2] = vz;
    life[i] = seconds;
    fade[i] = seconds;
    grav[i] = gravity;
    baseCol[i * 3] = r;
    baseCol[i * 3 + 1] = g;
    baseCol[i * 3 + 2] = b;
  }

  function update(dt) {
    // continuous emitters (smoke columns, smog)
    for (const e of emitters) {
      e.accum = (e.accum || 0) + dt * e.rate;
      while (e.accum >= 1) {
        e.accum -= 1;
        spawn(
          e.pos.x + (Math.random() - 0.5) * e.spread,
          e.pos.y,
          e.pos.z + (Math.random() - 0.5) * e.spread,
          (Math.random() - 0.5) * 0.3,
          e.rise * (0.7 + Math.random() * 0.6),
          (Math.random() - 0.5) * 0.3,
          e.color.r, e.color.g, e.color.b,
          e.life * (0.7 + Math.random() * 0.6),
          0
        );
      }
    }

    for (let i = 0; i < MAX; i++) {
      if (!alive[i]) {
        positions[i * 3 + 1] = -9999; // park dead particles below ground
        continue;
      }
      life[i] -= dt;
      if (life[i] <= 0) {
        alive[i] = 0;
        continue;
      }
      vel[i * 3 + 1] -= grav[i] * dt;
      positions[i * 3] += vel[i * 3] * dt;
      positions[i * 3 + 1] += vel[i * 3 + 1] * dt;
      positions[i * 3 + 2] += vel[i * 3 + 2] * dt;
      const a = life[i] / fade[i];
      colors[i * 3] = baseCol[i * 3] * a;
      colors[i * 3 + 1] = baseCol[i * 3 + 1] * a;
      colors[i * 3 + 2] = baseCol[i * 3 + 2] * a;
    }
    geo.attributes.position.needsUpdate = true;
    geo.attributes.color.needsUpdate = true;
  }

  return {
    update,

    // Continuous source; returns a handle with remove().
    addEmitter({ pos, rate, color, spread = 1.2, rise = 1.6, life = 2.4 }) {
      const e = { pos, rate, color: new THREE.Color(color), spread, rise, life, accum: 0 };
      emitters.add(e);
      return {
        remove: () => emitters.delete(e),
        setRate: (r) => { e.rate = r; },
        pos: e.pos,
      };
    },

    // One-shot burst (fireworks shell, dust puff).
    burst(pos, { count = 40, color = 0xffc860, speed = 7, gravity = 6, life = 1.6, spread = 1 }) {
      const c = new THREE.Color(color);
      for (let i = 0; i < count; i++) {
        const theta = Math.random() * Math.PI * 2;
        const phi = Math.acos(2 * Math.random() - 1);
        const s = speed * (0.4 + Math.random() * 0.6) * spread;
        spawn(
          pos.x, pos.y, pos.z,
          Math.sin(phi) * Math.cos(theta) * s,
          Math.cos(phi) * s * 0.9,
          Math.sin(phi) * Math.sin(theta) * s,
          c.r, c.g, c.b,
          life * (0.6 + Math.random() * 0.6),
          gravity
        );
      }
    },
  };
}
