import * as esbuild from "esbuild";
import fs from "node:fs";

const watch = process.argv.includes("--watch");
const opts = {
  entryPoints: ["src/qlik-adapter.js"],
  bundle: true,
  format: "iife",
  globalName: "InkPivot",
  outfile: "dist/ink-pivot.js",
  platform: "browser",
  target: ["es2018"],
  loader: { ".css": "text" },
  // Sense's client is RequireJS. UMD deps (exceljs) see global `define` and
  // throw "Mismatched anonymous define()". Shadow BOTH define and require.
  banner: { js: "define([], function () { var define, require;" },
  footer: { js: "return InkPivot; });" },
  logLevel: "info",
};

fs.mkdirSync("dist", { recursive: true });
fs.copyFileSync("ink-pivot.qext", "dist/ink-pivot.qext");

// Evaluate the bundle through a stub AMD loader. This catches the whole class
// of "it built fine and is dead on arrival" failures: the src tree is
// CommonJS, so a stray `"type": "module"` in package.json makes esbuild treat
// every file as ESM — the requires resolve to empty namespace objects and the
// factory throws `module is not defined` on the first line the client runs.
function smokeTest(code) {
  let factoryResult;
  const stubEl = {
    style: { setProperty() {}, removeProperty() {} },
    classList: { contains: () => false },
    addEventListener() {},
    appendChild() {}
  };
  const stubDoc = {
    getElementById: () => null,
    createElement: () => stubEl,
    head: { appendChild() {} }
  };
  const run = new Function(
    "define",
    "window",
    "document",
    code + "\n"
  );
  run(function (deps, factory) { factoryResult = factory(); }, { document: stubDoc }, stubDoc);
  if (!factoryResult || typeof factoryResult.paint !== "function") {
    throw new Error("dist bundle did not return a Sense extension object");
  }
  for (const key of ["initialProperties", "definition", "support", "resize"]) {
    if (!(key in factoryResult)) throw new Error("dist bundle is missing " + key);
  }
}

if (watch) {
  const ctx = await esbuild.context(opts);
  await ctx.watch();
} else {
  await esbuild.build(opts);
  const out = fs.readFileSync(opts.outfile, "utf8");
  if (!out.startsWith(opts.banner.js)) throw new Error("AMD banner missing from dist bundle");
  smokeTest(out);
  console.log("smoke test ok");
}
