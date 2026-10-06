import { useEffect, useRef, useState } from 'react'
import { askAgent } from '../agent.ts'
import type { ArtItem, ChatTurn } from '../types.ts'

interface Props {
  onArtworks: (items: ArtItem[]) => void
  disabled?: boolean
}

interface Draft {
  statuses: string[]
  reasoning: string
  text: string
}

const SUGGESTIONS = [
  'fel orc concept art',
  'Who painted the most Dragonflight art?',
  'moody Sylvanas pieces',
  'find nerubian architecture art',
]

export default function AgentPanel({ onArtworks, disabled }: Props) {
  const [turns, setTurns] = useState<ChatTurn[]>([])
  const [draft, setDraft] = useState<Draft | null>(null)
  const [input, setInput] = useState('')
  const [busy, setBusy] = useState(false)
  const abort = useRef<AbortController | null>(null)
  const transcript = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const el = transcript.current
    if (el) el.scrollTop = el.scrollHeight
  }, [turns, draft])

  useEffect(() => () => abort.current?.abort(), [])

  const send = async (raw: string) => {
    const message = raw.trim()
    if (!message || busy || disabled) return
    const history = turns.map(({ role, content }) => ({ role, content }))
    setTurns((t) => [...t, { role: 'user', content: message }])
    setInput('')
    setDraft({ statuses: [], reasoning: '', text: '' })
    setBusy(true)
    const controller = new AbortController()
    abort.current = controller
    try {
      await askAgent(
        message,
        history,
        {
          onStatus: (text) => setDraft((d) => (d ? { ...d, statuses: [...d.statuses, text] } : d)),
          onReasoning: (text) => setDraft((d) => (d ? { ...d, reasoning: d.reasoning + text } : d)),
          onDelta: (text) => setDraft((d) => (d ? { ...d, text: d.text + text } : d)),
          onArtworks,
          onDone: ({ answer, citations, steps }) => {
            setTurns((t) => [...t, { role: 'assistant', content: answer, citations, steps }])
            setDraft(null)
            setBusy(false)
          },
          onError: (message) => {
            setDraft(null)
            setTurns((t) => [...t, { role: 'assistant', content: `Something went wrong: ${message}` }])
            setBusy(false)
          },
        },
        controller.signal,
      )
    } catch (e) {
      if ((e as Error).name !== 'AbortError') {
        setDraft(null)
        setTurns((t) => [...t, { role: 'assistant', content: `Could not reach the agent: ${(e as Error).message}` }])
      }
      setBusy(false)
    } finally {
      abort.current = null
    }
  }

  const stop = () => {
    abort.current?.abort()
    setBusy(false)
  }

  return (
    <section className="agent" aria-label="Art agent">
      <div className="agent__head">
        <h2>Art agent</h2>
        <span className="agent__hint">Local model, live wiki access</span>
      </div>

      {turns.length > 0 && (
        <div className="agent__transcript" ref={transcript}>
          {turns.map((turn, i) => (
            <div key={i} className={`turn turn--${turn.role}`}>
              <span className="turn__who">{turn.role === 'user' ? 'You' : 'Agent'}</span>
              <div className="turn__body">
                <p className="turn__text">{turn.content}</p>
                {turn.citations && turn.citations.length > 0 && (
                  <p className="turn__sources">
                    {turn.citations.map((c) => (
                      <a key={c.url} href={c.url} target="_blank" rel="noreferrer noopener">
                        {c.label}
                      </a>
                    ))}
                  </p>
                )}
                {turn.steps ? <span className="turn__meta">{turn.steps} steps</span> : null}
              </div>
            </div>
          ))}
        </div>
      )}

      {draft && (
        <div className="turn turn--assistant">
          <span className="turn__who">Agent</span>
          <div className="turn__body">
            {draft.statuses.length > 0 && (
              <ul className="steps">
                {draft.statuses.map((s, i) => (
                  <li key={i}>{s}</li>
                ))}
              </ul>
            )}
            {draft.reasoning && (
              <details className="think">
                <summary>Reasoning</summary>
                <p>{draft.reasoning}</p>
              </details>
            )}
            {draft.text ? <p className="turn__text">{draft.text}</p> : <p className="turn__text dim">Thinking…</p>}
          </div>
        </div>
      )}

      {turns.length === 0 && !draft && (
        <div className="agent__seeds">
          {SUGGESTIONS.map((s) => (
            <button key={s} type="button" className="chip" onClick={() => send(s)} disabled={disabled}>
              {s}
            </button>
          ))}
        </div>
      )}

      <form
        className="agent__form"
        onSubmit={(e) => {
          e.preventDefault()
          void send(input)
        }}
      >
        <textarea
          className="agent__input"
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && !e.shiftKey) {
              e.preventDefault()
              void send(input)
            }
          }}
          rows={2}
          placeholder="Ask for art, artists or lore — search the catalogue and the live wiki"
          aria-label="Ask the art agent"
        />
        {busy ? (
          <button type="button" className="ghost" onClick={stop}>
            Stop
          </button>
        ) : (
          <button type="submit" className="primary" disabled={!input.trim() || disabled}>
            Ask
          </button>
        )}
      </form>
    </section>
  )
}
