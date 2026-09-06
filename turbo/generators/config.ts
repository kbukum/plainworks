import type { PlopTypes } from "@turbo/gen"

/**
 * plainworks package generator.
 *
 * `bun run gen package` stamps an identical, gate-passing package skeleton from the golden
 * template so every package is born under the same build/exports/test/publish policy — the
 * structural guarantee that mislabeled builds, missing `dist`, `catalog:` peers, and coverage
 * leaks cannot recur.
 */
// The naming invariant the generator exists to enforce: one concern, one plain word — these
// junk-drawer names mean the concern isn't named yet (see docs/architecture.md).
const BANNED_NAMES = new Set(["core", "engine", "foundation", "utils"])

export default function generator(plop: PlopTypes.NodePlopAPI): void {
  // Emit a JSON-encoded value (with quotes) so free-text fields land in generated JSON safely.
  // Handlebars' default HTML-escaping would turn `&`, `'`, or `"` in a description into entities
  // like `&amp;`/`&#x27;`; a stray newline would break the JSON. Use `{{{json field}}}` (raw) in
  // JSON templates and raw `{{{field}}}` for Markdown copy.
  plop.setHelper("json", (value: unknown) => JSON.stringify(value))

  plop.setGenerator("package", {
    description: "Scaffold a new @plainworks/* package from the golden template.",
    prompts: [
      {
        type: "input",
        name: "name",
        message: "Package name (without the @plainworks/ scope):",
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
            path: "packages/{{name}}/tsconfig.client.json",
            templateFile: "templates/client-root/tsconfig.client.json.hbs",
          },
        )
      }
      return actions
    },
  })
}
