import type { ArtItem } from '../types.ts'

interface Props {
  item: ArtItem
  onOpen: (item: ArtItem) => void
}

export default function ArtCard({ item, onOpen }: Props) {
  return (
    <button type="button" className="card" onClick={() => onOpen(item)}>
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
  )
}
