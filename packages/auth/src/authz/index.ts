// Re-export-only barrel for the authorization concern: claim rules, allow-list policies, and the
// guard decision.
export type { AuthzGuardConfig, AuthzOutcome } from "./guard"
export { guardDecision } from "./guard"
export type { AllowListPolicyConfig, AllowRule } from "./policy"
export { createAllowListPolicy, requireClaim } from "./policy"
