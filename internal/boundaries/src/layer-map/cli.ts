#!/usr/bin/env bun
import { readFileSync, writeFileSync } from "node:fs"
import { join, resolve } from "node:path"
import layers from "../../layers.json" with { type: "json" }
import { LayerMapError, parseLayerMap, syncLayerMapDocs } from "./index"

const repoRoot = resolve(import.meta.dirname, "..", "..", "..", "..")

function readText(path: string): string | undefined {
  try {
    return readFileSync(join(repoRoot, path), "utf8")
  } catch (error) {
    if (error instanceof Error && "code" in error && error.code === "ENOENT") return undefined
    throw error
  }
}

function main(mode: string | undefined): number {
  if (mode !== "--check" && mode !== "--write") {
    process.stderr.write("usage: layer-map (--check | --write)\n")
    return 2
  }
  const stale = syncLayerMapDocs(parseLayerMap(layers), readText).filter(
    (doc) => doc.current !== doc.synced,
  )
  if (mode === "--write") {
    for (const doc of stale) writeFileSync(join(repoRoot, doc.path), doc.synced)
    process.stdout.write(`layer-map: updated ${stale.length} doc(s)\n`)
    return 0
  }
  if (stale.length > 0) {
    process.stderr.write(
      "layer-map: these docs no longer match internal/boundaries/layers.json. Run " +
        `\`bun run sync-layer-map\`:\n${stale.map((doc) => `  ${doc.path}\n`).join("")}`,
    )
    return 1
  }
  process.stdout.write("layer-map: docs match internal/boundaries/layers.json\n")
  return 0
}

try {
  process.exitCode = main(process.argv[2])
} catch (error) {
  if (!(error instanceof LayerMapError)) throw error
  process.stderr.write(`layer-map: ${error.message}\n`)
  process.exitCode = 1
}
