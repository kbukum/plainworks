// Fixture: a neutral (non-server, non-client) auth module illegally reaching into the server-only
// custody graph. Even off the `"use client"` path this must trip `no-nonserver-into-auth-server`,
// because the only legitimate importer of the signing secret is auth's own server graph.
import { signWithSecret } from "./server/hmac-signer"

export function leak(message: string): string {
  return signWithSecret(message)
}
