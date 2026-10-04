import { join } from "node:path"

/** Container-owned private tmpfs, never a retained artifact directory. */
export function privateRoot(): string {
  const root = process.env.SYSTEM_PROOF_PRIVATE
  if (root === undefined || !root.startsWith("/private/")) {
    throw new Error("Run the system proof in its disposable container; private state is required.")
  }
  return root
}

export function privateFile(name: string): string {
  return join(privateRoot(), name)
}
