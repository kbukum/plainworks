import { execFileSync } from "node:child_process"
import { join } from "node:path"
import type { PlopTypes } from "@turbo/gen"

/**
 * plainworks workspace generators.
 *
 * `bun run gen package` stamps a published package and `bun run gen tool` a dev-only internal tool.
 * The templates hold only what a person writes: name, description, dependencies, the build
 * description, and a placeholder module. The last action runs `plainworks-shape sync`, so every
 * derived field (`exports`, `files`, `bin`, scripts, preset dev dependencies) comes from the same
 * profile the `check-shape` gate enforces, and a new workspace is born matching it.
 */
// The naming invariant the generator exists to enforce: one concern, one plain word — these
// junk-drawer names mean the concern isn't named yet (see docs/architecture.md).
const BANNED_NAMES = new Set(["core", "engine", "foundation", "utils"])

/** The name and description prompts every workspace generator asks. */
function namePrompts(kind: "Package" | "Tool"): PlopTypes.PromptQuestion[] {
  return [
    {
      type: "input",
      name: "name",
      message: `${kind} name (without the @plainworks/ scope):`,
      validate: (input: string) => {
        // Strict kebab-case: letter start, alphanumeric segments joined by single hyphens —
        // rejects `foo-`, `foo--bar`, `-foo` alongside uppercase and separators like `_`.
        if (!/^[a-z][a-z0-9]*(?:-[a-z0-9]+)*$/.test(input)) {
          return "Use one lowercase plain word (kebab-case allowed): e.g. 'std', 'connection'."
        }
        // Check each hyphen-delimited segment, not just the whole name: `auth-core` or
        // `shared-utils` smuggle the same junk drawer in past a whole-string check.
        if (input.split("-").some((segment) => BANNED_NAMES.has(segment))) {
          return `'${input}' contains a banned name — one concern, one plain word; no core/engine/foundation/utils.`
        }
        return true
      },
    },
    {
      type: "input",
      name: "description",
      message: "One-line description:",
      // The description lands raw in the generated README; keep it a real single line.
      validate: (input: string) => {
        if (input.trim().length === 0) return "A description is required."
        if (/[\r\n]/.test(input)) return "One line only — no newlines."
        return true
      },
    },
  ]
}

/**
 * Links the new workspace with `bun install`, so the shape tool can load its build description,
 * then derives every profile-owned manifest field with `plainworks-shape sync`.
 */
function syncShapeAction(plop: PlopTypes.NodePlopAPI, dir: string): PlopTypes.ActionType {
  return (answers) => {
    const name: unknown = answers?.name
    if (typeof name !== "string") throw new TypeError("the generator answered no workspace name")
    const repoRoot = join(plop.getPlopfilePath(), "..", "..")
    const workspace = `${dir}/${name}`
    execFileSync("bun", ["install"], { cwd: repoRoot, stdio: "ignore" })
    execFileSync(join(repoRoot, "node_modules", ".bin", "plainworks-shape"), ["sync", workspace], {
      cwd: repoRoot,
    })
    return `synced ${workspace} with its profile`
  }
}

export default function generator(plop: PlopTypes.NodePlopAPI): void {
  // Emit a JSON-encoded value (with quotes) so free-text fields land in generated JSON safely.
  // Handlebars' default HTML-escaping would turn `&`, `'`, or `"` in a description into entities
  // like `&amp;`/`&#x27;`; a stray newline would break the JSON. Use `{{{json field}}}` (raw) in
  // JSON templates and raw `{{{field}}}` for Markdown copy.
  plop.setHelper("json", (value: unknown) => JSON.stringify(value))

  plop.setGenerator("package", {
    description: "Scaffold a published @plainworks/* package from the golden template.",
    prompts: [
      ...namePrompts("Package"),
      {
        type: "confirm",
        name: "hasClient",
        message: 'Add a client ("use client") entry alongside the server-safe entry?',
        default: false,
      },
    ],
    actions: (answers) => {
      const actions: PlopTypes.ActionType[] = [
        {
          type: "addMany",
          destination: "packages/{{name}}",
          base: "templates/package",
          templateFiles: "templates/package/**/*.hbs",
          stripExtensions: ["hbs"],
        },
      ]
      if (answers?.hasClient) {
        actions.push(
          {
            type: "addMany",
            destination: "packages/{{name}}/src",
            base: "templates/client",
            templateFiles: "templates/client/**/*.hbs",
            stripExtensions: ["hbs"],
          },
          {
            type: "add",
            path: "packages/{{name}}/tsconfig.src.json",
            templateFile: "templates/client-root/tsconfig.src.json.hbs",
          },
          {
            type: "add",
            path: "packages/{{name}}/tsconfig.client.json",
            templateFile: "templates/client-root/tsconfig.client.json.hbs",
          },
          {
            type: "add",
            path: "packages/{{name}}/tsconfig.test.json",
            templateFile: "templates/client-root/tsconfig.test.json.hbs",
          },
        )
      }
      actions.push(syncShapeAction(plop, "packages"))
      return actions
    },
  })

  plop.setGenerator("tool", {
    description:
      "Scaffold a dev-only internal tool (src/, colocated tests, a plainworks-<name> bin).",
    prompts: namePrompts("Tool"),
    actions: [
      {
        type: "addMany",
        destination: "internal/{{name}}",
        base: "templates/tool",
        templateFiles: "templates/tool/**/*.hbs",
        stripExtensions: ["hbs"],
      },
      syncShapeAction(plop, "internal"),
    ],
  })
}
