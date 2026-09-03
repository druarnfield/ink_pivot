module.exports = function() {
  const { initialProperties, definition } = require("./properties.js");
  const { fetchPivot, CAP_EXCEEDED, CANCELLED } = require("./core/data/fetch.js");
  const { CollapseSet } = require("./core/state/collapse.js");
  const { pathsAtOrBelowLevel } = require("./core/state/flatten.js");
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
  function ensureInstance(self2, layout) {
    if (!self2._ink) {
      self2._ink = {
        grid: null,
        model: null,
        hash: null,
        fetchGen: 0,
        collapseSet: new CollapseSet(
          layout.inkPivotState && layout.inkPivotState.collapsedPaths || []
        ),
        colWidths: Object.assign(
          {},
          layout.inkPivotState && layout.inkPivotState.colWidths || {}
        ),
        frOverrides: Object.assign(
          {},
          layout.inkPivotState && layout.inkPivotState.frOverrides || {}
        ),
        persistTimer: null,
        initialised: false
      };
    }
    return self2._ink;
  }
  function persistState(self2, ink) {
    if (!(ink.layout && ink.layout.inkPivot || {}).rememberCollapse) return;
    clearTimeout(ink.persistTimer);
    ink.persistTimer = setTimeout(function() {
      self2.backendApi.applyPatches([{
        qOp: "replace",
        qPath: "/inkPivotState",
        qValue: JSON.stringify({
          collapsedPaths: ink.collapseSet.serialize(),
          colWidths: ink.colWidths,
          frOverrides: ink.frOverrides
        })
      }], true).catch(function(e) {
        console.warn("[InkPivot] persist failed", e);
      });
    }, 800);
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
      indentPx: p.indentPx || 16,
      nullText: p.nullText || "-",
      colWidths: ink.colWidths,
      rowLayout: p.rowLayout || "columns",
      fillWidth: !!p.fillWidth,
      hierarchyFr: p.hierarchyFr || 1.5,
      // Custom def props (inkFr) echo through into the layout info objects,
      // same mechanism as the qShowTotal panel item.
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
          onToggle: function(path) {
            ink.collapseSet.toggle(path);
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
      if (!ink.indentChecked) {
        ink.indentChecked = true;
        const model = self2.backendApi.model;
        Promise.resolve().then(function() {
          return model.getEffectiveProperties ? model.getEffectiveProperties() : model.getProperties();
        }).then(function(props) {
          const def = props && props.qHyperCubeDef;
          if (!def) return;
          const patches = [];
          if (!def.qIndentMode) {
            patches.push({ qOp: "replace", qPath: "/qHyperCubeDef/qIndentMode", qValue: "true" });
          }
          if (!def.qAlwaysFullyExpanded) {
            patches.push({ qOp: "replace", qPath: "/qHyperCubeDef/qAlwaysFullyExpanded", qValue: "true" });
          }
          if (patches.length) return model.applyPatches(patches, true);
        }).catch(function(e) {
          console.warn("[InkPivot] indent-mode migration skipped", e);
        });
      }
      ink.layout = layout;
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
        if (!ink.initialised) {
          ink.initialised = true;
          const lvl = layout.inkPivot && layout.inkPivot.initialExpandLevel;
          if (typeof lvl === "number" && lvl < 99 && ink.collapseSet.serialize().length === 0) {
            ink.collapseSet.collapseAll(pathsAtOrBelowLevel(model.rowTree, lvl));
          }
        }
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
