// The sun follows real local time (PGSimCity's trick): the city is a place
// you visit at different hours, not a static render. `?time=HH:MM` overrides
// the clock for development and screenshots.

import * as THREE from "three";

// Keyframes across the day: [hour, sky, horizonFog, sunColor, sunIntensity, hemiIntensity]
// Intensities are tuned for three's physical lighting scale + ACES tone
// mapping (r155+): "1" is dim there, real daylight wants 2.5-3.
const KEYS = [
  [0,    0x070b14, 0x0a101c, 0x223355, 0.15, 0.4 ], // deep night
  [5,    0x0a1020, 0x101a2c, 0x334466, 0.2,  0.45], // late night
  [6.5,  0x2b3a5e, 0xd98a6a, 0xffb469, 1.3,  0.8 ], // dawn
  [9,    0x87b5e0, 0xcfe0ee, 0xfff2d8, 2.6,  1.2 ], // morning
  [13,   0x9cc4e8, 0xdceafc, 0xffffff, 3.1,  1.4 ], // noon
  [17.5, 0x7fa3d4, 0xf3c690, 0xffd9a0, 2.5,  1.2 ], // late afternoon
  [19,   0x54628f, 0xff9d5c, 0xff8f3e, 1.8,  0.9 ], // golden hour
  [20.5, 0x1c2440, 0x4a3a55, 0x8a5a7a, 0.5,  0.6 ], // dusk
  [22,   0x0a1020, 0x101a2c, 0x334466, 0.2,  0.45], // night
  [24,   0x070b14, 0x0a101c, 0x223355, 0.15, 0.4 ],
];

const NIGHT_BEFORE = 6.2; // window lights & neon on outside this range
const NIGHT_AFTER = 19.2;

function parseTimeOverride() {
  const m = /[?&]time=(\d{1,2}):(\d{2})/.exec(window.location.search);
  if (!m) return null;
  const h = Number(m[1]) + Number(m[2]) / 60;
  return h >= 0 && h < 24 ? h : null;
}

export function createDayNight(scene) {
  const sun = new THREE.DirectionalLight(0xffffff, 1);
  sun.castShadow = true;
  sun.shadow.mapSize.set(2048, 2048);
  sun.shadow.camera.left = -140;
  sun.shadow.camera.right = 140;
  sun.shadow.camera.top = 140;
  sun.shadow.camera.bottom = -140;
  sun.shadow.camera.far = 500;
  sun.shadow.bias = -0.0004;
  scene.add(sun);
  scene.add(sun.target);

  const hemi = new THREE.HemisphereLight(0xbdd4ee, 0x36302a, 0.5);
  scene.add(hemi);

  // A soft "moon" so night isn't pitch black.
  const moon = new THREE.DirectionalLight(0x8fa8d8, 0.3);
  moon.position.set(-90, 120, -60);
  scene.add(moon);

  scene.background = new THREE.Color();
  scene.fog = new THREE.Fog(0x000000, 160, 520);

  const override = parseTimeOverride();
  const skyA = new THREE.Color();
  const skyB = new THREE.Color();
  const fogA = new THREE.Color();
  const fogB = new THREE.Color();
  const sunA = new THREE.Color();
  const sunB = new THREE.Color();

  let hour = 12;

  function localHour() {
    if (override !== null) return override;
    const now = new Date();
    return now.getHours() + now.getMinutes() / 60 + now.getSeconds() / 3600;
  }

  function update() {
    hour = localHour();

    let i = 0;
    while (i < KEYS.length - 2 && KEYS[i + 1][0] <= hour) i++;
    const a = KEYS[i];
    const b = KEYS[i + 1];
    const t = THREE.MathUtils.clamp((hour - a[0]) / (b[0] - a[0]), 0, 1);

    scene.background.copy(skyA.setHex(a[1])).lerp(skyB.setHex(b[1]), t);
    scene.fog.color.copy(fogA.setHex(a[2])).lerp(fogB.setHex(b[2]), t);
    sun.color.copy(sunA.setHex(a[3])).lerp(sunB.setHex(b[3]), t);
    sun.intensity = THREE.MathUtils.lerp(a[4], b[4], t);
    hemi.intensity = THREE.MathUtils.lerp(a[5], b[5], t);

    // Sun arc: rises east (+x), sets west (-x), elevation peaks near 13:00.
    const dayT = THREE.MathUtils.clamp((hour - 6) / 14, 0, 1); // 06:00–20:00
    const azimuth = Math.PI * (1 - dayT); // east → west
    const elevation = Math.max(0.06, Math.sin(dayT * Math.PI) * 1.15);
    const r = 190;
    sun.position.set(
      Math.cos(azimuth) * r,
      Math.sin(elevation) * r * 0.75,
      Math.sin(azimuth) * r * 0.35 + 40
    );
  }

  update();

  return {
    update,
    isNight: () => hour < NIGHT_BEFORE || hour > NIGHT_AFTER,
    hour: () => hour,
    // 0 at midnight → 1 at next midnight; handy for slow ambient cycles.
    dayFraction: () => hour / 24,
  };
}
