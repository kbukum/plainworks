/** Match the shared semantic contract; custom rules never become wire identities. */
export function violationReason(ruleId: string): string {
  const rule = ruleId.slice(ruleId.indexOf(".") + 1)
  if (rule === "required") return "REQUIRED"
  if (["email", "url", "uri", "uuid", "hostname", "ip", "ipv4", "ipv6", "pattern"].includes(rule)) {
    return "INVALID_FORMAT"
  }
  if (
    [
      "min",
      "max",
      "min_len",
      "max_len",
      "min_bytes",
      "max_bytes",
      "min_items",
      "max_items",
      "gte",
      "lte",
      "gt",
      "lt",
      "range",
      "before",
      "after",
    ].includes(rule)
  )
    return "OUT_OF_RANGE"
  return "INVALID_VALUE"
}
