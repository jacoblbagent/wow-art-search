import raw from './data/artworks.json'
import { parseQuery, rankByRelevance } from '../shared/match.ts'
import { CATALOGUE_ENABLED } from '../shared/features.ts'
import type { ArtItem, Page } from './types.ts'

type RawArt = Omit<ArtItem, 'src' | 'origin'> & { img: string }

const RAW = raw as unknown as RawArt[]

export const TOTAL = CATALOGUE_ENABLED ? RAW.length : 0

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

const EMPTY: Page = { items: [], total: 0, hasMore: false }

/**
 * Catalogue search, mirroring the server's rule: only title/artist matches, so
 * everything shown visibly relates to what was typed. See shared/match.ts.
 *
 * Returns nothing while the catalogue flag is off — the app then has no bundled
 * artwork at all, and every result comes from the agent's live-wiki search.
 */
export function searchArt(query: string, limit: number): Page {
  if (!CATALOGUE_ENABLED) return EMPTY

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
