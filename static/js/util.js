// Shared helpers. esc() is the single chokepoint for API-derived strings
// heading into markup contexts; prefer textContent everywhere you can.

export function esc(v) {
  return String(v ?? "").replace(/[&<>"']/g, (c) => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    '"': "&quot;",
    "'": "&#39;",
  })[c]);
}

// FNV-1a — stable 32-bit hash so a building looks the same on every visit.
export function fnv1a(str) {
  let h = 0x811c9dc5;
  for (let i = 0; i < str.length; i++) {
    h ^= str.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return h >>> 0;
}

// mulberry32 — tiny seeded PRNG; every procedural choice flows from one seed.
export function mulberry32(seed) {
  let a = seed >>> 0;
  return function () {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function slug(name) {
  return String(name ?? "")
    .toLowerCase()
    .replace(/[^a-z0-9-]/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "");
}

export function clamp(v, lo, hi) {
  return Math.min(hi, Math.max(lo, v));
}

export function pick(rng, arr) {
  return arr[Math.floor(rng() * arr.length)];
}

// DOM builder — children are appended as nodes, strings become text nodes
// (never markup), so API-derived values are inert by construction.
export function el(tag, attrs = {}, ...children) {
  const node = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs)) {
    if (k === "class") node.className = v;
    else if (k === "dataset") Object.assign(node.dataset, v);
    else if (k.startsWith("on") && typeof v === "function") node.addEventListener(k.slice(2), v);
    else if (v !== undefined && v !== null) node.setAttribute(k, v);
  }
  for (const c of children.flat()) {
    if (c === null || c === undefined) continue;
    node.append(c instanceof Node ? c : document.createTextNode(String(c)));
  }
  return node;
}

// Platform errors are surfaced honestly; this only adds the city's voice.
export function friendlyError(e) {
  const msg = e && e.message ? String(e.message) : "request failed";
  const status = e && e.status;
  if (status === 403 || status === 422) {
    if (/quota|allowance|free|limit|exceed/i.test(msg)) {
      return `The power grid is at capacity — ${msg}`;
    }
  }
  if (status === 409) return `That name is already on the map — ${msg}`;
  return msg;
}
