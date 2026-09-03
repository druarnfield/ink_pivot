"use strict";
var { flatten } = require("../core/state/flatten.js");
function getExcelJS() {
  return require("exceljs");
}
function buildAoa(model, collapseSet, options) {
  const visible = flatten(model.rowTree, collapseSet, {
    subtotalPos: options.subtotalPos,
    // Without this the export flattens under "columns" rules while the screen
    // is in compact mode: group rows lose their inline subtotal and come out
    // blank.
    layout: options.rowLayout
  });
  const leaves = [];
  (function walk(nodes, stack) {
    for (const n of nodes) {
      const s = stack.concat([n]);
      if (n.children.length) walk(n.children, s);
      else leaves.push({ node: n, stack: s });
    }
  })(model.colTree, []);
  if (leaves.length === 0) leaves.push({ node: null, stack: [] });
  const dimCols = model.dimInfoRows;
  const headerDepth = Math.max(1, model.dimInfoCols);
  const aoa = [];
  for (let lvl = 0; lvl < headerDepth; lvl++) {
    const row = [];
    for (let d = 0; d < dimCols; d++) {
      row.push(lvl === headerDepth - 1 && options.dimTitles && options.dimTitles[d] || "");
    }
    leaves.forEach(function(leaf, i) {
      const nodeAtLvl = leaf.stack[lvl];
      const prev = i > 0 ? leaves[i - 1].stack[lvl] : null;
      row.push(nodeAtLvl && nodeAtLvl !== prev ? nodeAtLvl.text : "");
    });
    aoa.push(row);
  }
  for (const vr of visible) {
    const row = new Array(dimCols).fill("");
    row[Math.min(vr.depth, dimCols - 1)] = vr.kind === "total" ? vr.node.text || "Total" : vr.node.text;
    for (const leaf of leaves) {
      let v = "";
      const dataRow = vr.leafIndex === null ? null : model.cells[vr.leafIndex];
      const cell = dataRow ? dataRow[leaf.node ? leaf.node.leafStart : 0] : null;
      if (cell) v = cell.num !== null ? cell.num : cell.text;
      row.push(v);
    }
    aoa.push(row);
  }
  return { aoa, headerDepth, dimCols, visible, leaves };
}
function buildWorkbook(model, collapseSet, options) {
  const built = buildAoa(model, collapseSet, options);
  const wb = new (getExcelJS()).Workbook();
  const ws = wb.addWorksheet("Pivot");
  built.aoa.forEach(function(r) {
    ws.addRow(r);
  });
  for (let r = 1; r <= built.headerDepth; r++) {
    ws.getRow(r).eachCell({ includeEmpty: true }, function(c) {
      c.font = { bold: true, color: { argb: "FF374151" } };
      c.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFF8F9FA" } };
    });
  }
  built.visible.forEach(function(vr, idx) {
    if (vr.kind === "total" || vr.kind === "collapsed") {
      ws.getRow(built.headerDepth + idx + 1).eachCell({ includeEmpty: true }, function(c) {
        c.font = { bold: true };
      });
    }
  });
  ws.columns.forEach(function(col, i) {
    col.width = i < built.dimCols ? 24 : 14;
  });
  if (options.numFormats && options.numFormats.length) {
    built.leaves.forEach(function(leaf, i) {
      const p = leaf.stack.find(function(n) {
        return n.type === "P";
      });
      const fmt = options.numFormats[p ? p.elemNo : 0];
      if (fmt && /[#0%]/.test(fmt)) {
        ws.getColumn(built.dimCols + i + 1).numFmt = fmt;
      }
    });
  }
  return { wb, ws, built };
}
async function exportPivotXlsx(model, collapseSet, options) {
  const built = buildWorkbook(model, collapseSet, options);
  const name = (options.exportPrefix || "pivot") + "-" + (/* @__PURE__ */ new Date()).toISOString().slice(0, 10) + ".xlsx";
  const buf = await built.wb.xlsx.writeBuffer();
  const blob = new Blob([buf], {
    type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
  });
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = name;
  a.click();
  URL.revokeObjectURL(a.href);
}
module.exports = { exportPivotXlsx, buildAoa, buildWorkbook };
