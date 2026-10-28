import { expect, type Page, test } from "@playwright/test"
import { FlowError } from "../../src/playwright/flow/errors"
import { guardJourneyPage } from "../../src/playwright/flow/journey/guard"
import { createJourneyMeter, type JourneyMeter } from "../../src/playwright/flow/journey/meter"
import { createFlowUser, type FlowInput } from "../../src/playwright/flow/journey/user"

// FlowUser against real Chromium: each verb reaches its control the way the device's user does,
// and the journey meter counts it. The pages are served from a route, so their URLs have paths.

const ORIGIN = "http://journey.test"

const FORM = `
<main>
  <h1>Credential</h1>
  <nav><a href="/elsewhere">Elsewhere</a></nav>
  <label>Name <input name="name"></label>
  <label>Tag <input name="tag"></label>
  <label>Secret <input name="secret" type="password"></label>
  <label><input type="checkbox" name="keyless"> Keyless</label>
  <button type="button" tabindex="-1">Hidden from Tab</button>
  <button type="button" id="save">Save</button>
  <p id="saved" hidden>Saved</p>
</main>
<script>
  document.getElementById("save").addEventListener("click", () => {
    history.pushState({}, "", "/done")
    document.getElementById("saved").hidden = false
  })
</script>`

const PICKERS = `
<main>
  <label>Runtime
    <select name="runtime"><option>OpenAI</option><option>Ollama</option><option>vLLM</option></select>
  </label>
  <div role="radiogroup" aria-label="Scorer">
    <label><input type="radio" name="scorer" value="exact" checked> Exact</label>
    <label><input type="radio" name="scorer" value="fuzzy"> Fuzzy</label>
    <label><input type="radio" name="scorer" value="judge"> Judge</label>
  </div>
  <span id="model-label">Model</span>
  <div id="model" role="combobox" tabindex="0" aria-labelledby="model-label" aria-controls="models"
    aria-expanded="false" style="display:inline-block;min-width:8rem;min-height:24px">llama3</div>
  <ul id="models" role="listbox" aria-labelledby="model-label" hidden>
    <li role="option" id="m-llama3" aria-selected="true">llama3</li>
    <li role="option" id="m-qwen2">qwen2</li>
    <li role="option" id="m-phi4">phi4</li>
  </ul>
</main>
<script>
  const box = document.getElementById("model")
  const list = document.getElementById("models")
  const options = [...list.querySelectorAll("[role=option]")]
  let active = 0
  const show = (open) => {
    list.hidden = !open
    box.setAttribute("aria-expanded", String(open))
    if (open) box.setAttribute("aria-activedescendant", options[active].id)
    else box.removeAttribute("aria-activedescendant")
  }
  const choose = (index) => {
    options.forEach((option, i) => option.setAttribute("aria-selected", String(i === index)))
    box.textContent = options[index].textContent
    show(false)
  }
  box.addEventListener("keydown", (event) => {
    const open = !list.hidden
    if (event.key === "ArrowDown") active = open ? Math.min(active + 1, options.length - 1) : active
    else if (event.key === "ArrowUp") active = Math.max(active - 1, 0)
    else if (event.key === "Enter" && open) return choose(active)
    else return
    event.preventDefault()
    show(true)
  })
  box.addEventListener("click", () => show(list.hidden))
  options.forEach((option, i) => option.addEventListener("click", () => choose(i)))
</script>`

const WIDGETS = `
<main>
  <shadow-tools></shadow-tools>
  <div role="radiogroup" aria-label="Speed" id="speed">
    <span role="radio" aria-checked="false" tabindex="-1">Slow</span>
    <span role="radio" aria-checked="false" tabindex="-1">Normal</span>
    <span role="radio" aria-checked="true" tabindex="0">Fast</span>
  </div>
  <span id="dataset-label">Dataset</span>
  <input id="dataset" role="combobox" aria-labelledby="dataset-label" aria-controls="hint datasets"
    aria-expanded="false" readonly value="Smoke">
  <p id="hint">Pick a dataset</p>
  <ul id="datasets" role="listbox" aria-labelledby="dataset-label" hidden>
    <li role="option" id="d-smoke" aria-selected="true">Smoke</li>
    <li role="option" id="d-full">Full</li>
  </ul>
  <ul id="gates" role="listbox" aria-label="Gate" tabindex="0">
    <li role="option" id="g-smoke" aria-selected="true" data-highlighted>Smoke gate</li>
    <li role="option" id="g-strict" aria-selected="false">Strict gate</li>
  </ul>
  <fieldset>
    <legend>Environment</legend>
    <label><input type="radio" name="env" value="local" checked> Local</label>
    <label><input type="radio" name="env" value="ci"> CI</label>
  </fieldset>
  <div role="group" aria-label="Rate" id="rate">
    <button type="button" aria-pressed="false">Bad</button>
    <button type="button" aria-pressed="false" tabindex="-1">Okay</button>
    <button type="button" aria-pressed="false" tabindex="-1">Good</button>
  </div>
  <div role="toolbar" aria-label="Wrap" id="wrap">
    <button type="button">First</button>
    <button type="button" tabindex="-1">Last</button>
    <button type="button" tabindex="-1">Off the ring</button>
  </div>
</main>
<script>
  customElements.define("shadow-tools", class extends HTMLElement {
    connectedCallback() {
      const root = this.attachShadow({ mode: "open" })
      root.innerHTML = "<style>:focus-visible { outline: 2px solid #1d4ed8; outline-offset: 2px }</style>"
        + Array.from({ length: 6 }, (_, i) => "<button>Tool " + i + "</button>").join("")
        + "<button>Export</button>"
    }
  })
  // A radio group whose arrows stop at the ends instead of wrapping.
  const radios = [...document.querySelectorAll("#speed [role=radio]")]
  radios.forEach((radio, i) => radio.addEventListener("keydown", (event) => {
    const next = event.key === "ArrowDown" ? Math.min(i + 1, radios.length - 1)
      : event.key === "ArrowUp" ? Math.max(i - 1, 0) : -1
    if (event.key === " ") radios.forEach((r) => r.setAttribute("aria-checked", String(r === radio)))
    if (next === -1) return
    event.preventDefault()
    radios.forEach((r, j) => r.tabIndex = j === next ? 0 : -1)
    radios[next].focus()
    radios.forEach((r) => r.setAttribute("aria-checked", String(r === radios[next])))
  }))
  const box = document.getElementById("dataset")
  const list = document.getElementById("datasets")
  const options = [...list.querySelectorAll("[role=option]")]
  let active = 0
  box.addEventListener("keydown", (event) => {
    const open = !list.hidden
    if (event.key === "ArrowDown") active = open ? Math.min(active + 1, options.length - 1) : active
    else if (event.key === "Enter" && open) {
      box.value = options[active].textContent
      list.hidden = true
      box.setAttribute("aria-expanded", "false")
      return
    } else return
    event.preventDefault()
    list.hidden = false
    box.setAttribute("aria-expanded", "true")
    box.setAttribute("aria-activedescendant", options[active].id)
  })
  const gates = document.getElementById("gates")
  const gateOptions = [...gates.querySelectorAll("[role=option]")]
  let gateActive = 0
  gates.addEventListener("keydown", (event) => {
    if (event.key === "ArrowDown") gateActive = Math.min(gateActive + 1, gateOptions.length - 1)
    else if (event.key === "ArrowUp") gateActive = Math.max(gateActive - 1, 0)
    else if (event.key === " ") {
      event.preventDefault()
      gateOptions.forEach((opt, i) => opt.setAttribute("aria-selected", String(i === gateActive)))
      return
    } else return
    event.preventDefault()
    gateOptions.forEach((opt, i) => opt.toggleAttribute("data-highlighted", i === gateActive))
  })
  // A roving-focus button group: one Tab stop, the arrow keys move between its buttons.
  const rates = [...document.querySelectorAll("#rate button")]
  rates.forEach((rate, i) => {
    rate.addEventListener("click", () => rates.forEach((r) => r.setAttribute("aria-pressed", String(r === rate))))
    rate.addEventListener("keydown", (event) => {
      const next = event.key === "ArrowRight" ? Math.min(i + 1, rates.length - 1)
        : event.key === "ArrowLeft" ? Math.max(i - 1, 0) : -1
      if (next === -1) return
      event.preventDefault()
      rates.forEach((r, j) => r.tabIndex = j === next ? 0 : -1)
      rates[next].focus()
    })
  })
  // A toolbar whose arrows wrap around its first two buttons and never reach the third.
  const ring = [...document.querySelectorAll("#wrap button")].slice(0, 2)
  ring.forEach((item, i) => {
    item.addEventListener("keydown", (event) => {
      if (event.key !== "ArrowRight" && event.key !== "ArrowLeft") return
      event.preventDefault()
      const next = ring[(i + (event.key === "ArrowRight" ? 1 : ring.length - 1)) % ring.length]
      ring.forEach((r) => r.tabIndex = r === next ? 0 : -1)
      next.focus()
    })
  })
</script>`

const RING = "<style>:focus-visible { outline: 2px solid #1d4ed8; outline-offset: 2px }</style>"

async function serve(page: Page): Promise<void> {
  await page.route(`${ORIGIN}/**`, (route) => {
    const path = new URL(route.request().url()).pathname
    return route.fulfill({
      contentType: "text/html",
      body: `<!doctype html><title>t</title>${path.endsWith("/weak") ? "" : RING}${path.startsWith("/pickers") ? PICKERS : path.startsWith("/widgets") ? WIDGETS : FORM}`,
    })
  })
}

function journey(page: Page, input: FlowInput, strict = false) {
  const meter = createJourneyMeter({ strict })
  page.on("framenavigated", (frame) => {
    if (frame === page.mainFrame()) meter.view(frame.url())
  })
  meter.start(page.url())
  const user = createFlowUser({ page, input, meter, signal: new AbortController().signal })
  return { user, meter }
}

const findingChecks = (meter: JourneyMeter): string[] =>
  meter.drainFindings().map((finding) => `${finding.check}: ${finding.message}`)

test.describe("keyboard", () => {
  test("types, toggles, and activates by Tab, counting each step and each view", async ({
    page,
  }) => {
    await serve(page)
    const { user, meter } = journey(page, "keyboard")
    await user.visit(`${ORIGIN}/credentials`)
    await user.type(page.getByLabel("Name"), "local-ollama")
    await user.type(page.getByLabel("Secret"), "s3cret-value")
    await user.activate(page.getByRole("checkbox", { name: "Keyless" }))
    await user.activate(page.getByRole("button", { name: "Save" }))

    await expect(page.getByText("Saved")).toBeVisible()
    await expect(page.getByRole("checkbox", { name: "Keyless" })).toBeChecked()
    await expect(page.getByLabel("Name")).toHaveValue("local-ollama")
    const metrics = meter.metrics()
    expect(metrics).toMatchObject({ views: 2, typedFields: 2, picks: 0, activations: 2 })
    // Link and Name, then Tag and Secret, then Keyless and Save: the hidden button is skipped.
    expect(metrics.focusMoves).toBe(6)
    expect(findingChecks(meter)).toEqual([])
  })

  test("finds a control Tab never reaches, and still activates it", async ({ page }) => {
    await serve(page)
    const { user, meter } = journey(page, "keyboard")
    await user.visit(`${ORIGIN}/credentials`)
    await user.activate(page.getByRole("button", { name: "Hidden from Tab" }))
    expect(findingChecks(meter)).toEqual([
      'keyboard: button "Hidden from Tab" is not reachable with Tab',
    ])
  })

  test("waits for a disabled control to be enabled before walking Tab to it", async ({ page }) => {
    await serve(page)
    const { user, meter } = journey(page, "keyboard")
    await user.visit(`${ORIGIN}/credentials`)
    await page.evaluate(() => {
      const save = document.getElementById("save") as HTMLButtonElement
      save.disabled = true
      setTimeout(() => {
        save.disabled = false
      }, 300)
    })
    await user.activate(page.getByRole("button", { name: "Save" }))
    await expect(page.getByText("Saved")).toBeVisible()
    expect(findingChecks(meter)).toEqual([])
  })

  test("reports a focus ring too thin to see on the control it reaches", async ({ page }) => {
    await serve(page)
    const { user, meter } = journey(page, "keyboard")
    await user.visit(`${ORIGIN}/credentials/weak`)
    await user.activate(page.getByRole("button", { name: "Save" }))
    expect(findingChecks(meter)).toEqual([
      'focus: button "Save": save: focus indicator is 1px wide, expected at least 2px',
    ])
  })

  test("finds the same value typed into a second field, and exempts password fields", async ({
    page,
  }) => {
    await serve(page)
    const { user, meter } = journey(page, "keyboard")
    await user.visit(`${ORIGIN}/credentials`)
    await user.type(page.getByLabel("Name"), "local-ollama")
    await user.type(page.getByLabel("Tag"), "Local-Ollama")
    await user.type(page.getByLabel("Secret"), "Local-Ollama")
    expect(findingChecks(meter)).toEqual([
      'redundant-entry: "Tag" repeats a value already typed into "Name" on /credentials',
    ])
  })

  test("picks from a native select, a radio group, and a combobox with the arrow keys", async ({
    page,
  }) => {
    await serve(page)
    const { user, meter } = journey(page, "keyboard")
    await user.visit(`${ORIGIN}/pickers`)
    await user.pick(page.getByLabel("Runtime"), "Ollama")
    await user.pick(page.getByRole("radiogroup", { name: "Scorer" }), "Judge")
    await user.pick(page.getByRole("combobox", { name: "Model" }), "phi4")

    await expect(page.getByLabel("Runtime")).toHaveValue("Ollama")
    await expect(page.getByRole("radio", { name: "Judge" })).toBeChecked()
    await expect(page.getByRole("combobox", { name: "Model" })).toHaveText("phi4")
    expect(meter.metrics()).toMatchObject({ views: 1, picks: 3, typedFields: 0 })
    expect(findingChecks(meter)).toEqual([])
  })

  test("reaches a control inside a shadow root past many other stops", async ({ page }) => {
    await serve(page)
    const { user, meter } = journey(page, "keyboard")
    await user.visit(`${ORIGIN}/widgets`)
    await user.activate(page.getByRole("button", { name: "Export" }))
    expect(meter.metrics().focusMoves).toBe(7)
    expect(findingChecks(meter)).toEqual([])
  })

  test("picks back up a radio group that does not wrap, from a popup named among several ids, a listbox, and a fieldset", async ({
    page,
  }) => {
    await serve(page)
    const { user, meter } = journey(page, "keyboard")
    await user.visit(`${ORIGIN}/widgets`)
    await user.pick(page.getByRole("radiogroup", { name: "Speed" }), "Slow")
    await user.pick(page.getByRole("combobox", { name: "Dataset" }), "Full")
    await user.pick(page.getByRole("listbox", { name: "Gate" }), "Strict gate")
    await user.pick(page.getByRole("group", { name: "Environment" }), "CI")
    await expect(page.getByRole("radio", { name: "Slow" })).toHaveAttribute("aria-checked", "true")
    await expect(page.getByRole("combobox", { name: "Dataset" })).toHaveValue("Full")
    await expect(page.getByRole("option", { name: "Strict gate" })).toHaveAttribute(
      "aria-selected",
      "true",
    )
    await expect(page.getByRole("radio", { name: "CI" })).toBeChecked()
    expect(findingChecks(meter)).toEqual([])
  })

  test("reaches a button of a roving-focus group with the arrow keys from the group's Tab stop", async ({
    page,
  }) => {
    await serve(page)
    const { user, meter } = journey(page, "keyboard")
    await user.visit(`${ORIGIN}/widgets`)
    await user.activate(
      page.getByRole("group", { name: "Rate" }).getByRole("button", { name: "Good" }),
    )
    await expect(page.getByRole("button", { name: "Good" })).toHaveAttribute("aria-pressed", "true")
    expect(findingChecks(meter)).toEqual([])
    await user.activate(
      page.getByRole("group", { name: "Rate" }).getByRole("button", { name: "Bad" }),
    )
    await expect(page.getByRole("button", { name: "Bad" })).toHaveAttribute("aria-pressed", "true")
    expect(findingChecks(meter)).toEqual([])
  })

  test("stops arrowing once a wrapping group comes back around without reaching the target", async ({
    page,
  }) => {
    await serve(page)
    const { user, meter } = journey(page, "keyboard")
    await user.visit(`${ORIGIN}/widgets`)
    await user.activate(page.getByRole("button", { name: "Off the ring" }))
    expect(findingChecks(meter)).toEqual([
      'keyboard: button "Off the ring" is not reachable with Tab',
    ])
    // Every Tab stop once, plus one lap of the two-button ring; not a press per remaining budget.
    expect(meter.metrics().focusMoves).toBeLessThan(40)
  })

  test("refuses to pick from a control that offers no options", async ({ page }) => {
    await serve(page)
    const { user } = journey(page, "keyboard")
    await user.visit(`${ORIGIN}/credentials`)
    await expect(user.pick(page.getByRole("button", { name: "Save" }), "x")).rejects.toThrow(
      /user\.pick needs a select, combobox, listbox, or radio group; button "Save" is a button/,
    )
  })
})

test.describe("touch", () => {
  test.use({ hasTouch: true, isMobile: true, viewport: { width: 412, height: 839 } })

  test("taps through the same journey, with no focus moves", async ({ page }) => {
    await serve(page)
    const { user, meter } = journey(page, "touch")
    await user.visit(`${ORIGIN}/pickers`)
    await user.pick(page.getByRole("radiogroup", { name: "Scorer" }), "Fuzzy")
    await user.pick(page.getByRole("combobox", { name: "Model" }), "qwen2")
    await expect(page.getByRole("radio", { name: "Fuzzy" })).toBeChecked()
    await expect(page.getByRole("combobox", { name: "Model" })).toHaveText("qwen2")
    expect(meter.metrics()).toMatchObject({ picks: 2, focusMoves: 0 })
  })

  test("taps the option straight away when the list is already open", async ({ page }) => {
    await serve(page)
    const { user } = journey(page, "touch")
    await user.visit(`${ORIGIN}/pickers`)
    const box = page.getByRole("combobox", { name: "Model" })
    await box.tap()
    await expect(box).toHaveAttribute("aria-expanded", "true")
    await user.pick(box, "phi4")
    await expect(box).toHaveText("phi4")
    await expect(box).toHaveAttribute("aria-expanded", "false")
  })
})

test.describe("guarded journey page", () => {
  test("throws for a raw action, keeps reads and assertions working", async ({ page }) => {
    await serve(page)
    const { user, meter } = journey(page, "keyboard", true)
    const guarded = guardJourneyPage(page)
    await user.visit(`${ORIGIN}/credentials`)
    const save = guarded.getByRole("button", { name: "Save" })
    await expect(save).toBeVisible()
    expect(() => save.click()).toThrow(FlowError)
    expect(() => guarded.goto(`${ORIGIN}/other`)).toThrow(/user\.visit/)
    await user.activate(save)
    await expect(guarded.getByText("Saved")).toBeVisible()
    expect(() => meter.beginVisit()).toThrow(/first step/)
  })
})
