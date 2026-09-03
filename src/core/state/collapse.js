"use strict";
// Effective collapse state = an explicit per-node override if the user made
// one, otherwise the author's default expand level, evaluated from the node's
// depth every time it is asked.
//
// The previous design seeded a set of collapsed *paths* once per instance
// ("initialised"), which is why the default only held on the very first load:
// paths encode dimension values, so any selection produced a row tree whose
// paths were not in the set and every new group rendered expanded. Deriving
// the default instead means a node nobody has touched always follows the
// author's setting, no matter when it appears.
var ALL_LEVELS = 99;

function normLevel(level) {
  if (typeof level !== "number" || !isFinite(level)) return ALL_LEVELS;
  return Math.max(0, Math.floor(level));
}

var CollapseSet = class {
  // Accepts the {collapsed, expanded, level} shape written by serialize(),
  // or a bare array of paths (state persisted by earlier builds).
  constructor(init) {
    const s = Array.isArray(init) ? { collapsed: init } : init || {};
    this._collapsed = new Set(s.collapsed || []);
    this._expanded = new Set(s.expanded || []);
    this._level = normLevel(s.level);
  }
  // Returns true when the baseline actually moved, i.e. the caller must
  // re-render. Overrides are dropped: they were recorded as deltas against
  // the old baseline, so keeping them would make the new setting look
  // half-applied.
  setDefaultLevel(level) {
    const lvl = normLevel(level);
    if (lvl === this._level) return false;
    this._level = lvl;
    this._collapsed.clear();
    this._expanded.clear();
    return true;
  }
  defaultLevel() {
    return this._level;
  }
  _defaultCollapsed(node) {
    return node.depth >= this._level;
  }
  isCollapsed(node) {
    if (this._expanded.has(node.path)) return false;
    if (this._collapsed.has(node.path)) return true;
    return this._defaultCollapsed(node);
  }
  toggle(node) {
    const want = !this.isCollapsed(node);
    this._collapsed.delete(node.path);
    this._expanded.delete(node.path);
    // Only store a delta. A node toggled back to what the default already
    // says keeps no entry, so the persisted state stays small and keeps
    // tracking later changes to the default level.
    if (want !== this._defaultCollapsed(node)) {
      (want ? this._collapsed : this._expanded).add(node.path);
    }
  }
  serialize() {
    return {
      collapsed: Array.from(this._collapsed),
      expanded: Array.from(this._expanded),
      level: this._level
    };
  }
};
module.exports = { CollapseSet, ALL_LEVELS };
