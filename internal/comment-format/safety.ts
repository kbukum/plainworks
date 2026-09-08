import ts from "typescript"

/**
 * The significant (non-comment) token stream of a source file, via the parser so template literals
 * and JSX scan correctly. Comments are trivia and JSDoc is skipped, so only real code contributes —
 * any change to a leaf token's text means code bytes moved. This is the load-bearing safety oracle:
 * reflowing comments must leave this stream byte-identical.
 */
export function codeTokens(path: string, text: string): string[] {
  const kind = path.endsWith(".tsx") ? ts.ScriptKind.TSX : ts.ScriptKind.TS
  const sf = ts.createSourceFile(path, text, ts.ScriptTarget.Latest, true, kind)
  const tokens: string[] = []
  const visit = (node: ts.Node): void => {
    if (node.kind >= ts.SyntaxKind.FirstJSDocNode && node.kind <= ts.SyntaxKind.LastJSDocNode)
      return
    const children = node.getChildren(sf)
    if (children.length === 0) {
      if (node.kind !== ts.SyntaxKind.EndOfFileToken)
        tokens.push(`${node.kind}:${node.getText(sf)}`)
      return
    }
    for (const child of children) visit(child)
  }
  visit(sf)
  return tokens
}

/** Whether reflowing left every non-comment code token byte-identical (the transform touched only comments). */
export function codeUnchanged(path: string, before: string, after: string): boolean {
  const a = codeTokens(path, before)
  const b = codeTokens(path, after)
  if (a.length !== b.length) return false
  return a.every((token, i) => token === b[i])
}
