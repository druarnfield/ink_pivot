"use strict";
// GetHyperCubePivotData responses in the shape the engine returns under
// qMode:'P' + qAlwaysFullyExpanded + qIndentMode with qShowTotal on.
//
// The structure below was corrected against a real capture from a
// client-managed engine (values and labels were never captured — only node
// types, element numbers and nesting). What that capture established:
//
//   - a group's last child is a 'T' node;
//   - at the deepest level the 'T' is itself the subtotal row: no qSubNodes;
//   - a 'T' node carries NO qText at all — the key is absent, not empty, so
//     the renderer's own "Total" label is what reaches the screen;
//   - null dimension values are 'U' nodes with qElemNo -2, sitting among
//     their siblings as ordinary leaves;
//   - qTop measure nodes are 'P' with qElemNo = the measure index;
//   - a null measure serialises as qText "" with qNum the STRING "NaN".
//
// NOT established by that capture: whether this engine emits a root-level
// grand total. The page came back truncated before the last row, and no root
// 'T' or 'E' padding node appeared in what did arrive. grandTotalPage() below
// therefore stays a separate, explicitly unconfirmed fixture.

function n(text, elemNo, subNodes) {
  const c = { qType: "N", qText: text, qElemNo: elemNo };
  if (subNodes) c.qSubNodes = subNodes;
  return c;
}
// No qText: matches the engine, and exercises the renderer's fallback label.
function t(subNodes) {
  const c = { qType: "T", qElemNo: -1 };
  if (subNodes) c.qSubNodes = subNodes;
  return c;
}
const u = { qType: "U", qText: "-", qElemNo: -2 };
const e = { qType: "E", qText: "", qElemNo: -1 };

// Region > City, one measure. Leaf rows, in order:
//   0 a1, 1 a2, 2 Total(A), 3 b1, 4 Total(B)   [+ 5 c1, 6 Total(C)]
function twoDimPage(extraRegion) {
  const left = [
    n("A", 1, [n("a1", 10), n("a2", 11), t()]),
    n("B", 2, [n("b1", 20), t()])
  ];
  if (extraRegion) left.push(n("C", 3, [n("c1", 30), t()]));
  return page(left);
}

// A group whose last child is a null dimension value, plus a null measure.
//   0 a1, 1 (null), 2 Total(A)
function nullValuePage() {
  const p = page([n("A", 1, [n("a1", 10), u, t()])]);
  p.qData[1] = [{ qText: "", qNum: "NaN" }];
  return p;
}

// The root-level grand total as documented for indent mode: a 'T' wrapping a
// single 'E' padding leaf. UNCONFIRMED on the engine captured above — kept so
// the parse/flatten paths for a 'T' with children stay covered either way.
//   0 a1, 1 Total(A), 2 grand total (via its 'E' leaf)
function grandTotalPage() {
  return page([n("A", 1, [n("a1", 10), t()]), t([e])]);
}

function page(left) {
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

module.exports = { twoDimPage, nullValuePage, grandTotalPage, countLeaves };
