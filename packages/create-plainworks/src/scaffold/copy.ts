import { cpSync, readdirSync, renameSync } from "node:fs"
import { basename, join } from "node:path"

// Copy an ejected example tree into the target project directory. The example is already the
// standalone, config-decoupled payload the build-time eject produced; the one marker restored on
// copy is the dotfile: a leading underscore becomes a dot (`_gitignore` -> `.gitignore`), because
// npm silently drops a real `.gitignore` from a published tarball. Build/tooling output an example
// should never carry is skipped defensively.

/** Directory names never copied into a generated project. */
const SKIP_DIRECTORIES = new Set(["node_modules", "dist", "coverage", ".turbo", ".next"])

/**
 * Restore an example filename to its generated form: a leading `_` becomes a dot (`_gitignore` ->
 * `.gitignore`).
 */
export function targetName(name: string): string {
  return name.startsWith("_") ? `.${name.slice(1)}` : name
}

/**
 * Recursively copy `from` into `to`, restoring underscore-prefixed dotfiles and skipping build
 * output. `to` is created if absent. Existing files are overwritten, so a later manifest rewrite
 * can replace the copied `package.json`.
 */
export function copyTemplate(from: string, to: string): void {
  cpSync(from, to, {
    recursive: true,
    filter: (source) => !SKIP_DIRECTORIES.has(basename(source)),
  })
  renameDotfiles(to)
}

/** Rename any underscore-marked dotfile copied above to its generated form, depth-first. */
function renameDotfiles(dir: string): void {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const current = join(dir, entry.name)
    if (entry.isDirectory()) {
      renameDotfiles(current)
      continue
    }
    const renamed = targetName(entry.name)
    if (renamed !== entry.name) {
      renameSync(current, join(dir, renamed))
    }
  }
}
