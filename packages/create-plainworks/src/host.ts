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

The app starts on the public overview (\`/\`). **Demo sign-in** routes through the bundled in-process mock identity provider, which approves immediately without external dependencies, landing you authenticated on the gated pages (\`/tasks\`, \`/account\`). First development use initializes private local SQLite custody automatically; ordinary restarts retain unexpired sessions.

## Scripts

- \`dev\` — Start the local development server with the mock backend
- \`build\` — Build the production application
- \`start\` — Start the production server

## Configuration

| Variable | Purpose |
|---|---|
| \`APP_ORIGIN\` (or \`AUTH_REDIRECT_ORIGIN\`) | The absolute origin the app is served on. Backs the \`/api/*\` base URL and the OIDC redirect URI. Defaults to \`http://localhost:3000\`. |
| \`SESSION_ROOT_KEY\` | Canonical base64url encoding of exactly 32 random bytes. Required in production. Development creates a private local root key once if omitted. Encryption and transaction/CSRF keys are derived separately. |
| \`PLAINWORKS_DATA_DIR\` | Private local state directory; defaults to \`.private/auth\`. Keep it on a writable local volume. |
| \`PLAINWORKS_DEMO_AUTH\` | Set to \`1\` to explicitly enable bundled demo sign-in with \`next start\`. Not a production identity system. |

The host owns its local custody in \`src/server/custody\`, built on the native \`better-sqlite3\` driver (Node 22.12+). Replace it with any \`OpaqueSessionStore\` and refresh store; \`@plainworks/auth/testing\` has the conformance cases to prove a replacement. The manifest explicitly trusts its install script for Bun. No Go runtime, custom Next server, or identity-provider service is needed. Keep \`.private/\`, its SQLite journals, and keys out of source, copied templates, and package artifacts. Directories use 0700 and files 0600. Missing or mismatched custody keys fail closed rather than silently creating another identity.

## Moving to production

The mock backend (\`src/app/api/[...path]/route.ts\`) and mock identity provider (\`src/server/identity-provider.ts\`) are demo adapters. Authentication is request-local, with encrypted persistent session, refresh, and provider data. For production:
1. Replace \`/api/[...path]\` route handlers with calls to your real backend origin.
2. Point authentication to an external OIDC issuer.
3. Configure \`SESSION_ROOT_KEY\` through your secret manager.
4. For multiple machines, ephemeral serverless, or Edge, replace local SQLite with a suitable shared \`OpaqueSessionStore\` and provider refresh store. Local SQLite supports independent Node processes on one supported local volume, not distributed storage. Browser credentials remain random \`__Host-session\` HttpOnly cookies.

\`GET /auth/session\` returns the published identity, expiry and CSRF proof without renewing cookies. \`POST /auth/logout\` takes \`X-CSRF-Token\` and returns \`204\` after confirmed family revocation. The browser has no token store or refresh protocol. A failed logout tears down local protected work and visibly reports unconfirmed server revocation.
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
