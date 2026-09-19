// The single source of truth for supported host templates in `create-plainworks`. Adding a host
// template is a single entry here plus its source app under `apps/` — the CLI option validation,
// prompt choices, and eject pipeline all derive from this registry, so the CLI is parametric.

/** Metadata describing one ejectable host template. */
export interface HostDefinition {
  /** The source app folder under `apps/` in the monorepo. */
  readonly sourceApp: string
  /** A human-readable description of this host. */
  readonly description: string
}

export type SupportedHostRegistry = {
  readonly next: {
    readonly sourceApp: "next-host"
    readonly description: string
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
