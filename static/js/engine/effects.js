// Construction choreography and celebrations. Progress shown on a site is
// honest theatre: it advances within the band the real phase reports and
// never reaches "complete" until the platform says Live.

import * as THREE from "three";
import { PHASE_PROGRESS } from "../city/layout.js";
import { clamp } from "../util.js";

const PROGRESS_RATE = 0.012; // fraction of full height per second
const CELEBRATION_MS = 6000;

const FIREWORK_COLORS = [0xf5a623, 0xff7847, 0x39c0c8, 0xf3f5f7, 0xffd23f];

export function createEffects(scene, layout, particles, store) {
  const displayed = new Map(); // appName -> progress 0..1
  let apps = [];

  function sync(state) {
    apps = state.apps;
    for (const name of [...displayed.keys()]) {
      const app = apps.find((a) => a.name === name);
      if (!app || !(app.phase in PHASE_PROGRESS)) {
        displayed.delete(name);
        layout.clearProgress(name);
      }
    }
  }

  // ---- construction progress + crane animation ----
  let cranePulse = 0;
  function update(dt) {
    cranePulse += dt;

    for (const app of apps) {
      const target = PHASE_PROGRESS[app.phase];
      if (target === undefined) continue;
      let p = displayed.get(app.name) ?? clamp(target - 0.1, 0.1, 1);
      if (p < target) {
        p = Math.min(target, p + PROGRESS_RATE * dt);
        displayed.set(app.name, p);
        const stepped = layout.setConstructionProgress(app.name, p);
        if (stepped) {
          const b = layout.buildingOf(app.name);
          if (b) {
            const world = new THREE.Vector3();
            b.group.getWorldPosition(world);
            world.y += (b.group.userData.topY || 4) + 0.5;
            particles.burst(world, { count: 14, color: 0xc9b998, speed: 2.5, gravity: 2.5, life: 1.1 });
          }
        }
      }
    }

    // animate every crane in the scene: slow jib sweep, bobbing hook
    scene.traverse((o) => {
      if (o.name === "crane-pivot") {
        o.rotation.y = Math.sin(cranePulse * 0.25 + o.parent.position.x) * 1.2;
        const hook = o.getObjectByName("crane-hook");
        if (hook) hook.position.y = -0.2 - Math.abs(Math.sin(cranePulse * 0.5 + o.parent.position.z)) * 1.6;
      }
    });

    updateCelebration(dt);
  }

  // ---- the ship moment: fireworks over the skyline, ≤6s, skippable ----
  let celebration = null; // {app, timers:[], endAt}

  function celebrate(appName, { friday = false } = {}) {
    skip(); // one at a time; a new ship replaces the old show
    const b = layout.buildingOf(appName);
    const base = new THREE.Vector3();
    if (b) {
      b.group.getWorldPosition(base);
      base.y += (b.group.userData.topY || 10) + 10;
    } else {
      base.set(0, 34, 0);
    }

    const timers = [];
    const shells = friday ? 8 : 4;
    for (let i = 0; i < shells; i++) {
      timers.push(
        setTimeout(() => {
          const pos = base.clone();
          pos.x += (Math.random() - 0.5) * 22;
          pos.y += Math.random() * 10;
          pos.z += (Math.random() - 0.5) * 22;
          particles.burst(pos, {
            count: friday ? 70 : 50,
            color: FIREWORK_COLORS[i % FIREWORK_COLORS.length],
            speed: 9,
            gravity: 5,
            life: 1.9,
          });
        }, i * (friday ? 500 : 900))
      );
    }
    celebration = { app: appName, timers, endAt: performance.now() + CELEBRATION_MS };
    store.update({ celebration: { app: appName, friday, until: Date.now() + CELEBRATION_MS } });
  }

  function skip() {
    if (!celebration) return;
    for (const t of celebration.timers) clearTimeout(t);
    celebration = null;
    store.update({ celebration: null });
  }

  function updateCelebration() {
    if (celebration && performance.now() > celebration.endAt) skip();
  }

  return { update, sync, celebrate, skip };
}
