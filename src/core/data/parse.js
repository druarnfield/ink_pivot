"use strict";
function toNode(cell, depth, parentPath) {
  const key = cell.qType === "T" ? depth + ":__total__" : depth + ":" + cell.qElemNo + ":" + cell.qText;
  const path = parentPath ? parentPath + "|" + key : key;
  return {
    text: cell.qText || "",
    elemNo: typeof cell.qElemNo === "number" ? cell.qElemNo : -1,
    type: cell.qType || "N",
    depth,
    path,
    children: (cell.qSubNodes || []).map((c) => toNode(c, depth + 1, path)),
    leafStart: 0,
    leafCount: 0
  };
}
function mergeTrees(acc, next) {
  if (acc.length === 0) return next;
  if (next.length === 0) return acc;
  const last = acc[acc.length - 1];
  const first = next[0];
  const same = last.type === first.type && last.text === first.text && last.elemNo === first.elemNo;
  if (same && last.children.length && first.children.length) {
    last.children = mergeTrees(last.children, first.children);
    return acc.concat(next.slice(1));
  }
  return acc.concat(next);
}
function assignSpans(nodes, start) {
  let cursor = start;
  for (const n of nodes) {
    n.leafStart = cursor;
    if (n.children.length) {
      cursor = assignSpans(n.children, cursor);
      n.leafCount = cursor - n.leafStart;
    } else {
      n.leafCount = 1;
      cursor += 1;
    }
  }
  return cursor;
}
function maxDepth(nodes, d) {
  let m = d;
  for (const n of nodes) {
    if (n.children.length) m = Math.max(m, maxDepth(n.children, d + 1));
  }
  return m;
}
function parsePivotPages(pages) {
  let rowTree = [];
  const cells = [];
  const colTree = (pages[0].qTop || []).map((c) => toNode(c, 0, ""));
  for (const page of pages) {
    rowTree = mergeTrees(rowTree, (page.qLeft || []).map((c) => toNode(c, 0, "")));
    for (const row of page.qData) {
      cells.push(row.map((c) => ({
        text: c.qText === void 0 ? "" : c.qText,
        num: typeof c.qNum === "number" && isFinite(c.qNum) ? c.qNum : null,
        attrs: c.qAttrExps ? c.qAttrExps.qValues : null
      })));
    }
  }
  const rowLeafCount = assignSpans(rowTree, 0);
  const colLeafCount = colTree.length ? assignSpans(colTree, 0) : 0;
  return {
    rowTree,
    colTree,
    rowLeafCount,
    colLeafCount,
    cells,
    dimInfoRows: maxDepth(rowTree, 1),
    dimInfoCols: maxDepth(colTree, colTree.length ? 1 : 0)
  };
}
module.exports = { parsePivotPages };
