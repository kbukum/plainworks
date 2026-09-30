import { type PackageBuild, preset } from "@plainworks/tsdown-config"

// `index` is the prelude (the auth runtime and its typed error). Every other neutral entry is one
// concern module, published as its own subpath (`@plainworks/auth/session`), so the import path
// names the concern. `server` is the token-custody entry, `client` the React bindings, and
// `form-post` the browser navigator adapter.
export const build: PackageBuild = {
  entry: {
    index: "src/index.ts",
    adapter: "src/adapter/index.ts",
    authz: "src/authz/index.ts",
    crypto: "src/crypto/index.ts",
    csrf: "src/csrf/index.ts",
    redirect: "src/redirect/index.ts",
    session: "src/session/index.ts",
    "session-store": "src/session-store/index.ts",
    signer: "src/signer/index.ts",
    server: "src/server.ts",
    client: "src/client.ts",
    "form-post": "src/adapters/form-post.ts",
  },
}

export default preset(build)
