import { describe, expect, test } from "vitest"
import { parseHostConfig } from "./config"
import { BundleExclusionError } from "./error"

const valid = {
  rule: "devtools",
  directories: ["dist"],
  expectedSources: ["/apps/web/src/"],
}

function parse(value: unknown) {
  return parseHostConfig("host.json", JSON.stringify(value))
}

describe("parseHostConfig", () => {
  test("parses the required fields and defaults optional lists", () => {
    expect(parse(valid)).toEqual({
      rule: "devtools",
      directories: ["dist"],
      expectedSources: ["/apps/web/src/"],
      forbiddenSources: [],
      markers: [],
      allowUnmapped: [],
    })
  })

  test("preserves the JSON parse error as the cause", () => {
    expect(() => parseHostConfig("host.json", "{")).toThrow(BundleExclusionError)
    let caught: unknown
    try {
      parseHostConfig("host.json", "{")
    } catch (error) {
      caught = error
    }
    expect(caught).toBeInstanceOf(BundleExclusionError)
    if (caught instanceof BundleExclusionError) {
      expect(caught.cause).toBeInstanceOf(SyntaxError)
    }
  })

  test.each([
    [null, "host.json: expected a JSON object"],
    [[], "host.json: expected a JSON object"],
    [{ ...valid, rule: "missing" }, 'host.json: "rule" must be one of devtools'],
    [{ ...valid, rule: 1 }, 'host.json: "rule" must be one of devtools'],
    [{ ...valid, directories: [] }, 'host.json: "directories" must name the build output'],
    [{ ...valid, directories: "dist" }, 'host.json: "directories" must be an array of strings'],
    [
      { ...valid, directories: ["dist", 1] },
      'host.json: "directories" must be an array of strings',
    ],
    [
      { ...valid, expectedSources: [] },
      'host.json: "expectedSources" must name at least one of the app\'s own source paths',
    ],
    [
      { ...valid, expectedSources: [1] },
      'host.json: "expectedSources" must be an array of strings',
    ],
    [
      { ...valid, forbiddenSources: [1] },
      'host.json: "forbiddenSources" must be an array of strings',
    ],
    [{ ...valid, markers: [1] }, 'host.json: "markers" must be an array of strings'],
    [{ ...valid, allowUnmapped: [1] }, 'host.json: "allowUnmapped" must be an array of strings'],
  ])("rejects invalid config %#", (input, message) => {
    expect(() => parse(input)).toThrow(message)
  })
})
