"use strict";
const assert = require("node:assert/strict");
const test = require("node:test");

const store = require("../src/core/state/store.js");
const { safeColor, fromPicker } = require("../src/core/render/color.js");

// Minimal localStorage. `failWrites` models Safari private mode and a full
// quota: the object exists, setItem throws.
function fakeStorage(opts) {
  const o = opts || {};
  const map = new Map();
  return {
    map,
    get length() {
      return map.size;
    },
    key(i) {
      return Array.from(map.keys())[i];
    },
    getItem(k) {
      return map.has(k) ? map.get(k) : null;
    },
    setItem(k, v) {
      if (o.failWrites) throw new Error("QuotaExceededError");
      if (o.failAfter !== undefined && map.size >= o.failAfter && !map.has(k)) {
        throw new Error("QuotaExceededError");
      }
      map.set(k, String(v));
    },
    removeItem(k) {
      map.delete(k);
    }
  };
}

function withStorage(storage, pathname) {
  global.window = {
    localStorage: storage,
    location: { pathname: pathname || "/sense/app/APP1/sheet/S1/state/analysis" }
  };
  store._reset();
  return storage;
}

test("state survives a round trip and is keyed by app and object", () => {
  const s = withStorage(fakeStorage());
  assert.equal(store.save("obj1", { collapse: { level: 0 } }), true);
  assert.deepEqual(store.load("obj1"), { collapse: { level: 0 } });

  assert.equal(store.load("obj2"), null, "a different object has its own state");

  const key = store.keyFor("obj1");
  assert.ok(key.indexOf("APP1") > -1, "app id from the URL is in the key: " + key);
  assert.ok(key.indexOf("obj1") > -1);

  // Same object id in a different app must not collide.
  withStorage(s, "/sense/app/APP2/sheet/S1/state/analysis");
  assert.equal(store.load("obj1"), null);
});

test("clear removes only the one entry", () => {
  withStorage(fakeStorage());
  store.save("a", { x: 1 });
  store.save("b", { x: 2 });
  store.clear("a");
  assert.equal(store.load("a"), null);
  assert.deepEqual(store.load("b"), { x: 2 });
});

test("blocked storage degrades to no persistence, never an exception", () => {
  withStorage(fakeStorage({ failWrites: true }));
  assert.equal(store.save("obj1", { x: 1 }), false);
  assert.equal(store.load("obj1"), null);
  assert.doesNotThrow(() => store.clear("obj1"));
});

test("corrupt entries read as absent rather than throwing", () => {
  const s = withStorage(fakeStorage());
  s.map.set(store.keyFor("obj1"), "{not json");
  assert.equal(store.load("obj1"), null);
  assert.equal(store.save("obj1", { x: 1 }), true, "and are overwritten");
  assert.deepEqual(store.load("obj1"), { x: 1 });
});

test("state too large to be worth storing is refused, not truncated", () => {
  withStorage(fakeStorage());
  const huge = { collapse: { collapsed: new Array(20000).fill("0:1:a-long-node-path") } };
  assert.equal(store.save("obj1", huge), false);
  assert.equal(store.load("obj1"), null, "no half-written entry left behind");
});

test("the store is bounded — old entries are evicted, not accumulated", () => {
  const s = withStorage(fakeStorage());
  for (let i = 0; i < 80; i++) store.save("obj" + i, { i });
  const ours = Array.from(s.map.keys()).filter((k) => k.indexOf("inkpivot:") === 0);
  assert.ok(ours.length <= 60, "kept " + ours.length + " entries");
  assert.deepEqual(store.load("obj79"), { i: 79 }, "the newest write survives");
});

test("a full quota is retried after a hard prune", () => {
  const s = withStorage(fakeStorage({ failAfter: 10 }));
  for (let i = 0; i < 10; i++) store.save("obj" + i, { i });
  assert.equal(s.map.size, 10);
  assert.equal(store.save("late", { i: "late" }), true, "pruned, then written");
  assert.deepEqual(store.load("late"), { i: "late" });
});

test("keys left by other apps on the origin are not touched", () => {
  const s = withStorage(fakeStorage());
  s.map.set("someoneElse", "keep me");
  for (let i = 0; i < 80; i++) store.save("obj" + i, { i });
  assert.equal(s.map.get("someoneElse"), "keep me");
});

test("colours: pickers, legacy strings and injection attempts", () => {
  assert.equal(fromPicker({ index: -1, color: "#ff0000" }), "#ff0000");
  assert.equal(fromPicker({ index: 3, color: "#4477aa" }), "#4477aa", "palette swatch");
  assert.equal(fromPicker({ index: 3, color: null }), null, "index with no hex falls back");
  assert.equal(fromPicker(null), null);
  assert.equal(fromPicker("#ff0000"), null, "a bare string is not a picker value");

  assert.equal(safeColor("rgb(1, 2, 3)"), "rgb(1, 2, 3)");
  assert.equal(safeColor("  #abc  "), "#abc", "trimmed");
  // The reason the grid sets backgroundColor rather than the shorthand.
  assert.equal(safeColor("#fff url(https://example.invalid/x)"), null);
  assert.equal(safeColor("red; background-image: url(x)"), null);
  assert.equal(safeColor(""), null);
  assert.equal(safeColor(undefined), null);
});
