// A minimal owned gate host: one process per worker, with its run ID, pid, and reset/sign-in order
// recorded under the worker's own data directory so the outer harness can inspect them.
import { appendFileSync, mkdirSync, writeFileSync } from "node:fs"
import { createServer } from "node:http"
import { join } from "node:path"

const [port, root] = process.argv.slice(2)
const runId = `worker-${port}`
const data = join(root, runId)
mkdirSync(data, { recursive: true })
writeFileSync(join(data, "pid"), String(process.pid))
const record = (event) => appendFileSync(join(data, "events"), `${event}\n`)

const page = `<!doctype html><html lang="en"><head><title>gate</title></head>
<body><main><h1>Gate fixture</h1></main></body></html>`

createServer((request, response) => {
  const signedIn = (request.headers.cookie ?? "").includes(`sid=${runId}`)
  if (request.url === "/ready") {
    if (process.env.GATE_SCENARIO === "startup-cancel") {
      writeFileSync(join(root, "hanging"), port)
      response.writeHead(503).end()
      return
    }
    response.writeHead(200, { "content-type": "application/json" })
    response.end(JSON.stringify({ runId }))
  } else if (request.method === "POST" && request.url === "/reset") {
    record("reset")
    response.writeHead(204).end()
  } else if (request.method === "POST" && request.url === "/sign-in") {
    record("sign-in")
    response.writeHead(204, { "set-cookie": `sid=${runId}; Path=/; HttpOnly; SameSite=Strict` })
    response.end()
  } else if (request.url === "/session") {
    response.writeHead(signedIn ? 200 : 401, { "content-type": "application/json" })
    response.end(JSON.stringify({ runId: signedIn ? runId : null }))
  } else if (request.url === "/") {
    response.writeHead(200, { "content-type": "text/html; charset=utf-8" })
    response.end(page)
  } else {
    response.writeHead(404).end()
  }
}).listen(Number(port), "127.0.0.1")
