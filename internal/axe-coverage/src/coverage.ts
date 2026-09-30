/** A render test source checked by the axe-coverage gate. */
export interface RenderTestSource {
  readonly path: string
  readonly source: string
}

const DIRECT_AXE_IMPORT = /from\s+["']axe-core["']/u
const RENDER_CALL = /\brender\s*\(/u
// Awaited, so a floating call cannot resolve after the test has already passed.
const AWAITED_AXE = /\bawait\s+expectNoAxeViolations\s*\(/u

/**
 * Find render test files that skip the shared axe assertion or import `axe-core` directly.
 *
 * The check is per file, matching the baseline that each component's tests run axe: a file that
 * renders through `@testing-library/react` must await `expectNoAxeViolations` at least once. Axe is
 * reached only through `@plainworks/testkit/client`, so every package runs the same rule set.
 */
export function findAxeCoverageViolations(files: readonly RenderTestSource[]): readonly string[] {
  const violations: string[] = []
  for (const file of files) {
    if (DIRECT_AXE_IMPORT.test(file.source)) {
      violations.push(`${file.path}: import axe through @plainworks/testkit/client`)
    }
    if (
      file.source.includes("@testing-library/react") &&
      RENDER_CALL.test(file.source) &&
      !AWAITED_AXE.test(file.source)
    ) {
      violations.push(`${file.path}: render test file never awaits an axe assertion`)
    }
  }
  return violations
}
