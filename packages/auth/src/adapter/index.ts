export type {
  AuthAdapter,
  AuthAdapterConfig,
  AuthAdapterDeps,
  AuthenticateRequest,
  AuthSession,
  BeginLoginRequest,
  CompleteLoginRequest,
  CustomAdapterConfig,
  InteractiveAuthAdapter,
  LoginRedirect,
} from "./adapter"
export { CUSTOM_ADAPTER_KIND, customAdapter } from "./custom"
export type { OidcAdapterConfig, SessionTokenStore } from "./oidc/config"
// The OIDC config type and kind carry no runtime dependency, so they belong on the neutral `.`
// surface; the OIDC factory and its registration helper stay on `@plainworks/auth/server`.
export {
  OIDC_ADAPTER_KIND,
  validateOidcAdapterConfig,
} from "./oidc/config"
export type { AuthAdapterFactory, AuthRegistry } from "./registry"
export { createAdapterRegistry } from "./registry"
