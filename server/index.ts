import express from 'express'
import fs from 'node:fs'
import path from 'node:path'
import { config } from './config.ts'
import { runAgent } from './agent.ts'
import { searchIndex, TOTAL } from './artindex.ts'
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
