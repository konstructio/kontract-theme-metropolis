// The inspector panel: click a building, read the truth, act on it. Phase
// words carry the fiction; the raw state, status message, URL, logs and
// metrics are the platform's own words. Every button does the real thing —
// or, in sample mode, honestly says why it can't.

import { el, friendlyError } from "../util.js";
import { phaseWord, phaseColor, WORDS } from "./vocab.js";

const UNDER_CONSTRUCTION = new Set(["Building", "Pushing", "Deploying"]);

export function createInspector(store, layout, ctx = {}) {
  const { actions = null, wizards = null, hud = null } = ctx;
  const root = document.getElementById("panel-root");
  let openFor = null;
  let activeTab = "meters";
  let wireLines = [];
  let wireClosed = "";
  let wireOpenFor = null;
  let buildLogText = null;
  let historyRows = null;

  const toast = (t, m, k) => hud && hud.showToast(t, m, k);
  const guard = (fn) => (actions ? fn : () => wizards && wizards.sampleNotice("acting on a building"));

  function closeStreams() {
    if (actions && wireOpenFor) actions.closeLogs();
    wireOpenFor = null;
    wireLines = [];
    wireClosed = "";
  }

  function close() {
    closeStreams();
    root.textContent = "";
    openFor = null;
    activeTab = "meters";
    buildLogText = null;
    historyRows = null;
  }

  function sparkline(series, color) {
    const canvas = el("canvas", { class: "spark", width: 220, height: 42 });
    const ctx2 = canvas.getContext("2d");
    if (!series || series.length < 2) {
      ctx2.fillStyle = "rgba(243,245,247,.4)";
      ctx2.font = "11px sans-serif";
      ctx2.fillText("no data yet", 6, 24);
      return canvas;
    }
    const vs = series.map((p) => p.v);
    const max = Math.max(...vs) || 1;
    ctx2.strokeStyle = color;
    ctx2.lineWidth = 1.6;
    ctx2.beginPath();
    series.forEach((p, i) => {
      const x = (i / (series.length - 1)) * 214 + 3;
      const y = 38 - (p.v / max) * 32;
      i === 0 ? ctx2.moveTo(x, y) : ctx2.lineTo(x, y);
    });
    ctx2.stroke();
    return canvas;
  }

  function row(label, ...value) {
    return el("div", { class: "irow" }, el("span", { class: "ilabel" }, label), el("span", { class: "ival" }, ...value));
  }

  // ---------------- action helpers ----------------
  async function act(label, fn, okTitle, okMsg) {
    try {
      await fn();
      if (okTitle) toast(okTitle, okMsg || "");
    } catch (e) {
      toast(`${label.toUpperCase()} FAILED`, friendlyError(e), "error");
    }
  }

  function scaleControls(app) {
    const setReplicas = (n) =>
      act("scale", async () => {
        await actions.updateApp(app.name, { replicas: n });
        window.dispatchEvent(new CustomEvent("metropolis:hook", { detail: { hook: "scale-app" } }));
      }, "REZONED", `${app.name} now runs ${n} replica${n === 1 ? "" : "s"}.`);
    const minus = el("button", { class: "mini-btn" }, "−");
    const plus = el("button", { class: "mini-btn" }, "+");
    minus.addEventListener("click", guard(() => app.replicas > 1 && setReplicas(app.replicas - 1)));
    plus.addEventListener("click", guard(() => setReplicas(app.replicas + 1)));
    return el("span", { class: "scale-ctl" }, minus, ` ${app.replicas} `, plus);
  }

  function branchEditor(app) {
    const input = el("input", { type: "text", value: app.branch || "main", class: "inline-input" });
    const btn = el("button", { class: "mini-btn" }, "reroute");
    btn.addEventListener("click", guard(() => {
      const branch = input.value.trim();
      if (!branch || branch === app.branch) return;
      act("reroute", async () => {
        await actions.updateApp(app.name, { branch });
        window.dispatchEvent(new CustomEvent("metropolis:hook", { detail: { hook: "change-branch" } }));
      }, "SUPPLY LINE REROUTED", `${app.name} now builds from "${branch}".`);
      store.addTicker("branch", `${app.name} resupplied from ${branch}`);
    }));
    return el("span", { class: "branch-ctl" }, input, btn);
  }

  function envEditor(app) {
    const rows = el("div", {},
      (app.env || []).map((e) => envRow(e.name || e.key || "", e.value || "")));
    if (!(app.env || []).length) rows.append(envRow("", ""));
    function envRow(k, v) {
      return el("div", { class: "env-row" },
        el("input", { type: "text", value: k, placeholder: "KEY", class: "env-k" }),
        el("input", { type: "text", value: v, placeholder: "value", class: "env-v" }));
    }
    const add = el("button", { class: "mini-btn" }, "+ var");
    add.addEventListener("click", () => rows.append(envRow("", "")));
    const save = el("button", { class: "btn primary" }, "Hook up utilities");
    save.addEventListener("click", () => {
      const env = [...rows.querySelectorAll(".env-row")]
        .map((r) => ({ name: r.querySelector(".env-k").value.trim(), value: r.querySelector(".env-v").value }))
        .filter((e) => e.name);
      act("utilities", () => actions.updateApp(app.name, { env }),
        "UTILITIES HOOKED UP", `${env.length} variable${env.length === 1 ? "" : "s"} set — rebuilding.`);
      wizards.closeModal();
    });
    wizards.openModal(`Utility hookups — ${app.name}`,
      el("p", { class: "muted" }, "Environment variables. Values are stored on the platform, not in this page."),
      rows, el("div", { class: "mrow" }, add, save));
  }

  function volumeEditor(app) {
    if (app.volume && app.volume.size) {
      wizards.openModal(`Basement warehouse — ${app.name}`,
        el("p", {}, `Attached: ${app.volume.size} at ${app.volume.mount_path || "/data"}.`),
        el("div", { class: "mrow" },
          el("button", { class: "btn danger", onclick: () => {
            act("detach", () => actions.updateApp(app.name, { volume: { size: "" } }),
              "WAREHOUSE CLEARED", "Persistent volume detached.");
            wizards.closeModal();
          } }, "Detach volume")));
      return;
    }
    const sel = el("select", {}, ["1Gi", "5Gi", "10Gi", "20Gi"].map((s) => el("option", { value: s }, s)));
    wizards.openModal(`Basement warehouse — ${app.name}`,
      el("p", { class: "muted" }, "A persistent volume. Attaching locks the building to 1 replica."),
      el("label", {}, "Size", sel),
      el("div", { class: "mrow" },
        el("button", { class: "btn primary", onclick: () => {
          act("attach", () => actions.updateApp(app.name, { volume: { size: sel.value, mount_path: "/data" } }),
            "WAREHOUSE DUG", `${sel.value} persistent storage at /data.`);
          wizards.closeModal();
        } }, "Attach")));
  }

  function domainEditor(app) {
    const input = el("input", { type: "text", value: app.custom_domain || "", placeholder: "www.example.com" });
    const pub = el("input", { type: "checkbox" });
    pub.checked = !!app.public_url_enabled;
    wizards.openModal(`Street address — ${app.name}`,
      el("label", {}, "Custom domain", input),
      app.domain_token
        ? el("p", { class: "muted" }, `Verification TXT token: ${app.domain_token} (${app.domain_verified ? "verified" : "pending"})`)
        : null,
      el("label", { class: "check" }, pub, " open to the public (URL enabled)"),
      el("div", { class: "mrow" },
        el("button", { class: "btn primary", onclick: () => {
          const jobs = [];
          const domain = input.value.trim();
          if (domain !== (app.custom_domain || "")) jobs.push(() => actions.updateApp(app.name, { custom_domain: domain }));
          if (pub.checked !== !!app.public_url_enabled) jobs.push(() => actions.updateApp(app.name, { public_url_enabled: pub.checked }));
          if (!jobs.length) return wizards.closeModal();
          act("address", async () => {
            for (const j of jobs) await j();
            if (pub.checked) window.dispatchEvent(new CustomEvent("metropolis:hook", { detail: { hook: "public-url" } }));
          }, "ADDRESS REGISTERED", domain ? `${domain} points at ${app.name}.` : "Public access updated.");
          wizards.closeModal();
        } }, "Register")));
  }

  // ---------------- tabs ----------------
  function tabBar(app) {
    const tabs = [
      ["meters", "Meters"],
      ["wire", WORDS.logs],
      ["builds", "Builds"],
      ["history", "History"],
    ];
    return el("div", { class: "tabs" },
      tabs.map(([id, label]) => {
        const b = el("button", { class: "tab" + (activeTab === id ? " on" : "") }, label);
        b.addEventListener("click", () => {
          if (activeTab === "wire" && id !== "wire") closeStreams();
          activeTab = id;
          if (id === "builds") {
            buildLogText = null;
            window.dispatchEvent(new CustomEvent("metropolis:hook", { detail: { hook: "build-logs" } }));
          }
          if (id === "history") historyRows = null;
          renderApp(store.state, app.name);
        });
        return b;
      }));
  }

  function tabContent(state, app) {
    if (activeTab === "meters") {
      const m = state.metrics[app.name] || {};
      return el("div", { class: "sparks" },
        el("div", {}, el("small", {}, "cpu %"), sparkline(m.cpu, "#f5a623")),
        el("div", {}, el("small", {}, "memory"), sparkline(m.mem, "#39c0c8")),
        el("div", {}, el("small", {}, "network"), sparkline(m.net, "#74b06a")));
    }

    if (activeTab === "wire") {
      const pre = el("pre", { class: "wire" }, wireLines.length ? wireLines.join("\n") : "…");
      if (!actions) return el("p", { class: "muted" }, "Live logs stream here when launched from Konstruct.");
      if (wireOpenFor !== app.name) {
        closeStreams();
        wireOpenFor = app.name;
        actions.openLogs(app.name,
          (line) => {
            wireLines.push(line);
            if (wireLines.length > 300) wireLines.splice(0, wireLines.length - 300);
            const node = root.querySelector(".wire");
            if (node) {
              node.textContent = wireLines.join("\n");
              node.scrollTop = node.scrollHeight;
            }
          },
          (reason) => {
            wireClosed = reason || "stream ended";
            const node = root.querySelector(".wire-closed");
            if (node) {
              node.textContent = wireClosed;
              node.hidden = false;
            }
          });
      }
      return el("div", {},
        pre,
        el("p", { class: "muted wire-closed", hidden: wireClosed ? undefined : "hidden" }, wireClosed));
    }

    if (activeTab === "builds") {
      if (!actions) return el("p", { class: "muted" }, "Construction logs appear when launched from Konstruct.");
      const pre = el("pre", { class: "wire" }, buildLogText === null ? "fetching construction log…" : buildLogText || "(empty)");
      if (buildLogText === null) {
        actions.buildLogs(app.name).then(
          (logs) => {
            buildLogText = typeof logs === "string" ? logs : JSON.stringify(logs, null, 2);
            const node = root.querySelector(".wire");
            if (node && activeTab === "builds") node.textContent = buildLogText || "(empty)";
          },
          (e) => {
            buildLogText = `construction log unavailable: ${friendlyError(e)}`;
            const node = root.querySelector(".wire");
            if (node && activeTab === "builds") node.textContent = buildLogText;
          });
      }
      const refresh = el("button", { class: "mini-btn" }, "refresh");
      refresh.addEventListener("click", () => {
        buildLogText = null;
        renderApp(store.state, app.name);
      });
      return el("div", {}, pre, el("div", { class: "mrow" }, refresh));
    }

    // history
    if (!actions) return el("p", { class: "muted" }, "Inspection history appears when launched from Konstruct.");
    const wrap = el("div", { class: "history" });
    if (historyRows === null) {
      wrap.append(el("p", { class: "muted" }, "fetching inspections…"));
      actions.deployments(app.name).then(
        (rows) => {
          historyRows = Array.isArray(rows) ? rows : [];
          if (activeTab === "history") renderApp(store.state, app.name);
        },
        () => {
          historyRows = [];
          if (activeTab === "history") renderApp(store.state, app.name);
        });
    } else if (!historyRows.length) {
      wrap.append(el("p", { class: "muted" }, "no inspections on file"));
    } else {
      for (const d of historyRows.slice(0, 10)) {
        wrap.append(el("div", { class: "hrow" },
          el("b", {}, `#${d.build ?? "?"}`),
          el("span", {}, String(d.ref || "")),
          el("span", { class: "hphase" }, String(d.phase || "")),
          el("span", { class: "muted" }, String(d.reason || d.revision || "").slice(0, 46))));
      }
    }
    return wrap;
  }

  // ---------------- panels ----------------
  function renderApp(state, name) {
    const app = state.apps.find((a) => a.name === name);
    root.textContent = "";
    if (!app) {
      root.append(
        el("aside", { class: "panel" },
          el("header", {}, el("h2", {}, name), el("button", { class: "x", onclick: close }, "×")),
          el("p", { class: "muted" },
            "This building was demolished. Its pocket park stays on the map — the city only accretes.")));
      return;
    }

    const phase = el("div", { class: "phase-chip" }, phaseWord(app.phase));
    phase.style.borderColor = phaseColor(app.phase);
    phase.style.color = phaseColor(app.phase);
    phase.title = `platform phase: ${app.phase}`;

    const caps = state.platform.caps;
    const actionRow = el("div", { class: "actions" },
      el("button", { class: "mini-btn", onclick: guard(() =>
        act("renovation", async () => {
          await actions.redeploy(app.name);
          window.dispatchEvent(new CustomEvent("metropolis:hook", { detail: { hook: "redeploy" } }));
        }, "RENOVATION ORDERED", `${app.name} is rebuilding from ${app.branch}.`)) },
        "renovate"),
      el("button", { class: "mini-btn", onclick: guard(() => envEditor(app)) }, "utilities"),
      (!caps.length || caps.includes("volumes"))
        ? el("button", { class: "mini-btn", onclick: guard(() => volumeEditor(app)) }, WORDS.volume.split(" ")[1] || "volume")
        : null,
      (!caps.length || caps.includes("custom-domains"))
        ? el("button", { class: "mini-btn", onclick: guard(() => domainEditor(app)) }, "address")
        : null,
      el("button", { class: "mini-btn danger", onclick: guard(() =>
        wizards.openDemolish("building", app.name, () => actions.deleteApp(app.name))) },
        "demolish"));

    root.append(
      el("aside", { class: "panel" },
        el("header", {}, el("h2", {}, app.name), el("button", { class: "x", onclick: close }, "×")),
        phase,
        app.statusMessage ? el("p", { class: "status-message" }, app.statusMessage) : null,
        app.url && app.public_url_enabled
          ? el("p", {}, el("a", { href: app.url, target: "_blank", rel: "noreferrer noopener" }, app.url))
          : app.urlPending
            ? el("p", { class: "muted" }, "street address registered — waiting for the platform to verify it resolves")
            : null,
        el("div", { class: "igrid" },
          row("district", app.zone_ref),
          row("size", app.size || "—"),
          row("replicas", scaleControls(app)),
          row("branch", branchEditor(app)),
          row("repo", app.repo_name || "—"),
          row("port", String(app.port || "—")),
          app.volume && app.volume.size ? row(WORDS.volume, `${app.volume.size} @ ${app.volume.mount_path || "/data"}`) : null,
          app.custom_domain ? row(WORDS.domain, app.custom_domain) : null),
        actionRow,
        tabBar(app),
        tabContent(state, app)));
  }

  function renderDistrict(state, zoneName) {
    const zone = state.zones.find((z) => z.name === zoneName);
    const apps = state.apps.filter((a) => a.zone_ref === zoneName);
    root.textContent = "";
    root.append(
      el("aside", { class: "panel" },
        el("header", {}, el("h2", {}, zone ? zone.display_name || zone.name : zoneName), el("button", { class: "x", onclick: close }, "×")),
        el("p", { class: "muted" }, `district · ${apps.length} ${apps.length === 1 ? WORDS.app : WORDS.apps}`),
        el("ul", { class: "district-apps" },
          apps.map((a) => {
            const li = el("li", {},
              el("button", { class: "linklike", onclick: () => store.update({ selection: { type: "app", id: a.name } }) }, a.name),
              el("span", { class: "mini-phase" }, phaseWord(a.phase)));
            li.querySelector(".mini-phase").style.color = phaseColor(a.phase);
            return li;
          })),
        zone && !apps.length
          ? el("div", { class: "mrow" },
              el("button", { class: "btn danger", onclick: guard(() =>
                wizards.openDemolish("district", zone.name, () => actions.deleteZone(zone.name))) },
                "Unclaim district"))
          : null));
  }

  store.subscribe((state, keys) => {
    if (keys.has("selection")) {
      const sel = state.selection;
      if (openFor && (!sel || sel.id !== openFor.id)) closeStreams();
      openFor = sel;
      if (!sel) return close();
      if (sel.type === "app") {
        activeTab = UNDER_CONSTRUCTION.has((state.apps.find((a) => a.name === sel.id) || {}).phase) ? "builds" : "meters";
        buildLogText = null;
        historyRows = null;
        renderApp(state, sel.id);
      } else if (sel.type === "district") renderDistrict(state, sel.id);
      return;
    }
    if ((keys.has("apps") || keys.has("metrics")) && openFor) {
      if (openFor.type === "app" && activeTab !== "wire") renderApp(state, openFor.id);
      else if (openFor.type === "district") renderDistrict(state, openFor.id);
    }
  });

  return { close };
}
