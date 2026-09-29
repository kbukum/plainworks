import type { WorkspaceFiles } from "@plainworks/workspace"
import { ReleaseToolError } from "../error"

/**
 * The Changesets pre-release state from `.changeset/pre.json`. `pre` is an open pre-release line;
 * `exit` means the next `changeset version` graduates the line to stable versions.
 */
export interface PreState {
  readonly mode: "pre" | "exit"
  readonly tag: string
}

/** Where Changesets keeps the pre-release state, relative to the repo root. */
export const PRE_STATE_PATH = ".changeset/pre.json"

/**
 * Parses the text of `.changeset/pre.json`.
 *
 * @throws {ReleaseToolError} When the file is not JSON or lacks a valid `mode` and `tag`.
 */
export function parsePreState(text: string): PreState {
  let parsed: unknown
  try {
    parsed = JSON.parse(text)
  } catch (cause) {
    throw new ReleaseToolError(`${PRE_STATE_PATH} is not valid JSON`, { cause })
  }
  if (typeof parsed !== "object" || parsed === null) {
    throw new ReleaseToolError(`${PRE_STATE_PATH} is not a JSON object`)
  }
  const mode = "mode" in parsed ? parsed.mode : undefined
  const tag = "tag" in parsed ? parsed.tag : undefined
  if (mode !== "pre" && mode !== "exit") {
    throw new ReleaseToolError(`${PRE_STATE_PATH} has an unknown mode: ${String(mode)}`)
  }
  if (typeof tag !== "string" || tag.length === 0) {
    throw new ReleaseToolError(`${PRE_STATE_PATH} has no tag`)
  }
  return { mode, tag }
}

/** Reads the pre-release state, or `undefined` when pre mode is off. */
export function readPreState(files: WorkspaceFiles): PreState | undefined {
  const text = files.readText(PRE_STATE_PATH)
  return text === undefined ? undefined : parsePreState(text)
}
