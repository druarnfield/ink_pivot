import * as esbuild from "esbuild";
import fs from "node:fs";
import path from "node:path";
import zlib from "node:zlib";

// The extension's identity in Sense. The .qext basename, the JS basename and
// the folder QMC creates all have to agree — Sense loads <folder>/<id>.js next
// to <id>.qext — and it is what lets this build sit alongside the published
// InkPivot instead of replacing it. It is also injected into the bundle as the
// CSS/class namespace (see src/core/ns.js).
const EXT_ID = "ink-pivot-dev";

const args = process.argv.slice(2);
const watch = args.includes("--watch");
// QMC and the proxy both cache extensions hard, so every importable build gets
// a version nobody has seen. Watch rebuilds are not imports, and --no-bump is
// there for reproducing a specific build.
const shouldBump = !watch && !args.includes("--no-bump");

/* ------------------------------------------------------------------ version */

function bumpPatch(version) {
  const m = /^(\d+)\.(\d+)\.(\d+)(.*)$/.exec(version);
  if (!m) throw new Error(`cannot bump non-semver version "${version}"`);
  return `${m[1]}.${m[2]}.${Number(m[3]) + 1}${m[4]}`;
}

const pkg = JSON.parse(fs.readFileSync("package.json", "utf8"));
if (shouldBump) {
  pkg.version = bumpPatch(pkg.version);
  fs.writeFileSync("package.json", JSON.stringify(pkg, null, 2) + "\n");
}
const version = pkg.version;

// package.json is the single source of truth; the .qext follows it so the two
// can never disagree about what QMC is showing.
const qextPath = `${EXT_ID}.qext`;
const qext = JSON.parse(fs.readFileSync(qextPath, "utf8"));
if (qext.version !== version) {
  qext.version = version;
  fs.writeFileSync(qextPath, JSON.stringify(qext, null, 2) + "\n");
}

/* -------------------------------------------------------------------- bundle */

const outfile = `dist/${EXT_ID}.js`;
const opts = {
  entryPoints: ["src/qlik-adapter.js"],
  bundle: true,
  format: "iife",
  globalName: "InkPivot",
  outfile,
  platform: "browser",
  target: ["es2018"],
  loader: { ".css": "text" },
  define: { __INK_NS__: JSON.stringify(EXT_ID) },
  // Sense's client is RequireJS. UMD deps (exceljs) see global `define` and
  // throw "Mismatched anonymous define()". Shadow BOTH define and require.
  banner: { js: "define([], function () { var define, require;" },
  footer: { js: "return InkPivot; });" },
  logLevel: "info"
};

fs.mkdirSync("dist", { recursive: true });
fs.writeFileSync(`dist/${EXT_ID}.qext`, JSON.stringify(qext, null, 2) + "\n");

/* ---------------------------------------------------------------- smoke test */

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
  const run = new Function("define", "window", "document", code + "\n");
  run(
    function (deps, factory) {
      factoryResult = factory();
    },
    { document: stubDoc },
    stubDoc
  );
  if (!factoryResult || typeof factoryResult.paint !== "function") {
    throw new Error("dist bundle did not return a Sense extension object");
  }
  for (const key of ["initialProperties", "definition", "support", "resize"]) {
    if (!(key in factoryResult)) throw new Error("dist bundle is missing " + key);
  }
}

/* ---------------------------------------------------------------------- zip */

// A store-and-deflate zip writer, so packaging does not depend on a `zip`
// binary being on PATH — it usually is not on a Windows dev box.
const CRC_TABLE = (() => {
  const table = new Int32Array(256);
  for (let i = 0; i < 256; i++) {
    let c = i;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    table[i] = c;
  }
  return table;
})();

function crc32(buf) {
  let crc = -1;
  for (let i = 0; i < buf.length; i++) {
    crc = (crc >>> 8) ^ CRC_TABLE[(crc ^ buf[i]) & 0xff];
  }
  return (crc ^ -1) >>> 0;
}

function writeZip(entries, outPath) {
  const now = new Date();
  const time =
    ((now.getHours() << 11) | (now.getMinutes() << 5) | (now.getSeconds() >> 1)) & 0xffff;
  const date =
    (((now.getFullYear() - 1980) << 9) | ((now.getMonth() + 1) << 5) | now.getDate()) & 0xffff;

  const locals = [];
  const centrals = [];
  let offset = 0;

  for (const { name, data } of entries) {
    const nameBuf = Buffer.from(name, "utf8");
    const deflated = zlib.deflateRawSync(data, { level: 9 });
    const crc = crc32(data);

    const local = Buffer.alloc(30);
    local.writeUInt32LE(0x04034b50, 0);
    local.writeUInt16LE(20, 4); // version needed
    local.writeUInt16LE(0, 6); // flags
    local.writeUInt16LE(8, 8); // deflate
    local.writeUInt16LE(time, 10);
    local.writeUInt16LE(date, 12);
    local.writeUInt32LE(crc, 14);
    local.writeUInt32LE(deflated.length, 18);
    local.writeUInt32LE(data.length, 22);
    local.writeUInt16LE(nameBuf.length, 26);
    local.writeUInt16LE(0, 28); // extra length
    locals.push(local, nameBuf, deflated);

    const central = Buffer.alloc(46);
    central.writeUInt32LE(0x02014b50, 0);
    central.writeUInt16LE(20, 4); // version made by
    central.writeUInt16LE(20, 6); // version needed
    central.writeUInt16LE(0, 8);
    central.writeUInt16LE(8, 10);
    central.writeUInt16LE(time, 12);
    central.writeUInt16LE(date, 14);
    central.writeUInt32LE(crc, 16);
    central.writeUInt32LE(deflated.length, 20);
    central.writeUInt32LE(data.length, 24);
    central.writeUInt16LE(nameBuf.length, 28);
    central.writeUInt16LE(0, 30); // extra length
    central.writeUInt16LE(0, 32); // comment length
    central.writeUInt16LE(0, 34); // disk number
    central.writeUInt16LE(0, 36); // internal attrs
    central.writeUInt32LE(0, 38); // external attrs
    central.writeUInt32LE(offset, 42);
    centrals.push(central, nameBuf);

    offset += 30 + nameBuf.length + deflated.length;
  }

  const centralDir = Buffer.concat(centrals);
  const eocd = Buffer.alloc(22);
  eocd.writeUInt32LE(0x06054b50, 0);
  eocd.writeUInt16LE(0, 4); // disk number
  eocd.writeUInt16LE(0, 6); // central dir disk
  eocd.writeUInt16LE(entries.length, 8);
  eocd.writeUInt16LE(entries.length, 10);
  eocd.writeUInt32LE(centralDir.length, 12);
  eocd.writeUInt32LE(offset, 16);
  eocd.writeUInt16LE(0, 20); // comment length

  fs.writeFileSync(outPath, Buffer.concat([...locals, centralDir, eocd]));
  return fs.statSync(outPath).size;
}

/* --------------------------------------------------------------------- run */

if (watch) {
  const ctx = await esbuild.context(opts);
  await ctx.watch();
} else {
  await esbuild.build(opts);
  const out = fs.readFileSync(outfile, "utf8");
  if (!out.startsWith(opts.banner.js)) throw new Error("AMD banner missing from dist bundle");
  smokeTest(out);

  // The zip's own name does not define the extension — the .qext basename does
  // — but keeping them equal avoids a QMC folder that disagrees with the id.
  const zipPath = `${EXT_ID}.zip`;
  const bytes = writeZip(
    [`${EXT_ID}.qext`, `${EXT_ID}.js`].map((name) => ({
      name,
      data: fs.readFileSync(path.join("dist", name))
    })),
    zipPath
  );

  console.log(
    `smoke test ok — ${EXT_ID} ${version} → ${zipPath} (${(bytes / 1024).toFixed(0)} KB)`
  );
}
