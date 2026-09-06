import { expect, test } from "vitest"
import { composeInterceptors, type Interceptor } from "./interceptor"

test("composeInterceptors runs the first entry outermost", async () => {
  const trail: string[] = []
  const tag =
    (name: string): Interceptor<string, string> =>
    (next) =>
    async (input) => {
      trail.push(`>${name}`)
      const output = await next(input)
      trail.push(`<${name}`)
      return output
    }
  const handler = composeInterceptors([tag("a"), tag("b")])(async (input) => {
    trail.push("=core")
    return input.toUpperCase()
  })
  await expect(handler("x")).resolves.toBe("X")
  expect(trail).toEqual([">a", ">b", "=core", "<b", "<a"])
})

test("an interceptor can short-circuit without calling next", async () => {
  const short: Interceptor<number, number> = () => async () => 42
  const handler = composeInterceptors([short])(async () => {
    throw new Error("should not run")
  })
  await expect(handler(1)).resolves.toBe(42)
})

test("an empty chain is the identity around the terminal handler", async () => {
  const handler = composeInterceptors<number, number>([])(async (input) => input + 1)
  await expect(handler(1)).resolves.toBe(2)
})
