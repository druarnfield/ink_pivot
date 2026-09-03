"use strict";
var MIN_COL_PX = 48;
function normFr(f) {
  return typeof f === "number" && isFinite(f) && f > 0 ? f : 1;
}
function resolveWidths(naturalPx, frs, containerW) {
  const total = naturalPx.reduce((a, b) => a + b, 0);
  if (!containerW || containerW <= 0 || total >= containerW) {
    return naturalPx.slice();
  }
  const sum = frs.reduce((a, f) => a + normFr(f), 0);
  return frs.map((f) => Math.max(MIN_COL_PX, normFr(f) / sum * containerW));
}
function frForWidth(px, frRest, containerW) {
  const clamped = Math.min(
    Math.max(px, MIN_COL_PX),
    Math.max(MIN_COL_PX, containerW - MIN_COL_PX)
  );
  return normFr(frRest) * clamped / (containerW - clamped);
}
module.exports = { resolveWidths, frForWidth, MIN_COL_PX };
