// Renderer, camera, controls, and the frame loop. Everything that draws
// registers an onFrame callback here; nothing else touches the rAF.

import * as THREE from "three";
import { OrbitControls } from "three/addons/controls/OrbitControls.js";
import { CSS2DRenderer } from "three/addons/renderers/CSS2DRenderer.js";

const IDLE_ORBIT_AFTER_MS = 45000;
const IDLE_ORBIT_SPEED = 0.03; // radians/sec around the target

export function createEngine({ canvasRoot, labelsRoot }) {
  const renderer = new THREE.WebGLRenderer({ antialias: true });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.05;
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFShadowMap;
  canvasRoot.appendChild(renderer.domElement);

  const labelRenderer = new CSS2DRenderer();
  labelRenderer.domElement.style.position = "absolute";
  labelRenderer.domElement.style.inset = "0";
  labelRenderer.domElement.style.pointerEvents = "none";
  labelsRoot.appendChild(labelRenderer.domElement);

  const scene = new THREE.Scene();

  const camera = new THREE.PerspectiveCamera(45, 1, 0.5, 1200);
  camera.position.set(70, 52, 70);

  const controls = new OrbitControls(camera, renderer.domElement);
  controls.enableDamping = true;
  controls.dampingFactor = 0.06;
  controls.minDistance = 14;
  controls.maxDistance = 240;
  controls.minPolarAngle = 0.15;
  controls.maxPolarAngle = 1.35;
  controls.target.set(0, 0, 0);

  // Keep the camera on the city: clamp the orbit target to a soft boundary.
  const PAN_BOUND = 160;
  controls.addEventListener("change", () => {
    controls.target.x = THREE.MathUtils.clamp(controls.target.x, -PAN_BOUND, PAN_BOUND);
    controls.target.z = THREE.MathUtils.clamp(controls.target.z, -PAN_BOUND, PAN_BOUND);
    controls.target.y = THREE.MathUtils.clamp(controls.target.y, 0, 40);
  });

  // Idle attract mode: after 45s untouched, drift slowly around the city.
  let lastInputAt = performance.now();
  let idleOrbiting = false;
  const noteInput = () => {
    lastInputAt = performance.now();
    idleOrbiting = false;
  };
  for (const ev of ["pointerdown", "wheel", "touchstart", "keydown"]) {
    renderer.domElement.addEventListener(ev, noteInput, { passive: true });
    window.addEventListener(ev, noteInput, { passive: true });
  }

  function resize() {
    const w = canvasRoot.clientWidth || window.innerWidth;
    const h = canvasRoot.clientHeight || window.innerHeight;
    camera.aspect = w / h;
    camera.updateProjectionMatrix();
    renderer.setSize(w, h);
    labelRenderer.setSize(w, h);
  }
  window.addEventListener("resize", resize);
  resize();

  const frameCallbacks = new Set();
  const clock = new THREE.Clock();
  let running = false;

  // Eased camera flight; any pointer input cancels it (noteInput fires first,
  // so a user grabbing the controls mid-flight just takes over).
  let flight = null; // {fromPos, fromTarget, toPos, toTarget, t}
  function flyTo(pos, target, seconds = 1.4) {
    flight = {
      fromPos: camera.position.clone(),
      fromTarget: controls.target.clone(),
      toPos: pos.clone(),
      toTarget: target.clone(),
      t: 0,
      seconds,
    };
  }
  renderer.domElement.addEventListener("pointerdown", () => (flight = null), { passive: true });

  function frame() {
    if (!running) return;
    requestAnimationFrame(frame);
    const dt = Math.min(clock.getDelta(), 0.1); // clamp tab-switch spikes
    const elapsed = clock.elapsedTime;

    if (!idleOrbiting && performance.now() - lastInputAt > IDLE_ORBIT_AFTER_MS) {
      idleOrbiting = true;
    }
    if (idleOrbiting && !flight) {
      const offset = camera.position.clone().sub(controls.target);
      offset.applyAxisAngle(new THREE.Vector3(0, 1, 0), IDLE_ORBIT_SPEED * dt);
      camera.position.copy(controls.target).add(offset);
    }

    if (flight) {
      flight.t = Math.min(1, flight.t + dt / flight.seconds);
      const e = 1 - Math.pow(1 - flight.t, 3); // easeOutCubic
      camera.position.lerpVectors(flight.fromPos, flight.toPos, e);
      controls.target.lerpVectors(flight.fromTarget, flight.toTarget, e);
      if (flight.t >= 1) flight = null;
    }

    controls.update();
    for (const cb of frameCallbacks) cb(dt, elapsed);
    renderer.render(scene, camera);
    labelRenderer.render(scene, camera);
  }

  // Don't burn frames while the tab is hidden; the clock delta clamp above
  // absorbs the jump when we come back.
  document.addEventListener("visibilitychange", () => {
    if (document.hidden) {
      running = false;
    } else if (!running) {
      running = true;
      clock.getDelta();
      frame();
    }
  });

  return {
    scene,
    camera,
    renderer,
    controls,
    flyTo,
    onFrame(cb) {
      frameCallbacks.add(cb);
      return () => frameCallbacks.delete(cb);
    },
    start() {
      if (running) return;
      running = true;
      clock.getDelta();
      frame();
    },
    stop() {
      running = false;
    },
  };
}
