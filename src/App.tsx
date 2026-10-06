import { useEffect, useMemo, useState } from 'react'
import { TOTAL, searchArt } from './search.ts'
import type { ArtItem } from './types.ts'
import ArtCard from './components/ArtCard.tsx'
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
  const query = useDebounced(input, 140).trim()

  useEffect(() => {
    setLimit(PAGE_SIZE)
  }, [query])

  const page = useMemo(() => searchArt(query, limit), [query, limit])

  return (
    <div className="app">
      <header className="masthead">
        <div className="masthead__inner">
          <div className="brand">
            <h1>Azeroth Art Search</h1>
            <p>
              {TOTAL.toLocaleString()} pieces of official World of Warcraft art — concept art, character
              and environment paintings — indexed from the Warcraft Wiki.
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
              onChange={(e) => setInput(e.target.value)}
              placeholder="Search artwork: Illidan, dragon, Sylvanas, Ironforge…"
              aria-label="Search artwork"
              autoComplete="off"
              spellCheck={false}
            />
          </form>
        </div>
      </header>

      <div className="toolbar">
        <div className="chips" role="tablist" aria-label="Collections">
          {QUICK.map((c) => (
            <button
              key={c.label}
              type="button"
              role="tab"
              aria-selected={query === c.query}
              className={`chip${query === c.query ? ' chip--on' : ''}`}
              onClick={() => setInput(c.query)}
            >
              {c.label}
            </button>
          ))}
        </div>
        <span className="tally">
          {page.total.toLocaleString()} {page.total === 1 ? 'match' : 'matches'}
          <span className="tally__sep">·</span>
          {page.items.length.toLocaleString()} shown
        </span>
      </div>

      <main className="stage">
        {page.total === 0 ? (
          <p className="notice">
            No artwork matched “{query}”. Try a character, race, creature or zone — for example
            “Arthas”, “orc”, “Valdrakken” or “old god”.
          </p>
        ) : (
          <>
            <div className="grid">
              {page.items.map((it) => (
                <ArtCard key={it.id} item={it} onOpen={setSelected} />
              ))}
            </div>
            {page.hasMore && (
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
        . World of Warcraft is a trademark of Blizzard Entertainment. Unofficial fan index — artwork
        remains the property of its creators.
      </footer>

      {selected && <Lightbox item={selected} onClose={() => setSelected(null)} />}
    </div>
  )
}
