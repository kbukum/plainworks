// Ambient module declarations for non-TS assets the app imports. A CSS side-effect import carries
// no type surface — it exists only for the bundler — so declaring it keeps `tsc` happy without a
// build-tool dependency in the type graph.
declare module "*.css"
