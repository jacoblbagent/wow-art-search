import fs from 'node:fs'
import { config } from './config.ts'
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
  ctx: string
}

const rows: Row[] = JSON.parse(fs.readFileSync(config.dataFile, 'utf8'))

export const TOTAL = rows.length

const INDEX = rows.map((r) => ({
  r,
  title: r.title.toLowerCase(),
  artist: (r.artist ?? '').toLowerCase(),
  ctx: r.ctx.toLowerCase(),
}))

function escapeRe(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

/** Same matching rule the client uses: word-anchored, prefix for 6+ char terms. */
function termPattern(term: string): RegExp {
  const e = escapeRe(term)
  return new RegExp(term.length >= 6 ? `\\b${e}` : `\\b${e}\\w{0,2}\\b`)
}

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

export function searchIndex(query: string, limit = 24): { items: ArtItem[]; total: number } {
  const terms = query.toLowerCase().split(/\s+/).filter(Boolean)
  if (!terms.length) return { items: [], total: 0 }
  const patterns = terms.map(termPattern)
  const matched = INDEX.filter((e) => patterns.every((p) => p.test(e.ctx)))
  matched.sort((a, b) => a.r.title.localeCompare(b.r.title))
  return { items: matched.slice(0, limit).map((e) => toItem(e.r)), total: matched.length }
}

/** Most prolific artists, optionally restricted to a subject ("dragonflight", "weapons"). */
export function artistLeaderboard(
  topic = '',
  limit = 10,
): { artist: string; count: number; sample: string; page: string }[] {
  const term = topic.trim().toLowerCase()
  const p = term ? termPattern(term) : null
  const counts = new Map<string, { n: number; sample: string; page: string }>()
  for (const e of INDEX) {
    if (!e.r.artist) continue
    if (p && !p.test(e.ctx)) continue
    const key = e.r.artist
    const cur = counts.get(key)
    if (cur) cur.n += 1
    else counts.set(key, { n: 1, sample: e.r.title, page: e.r.page })
  }
  return [...counts.entries()]
    .map(([artist, v]) => ({ artist, count: v.n, sample: v.sample, page: v.page }))
    .sort((a, b) => b.count - a.count || a.artist.localeCompare(b.artist))
    .slice(0, limit)
}

/** Distinct artists matching a name fragment — used to resolve "Gonzalez" -> full names. */
export function findArtists(fragment: string, limit = 12): { artist: string; count: number }[] {
  const f = fragment.trim().toLowerCase()
  if (!f) return []
  const counts = new Map<string, number>()
  for (const e of INDEX) {
    if (!e.r.artist) continue
    if (e.artist.includes(f)) counts.set(e.r.artist, (counts.get(e.r.artist) ?? 0) + 1)
  }
  return [...counts.entries()]
    .map(([artist, count]) => ({ artist, count }))
    .sort((a, b) => b.count - a.count)
    .slice(0, limit)
}
