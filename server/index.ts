import express from 'express'
import fs from 'node:fs'
import path from 'node:path'
import { config } from './config.ts'
import { runAgent } from './agent.ts'
import { searchIndex, TOTAL } from './artindex.ts'
import {
  addItem,
  createProject,
  deleteProject,
  listProjects,
  removeItem,
  renameProject,
} from './projects.ts'
import type { AgentEvent } from './agent.ts'
import type { ChatTurn } from './agent.ts'

const app = express()
app.use(express.json({ limit: '256kb' }))

app.get('/api/health', (_req, res) => {
  res.json({
    ok: true,
    model: config.model,
    ollama: config.ollamaUrl,
    indexedArtworks: TOTAL,
    maxSteps: config.maxSteps,
  })
})

/** Direct catalogue search — powers the plain search box without the model. */
app.get('/api/artworks', (req, res) => {
  const q = String(req.query.q ?? '')
  const limit = Math.min(Number(req.query.limit ?? 48) || 48, 200)
  const { items, total } = searchIndex(q, limit)
  res.json({ query: q, total, items })
})

// ---- saved projects ----

function isError(value: unknown): value is { error: string } {
  return typeof value === 'object' && value !== null && 'error' in value
}

app.get('/api/projects', (_req, res) => {
  res.json({ projects: listProjects() })
})

app.post('/api/projects', (req, res) => {
  const result = createProject((req.body as { name?: unknown })?.name)
  if (isError(result)) {
    res.status(400).json(result)
    return
  }
  res.status(201).json(result)
})

app.patch('/api/projects/:id', (req, res) => {
  const result = renameProject(req.params.id, (req.body as { name?: unknown })?.name)
  if (isError(result)) {
    res.status(400).json(result)
    return
  }
  res.json(result)
})

app.delete('/api/projects/:id', (req, res) => {
  if (!deleteProject(req.params.id)) {
    res.status(404).json({ error: 'No such project.' })
    return
  }
  res.json({ ok: true })
})

app.post('/api/projects/:id/items', (req, res) => {
  const result = addItem(req.params.id, (req.body as { item?: unknown })?.item)
  if (isError(result)) {
    res.status(400).json(result)
    return
  }
  res.json(result)
})

app.delete('/api/projects/:id/items', (req, res) => {
  const result = removeItem(req.params.id, String(req.query.src ?? ''))
  if (isError(result)) {
    res.status(400).json(result)
    return
  }
  res.json(result)
})

/**
 * Same-origin image proxy for Warcraft Wiki files. Hotlinking them straight
 * from the browser fails (Cloudflare 403 + CORP: same-origin), so the server
 * fetches with a plain non-browser User-Agent, which is never challenged.
 * Locked to the wiki host and its /images/ path to avoid being an open proxy.
 */
const IMAGE_HOST = 'warcraft.wiki.gg'
const MAX_IMAGE_BYTES = 16 * 1024 * 1024

app.get('/api/img', async (req, res) => {
  const raw = String(req.query.src ?? '')
  let target: URL
  try {
    target = new URL(raw)
  } catch {
    res.status(400).type('text/plain').send('bad url')
    return
  }
  if (target.protocol !== 'https:' || target.hostname !== IMAGE_HOST || !target.pathname.startsWith('/images/')) {
    res.status(403).type('text/plain').send('host not allowed')
    return
  }

  const ctrl = new AbortController()
  const timer = setTimeout(() => ctrl.abort(), 30000)
  try {
    const upstream = await fetch(target, {
      headers: { 'User-Agent': config.wikiUa, Accept: 'image/*' },
      signal: ctrl.signal,
    })
    if (!upstream.ok || !upstream.body) {
      res.status(502).type('text/plain').send(`upstream ${upstream.status}`)
      return
    }
    const contentType = upstream.headers.get('content-type') ?? ''
    const declared = Number(upstream.headers.get('content-length') ?? 0)
    if (!contentType.startsWith('image/') || declared > MAX_IMAGE_BYTES) {
      res.status(415).type('text/plain').send('not a usable image')
      return
    }
    const body = Buffer.from(await upstream.arrayBuffer())
    if (body.byteLength > MAX_IMAGE_BYTES) {
      res.status(413).type('text/plain').send('image too large')
      return
    }
    res.writeHead(200, {
      'Content-Type': contentType,
      'Content-Length': String(body.byteLength),
      'Cache-Control': 'public, max-age=604800, immutable',
      'X-Content-Type-Options': 'nosniff',
    })
    res.end(body)
  } catch {
    if (!res.headersSent) res.status(504).type('text/plain').send('image fetch failed')
    else res.end()
  } finally {
    clearTimeout(timer)
  }
})

/** The agent. Server-sent events: status / reasoning / delta / artworks / done. */
app.post('/api/ask', async (req, res) => {
  const body = req.body as { message?: unknown; history?: unknown }
  const message = typeof body.message === 'string' ? body.message.trim() : ''
  const history: ChatTurn[] = Array.isArray(body.history)
    ? (body.history as ChatTurn[])
        .filter((h) => h && (h.role === 'user' || h.role === 'assistant') && typeof h.content === 'string')
        .map((h) => ({ role: h.role, content: h.content.slice(0, 4000) }))
    : []

  res.writeHead(200, {
    'Content-Type': 'text/event-stream; charset=utf-8',
    'Cache-Control': 'no-cache, no-transform',
    Connection: 'keep-alive',
    'X-Accel-Buffering': 'no',
  })

  const send = (event: AgentEvent) => {
    if (!res.writableEnded) res.write(`data: ${JSON.stringify(event)}\n\n`)
  }

  if (!message) {
    send({ type: 'error', message: 'Empty question.' })
    res.end()
    return
  }

  let aborted = false
  // NOTE: use the *response* close event. `req.on('close')` fires as soon as the
  // POST body has been consumed in modern Node, which would abort every run.
  res.on('close', () => {
    if (!res.writableEnded) aborted = true
  })

  try {
    for await (const event of runAgent(message, history)) {
      if (aborted) break
      send(event)
    }
  } catch (e) {
    send({ type: 'error', message: (e as Error).message })
  } finally {
    if (!res.writableEnded) res.end()
  }
})

// ---- static site ----
if (fs.existsSync(config.distDir)) {
  app.use(express.static(config.distDir, { maxAge: '1h', index: 'index.html' }))
  app.use((req, res, next) => {
    if (req.method !== 'GET' || req.path.startsWith('/api/')) return next()
    res.sendFile(path.join(config.distDir, 'index.html'))
  })
} else {
  app.get('/', (_req, res) => {
    res
      .status(503)
      .type('text/plain')
      .send('No build found. Run `npm run build`, or use `npm run dev` for the Vite dev server.')
  })
}

app.listen(config.port, config.host, () => {
  console.log(`Azeroth Art Agent listening on http://${config.host}:${config.port}`)
  console.log(`  model   ${config.model} via ${config.ollamaUrl}`)
  console.log(`  indexed ${TOTAL} artworks`)
})
