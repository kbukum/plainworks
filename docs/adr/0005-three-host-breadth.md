# 0005 — Host breadth is three references, delivered one host at a time

**Status:** Accepted · **Date:** 2026-09-19

## Context

"Host-independent" is only credible if more than one host actually runs the kit. Proving every framework at once is unbounded work, but proving only one leaves the neutral/client seam untested against real host variance.

## Decision

The reference host breadth is **three**: a Next.js RSC app, a TanStack Start app, and a Vite SSR host. These span the meaningful axes — server components, a full-stack router, and a Vite server-rendered app that hydrates on the client — so the neutral `.` and client `./client` seams are exercised against genuinely different runtimes.

Breadth is delivered incrementally, one host at a time rather than all at once. The Vite SSR host (`apps/showcase`) and Next.js RSC host (`apps/next-host`) exist with cross-host CI smoke. TanStack Start remains the third accepted reference before the full breadth claim is complete; React Native, Remix, and Astro remain open follow-ons.

## Consequences

- Two shipped hosts already prove the neutral/client split against different runtimes, backed by cross-host CI.
- The claim grows as hosts land, without blocking a release on proving every framework.
- A new host is a new app plus a CI smoke lane, never a change to a package's public surface.
