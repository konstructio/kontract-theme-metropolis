// The progression engine: XP, quests, streaks, and the character ledger.
// XP and level are GLOBAL across themes (spec): we only ever add XP, never
// reset it, and we preserve every foreign key another theme wrote.
//
// Hooks arrive on a DOM event bus so any module can report a real platform
// interaction with one line:
//   window.dispatchEvent(new CustomEvent("metropolis:hook", {detail:{hook:"ship-app"}}))

import { el } from "../util.js";

export const XP_EVENTS = {
  "first-zone": 50,
  "ship-app": 25,
  "app-live": 15,
  "scale-app": 20,
  "friday-ship": 50,
};

export const QUESTS = [
  { key: "metropolis.q1", title: "Incorporation Papers", hook: "create-zone", xp: 50, reward: "metropolis.sash.ribbon" },
  { key: "metropolis.q2", title: "Register the Blueprint", hook: "register-app", xp: 50 },
  { key: "metropolis.q3", title: "Groundbreaking", hook: "ship-app", xp: 100 },
  { key: "metropolis.q4", title: "Building Inspector", hook: "build-logs", xp: 30 },
  { key: "metropolis.q5", title: "Second Wing", hook: "scale-app", xp: 75 },
  { key: "metropolis.q6", title: "Grand Opening", hook: "public-url", xp: 75 },
  { key: "metropolis.q7", title: "Renovation Order", hook: "redeploy", xp: 75 },
  { key: "metropolis.q8", title: "New Supply Route", hook: "change-branch", xp: 100 },
  { key: "metropolis.q9", title: "Twin Cities", hook: "create-zone", xp: 150, needs: (g) => g.world.ever.zones.length >= 2 },
  { key: "metropolis.q10", title: "City Hall Patron", hook: "shop", xp: 50 },
  { key: "metropolis.q11", title: "Keys to the City", hook: "streak", xp: 300, reward: "metropolis.gadget.keys" },
];

export const COSMETICS = [
  { key: "metropolis.hat.hardhat", slot: "hat", name: "Gold Hardhat", source: "free" },
  { key: "metropolis.hat.tophat", slot: "hat", name: "Founder's Top Hat", source: "level", level: 5 },
  { key: "metropolis.suit.golden", slot: "suit", name: "Golden Hour Suit", source: "level", level: 8 },
  { key: "metropolis.sash.ribbon", slot: "sash", name: "Ribbon-Cutting Sash", source: "quest", quest: "metropolis.q1" },
  { key: "metropolis.gadget.keys", slot: "gadget", name: "Keys to the City", source: "quest", quest: "metropolis.q11" },
  { key: "metropolis.statue.bronze", slot: "statue", name: "Bronze Statue", source: "level", level: 10 },
];

export const levelFor = (xp) => Math.floor(Math.sqrt(Math.max(0, xp) / 100)) + 1;

const todayKey = () => new Date().toISOString().slice(0, 10);

export function createGame(store, actions, hud) {
  const game = {
    xp: 0,
    name: "Mayor",
    questsDone: new Set(),
    inventory: new Set(),
    equipped: {}, // slot -> cosmetic key
    world: { lots: {}, ever: { zones: [], apps: [] }, days: [] },
    foreign: { appearance: {}, inventory: [], quests: [] }, // other themes' data, preserved verbatim
    ready: false,
  };

  // ---------------- ledger load / save ----------------
  async function load() {
    if (!actions) {
      game.ready = true;
      emit();
      return;
    }
    try {
      const c = (await actions.character()) || {};
      game.xp = c.xp || 0;
      game.name = c.display_name || "Mayor";
      const ap = c.appearance || {};
      for (const [k, v] of Object.entries(ap)) {
        if (k === "metropolis.world") {
          try {
            const w = JSON.parse(v);
            if (w && w.ever) game.world = w;
          } catch (_) { /* rebuild from scratch */ }
        } else if (k.startsWith("metropolis.eq.")) {
          game.equipped[k.slice("metropolis.eq.".length)] = v;
        } else {
          game.foreign.appearance[k] = v;
        }
      }
      for (const it of c.inventory || []) {
        const key = it.key || it;
        if (String(key).startsWith("metropolis.")) game.inventory.add(key);
        else game.foreign.inventory.push(it);
      }
      for (const q of c.quests || []) {
        const key = q.key || q;
        if (String(key).startsWith("metropolis.")) game.questsDone.add(key);
        else game.foreign.quests.push(q);
      }
    } catch (e) {
      console.warn("character load failed:", e);
    }
    game.ready = true;
    accrete(store.state); // fold in whatever the city already knows
    emit();
  }

  let saveTimer = null;
  function save() {
    if (!actions || !game.ready) return;
    clearTimeout(saveTimer);
    saveTimer = setTimeout(async () => {
      const appearance = { ...game.foreign.appearance };
      for (const [slot, key] of Object.entries(game.equipped)) appearance[`metropolis.eq.${slot}`] = key;
      try {
        appearance["metropolis.world"] = JSON.stringify(compactWorld());
      } catch (_) { /* world stays unsaved this round */ }
      const spec = {
        display_name: game.name,
        appearance,
        xp: game.xp,
        level: levelFor(game.xp),
        quests: [...game.foreign.quests, ...[...game.questsDone].map((key) => ({ key }))],
        inventory: [...game.foreign.inventory, ...[...game.inventory].map((key) => ({ key }))],
        equipped: Object.fromEntries(Object.entries(game.equipped).map(([s, k]) => [`metropolis.${s}`, k])),
      };
      try {
        await actions.saveCharacter(spec);
      } catch (e) {
        console.warn("character save failed:", e);
      }
    }, 1500);
  }

  function compactWorld() {
    const w = game.world;
    // cap the ledger ~4KB: ship-day history is the only unbounded flavor
    if (w.days.length > 60) w.days = w.days.slice(-60);
    if (w.ever.apps.length > 200) w.ever.apps = w.ever.apps.slice(-200);
    return w;
  }

  // ---------------- xp / quests ----------------
  const listeners = new Set();
  function emit() {
    for (const fn of listeners) fn(game);
  }

  function award(xp, why) {
    if (!xp) return;
    game.xp += xp;
    hud.showToast(`+${xp} XP`, why);
    save();
    emit();
  }

  function completeQuest(q) {
    if (game.questsDone.has(q.key)) return;
    game.questsDone.add(q.key);
    award(q.xp, `Quest complete: ${q.title}`);
    if (q.reward) {
      game.inventory.add(q.reward);
      const c = COSMETICS.find((x) => x.key === q.reward);
      hud.showToast("UNLOCKED", c ? c.name : q.reward);
    }
    store.addTicker("quest", `Quest complete: ${q.title}`);
  }

  function fire(hook) {
    // standard xp events tied to hooks
    if (hook === "ship-app") {
      award(XP_EVENTS["ship-app"], "Groundbreaking");
      const day = todayKey();
      if (!game.world.days.includes(day)) game.world.days.push(day);
      if (new Date().getDay() === 5) award(XP_EVENTS["friday-ship"], "Shipped on a Friday");
      if (streakLength() >= 3) tryHook("streak");
    }
    if (hook === "app-live") award(XP_EVENTS["app-live"], "Open for business");
    if (hook === "scale-app") award(XP_EVENTS["scale-app"], "Rezoned");
    if (hook === "create-zone" && game.world.ever.zones.length === 0) {
      award(XP_EVENTS["first-zone"], "The city's first district");
    }
    tryHook(hook);
    save();
  }

  function tryHook(hook) {
    for (const q of QUESTS) {
      if (q.hook !== hook || game.questsDone.has(q.key)) continue;
      if (q.needs && !q.needs(game)) continue;
      completeQuest(q);
    }
  }

  function streakLength() {
    const days = [...game.world.days].sort();
    let run = 1, best = 1;
    for (let i = 1; i < days.length; i++) {
      const prev = new Date(days[i - 1]);
      const cur = new Date(days[i]);
      run = cur - prev <= 86400000 * 1.5 ? run + 1 : 1;
      best = Math.max(best, run);
    }
    return days.length ? best : 0;
  }

  window.addEventListener("metropolis:hook", (e) => fire(e.detail.hook));

  // ---------------- the world only accretes ----------------
  function accrete(state) {
    let changed = false;
    for (const z of state.zones) {
      if (!game.world.ever.zones.includes(z.name)) {
        game.world.ever.zones.push(z.name);
        changed = true;
      }
    }
    for (const a of state.apps) {
      if (!game.world.ever.apps.some((x) => x.n === a.name)) {
        game.world.ever.apps.push({ n: a.name, z: a.zone_ref });
        changed = true;
        if (game.ready && game.world.ever.apps.length === 10) {
          window.dispatchEvent(new CustomEvent("metropolis:tenth-ship"));
        }
      }
    }
    if (changed && game.ready) save();
  }

  store.subscribe((state, keys) => {
    if (keys.has("apps") || keys.has("zones")) accrete(state);
  });

  load();

  return {
    game,
    fire,
    onChange: (fn) => (listeners.add(fn), () => listeners.delete(fn)),
    setName(name) {
      game.name = name || "Mayor";
      save();
      emit();
    },
    equip(slot, key) {
      game.equipped[slot] = key;
      save();
      emit();
    },
    grant(key) {
      game.inventory.add(key);
      save();
      emit();
    },
    unlocked(c) {
      if (c.source === "free") return true;
      if (c.source === "level") return levelFor(game.xp) >= (c.level || 1);
      if (c.source === "quest") return game.questsDone.has(c.quest);
      return game.inventory.has(c.key);
    },
    levelFor,
  };
}
