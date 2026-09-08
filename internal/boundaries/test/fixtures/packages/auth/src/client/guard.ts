"use client"
// Fixture: an auth client-graph module that illegally reaches into the server-only custody graph.
// This edge must trip `no-client-into-auth-server` — token custody can never enter a client bundle.
import { signWithSecret } from "../server/hmac-signer"

export function useToken(message: string): string {
  return signWithSecret(message)
}
