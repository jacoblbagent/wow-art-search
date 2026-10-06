import type { ArtItem } from '../types.ts'
import { imageUrl } from '../search.ts'

interface Props {
  item: ArtItem
  onOpen: (item: ArtItem) => void
}

export default function ArtCard({ item, onOpen }: Props) {
  return (
    <button type="button" className="card" onClick={() => onOpen(item)}>
      <span className="card__frame">
        <img src={imageUrl(item.img)} alt={item.title} loading="lazy" decoding="async" />
      </span>
      <span className="card__meta">
        <span className="card__title">{item.title}</span>
        {item.artist && <span className="card__artist">{item.artist}</span>}
      </span>
    </button>
  )
}
