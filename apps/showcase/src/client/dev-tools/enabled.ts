/** The Web Storage key that turns the development inspector off for one browser profile. */
export const SHOWCASE_DEVTOOLS_KEY = "showcase-devtools"

/**
 * Whether to start the development inspector. A browser profile turns it off by storing `off`
 * under {@link SHOWCASE_DEVTOOLS_KEY}. The flow suite does this, because it reviews the product
 * and the inspector's live counters would differ on every run. Storage that cannot be read, such
 * as in a privacy mode, leaves the inspector on.
 */
export function devtoolsEnabled(storage: () => Pick<Storage, "getItem">): boolean {
  try {
    return storage().getItem(SHOWCASE_DEVTOOLS_KEY) !== "off"
  } catch {
    return true
  }
}
