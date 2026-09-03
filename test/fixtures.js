"use strict";
// A GetHyperCubePivotData response in the shape the engine actually returns
// under qMode:'P' + qAlwaysFullyExpanded + qIndentMode with qShowTotal on:
//
//   - every group's last child is a 'T' node;
//   - at the deepest level the 'T' IS the subtotal row;
//   - above that a 'T' wraps exactly one 'E' padding leaf that carries the row,
//     so a 'T' subtree always spans exactly one data row.
//
// Hand-written from the documented shape, not captured live: if a real capture
// ever disagrees, the capture wins and these tests get rebuilt from it.

function n(text, elemNo, subNodes) {
  const c = { qType: "N", qText: text, qElemNo: elemNo };
  if (subNodes) c.qSubNodes = subNodes;
  return c;
}
function t(subNodes) {
  const c = { qType: "T", qText: "Totals", qElemNo: -1 };
  if (subNodes) c.qSubNodes = subNodes;
  return c;
}
const e = { qType: "E", qText: "", qElemNo: -1 };

// Region > City, one measure. Leaf rows, in order:
//   0 a1, 1 a2, 2 Total(A), 3 b1, 4 Total(B), 5 Total(grand)
function twoDimPage(extraRegion) {
  const left = [
    n("A", 1, [n("a1", 10), n("a2", 11), t()]),
    n("B", 2, [n("b1", 20), t()])
  ];
  if (extraRegion) left.push(n("C", 3, [n("c1", 30), t()]));
  left.push(t([e]));
  const rows = countLeaves(left);
  return {
    qLeft: left,
    qTop: [],
    qData: range(rows).map(function (i) {
      return [{ qText: String(i * 10), qNum: i * 10 }];
    })
  };
}

function countLeaves(nodes) {
  return nodes.reduce(function (acc, node) {
    return acc + (node.qSubNodes && node.qSubNodes.length ? countLeaves(node.qSubNodes) : 1);
  }, 0);
}
function range(k) {
  const out = [];
  for (let i = 0; i < k; i++) out.push(i);
  return out;
}

module.exports = { twoDimPage, countLeaves };
