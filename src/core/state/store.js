"use strict";
var { NS } = require("../ns.js");

// Durable per-viewer UI state.
//
// The engine has nowhere to put this. applyPatches(patches, true) is a session
// soft patch — deliberately so, since that is what lets it work for consumers
// of a published app with no write access — and it evaporates when the session
// ends. On client-managed there is no server-side per-user store for
// consumers, so localStorage is the only durable option. It is per browser
// profile: a different machine, or cleared site data, starts fresh.
//
// Namespaced by extension id so a dev build and the published extension keep
// separate state, and by app so two apps cannot collide on a repeated qId.

var PREFIX = "inkpivot:";
var MAX_ENTRIES = 60;
var MAX_BYTES = 64 * 1024;
var MAX_AGE_MS = 180 * 24 * 60 * 60 * 1000;

var probed;
function store() {
  if (probed !== undefined) return probed;
  probed = null;
  try {
    const s = window.localStorage;
    // Existence is not availability: Safari's private mode hands back a
    // storage object whose setItem throws, so probe with a real write.
    const k = PREFIX + "probe";
    s.setItem(k, "1");
    s.removeItem(k);
    probed = s;
  } catch (e) {
    probed = null;
  }
  return probed;
}

function appKey() {
  try {
    const m = /\/app\/([^/?#]+)/.exec(window.location.pathname);
    return m ? m[1] : "app";
  } catch (e) {
    return "app";
  }
}

function keyFor(objectId) {
  return PREFIX + NS + ":" + appKey() + ":" + objectId;
}

function ourKeys(s) {
  const out = [];
  for (let i = 0; i < s.length; i++) {
    const k = s.key(i);
    if (!k || k.indexOf(PREFIX) !== 0) continue;
    let savedAt = 0;
    try {
      savedAt = (JSON.parse(s.getItem(k)) || {}).savedAt || 0;
    } catch (e) {
      savedAt = 0; // unparseable: oldest, so it is evicted first
    }
    out.push({ key: k, savedAt });
  }
  return out;
}

function drop(s, key) {
  try {
    s.removeItem(key);
  } catch (e) {
    /* nothing useful to do */
  }
}

// Objects get deleted and apps get retired; without this the store only ever
// grows. Collect first, then remove — removing shifts s.key() indices.
function prune(s, hard) {
  try {
    const now = Date.now();
    ourKeys(s).forEach(function (e) {
      if (now - e.savedAt > MAX_AGE_MS) drop(s, e.key);
    });
    const list = ourKeys(s).sort(function (a, b) {
      return a.savedAt - b.savedAt;
    });
    // Soft: leave room for the write that follows, so the store settles at
    // MAX_ENTRIES rather than one above it.
    // Hard: we are recovering from a real quota error, and the quota is the
    // whole origin's — other apps may be using it, and our own entries vary
    // in size. Halving whatever we hold guarantees the retry frees something;
    // a fixed floor would free nothing when we hold less than it.
    const keep = hard
      ? Math.min(Math.floor(MAX_ENTRIES / 2), Math.floor(list.length / 2))
      : MAX_ENTRIES - 1;
    while (list.length > keep) drop(s, list.shift().key);
  } catch (e) {
    /* a full or hostile store is not worth failing a render over */
  }
}

function load(objectId) {
  const s = store();
  if (!s || !objectId) return null;
  try {
    const raw = s.getItem(keyFor(objectId));
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    return parsed && typeof parsed === "object" && parsed.state ? parsed.state : null;
  } catch (e) {
    return null;
  }
}

function save(objectId, state) {
  const s = store();
  if (!s || !objectId) return false;
  let raw;
  try {
    raw = JSON.stringify({ savedAt: Date.now(), state: state });
  } catch (e) {
    return false;
  }
  // A pivot with thousands of toggled groups is not worth a quota fight.
  if (raw.length > MAX_BYTES) return false;
  prune(s, false);
  try {
    s.setItem(keyFor(objectId), raw);
    return true;
  } catch (e) {
    prune(s, true);
    try {
      s.setItem(keyFor(objectId), raw);
      return true;
    } catch (e2) {
      return false;
    }
  }
}

function clear(objectId) {
  const s = store();
  if (!s || !objectId) return;
  drop(s, keyFor(objectId));
}

// Tests only: the probe result is cached for the life of the page.
function _reset() {
  probed = undefined;
}

module.exports = { load, save, clear, keyFor, _reset };
