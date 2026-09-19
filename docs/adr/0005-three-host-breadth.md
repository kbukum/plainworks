# 0005 — Host breadth is three references, delivered one per plan

**Status:** Accepted · **Date:** 2026-09-19

## Context

"Host-independent" is only credible if more than one host actually runs the kit. Proving every framework at once is unbounded work, but proving only one leaves the neutral/client seam untested against real host variance.

## Decision

The reference host breadth is **three**: a Next.js RSC app, a TanStack Start app, and a Vite SPA. These span the meaningful axes — server components, a full-stack router, and a pure client SPA — so the neutral `.` and client `./client` seams are exercised against genuinely different runtimes.

Breadth is delivered incrementally, one host per plan rather than all at once. The Vite SPA (`apps/showcase`) exists; this plan adds the Next.js RSC host (`apps/next-host`) with cross-host CI smoke. React Native, Remix, and Astro remain open follow-ons, added only when a plan proves them.

## Consequences

- Two shipped hosts already prove the neutral/client split against different runtimes, backed by cross-host CI.
- The claim grows as hosts land, without blocking a release on proving every framework.
- A new host is a new app plus a CI smoke lane, never a change to a package's public surface.
