import type { ArtItem } from '../types.ts'
import { BookmarkIcon } from './Icons.tsx'

interface Props {
  item: ArtItem
  onOpen: (item: ArtItem) => void
  saved?: boolean
  onToggleSave?: (item: ArtItem) => void
}

export default function ArtCard({ item, onOpen, saved, onToggleSave }: Props) {
  return (
    <div className="card">
      <button type="button" className="card__open" onClick={() => onOpen(item)}>
        <span className="card__frame">
          <img src={item.src} alt={item.title} loading="lazy" decoding="async" />
        </span>
        <span className="card__meta">
          <span className="card__title">{item.title}</span>
          <span className="card__artist">
            {item.artist ?? 'Uncredited'}
            {item.origin === 'live' && <span className="card__flag">live wiki</span>}
          </span>
        </span>
      </button>
      {onToggleSave && (
        <button
          type="button"
          className={`card__save${saved ? ' card__save--on' : ''}`}
          aria-pressed={Boolean(saved)}
          title={saved ? 'Remove from project' : 'Save to project'}
          aria-label={saved ? `Remove ${item.title} from the project` : `Save ${item.title} to the project`}
          onClick={() => onToggleSave(item)}
        >
          <BookmarkIcon />
        </button>
      )}
    </div>
  )
}
