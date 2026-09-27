import { readFileSync } from "node:fs"

// Narrowing helpers for the JSON the registry pipeline reads off disk (package.json, registry.json,
// the lock, and the shadcn CLI's own manifest). JSON parses to `unknown`; callers narrow it here
// rather than trusting an inferred `any`.

/** Parse the file at `path` as JSON into an `unknown` the caller narrows. */
export function readJson(path: string): unknown {
  return JSON.parse(readFileSync(path, "utf8"))
}

/** True when `value` is a plain JSON object (not null, not an array). */
export function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value)
}
