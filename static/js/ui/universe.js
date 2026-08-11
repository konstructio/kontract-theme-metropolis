// The Metro Map — the universe view. A composed aerial vantage over a city
// that only ever accretes: every district ever claimed, every building ever
// constructed, demolitions as pocket parks, pre-session history as ghosts
// from the world ledger. Data overlay (names/status/urls) defaults OFF; a
// capture button saves the postcard.

import * as THREE from "three";
import { CSS2DObject } from "three/addons/renderers/CSS2DRenderer.js";
import { el } from "../util.js";
import { phaseWord, phaseColor } from "./vocab.js";

const AERIAL_POS = new THREE.Vector3(0, 200, 130);
const LABEL_CAP = 40;

export function createUniverse(store, layout, engine, gamectl) {
  let active = false;
  let overlayOn = false;
  let savedCam = null;
  let flight = null; // {fromPos, fromTarget, toPos, toTarget, t}
  const labels = [];
  let panel = null;

  engine.onFrame((dt) => {
    if (!flight) return;
    flight.t = Math.min(1, flight.t + dt / 1.4);
    const e = 1 - Math.pow(1 - flight.t, 3); // easeOutCubic
    engine.camera.position.lerpVectors(flight.fromPos, flight.toPos, e);
    engine.controls.target.lerpVectors(flight.fromTarget, flight.toTarget, e);
    if (flight.t >= 1) flight = null;
  });

  function flyTo(pos, target) {
    flight = {
      fromPos: engine.camera.position.clone(),
      fromTarget: engine.controls.target.clone(),
      toPos: pos.clone(),
      toTarget: target.clone(),
      t: 0,
    };
  }

  function clearLabels() {
    for (const l of labels) l.removeFromParent();
    labels.length = 0;
  }

  function buildLabels() {
    clearLabels();
    const state = store.state;
    // district plates first, then buildings until the cap
    for (const [name, d] of layout.districts) {
      if (labels.length >= LABEL_CAP) break;
      const div = document.createElement("div");
      div.className = "map-label district-label";
      div.textContent = d.display + (d.ghost ? " · memorial" : "");
      const obj = new CSS2DObject(div);
      obj.position.set(0, 1.5, 0);
      d.group.add(obj);
      labels.push(obj);
    }
    for (const [name, b] of layout.buildings) {
      if (labels.length >= LABEL_CAP) break;
      const app = state.apps.find((a) => a.name === name);
      const div = document.createElement("div");
      div.className = "map-label";
      const strong = document.createElement("strong");
      strong.textContent = name;
      div.append(strong);
      if (app) {
        const s = document.createElement("span");
        s.textContent = phaseWord(app.phase);
        s.style.color = phaseColor(app.phase);
        div.append(s);
        if (app.url && app.public_url_enabled) {
          const u = document.createElement("small");
          u.textContent = app.url;
          div.append(u);
        }
      }
      const obj = new CSS2DObject(div);
      obj.position.set(0, (b.group.userData.topY || 6) + 3, 0);
      b.group.add(obj);
      labels.push(obj);
    }
  }

  function capture() {
    // render synchronously, then read the canvas in the same task
    engine.renderer.render(engine.scene, engine.camera);
    engine.renderer.domElement.toBlob((blob) => {
      if (!blob) return;
      const a = document.createElement("a");
      a.href = URL.createObjectURL(blob);
      a.download = `metro-map-${new Date().toISOString().slice(0, 10)}.png`;
      a.click();
      setTimeout(() => URL.revokeObjectURL(a.href), 5000);
    });
  }

  function stats() {
    const ever = gamectl.game.world.ever;
    const state = store.state;
    const live = state.apps.filter((a) => a.phase === "Live").length;
    return `${Math.max(ever.zones.length, state.zones.length)} districts ever · ` +
      `${Math.max(ever.apps.length, state.apps.length)} buildings ever · ${live} open for business now`;
  }

  function open() {
    if (active) return;
    active = true;
    layout.ensureGhosts(gamectl.game.world.ever);
    savedCam = { pos: engine.camera.position.clone(), target: engine.controls.target.clone() };
    flyTo(AERIAL_POS, new THREE.Vector3(0, 0, 0));

    const overlayToggle = el("input", { type: "checkbox" }); // default OFF per manifest
    overlayToggle.addEventListener("change", () => {
      overlayOn = overlayToggle.checked;
      if (overlayOn) buildLabels();
      else clearLabels();
    });

    panel = el("div", { class: "map-panel" },
      el("h2", {}, "Metro Map"),
      el("p", { class: "muted" }, stats()),
      el("p", { class: "muted" }, "The map only accretes — every district and building ever raised leaves structure."),
      el("label", { class: "check" }, overlayToggle, " data overlay (names, status, addresses)"),
      el("div", { class: "mrow", style: "justify-content:flex-start" },
        el("button", { class: "btn", onclick: capture }, "Capture postcard"),
        el("button", { class: "btn primary", onclick: close }, "Back to the city")));
    document.getElementById("hud").append(panel);
  }

  function close() {
    if (!active) return;
    active = false;
    clearLabels();
    overlayOn = false;
    if (panel) panel.remove();
    panel = null;
    if (savedCam) flyTo(savedCam.pos, savedCam.target);
  }

  return { open, close };
}
