import { type PackageBuild, preset } from "@plainworks/tsdown-config"

// `index` is the typed auth-error prelude. Every other neutral entry is one
// concern module, published as its own subpath (`@plainworks/auth/session`), so the import path
// names the concern. `server` is the token-custody entry, `client` the React bindings,
// `form-post` the browser navigator adapter, and `testing` the custody conformance cases.
export const build: PackageBuild = {
  entry: {
    index: "src/index.ts",
    adapter: "src/adapter/index.ts",
    authz: "src/authz/index.ts",
    crypto: "src/crypto/index.ts",
    csrf: "src/csrf/index.ts",
    redirect: "src/redirect/index.ts",
    session: "src/session/index.ts",
    signer: "src/signer/index.ts",
    server: "src/server.ts",
    client: "src/client.ts",
    "form-post": "src/adapters/form-post.ts",
    testing: "src/testing/index.ts",
  },
}

export default preset(build)
