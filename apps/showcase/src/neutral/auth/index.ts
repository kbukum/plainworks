// Re-export-only barrel for the showcase's host-neutral auth: the session cookie codec, the BFF
// config, and the identity policy.
export { hasName } from "./identity-policy"
export {
  createShowcaseAuth,
  type ReadShowcaseSession,
  type ShowcaseAuth,
  type ShowcaseSessionValue,
  showcaseSessionCodec,
  showcaseSessionReader,
} from "./session"
