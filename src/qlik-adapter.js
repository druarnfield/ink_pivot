module.exports = function() {
  const { initialProperties, definition } = require("./properties.js");
  const { fetchPivot, CAP_EXCEEDED, CANCELLED } = require("./core/data/fetch.js");
  const { CollapseSet } = require("./core/state/collapse.js");
  const { createPivotGrid } = require("./core/render/grid.js");
  const { exportPivotXlsx } = require("./export/xlsx-export.js");
  function esc(s) {
    return String(s == null ? "" : s).replace(/[&<>"']/g, function(ch) {
      return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[ch];
    });
  }
  function stateEl(msg, sub) {
    return '<div class="ink-pivot"><div class="ink-pivot__state"><b>' + esc(msg) + "</b>" + (sub ? "<span>" + esc(sub) + "</span>" : "") + "</div></div>";
  }
  function dataHash(layout) {
    const hc = layout.qHyperCube;
    return JSON.stringify([
      hc.qSize,
      hc.qStateName || "$",
      hc.qNoOfLeftDims,
      hc.qEffectiveInterColumnSortOrder,
      hc.qDimensionInfo.map((d) => [d.qFallbackTitle, d.qStateCounts, d.qSortIndicator, d.qShowTotal]),
      hc.qMeasureInfo.map((m) => [m.qFallbackTitle, m.qNumFormat && m.qNumFormat.qFmt]),
      // The 1x1 qInitialDataFetch page: structural fields alone miss
      // value-only changes (a selection in a field outside the pivot changes
      // every number but no dim state), which silently froze stale data.
      hc.qPivotDataPages
      // subtotalPos deliberately excluded: display-only, no refetch needed.
    ]);
  }
  function persistedState(layout) {
    const p = layout.inkPivot || {};
    // Honour the switch on read as well as on write, so turning "remember"
    // off actually starts from a clean slate instead of resurrecting state
    // saved while it was on.
    if (p.rememberCollapse === false) return {};
    return layout.inkPivotState && typeof layout.inkPivotState === "object" ? layout.inkPivotState : {};
  }
  function ensureInstance(self2, layout) {
    if (!self2._ink) {
      const saved = persistedState(layout);
      self2._ink = {
        grid: null,
        model: null,
        hash: null,
        fetchGen: 0,
        // `collapse` is the current {collapsed, expanded, level} shape;
        // `collapsedPaths` is the bare array written by earlier builds.
        collapseSet: new CollapseSet(saved.collapse || saved.collapsedPaths || []),
        colWidths: Object.assign({}, saved.colWidths || {}),
        frOverrides: Object.assign({}, saved.frOverrides || {}),
        persistTimer: null
      };
    }
    return self2._ink;
  }
  function persistState(self2, ink) {
    if (!(ink.layout && ink.layout.inkPivot || {}).rememberCollapse) return;
    clearTimeout(ink.persistTimer);
    ink.persistTimer = setTimeout(function() {
      // 'add' rather than 'replace': objects created before inkPivotState
      // existed have no such path, and the engine rejects a replace on a
      // path that is not there. 'add' overwrites when it is.
      self2.backendApi.applyPatches([{
        qOp: "add",
        qPath: "/inkPivotState",
        qValue: JSON.stringify({
          collapse: ink.collapseSet.serialize(),
          colWidths: ink.colWidths,
          frOverrides: ink.frOverrides
        })
      }], true).catch(function(e) {
        console.warn("[InkPivot] persist failed", e);
      });
    }, 800);
  }
  // Everything the engine needs before it will emit subtotal ('T') rows, kept
  // as session soft patches so consumers of a published app get them too.
  //
  //  - qIndentMode: under qAlwaysFullyExpanded the engine emits NO 'T' rows in
  //    default pivot mode, whatever qShowTotal says. Indent mode is what makes
  //    them materialise. We render our own layout, so the indent presentation
  //    never reaches the screen.
  //  - qShowTotal: still the per-dimension subtotal switch. The property
  //    panel's `defaultValue: true` is display-only — it never writes the
  //    property — so a freshly added dimension falls back to the engine
  //    default of false and produces no subtotals at all. Seed it only when
  //    the key is absent, so a user who switched it off stays switched off.
  //
  // Re-runs when the dimension count changes, since dimensions are added long
  // after the first paint.
  function migrateHyperCubeDef(self2, ink, hc) {
    const nDims = hc.qDimensionInfo.length;
    if (ink.migratedFor === nDims) return;
    ink.migratedFor = nDims;
    const model = self2.backendApi.model;
    Promise.resolve().then(function() {
      return model.getEffectiveProperties ? model.getEffectiveProperties() : model.getProperties();
    }).then(function(props) {
      const def = props && props.qHyperCubeDef;
      if (!def) return;
      // 'add' rather than 'replace': legacy objects predate these keys, and
      // the engine rejects a replace on a path that does not exist.
      const patches = [];
      if (!def.qIndentMode) {
        patches.push({ qOp: "add", qPath: "/qHyperCubeDef/qIndentMode", qValue: "true" });
      }
      if (!def.qAlwaysFullyExpanded) {
        patches.push({ qOp: "add", qPath: "/qHyperCubeDef/qAlwaysFullyExpanded", qValue: "true" });
      }
      (def.qDimensions || []).forEach(function(d, i) {
        if (d && d.qShowTotal === void 0) {
          patches.push({
            qOp: "add",
            qPath: "/qHyperCubeDef/qDimensions/" + i + "/qShowTotal",
            qValue: "true"
          });
        }
      });
      if (patches.length) return model.applyPatches(patches, true);
    }).catch(function(e) {
      ink.migratedFor = -1;
      console.warn("[InkPivot] hypercube migration skipped", e);
    });
  }
  const LEGACY_AUTO = {
    headerBg: "#f8f9fa",
    headerText: "#374151",
    totalBg: "#f5f5f5",
    totalText: "#111111"
  };
  function userColor(p, key) {
    const v = p[key];
    return v && v !== LEGACY_AUTO[key] ? v : null;
  }
  function optionsFromLayout(layout, ink) {
    const p = layout.inkPivot || {};
    const hc = layout.qHyperCube;
    const styles = {};
    if (p.fontSize && p.fontSize !== 13) styles["--ip-font-size"] = p.fontSize + "px";
    if (userColor(p, "headerBg")) styles["--ip-header-bg"] = p.headerBg;
    if (userColor(p, "headerText")) styles["--ip-header-text"] = p.headerText;
    if (userColor(p, "totalBg")) styles["--ip-total-bg"] = p.totalBg;
    if (userColor(p, "totalText")) styles["--ip-total-text"] = p.totalText;
    if (p.banding === false) styles["--ip-band-bg"] = "transparent";
    const nLeft = hc.qNoOfLeftDims === -1 || hc.qNoOfLeftDims === void 0 ? hc.qDimensionInfo.length : hc.qNoOfLeftDims;
    return {
      rowHeight: p.rowHeight || 28,
      subtotalPos: p.subtotalPos || "bottom",
      indentPx: typeof p.indentPx === "number" ? p.indentPx : 16,
      nullText: typeof p.nullText === "string" ? p.nullText : "-",
      colWidths: ink.colWidths,
      rowLayout: p.rowLayout || "columns",
      fillWidth: !!p.fillWidth,
      hierarchyFr: p.hierarchyFr || 1.5,
      // Unknown qDef.* members echo into qDimensionInfo/qMeasureInfo at the
      // info root (the mechanism cId uses) — hence `d.inkFr`, not
      // `d.qDef.inkFr`. Root-level custom def props do NOT surface, which is
      // why the panel refs are 'qDef.inkFr'. qShowTotal is engine-defined and
      // surfaces on its own; do not generalise from it.
      dimFrs: hc.qDimensionInfo.slice(0, nLeft).map(function(d) {
        return d.inkFr || 1;
      }),
      measureFrs: hc.qMeasureInfo.map(function(m) {
        return m.inkFr || 1;
      }),
      frOverrides: ink.frOverrides,
      dimTitles: hc.qDimensionInfo.slice(0, nLeft).map(function(d) {
        return d.qFallbackTitle;
      }),
      styles
    };
  }
  function renderGrid(self2, $element, ink) {
    const container = $element[0];
    const scroll = ink.grid ? ink.grid.getScroll() : ink.lastScroll || null;
    ink.lastScroll = null;
    const options = optionsFromLayout(ink.layout, ink);
    if (!ink.grid || !container.querySelector(".ink-pivot")) {
      ink.grid = createPivotGrid(container, {
        model: ink.model,
        collapseSet: ink.collapseSet,
        options,
        callbacks: {
          onToggle: function(node) {
            ink.collapseSet.toggle(node);
            ink.grid.update({});
            persistState(self2, ink);
          },
          onSelectCell: function(cell) {
            if (!cell.node || cell.node.elemNo < 0) return;
            self2.backendApi.selectValues(cell.dimIndex, [cell.node.elemNo], true);
          },
          onColumnResize: function(key, px, fr) {
            if (px) ink.colWidths[key] = px;
            if (fr) ink.frOverrides[key] = fr;
            persistState(self2, ink);
          },
          onExport: function() {
            const p = ink.layout && ink.layout.inkPivot || {};
            exportPivotXlsx(ink.model, ink.collapseSet, {
              subtotalPos: p.subtotalPos || "bottom",
              rowLayout: p.rowLayout || "columns",
              exportPrefix: p.exportPrefix || "pivot",
              dimTitles: optionsFromLayout(ink.layout, ink).dimTitles,
              numFormats: ink.layout.qHyperCube.qMeasureInfo.map(function(m) {
                return m.qNumFormat && m.qNumFormat.qFmt;
              })
            }).catch(function(e) {
              console.error("[InkPivot] export failed", e);
            });
          }
        }
      });
    } else {
      ink.grid.update({
        model: ink.model,
        collapseSet: ink.collapseSet,
        options
      });
    }
    if (scroll) ink.grid.setScroll(scroll);
  }
  return {
    initialProperties,
    definition,
    // snapshot:false also excludes InkPivot from stories and sheet-to-PDF
    // via the printing service — a deliberate v1 limitation (README + v2 list).
    support: { snapshot: false, export: false, exportData: false },
    resize: function($element, layout) {
      return this.paint($element, layout);
    },
    beforeDestroy: function() {
      try {
        if (typeof window !== "undefined" && window.__inkPivot && this._inkObjectId) {
          delete window.__inkPivot[this._inkObjectId];
        }
      } catch (e) {
      }
      if (this._ink) {
        clearTimeout(this._ink.persistTimer);
        this._ink.fetchGen += 1;
        if (this._ink.grid) this._ink.grid.destroy();
        this._ink = null;
      }
    },
    paint: function($element, layout) {
      const self2 = this;
      const hc = layout.qHyperCube;
      try {
        if (typeof window !== "undefined" && layout.qInfo) {
          (window.__inkPivot = window.__inkPivot || {})[layout.qInfo.qId] = {
            model: self2.backendApi.model,
            title: layout.title || ""
          };
          self2._inkObjectId = layout.qInfo.qId;
        }
      } catch (e) {
      }
      if (!hc || !hc.qDimensionInfo || hc.qDimensionInfo.length === 0 || !hc.qMeasureInfo || hc.qMeasureInfo.length === 0) {
        $element.html(stateEl("Add at least one dimension and one measure"));
        return Promise.resolve();
      }
      if (hc.qCalcCondMsg) {
        $element.html(stateEl("Calculation condition not fulfilled", hc.qCalcCondMsg));
        return Promise.resolve();
      }
      if (hc.qSize.qcy === 0) {
        $element.html(stateEl("No data to display"));
        return Promise.resolve();
      }
      const ink = ensureInstance(self2, layout);
      migrateHyperCubeDef(self2, ink, hc);
      ink.layout = layout;
      // Re-derive the baseline on every paint so a change to "Initial expand
      // level" in the property panel takes effect immediately, instead of
      // only on the next fresh mount.
      ink.collapseSet.setDefaultLevel(
        layout.inkPivot && layout.inkPivot.initialExpandLevel
      );
      const hash = dataHash(layout);
      if (hash === ink.hash && ink.model) {
        renderGrid(self2, $element, ink);
        return Promise.resolve();
      }
      if (ink.grid) ink.lastScroll = ink.grid.getScroll();
      const gen = ++ink.fetchGen;
      $element.html(stateEl("Loading pivot\u2026", ""));
      const sub = $element.find(".ink-pivot__state span");
      return fetchPivot(self2.backendApi.model, layout, {
        cellCap: layout.inkPivot && layout.inkPivot.cellCap || 25e4,
        isCancelled: function() {
          return gen !== ink.fetchGen;
        },
        onProgress: function(done, total) {
          sub.text("Fetching " + done + " / " + total + " pages");
        }
      }).then(function(model) {
        if (gen !== ink.fetchGen) return;
        ink.model = model;
        model.dimInfoRows = hc.qNoOfLeftDims === -1 || hc.qNoOfLeftDims === void 0 ? hc.qDimensionInfo.length : hc.qNoOfLeftDims;
        ink.hash = hash;
        ink.grid = null;
        renderGrid(self2, $element, ink);
      }).catch(function(err) {
        if (err && err.code === CANCELLED) return;
        if (gen !== ink.fetchGen) return;
        if (err && err.code === CAP_EXCEEDED) {
          $element.html(stateEl(
            "Too much data (" + err.total.toLocaleString() + " cells)",
            "Cap is " + err.cellCap.toLocaleString() + ". Filter your data, or raise the cap in Pivot options."
          ));
        } else {
          console.error("[InkPivot] fetch failed", err);
          $element.html(stateEl("Could not load data", "See console for details."));
        }
      });
    }
  };
}();
