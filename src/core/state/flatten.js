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
  function emit(nodeList) {
    const totals = [];
    const others = [];
    for (const nd of nodeList) {
      (nd.type === "T" ? totals : others).push(nd);
    }
    const ordered = compact || subtotalPos === "off" ? others : subtotalPos === "top" ? totals.concat(others) : others.concat(totals);
    for (const node of ordered) {
      if (node.type === "T") {
        out.push({ node, kind: "total", leafIndex: node.leafStart, depth: node.depth });
      } else if (node.children.length === 0) {
        out.push({ node, kind: "leaf", leafIndex: node.leafStart, depth: node.depth });
      } else if (collapseSet.isCollapsed(node.path)) {
        out.push({ node, kind: "collapsed", leafIndex: groupValueIndex(node), depth: node.depth });
      } else {
        out.push({
          node,
          kind: "group",
          leafIndex: compact ? groupValueIndex(node) : null,
          depth: node.depth
        });
        emit(node.children);
      }
    }
  }
  emit(nodes);
  return out;
}
function pathsAtOrBelowLevel(nodes, level) {
  const paths = [];
  (function walk(list) {
    for (const nd of list) {
      if (nd.type !== "T" && nd.children.length) {
        if (nd.depth >= level) paths.push(nd.path);
        walk(nd.children);
      }
    }
  })(nodes);
  return paths;
}
module.exports = { flatten, pathsAtOrBelowLevel };
