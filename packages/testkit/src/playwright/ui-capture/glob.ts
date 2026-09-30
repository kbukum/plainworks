/**
 * Compile a repository glob into an anchored `RegExp`. `*` matches within one path segment, and
 * `**` as a whole segment matches any number of segments, so `a/**` is everything below `a`. `?`
 * matches one character other than `/`, and `{x,y}` either alternative. Every other character is
 * literal.
 */
export function compileGlob(pattern: string): RegExp {
  let source = ""
  let group = 0
  for (let at = 0; at < pattern.length; at++) {
    const char = pattern[at]
    if (char === "*" && pattern[at + 1] === "*") {
      const leading = at === 0 || pattern[at - 1] === "/"
      const trailing = pattern[at + 2] === undefined || pattern[at + 2] === "/"
      if (leading && trailing) {
        // `**/` is zero or more whole segments; a final `**` is everything below.
        source += pattern[at + 2] === "/" ? "(?:[^/]*/)*" : ".*"
        at += pattern[at + 2] === "/" ? 2 : 1
        continue
      }
      source += "[^/]*"
      at += 1
    } else if (char === "*") source += "[^/]*"
    else if (char === "?") source += "[^/]"
    else if (char === "{") {
      group++
      source += "(?:"
    } else if (char === "}" && group > 0) {
      group--
      source += ")"
    } else if (char === "," && group > 0) source += "|"
    else source += (char ?? "").replace(/[.+^$()|[\]\\{}]/g, "\\$&")
  }
  return new RegExp(`^${source}$`)
}
