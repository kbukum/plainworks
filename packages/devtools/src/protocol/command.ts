import { err, ok, type Result } from "@plainworks/std"
import { isJson, type Json } from "../privacy"
import { ProtocolError } from "./error"

/**
 * How dangerous running a command is. The client uses it to separate read-only actions from ones
 * that change state, and to gate destructive actions behind confirmation. Observation is read-only
 * by default: a source exposes a mutating or destructive command only by opting in explicitly.
 */
export type CommandRisk = "safe" | "mutating" | "destructive"

/**
 * Advertises a command a source can run. It is pure metadata — the protocol never carries an
 * executable callback, only this descriptor and, at call time, a serializable input. `available`
 * lets a source disable a command without withdrawing it from the UI.
 */
export interface CommandDescriptor {
  readonly id: string
  readonly label: string
  readonly risk: CommandRisk
  readonly available: boolean
}

/**
 * Validate a command input received from the client before it reaches a source. Absent input
 * normalizes to `null`; anything not strictly serializable is refused with a typed error rather
 * than neutralized, because running a command with a rewritten argument would be wrong.
 */
export function parseCommandInput(input: unknown): Result<Json, ProtocolError> {
  if (input === undefined) return ok(null)
  if (!isJson(input)) {
    return err(
      new ProtocolError(
        "devtools/command-input-unsupported",
        "Command input must be serializable and acyclic.",
        { cause: input },
      ),
    )
  }
  return ok(input)
}
