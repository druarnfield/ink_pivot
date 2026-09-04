// InkPivot diagnostic capture — paste this whole file into the DevTools
// console on a sheet where an InkPivot object has rendered. It downloads a
// JSON file describing every InkPivot object on the page: what the engine was
// actually told, what it sent back, and the shape of one real pivot page.
//
//   inkCapture()                  redacted (default) — see below
//   inkCapture({ redact: false }) verbatim, including your data
//   inkCapture({ maxRows: 200 })  capture a deeper page
//
// WHAT LEAVES YOUR BROWSER, with redact on (the default):
//   kept     — field and measure titles, hypercube settings, InkPivot
//              settings, and the full structure of the pivot response:
//              every node's qType, qElemNo and nesting, and whether each
//              number was finite, null or NaN.
//   replaced — the dimension VALUES ('N' and 'U' node text) and every
//              measure value, swapped for synthetic placeholders.
// The structure is the whole point of the capture; the values are not needed.
// Read the file before sending it anywhere regardless — you know your data
// and this script does not.

window.inkCapture = async function inkCapture(options) {
  const opts = Object.assign({ redact: true, maxRows: 60 }, options);
  const ENGINE_PAGE_CELLS = 1e4;

  // Deterministic stand-in so repeated captures diff cleanly.
  let synth = 0;
  const nextNum = () => ((synth = (synth * 31 + 17) % 9973), synth + 1);

  function node(n) {
    const out = { qType: n.qType, qElemNo: n.qElemNo };
    // 'N'/'U' carry field values. 'T' ("Totals") and 'E' (padding) are
    // structure, and 'P' is a measure name — all schema, all kept.
    out.qText =
      opts.redact && (n.qType === "N" || n.qType === "U")
        ? "v" + n.qElemNo
        : n.qText;
    if (n.qSubNodes && n.qSubNodes.length) out.qSubNodes = n.qSubNodes.map(node);
    return out;
  }

  function dataCell(c) {
    if (!opts.redact) return { qText: c.qText, qNum: c.qNum, qAttrExps: c.qAttrExps };
    // Preserve which cells were blank, null or NaN — that drives null
    // handling, and a synthetic number would hide it.
    const finite = typeof c.qNum === "number" && isFinite(c.qNum);
    if (!finite) return { qText: c.qText === undefined ? "" : "", qNum: c.qNum };
    const v = nextNum();
    return { qText: String(v), qNum: v };
  }

  function trimDef(def) {
    if (!def) return null;
    return {
      qMode: def.qMode,
      qIndentMode: def.qIndentMode,
      qAlwaysFullyExpanded: def.qAlwaysFullyExpanded,
      qNoOfLeftDims: def.qNoOfLeftDims,
      qSuppressMissing: def.qSuppressMissing,
      qShowTotalsAbove: def.qShowTotalsAbove,
      qDimensions: (def.qDimensions || []).map((d) => ({
        qShowTotal: d.qShowTotal,
        qFieldDefs: d.qDef && d.qDef.qFieldDefs,
        // Should echo to qDimensionInfo[i].inkFr — one of the things being checked.
        inkFr: d.qDef && d.qDef.inkFr
      })),
      qMeasures: (def.qMeasures || []).map((m) => ({
        qLabel: m.qDef && m.qDef.qLabel,
        inkFr: m.qDef && m.qDef.inkFr
      }))
    };
  }

  const entries = Object.entries(window.__inkPivot || {});
  if (!entries.length) {
    console.warn("[inkCapture] no InkPivot objects have painted on this sheet");
    return;
  }

  const objects = [];
  for (const [id, handle] of entries) {
    const record = { objectId: id, title: handle.title };
    try {
      const [props, layout] = await Promise.all([
        handle.model.getEffectiveProperties
          ? handle.model.getEffectiveProperties()
          : handle.model.getProperties(),
        handle.model.getLayout()
      ]);
      const hc = layout.qHyperCube;

      record.extension = layout.qInfo && layout.qInfo.qType;
      record.effectiveDef = trimDef(props && props.qHyperCubeDef);
      record.inkPivot = layout.inkPivot;
      record.inkPivotState = layout.inkPivotState;
      record.size = hc.qSize;
      record.noOfLeftDims = hc.qNoOfLeftDims;
      record.dimensionInfo = hc.qDimensionInfo.map((d) => ({
        title: d.qFallbackTitle,
        qShowTotal: d.qShowTotal,
        inkFr: d.inkFr, // present only if the qDef.* passthrough works
        qStateCounts: d.qStateCounts
      }));
      record.measureInfo = hc.qMeasureInfo.map((m) => ({
        title: m.qFallbackTitle,
        numFormat: m.qNumFormat && m.qNumFormat.qFmt,
        inkFr: m.inkFr
      }));

      const width = Math.max(1, hc.qSize.qcx);
      const height = Math.min(
        hc.qSize.qcy,
        opts.maxRows,
        Math.max(1, Math.floor(ENGINE_PAGE_CELLS / width))
      );
      if (width <= ENGINE_PAGE_CELLS && height > 0) {
        const pages = await handle.model.getHyperCubePivotData("/qHyperCubeDef", [
          { qLeft: 0, qTop: 0, qWidth: width, qHeight: height }
        ]);
        const page = pages[0];
        record.pivotPage = {
          requested: { qWidth: width, qHeight: height },
          qLeft: (page.qLeft || []).map(node),
          qTop: (page.qTop || []).map(node),
          qData: (page.qData || []).map((row) => row.map(dataCell))
        };
      } else {
        record.pivotPage = { skipped: `qcx ${width} exceeds one engine page` };
      }
    } catch (e) {
      record.error = String((e && e.message) || e);
    }
    objects.push(record);
  }

  const payload = {
    capturedAt: new Date().toISOString(),
    redacted: opts.redact,
    objects
  };

  const name = "inkpivot-capture-" + Date.now() + ".json";
  const blob = new Blob([JSON.stringify(payload, null, 2)], { type: "application/json" });
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = name;
  a.click();
  URL.revokeObjectURL(a.href);

  console.log("[inkCapture] wrote " + name, payload);
  return payload;
};

window.inkCapture();
