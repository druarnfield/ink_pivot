"use strict";
var { flatten } = require("../state/flatten.js");
var { resolveWidths, frForWidth, MIN_COL_PX } = require("./widths.js");
var gridCss = require("./grid.css");
function injectCss(doc) {
  if (doc.getElementById("ink-pivot-css")) return;
  const s = doc.createElement("style");
  s.id = "ink-pivot-css";
  s.textContent = typeof gridCss === "string" ? gridCss : "";
  doc.head.appendChild(s);
}
var COLOR_RE = /^(#[0-9a-f]{3,8}|rgba?\([\d\s.,%]+\)|hsla?\([\d\s.,%deg]+\))$/i;
var STYLE_VARS = [
  "--ip-font-size",
  "--ip-header-bg",
  "--ip-header-text",
  "--ip-total-bg",
  "--ip-total-text",
  "--ip-band-bg"
];
var DEFAULTS = {
  rowHeight: 28,
  subtotalPos: "bottom",
  indentPx: 16,
  nullText: "-",
  dimColWidth: 160,
  measureColWidth: 110,
  rowLayout: "columns",
  // 'columns' | 'compact' (single hierarchy column)
  fillWidth: false,
  // stretch columns to the container by fr weights
  hierarchyFr: 1.5,
  // compact column's weight (labels are long)
  dimFrs: [],
  // per-dimension weights (columns mode)
  measureFrs: [],
  // per-measure weights, indexed by measure elemNo
  frOverrides: {},
  // session drag overrides under fill (key -> fr)
  styles: {}
};
function colLeaves(model) {
  const leaves = [];
  (function walk(nodes, stack) {
    for (const n of nodes) {
      const s = stack.concat([n]);
      if (n.children.length) walk(n.children, s);
      else leaves.push({ node: n, stack: s });
    }
  })(model.colTree, []);
  if (leaves.length === 0) {
    leaves.push({ node: null, stack: [] });
  }
  return leaves;
}
function createPivotGrid(container, cfg) {
  const doc = container.ownerDocument;
  injectCss(doc);
  const state = {
    model: cfg.model,
    collapseSet: cfg.collapseSet,
    options: Object.assign({}, DEFAULTS, cfg.options || {}),
    callbacks: cfg.callbacks || {},
    colWidths: cfg.options && cfg.options.colWidths || {},
    // colKey -> px
    visible: [],
    leaves: []
  };
  const root = doc.createElement("div");
  root.className = "ink-pivot";
  const scroller = doc.createElement("div");
  scroller.className = "ink-pivot__scroller";
  root.appendChild(scroller);
  container.innerHTML = "";
  container.appendChild(root);
  function colKey(i) {
    return "c" + i;
  }
  function isCompact() {
    return state.options.rowLayout === "compact";
  }
  state.computed = { dim: [], col: [], frs: [], keys: [] };
  function frOf(key, fallback) {
    const ov = state.options.frOverrides[key];
    return typeof ov === "number" && isFinite(ov) && ov > 0 ? ov : fallback;
  }
  function computeWidths() {
    const compact = isCompact();
    const dimCount = compact ? 1 : state.model.dimInfoRows;
    const natural = [];
    const frs = [];
    const keys = [];
    for (let d = 0; d < dimCount; d++) {
      const key = compact ? "h" : "d" + d;
      keys.push(key);
      natural.push(state.colWidths[key] || state.options.dimColWidth);
      frs.push(frOf(key, compact ? state.options.hierarchyFr : state.options.dimFrs[d] || 1));
    }
    state.leaves.forEach((leaf, i) => {
      keys.push(colKey(i));
      natural.push(state.colWidths[colKey(i)] || state.options.measureColWidth);
      const p = leaf.stack.find((n) => n.type === "P");
      frs.push(frOf(colKey(i), p && state.options.measureFrs[p.elemNo] || 1));
    });
    const widths = state.options.fillWidth ? resolveWidths(natural, frs, scroller.clientWidth) : natural;
    state.computed = {
      dim: widths.slice(0, dimCount),
      col: widths.slice(dimCount),
      frs,
      keys
    };
  }
  function widthFor(i) {
    return state.computed.col[i];
  }
  function dimWidth(d) {
    return state.computed.dim[d];
  }
  function applyStyles() {
    const s = state.options.styles || {};
    STYLE_VARS.forEach((k) => {
      if (s[k]) root.style.setProperty(k, s[k]);
      else root.style.removeProperty(k);
    });
    root.style.setProperty("--ip-row-height", state.options.rowHeight + "px");
    root.style.setProperty("--ip-indent", state.options.indentPx + "px");
  }
  function startResize(e, key, cellEl) {
    e.preventDefault();
    const startX = e.clientX;
    const startW = cellEl.offsetWidth;
    const fill = state.options.fillWidth;
    const containerW = scroller.clientWidth;
    let frRest = 0;
    if (fill) {
      state.computed.frs.forEach((f, i) => {
        if (state.computed.keys[i] !== key) frRest += f;
      });
    }
    function move(ev) {
      const w = Math.max(MIN_COL_PX, startW + (ev.clientX - startX));
      if (fill) state.options.frOverrides[key] = frForWidth(w, frRest, containerW);
      else state.colWidths[key] = w;
      fullRender();
    }
    function up() {
      doc.removeEventListener("mousemove", move);
      doc.removeEventListener("mouseup", up);
      state.callbacks.onColumnResize && state.callbacks.onColumnResize(
        key,
        fill ? null : state.colWidths[key],
        fill ? state.options.frOverrides[key] : null
      );
    }
    doc.addEventListener("mousemove", move);
    doc.addEventListener("mouseup", up);
  }
  function addResizer(cellEl, key) {
    const rz = doc.createElement("div");
    rz.className = "ink-pivot__resizer";
    rz.addEventListener("mousedown", (e) => startResize(e, key, cellEl));
    if (!cellEl.classList.contains("ink-pivot__cell--dim")) {
      cellEl.style.position = "relative";
    }
    cellEl.appendChild(rz);
  }
  function buildHeader() {
    const header = doc.createElement("div");
    header.className = "ink-pivot__header";
    const depth = Math.max(1, state.model.dimInfoCols);
    for (let lvl = 0; lvl < depth; lvl++) {
      const row = doc.createElement("div");
      row.className = "ink-pivot__row";
      const titles = state.options.dimTitles || [];
      let left = 0;
      for (let d = 0; d < state.computed.dim.length; d++) {
        const c = doc.createElement("div");
        c.className = "ink-pivot__cell ink-pivot__cell--dim";
        c.style.width = dimWidth(d) + "px";
        c.style.left = left + "px";
        c.textContent = lvl === depth - 1 ? isCompact() ? titles.join(" / ") : titles[d] || "" : "";
        if (lvl === depth - 1) addResizer(c, isCompact() ? "h" : "d" + d);
        row.appendChild(c);
        left += dimWidth(d);
      }
      state.leaves.forEach((leaf, i) => {
        const c = doc.createElement("div");
        c.className = "ink-pivot__cell";
        c.style.width = widthFor(i) + "px";
        const nodeAtLvl = leaf.stack[lvl];
        const prev = i > 0 ? state.leaves[i - 1].stack[lvl] : null;
        c.textContent = nodeAtLvl && nodeAtLvl !== prev ? nodeAtLvl.text : "";
        if (lvl === depth - 1) addResizer(c, colKey(i));
        row.appendChild(c);
      });
      header.appendChild(row);
    }
    return header;
  }
  function cellText(cell) {
    if (!cell) return "";
    if (cell.num !== null) return cell.text;
    return cell.text === "" || cell.text === "-" ? state.options.nullText : cell.text;
  }
  function buildRow(vr, idx) {
    const row = doc.createElement("div");
    row.className = "ink-pivot__row" + (vr.kind === "total" ? " ink-pivot__row--total" : "") + (vr.band ? " ink-pivot__row--band" : "");
    row.style.top = idx * state.options.rowHeight + "px";
    const labelCol = isCompact() ? 0 : vr.depth;
    let left = 0;
    for (let d = 0; d < state.computed.dim.length; d++) {
      const c = doc.createElement("div");
      c.className = "ink-pivot__cell ink-pivot__cell--dim";
      c.style.width = dimWidth(d) + "px";
      c.style.left = left + "px";
      left += dimWidth(d);
      if (d === labelCol) {
        const pad = doc.createElement("span");
        pad.style.paddingLeft = vr.depth * state.options.indentPx + "px";
        if (vr.kind === "group" || vr.kind === "collapsed") {
          const ch = doc.createElement("span");
          ch.className = "ink-pivot__chevron";
          ch.textContent = vr.kind === "collapsed" ? "\u25B8" : "\u25BE";
          ch.addEventListener("click", (e) => {
            e.stopPropagation();
            state.callbacks.onToggle && state.callbacks.onToggle(vr.node);
          });
          pad.appendChild(ch);
        }
        pad.appendChild(doc.createTextNode(
          vr.kind === "total" ? vr.node.text || "Total" : vr.node.text
        ));
        c.appendChild(pad);
        if (vr.node.type === "N") {
          c.addEventListener("click", () => {
            state.callbacks.onSelectCell && state.callbacks.onSelectCell({
              node: vr.node,
              rowLeafIndex: vr.node.leafStart,
              dimIndex: vr.depth
            });
          });
        }
      }
      row.appendChild(c);
    }
    state.leaves.forEach((leaf, i) => {
      const c = doc.createElement("div");
      c.className = "ink-pivot__cell ink-pivot__cell--num";
      c.style.width = widthFor(i) + "px";
      const dataRow = vr.leafIndex === null ? null : state.model.cells[vr.leafIndex];
      const cell = dataRow ? dataRow[leaf.node ? leaf.node.leafStart : 0] : null;
      c.textContent = cellText(cell);
      if (cell && cell.attrs) {
        const bg = cell.attrs[0] && cell.attrs[0].qText;
        const fg = cell.attrs[1] && cell.attrs[1].qText;
        if (bg && COLOR_RE.test(bg.trim())) c.style.backgroundColor = bg.trim();
        if (fg && COLOR_RE.test(fg.trim())) c.style.color = fg.trim();
      }
      row.appendChild(c);
    });
    return row;
  }
  const els = { header: null, spacer: null };
  let exportBtn = null;
  function fullRender() {
    applyStyles();
    state.visible = flatten(state.model.rowTree, state.collapseSet, {
      subtotalPos: state.options.subtotalPos,
      layout: state.options.rowLayout
    });
    let leafN = 0;
    for (const vr of state.visible) {
      vr.band = vr.kind === "leaf" && leafN++ % 2 === 1;
    }
    state.leaves = colLeaves(state.model);
    computeWidths();
    scroller.innerHTML = "";
    els.header = buildHeader();
    scroller.appendChild(els.header);
    if (state.callbacks.onExport && !exportBtn) {
      exportBtn = doc.createElement("button");
      exportBtn.className = "ink-pivot__export";
      exportBtn.textContent = "\u2913";
      exportBtn.title = "Export to Excel";
      exportBtn.addEventListener("click", () => state.callbacks.onExport());
      root.appendChild(exportBtn);
    }
    els.spacer = doc.createElement("div");
    els.spacer.className = "ink-pivot__spacer";
    els.spacer.style.height = state.visible.length * state.options.rowHeight + "px";
    scroller.appendChild(els.spacer);
    renderWindow();
  }
  const OVERSCAN = 10;
  let rafPending = false;
  function renderWindow() {
    if (!els.spacer) return;
    const rh = state.options.rowHeight;
    const viewH = scroller.clientHeight || 600;
    // Rows are absolute inside the spacer, which sits below the header in
    // normal flow — scrollTop is in scroller coordinates, so the header's
    // height has to come off before it maps to a row index. Overscan was
    // hiding this while the header was one row tall; two column-dimension
    // levels pushed the window off by more than the overscan.
    const first = Math.max(0, Math.floor((scroller.scrollTop - els.spacer.offsetTop) / rh) - OVERSCAN);
    const count = Math.ceil(viewH / rh) + OVERSCAN * 2;
    const last = Math.min(state.visible.length, first + count);
    els.spacer.innerHTML = "";
    for (let i = first; i < last; i++) {
      els.spacer.appendChild(buildRow(state.visible[i], i));
    }
  }
  scroller.addEventListener("scroll", () => {
    if (rafPending) return;
    rafPending = true;
    requestAnimationFrame(() => {
      rafPending = false;
      renderWindow();
    });
  });
  fullRender();
  return {
    update(next) {
      if (next.model) state.model = next.model;
      if (next.collapseSet) state.collapseSet = next.collapseSet;
      if (next.options) Object.assign(state.options, next.options);
      fullRender();
    },
    getScroll() {
      return { top: scroller.scrollTop, left: scroller.scrollLeft };
    },
    setScroll(s) {
      scroller.scrollTop = s.top;
      scroller.scrollLeft = s.left;
    },
    destroy() {
      container.innerHTML = "";
    }
  };
}
module.exports = { createPivotGrid, DEFAULTS };
