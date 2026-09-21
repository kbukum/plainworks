// Ambient host declarations for the Vite app. CSS side-effect imports carry no type surface, and
// the development flag is the only build-time environment value the client consumes.
declare module "*.css"

interface ImportMetaEnv {
  readonly DEV: boolean
}

interface ImportMeta {
  readonly env: ImportMetaEnv
}
