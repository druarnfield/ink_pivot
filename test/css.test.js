"use strict";
const assert = require("node:assert/strict");
const test = require("node:test");
const fs = require("node:fs");
const path = require("node:path");

const css = fs.readFileSync(
  path.join(__dirname, "../src/core/render/grid.css"),
  "utf8"
);

// selector -> declaration block, comments stripped.
function rules(source) {
  const out = [];
  const text = source.replace(/\/\*[\s\S]*?\*\//g, "");
  const re = /([^{}]+)\{([^{}]*)\}/g;
  let m;
  while ((m = re.exec(text))) out.push({ selector: m[1].trim(), body: m[2] });
  return out;
}
const RULES = rules(css);

// Every cell sets its own `color`, and a declaration beats an inherited value
// no matter how specific the ancestor rule is. So a text colour declared only
// on .ink-pivot__row--total or .ink-pivot__header reaches nothing — which is
// exactly how --ip-header-text stopped applying to measure header cells while
// still working on dimension cells, and how --ip-total-text applied nowhere.
test("text colour variables are declared on cell-level selectors", () => {
  for (const v of ["--ip-header-text", "--ip-total-text"]) {
    const onCells = RULES.filter(
      (r) => r.body.indexOf("color: var(" + v + ")") > -1 && /__cell/.test(r.selector)
    );
    assert.ok(
      onCells.length > 0,
      v + " is set on no cell selector, so it cannot beat .ink-pivot__cell's own color"
    );
  }
});

test("every themable variable has a default on the root class", () => {
  const root = RULES.find((r) => r.selector === ".ink-pivot");
  assert.ok(root, "the root class rule is where the palette lives");
  const used = new Set((css.match(/var\((--ip-[a-z-]+)/g) || []).map((s) => s.slice(4)));
  for (const v of used) {
    assert.ok(
      root.body.indexOf(v + ":") > -1,
      v + " is used but never defaulted, so a theme has nothing to override"
    );
  }
});

test("every class in the stylesheet carries the namespace prefix", () => {
  // injectCss() namespaces the sheet by rewriting the '.ink-pivot' prefix, so
  // a class that does not start with it would leak between a dev build and the
  // published extension.
  const classes = new Set((css.match(/\.[a-zA-Z][\w-]*/g) || []));
  for (const c of classes) {
    assert.ok(c.indexOf(".ink-pivot") === 0, c + " would not be namespaced");
  }
});
