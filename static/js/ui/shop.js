// City Hall — the shop. Districts come from discovery (never hardcoded
// capacity or price), free items grant real cosmetics, human services are
// real links to real people. Visiting fires the "shop" quest hook.

import { el } from "../util.js";
import { COSMETICS } from "./quests.js";

const FREE_ITEMS = [
  { key: "metropolis.hat.hardhat", name: "Gold Hardhat", desc: "standard issue for every mayor who builds" },
  { key: "metropolis.decor.fountain", name: "Plaza Fountain Lights", desc: "teal glow for the civic fountain at night" },
];

const HUMAN_SERVICES = [
  { name: "Planning Session with John Dietz", url: "https://ro.am/johndietz/book-me", desc: "book time with the city's founding engineer" },
  { name: "Konstruct Crew · City Engineers", url: "https://www.civo.com/konstruct#contact", desc: "the people who run the ground beneath the city" },
];

export function createShop(store, gamectl, wizards, actions) {
  function open() {
    window.dispatchEvent(new CustomEvent("metropolis:hook", { detail: { hook: "shop" } }));
    const g = gamectl.game;
    const state = store.state;

    const districtSection = el("div", {},
      el("h3", {}, "Districts"),
      el("p", { class: "muted" },
        state.platform.bands
          ? "District tiers and rates come from the platform's discovery document."
          : "Districts are free to claim — capacity is governed by the org's Power Grid, not per-district caps."),
      el("div", { class: "mrow", style: "justify-content:flex-start" },
        el("button", { class: "btn primary", onclick: () => { wizards.closeModal(); wizards.openClaim(); } },
          "Claim a District")));

    const freeSection = el("div", {},
      el("h3", {}, "Free Items"),
      ...FREE_ITEMS.map((item) => {
        const owned = g.inventory.has(item.key) || COSMETICS.some((c) => c.key === item.key && gamectl.unlocked(c));
        const btn = el("button", { class: "btn" }, owned ? "Owned" : "Take it");
        btn.disabled = owned;
        btn.addEventListener("click", () => {
          gamectl.grant(item.key);
          btn.textContent = "Owned";
          btn.disabled = true;
        });
        return el("div", { class: "shop-row" },
          el("div", {}, el("b", {}, item.name), el("p", { class: "muted" }, item.desc)), btn);
      }));

    const humanSection = el("div", {},
      el("h3", {}, "Human Services"),
      ...HUMAN_SERVICES.map((s) =>
        el("div", { class: "shop-row" },
          el("div", {}, el("b", {}, s.name), el("p", { class: "muted" }, s.desc)),
          el("a", { class: "btn", href: s.url, target: "_blank", rel: "noreferrer noopener" }, "Book"))));

    wizards.openModal("City Hall", districtSection, freeSection, humanSection);
  }

  store.subscribe((state, keys) => {
    if (keys.has("selection") && state.selection && state.selection.type === "shop") {
      open();
      store.update({ selection: null });
    }
  });

  return { open };
}
