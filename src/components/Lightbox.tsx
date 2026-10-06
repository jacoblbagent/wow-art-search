import { useEffect, useRef } from 'react'
import type { ArtItem } from '../types.ts'
import { CloseIcon, ExternalIcon } from './Icons.tsx'

interface Props {
  item: ArtItem
  onClose: () => void
}

export default function Lightbox({ item, onClose }: Props) {
  const closeRef = useRef<HTMLButtonElement>(null)

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
