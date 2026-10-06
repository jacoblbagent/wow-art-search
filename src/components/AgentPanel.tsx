import { useEffect, useRef, useState } from 'react'
import { askAgent } from '../agent.ts'
import type { ArtItem, ChatTurn } from '../types.ts'
import { RefreshIcon } from './Icons.tsx'

interface Props {
  onArtworks: (items: ArtItem[]) => void
  disabled?: boolean
}

interface Draft {
  statuses: string[]
  reasoning: string
  text: string
}

/**
 * Every prompt here was checked against the live data: art searches return
 * results from the bundled catalogue, the questions have real answers, and the
 * live-wiki prompts return files. The pool mixes all three so a refresh cycles
 * through different capabilities.
 */
const SEED_POOL = [
  // catalogue searches — races and peoples
  'troll concept art',
  'vrykul concept art',
  'undead concept art',
  'night elf concept art',
  'tauren concept art',
  'draenei concept art',
  'pandaren concept art',
  'earthen concept art',
  'nerubian concept art',
  'kobold concept art',
  'haranir concept art',
  'blood elf concept art',
  'centaur concept art',
  // creatures and forces
  'dragon concept art',
  'proto-dragon concept art',
  'old god concept art',
  'void concept art',
  'fel concept art',
  'elemental concept art',
  'demon concept art',
  'titan concept art',
  // characters
  'Arthas concept art',
  'Sylvanas concept art',
  'Alexstrasza concept art',
  'Deathwing concept art',
  // places
  'revendreth concept art',
  'maldraxxus concept art',
  'silvermoon concept art',
  'Zuldazar concept art',
  "azj-kahet concept art",
  'Dalaran concept art',
  'icecrown concept art',
  'valdrakken concept art',
  'ardenweald concept art',
  'dornogal concept art',
  // props and moods
  'armor concept art',
  'weapon concept art',
  'mount concept art',
  'architecture concept art',
  'city concept art',
  'wallpaper',
  'cinematic art',
  // artist questions
  'Who painted the most Dragonflight art?',
  'Who made the most Revendreth art?',
  'Who has drawn the most nerubian art?',
  // live-wiki discovery
  'Use the live wiki to find gnome tinker artwork',
  'Search the live wiki for trading card art',
  "Find K'aresh art on the live wiki",
  'Search the live wiki for warbringers art',
  // lore
  "Who is Xal'atath?",
  'What is the Arathi Empire?',
  'Tell me about the nerubians',
]

const SEED_COUNT = 4

function pickSeeds(count: number, avoid: string[] = []): string[] {
  const avoidKey = [...avoid].sort().join('|')
  for (let attempt = 0; attempt < 12; attempt++) {
    const pool = [...SEED_POOL]
    for (let i = pool.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1))
      ;[pool[i], pool[j]] = [pool[j], pool[i]]
    }
    const picked = pool.slice(0, count)
    if (picked.sort().join('|') !== avoidKey) return picked
  }
  return SEED_POOL.slice(0, count)
}

export default function AgentPanel({ onArtworks, disabled }: Props) {
  const [turns, setTurns] = useState<ChatTurn[]>([])
  const [draft, setDraft] = useState<Draft | null>(null)
  const [input, setInput] = useState('')
  const [busy, setBusy] = useState(false)
  const [seeds, setSeeds] = useState<string[]>(() => pickSeeds(SEED_COUNT))
  const [seedRound, setSeedRound] = useState(0)
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

  const refreshSeeds = () => {
    setSeeds((prev) => pickSeeds(SEED_COUNT, prev))
    setSeedRound((r) => r + 1)
  }

  return (
    <section className="agent" aria-label="Art agent">
      <div className="agent__head">
        <h2>Art agent</h2>
      </div>

      <div className="agent__transcript" ref={transcript}>
        {turns.length === 0 && !draft && (
          <div className="agent__intro">
            <div className="agent__seeds" key={seedRound}>
              {seeds.map((s) => (
                <button key={s} type="button" className="chip" onClick={() => send(s)} disabled={disabled}>
                  {s}
                </button>
              ))}
            </div>
            <button
              type="button"
              className="seeds__more"
              onClick={refreshSeeds}
              disabled={disabled}
              aria-label="Show different examples"
            >
              <RefreshIcon />
              More examples
            </button>
          </div>
        )}

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
              {draft.text ? (
                <p className="turn__text">{draft.text}</p>
              ) : (
                <p className="turn__text dim">Thinking…</p>
              )}
            </div>
          </div>
        )}
      </div>

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
