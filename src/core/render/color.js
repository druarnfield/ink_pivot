"use strict";
// One definition of "is this a colour", used for both property-panel values
// and measure attribute expressions.
//
// Full-match only, and the caller sets backgroundColor/color rather than the
// `background` shorthand: attribute expressions are author-controlled strings,
// and the shorthand would accept `#fff url(...)`.
var COLOR_RE = /^(#[0-9a-f]{3,8}|rgba?\([\d\s.,%]+\)|hsla?\([\d\s.,%deg]+\))$/i;

function safeColor(value) {
  if (value == null) return null;
  const s = String(value).trim();
  return s && COLOR_RE.test(s) ? s : null;
}

// The Sense colour picker stores { index, color }: index >= 0 is a theme
// palette swatch, -1 a custom value, and `color` carries the hex either way.
// If a build ever hands us an index with no hex we fall back to the
// stylesheet default rather than guessing at the theme's palette.
function fromPicker(value) {
  if (!value || typeof value !== "object") return null;
  return safeColor(value.color);
}

module.exports = { COLOR_RE, safeColor, fromPicker };
