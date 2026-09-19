import { NEXT_TEMPLATE_DESCRIPTION } from "../host"
import type { DependencyMap, PackageManifest } from "../scaffold/manifest"

// The manifest half of the eject transform: turn the source app's `package.json` into the lean
// starter template a generated project begins from. The source app is gated like any workspace
// member, so it carries a test script and the test toolchain in `devDependencies`; the ejected
// starter is the minimal wired spine a user grows, not the app's own gate, so eject drops the test
// wiring. Dependency *ranges* are left as `workspace:`/`catalog:` here and pinned to concrete
// versions later by the runtime rewrite (`scaffold/manifest.ts`), so this transform never has to
// know the shipped versions.

/** The default project name a generated manifest carries until the CLI substitutes the real one. */
export const DEFAULT_TEMPLATE_NAME = "plainworks-app"

/** The default description written into the ejected Next starter's `package.json`. */
export const TEMPLATE_DESCRIPTION: string = NEXT_TEMPLATE_DESCRIPTION

// The test-only `devDependencies` eject strips: the starter ships no test suite, so the test
// runner, DOM environment, and accessibility/testing-library toolchain are not part of a generated
// project.
const TEST_ONLY_DEV_DEPENDENCIES = new Set([
  "@testing-library/dom",
  "@testing-library/react",
  "@testing-library/user-event",
  "axe-core",
  "jsdom",
  "msw",
  "vitest",
])

// The `package.json` scripts eject strips — the starter ships no test suite, so `test` has no
// runner.
const DROPPED_SCRIPTS = new Set(["test"])

/** Drop the keys in `remove` from a string map, preserving the rest in order. */
function omit(map: Record<string, string>, remove: ReadonlySet<string>): Record<string, string> {
  const kept: Record<string, string> = {}
  for (const [key, value] of Object.entries(map)) {
    if (!remove.has(key)) kept[key] = value
  }
  return kept
}

/**
 * Produce the ejected starter `package.json` from the source app manifest: the standalone name and
 * description, the test script dropped, and the test-only `devDependencies` removed. Dependency
 * ranges are preserved verbatim for the runtime version rewrite to pin. The input is not mutated.
 */
export function toTemplateManifest(
  appManifest: PackageManifest,
  description: string = TEMPLATE_DESCRIPTION,
): PackageManifest {
  const template: PackageManifest = {
    ...appManifest,
    name: DEFAULT_TEMPLATE_NAME,
    version: "0.0.0",
    description,
  }
  if (isStringMap(appManifest.scripts)) {
    template.scripts = omit(appManifest.scripts, DROPPED_SCRIPTS)
  }
  if (appManifest.devDependencies !== undefined) {
    template.devDependencies = omit(appManifest.devDependencies, TEST_ONLY_DEV_DEPENDENCIES)
  }
  return template
}

/** Narrow an unknown `package.json` field to a string map (a scripts/deps section). */
function isStringMap(value: unknown): value is DependencyMap {
  return (
    typeof value === "object" &&
    value !== null &&
    Object.values(value).every((entry) => typeof entry === "string")
  )
}
