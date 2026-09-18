import { defineConfig } from "tsdown"

// The initializer is a Node executable, not a host-independent library, so it does not use the
// shared `@plainworks/tsdown-config` preset (which targets `platform: "neutral"` and externalizes
// react/@plainworks for a consumer to resolve). It bundles to a single self-contained `bin` with a
// hashbang, emits no `.d.ts` (nothing imports it), and leaves `examples/` untouched for `files` to
// ship verbatim.
export default defineConfig({
  entry: ["src/bin.ts", "src/index.ts"],
  format: ["esm"],
  platform: "node",
  fixedExtension: false,
  dts: false,
  clean: true,
  outDir: "dist",
})
