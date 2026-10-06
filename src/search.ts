import raw from './data/artworks.json'
import type { ArtItem, Page } from './types.ts'

type RawArt = ArtItem & { ctx: string }

const RAW = raw as unknown as RawArt[]
const INDEX = RAW.map((r) => ({
  r,
  title: r.title.toLowerCase(),
  artist: (r.artist ?? '').toLowerCase(),
  ctx: r.ctx.toLowerCase(),
}))

export const TOTAL = RAW.length

function escapeRe(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

/**
 * Word-anchored pattern. Terms of 6+ characters match as a word-start prefix
 * (so "dragon" finds "dragons" and "dragonflight"); shorter terms also require a
 * word end within two letters, so "orc" never matches "torch" and "mount" never
 * matches "mountain".
 */
function termPattern(term: string): RegExp {
  const e = escapeRe(term)
  return new RegExp(term.length >= 6 ? `\\b${e}` : `\\b${e}\\w{0,2}\\b`)
}

/**
 * Client-side ranked search over the bundled artwork index. Every term must
 * appear somewhere (title, artist or source description); title hits rank above
 * artist hits above description-only hits.
 */
export function searchArt(query: string, limit: number): Page {
  const terms = query.toLowerCase().split(/\s+/).filter(Boolean)

  if (!terms.length) {
    return { items: INDEX.slice(0, limit).map((e) => e.r), total: INDEX.length, hasMore: INDEX.length > limit }
  }

  const patterns = terms.map(termPattern)
  const inTitle = terms.map((t) => new RegExp(`\\b${escapeRe(t)}`))
  const startsTitle = terms.map((t) => new RegExp(`^${escapeRe(t)}`))
  const inArtist = terms.map((t) => new RegExp(`\\b${escapeRe(t)}`))

  const matched = INDEX.filter((e) => patterns.every((p) => p.test(e.ctx)))
  const score = new Map<(typeof INDEX)[number], number>()
  for (const e of matched) {
    let s = 0
    for (let i = 0; i < terms.length; i++) {
      if (inTitle[i].test(e.title)) s += 5
      if (startsTitle[i].test(e.title)) s += 2
      if (inArtist[i].test(e.artist)) s += 3
    }
    score.set(e, s)
  }
  matched.sort((a, b) => (score.get(b) ?? 0) - (score.get(a) ?? 0) || a.r.title.localeCompare(b.r.title))

  return {
    items: matched.slice(0, limit).map((e) => e.r),
    total: matched.length,
    hasMore: matched.length > limit,
  }
}

export function imageUrl(img: string): string {
  return `${import.meta.env.BASE_URL}images/${img}`
}
