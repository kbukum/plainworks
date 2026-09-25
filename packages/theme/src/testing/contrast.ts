/** Test-only WCAG 2.2 contrast math for the theme's `oklch()` tokens. */

type Rgb = readonly [number, number, number]
type Oklab = readonly [number, number, number]

function parseOklch(value: string): readonly [number, number, number] {
  const match = value.match(/^oklch\(\s*([\d.]+)\s+([\d.]+)\s+([\d.]+)\s*\)$/)
  if (match === null) throw new Error(`Expected an oklch() color, got "${value}"`)
  return [Number(match[1]), Number(match[2]), Number(match[3])]
}

function oklchToLinearRgb(lightness: number, chroma: number, hue: number): Rgb {
  const radians = (hue * Math.PI) / 180
  const a = chroma * Math.cos(radians)
  const b = chroma * Math.sin(radians)
  const l = (lightness + 0.3963377774 * a + 0.2158037573 * b) ** 3
  const m = (lightness - 0.1055613458 * a - 0.0638541728 * b) ** 3
  const s = (lightness - 0.0894841775 * a - 1.291485548 * b) ** 3
  return [
    4.0767416621 * l - 3.3077115913 * m + 0.2309699292 * s,
    -1.2684380046 * l + 2.6097574011 * m - 0.3413193965 * s,
    -0.0041960863 * l - 0.7034186147 * m + 1.707614701 * s,
  ]
}

const encode = (channel: number): number =>
  channel < 0
    ? -encode(-channel)
    : channel <= 0.0031308
      ? 12.92 * channel
      : 1.055 * channel ** (1 / 2.4) - 0.055
const decode = (channel: number): number =>
  channel < 0
    ? -decode(-channel)
    : channel <= 0.04045
      ? channel / 12.92
      : ((channel + 0.055) / 1.055) ** 2.4

const inGamut = (rgb: Rgb): boolean => rgb.every((channel) => channel >= 0 && channel <= 1)
const clipChannel = (channel: number): number => Math.min(1, Math.max(0, channel))
const clip = (rgb: Rgb): Rgb => [clipChannel(rgb[0]), clipChannel(rgb[1]), clipChannel(rgb[2])]

function linearRgbToOklab([r, g, b]: Rgb): Oklab {
  const l = Math.cbrt(0.4122214708 * r + 0.5363325363 * g + 0.0514459929 * b)
  const m = Math.cbrt(0.2119034982 * r + 0.6806995451 * g + 0.1073969566 * b)
  const s = Math.cbrt(0.0883024619 * r + 0.2817188376 * g + 0.6299787005 * b)
  return [
    0.2104542553 * l + 0.793617785 * m - 0.0040720468 * s,
    1.9779984951 * l - 2.428592205 * m + 0.4505937099 * s,
    0.0259040371 * l + 0.7827717662 * m - 0.808675766 * s,
  ]
}

function deltaE(first: Oklab, second: Oklab): number {
  return Math.hypot(first[0] - second[0], first[1] - second[1], first[2] - second[2])
}

function gamutMap(value: string): Rgb {
  const [lightness, originalChroma, hue] = parseOklch(value)
  const original = oklchToLinearRgb(lightness, originalChroma, hue)
  if (inGamut(original)) return original
  if (lightness >= 1) return [1, 1, 1]
  if (lightness <= 0) return [0, 0, 0]

  let minimum = 0
  let maximum = originalChroma
  let minimumIsInGamut = true
  let mapped = clip(original)

  while (maximum - minimum > 0.0001) {
    const chroma = (minimum + maximum) / 2
    const candidate = oklchToLinearRgb(lightness, chroma, hue)
    if (minimumIsInGamut && inGamut(candidate)) {
      minimum = chroma
      continue
    }

    mapped = clip(candidate)
    const difference = deltaE(linearRgbToOklab(candidate), linearRgbToOklab(mapped))
    if (difference < 0.02) {
      if (0.02 - difference < 0.0001) return mapped
      minimumIsInGamut = false
      minimum = chroma
    } else {
      maximum = chroma
    }
  }

  return mapped
}

function luminance([r, g, b]: Rgb): number {
  return 0.2126 * r + 0.7152 * g + 0.0722 * b
}

/** A color painted at `alpha` over `backdrop`, composited in encoded sRGB like a browser. */
export interface Tint {
  readonly color: string
  readonly alpha: number
  readonly backdrop: string
}

function linearRgb(color: string | Tint): Rgb {
  if (typeof color === "string") return gamutMap(color)
  const top = gamutMap(color.color)
  const bottom = gamutMap(color.backdrop)
  const blend = (channel: 0 | 1 | 2): number =>
    decode(encode(top[channel]) * color.alpha + encode(bottom[channel]) * (1 - color.alpha))
  return [blend(0), blend(1), blend(2)]
}

/** The WCAG contrast ratio between two colors, from 1 to 21. */
export function contrastRatio(first: string | Tint, second: string | Tint): number {
  const a = luminance(linearRgb(first))
  const b = luminance(linearRgb(second))
  return (Math.max(a, b) + 0.05) / (Math.min(a, b) + 0.05)
}
