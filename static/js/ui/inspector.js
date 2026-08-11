// The inspector panel: click a building, read the truth. Phase words carry
// the fiction; the raw phase, status message, URL and metrics are the
// platform's own words. Write actions arrive in M6 — this file renders
// read-only state.

import { el } from "../util.js";
import { phaseWord, phaseColor, WORDS } from "./vocab.js";

export function createInspector(store, layout) {
  const root = document.getElementById("panel-root");
  let openFor = null; // selection snapshot

  function close() {
    root.textContent = "";
    openFor = null;
  }

  function sparkline(series, color) {
    const canvas = el("canvas", { class: "spark", width: 220, height: 42 });
    const ctx = canvas.getContext("2d");
    if (!series || series.length < 2) {
      ctx.fillStyle = "rgba(243,245,247,.4)";
      ctx.font = "11px sans-serif";
      ctx.fillText("no data yet", 6, 24);
      return canvas;
    }
    const vs = series.map((p) => p.v);
    const max = Math.max(...vs) || 1;
    ctx.strokeStyle = color;
    ctx.lineWidth = 1.6;
    ctx.beginPath();
    series.forEach((p, i) => {
      const x = (i / (series.length - 1)) * 214 + 3;
      const y = 38 - (p.v / max) * 32;
      i === 0 ? ctx.moveTo(x, y) : ctx.lineTo(x, y);
    });
    ctx.stroke();
    return canvas;
  }

  function row(label, ...value) {
    return el("div", { class: "irow" }, el("span", { class: "ilabel" }, label), el("span", { class: "ival" }, ...value));
  }

  function renderApp(state, name) {
    const app = state.apps.find((a) => a.name === name);
    root.textContent = "";
    if (!app) {
      // a memorial park or an app that vanished between updates
      root.append(
        el("aside", { class: "panel" },
          el("header", {},
            el("h2", {}, name),
            el("button", { class: "x", onclick: close }, "×")),
          el("p", { class: "muted" },
            "This building was demolished. Its pocket park stays on the map — the city only accretes.")
        )
      );
      return;
    }

    const m = state.metrics[app.name] || {};
    const phase = el("div", { class: "phase-chip" }, phaseWord(app.phase));
    phase.style.borderColor = phaseColor(app.phase);
    phase.style.color = phaseColor(app.phase);

    const panel = el(
      "aside",
      { class: "panel" },
      el("header", {},
        el("h2", {}, app.name),
        el("button", { class: "x", onclick: close }, "×")),
      phase,
      app.statusMessage
        ? el("p", { class: "status-message" }, app.statusMessage)
        : null,
      app.url && app.public_url_enabled
        ? el("p", {}, el("a", { href: app.url, target: "_blank", rel: "noreferrer noopener" }, app.url))
        : null,
      el("div", { class: "igrid" },
        row("district", app.zone_ref),
        row("size", app.size || "—"),
        row("replicas", String(app.replicas || 1)),
        row("branch", app.branch || "main"),
        row("repo", app.repo_name || "—"),
        row("port", String(app.port || "—")),
        app.volume && app.volume.size ? row(WORDS.volume, `${app.volume.size} @ ${app.volume.mount_path || "/data"}`) : null,
        app.custom_domain ? row(WORDS.domain, app.custom_domain) : null
      ),
      el("h3", {}, "Meters"),
      el("div", { class: "sparks" },
        el("div", {}, el("small", {}, "cpu"), sparkline(m.cpu, "#f5a623")),
        el("div", {}, el("small", {}, "memory"), sparkline(m.mem, "#39c0c8")),
        el("div", {}, el("small", {}, "network"), sparkline(m.net, "#74b06a"))
      )
    );
    root.append(panel);
  }

  function renderDistrict(state, zoneName) {
    const zone = state.zones.find((z) => z.name === zoneName);
    const apps = state.apps.filter((a) => a.zone_ref === zoneName);
    root.textContent = "";
    root.append(
      el("aside", { class: "panel" },
        el("header", {},
          el("h2", {}, zone ? zone.display_name || zone.name : zoneName),
          el("button", { class: "x", onclick: close }, "×")),
        el("p", { class: "muted" }, `district · ${apps.length} ${apps.length === 1 ? WORDS.app : WORDS.apps}`),
        el("ul", { class: "district-apps" },
          apps.map((a) => {
            const li = el("li", {},
              el("button", { class: "linklike", onclick: () => store.update({ selection: { type: "app", id: a.name } }) }, a.name),
              el("span", { class: "mini-phase" }, phaseWord(a.phase)));
            li.querySelector(".mini-phase").style.color = phaseColor(a.phase);
            return li;
          })
        )
      )
    );
  }

  store.subscribe((state, keys) => {
    if (keys.has("selection")) {
      const sel = state.selection;
      openFor = sel;
      if (!sel) return close();
      if (sel.type === "app") renderApp(state, sel.id);
      else if (sel.type === "district") renderDistrict(state, sel.id);
      // shop/mayor selections are handled by their own screens (M7)
      return;
    }
    // live refresh while open
    if ((keys.has("apps") || keys.has("metrics")) && openFor) {
      if (openFor.type === "app") renderApp(state, openFor.id);
      else if (openFor.type === "district") renderDistrict(state, openFor.id);
    }
  });

  return { close };
}
