// The Mayor: naming, cosmetics, quest board. Opens when the statue is
// clicked (selection.type === "mayor") or from the rail. XP and level are
// global across themes — this screen only ever adds.

import { el } from "../util.js";
import { QUESTS, COSMETICS, levelFor } from "./quests.js";
import { mayorPortraitSVG } from "../city/mayor.js";

const SLOTS = ["hat", "suit", "sash", "gadget", "statue"];
const SLOT_ICONS = { hat: "⛑", suit: "🧥", sash: "🎗", gadget: "🗝", statue: "🗿" };

export function createCharacterScreen(store, gamectl, wizards) {
  function open() {
    const g = gamectl.game;
    const lvl = levelFor(g.xp);

    const nameInput = el("input", { type: "text", value: g.name, maxlength: 30 });
    nameInput.addEventListener("change", () => gamectl.setName(nameInput.value.trim() || "Mayor"));

    const slotRows = SLOTS.map((slot) => {
      const options = COSMETICS.filter((c) => c.slot === slot);
      if (!options.length) return null;
      const items = options.map((c) => {
        const owned = gamectl.unlocked(c);
        const on = g.equipped[slot] === c.key;
        const b = el("button", { class: `cos-btn${on ? " sel" : ""}${owned ? "" : " locked"}` },
          el("b", {}, c.name),
          el("small", {}, owned ? (on ? "equipped" : "owned") :
            c.source === "level" ? `unlocks at level ${c.level}` : "quest reward"));
        b.addEventListener("click", () => {
          if (!owned) return;
          gamectl.equip(slot, on ? "" : c.key);
          open(); // re-render
        });
        return b;
      });
      return el("div", { class: "slot-row" },
        el("h3", {}, `${SLOT_ICONS[slot] || ""} ${slot}`),
        el("div", { class: "cos-grid" }, items));
    });

    const questRows = QUESTS.map((q) => {
      const done = g.questsDone.has(q.key);
      return el("div", { class: `quest-row${done ? " done" : ""}` },
        el("span", { class: "q-mark" }, done ? "✓" : "○"),
        el("span", { class: "q-title" }, q.title),
        el("span", { class: "q-xp" }, `${q.xp} xp`));
    });

    const portrait = el("div", { class: "mayor-portrait" });
    portrait.append(mayorPortraitSVG(g.equipped));

    wizards.openModal("The Mayor",
      el("div", { class: "mayor-head" },
        portrait,
        el("div", { class: "mayor-stats" },
          el("label", {}, "Name", nameInput),
          el("p", { class: "muted" }, `Level ${lvl} · ${g.xp} XP (XP is shared across every theme — it only ever grows)`),
          el("p", { class: "muted" }, "Equipped items show on the portrait — and on the Mayor strolling the plaza."))),
      el("h3", {}, "Cosmetics"),
      ...slotRows.filter(Boolean),
      el("h3", {}, "Quest Board"),
      el("div", { class: "quests" }, questRows));
  }

  // statue click routes here
  store.subscribe((state, keys) => {
    if (keys.has("selection") && state.selection && state.selection.type === "mayor") {
      open();
      store.update({ selection: null });
    }
  });

  return { open };
}
