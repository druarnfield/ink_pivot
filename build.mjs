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

if (watch) {
  const ctx = await esbuild.context(opts);
  await ctx.watch();
} else {
  await esbuild.build(opts);
  const out = fs.readFileSync(opts.outfile, "utf8");
  if (!out.startsWith(opts.banner.js)) throw new Error("AMD banner missing from dist bundle");
}
