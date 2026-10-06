import raw from './data/artworks.json'
import { parseQuery, rankByRelevance } from '../shared/match.ts'
import type { ArtItem, Page } from './types.ts'

type RawArt = Omit<ArtItem, 'src' | 'origin'> & { img: string }

const RAW = raw as unknown as RawArt[]

export const TOTAL = RAW.length

export function imageUrl(img: string): string {
  return `${import.meta.env.BASE_URL}images/${img}`
}

function toItem(r: RawArt): ArtItem {
  return {
    id: String(r.id),
    title: r.title,
    artist: r.artist,
    src: imageUrl(r.img),
    full: r.full,
    page: r.page,
    w: r.w,
    h: r.h,
    origin: 'index',
  }
}

/**
 * Catalogue search, mirroring the server's rule: only title/artist matches, so
 * everything shown visibly relates to what was typed. See shared/match.ts.
 */
export function searchArt(query: string, limit: number): Page {
  const parsed = parseQuery(query)

  if (!parsed.terms.length) {
    return {
      items: RAW.slice(0, limit).map(toItem),
      total: RAW.length,
      hasMore: RAW.length > limit,
    }
  }

  const matched = rankByRelevance(RAW, parsed, (r) => ({ title: r.title, artist: r.artist }))
  return {
    items: matched.slice(0, limit).map(toItem),
    total: matched.length,
    hasMore: matched.length > limit,
  }
}
