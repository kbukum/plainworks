// Build `dist/styles.css` after tsdown: bundle the shipped client with its kit dependencies, collect
// the utilities it uses, and compile the isolated stylesheet. Run as part of `bun run build`.

import { writeFileSync } from "node:fs"
import { fileURLToPath } from "node:url"
import { build } from "vite"
import { buildStylesheet, collectCandidates } from "./pipeline.mjs"

const packageRoot = fileURLToPath(new URL("../..", import.meta.url))
const at = (path) => fileURLToPath(new URL(path, new URL("../../", import.meta.url)))

// Kit packages are bundled so their component class strings are scanned; everything else (React,
// Base UI, icons) carries no utilities and stays external.
const output = await build({
  root: packageRoot,
  configFile: false,
  logLevel: "warn",
  build: {
    write: false,
    minify: false,
    lib: { entry: at("dist/client.js"), formats: ["es"], fileName: "client" },
    rollupOptions: {
      external: (id) => !id.startsWith(".") && !id.startsWith("/") && !id.startsWith("@plainworks/"),
    },
  },
})
const chunks = (Array.isArray(output) ? output : [output]).flatMap((result) => result.output)
const code = chunks.map((chunk) => (chunk.type === "chunk" ? chunk.code : "")).join("\n")

const css = await buildStylesheet({
  entry: at("src/styles/inspector.css"),
  hostContract: at("src/styles/host-contract.css"),
  candidates: collectCandidates(code),
})
writeFileSync(at("dist/styles.css"), css)
