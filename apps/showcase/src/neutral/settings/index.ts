// Re-export-only barrel for the host-neutral Settings domain: shape guards, reads, writes, and
// authorization.
export { createSettingsMutationAuthorizer, createSettingsReadAuthorizer } from "./authz"
export { settingsQueryPlan } from "./read"
export { updateSettings } from "./write"
