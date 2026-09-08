export type {
  AuthAdapter,
  AuthAdapterConfig,
  AuthAdapterDeps,
  AuthenticateRequest,
  AuthSession,
  BeginLoginRequest,
  CompleteLoginRequest,
  CustomAdapterConfig,
  LoginRedirect,
} from "./adapter"
export { CUSTOM_ADAPTER_KIND, customAdapter } from "./custom"
export type { AuthAdapterFactory, AuthRegistry } from "./registry"
export { createAdapterRegistry } from "./registry"
