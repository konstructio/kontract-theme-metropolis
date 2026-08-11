// The write paths, in the city's voice but mechanically truthful: Claim a
// District (createZone), the Construct wizard (shipApp — repo picker,
// environments-first, sizes from discovery, quota fit preview that warns
// but never blocks), and the demolition confirm. In sample mode every
// button exists but opens an honest "launch from Konstruct" notice.

import { el, slug, friendlyError, parseCpu, parseMemGi } from "../util.js";
import { WORDS } from "./vocab.js";

export function createWizards(store, actions, hud, effects) {
  const modalRoot = document.getElementById("modal-root");

  // ---------------- modal infra ----------------
  function openModal(title, ...content) {
    closeModal();
    const overlay = el("div", { class: "overlay" });
    overlay.addEventListener("pointerdown", (e) => {
      if (e.target === overlay) closeModal();
    });
    const box = el("div", { class: "modal" },
      el("header", {}, el("h2", {}, title), el("button", { class: "x", onclick: closeModal }, "×")),
      ...content
    );
    overlay.append(box);
    modalRoot.append(overlay);
    return box;
  }
  function closeModal() {
    modalRoot.textContent = "";
  }

  function sampleNotice(what) {
    openModal("Sample City",
      el("p", {}, `This is the sample city — ${what} requires launching Metropolis from Konstruct, where it acts on your real org.`),
      el("div", { class: "mrow" }, el("button", { class: "btn", onclick: closeModal }, "Understood"))
    );
  }

  // ---------------- claim district ----------------
  function openClaim(onClaimed) {
    if (!actions) return sampleNotice("claiming a district");
    const nameInput = el("input", { type: "text", placeholder: "e.g. Harborfront", maxlength: 40 });
    const slugPreview = el("code", { class: "slug-preview" }, "—");
    nameInput.addEventListener("input", () => {
      slugPreview.textContent = slug(nameInput.value) || "—";
    });
    const err = el("p", { class: "form-error", hidden: "hidden" });
    const claimBtn = el("button", { class: "btn primary" }, "Claim District");
    claimBtn.addEventListener("click", async () => {
      const name = slug(nameInput.value);
      if (!name) {
        err.textContent = "A district needs a name.";
        err.hidden = false;
        return;
      }
      claimBtn.disabled = true;
      try {
        await actions.createZone(name, nameInput.value.trim());
        hud.showToast("SURVEYORS DISPATCHED", `District "${nameInput.value.trim()}" is being platted.`);
        store.addTicker("zone", `New district claimed: ${nameInput.value.trim()}`);
        window.dispatchEvent(new CustomEvent("metropolis:hook", { detail: { hook: "create-zone" } }));
        closeModal();
        if (onClaimed) onClaimed(name);
      } catch (e) {
        err.textContent = friendlyError(e);
        err.hidden = false;
        claimBtn.disabled = false;
      }
    });
    openModal("Claim a District",
      el("p", { class: "muted" }, "A district is a zone — a real environment your buildings deploy into."),
      el("label", {}, "District name", nameInput),
      el("p", { class: "muted" }, "on the map as ", slugPreview),
      err,
      el("div", { class: "mrow" }, claimBtn)
    );
  }

  // ---------------- construct wizard ----------------
  async function openConstruct() {
    if (!actions) return sampleNotice("constructing a building");
    const state = store.state;

    // environments-first: no districts → claim one, then come back
    if (!state.zones.length) {
      openClaim(() => setTimeout(openConstruct, 400));
      const box = modalRoot.querySelector(".modal header h2");
      if (box) box.textContent = "First: claim your first district";
      return;
    }

    const box = openModal("Construct a Building", el("p", { class: "muted" }, "Fetching blueprints (registered repos)…"));

    let repos = [];
    try {
      repos = await actions.appRepos();
    } catch (_) {
      repos = [];
    }
    box.textContent = "";
    box.append(el("header", {}, el("h2", {}, "Construct a Building"), el("button", { class: "x", onclick: closeModal }, "×")));

    if (repos.length) {
      window.dispatchEvent(new CustomEvent("metropolis:hook", { detail: { hook: "register-app" } }));
    }
    if (!repos.length) {
      box.append(
        el("p", {}, "No registered repos yet — a building needs a blueprint."),
        el("p", { class: "muted" }, "Register an application repository in Konstruct (App repositories) for this org, then come back here."),
        el("div", { class: "mrow" }, el("button", { class: "btn", onclick: closeModal }, "Close"))
      );
      return;
    }

    const sizes = state.platform.sizes;
    const form = {
      repo: repos[0],
      zone: state.zones[0].name,
      name: "",
      branch: "main",
      port: 8080,
      size: sizes[Math.min(1, sizes.length - 1)]?.key || sizes[0]?.key || "",
      replicas: 1,
      publicUrl: true,
      region: "",
    };

    const repoSel = el("select", {}, repos.map((r, i) => el("option", { value: String(i) }, r.repo_name || r.repo_url)));
    repoSel.addEventListener("change", () => {
      form.repo = repos[Number(repoSel.value)];
      if (!nameInput.value) syncNameFromRepo();
    });

    const zoneSel = el("select", {}, state.zones.map((z) => el("option", { value: z.name }, z.display_name || z.name)));
    zoneSel.addEventListener("change", () => (form.zone = zoneSel.value));

    const nameInput = el("input", { type: "text", maxlength: 40, placeholder: "building name" });
    const slugPreview = el("code", { class: "slug-preview" }, "—");
    nameInput.addEventListener("input", () => {
      form.name = slug(nameInput.value);
      slugPreview.textContent = form.name || "—";
      renderFit();
    });
    function syncNameFromRepo() {
      const base = (form.repo.repo_name || "").split("/").pop() || "";
      nameInput.value = base;
      form.name = slug(base);
      slugPreview.textContent = form.name || "—";
    }
    syncNameFromRepo();

    const branchInput = el("input", { type: "text", value: "main", maxlength: 80 });
    branchInput.addEventListener("input", () => (form.branch = branchInput.value.trim() || "main"));

    const portInput = el("input", { type: "number", value: "8080", min: "1", max: "65535" });
    portInput.addEventListener("input", () => (form.port = Number(portInput.value) || 8080));

    const sizeWrap = el("div", { class: "size-grid" });
    for (const s of sizes) {
      const b = el("button", { class: "size-btn" + (s.key === form.size ? " sel" : "") },
        el("b", {}, s.key), el("small", {}, `${s.cpu} · ${s.memory}`));
      b.addEventListener("click", () => {
        form.size = s.key;
        sizeWrap.querySelectorAll(".size-btn").forEach((x) => x.classList.remove("sel"));
        b.classList.add("sel");
        renderFit();
      });
      sizeWrap.append(b);
    }

    const repInput = el("input", { type: "number", value: "1", min: "1", max: "9" });
    repInput.addEventListener("input", () => {
      form.replicas = Math.max(1, Number(repInput.value) || 1);
      renderFit();
    });

    const pubToggle = el("input", { type: "checkbox", checked: "checked" });
    pubToggle.addEventListener("change", () => (form.publicUrl = pubToggle.checked));

    const regions = state.platform.regions || [];
    let regionRow = null;
    if (regions.length) {
      const regionSel = el("select", {},
        el("option", { value: "" }, "platform default"),
        regions.map((r) => el("option", { value: r.name }, r.name)));
      regionSel.addEventListener("change", () => (form.region = regionSel.value));
      regionRow = el("label", {}, "Region", regionSel);
    }

    // quota fit preview — grid load bar; warns, never blocks (the platform
    // is the judge; we just forecast)
    const fitBar = el("i");
    const fitText = el("p", { class: "muted" });
    const fitWrap = el("div", { class: "fit" },
      el("span", { class: "quota-label" }, `${WORDS.quota} forecast`),
      el("b", { class: "bar wide" }, fitBar), fitText);
    function renderFit() {
      const q = store.state.quota;
      const sz = sizes.find((s) => s.key === form.size);
      if (!q || !q.cpu || !sz) {
        fitText.textContent = "";
        return;
      }
      const addCpu = parseCpu(sz.cpu) * form.replicas;
      const after = (q.cpu.used || 0) + addCpu;
      if (!q.cpu.limit) {
        fitBar.style.width = "100%";
        fitBar.style.background = "var(--teal)";
        fitBar.style.opacity = "0.25";
        fitText.textContent = `${WORDS.quota}: uncapped — cpu ${Math.round(after * 100) / 100} after construction`;
        return;
      }
      fitBar.style.opacity = "1";
      const pct = Math.min(100, (after / q.cpu.limit) * 100);
      fitBar.style.width = `${pct}%`;
      fitBar.style.background = pct > 100 - 0.001 ? "var(--danger)" : pct > 85 ? "var(--ember)" : "var(--teal)";
      fitText.textContent =
        `${WORDS.quota} after construction: cpu ${Math.round(after * 100) / 100}/${q.cpu.limit}` +
        (after > q.cpu.limit ? " — over capacity; the grid may refuse this permit" : "");
    }
    renderFit();

    const err = el("p", { class: "form-error", hidden: "hidden" });
    const go = el("button", { class: "btn primary" }, "Break Ground");
    go.addEventListener("click", async () => {
      if (!form.name) {
        err.textContent = "The building needs a name.";
        err.hidden = false;
        return;
      }
      go.disabled = true;
      err.hidden = true;
      const payload = {
        app_name: form.name,
        repo_url: form.repo.repo_url || "",
        repo_name: form.repo.repo_name || "",
        branch: form.branch,
        port: form.port > 0 && form.port < 65536 ? form.port : 8080,
        replicas: form.replicas,
        public_url_enabled: form.publicUrl,
        zone_ref: form.zone,
        size: form.size,
      };
      if (form.region) payload.region = form.region;
      try {
        await actions.shipApp(payload);
        closeModal();
        hud.showToast("GROUNDBREAKING", `${form.name} is under construction in ${form.zone}.`);
        store.addTicker("ship", `Groundbreaking: ${form.name} (${form.zone})`);
        window.dispatchEvent(new CustomEvent("metropolis:hook", { detail: { hook: "ship-app" } }));
        effects.celebrate(form.name, { friday: new Date().getDay() === 5 });
        store.update({ selection: { type: "app", id: form.name } });
      } catch (e) {
        err.textContent = friendlyError(e);
        err.hidden = false;
        go.disabled = false;
      }
    });

    box.append(
      el("label", {}, "Blueprint (repo)", repoSel),
      el("label", {}, "District", zoneSel),
      el("label", {}, "Name", nameInput),
      el("p", { class: "muted" }, "on the map as ", slugPreview),
      el("div", { class: "two-col" },
        el("label", {}, "Branch", branchInput),
        el("label", {}, "Port", portInput)),
      el("label", {}, "Size (from the platform's catalog)", sizeWrap),
      el("div", { class: "two-col" },
        el("label", {}, "Replicas", repInput),
        el("label", { class: "check" }, pubToggle, " public street address")),
      regionRow,
      fitWrap,
      err,
      el("div", { class: "mrow" }, go)
    );
  }

  // ---------------- demolition ----------------
  function openDemolish(kind, name, doDelete) {
    if (!actions) return sampleNotice("demolition");
    const confirmInput = el("input", { type: "text", placeholder: name });
    const err = el("p", { class: "form-error", hidden: "hidden" });
    const btn = el("button", { class: "btn danger" }, "Issue Demolition Permit");
    btn.addEventListener("click", async () => {
      if (confirmInput.value !== name) {
        err.textContent = "Type the exact name to confirm demolition.";
        err.hidden = false;
        return;
      }
      btn.disabled = true;
      try {
        await doDelete();
        closeModal();
        hud.showToast("DEMOLISHED", `${name} came down. A pocket park keeps the lot.`);
        store.addTicker("delete", `Demolished: ${name}`);
        store.update({ selection: null });
      } catch (e) {
        err.textContent = friendlyError(e);
        err.hidden = false;
        btn.disabled = false;
      }
    });
    openModal(`Demolish this ${kind}?`,
      el("p", {}, `This permanently deletes ${kind === "district" ? "the zone" : "the app"} "${name}" from the platform.`),
      el("label", {}, `Type "${name}" to confirm`, confirmInput),
      err,
      el("div", { class: "mrow" }, el("button", { class: "btn", onclick: closeModal }, "Keep it"), btn)
    );
  }

  // ---------------- right rail ----------------
  const rail = document.getElementById("hud-right");
  const railBtn = (label, fn) => {
    const b = el("button", { class: "rail-btn" }, label);
    b.addEventListener("click", fn);
    rail.append(b);
    return b;
  };
  railBtn(WORDS.construct, openConstruct);
  railBtn(WORDS.claimZone, () => openClaim());

  return { openConstruct, openClaim, openDemolish, openModal, closeModal, railBtn, sampleNotice };
}
