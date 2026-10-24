import { existsSync, readFileSync } from "node:fs"
import { dirname, join, resolve } from "node:path"
import { isRecord } from "@plainworks/std"
import { type Plugin, searchForWorkspaceRoot } from "vite"
import { type KitCheckout, kitSingletons, readKitCheckout } from "./checkout"
import { kitStylesheetAliases, resolveKitImport } from "./resolve"

/** Options for {@link plainworksSource}. */
export interface PlainworksSourceOptions {
  /** The plainworks checkout to link, absolute or relative to the Vite root. */
  readonly checkout: string
  /** Packages to resolve once from the app beyond the kit's peers and installed dependencies. */
  readonly dedupe?: readonly string[]
}

/**
 * Links an app's `@plainworks/*` imports to a local checkout's source for fast feedback in the Vite
 * dev server and Vitest. Each import resolves through the checkout's own `exports` map under the
 * source condition. The kit's peers, and the runtime dependencies the app has installed, resolve
 * once from the app (one React), as a packed install would. The checkout is served. Use it for
 * inner-loop runs only: builds and acceptance gates install the packed kit.
 *
 * Throws a `SourceLinkError` when the checkout is missing or an import names a subpath it does not
 * export. Warns once when installed kit versions differ from the checkout's.
 */
export function plainworksSource(options: PlainworksSourceOptions): Plugin {
  let checkout: KitCheckout | undefined
  return {
    name: "plainworks-source",
    enforce: "pre",
    config(config) {
      const root = resolve(config.root ?? process.cwd())
      checkout = readKitCheckout(resolve(root, options.checkout))
      return {
        resolve: {
          alias: kitStylesheetAliases(checkout),
          dedupe: kitSingletons(checkout, {
            extra: options.dedupe ?? [],
            isInstalled: (name) => installedManifest(root, name) !== undefined,
          }),
        },
        server: { fs: { allow: [checkout.root, searchForWorkspaceRoot(root)] } },
        optimizeDeps: { exclude: [...checkout.packages.keys()] },
      }
    },
    configResolved(config) {
      if (checkout === undefined) return
      const skewed = versionSkew(checkout, config.root)
      config.logger.info(`plainworks: linking kit source from ${checkout.root}`)
      if (skewed.length > 0) {
        config.logger.warn(
          `plainworks: the linked checkout's versions differ from the installed kit (${skewed.join(", ")}); repack it before acceptance runs.`,
        )
      }
    },
    resolveId(source) {
      return checkout === undefined ? null : (resolveKitImport(checkout, source) ?? null)
    },
  }
}

/** `name installed→checkout` for every installed kit package whose version differs. */
function versionSkew(checkout: KitCheckout, appRoot: string): string[] {
  const skewed: string[] = []
  for (const kit of checkout.packages.values()) {
    const manifestPath = installedManifest(appRoot, kit.name)
    if (manifestPath === undefined) continue
    const manifest: unknown = JSON.parse(readFileSync(manifestPath, "utf8"))
    const installed =
      isRecord(manifest) && typeof manifest.version === "string" ? manifest.version : ""
    if (installed !== kit.version) skewed.push(`${kit.name} ${installed}→${kit.version}`)
  }
  return skewed
}

/** The `package.json` Node would load for `name` from `root`, searching each ancestor's `node_modules`. */
function installedManifest(root: string, name: string): string | undefined {
  for (let dir = root; ; dir = dirname(dir)) {
    const manifest = join(dir, "node_modules", name, "package.json")
    if (existsSync(manifest)) return manifest
    if (dirname(dir) === dir) return undefined
  }
}
