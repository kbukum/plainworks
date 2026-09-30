import { dirname, join, posix } from "node:path"
import { isRecord } from "@plainworks/std"

/**
 * What a production build must, and must not, contain, with every path already resolved to an
 * absolute location on disk (see `resolveRule`).
 */
export interface ExclusionRule {
  /**
   * Paths no source map may record a source under. Minifiers rename identifiers but not the
   * original file paths a map records, so this proves which modules were bundled — including code
   * that emits no telltale string. A directory ends with `/`.
   */
  readonly forbiddenSources: readonly string[]
  /**
   * Literal strings that must never appear in emitted JavaScript or CSS. They cover what has no
   * source map (stylesheets) and must be strings a minifier cannot rewrite.
   */
  readonly markers: readonly string[]
  /**
   * Paths the build's map sources must include — the positive control. If the app's own modules
   * are not visible, the maps are missing or unreadable and a clean result would prove nothing.
   */
  readonly expectedSources: readonly string[]
  /**
   * Globs of scripts allowed to have no source map: bundler runtimes, manifests, and prebuilt
   * polyfills. `*` matches within one path segment and `**` across segments. They are still
   * searched for markers. Any other unmapped script fails the scan, because a minified chunk can
   * hide forbidden code that no marker survives in.
   */
  readonly allowUnmapped: readonly string[]
}

/** One emitted build file. */
export interface Artifact {
  readonly path: string
  readonly text: string
}

/** One reason the build fails the rule. */
export type Leak =
  | { readonly kind: "source"; readonly file: string; readonly source: string }
  | { readonly kind: "marker"; readonly file: string; readonly marker: string }
  | { readonly kind: "unmapped"; readonly file: string }
  | { readonly kind: "blind"; readonly path: string }

/** The outcome of {@link scanArtifacts}. */
export interface ScanResult {
  readonly leaks: readonly Leak[]
  /** Allowed scripts that reach no source map, so only markers could check them. */
  readonly unmapped: readonly string[]
}

const SCRIPT = /\.[cm]?js$/
const STYLE = /\.css$/
const MAP = /\.map$/
const MAP_URL = /\/[/*][#@] sourceMappingURL=([^\s*]+)/g
const DATA_URL = /^data:application\/json(?:;charset=[\w-]+)?;base64,(.+)$/
const URL_SCHEME = /^[a-z][\w+.-]*:/i
const PROJECT_SOURCE = /^[a-z][\w+.-]*:\/\/\/?\[project\]\/(.*)$/i

/** Whether `path` is a file the scan reads: scripts, styles, and their source maps. */
export function isArtifact(path: string): boolean {
  return SCRIPT.test(path) || STYLE.test(path) || MAP.test(path)
}

/**
 * Every original source a source map records, for both a flat map and an index map (`sections`,
 * which Turbopack emits). Relative sources are resolved against the map's own location (and its
 * `sourceRoot`), so a path fragment matches however deep the chunk sits; URL-style sources such as
 * `turbopack:///[project]/…` are kept as written. Throws when the text is not a source map or its
 * `sources`/`sections` are missing or malformed, so a corrupt map can never pass as an empty one.
 * An empty `sources` list stays valid: Turbopack emits one for loader stubs that bundle no module.
 */
export function sourcesOf(text: string, file: string): readonly string[] {
  const map: unknown = JSON.parse(text)
  if (!isRecord(map) || map.version !== 3) {
    throw new Error(`${file} is not a version 3 source map`)
  }
  const recorded = collectSources(map, file)
  const base = posix.dirname(toPosix(file))
  return recorded.map(({ root, source }) => {
    const path = toPosix(source)
    return URL_SCHEME.test(path) ? path : posix.resolve(base, toPosix(root), path)
  })
}

/**
 * Check `artifacts` against `rule`: every source map (as a file or inline) for forbidden sources,
 * every script and stylesheet for markers, and the union of all map sources for the expected ones.
 */
export function scanArtifacts(artifacts: readonly Artifact[], rule: ExclusionRule): ScanResult {
  const paths = new Set(artifacts.map((artifact) => artifact.path))
  const leaks: Leak[] = []
  const unmapped: string[] = []
  const seen = new Set<string>()

  const allowUnmapped = rule.allowUnmapped.map(globPattern)
  const checkSources = (sources: readonly string[], file: string): void => {
    for (const source of sources) {
      seen.add(source)
      if (rule.forbiddenSources.some((path) => isSourceUnder(source, path))) {
        leaks.push({ kind: "source", file, source })
      }
    }
  }

  for (const { path, text } of artifacts) {
    if (MAP.test(path)) {
      checkSources(sourcesOf(text, path), path)
      continue
    }
    const marker = rule.markers.find((candidate) => text.includes(candidate))
    if (marker !== undefined) leaks.push({ kind: "marker", file: path, marker })
    if (!SCRIPT.test(path)) continue

    const url = [...text.matchAll(MAP_URL)].at(-1)?.[1]
    const inline = url?.match(DATA_URL)?.[1]
    if (inline !== undefined) {
      checkSources(sourcesOf(Buffer.from(inline, "base64").toString("utf8"), path), path)
    } else if (
      !paths.has(url === undefined ? `${path}.map` : join(dirname(path), decodeUrl(url)))
    ) {
      if (allowUnmapped.some((pattern) => pattern.test(toPosix(path)))) unmapped.push(path)
      else leaks.push({ kind: "unmapped", file: path })
    }
  }

  for (const path of rule.expectedSources) {
    if (![...seen].some((source) => isSourceUnder(source, path))) {
      leaks.push({ kind: "blind", path })
    }
  }
  return { leaks, unmapped }
}

/**
 * Whether a recorded `source` is the absolute `path`: inside it when `path` is a directory (ends in
 * `/`), or exactly it when `path` is a file. A Turbopack source (`turbopack:///[project]/…`) is
 * relative to a project root the map does not name; that root is the app or one of its ancestors,
 * so the source matches when some ancestor of `path` completes it.
 */
export function isSourceUnder(source: string, path: string): boolean {
  const relative = source.match(PROJECT_SOURCE)?.[1]
  if (relative === undefined) return isAt(source, path)
  let root = path.endsWith("/") ? path.slice(0, -1) : path
  while (root !== "") {
    root = root.slice(0, root.lastIndexOf("/"))
    if (isAt(`${root}/${relative}`, path)) return true
  }
  return false
}

function isAt(candidate: string, path: string): boolean {
  return path.endsWith("/") ? candidate.startsWith(path) : candidate === path
}

/** A readable one-line description of `leak`. */
export function describeLeak(leak: Leak): string {
  switch (leak.kind) {
    case "source":
      return `${leak.file} bundles ${leak.source}`
    case "marker":
      return `${leak.file} contains "${leak.marker}"`
    case "unmapped":
      return `${leak.file} has no source map, so the scan cannot see what it bundles; enable its map or, for a bundler runtime, manifest, or prebuilt polyfill, add it to "allowUnmapped"`
    case "blind":
      return `no source map records a source under ${leak.path}, so the scan cannot see the app's modules`
  }
}

interface RecordedSource {
  readonly root: string
  readonly source: string
}

function collectSources(map: Record<string, unknown>, file: string): RecordedSource[] {
  const root = typeof map.sourceRoot === "string" ? map.sourceRoot : ""
  const { sources = [], sections = [] } = map
  const valid =
    ("sources" in map || "sections" in map) &&
    Array.isArray(sources) &&
    sources.every(isSourceEntry) &&
    Array.isArray(sections) &&
    sections.every(isSection)
  if (!valid) throw new Error(`${file} has no valid "sources" or "sections"`)
  const own = sources.filter(isString).map((source) => ({ root, source }))
  return [...own, ...sections.flatMap((section) => collectSources(section.map, file))]
}

// The spec allows `null` for a source the map cannot name.
function isSourceEntry(entry: unknown): entry is string | null {
  return entry === null || typeof entry === "string"
}

function isSection(section: unknown): section is { readonly map: Record<string, unknown> } {
  return isRecord(section) && isRecord(section.map)
}

// Bundlers percent-encode the map name when the chunk name has URL-reserved characters (Turbopack's
// `[root-of-the-server]__…`), so the comment must be decoded before it matches a file on disk.
function decodeUrl(url: string): string {
  try {
    return decodeURIComponent(url)
  } catch {
    return url
  }
}

// `**/` matches zero or more whole segments, `**` anything, `*` anything within one segment; every
// other character is literal, so Next's `[...path]` folders need no escaping.
function globPattern(glob: string): RegExp {
  const parts = toPosix(glob).split(/(\*\*\/|\*\*|\*)/)
  const body = parts
    .map((part) => {
      if (part === "**/") return "(?:.*/)?"
      if (part === "**") return ".*"
      if (part === "*") return "[^/]*"
      return part.replaceAll(/[.+?^${}()|[\]\\]/g, "\\$&")
    })
    .join("")
  return new RegExp(`^${body}$`)
}

function toPosix(path: string): string {
  return path.replaceAll("\\", "/")
}

function isString(value: unknown): value is string {
  return typeof value === "string"
}
