import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { TOTAL, searchArt } from './search.ts'
import type { ArtItem } from './types.ts'
import ArtCard from './components/ArtCard.tsx'
import AgentPanel from './components/AgentPanel.tsx'
import Lightbox from './components/Lightbox.tsx'
import { SearchIcon } from './components/Icons.tsx'
import './App.scss'

const QUICK: { label: string; query: string }[] = [
  { label: 'All Artwork', query: '' },
  { label: 'Concept Art', query: 'concept art' },
  { label: 'Dragons', query: 'dragon' },
  { label: 'Wallpapers', query: 'wallpaper' },
  { label: 'Cinematics', query: 'cinematic' },
  { label: 'Orcs', query: 'orc' },
  { label: 'Armor & Weapons', query: 'armor' },
  { label: 'Architecture', query: 'architecture' },
  { label: 'Biomes', query: 'biome' },
]

const PAGE_SIZE = 48

function useDebounced(value: string, ms: number): string {
  const [out, setOut] = useState(value)
  useEffect(() => {
    const t = setTimeout(() => setOut(value), ms)
    return () => clearTimeout(t)
  }, [value, ms])
  return out
}

export default function App() {
  const [input, setInput] = useState('')
  const [limit, setLimit] = useState(PAGE_SIZE)
  const [selected, setSelected] = useState<ArtItem | null>(null)
  const [agentItems, setAgentItems] = useState<ArtItem[] | null>(null)
  const [agentReady, setAgentReady] = useState<boolean | null>(null)
  const gridTop = useRef<HTMLDivElement>(null)
  const query = useDebounced(input, 140).trim()

  useEffect(() => {
    setLimit(PAGE_SIZE)
  }, [query])

  useEffect(() => {
    let alive = true
    fetch('/api/health')
      .then((r) => alive && setAgentReady(r.ok))
      .catch(() => alive && setAgentReady(false))
    return () => {
      alive = false
    }
  }, [])

  const page = useMemo(() => searchArt(query, limit), [query, limit])
  const showing = agentItems ?? page.items

  // The gallery mirrors whichever chat is active in the agent panel.
  const showResults = useCallback((items: ArtItem[] | null) => {
    setAgentItems(items)
  }, [])

  const browse = (q: string) => {
    setAgentItems(null)
    setInput(q)
  }

  const tally = agentItems ? (
    <button type="button" className="tally__reset" onClick={() => setAgentItems(null)}>
      View catalogue
    </button>
  ) : null

  return (
    <div className="app">
      <header className="masthead">
        <div className="masthead__inner">
          <div className="brand">
            <h1>Azeroth Art Search</h1>
            <p>
              {TOTAL.toLocaleString()} catalogued pieces of official World of Warcraft art, plus an agent
              that searches the live Warcraft Wiki.
            </p>
          </div>
          <form
            className="search"
            role="search"
            onSubmit={(e) => {
              e.preventDefault()
            }}
          >
            <span className="search__icon" aria-hidden="true">
              <SearchIcon />
            </span>
            <input
              className="search__input"
              type="search"
              value={input}
              onChange={(e) => {
                setAgentItems(null)
                setInput(e.target.value)
              }}
              placeholder="Search the catalogue: Illidan, dragon, Ironforge…"
              aria-label="Search the catalogue"
              autoComplete="off"
              spellCheck={false}
            />
          </form>
        </div>
      </header>

      {agentReady === false && (
        <p className="notice notice--warn">
          The agent backend isn’t running, so this is catalogue-only. Start it with <code>npm start</code>.
        </p>
      )}

      <div className="layout">
        <div className="browse">
          <div className="toolbar">
            <div className="chips" role="tablist" aria-label="Collections">
              {QUICK.map((c) => (
                <button
                  key={c.label}
                  type="button"
                  role="tab"
                  aria-selected={!agentItems && query === c.query}
                  className={`chip${!agentItems && query === c.query ? ' chip--on' : ''}`}
                  onClick={() => browse(c.query)}
                >
                  {c.label}
                </button>
              ))}
            </div>
            {tally}
          </div>

          <main className="stage" ref={gridTop}>
            {showing.length === 0 ? (
              <p className="notice">
                {query
                  ? `No catalogued artwork matched “${query}”. Try the agent — it can search the live wiki.`
                  : 'Nothing to show.'}
              </p>
            ) : (
              <>
                <div className="grid">
                  {showing.map((it) => (
                    <ArtCard key={`${it.origin}-${it.id}`} item={it} onOpen={setSelected} />
                  ))}
                </div>
                {!agentItems && page.hasMore && (
                  <div className="more">
                    <button type="button" className="ghost" onClick={() => setLimit((v) => v + PAGE_SIZE)}>
                      Show more artwork ({page.total - page.items.length} left)
                    </button>
                  </div>
                )}
              </>
            )}
          </main>

          <footer className="colophon">
            Artwork and metadata come from the{' '}
            <a href="https://warcraft.wiki.gg/" target="_blank" rel="noreferrer noopener">
              Warcraft Wiki
            </a>
            . Answers are generated by a local model and can be wrong — check the linked sources. World
            of Warcraft is a trademark of Blizzard Entertainment. Unofficial fan index.
          </footer>
        </div>

        <AgentPanel onResults={showResults} disabled={agentReady === false} />
      </div>

      {selected && <Lightbox item={selected} onClose={() => setSelected(null)} />}
    </div>
  )
}
