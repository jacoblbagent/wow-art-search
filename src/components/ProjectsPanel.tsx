import { useEffect, useRef, useState } from 'react'
import type { Project } from '../projects.ts'
import { CloseIcon, PlusIcon } from './Icons.tsx'

interface Props {
  projects: Project[]
  activeId: string | null
  onSelect: (id: string | null) => void
  onCreate: (name: string) => void
  onRename: (id: string, name: string) => void
  onDelete: (id: string) => void
  disabled?: boolean
}

export default function ProjectsPanel({
  projects,
  activeId,
  onSelect,
  onCreate,
  onRename,
  onDelete,
  disabled,
}: Props) {
  const [creating, setCreating] = useState(false)
  const [draftName, setDraftName] = useState('')
  const [editingId, setEditingId] = useState<string | null>(null)
  const [editName, setEditName] = useState('')
  const newInput = useRef<HTMLInputElement>(null)

  useEffect(() => {
    if (creating) newInput.current?.focus()
  }, [creating])

  const commitCreate = () => {
    const name = draftName.trim()
    if (name) onCreate(name)
    setDraftName('')
    setCreating(false)
  }

  const commitRename = () => {
    const name = editName.trim()
    if (editingId && name) onRename(editingId, name)
    setEditingId(null)
    setEditName('')
  }

  return (
    <aside className="projects" aria-label="Projects">
      <div className="projects__head">
        <h2>Projects</h2>
        {!creating && (
          <button
            type="button"
            className="seeds__more"
            onClick={() => setCreating(true)}
            disabled={disabled}
            aria-label="New project"
          >
            <PlusIcon />
            New
          </button>
        )}
      </div>

      {creating && (
        <input
          ref={newInput}
          className="projects__input"
          value={draftName}
          onChange={(e) => setDraftName(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') commitCreate()
            if (e.key === 'Escape') {
              setDraftName('')
              setCreating(false)
            }
          }}
          onBlur={commitCreate}
          placeholder="Project name"
          aria-label="New project name"
          maxLength={40}
        />
      )}

      {projects.length === 0 && !creating && (
        <p className="projects__empty">No projects yet. Make one, then save artwork into it.</p>
      )}

      <ul className="projects__list">
        {projects.map((project) => {
          const isActive = project.id === activeId
          if (editingId === project.id) {
            return (
              <li key={project.id}>
                <input
                  className="projects__input"
                  value={editName}
                  autoFocus
                  onChange={(e) => setEditName(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') commitRename()
                    if (e.key === 'Escape') setEditingId(null)
                  }}
                  onBlur={commitRename}
                  aria-label={`Rename ${project.name}`}
                  maxLength={40}
                />
              </li>
            )
          }
          return (
            <li key={project.id} className={`projects__row${isActive ? ' projects__row--on' : ''}`}>
              <button
                type="button"
                className="projects__open"
                aria-current={isActive ? 'true' : undefined}
                title={project.name}
                onClick={() => onSelect(project.id)}
                onDoubleClick={() => {
                  setEditingId(project.id)
                  setEditName(project.name)
                }}
              >
                <span className="projects__name">{project.name}</span>
                <span className="projects__count">{project.items.length}</span>
              </button>
              <button
                type="button"
                className="projects__close"
                aria-label={`Delete ${project.name}`}
                onClick={() => onDelete(project.id)}
              >
                <CloseIcon />
              </button>
            </li>
          )
        })}
      </ul>
    </aside>
  )
}
