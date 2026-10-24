// Public entry for `@plainworks/vite` — re-export-only barrel. A build-tool package: it runs in
// Node inside Vite or Vitest, never in an app's runtime graph.
export {
  type KitCheckout,
  type KitPackage,
  kitSingletons,
  type PlainworksSourceOptions,
  plainworksSource,
  readKitCheckout,
  resolveKitImport,
  type SingletonOptions,
  SOURCE_CONDITION,
  SourceLinkError,
  type SourceLinkErrorKind,
} from "./source"
