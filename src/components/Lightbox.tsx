import { useEffect, useRef, useState } from 'react'
import type { ArtItem } from '../types.ts'
import type { Project } from '../projects.ts'
import { CloseIcon, ExternalIcon, PlusIcon } from './Icons.tsx'

interface Props {
  item: ArtItem
  onClose: () => void
  projects: Project[]
  savedProjectIds: string[]
  onToggleSave: (projectId: string, item: ArtItem) => void
  onCreateAndSave: (name: string, item: ArtItem) => void
}

export default function Lightbox({
  item,
  onClose,
  projects,
  savedProjectIds,
  onToggleSave,
  onCreateAndSave,
}: Props) {
  const closeRef = useRef<HTMLButtonElement>(null)
  const [creating, setCreating] = useState(false)
  const [name, setName] = useState('')

  useEffect(() => {
    closeRef.current?.focus()
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
    }
    document.addEventListener('keydown', onKey)
    const prev = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => {
      document.removeEventListener('keydown', onKey)
      document.body.style.overflow = prev
    }
  }, [onClose])

  const commit = () => {
    const clean = name.trim()
    if (clean) onCreateAndSave(clean, item)
    setName('')
    setCreating(false)
  }

  return (
    <div className="lightbox" role="dialog" aria-modal="true" aria-label={item.title} onClick={onClose}>
      <div className="lightbox__panel" onClick={(e) => e.stopPropagation()}>
        <button ref={closeRef} type="button" className="lightbox__close" onClick={onClose} aria-label="Close">
          <CloseIcon />
        </button>
        <div className="lightbox__figure">
          <img src={item.src} alt={item.title} decoding="async" />
        </div>
        <div className="lightbox__info">
          <h2 className="lightbox__title">{item.title}</h2>
          <dl className="lightbox__facts">
            <div>
              <dt>Artist</dt>
              <dd>{item.artist ?? 'Uncredited'}</dd>
            </div>
            {item.w && item.h ? (
              <div>
                <dt>Source resolution</dt>
                <dd>
                  {item.w} × {item.h}
                </dd>
              </div>
            ) : null}
            <div>
              <dt>Source</dt>
              <dd>{item.origin === 'live' ? 'Warcraft Wiki (live search)' : 'Warcraft Wiki (indexed)'}</dd>
            </div>
          </dl>

          <div className="save">
            <span className="save__label">Save to</span>
            <div className="save__list">
              {projects.map((project) => {
                const on = savedProjectIds.includes(project.id)
                return (
                  <button
                    key={project.id}
                    type="button"
                    className={`chip${on ? ' chip--on' : ''}`}
                    aria-pressed={on}
                    title={on ? `Remove from ${project.name}` : `Save to ${project.name}`}
                    onClick={() => onToggleSave(project.id, item)}
                  >
                    {project.name}
                  </button>
                )
              })}
              {creating ? (
                <input
                  className="save__input"
                  value={name}
                  autoFocus
                  maxLength={40}
                  placeholder="Project name"
                  aria-label="New project name"
                  onChange={(e) => setName(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') commit()
                    if (e.key === 'Escape') {
                      setName('')
                      setCreating(false)
                    }
                  }}
                  onBlur={commit}
                />
              ) : (
                <button type="button" className="chip" onClick={() => setCreating(true)}>
                  <PlusIcon />
                  New project
                </button>
              )}
            </div>
          </div>

          <div className="lightbox__links">
            {item.full && (
              <a href={item.full} target="_blank" rel="noreferrer noopener">
                Full resolution <ExternalIcon />
              </a>
            )}
            <a href={item.page} target="_blank" rel="noreferrer noopener">
              Warcraft Wiki file <ExternalIcon />
            </a>
          </div>
        </div>
      </div>
    </div>
  )
}
