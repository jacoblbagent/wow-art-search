import fs from 'node:fs'
import { config } from './config.ts'
import { parseQuery, rankByRelevance } from '../shared/match.ts'
import { CATALOGUE_ENABLED } from '../shared/features.ts'
import type { ArtItem } from './types.ts'

interface Row {
  id: number
  title: string
  artist: string | null
  w: number
  h: number
  img: string
  full: string
  page: string
}

/**
 * The bundled index is only read when the catalogue is enabled, so with the
 * flag off the server starts fine even if the data file has been removed.
 */
const rows: Row[] = CATALOGUE_ENABLED ? JSON.parse(fs.readFileSync(config.dataFile, 'utf8')) : []

export const TOTAL = rows.length

function toItem(r: Row): ArtItem {
  return {
    id: String(r.id),
    title: r.title,
    artist: r.artist,
    src: `/images/${r.img}`,
    full: r.full,
    page: r.page,
    w: r.w,
    h: r.h,
    origin: 'index',
  }
}

/**
 * Catalogue search. Results are title/artist matches only — see shared/match.ts
 * for why the wiki prose is not searched.
 */
export function searchIndex(query: string, limit = 24): { items: ArtItem[]; total: number } {
  if (!CATALOGUE_ENABLED) return { items: [], total: 0 }
  const parsed = parseQuery(query)
  if (!parsed.terms.length) return { items: [], total: 0 }
  const matched = rankByRelevance(rows, parsed, (r) => ({ title: r.title, artist: r.artist }))
  return { items: matched.slice(0, limit).map(toItem), total: matched.length }
}

/** Most prolific artists, optionally restricted to a subject ("dragonflight", "weapons"). */
export function artistLeaderboard(
  topic = '',
  limit = 10,
): { artist: string; count: number; sample: string; page: string }[] {
  if (!CATALOGUE_ENABLED) return []
  const parsed = parseQuery(topic)
  const pool = topic.trim()
    ? rankByRelevance(rows, parsed, (r) => ({ title: r.title, artist: r.artist }))
    : rows

  const counts = new Map<string, { n: number; sample: string; page: string }>()
  for (const r of pool) {
    if (!r.artist) continue
    const cur = counts.get(r.artist)
    if (cur) cur.n += 1
    else counts.set(r.artist, { n: 1, sample: r.title, page: r.page })
  }
  return [...counts.entries()]
    .map(([artist, v]) => ({ artist, count: v.n, sample: v.sample, page: v.page }))
    .sort((a, b) => b.count - a.count || a.artist.localeCompare(b.artist))
    .slice(0, limit)
}

/** Distinct artists matching a name fragment — used to resolve "Gonzalez" -> full names. */
export function findArtists(fragment: string, limit = 12): { artist: string; count: number }[] {
  if (!CATALOGUE_ENABLED) return []
  const f = fragment.trim().toLowerCase()
  if (!f) return []
  const counts = new Map<string, number>()
  for (const r of rows) {
    if (!r.artist) continue
    if (r.artist.toLowerCase().includes(f)) counts.set(r.artist, (counts.get(r.artist) ?? 0) + 1)
  }
  return [...counts.entries()]
    .map(([artist, count]) => ({ artist, count }))
    .sort((a, b) => b.count - a.count)
    .slice(0, limit)
}
