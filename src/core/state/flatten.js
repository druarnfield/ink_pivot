"use strict";
function findChildTotal(node) {
  return node.children.find((c) => c.type === "T") || null;
}
function groupValueIndex(node) {
  const t = findChildTotal(node);
  if (t) return t.leafStart;
  return node.leafCount === 1 ? node.leafStart : null;
}
function flatten(nodes, collapseSet, opts) {
  const subtotalPos = opts && opts.subtotalPos || "bottom";
  const compact = !!(opts && opts.layout === "compact");
  const out = [];
  // `inGroup` is false only for the root node list. Compact mode folds a
  // group's subtotal into the group row itself, so the engine's 'T' sibling
  // is redundant there — but at the root there is no group row to carry the
  // grand total, and dropping it lost the row entirely.
  function emit(nodeList, inGroup) {
    const totals = [];
    const others = [];
    for (const nd of nodeList) {
      (nd.type === "T" ? totals : others).push(nd);
    }
    const dropTotals = subtotalPos === "off" || compact && inGroup;
    const ordered = dropTotals ? others : subtotalPos === "top" ? totals.concat(others) : others.concat(totals);
    for (const node of ordered) {
      if (node.type === "T") {
        out.push({ node, kind: "total", leafIndex: node.leafStart, depth: node.depth });
      } else if (node.children.length === 0) {
        out.push({ node, kind: "leaf", leafIndex: node.leafStart, depth: node.depth });
      } else if (collapseSet.isCollapsed(node)) {
        out.push({ node, kind: "collapsed", leafIndex: groupValueIndex(node), depth: node.depth });
      } else {
        out.push({
          node,
          kind: "group",
          leafIndex: compact ? groupValueIndex(node) : null,
          depth: node.depth
        });
        emit(node.children, true);
      }
    }
  }
  emit(nodes, false);
  return out;
}
module.exports = { flatten };
