import { spawn } from "node:child_process"
import { readFileSync } from "node:fs"
import { createServer as createHttpServer } from "node:http"
import { createServer as createHttpsServer } from "node:https"

const port = Number(process.env.PORT)
let reads = 0
const descendantPort = process.env.HOST_DESCENDANT_PORT
let descendant
let descendantReady = descendantPort === undefined
if (descendantPort !== undefined) {
  const env = { ...process.env, PORT: descendantPort, HOST_IGNORE_TERM: "1" }
  delete env.HOST_DESCENDANT_PORT
  descendant = spawn(process.execPath, [new URL(import.meta.url).pathname], {
    env,
    stdio: ["ignore", "ignore", "ignore", "ipc"],
  })
  descendant.once("message", () => {
    descendantReady = true
    descendant.unref()
  })
}
const script = `
const button = document.querySelector("button");
const status = document.querySelector('[role="status"]');
button.addEventListener("click", async () => {
  try {
    const response = await fetch("/ready", { signal: AbortSignal.timeout(750) });
    if (!response.ok) throw new Error("Host unavailable");
    status.textContent = "Available";
  } catch {
    status.textContent = "Unavailable";
  }
});
`
const page = `<!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width">
<title>Owned public host</title><style>
body{font:1rem system-ui;margin:0;background:#fff;color:#111}
main{max-width:40rem;margin:2rem auto;padding:1rem}
button{font:inherit;min-height:44px;padding:.5rem 1rem}
button:focus-visible{outline:3px solid #185abc;outline-offset:3px}
@media(prefers-color-scheme:dark){body{background:#111;color:#eee}}
</style></head><body><main><h1>Owned public host</h1>
<p role="status">Available</p><button type="button">Check host</button></main>
<script src="/host.js" defer></script></body></html>`

const handler = (request, response) => {
  if (request.url === "/ready") {
    if (process.env.HOST_HANG === "1") return
    response.writeHead(descendantReady ? Number(process.env.HOST_READY_STATUS ?? "200") : 503, {
      "content-type": "application/json",
    })
    response.end(JSON.stringify({ protocol: process.env.HOST_PROTOCOL ?? "plainworks.host.v1" }))
  } else if (request.url === "/state") {
    response.writeHead(200, { "content-type": "application/json" })
    response.end(
      JSON.stringify({
        reads: ++reads,
        ...(descendant === undefined ? {} : { descendantPid: descendant.pid }),
      }),
    )
  } else if (request.url === "/host.js") {
    response.writeHead(200, { "content-type": "text/javascript" })
    response.end(script)
  } else if (request.url === "/") {
    response.writeHead(200, { "content-type": "text/html" })
    response.end(page)
  } else {
    response.writeHead(404)
    response.end("Not found")
  }
}
const cert = process.env.HOST_CERT
const key = process.env.HOST_KEY
const server =
  cert !== undefined && key !== undefined
    ? createHttpsServer({ cert: readFileSync(cert), key: readFileSync(key) }, handler)
    : createHttpServer(handler)

if (process.env.HOST_EARLY_EXIT === "1") process.exitCode = 7
else {
  server.listen(port, "127.0.0.1", () => {
    if (process.send !== undefined) {
      process.send("ready")
      process.disconnect()
    }
  })
  server.on("error", (error) => {
    process.stderr.write(`${error.message}\n`)
    process.exitCode = 1
  })
  process.on("SIGTERM", () => {
    if (process.env.HOST_IGNORE_TERM === "1") return
    server.closeAllConnections()
    server.close((error) => {
      if (error !== undefined) {
        process.stderr.write(`${error.message}\n`)
        process.exitCode = 1
      }
    })
  })
}
