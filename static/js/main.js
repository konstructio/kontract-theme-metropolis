// Metropolis boot. Decides launched vs standalone, checks WebGL2, and wires
// the data source (bridge or sample) into the store, then starts the engine.
//
// The gate MUST reference the top-level `kontract` const from kontract.js
// (a classic script). `window.kontract` is always undefined — checking it
// silently drops every theme into sample mode.

const launched = typeof kontract !== "undefined" && kontract.isLaunched();

function webgl2Available() {
  try {
    const canvas = document.createElement("canvas");
    return !!canvas.getContext("webgl2");
  } catch (_) {
    return false;
  }
}

async function boot() {
  if (!launched) {
    const banner = document.getElementById("sample-banner");
    banner.textContent =
      "SAMPLE CITY — you're viewing demonstration data. Launch Metropolis from Konstruct to govern your real org.";
    banner.hidden = false;
  }

  if (!webgl2Available()) {
    // Truthful DOM directory instead of a dead canvas — wired up with real
    // data in a later milestone; for now say why the city is missing.
    const fb = document.getElementById("fallback");
    fb.hidden = false;
    const p = document.createElement("p");
    p.textContent =
      "This browser can't run the 3D city (WebGL2 unavailable). The city directory will load here.";
    fb.appendChild(p);
    return;
  }

  const [
    { createEngine },
    { createDayNight },
    { createGround, createPlaza },
    { createRoadNetwork },
    { createCityLayout },
    { store },
    { sampleSnapshot, startSampleTimeline },
    { createParticles },
    { createAmbient },
    { createEffects },
    { createPicking },
    { createHud },
    { createInspector },
  ] = await Promise.all([
    import("./engine/scene.js"),
    import("./engine/daynight.js"),
    import("./city/props.js"),
    import("./city/roads.js"),
    import("./city/layout.js"),
    import("./store.js"),
    import("./sample-data.js"),
    import("./engine/particles.js"),
    import("./engine/ambient.js"),
    import("./engine/effects.js"),
    import("./engine/picking.js"),
    import("./ui/hud.js"),
    import("./ui/inspector.js"),
  ]);

  const engine = createEngine({
    canvasRoot: document.getElementById("canvas-root"),
    labelsRoot: document.getElementById("labels-root"),
  });

  createGround(engine.scene);
  createPlaza(engine.scene);
  const roads = createRoadNetwork(engine.scene);
  const layout = createCityLayout(engine.scene, roads);
  const dayNight = createDayNight(engine.scene);
  const particles = createParticles(engine.scene);
  const ambient = createAmbient(engine.scene, roads, layout, particles);
  const effects = createEffects(engine.scene, layout, particles, store);

  // Celebrate a build finishing: under-construction → Live throws fireworks.
  const lastPhase = new Map();
  store.subscribe((state, keys) => {
    if (keys.has("zones") || keys.has("apps") || keys.has("platform")) {
      layout.reconcile(state);
      effects.sync(state);
      ambient.sync(state);
      for (const app of state.apps) {
        const prev = lastPhase.get(app.name);
        if (
          app.phase === "Live" &&
          (prev === "Building" || prev === "Pushing" || prev === "Deploying")
        ) {
          effects.celebrate(app.name, { friday: new Date().getDay() === 5 });
          window.dispatchEvent(new CustomEvent("metropolis:hook", { detail: { hook: "app-live" } }));
        }
        lastPhase.set(app.name, app.phase);
      }
    } else if (keys.has("metrics")) {
      ambient.sync(state);
    }
  });

  createPicking(engine, layout, store);
  const hud = createHud(store, {
    dayNight,
    effects,
    onSelectApp: (name) => store.update({ selection: { type: "app", id: name } }),
  });
  window.addEventListener("keydown", (e) => {
    if (e.key === "Escape") {
      effects.skip();
      store.update({ selection: null });
    }
  });

  engine.onFrame((dt) => {
    particles.update(dt);
    ambient.update(dt, dayNight.isNight());
    effects.update(dt);
  });

  let actions = null;
  if (launched) {
    const { createBridge } = await import("./bridge.js");
    const bridge = createBridge({ toast: hud.showToast });
    actions = await bridge.boot();
  } else {
    store.update(sampleSnapshot());
    startSampleTimeline(store);
  }

  const [{ createWizards }, { createGame, levelFor }, { createCharacterScreen }, { createShop }] =
    await Promise.all([
      import("./ui/wizards.js"),
      import("./ui/quests.js"),
      import("./ui/character.js"),
      import("./ui/shop.js"),
    ]);
  const wizards = createWizards(store, actions, hud, effects);
  createInspector(store, layout, { actions, wizards, hud });

  const gamectl = createGame(store, actions, hud);
  const character = createCharacterScreen(store, gamectl, wizards);
  const shop = createShop(store, gamectl, wizards, actions);
  const { createUniverse } = await import("./ui/universe.js");
  const universe = createUniverse(store, layout, engine, gamectl);
  wizards.railBtn("Metro Map", universe.open);
  wizards.railBtn("City Hall", shop.open);
  wizards.railBtn("The Mayor", character.open);
  gamectl.onChange((g) => hud.setMayor({ name: g.name, level: levelFor(g.xp), xp: g.xp }));

  // ---- easter eggs ----
  // five clicks on the fountain scatter the pigeons
  let fountainClicks = [];
  window.addEventListener("metropolis:fountain-click", async () => {
    const now = performance.now();
    fountainClicks = fountainClicks.filter((t) => now - t < 10000);
    fountainClicks.push(now);
    if (fountainClicks.length >= 5) {
      fountainClicks = [];
      const THREE = await import("three");
      for (let i = 0; i < 4; i++) {
        setTimeout(() => {
          particles.burst(new THREE.Vector3((Math.random() - 0.5) * 10, 2, (Math.random() - 0.5) * 10), {
            count: 30, color: 0xe8e4da, speed: 6, gravity: -1.5, life: 2.2,
          });
        }, i * 250);
      }
      hud.showToast("THE PIGEONS", "You've disturbed the plaza flock.");
    }
  });
  // typing "civo" turns the whole fleet into Civo taxis for a minute
  let typed = "";
  window.addEventListener("keydown", (e) => {
    if (e.key.length !== 1) return;
    typed = (typed + e.key.toLowerCase()).slice(-4);
    if (typed === "civo") {
      ambient.setTaxiMode(60);
      hud.showToast("CIVO TAXI CO.", "Every cab in the city, on the house — for one minute.");
    }
  });
  // the tenth building ever raises the zeppelin
  window.addEventListener("metropolis:tenth-ship", () => effects.zeppelin());

  // The sun only needs a real-time nudge now and then, not every frame.
  let skyAccum = 0;
  engine.onFrame((dt) => {
    skyAccum += dt;
    if (skyAccum > 5) {
      skyAccum = 0;
      dayNight.update();
    }
  });

  engine.start();
}

boot();
