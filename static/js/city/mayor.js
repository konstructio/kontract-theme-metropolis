// The Mayor, in person: a small figure strolling the plaza wearing whatever
// cosmetics are equipped. Click routes to the character screen (same
// userData as the statue). The statue cosmetic upgrades the plaza statue.

import * as THREE from "three";

const SUIT_DEFAULT = 0x5a6a7e;
const SUIT_GOLDEN = 0xf5a623;
const SKIN = 0xd9a877;

function lambert(color, emissive = 0x000000, ei = 0) {
  return new THREE.MeshLambertMaterial({ color, emissive, emissiveIntensity: ei });
}

function buildFigure(equipped) {
  const g = new THREE.Group();
  g.name = "mayor-figure";

  const suitColor = equipped.suit === "metropolis.suit.golden" ? SUIT_GOLDEN : SUIT_DEFAULT;
  const suitMat = lambert(suitColor, suitColor === SUIT_GOLDEN ? 0x553800 : 0x000000, 0.25);

  // legs (animated by name)
  for (const [name, x] of [["leg-l", -0.11], ["leg-r", 0.11]]) {
    const leg = new THREE.Mesh(new THREE.CylinderGeometry(0.075, 0.075, 0.42, 6), lambert(0x333a44));
    leg.name = name;
    leg.position.set(x, 0.21, 0);
    g.add(leg);
  }

  const body = new THREE.Mesh(new THREE.CapsuleGeometry(0.22, 0.42, 3, 8), suitMat);
  body.position.y = 0.75;
  body.castShadow = true;
  g.add(body);

  // sash: a diagonal ribbon across the chest
  if (equipped.sash === "metropolis.sash.ribbon") {
    const sash = new THREE.Mesh(
      new THREE.TorusGeometry(0.24, 0.045, 6, 14),
      lambert(0xd93a4c, 0x400a10, 0.35)
    );
    sash.position.y = 0.82;
    sash.rotation.set(Math.PI / 2.4, 0, 0.5);
    g.add(sash);
  }

  const head = new THREE.Mesh(new THREE.SphereGeometry(0.17, 10, 10), lambert(SKIN));
  head.position.y = 1.22;
  g.add(head);

  // hats
  if (equipped.hat === "metropolis.hat.hardhat") {
    const dome = new THREE.Mesh(
      new THREE.SphereGeometry(0.16, 10, 8, 0, Math.PI * 2, 0, Math.PI / 2),
      lambert(0xf5a623, 0x553800, 0.4)
    );
    dome.position.y = 1.32;
    g.add(dome);
    const brim = new THREE.Mesh(new THREE.CylinderGeometry(0.21, 0.21, 0.03, 12), lambert(0xf5a623, 0x553800, 0.4));
    brim.position.y = 1.31;
    g.add(brim);
  } else if (equipped.hat === "metropolis.hat.tophat") {
    const stack = new THREE.Mesh(new THREE.CylinderGeometry(0.13, 0.13, 0.3, 10), lambert(0x14171c));
    stack.position.y = 1.48;
    g.add(stack);
    const brim = new THREE.Mesh(new THREE.CylinderGeometry(0.22, 0.22, 0.03, 12), lambert(0x14171c));
    brim.position.y = 1.34;
    g.add(brim);
  }

  // gadget: the Keys to the City, swinging at the hip
  if (equipped.gadget === "metropolis.gadget.keys") {
    const keys = new THREE.Mesh(new THREE.BoxGeometry(0.09, 0.16, 0.03), lambert(0xffd23f, 0x554400, 0.5));
    keys.name = "mayor-keys";
    keys.position.set(0.26, 0.62, 0.05);
    g.add(keys);
  }

  g.userData = { kind: "mayor" };
  g.traverse((o) => {
    if (o.isMesh) o.userData = g.userData;
  });
  return g;
}

export function createMayor(scene, gamectl) {
  let figure = buildFigure(gamectl.game.equipped);
  scene.add(figure);

  // Rebuild on cosmetic changes; upgrade the plaza statue when its cosmetic
  // is equipped (polished bronze → gleaming gold).
  let lastKey = "";
  gamectl.onChange((game) => {
    const key = JSON.stringify(game.equipped);
    if (key === lastKey) return;
    lastKey = key;
    const pos = figure.position.clone();
    const rot = figure.rotation.y;
    figure.removeFromParent();
    figure = buildFigure(game.equipped);
    figure.position.copy(pos);
    figure.rotation.y = rot;
    scene.add(figure);

    const statue = scene.getObjectByName("mayor-statue");
    if (statue) {
      const gleaming = game.equipped.statue === "metropolis.statue.bronze";
      statue.traverse((o) => {
        if (o.isMesh && o.material && o.material.emissive) {
          if (gleaming) {
            o.material.color.setHex(0xd4af37);
            o.material.emissive.setHex(0x554400);
            o.material.emissiveIntensity = 0.35;
          }
        }
      });
    }
  });

  // Stroll: a lazy loop around the plaza with pauses to admire the city.
  let angle = Math.random() * Math.PI * 2;
  const radius = 17.5;
  let t = 0;
  function update(dt) {
    t += dt;
    const pausing = Math.sin(t * 0.11) > 0.86; // stops now and then
    if (!pausing) {
      angle += dt * 0.09;
      const x = Math.cos(angle) * radius;
      const z = Math.sin(angle) * radius;
      figure.position.set(x, 0.05, z);
      figure.rotation.y = -angle; // face along the path
      const step = Math.sin(t * 7);
      const l = figure.getObjectByName("leg-l");
      const r = figure.getObjectByName("leg-r");
      if (l) l.rotation.x = step * 0.5;
      if (r) r.rotation.x = -step * 0.5;
      figure.position.y = 0.05 + Math.abs(step) * 0.03;
    } else {
      const l = figure.getObjectByName("leg-l");
      const r = figure.getObjectByName("leg-r");
      if (l) l.rotation.x = 0;
      if (r) r.rotation.x = 0;
    }
    const keys = figure.getObjectByName("mayor-keys");
    if (keys) keys.rotation.z = Math.sin(t * 5) * 0.3;
  }

  return { update };
}

// SVG portrait for the character screen — same wardrobe logic as the 3D
// figure so what you equip is what you see, in both places.
export function mayorPortraitSVG(equipped) {
  const suit = equipped.suit === "metropolis.suit.golden" ? "#f5a623" : "#5a6a7e";
  const NS = "http://www.w3.org/2000/svg";
  const svg = document.createElementNS(NS, "svg");
  svg.setAttribute("viewBox", "0 0 100 130");
  svg.setAttribute("width", "110");
  svg.setAttribute("height", "143");
  const add = (tag, attrs) => {
    const n = document.createElementNS(NS, tag);
    for (const [k, v] of Object.entries(attrs)) n.setAttribute(k, v);
    svg.append(n);
    return n;
  };
  // legs, body, head
  add("rect", { x: 38, y: 95, width: 9, height: 28, rx: 4, fill: "#333a44" });
  add("rect", { x: 53, y: 95, width: 9, height: 28, rx: 4, fill: "#333a44" });
  add("rect", { x: 30, y: 52, width: 40, height: 50, rx: 16, fill: suit });
  add("circle", { cx: 50, cy: 36, r: 14, fill: "#d9a877" });
  // sash
  if (equipped.sash === "metropolis.sash.ribbon") {
    add("rect", { x: 26, y: 60, width: 48, height: 8, rx: 4, fill: "#d93a4c", transform: "rotate(-18 50 64)" });
  }
  // hats
  if (equipped.hat === "metropolis.hat.hardhat") {
    add("path", { d: "M36 30 a14 12 0 0 1 28 0 z", fill: "#f5a623" });
    add("rect", { x: 32, y: 28, width: 36, height: 4, rx: 2, fill: "#f5a623" });
  } else if (equipped.hat === "metropolis.hat.tophat") {
    add("rect", { x: 38, y: 8, width: 24, height: 18, rx: 2, fill: "#14171c" });
    add("rect", { x: 32, y: 24, width: 36, height: 4, rx: 2, fill: "#14171c" });
  }
  // keys
  if (equipped.gadget === "metropolis.gadget.keys") {
    add("rect", { x: 68, y: 78, width: 7, height: 13, rx: 2, fill: "#ffd23f" });
    add("circle", { cx: 71.5, cy: 76, r: 3.4, fill: "none", stroke: "#ffd23f", "stroke-width": 2 });
  }
  return svg;
}
