import type { ArtItem, Citation } from './types.ts'

export interface AgentHandlers {
  onStatus: (text: string, step: number) => void
  onReasoning: (text: string) => void
  onDelta: (text: string) => void
  onArtworks: (items: ArtItem[]) => void
  onDone: (payload: { answer: string; citations: Citation[]; steps: number }) => void
  onError: (message: string) => void
}

/** Streams the agent's server-sent events for one question. */
export async function askAgent(
  message: string,
  history: { role: 'user' | 'assistant'; content: string }[],
  handlers: AgentHandlers,
  signal?: AbortSignal,
): Promise<void> {
  const res = await fetch('/api/ask', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ message, history }),
    signal,
  })
  if (!res.ok || !res.body) throw new Error(`Agent request failed (${res.status})`)

  const reader = res.body.getReader()
  const decoder = new TextDecoder()
  let buffer = ''

  while (true) {
    const { value, done } = await reader.read()
    if (done) break
    buffer += decoder.decode(value, { stream: true })
    const frames = buffer.split('\n\n')
    buffer = frames.pop() ?? ''
    for (const frame of frames) {
      const line = frame.split('\n').find((l) => l.startsWith('data:'))
      if (!line) continue
      let event: Record<string, unknown>
      try {
        event = JSON.parse(line.slice(5).trim())
      } catch {
        continue
      }
      switch (event.type) {
        case 'status':
          handlers.onStatus(String(event.text ?? ''), Number(event.step ?? 1))
          break
        case 'reasoning':
          handlers.onReasoning(String(event.text ?? ''))
          break
        case 'delta':
          handlers.onDelta(String(event.text ?? ''))
          break
        case 'artworks':
          handlers.onArtworks((event.items ?? []) as ArtItem[])
          break
        case 'done':
          handlers.onDone({
            answer: String(event.answer ?? ''),
            citations: (event.citations ?? []) as Citation[],
            steps: Number(event.steps ?? 0),
          })
          break
        case 'error':
          handlers.onError(String(event.message ?? 'Unknown agent error'))
          break
      }
    }
  }
}
