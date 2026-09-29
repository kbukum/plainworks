// Re-export-only barrel for the interceptor concern: the request pipeline types and the auth header
// interceptor. No logic here.
export { authHeaderInterceptor } from "./auth"
export type { HttpHandler, HttpInterceptor } from "./handler"
