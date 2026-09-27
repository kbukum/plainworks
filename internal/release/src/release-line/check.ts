import type { PublishableWorkspace } from "../workspace"
import type { PreState } from "./pre-state"

// `major.minor.patch`, an optional prerelease, and optional build metadata (semver 2.0.0).
const SEMVER =
  /^(?:0|[1-9]\d*)\.(?:0|[1-9]\d*)\.(?:0|[1-9]\d*)(?:-([0-9A-Za-z-]+(?:\.[0-9A-Za-z-]+)*))?(?:\+[0-9A-Za-z-.]+)?$/

/**
 * Lists every way the publishable versions disagree with the Changesets pre-release state. An empty
 * list means `changeset version` stays on the intended line.
 *
 * - Pre mode on: every package must be a `-<tag>.N` prerelease, or it would leave the line.
 * - Pre mode off: no package may be a prerelease, because the next bump would turn it into a stable
 *   version by accident. Graduate on purpose with `changeset pre exit`, which keeps `pre.json` in
 *   `exit` mode until the graduating `changeset version` runs.
 */
export function findReleaseLineProblems(
  pre: PreState | undefined,
  workspaces: readonly PublishableWorkspace[],
): string[] {
  const problems: string[] = []
  for (const { name, version } of workspaces) {
    const match = SEMVER.exec(version)
    if (match === null) {
      problems.push(`${name} has an invalid version: ${version}.`)
      continue
    }
    const prerelease = match[1]
    if (pre === undefined) {
      if (prerelease !== undefined) {
        problems.push(
          `${name} is ${version}, but pre mode is off, so the next \`changeset version\` would ` +
            `publish a stable version. Run \`changeset pre enter ${prereleaseTag(prerelease)}\`, ` +
            "or `changeset pre exit` to graduate.",
        )
      }
    } else if (pre.mode === "pre" && !isOnTag(prerelease, pre.tag)) {
      problems.push(
        `${name} is ${version}, but pre mode is on the ${pre.tag} line. ` +
          `Set it to a -${pre.tag}.N version.`,
      )
    }
  }
  return problems
}

function prereleaseTag(prerelease: string): string {
  return prerelease.split(".")[0] ?? prerelease
}

function isOnTag(prerelease: string | undefined, tag: string): boolean {
  return prerelease !== undefined && new RegExp(`^${escapeRegExp(tag)}\\.\\d+$`).test(prerelease)
}

function escapeRegExp(text: string): string {
  return text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")
}
