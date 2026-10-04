/** Parse calendar-valid RFC3339 into Unix milliseconds. Leap-second notation is unsupported. */
export function parseRfc3339(value: string): number | undefined {
  if (
    value.length > 128 ||
    value.trim() !== value ||
    !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?(?:Z|[+-]\d{2}:\d{2})$/.test(value)
  )
    return undefined
  const year = Number(value.slice(0, 4))
  const month = Number(value.slice(5, 7))
  const day = Number(value.slice(8, 10))
  const leap = year % 4 === 0 && (year % 100 !== 0 || year % 400 === 0)
  const days = month === 2 ? (leap ? 29 : 28) : [4, 6, 9, 11].includes(month) ? 30 : 31
  if (month < 1 || month > 12 || day < 1 || day > days || Number(value.slice(11, 13)) > 23)
    return undefined
  const milliseconds = Date.parse(value)
  return Number.isFinite(milliseconds) ? milliseconds : undefined
}
