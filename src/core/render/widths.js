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
  const out = frs.map((f) => Math.max(MIN_COL_PX, Math.floor(normFr(f) / sum * containerW)));
  // Fractional shares round down, so the columns would sit a pixel or two
  // short of the container. Give the remainder to the last column — but only
  // when nothing was clamped up to the minimum, since then the row is already
  // wider than the container and adding more would widen the overflow.
  const used = out.reduce((a, b) => a + b, 0);
  if (used < containerW && out.length) out[out.length - 1] += containerW - used;
  return out;
}
function frForWidth(px, frRest, containerW) {
  const clamped = Math.min(
    Math.max(px, MIN_COL_PX),
    Math.max(MIN_COL_PX, containerW - MIN_COL_PX)
  );
  return normFr(frRest) * clamped / (containerW - clamped);
}
module.exports = { resolveWidths, frForWidth, MIN_COL_PX };
