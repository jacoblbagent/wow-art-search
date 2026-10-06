import { useCallback, useEffect, useMemo, useState } from 'react'
import { TOTAL, searchArt } from './search.ts'
import { CATALOGUE_ENABLED } from '../shared/features.ts'
import type { ArtItem } from './types.ts'
import {
  addToProject,
  createProject as apiCreateProject,
  deleteProject as apiDeleteProject,
  fetchProjects,
  removeFromProject,
  renameProject as apiRenameProject,
} from './projects.ts'
import type { Project } from './projects.ts'
import ArtCard from './components/ArtCard.tsx'
import AgentPanel from './components/AgentPanel.tsx'
import Lightbox from './components/Lightbox.tsx'
import ProjectsPanel from './components/ProjectsPanel.tsx'
import SkeletonGrid from './components/SkeletonGrid.tsx'
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
const EMPTY_PAGE = { items: [], total: 0, hasMore: false } as const

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
  const [hasBackend, setHasBackend] = useState<boolean | null>(null)
  /** the active chat is mid-answer — drives the loading skeleton */
  const [busy, setBusy] = useState(false)
  /** the active chat has been used at all — flips the layout to split view */
  const [started, setStarted] = useState(false)
  const [projects, setProjects] = useState<Project[]>([])
  /** where new saves go — also the highlighted row */
  const [activeProjectId, setActiveProjectId] = useState<string | null>(null)
  /** which project's images the gallery is showing (null = nothing selected) */
  const [viewingProjectId, setViewingProjectId] = useState<string | null>(null)
  const [projectError, setProjectError] = useState<string | null>(null)
  const query = useDebounced(input, 140).trim()

  useEffect(() => {
    setLimit(PAGE_SIZE)
  }, [query])

  useEffect(() => {
    let alive = true
    fetch('/api/health')
      .then((r) => alive && setHasBackend(r.ok))
      .catch(() => alive && setHasBackend(false))
    fetchProjects()
      .then((list) => alive && setProjects(list))
      .catch(() => undefined)
    return () => {
      alive = false
    }
  }, [])

  const page = useMemo(
    () => (CATALOGUE_ENABLED ? searchArt(query, limit) : EMPTY_PAGE),
    [query, limit],
  )
  const activeProject = useMemo(
    () => projects.find((p) => p.id === activeProjectId) ?? null,
    [projects, activeProjectId],
  )
  const viewingProject = useMemo(
    () => projects.find((p) => p.id === viewingProjectId) ?? null,
    [projects, viewingProjectId],
  )
  const savedSrcs = useMemo(() => new Set(activeProject?.items.map((i) => i.src) ?? []), [activeProject])

  // Saving into a project must not yank you out of the results, so the grid
  // only follows a project when you explicitly click it. An empty project also
  // keeps showing the previous results, or you would have nothing to save from.
  const projectEmpty = Boolean(viewingProject && viewingProject.items.length === 0)
  const showing = agentItems?.length
    ? agentItems
    : viewingProject && !projectEmpty
      ? viewingProject.items
      : page.items
  const viewingResults = Boolean(agentItems?.length || (viewingProject && !projectEmpty))

  /**
   * The landing view is a big chat canvas beside the sidebar. It splits into
   * sidebar | gallery | chat as soon as there is something to show on the left
   * — a question has been asked, or a project is open. With the catalogue flag
   * on it always splits, because the search box and its chips live there.
   */
  const split = CATALOGUE_ENABLED || started || Boolean(viewingProject) || showing.length > 0

  // The gallery mirrors whichever chat is active in the agent panel.
  const showResults = useCallback((items: ArtItem[] | null) => {
    setAgentItems(items)
    if (items?.length) setViewingProjectId(null)
  }, [])
  const showBusy = useCallback((value: boolean) => setBusy(value), [])
  const showStarted = useCallback((value: boolean) => setStarted(value), [])

  const contextLine = agentItems?.length ? null : viewingProject ? (
    <>
      Viewing project <strong>{viewingProject.name}</strong> — {viewingProject.items.length} saved
    </>
  ) : activeProject ? (
    <>
      Saving into <strong>{activeProject.name}</strong> — {activeProject.items.length} saved
    </>
  ) : null

  const emptyCopy = projectEmpty && viewingProject
    ? `Nothing saved in ${viewingProject.name} yet — hover an artwork and press the bookmark to add it.`
    : agentItems
      ? 'No artwork came back for that. Try naming a character, a race or a zone.'
      : 'Ask the agent for artwork and what it finds will appear here.'

  const browse = (q: string) => {
    setAgentItems(null)
    setViewingProjectId(null)
    setInput(q)
  }

  const replaceProject = (updated: Project) => {
    setProjects((prev) => prev.map((p) => (p.id === updated.id ? updated : p)))
  }

  const toggleSave = async (projectId: string, item: ArtItem) => {
    const project = projects.find((p) => p.id === projectId)
    if (!project) return
    setProjectError(null)
    try {
      const saved = project.items.some((i) => i.src === item.src)
      replaceProject(saved ? await removeFromProject(projectId, item.src) : await addToProject(projectId, item))
    } catch (e) {
      setProjectError((e as Error).message)
    }
  }

  const toggleSaveForActive = (item: ArtItem) => {
    if (activeProject) void toggleSave(activeProject.id, item)
  }

  const createAndSave = async (name: string, item: ArtItem) => {
    setProjectError(null)
    try {
      const project = await apiCreateProject(name)
      setProjects((prev) => [...prev, project])
      replaceProject(await addToProject(project.id, item))
    } catch (e) {
      setProjectError((e as Error).message)
    }
  }

  const createProject = async (name: string) => {
    setProjectError(null)
    try {
      const project = await apiCreateProject(name)
      setProjects((prev) => [...prev, project])
      setActiveProjectId(project.id)
      setViewingProjectId(null)
    } catch (e) {
      setProjectError((e as Error).message)
    }
  }

  const renameProject = async (id: string, name: string) => {
    setProjectError(null)
    try {
      replaceProject(await apiRenameProject(id, name))
    } catch (e) {
      setProjectError((e as Error).message)
    }
  }

  const deleteProject = async (id: string) => {
    setProjectError(null)
    try {
      await apiDeleteProject(id)
      setProjects((prev) => prev.filter((p) => p.id !== id))
      if (activeProjectId === id) setActiveProjectId(null)
      if (viewingProjectId === id) setViewingProjectId(null)
    } catch (e) {
      setProjectError((e as Error).message)
    }
  }

  const selectedSavedIds = selected
    ? projects.filter((p) => p.items.some((i) => i.src === selected.src)).map((p) => p.id)
    : []

  const tally = viewingResults ? (
    <button
      type="button"
      className="tally__reset"
      onClick={() => {
        setAgentItems(null)
        setViewingProjectId(null)
      }}
    >
      Clear results
    </button>
  ) : null

  return (
    <>
      <div className="app">
        <h1 className="sr-only">Azeroth Art Search</h1>

        {hasBackend === false && (
          <p className="notice notice--warn">
            The agent backend isn’t running, so the agent and projects are unavailable. Start it with{' '}
            <code>npm start</code>.
          </p>
        )}
        {projectError && <p className="notice notice--warn">{projectError}</p>}

        <div className={`layout layout--${split ? 'split' : 'focus'}`}>
          <ProjectsPanel
            projects={projects}
            activeId={activeProjectId}
            onSelect={(id) => {
              setActiveProjectId(id)
              setViewingProjectId(id)
              if (id) setAgentItems(null)
            }}
            onCreate={createProject}
            onRename={renameProject}
            onDelete={deleteProject}
            disabled={hasBackend === false}
          />

          {split && (
            <main className="stage" aria-busy={busy || undefined}>
              {CATALOGUE_ENABLED && (
                <div className="toolbar">
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
                        setViewingProjectId(null)
                        setInput(e.target.value)
                      }}
                      placeholder={`Search ${TOTAL.toLocaleString()} catalogued artworks: Illidan, dragon, Ironforge…`}
                      aria-label="Search the catalogue"
                      autoComplete="off"
                      spellCheck={false}
                    />
                  </form>
                  <div className="toolbar__row">
                    <div className="chips" role="tablist" aria-label="Collections">
                      {QUICK.map((c) => (
                        <button
                          key={c.label}
                          type="button"
                          role="tab"
                          aria-selected={!viewingResults && query === c.query}
                          className={`chip${!viewingResults && query === c.query ? ' chip--on' : ''}`}
                          onClick={() => browse(c.query)}
                        >
                          {c.label}
                        </button>
                      ))}
                    </div>
                    {tally}
                  </div>
                </div>
              )}

              {showing.length > 0 ? (
                <>
                  {contextLine && <p className="viewing">{contextLine}</p>}
                  <div className="grid">
                    {showing.map((it) => (
                      <ArtCard
                        key={`${it.origin}-${it.id}`}
                        item={it}
                        onOpen={setSelected}
                        saved={activeProject ? savedSrcs.has(it.src) : undefined}
                        onToggleSave={activeProject ? toggleSaveForActive : undefined}
                      />
                    ))}
                  </div>
                  {!viewingResults && page.hasMore && (
                    <div className="more">
                      <button type="button" className="ghost" onClick={() => setLimit((v) => v + PAGE_SIZE)}>
                        Show more artwork ({page.total - page.items.length} left)
                      </button>
                    </div>
                  )}
                </>
              ) : busy ? (
                <SkeletonGrid />
              ) : (
                <p className="notice">{emptyCopy}</p>
              )}
            </main>
          )}

          <AgentPanel
            onResults={showResults}
            onBusy={showBusy}
            onStarted={showStarted}
            disabled={hasBackend === false}
          />
        </div>

        {selected && (
          <Lightbox
            item={selected}
            onClose={() => setSelected(null)}
            projects={projects}
            savedProjectIds={selectedSavedIds}
            onToggleSave={(projectId, item) => void toggleSave(projectId, item)}
            onCreateAndSave={(name, item) => void createAndSave(name, item)}
          />
        )}
      </div>

      {/* Sits outside .app so it falls below the fold — one screen of app, then
          scroll for the credits. */}
      <footer className="colophon">
        <p>
          Artwork and metadata come from the{' '}
          <a href="https://warcraft.wiki.gg/" target="_blank" rel="noreferrer noopener">
            Warcraft Wiki
          </a>
          . Answers are generated by a local model and can be wrong — check the linked sources. World
          of Warcraft is a trademark of Blizzard Entertainment. Unofficial fan index.
        </p>
      </footer>
    </>
  )
}
