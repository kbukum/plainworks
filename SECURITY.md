# Security Policy

## Supported Versions

plainworks is pre-1.0. Only the latest published `0.x` line receives security fixes.

| Version | Supported |
|---------|-----------|
| latest `0.x` | :white_check_mark: |
| older `0.x`  | :x: |

## Reporting a Vulnerability

If you discover a security vulnerability in plainworks, please report it **privately** via [GitHub Security Advisories](https://github.com/kbukum/plainworks/security/advisories/new) — this opens a private thread visible only to maintainers.

Do **not** open a public issue for security reports.

### What to include

- A clear description of the issue and its potential impact.
- Steps to reproduce, with a minimal proof-of-concept if possible.
- The affected package(s) and version(s).
- Your runtime: `node --version` / `bun --version`, TypeScript version, and where it runs (server / browser).
- Any suggested mitigation or fix.

### Response targets

| Step | Target |
|------|--------|
| Acknowledgment | 48 hours |
| Triage & severity | 5 business days |
| Fix available | 30 days (critical), 90 days (high/medium) |
| Public disclosure | 90 days after report, coordinated with the reporter |

We follow [coordinated disclosure](https://en.wikipedia.org/wiki/Coordinated_vulnerability_disclosure). A confirmed vulnerability in a released version gets a CVE via GitHub Security Advisories, and you'll be credited in the advisory and release notes unless you prefer to remain anonymous.

## Security Best Practices for Users

plainworks runs in browsers and on servers, so most of its security surface is authentication and transport. When building on it:

- **Auth flows:** use Authorization Code + **PKCE (S256)** — never the implicit flow. Rotate refresh tokens.
- **Token storage:** keep access tokens **in memory** (SPA) or behind a BFF with `__Host-` cookies set `Secure` + `HttpOnly` + `SameSite=Strict`. **Never** put tokens in `localStorage`/`sessionStorage`, and never accept a token from a query string — headers (or the `__Host-` cookie) only.
- **Transport:** always use TLS for connection/streaming transports; never disable certificate verification in production.
- **Secrets:** never commit secrets — use environment variables or a secret manager, and ship only `.env.example`. Client bundles must never embed a client secret.
- **Untrusted input:** validate at the boundary. Treat anything crossing a trust boundary (network responses, redirect targets, message payloads) as untrusted before it reaches another system.
- **Dependencies:** keep the root catalog current and run `bun run check-versions`; review advisories on any dependency you add.
- **Typed surfaces:** no `any` in public APIs and typed errors make misuse harder to introduce — see [CONTRIBUTING.md](CONTRIBUTING.md#package-conventions).

## Supply Chain

- **Actions pinned by SHA.** Every `uses:` in [`.github/workflows/`](.github/workflows/) is pinned to a full commit SHA (with a version comment), never a moving tag.
- **Dependabot** keeps GitHub Actions current (see [`.github/dependabot.yml`](.github/dependabot.yml)). Runtime dependencies are managed through a **single Bun catalog** in the root `package.json`, enforced by Sherif + Syncpack (`bun run check-versions`); `catalog:` is a dev-time protocol and is rewritten to concrete versions at publish time by `bun publish`.
- **Lockfile.** `bun.lock` is committed; CI installs with `--frozen-lockfile`, so a dependency change without a matching lockfile update fails.
- **Releases.** Versioning `@plainworks/*` goes through [Changesets](https://github.com/changesets/changesets); publishing to npm is a maintainer-run local step via `bun publish` (see the `release` skill). Release preparation and publishing are maintainer-only tasks.
