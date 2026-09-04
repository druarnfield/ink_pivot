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
  // Compact used to drop every 'T' row unconditionally and fold each group's
  // subtotal into the group row instead. That left the Subtotals control dead
  // in compact mode — no setting produced a total row — which reads as
  // "totals don't work at all". Compact now honours Subtotals exactly like
  // columns mode, and keeps the fold for the one case where it earns its
  // place: Subtotals off, where the numbers would otherwise be lost.
  const foldInline = compact && subtotalPos === "off";
  function emit(nodeList) {
    const totals = [];
    const others = [];
    for (const nd of nodeList) {
      (nd.type === "T" ? totals : others).push(nd);
    }
    const ordered = subtotalPos === "off" ? others : subtotalPos === "top" ? totals.concat(others) : others.concat(totals);
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
          leafIndex: foldInline ? groupValueIndex(node) : null,
          depth: node.depth
        });
        emit(node.children);
      }
    }
  }
  emit(nodes);
  return out;
}
module.exports = { flatten };
