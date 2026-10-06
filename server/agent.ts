import { config } from './config.ts'
import { executeTool, toolSchemas } from './tools.ts'
import type { ArtItem } from './types.ts'

export type AgentEvent =
  | { type: 'status'; text: string; step: number }
  | { type: 'reasoning'; text: string }
  | { type: 'delta'; text: string }
  | { type: 'artworks'; items: ArtItem[] }
  | { type: 'done'; answer: string; citations: { label: string; url: string }[]; steps: number }
  | { type: 'error'; message: string }

export interface ChatTurn {
  role: 'user' | 'assistant'
  content: string
}

interface ToolCall {
  id: string
  name: string
  args: string
}

const SYSTEM_PROMPT = `You are the Azeroth Art Agent: a research assistant for official World of Warcraft artwork.

You have tools. Rules:
1. ALWAYS search before answering an art request. Call search_index first (it covers 2,090 catalogued pieces and is fast). Use search_wiki when the catalogue comes up empty, or when the user asks for fan art, very recent work, or something niche.
2. TRUST ONLY WHAT THE TITLES SAY. search_index results are title/artist matches: a card is only relevant to the user if its own title supports the claim you are making. Describe a piece using the subject its title names and nothing more — never say an image shows orcs, armour, a character or a scene that its title does not mention. If the titles that came back do not really match what was asked, say the catalogue has no close match and suggest different words, rather than presenting them as the answer.
3. Never invent artwork, artists or attributions. If a tool returns nothing, say so plainly and suggest alternate search terms.
4. Credit artists by name when the data provides one. If a tool result shows artist: null, say the piece is uncredited — do not guess.
5. Keep answers short and concrete: at most three sentences. No preamble, no "great question", no restating the request.
6. Write plain prose. No markdown, no asterisks, no bold, no bullet symbols, no headings — the UI renders your text verbatim.
7. There is no need to describe every image in detail — the user sees the artwork cards. Say what you found, name standout artists, and stop.
8. Only mention the number of results if you actually counted them from a tool result.
9. Use the wiki_article tool for lore or context questions, and artist_leaderboard for "who made the most X" questions.`

interface StreamResult {
  content: string
  reasoning: string
  toolCalls: ToolCall[]
}

/** Calls Ollama's OpenAI-compatible endpoint, streaming deltas out as they arrive. */
async function* streamCompletion(
  messages: Record<string, unknown>[],
): AsyncGenerator<{ kind: 'content' | 'reasoning'; text: string }, StreamResult, void> {
  const res = await fetch(`${config.ollamaUrl}/chat/completions`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      model: config.model,
      stream: true,
      temperature: 0.3,
      messages,
      tools: toolSchemas,
      tool_choice: 'auto',
    }),
  })
  if (!res.ok || !res.body) {
    const detail = await res.text().catch(() => '')
    throw new Error(`model request failed (${res.status}) ${detail.slice(0, 300)}`)
  }

  const reader = res.body.getReader()
  const decoder = new TextDecoder()
  let buffer = ''
  let content = ''
  let reasoning = ''
  const calls = new Map<number, ToolCall>()

  while (true) {
    const { value, done } = await reader.read()
    if (done) break
    buffer += decoder.decode(value, { stream: true })
    const lines = buffer.split('\n')
    buffer = lines.pop() ?? ''
    for (const line of lines) {
      const trimmed = line.trim()
      if (!trimmed.startsWith('data:')) continue
      const payload = trimmed.slice(5).trim()
      if (!payload || payload === '[DONE]') continue
      let chunk: {
        choices?: { delta?: { content?: string; reasoning?: string; tool_calls?: unknown[] } }[]
      }
      try {
        chunk = JSON.parse(payload)
      } catch {
        continue
      }
      const delta = chunk.choices?.[0]?.delta
      if (!delta) continue
      if (delta.reasoning) {
        reasoning += delta.reasoning
        yield { kind: 'reasoning', text: delta.reasoning }
      }
      if (delta.content) {
        content += delta.content
        yield { kind: 'content', text: delta.content }
      }
      for (const raw of delta.tool_calls ?? []) {
        const tc = raw as { index?: number; id?: string; function?: { name?: string; arguments?: string } }
        const idx = tc.index ?? 0
        const cur = calls.get(idx) ?? { id: '', name: '', args: '' }
        if (tc.id) cur.id = tc.id
        if (tc.function?.name) cur.name = tc.function.name
        if (tc.function?.arguments) cur.args += tc.function.arguments
        calls.set(idx, cur)
      }
    }
  }

  const toolCalls = [...calls.values()]
    .filter((c) => c.name)
    .map((c, i) => ({ ...c, id: c.id || `call_${i}_${Date.now()}` }))
  return { content, reasoning, toolCalls }
}

function parseArgs(raw: string): Record<string, unknown> {
  if (!raw) return {}
  try {
    const parsed = JSON.parse(raw)
    return parsed && typeof parsed === 'object' ? (parsed as Record<string, unknown>) : {}
  } catch {
    return {}
  }
}

/**
 * Runs the tool-calling loop, yielding events for the SSE channel.
 * The final assistant message is streamed token by token; tool rounds emit
 * status lines and artwork batches as they complete.
 */
export async function* runAgent(message: string, history: ChatTurn[]): AsyncGenerator<AgentEvent> {
  const messages: Record<string, unknown>[] = [
    { role: 'system', content: SYSTEM_PROMPT },
    ...history.slice(-6).map((h) => ({ role: h.role, content: h.content })),
    { role: 'user', content: message },
  ]

  const artworks: ArtItem[] = []
  const citations: { label: string; url: string }[] = []
  let answer = ''
  let step = 0

  while (step < config.maxSteps) {
    step += 1
    let result: StreamResult
    const gen = streamCompletion(messages)
    while (true) {
      const next = await gen.next()
      if (next.done) {
        result = next.value
        break
      }
      if (next.value.kind === 'content') {
        answer += next.value.text
        yield { type: 'delta', text: next.value.text }
      } else {
        yield { type: 'reasoning', text: next.value.text }
      }
    }

    if (!result.toolCalls.length) break

    messages.push({
      role: 'assistant',
      content: result.content || '',
      tool_calls: result.toolCalls.map((c) => ({
        id: c.id,
        type: 'function',
        function: { name: c.name, arguments: c.args || '{}' },
      })),
    })

    for (const call of result.toolCalls) {
      let outcome
      try {
        outcome = await executeTool(call.name, parseArgs(call.args))
      } catch (e) {
        outcome = {
          result: { error: `Tool “${call.name}” failed: ${(e as Error).message}` },
          status: `Tool “${call.name}” failed`,
          artworks: [],
          citations: [],
        }
      }
      if (outcome.status) yield { type: 'status', text: outcome.status, step }
      if (outcome.artworks.length) {
        artworks.push(...outcome.artworks)
        yield { type: 'artworks', items: outcome.artworks }
      }
      citations.push(...outcome.citations)
      messages.push({
        role: 'tool',
        tool_call_id: call.id,
        name: call.name,
        content: JSON.stringify(outcome.result).slice(0, 12000),
      })
    }
  }

  yield {
    type: 'done',
    answer,
    citations: [...new Map(citations.map((c) => [c.url, c])).values()],
    steps: step,
  }
}
