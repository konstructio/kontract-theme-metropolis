// The HUD chrome: top bar (brand, org, Power Grid, city clock), the
// Metropolis Herald ticker, the incidents chip (Failed is always one click
// away), toasts, and the celebration Skip button. All text lands via
// textContent — nothing API-derived is ever markup.

import { el } from "../util.js";
import { WORDS, phaseWord } from "./vocab.js";

export function createHud(store, { dayNight, effects, onSelectApp }) {
  const top = document.getElementById("hud-top");
  const bottom = document.getElementById("hud-bottom");
  const toastStack = document.getElementById("toast-stack");

  // ---- top bar ----
  const orgEl = el("span", { class: "hud-org" });
  const clockEl = el("span", { class: "hud-clock" });
  const cpuFill = el("i");
  const memFill = el("i");
  const quotaText = el("span", { class: "quota-text" });
  const quotaWrap = el(
    "div",
    { class: "quota", title: `${WORDS.quota} — org-wide allowance` },
    el("span", { class: "quota-label" }, WORDS.quota),
    el("b", { class: "bar" }, cpuFill),
    el("b", { class: "bar" }, memFill),
    quotaText
  );
  top.append(
    el("div", { class: "brand" }, el("strong", {}, "METROPOLIS"), orgEl, clockEl),
    quotaWrap
  );

  // ---- bottom: incidents chip + herald ticker ----
  const incidentsChip = el("button", { class: "incidents", hidden: "hidden" });
  incidentsChip.addEventListener("click", () => {
    const failed = store.state.apps.filter((a) => a.phase === "Failed");
    if (failed.length) onSelectApp(failed[0].name);
  });
  const tickerInner = el("div", { class: "ticker-inner" });
  bottom.append(incidentsChip, el("div", { class: "ticker" }, tickerInner));

  // ---- celebration skip ----
  const skipBtn = el("button", { class: "skip-btn", hidden: "hidden" }, "Skip the fireworks");
  skipBtn.addEventListener("click", () => effects.skip());
  document.getElementById("hud").append(skipBtn);

  function fmtQty(q) {
    return `${Math.round(q.used * 10) / 10}/${q.limit}`;
  }

  function render(state, keys) {
    if (keys.has("org")) orgEl.textContent = state.org ? `· ${state.org}` : "";

    if (keys.has("quota") && state.quota) {
      const { cpu, memory } = state.quota;
      if (cpu && cpu.limit) cpuFill.style.width = `${Math.min(100, (cpu.used / cpu.limit) * 100)}%`;
      if (memory && memory.limit) memFill.style.width = `${Math.min(100, (memory.used / memory.limit) * 100)}%`;
      quotaText.textContent = cpu && memory ? `cpu ${fmtQty(cpu)} · mem ${fmtQty(memory)}` : "";
      const hot = (cpu && cpu.limit && cpu.used / cpu.limit > 0.85) || (memory && memory.limit && memory.used / memory.limit > 0.85);
      quotaWrap.classList.toggle("hot", !!hot);
    }

    if (keys.has("apps")) {
      const failed = state.apps.filter((a) => a.phase === "Failed");
      incidentsChip.hidden = failed.length === 0;
      incidentsChip.textContent = failed.length === 1
        ? `⚠ 1 ${phaseWord("Failed")}`
        : `⚠ ${failed.length} × ${phaseWord("Failed")}`;
    }

    if (keys.has("ticker")) {
      tickerInner.textContent = "";
      for (const item of state.ticker.slice(-8).reverse()) {
        tickerInner.append(el("span", { class: `tick tick-${item.kind}` }, item.text));
      }
    }

    if (keys.has("celebration")) skipBtn.hidden = !state.celebration;
  }

  store.subscribe(render);
  render(store.state, new Set(["org", "quota", "apps", "ticker", "celebration"]));

  // city clock ticks on its own
  setInterval(() => {
    const h = dayNight.hour();
    const hh = String(Math.floor(h)).padStart(2, "0");
    const mm = String(Math.floor((h % 1) * 60)).padStart(2, "0");
    clockEl.textContent = `${hh}:${mm}`;
  }, 1000);

  function showToast(title, message, kind = "info") {
    const t = el("div", { class: `toast toast-${kind}` }, el("strong", {}, title), el("span", {}, message || ""));
    toastStack.append(t);
    setTimeout(() => t.classList.add("gone"), 5200);
    setTimeout(() => t.remove(), 5800);
  }

  return { showToast };
}
