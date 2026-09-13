import { diffReport, ingestAtom, validateRegistry } from "./pipeline.mjs"
import { packageRoot, runCodegen } from "./manifest.mjs"

// Process entrypoint for the registry pipeline: argv parsing, stdout/stderr, and exit codes only.
// The offline logic it drives (ingest / diff / validate / codegen) lives in `pipeline.mjs` and
// `manifest.mjs`, where the tests measure it; this thin glue is coverage-excluded like a `bin`.

const RECONCILE = [
  "Owned atoms written. Now:",
  "  1. add any `isolatedDeclarations` return-type annotations the atoms need,",
  "  2. run `bun run --filter @plainworks/elements typecheck` and the package gates,",
  "  3. review the git diff — the `use client` directive and the `@plainworks/theme` cn import are",
  "     the expected compat delta, everything else is a real upstream change to reconcile.",
].join("\n")

function requireNames(command, names) {
  if (names.length === 0) throw new Error(`${command} requires at least one atom name.`)
}

function runIngest(command, names) {
  requireNames(command, names)
  for (const name of names) ingestAtom(packageRoot, name)
  runCodegen(packageRoot)
  process.stdout.write(`${RECONCILE}\n`)
}

function runDiff(names) {
  requireNames("diff", names)
  process.stdout.write(diffReport(packageRoot, names))
}

function runValidate() {
  const failures = validateRegistry(packageRoot)
  if (failures.length > 0) {
    process.stderr.write(`registry.json is invalid:\n${failures.join("\n")}\n`)
    process.exit(1)
  }
  process.stdout.write("registry.json is valid; every declared atom file exists.\n")
}

function main() {
  const [command = "validate", ...names] = process.argv.slice(2)
  if (command === "add" || command === "update") {
    runIngest(command, names)
  } else if (command === "diff") {
    runDiff(names)
  } else if (command === "validate") {
    runValidate()
  } else if (command === "codegen") {
    const generated = runCodegen(packageRoot)
    process.stdout.write(
      `Regenerated registry.json, exports, entries, and the manifest (${generated.length} atoms).\n`,
    )
  } else {
    throw new Error(`Unknown registry command: ${command}`)
  }
}

if (process.argv[1] && import.meta.url === new URL(`file://${process.argv[1]}`).href) {
  main()
}
