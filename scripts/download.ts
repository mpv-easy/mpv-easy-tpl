import { Hono } from "hono"
import { serve } from "@hono/node-server"
import { readdir, stat, watch } from "node:fs/promises"
import { join, extname, relative } from "node:path"
import { createReadStream } from "node:fs"
import { Readable } from "node:stream"
import { exec } from "node:child_process"
import { promisify } from "node:util"

const execAsync = promisify(exec)
const PORT = 3000
const CWD = process.cwd()
const ES5_DIR = join(CWD, "es5")
const SRC_DIR = join(CWD, "src")

// SSE clients
const clients = new Set<(data: string) => void>()
let lastBuildTime = ""

function broadcast(event: string, data: string) {
  for (const send of clients) {
    send(`event: ${event}\ndata: ${data}\n\n`)
  }
}

// Debounced rebuild
let rebuildTimer: ReturnType<typeof setTimeout> | null = null
async function triggerRebuild() {
  if (rebuildTimer) clearTimeout(rebuildTimer)
  rebuildTimer = setTimeout(async () => {
    console.log("Changes detected, rebuilding...")
    try {
      const { stdout, stderr } = await execAsync("pnpm run build", { cwd: CWD })
      if (stdout) console.log(stdout.trim())
      if (stderr) console.error(stderr.trim())
      lastBuildTime = new Date().toLocaleString()
      broadcast("reload", lastBuildTime)
      console.log(`Build complete — ${lastBuildTime}`)
    } catch (err: any) {
      console.error("Build failed:", err.message)
    }
  }, 500)
}

async function startWatcher() {
  const ac = new AbortController()
  try {
    for await (const _event of watch(SRC_DIR, { recursive: true, signal: ac.signal })) {
      triggerRebuild()
    }
  } catch {
    // watcher stopped
  }
  return () => ac.abort()
}

interface FileEntry {
  name: string
  size: number
  dir: string
}

async function listFiles(dir: string, ext: string): Promise<FileEntry[]> {
  try {
    const files = await readdir(dir)
    const result: FileEntry[] = []
    for (const file of files) {
      if (extname(file) === ext) {
        const s = await stat(join(dir, file))
        result.push({ name: file, size: s.size, dir: relative(CWD, dir) || "." })
      }
    }
    return result
  } catch {
    return []
  }
}

async function getAllFiles(): Promise<FileEntry[]> {
  const [zipFiles, jsFiles] = await Promise.all([
    listFiles(CWD, ".zip"),
    listFiles(ES5_DIR, ".js"),
  ])
  return [...zipFiles, ...jsFiles]
}

function formatSize(bytes: number) {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
}

function renderHtml(files: FileEntry[]) {
  const rows = files
    .map((f) => {
      const url =
        f.dir === "."
          ? `/download/${encodeURIComponent(f.name)}`
          : `/download/${encodeURIComponent(f.dir)}/${encodeURIComponent(f.name)}`
      return `<tr><td><a href="${url}">${f.name}</a></td><td>${formatSize(f.size)}</td></tr>`
    })
    .join("")
  const timeDisplay = lastBuildTime
    ? `<div class="status">Last built: ${lastBuildTime}</div>`
    : `<div class="status">Watching for changes...</div>`
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>mpv-easy downloads</title>
  <style>
    * { margin: 0; padding: 0; box-sizing: border-box; }
    body { font-family: system-ui, sans-serif; background: #0d1117; color: #c9d1d9; display: flex; justify-content: center; padding: 40px 20px; }
    .container { max-width: 600px; width: 100%; }
    h1 { font-size: 24px; margin-bottom: 8px; color: #58a6ff; }
    .status { color: #8b949e; font-size: 13px; margin-bottom: 20px; }
    table { width: 100%; border-collapse: collapse; }
    th, td { text-align: left; padding: 10px 12px; border-bottom: 1px solid #21262d; }
    th { color: #8b949e; font-weight: 500; font-size: 13px; }
    a { color: #58a6ff; text-decoration: none; }
    a:hover { text-decoration: underline; }
    .empty { color: #8b949e; text-align: center; padding: 40px 0; }
  </style>
</head>
<body>
  <div class="container">
    <h1>mpv-easy downloads</h1>
    ${timeDisplay}
    <table>
      <thead><tr><th>Name</th><th>Size</th></tr></thead>
      <tbody>${rows || '<tr><td colspan="2" class="empty">No files found</td></tr>'}</tbody>
    </table>
  </div>
  <script>
    const es = new EventSource("/events")
    es.addEventListener("reload", (e) => {
      document.querySelector(".status").textContent = "Last built: " + e.data
      location.reload()
    })
  </script>
</body>
</html>`
}

function resolveFilePath(dir: string, name: string): string {
  if (dir === ".") return join(CWD, name)
  return join(CWD, dir, name)
}

async function serveFile(filePath: string, name: string): Promise<Response> {
  try {
    const s = await stat(filePath)
    const ext = extname(name)
    const mime = ext === ".zip" ? "application/zip" : "application/javascript"
    return new Response(Readable.toWeb(createReadStream(filePath)) as ReadableStream, {
      status: 200,
      headers: {
        "Content-Type": mime,
        "Content-Disposition": `attachment; filename="${name}"`,
        "Content-Length": String(s.size),
      },
    })
  } catch {
    return new Response("Not found", { status: 404 })
  }
}

const app = new Hono()

app.get("/", async (c) => {
  const files = await getAllFiles()
  return c.html(renderHtml(files))
})

app.get("/events", (c) => {
  let closed = false
  const stream = new ReadableStream({
    start(controller) {
      const send = (data: string) => {
        if (!closed) controller.enqueue(new TextEncoder().encode(data))
      }
      clients.add(send)
      c.req.raw.signal.addEventListener("abort", () => {
        closed = true
        clients.delete(send)
      })
    },
  })
  return c.newResponse(stream, 200, {
    "Content-Type": "text/event-stream",
    "Cache-Control": "no-cache",
    Connection: "keep-alive",
  })
})

app.get("/download/:name{[^/]+}", (c) => {
  const name = decodeURIComponent(c.req.param("name"))
  return serveFile(resolveFilePath(".", name), name)
})

app.get("/download/:dir/:name", (c) => {
  const dir = decodeURIComponent(c.req.param("dir"))
  const name = decodeURIComponent(c.req.param("name"))
  return serveFile(resolveFilePath(dir, name), name)
})

async function main() {
  startWatcher().then((stop) => {
    process.on("SIGINT", () => {
      stop()
      process.exit(0)
    })
  })

  serve({ fetch: app.fetch, port: PORT }, (info) => {
    console.log(`Server running at http://localhost:${info.port}`)
  })
}

main()
