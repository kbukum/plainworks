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
export { apiKeyAdapter } from "./apikey/adapter"
export type { ApiKeyAdapterConfig, ApiKeyVerifier } from "./apikey/config"
export { APIKEY_ADAPTER_KIND, validateApiKeyAdapterConfig } from "./apikey/config"
export { registerApiKeyAdapter } from "./apikey/register"
export { CUSTOM_ADAPTER_KIND, customAdapter } from "./custom"
export { jwtAdapter } from "./jwt/adapter"
export type { JwtAdapterConfig } from "./jwt/config"
export { JWT_ADAPTER_KIND, validateJwtAdapterConfig } from "./jwt/config"
export { registerJwtAdapter } from "./jwt/register"
export type { JwtVerifier, JwtVerifierConfig, VerifiedClaims } from "./jwt/verify"
export { createJwtVerifier } from "./jwt/verify"
export type { OidcAdapterConfig } from "./oidc/config"
// The OIDC config type and kind carry no runtime dependency, so they belong on the neutral `.`
// surface; the OIDC factory and its registration helper stay on `@plainworks/auth/server`.
export {
  OIDC_ADAPTER_KIND,
  validateOidcAdapterConfig,
} from "./oidc/config"
export type { AuthAdapterFactory, AuthRegistry } from "./registry"
export { createAdapterRegistry } from "./registry"
