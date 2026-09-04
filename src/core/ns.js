"use strict";
// DOM class prefix and CSS namespace, injected at build time from the
// extension id (see build.mjs `define`).
//
// Sense injects one <style> per extension into the shared document head and it
// survives sheet navigation. With a fixed id and fixed class names, a dev build
// and the published extension collide twice over: whichever renders first wins
// the <style id> check so the other never injects its CSS at all, and both
// stylesheets target the same `.ink-pivot*` selectors. Namespacing both keeps
// the two installable side by side.
//
// Falls back to the plain prefix outside the bundle (tests), where the define
// is absent.
var NS = typeof __INK_NS__ !== "undefined" ? __INK_NS__ : "ink-pivot";
function cls(suffix) {
  return NS + (suffix || "");
}
module.exports = { NS, cls };
