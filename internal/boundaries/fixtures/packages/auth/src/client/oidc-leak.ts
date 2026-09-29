"use client"
// Fixture: an auth client-graph module that illegally reaches into the OIDC adapter custody graph.
// This edge must trip `no-client-into-auth-oidc` — OAuth stack and tokens can never enter a client bundle.
import { createOidcAdapter } from "../adapter/oidc/adapter"

export function useOidc(): string {
  return createOidcAdapter()
}
