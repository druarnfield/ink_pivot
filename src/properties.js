"use strict";
var initialProperties = {
  qHyperCubeDef: {
    qMode: "P",
    qAlwaysFullyExpanded: true,
    qDimensions: [],
    qMeasures: [],
    qInitialDataFetch: [{ qTop: 0, qLeft: 0, qWidth: 1, qHeight: 1 }],
    qSuppressMissing: true,
    // The engine only emits subtotal ('T') rows under qAlwaysFullyExpanded
    // when qIndentMode is on (confirmed live on May 2023) — and collapsed
    // group values depend on those rows. Rendering is ours, so the "indent"
    // layout never reaches the screen. Legacy objects are soft-patched in
    // the adapter.
    qIndentMode: true,
    qShowTotalsAbove: false,
    qNoOfLeftDims: -1
  },
  inkPivot: {
    subtotalPos: "bottom",
    rowLayout: "columns",
    fillWidth: false,
    hierarchyFr: 1.5,
    nullText: "-",
    rowHeight: 28,
    fontSize: 13,
    indentPx: 16,
    banding: true,
    initialExpandLevel: 99,
    cellCap: 25e4,
    rememberCollapse: true,
    // Colors default to '' = auto: the palette lives in grid.css so themes
    // can restyle it. The adapter only writes an inline --ip-* variable for
    // values the user actually sets (see optionsFromLayout / LEGACY_AUTO).
    headerBg: "",
    headerText: "",
    totalBg: "",
    totalText: "",
    exportPrefix: "pivot"
  },
  // Persisted UI state (soft-ish; written back by the adapter):
  inkPivotState: { collapsedPaths: [], colWidths: {}, frOverrides: {} }
};
function colorItem(refKey, label) {
  return { type: "string", ref: "inkPivot." + refKey, label, expression: "optional" };
}
var definition = {
  type: "items",
  component: "accordion",
  items: {
    data: {
      uses: "data",
      items: {
        dimensions: {
          uses: "dimensions",
          items: {
            showTotal: {
              type: "boolean",
              ref: "qShowTotal",
              label: "Subtotal data (needed for collapsed group values)",
              defaultValue: true
            },
            inkFr: {
              type: "number",
              ref: "inkFr",
              label: "Width (fr, used when Fill width is on)",
              defaultValue: 1
            }
          }
        },
        measures: {
          uses: "measures",
          items: {
            bgColorExpr: {
              type: "string",
              ref: "qAttributeExpressions.0.qExpression",
              label: "Background color expression",
              expression: "optional",
              defaultValue: ""
            },
            textColorExpr: {
              type: "string",
              ref: "qAttributeExpressions.1.qExpression",
              label: "Text color expression",
              expression: "optional",
              defaultValue: ""
            },
            inkFr: {
              type: "number",
              ref: "inkFr",
              label: "Width (fr, used when Fill width is on)",
              defaultValue: 1
            }
          }
        }
      }
    },
    sorting: { uses: "sorting" },
    inkData: {
      type: "items",
      label: "Pivot options",
      items: {
        subtotalPos: {
          type: "string",
          component: "dropdown",
          ref: "inkPivot.subtotalPos",
          label: "Subtotals",
          defaultValue: "bottom",
          options: [
            { value: "bottom", label: "Bottom" },
            { value: "top", label: "Top" },
            { value: "off", label: "Off" }
          ]
        },
        nullText: { type: "string", ref: "inkPivot.nullText", label: "Null display text", defaultValue: "-" },
        initialExpandLevel: { type: "number", ref: "inkPivot.initialExpandLevel", label: "Initial expand level (99 = all)", defaultValue: 99 },
        cellCap: { type: "number", ref: "inkPivot.cellCap", label: "Cell cap", defaultValue: 25e4 },
        noOfLeftDims: {
          type: "number",
          ref: "qHyperCubeDef.qNoOfLeftDims",
          label: "Row dimension count (-1 = all; remainder become column dims)",
          defaultValue: -1
        },
        rememberCollapse: {
          type: "boolean",
          component: "switch",
          ref: "inkPivot.rememberCollapse",
          label: "Remember collapse state",
          defaultValue: true,
          options: [{ value: true, label: "On" }, { value: false, label: "Off" }]
        }
      }
    },
    inkAppearance: {
      type: "items",
      label: "Pivot appearance",
      items: {
        rowLayout: {
          type: "string",
          component: "dropdown",
          ref: "inkPivot.rowLayout",
          label: "Row layout",
          defaultValue: "columns",
          options: [
            { value: "columns", label: "Columns (one per dimension)" },
            { value: "compact", label: "Compact (single hierarchy column)" }
          ]
        },
        fillWidth: {
          type: "boolean",
          component: "switch",
          ref: "inkPivot.fillWidth",
          label: "Fill container width",
          defaultValue: false,
          options: [{ value: true, label: "On" }, { value: false, label: "Off" }]
        },
        hierarchyFr: {
          type: "number",
          ref: "inkPivot.hierarchyFr",
          label: "Hierarchy column width (fr, compact + fill)",
          defaultValue: 1.5
        },
        rowHeight: { type: "number", ref: "inkPivot.rowHeight", label: "Row height (px)", defaultValue: 28 },
        fontSize: { type: "number", ref: "inkPivot.fontSize", label: "Font size (px)", defaultValue: 13 },
        indentPx: { type: "number", ref: "inkPivot.indentPx", label: "Indent (px)", defaultValue: 16 },
        banding: {
          type: "boolean",
          component: "switch",
          ref: "inkPivot.banding",
          label: "Row banding",
          defaultValue: true,
          options: [{ value: true, label: "On" }, { value: false, label: "Off" }]
        },
        headerBg: colorItem("headerBg", "Header background"),
        headerText: colorItem("headerText", "Header text"),
        totalBg: colorItem("totalBg", "Total row background"),
        totalText: colorItem("totalText", "Total row text")
      }
    },
    inkExport: {
      type: "items",
      label: "Export",
      items: {
        exportPrefix: { type: "string", ref: "inkPivot.exportPrefix", label: "Filename prefix", defaultValue: "pivot" }
      }
    },
    settings: { uses: "settings" }
  }
};
module.exports = { initialProperties, definition };
