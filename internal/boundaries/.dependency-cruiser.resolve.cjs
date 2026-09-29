// Resolver aliases for the layer gate, loaded through dependency-cruiser's `webpackConfig` option.
//
// Vendored shadcn atoms have no source export condition: their `@plainworks/elements/<atom>`
// subpaths point only at `dist`, which sits outside the gate's `includeOnly`. Without an alias, an
// import of an atom would drop out of the graph and no layer rule could see it. The aliases map each
// atom subpath to the source file `registry.json` records for it, so the gate checks the edge.

const path = require("node:path")

const elements = path.resolve(__dirname, "..", "..", "packages", "elements")
const registry = require(path.join(elements, "registry.json"))

module.exports = {
  resolve: {
    alias: Object.fromEntries(
      registry.items.map((atom) => [
        `@plainworks/elements/${atom.name}$`,
        path.join(elements, atom.files[0].path),
      ]),
    ),
  },
}
