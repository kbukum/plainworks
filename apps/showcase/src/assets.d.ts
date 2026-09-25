// Ambient host declarations for the Vite app. CSS side-effect imports carry no type surface, and
// the host owns its development flag and HMR teardown.
declare module "*.css"

interface ImportMetaEnv {
  readonly DEV: boolean
}

interface ImportMeta {
  readonly env: ImportMetaEnv
  readonly hot?: import("vite/types/hot").ViteHotContext
}
