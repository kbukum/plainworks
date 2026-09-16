/**
 * Reduce each item to only the requested fields.
 *
 * @param items - The objects to project.
 * @param fieldsParam - Comma-separated field names to keep (e.g. `"id,name,email"`).
 * @returns New objects containing only the selected fields.
 */
export function applyFieldSelection<T extends Record<string, unknown>>(
  items: T[],
  fieldsParam: string | undefined,
): Partial<T>[] {
  if (!fieldsParam) {
    return items
  }

  const selectedFields = fieldsParam
    .split(",")
    .map((field) => field.trim())
    .filter(Boolean)

  if (selectedFields.length === 0) {
    return items
  }

  return items.map((item) => {
    const newItem: Partial<T> = {}
    for (const field of selectedFields) {
      if (Object.hasOwn(item, field)) {
        newItem[field as keyof T] = item[field as keyof T]
      }
    }
    return newItem
  })
}
