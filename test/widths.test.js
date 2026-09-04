"use strict";
const assert = require("node:assert/strict");
const test = require("node:test");

const { resolveWidths, frForWidth, MIN_COL_PX } = require("../src/core/render/widths.js");

const sum = (a) => a.reduce((x, y) => x + y, 0);

test("under Fill width the columns add up to the container exactly", () => {
  // Fractional shares used to round to a total a pixel or two over or under,
  // which under Fill width is the difference between filling the space and a
  // permanent 1px horizontal scrollbar.
  for (const containerW of [800, 801, 1023, 1366, 997]) {
    for (const frs of [[1, 1, 1], [1.5, 1, 1, 1], [3, 1], [2, 2, 1, 1, 1, 1, 1]]) {
      const natural = frs.map(() => 100);
      const out = resolveWidths(natural, frs, containerW);
      assert.equal(
        sum(out),
        containerW,
        "frs " + JSON.stringify(frs) + " in " + containerW
      );
      assert.ok(out.every(Number.isInteger), "whole pixels only");
    }
  }
});

test("weights are respected in proportion", () => {
  const out = resolveWidths([100, 100], [3, 1], 800);
  assert.deepEqual(out, [600, 200]);
});

test("columns never go below the minimum, even if that overflows", () => {
  // Twenty columns cannot fit 400px at 48px each. Overflowing into a
  // horizontal scrollbar is right; unreadably thin columns are not.
  const frs = new Array(20).fill(1);
  const out = resolveWidths(frs.map(() => 10), frs, 400);
  assert.ok(out.every((w) => w >= MIN_COL_PX));
  assert.ok(sum(out) > 400, "and the remainder is not handed out on top");
});

test("natural widths win when they already exceed the container", () => {
  const natural = [300, 300, 300];
  assert.deepEqual(resolveWidths(natural, [1, 1, 1], 500), natural);
});

test("a container of unknown width leaves the natural widths alone", () => {
  const natural = [160, 110];
  assert.deepEqual(resolveWidths(natural, [1, 1], 0), natural);
  assert.deepEqual(resolveWidths(natural, [1, 1], -1), natural);
});

test("dragging a column converts its pixel width back to a weight", () => {
  const containerW = 1000;
  const frRest = 3;
  // Drag one column of a four-column row out to a quarter of the container:
  // its share of the total weight should come back as a quarter.
  const fr = frForWidth(250, frRest, containerW);
  assert.ok(Math.abs(fr / (fr + frRest) - 0.25) < 1e-9);
  // And the round trip lands back on the same pixels.
  assert.deepEqual(resolveWidths([10, 10, 10, 10], [fr, 1, 1, 1], containerW)[0], 250);
});

test("a drag past the container edge stays finite", () => {
  assert.ok(Number.isFinite(frForWidth(5000, 3, 1000)));
  assert.ok(frForWidth(5000, 3, 1000) > 0);
  assert.ok(Number.isFinite(frForWidth(10, 3, 1000)));
});
