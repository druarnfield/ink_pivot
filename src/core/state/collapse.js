"use strict";
var CollapseSet = class {
  constructor(paths) {
    this._set = new Set(paths || []);
  }
  isCollapsed(path) {
    return this._set.has(path);
  }
  toggle(path) {
    if (this._set.has(path)) this._set.delete(path);
    else this._set.add(path);
  }
  collapseAll(paths) {
    paths.forEach((p) => this._set.add(p));
  }
  expandAll() {
    this._set.clear();
  }
  serialize() {
    return Array.from(this._set);
  }
};
module.exports = { CollapseSet };
