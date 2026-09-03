"use strict";
const assert = require("node:assert/strict");
const test = require("node:test");

const { parsePivotPages } = require("../src/core/data/parse.js");
const { flatten } = require("../src/core/state/flatten.js");
const { CollapseSet } = require("../src/core/state/collapse.js");
const { twoDimPage } = require("./fixtures.js");

const model = () => parsePivotPages([twoDimPage(false)]);
const shape = (rows) => rows.map((r) => r.node.text + ":" + r.kind);
const find = (nodes, text) => {
  for (const nd of nodes) {
    if (nd.text === text) return nd;
    const hit = find(nd.children, text);
    if (hit) return hit;
  }
  return null;
};

test("parse: a 'T' subtree spans exactly one data row", () => {
  const m = model();
  assert.equal(m.rowLeafCount, 6);
  const grand = m.rowTree[m.rowTree.length - 1];
  assert.equal(grand.type, "T");
  assert.equal(grand.leafCount, 1, "grand total wraps a single 'E' padding leaf");
  assert.equal(grand.leafStart, 5);
  assert.equal(find(m.rowTree, "A").children[2].leafStart, 2, "A's subtotal row");
});

test("flatten: subtotals render, and honour subtotalPos", () => {
  const m = model();
  const all = new CollapseSet({ level: 99 });

  assert.deepEqual(shape(flatten(m.rowTree, all, { subtotalPos: "bottom" })), [
    "A:group", "a1:leaf", "a2:leaf", "Totals:total",
    "B:group", "b1:leaf", "Totals:total",
    "Totals:total"
  ]);
  assert.deepEqual(shape(flatten(m.rowTree, all, { subtotalPos: "top" })), [
    "Totals:total",
    "A:group", "Totals:total", "a1:leaf", "a2:leaf",
    "B:group", "Totals:total", "b1:leaf"
  ]);
  assert.equal(
    flatten(m.rowTree, all, { subtotalPos: "off" }).filter((r) => r.kind === "total").length,
    0
  );
});

test("flatten: total rows point at the engine's subtotal data row", () => {
  const m = model();
  const rows = flatten(m.rowTree, new CollapseSet({ level: 99 }), {});
  const totals = rows.filter((r) => r.kind === "total");
  assert.deepEqual(totals.map((r) => r.leafIndex), [2, 4, 5]);
});

test("flatten: a collapsed group shows its subtotal row's values", () => {
  const m = model();
  const rows = flatten(m.rowTree, new CollapseSet({ level: 0 }), {});
  const a = rows.find((r) => r.node.text === "A");
  assert.equal(a.kind, "collapsed");
  assert.equal(a.leafIndex, 2, "A collapses onto Total(A), never a client-side sum");
  assert.equal(rows.filter((r) => r.kind === "leaf").length, 0);
});

test("compact keeps the grand total but folds group subtotals into the group row", () => {
  const m = model();
  const rows = flatten(m.rowTree, new CollapseSet({ level: 99 }), {
    layout: "compact"
  });
  assert.deepEqual(shape(rows), [
    "A:group", "a1:leaf", "a2:leaf",
    "B:group", "b1:leaf",
    "Totals:total"
  ]);
  assert.equal(rows[0].leafIndex, 2, "group row carries Total(A)'s values inline");
});

test("the default level applies to groups that only appear after a selection", () => {
  // The regression behind "level 1 works on load, then stops": the old code
  // seeded a set of collapsed paths once, so any group whose path was not in
  // that snapshot — i.e. every group in a tree reshaped by a selection —
  // rendered expanded.
  const set = new CollapseSet({ level: 0 });
  const before = flatten(model().rowTree, set, {});
  assert.deepEqual(before.filter((r) => r.node.type === "N").map((r) => r.kind), [
    "collapsed", "collapsed"
  ]);

  const after = parsePivotPages([twoDimPage(true)]); // selection reveals region C
  const rows = flatten(after.rowTree, set, {});
  const c = rows.find((r) => r.node.text === "C");
  assert.equal(c.kind, "collapsed", "a newly visible group still follows the default");
});

test("toggling records a delta against the default and survives a round trip", () => {
  const m = model();
  const set = new CollapseSet({ level: 0 });
  const a = find(m.rowTree, "A");

  set.toggle(a);
  assert.equal(set.isCollapsed(a), false);
  const saved = set.serialize();
  assert.deepEqual(saved.expanded, [a.path]);
  assert.deepEqual(saved.collapsed, [], "no entry for nodes that match the default");

  const restored = new CollapseSet(saved);
  assert.equal(restored.isCollapsed(a), false);
  assert.equal(restored.isCollapsed(find(m.rowTree, "B")), true);

  // Toggling back to the default drops the override rather than pinning it.
  restored.toggle(a);
  assert.deepEqual(restored.serialize().expanded, []);
  assert.equal(restored.isCollapsed(a), true);
});

test("changing the default level in the property panel takes effect", () => {
  const m = model();
  const a = find(m.rowTree, "A");
  const set = new CollapseSet({ level: 0 });
  set.toggle(a);

  assert.equal(set.setDefaultLevel(0), false, "no-op when the level is unchanged");
  assert.equal(set.setDefaultLevel(99), true);
  assert.equal(set.isCollapsed(a), false);
  assert.deepEqual(set.serialize(), { collapsed: [], expanded: [], level: 99 });

  // A missing/garbage level normalises to "expand all" rather than collapsing
  // everything, so it is already a no-op once the level is 99.
  assert.equal(set.setDefaultLevel(undefined), false);
  assert.equal(set.defaultLevel(), 99);
  assert.equal(set.setDefaultLevel(-3), true, "negative levels clamp to 0, not to 'all'");
  assert.equal(set.defaultLevel(), 0);
});

test("legacy persisted state (a bare array of paths) still loads", () => {
  const m = model();
  const a = find(m.rowTree, "A");
  const set = new CollapseSet([a.path]);
  assert.equal(set.isCollapsed(a), true);
  assert.equal(set.isCollapsed(find(m.rowTree, "B")), false);
});

test("export: the sheet matches what is on screen, including compact layout", () => {
  const { buildAoa } = require("../src/export/xlsx-export.js");
  const m = model();
  m.dimInfoRows = 2;
  const set = new CollapseSet({ level: 99 });
  const opts = { subtotalPos: "bottom", dimTitles: ["Region", "City"] };

  const columns = buildAoa(m, set, opts);
  assert.deepEqual(columns.aoa[0], ["Region", "City", ""]);
  assert.deepEqual(columns.aoa.slice(1).map((r) => r.slice(0, 2)), [
    ["A", ""], ["", "a1"], ["", "a2"], ["", "Totals"],
    ["B", ""], ["", "b1"], ["", "Totals"],
    ["Totals", ""]
  ]);
  assert.equal(columns.aoa[1][2], "", "an expanded group row has no value of its own");
  assert.equal(columns.aoa[4][2], 20, "Total(A) carries leaf row 2");

  const compact = buildAoa(m, set, Object.assign({ rowLayout: "compact" }, opts));
  assert.equal(compact.visible.length, 6);
  assert.equal(compact.aoa[1][2], 20, "compact group rows export their inline subtotal");
});
