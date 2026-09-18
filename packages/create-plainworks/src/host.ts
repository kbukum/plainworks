// The single source of truth for supported host templates in `create-plainworks`. Adding a host
// template is a single entry here plus its source app under `apps/` — the CLI option validation,
// prompt choices, and eject pipeline all derive from this registry, so the CLI is parametric.

/** Standalone tsconfig structure for an ejected project. */
export interface StandaloneTsconfig {
  readonly compilerOptions: {
    readonly target?: string
    readonly lib?: readonly string[]
    readonly module?: string
    readonly moduleResolution?: string
    readonly moduleDetection?: string
    readonly jsx?: string
    readonly types?: readonly string[]
    readonly plugins?: readonly { readonly name: string }[]
    readonly [key: string]: unknown
  }
  readonly include?: readonly string[]
  readonly exclude?: readonly string[]
  readonly [key: string]: unknown
}

/** Metadata describing one ejectable host template. */
export interface HostDefinition {
  /** The source app folder under `apps/` in the monorepo. */
  readonly sourceApp: string
  /** A human-readable description of this host. */
  readonly description: string
  /** Description placed in the generated package.json. */
  readonly templateDescription: string
  /** Standalone tsconfig written into the generated app. */
  readonly tsconfig: StandaloneTsconfig
  /** Generate the standalone starter README for the scaffolded project. */
  readonly renderReadme?: (projectName: string) => string
}

/** Standalone tsconfig written into an ejected Next.js project. */
export const NEXT_STANDALONE_TSCONFIG: StandaloneTsconfig = {
  compilerOptions: {
    target: "ES2023",
    lib: ["ES2023", "DOM", "DOM.Iterable"],
    module: "ESNext",
    moduleResolution: "bundler",
    moduleDetection: "force",
    jsx: "preserve",
    types: ["node"],
    plugins: [{ name: "next" }],
    allowJs: true,
    resolveJsonModule: true,
    isolatedModules: true,
    esModuleInterop: true,
    incremental: true,
    noEmit: true,
    strict: true,
    noUncheckedIndexedAccess: true,
    skipLibCheck: true,
    forceConsistentCasingInFileNames: true,
  },
  include: ["src", "next-env.d.ts", "next.config.ts", ".next/types/**/*.ts"],
  exclude: ["node_modules"],
}

/** Description written into the ejected Next starter's package.json. */
export const NEXT_TEMPLATE_DESCRIPTION =
  "A Next.js App Router / RSC app assembled from the plainworks kit — composition kernel, theme, query, channel, state, ui, and auth — over a local mock backend built on @plainworks/mocks."

/** Render a clean, standalone README for the ejected Next starter. */
export function renderNextStarterReadme(projectName: string): string {
  return `# ${projectName}

A starter application assembled from the **plainworks** kit:
composition kernel, theme, query, channel, state, ui, and auth over a local mock backend built on \`@plainworks/mocks\`.

## Getting started

\`\`\`bash
bun install      # or npm install / pnpm install
bun run dev      # or npm run dev
\`\`\`

Open [http://localhost:3000](http://localhost:3000) to see the app.

The app starts on the public overview (\`/\`). Signing in routes through the bundled in-process mock identity provider, which approves immediately without external dependencies, landing you authenticated on the gated pages (\`/tasks\`, \`/account\`).

## Scripts

- \`dev\` — Start the local development server with the mock backend
- \`build\` — Build the production application
- \`start\` — Start the production server

## Configuration

| Variable | Purpose |
|---|---|
| \`APP_ORIGIN\` (or \`AUTH_REDIRECT_ORIGIN\`) | The absolute origin the app is served on. Backs the \`/api/*\` base URL and the OIDC redirect URI. Defaults to \`http://localhost:3000\`. |
| \`SESSION_SIGNING_KEY\` | The HMAC key (32 bytes or more) for the identity-only session cookie. Unset, a random key is minted at startup. |

## Moving to production

The mock backend (\`src/app/api/[...path]/route.ts\`) and mock identity provider (\`src/server/identity-provider.ts\`) are single-process dev adapters for local development and testing. For production:
1. Replace \`/api/[...path]\` route handlers with calls to your real backend origin.
2. Point authentication to an external OIDC issuer.
3. Configure \`SESSION_SIGNING_KEY\` with a secure random secret across instances.
`
}

export type SupportedHostRegistry = {
  readonly next: HostDefinition & {
    readonly sourceApp: "next-host"
    readonly description: string
    readonly templateDescription: string
    readonly tsconfig: StandaloneTsconfig
    readonly renderReadme: (projectName: string) => string
  }
}

/**
 * The supported host templates. Adding a host is a single entry here plus its source app under
 * `apps/` — the CLI flags, prompt choices, and eject pipeline all derive from this registry.
 */
export const HOST_REGISTRY: SupportedHostRegistry = {
  next: {
    sourceApp: "next-host",
    description: "Next.js App Router / RSC app with BFF auth and mock backend",
    templateDescription: NEXT_TEMPLATE_DESCRIPTION,
    tsconfig: NEXT_STANDALONE_TSCONFIG,
    renderReadme: renderNextStarterReadme,
  },
} as const satisfies Record<string, HostDefinition>

/** Host template identifier. Derived from {@link HOST_REGISTRY}. */
export type HostId = keyof typeof HOST_REGISTRY

/** Every supported host identifier. Derived from {@link HOST_REGISTRY}. */
export const HOSTS: readonly HostId[] = Object.keys(HOST_REGISTRY) as readonly HostId[]

/** The default host template when none is specified. */
export const DEFAULT_HOST: HostId = "next"

/** Mapping of host identifier to its source app under `apps/`. Derived from {@link HOST_REGISTRY}. */
export const EXAMPLE_SOURCE_APPS: Record<HostId, string> = Object.fromEntries(
  Object.entries(HOST_REGISTRY).map(([id, def]) => [id, def.sourceApp]),
) as Record<HostId, string>
