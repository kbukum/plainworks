import { existsSync, readdirSync, readFileSync } from "node:fs"
import { join } from "node:path"
import { isRecord } from "@plainworks/std"
import { SourceLinkError } from "./errors"

/**
 * The export condition that maps a `@plainworks/*` entry to its `src` file. Packed manifests drop
 * it, so only a checkout's own manifests carry it.
 */
export const SOURCE_CONDITION = "@plainworks/source"

/** One kit package in a checkout, read from its own `package.json`. */
export interface KitPackage {
  readonly name: string
  readonly dir: string
  readonly version: string
  readonly exports: unknown
  /** Peer dependency names: the singletons an app must provide once. */
  readonly peers: readonly string[]
  /** Runtime dependency names, which a packed install places in the app. */
  readonly dependencies: readonly string[]
}

/** The kit packages a checkout publishes, by package name. */
export interface KitCheckout {
  readonly root: string
  readonly packages: ReadonlyMap<string, KitPackage>
}

const KIT_SCOPE = "@plainworks/"

/**
 * Reads every `@plainworks/*` package under `<root>/packages`. Throws a {@link SourceLinkError}
 * when the folder is missing or holds no kit package, so a wrong path never links nothing.
 */
export function readKitCheckout(root: string): KitCheckout {
  const packagesDir = join(root, "packages")
  if (!existsSync(packagesDir)) {
    throw new SourceLinkError(
      "vite/checkout-missing",
      `No plainworks checkout at ${root}: ${packagesDir} does not exist.`,
    )
  }
  const packages = new Map<string, KitPackage>()
  for (const entry of readdirSync(packagesDir, { withFileTypes: true })) {
    if (!entry.isDirectory()) continue
    const dir = join(packagesDir, entry.name)
    const manifestPath = join(dir, "package.json")
    if (!existsSync(manifestPath)) continue
    const kit = kitPackage(dir, manifestPath)
    if (kit !== undefined) packages.set(kit.name, kit)
  }
  if (packages.size === 0) {
    throw new SourceLinkError(
      "vite/checkout-missing",
      `No @plainworks packages under ${packagesDir}.`,
    )
  }
  return { root, packages }
}

function kitPackage(dir: string, manifestPath: string): KitPackage | undefined {
  let manifest: unknown
  try {
    manifest = JSON.parse(readFileSync(manifestPath, "utf8"))
  } catch (cause) {
    throw new SourceLinkError("vite/manifest-invalid", `${manifestPath} is not valid JSON.`, {
      cause,
    })
  }
  if (!isRecord(manifest) || typeof manifest.name !== "string") {
    throw new SourceLinkError("vite/manifest-invalid", `${manifestPath} has no package name.`)
  }
  if (!manifest.name.startsWith(KIT_SCOPE)) return undefined
  return {
    name: manifest.name,
    dir,
    version: typeof manifest.version === "string" ? manifest.version : "",
    exports: manifest.exports,
    peers: isRecord(manifest.peerDependencies) ? Object.keys(manifest.peerDependencies) : [],
    dependencies: isRecord(manifest.dependencies) ? Object.keys(manifest.dependencies) : [],
  }
}

/** What {@link kitSingletons} adds beyond the kit's own peers. */
export interface SingletonOptions {
  /** Packages the app asks to resolve once. */
  readonly extra?: readonly string[]
  /** Whether the app has a package installed. */
  readonly isInstalled?: (name: string) => boolean
}

/**
 * The packages an app resolves once, from itself, when it links the checkout: every kit peer, every
 * kit runtime dependency the app has installed, and `extra`, sorted, never a kit package. A packed
 * install places those dependencies in the app, so resolving them from the app keeps one copy of
 * each, and of React behind them. Dependencies the app lacks stay with the checkout.
 */
export function kitSingletons(checkout: KitCheckout, options: SingletonOptions = {}): string[] {
  const { extra = [], isInstalled = () => false } = options
  const names = new Set(extra)
  for (const kit of checkout.packages.values()) {
    for (const peer of kit.peers) if (!peer.startsWith(KIT_SCOPE)) names.add(peer)
    for (const dependency of kit.dependencies) {
      if (!dependency.startsWith(KIT_SCOPE) && isInstalled(dependency)) names.add(dependency)
    }
  }
  return [...names].sort()
}
