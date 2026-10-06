import { useCallback, useEffect, useRef, useState } from 'react'
import { askAgent } from '../agent.ts'
import { CATALOGUE_ENABLED } from '../../shared/features.ts'
import type { ArtItem, ChatTurn } from '../types.ts'
import { CloseIcon, PlusIcon, RefreshIcon } from './Icons.tsx'

interface Props {
  onResults: (items: ArtItem[] | null) => void
  /** the active chat is mid-answer */
  onBusy?: (busy: boolean) => void
  /** the active chat has been used at all */
  onStarted?: (started: boolean) => void
  /** a question was just asked — the gallery is about to be replaced */
  onAsk?: () => void
  disabled?: boolean
}

interface Draft {
  statuses: string[]
  reasoning: string
  text: string
}

interface Chat {
  id: string
  turns: ChatTurn[]
  draft: Draft | null
  busy: boolean
  seeds: string[]
  seedRound: number
  input: string
  artworks: ArtItem[]
}

/**
 * Prompts checked against the bundled index — art searches, artist questions
 * and prop/mood collections. Only offered when the catalogue flag is on.
 */
const CATALOGUE_SEEDS = [
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
  'tuskarr concept art',
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
]

/**
 * Live-wiki and lore prompts. Every one of these is answered by the server's
 * wiki proxy, so they work with no bundled data at all — which is why they are
 * the whole pool while the catalogue is switched off.
 */
const LIVE_SEEDS = [
  'Search the live wiki for Illidan artwork',
  'Search the live wiki for Sylvanas art',
  'Search the live wiki for dragonflight concept art',
  'Search the live wiki for gnome tinker art',
  'Search the live wiki for trading card art',
  'Search the live wiki for warbringers art',
  "Find K'aresh art on the live wiki",
  'Search the live wiki for murloc art',
  'Search the live wiki for tuskarr art',
  'Search the live wiki for ethereal art',
  // lore
  "Who is Xal'atath?",
  'What is the Arathi Empire?',
  'Tell me about the nerubians',
  'What is the story of the Earthen Ring?',
  'Tell me about the Arathi Highlands',
]

const SEED_POOL = CATALOGUE_ENABLED ? [...CATALOGUE_SEEDS, ...LIVE_SEEDS] : LIVE_SEEDS

const SEED_COUNT = 4
const TITLE_MAX = 24

let chatSeq = 0

function newChat(): Chat {
  chatSeq += 1
  return {
    id: `chat-${Date.now()}-${chatSeq}`,
    turns: [],
    draft: null,
    busy: false,
    seeds: pickSeeds(SEED_COUNT),
    seedRound: 0,
    input: '',
    artworks: [],
  }
}

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

function titleOf(chat: Chat): string {
  const first = chat.turns.find((t) => t.role === 'user')
  if (!first) return 'New chat'
  const text = first.content.replace(/\s+/g, ' ').trim()
  return text.length > TITLE_MAX ? `${text.slice(0, TITLE_MAX - 1)}…` : text
}

/**
 * Multiple conversations, each with its own transcript, artwork results and
 * in-flight run. Runs continue streaming while you look at another chat, so
 * several can be in flight at once.
 */
export default function AgentPanel({ onResults, onBusy, onStarted, onAsk, disabled }: Props) {
  // Conversations and the selection live in one object so every update is
  // atomic — closing two chats in quick succession can't clobber itself the way
  // two separate setState calls reading render-scope state would.
  const [board, setBoard] = useState(() => {
    const first = newChat()
    return { chats: [first], activeId: first.id }
  })
  const { chats } = board
  const active = chats.find((c) => c.id === board.activeId) ?? chats[0]

  const transcript = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLTextAreaElement>(null)
  const aborts = useRef<Map<string, AbortController>>(new Map())

  const patch = useCallback((id: string, fn: (chat: Chat) => Partial<Chat>) => {
    setBoard((prev) => ({ ...prev, chats: prev.chats.map((c) => (c.id === id ? { ...c, ...fn(c) } : c)) }))
  }, [])

  const select = (id: string) => setBoard((prev) => ({ ...prev, activeId: id }))

  // Publish the active chat's results to the gallery. Identity of the artworks
  // array only changes when that chat actually gains artwork, or on switch.
  const activeArtworks = active?.artworks
  useEffect(() => {
    onResults(activeArtworks && activeArtworks.length ? activeArtworks : null)
  }, [activeArtworks, onResults])

  // Drive the App's layout: busy shows the loading skeleton, started splits the
  // view into sidebar | gallery | chat. Gate on primitives so the callbacks are
  // not fired on every re-render of the board.
  const activeBusy = Boolean(active?.busy)
  const activeStarted = Boolean(active && (active.turns.length > 0 || active.draft))
  useEffect(() => {
    onBusy?.(activeBusy)
  }, [activeBusy, onBusy])
  useEffect(() => {
    onStarted?.(activeStarted)
  }, [activeStarted, onStarted])

  useEffect(() => {
    const el = transcript.current
    if (el) el.scrollTop = el.scrollHeight
  }, [board.activeId, active?.turns.length, active?.draft?.text])

  useEffect(
    () => () => {
      aborts.current.forEach((c) => c.abort())
    },
    [],
  )

  const send = async (raw: string) => {
    const chat = active
    const message = raw.trim()
    if (!chat || !message || chat.busy || disabled) return
    const history = chat.turns.map(({ role, content }) => ({ role, content }))

    // The gallery answers the question just asked, so drop whatever the last
    // one left behind. Within this run results still accumulate — one question
    // often takes several searches.
    onAsk?.()
    patch(chat.id, (c) => ({
      turns: [...c.turns, { role: 'user', content: message }],
      input: '',
      artworks: [],
      draft: { statuses: [], reasoning: '', text: '' },
      busy: true,
    }))

    const controller = new AbortController()
    aborts.current.set(chat.id, controller)

    try {
      await askAgent(
        message,
        history,
        {
          onStatus: (text) =>
            patch(chat.id, (c) => (c.draft ? { draft: { ...c.draft, statuses: [...c.draft.statuses, text] } } : {})),
          onReasoning: (text) =>
            patch(chat.id, (c) => (c.draft ? { draft: { ...c.draft, reasoning: c.draft.reasoning + text } } : {})),
          onDelta: (text) => patch(chat.id, (c) => (c.draft ? { draft: { ...c.draft, text: c.draft.text + text } } : {})),
          onArtworks: (items) =>
            patch(chat.id, (c) => {
              const seen = new Set(c.artworks.map((a) => a.src))
              return { artworks: [...c.artworks, ...items.filter((i) => !seen.has(i.src))] }
            }),
          onDone: ({ answer, citations, steps }) =>
            patch(chat.id, (c) => ({
              turns: [...c.turns, { role: 'assistant', content: answer, citations, steps }],
              draft: null,
              busy: false,
            })),
          onError: (message) =>
            patch(chat.id, (c) => ({
              turns: [...c.turns, { role: 'assistant', content: `Something went wrong: ${message}` }],
              draft: null,
              busy: false,
            })),
        },
        controller.signal,
      )
    } catch (e) {
      if ((e as Error).name === 'AbortError') {
        // keep whatever the model had already written
        patch(chat.id, (c) =>
          c.draft?.text
            ? {
                turns: [...c.turns, { role: 'assistant', content: `${c.draft.text} (stopped)` }],
                draft: null,
                busy: false,
              }
            : { draft: null, busy: false },
        )
      } else {
        patch(chat.id, (c) => ({
          turns: [...c.turns, { role: 'assistant', content: `Could not reach the agent: ${(e as Error).message}` }],
          draft: null,
          busy: false,
        }))
      }
    } finally {
      aborts.current.delete(chat.id)
      patch(chat.id, () => ({ busy: false, draft: null }))
    }
  }

  const stop = () => {
    if (active) aborts.current.get(active.id)?.abort()
  }

  const refreshSeeds = () => {
    if (active) patch(active.id, (c) => ({ seeds: pickSeeds(SEED_COUNT, c.seeds), seedRound: c.seedRound + 1 }))
  }

  const addChat = () => {
    setBoard((prev) => {
      const chat = newChat()
      return { chats: [...prev.chats, chat], activeId: chat.id }
    })
    window.requestAnimationFrame(() => inputRef.current?.focus())
  }

  const closeChat = (id: string) => {
    aborts.current.get(id)?.abort()
    aborts.current.delete(id)
    setBoard((prev) => {
      const index = prev.chats.findIndex((c) => c.id === id)
      const remaining = prev.chats.filter((c) => c.id !== id)
      if (!remaining.length) {
        const fresh = newChat()
        return { chats: [fresh], activeId: fresh.id }
      }
      const activeId =
        prev.activeId === id ? remaining[Math.min(index, remaining.length - 1)].id : prev.activeId
      return { chats: remaining, activeId }
    })
  }

  return (
    <section className="agent" aria-label="Art agent">
      <div className="agent__head">
        <h2>Art agent</h2>
        <button type="button" className="seeds__more" onClick={addChat} disabled={disabled}>
          <PlusIcon />
          New chat
        </button>
      </div>

      <div className="chatbar">
        {chats.map((chat) => {
          const isActive = chat.id === active?.id
          const title = titleOf(chat)
          return (
            <span key={chat.id} className={`chatbar__item${isActive ? ' chatbar__item--on' : ''}`}>
              <button
                type="button"
                className="chatbar__tab"
                aria-current={isActive ? 'true' : undefined}
                title={title}
                onClick={() => select(chat.id)}
              >
                {title}
                {chat.busy ? ' …' : ''}
              </button>
              <button
                type="button"
                className="chatbar__close"
                aria-label={`Close ${title}`}
                onClick={() => closeChat(chat.id)}
              >
                <CloseIcon />
              </button>
            </span>
          )
        })}
      </div>

      <div className="agent__transcript" ref={transcript}>
        {active.turns.length === 0 && !active.draft && (
          <div className="agent__intro">
            <div className="agent__seeds" key={active.seedRound}>
              {active.seeds.map((s) => (
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

        {active.turns.map((turn, i) => (
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

        {active.draft && (
          <div className="turn turn--assistant">
            <span className="turn__who">Agent</span>
            <div className="turn__body">
              {active.draft.statuses.length > 0 && (
                <ul className="steps">
                  {active.draft.statuses.map((s, i) => (
                    <li key={i}>{s}</li>
                  ))}
                </ul>
              )}
              {active.draft.reasoning && (
                <details className="think">
                  <summary>Reasoning</summary>
                  <p>{active.draft.reasoning}</p>
                </details>
              )}
              {active.draft.text ? (
                <p className="turn__text">{active.draft.text}</p>
              ) : (
                <div className="skel-lines" aria-hidden="true">
                  <span />
                  <span />
                  <span />
                </div>
              )}
            </div>
          </div>
        )}
      </div>

      <p className="sr-only" role="status">
        {active.busy ? 'The agent is working.' : ''}
      </p>

      <form
        className="agent__form"
        onSubmit={(e) => {
          e.preventDefault()
          void send(active.input)
        }}
      >
        <textarea
          ref={inputRef}
          className="agent__input"
          value={active.input}
          onChange={(e) => patch(active.id, () => ({ input: e.target.value }))}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && !e.shiftKey) {
              e.preventDefault()
              void send(active.input)
            }
          }}
          rows={2}
          placeholder={
            CATALOGUE_ENABLED
              ? 'Ask for art, artists or lore — search the catalogue and the live wiki'
              : 'Ask for artwork or lore — the agent searches the live Warcraft Wiki'
          }
          aria-label="Ask the art agent"
        />
        {active.busy ? (
          <button type="button" className="ghost" onClick={stop}>
            Stop
          </button>
        ) : (
          <button type="submit" className="primary" disabled={!active.input.trim() || disabled}>
            Ask
          </button>
        )}
      </form>
    </section>
  )
}