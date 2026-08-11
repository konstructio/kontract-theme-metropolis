// Raycast picking with a drag threshold so orbiting never selects, plus a
// hover label (CSS2D) naming what's under the cursor. Click routing writes
// store.selection; panels react to that, never to the raycast directly.

import * as THREE from "three";
import { CSS2DObject } from "three/addons/renderers/CSS2DRenderer.js";
import { phaseWord } from "../ui/vocab.js";

const DRAG_PX = 6;

export function createPicking(engine, layout, store) {
  const raycaster = new THREE.Raycaster();
  const pointer = new THREE.Vector2();
  const canvas = engine.renderer.domElement;

  // hover label — one CSS2D node reused for whatever is under the cursor
  const labelEl = document.createElement("div");
  labelEl.className = "hover-label";
  const label = new CSS2DObject(labelEl);
  label.visible = false;
  engine.scene.add(label);

  let hovered = null; // {group, meshes:[{mesh, emissive}]}
  let downAt = null;

  function setPointer(e) {
    const r = canvas.getBoundingClientRect();
    pointer.x = ((e.clientX - r.left) / r.width) * 2 - 1;
    pointer.y = -((e.clientY - r.top) / r.height) * 2 + 1;
  }

  function pickRoot(e) {
    setPointer(e);
    raycaster.setFromCamera(pointer, engine.camera);
    const hits = raycaster.intersectObjects(engine.scene.children, true);
    for (const hit of hits) {
      const kind = hit.object.userData && hit.object.userData.kind;
      if (kind) return { object: hit.object, point: hit.point, data: hit.object.userData };
    }
    return null;
  }

  function clearHover() {
    if (!hovered) return;
    for (const { mesh, emissive } of hovered.meshes) {
      if (mesh.material && mesh.material.emissive) mesh.material.emissive.setHex(emissive);
    }
    hovered = null;
    label.visible = false;
    canvas.style.cursor = "";
  }

  function applyHover(hit) {
    const state = store.state;
    const data = hit.data;
    let root = hit.object;
    while (root.parent && !root.name.startsWith("building:") && !root.name.startsWith("construction:") && root.parent !== engine.scene) {
      root = root.parent;
    }
    if (hovered && hovered.group === root) {
      positionLabel(hit, data, state);
      return;
    }
    clearHover();

    const meshes = [];
    if (data.kind === "building") {
      root.traverse((o) => {
        if (o.isMesh && o.material && o.material.emissive) {
          meshes.push({ mesh: o, emissive: o.material.emissive.getHex() });
          o.material.emissive.setHex(0x2a3540);
        }
      });
    }
    hovered = { group: root, meshes };
    positionLabel(hit, data, state);
    canvas.style.cursor = "pointer";
  }

  function positionLabel(hit, data, state) {
    labelEl.textContent = ""; // rebuilt below; textContent only, never markup
    if (data.kind === "building") {
      const app = state.apps.find((a) => a.name === data.app);
      const name = document.createElement("strong");
      name.textContent = data.app;
      labelEl.append(name);
      if (app) {
        const phase = document.createElement("span");
        phase.textContent = phaseWord(app.phase);
        phase.dataset.phase = app.phase;
        labelEl.append(phase);
      }
    } else if (data.kind === "district") {
      const d = layout.districtOf(data.zone);
      const name = document.createElement("strong");
      name.textContent = d ? d.display : data.zone;
      labelEl.append(name, Object.assign(document.createElement("span"), { textContent: "district" }));
    } else if (data.kind === "memorial") {
      const name = document.createElement("strong");
      name.textContent = data.app;
      labelEl.append(name, Object.assign(document.createElement("span"), { textContent: "memorial park" }));
    } else if (data.kind === "cityhall") {
      labelEl.append(Object.assign(document.createElement("strong"), { textContent: "City Hall" }));
    } else if (data.kind === "mayor") {
      labelEl.append(Object.assign(document.createElement("strong"), { textContent: "The Mayor" }));
    }
    label.position.copy(hit.point).add(new THREE.Vector3(0, 2.2, 0));
    label.visible = true;
  }

  canvas.addEventListener("pointermove", (e) => {
    if (downAt) return;
    const hit = pickRoot(e);
    if (hit) applyHover(hit);
    else clearHover();
  });

  canvas.addEventListener("pointerdown", (e) => {
    downAt = { x: e.clientX, y: e.clientY };
  });

  canvas.addEventListener("pointerup", (e) => {
    const wasDown = downAt;
    downAt = null;
    if (!wasDown) return;
    const dist = Math.hypot(e.clientX - wasDown.x, e.clientY - wasDown.y);
    if (dist > DRAG_PX) return;

    const hit = pickRoot(e);
    if (!hit) {
      store.update({ selection: null });
      return;
    }
    const d = hit.data;
    if (d.kind === "building" || d.kind === "memorial") {
      store.update({ selection: { type: "app", id: d.app } });
    } else if (d.kind === "district") {
      store.update({ selection: { type: "district", id: d.zone } });
    } else if (d.kind === "cityhall") {
      store.update({ selection: { type: "shop", id: "cityhall" } });
    } else if (d.kind === "mayor") {
      store.update({ selection: { type: "mayor", id: "mayor" } });
    }
  });

  canvas.addEventListener("pointerleave", clearHover);

  return { clearHover };
}
