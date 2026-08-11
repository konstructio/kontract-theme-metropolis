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
        }
        lastPhase.set(app.name, app.phase);
      }
    } else if (keys.has("metrics")) {
      ambient.sync(state);
    }
  });

  window.addEventListener("keydown", (e) => {
    if (e.key === "Escape") effects.skip();
  });

  engine.onFrame((dt) => {
    particles.update(dt);
    ambient.update(dt, dayNight.isNight());
    effects.update(dt);
  });

  if (launched) {
    // M5: bridge.js boots the real data feed here.
    store.update({ launched: true });
  } else {
    store.update(sampleSnapshot());
    startSampleTimeline(store);
  }

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
