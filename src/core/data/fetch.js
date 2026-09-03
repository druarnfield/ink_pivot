"use strict";
var { parsePivotPages } = require("./parse.js");
var CAP_EXCEEDED = "CAP_EXCEEDED";
var CANCELLED = "CANCELLED";
var ENGINE_PAGE_CELLS = 1e4;
async function fetchPivot(model, layout, opts) {
  const o = opts || {};
  const cellCap = o.cellCap || 25e4;
  const isCancelled = o.isCancelled || (() => false);
  const onProgress = o.onProgress || (() => {
  });
  const size = layout.qHyperCube.qSize;
  const total = size.qcx * size.qcy;
  if (total > cellCap) {
    const err = new Error("Cell cap exceeded");
    err.code = CAP_EXCEEDED;
    err.total = total;
    err.cellCap = cellCap;
    throw err;
  }
  const width = Math.max(1, size.qcx);
  if (width > ENGINE_PAGE_CELLS) {
    const err = new Error("Too many columns");
    err.code = CAP_EXCEEDED;
    err.total = total;
    err.cellCap = cellCap;
    throw err;
  }
  const pageH = Math.max(1, Math.floor(ENGINE_PAGE_CELLS / width));
  const pages = [];
  const pageCount = Math.ceil(size.qcy / pageH);
  for (let top = 0; top < size.qcy; top += pageH) {
    if (isCancelled()) {
      const err = new Error("Fetch cancelled");
      err.code = CANCELLED;
      throw err;
    }
    const area = {
      qLeft: 0,
      qTop: top,
      qWidth: width,
      qHeight: Math.min(pageH, size.qcy - top)
    };
    let res;
    try {
      res = await model.getHyperCubePivotData("/qHyperCubeDef", [area]);
    } catch (e) {
      if (isCancelled()) {
        const err = new Error("Fetch cancelled");
        err.code = CANCELLED;
        throw err;
      }
      res = await model.getHyperCubePivotData("/qHyperCubeDef", [area]);
    }
    pages.push(res[0]);
    onProgress(pages.length, pageCount);
  }
  return parsePivotPages(pages);
}
module.exports = { fetchPivot, CAP_EXCEEDED, CANCELLED };
