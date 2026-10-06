/**
 * Relevance matching shared by the client catalogue search and the server tools,
 * so the two can never drift apart.
 *
 * The rule that matters here: an artwork is only returned when the words that
 * describe its SUBJECT appear in its title or artist name. The wiki page prose is
 * deliberately NOT searched — it is full of incidental mentions ("an archer from
 * Warcraft: Orcs & Humans") that produced results the user could see were
 * unrelated to what they asked for.
 */

/** Words describing the medium rather than the subject: they add score, but never gate a match. */
export const GENERIC_TERMS = new Set([
  'art',
  'arts',
  'artwork',
  'artworks',
  'image',
  'images',
  'illustration',
  'illustrations',
  'concept',
  'concepts',
  'design',
  'designs',
  'sketch',
  'sketches',
  'drawing',
  'drawings',
  'painting',
  'paintings',
  'picture',
  'pictures',
  'piece',
  'pieces',
  'style',
])

export interface ParsedQuery {
  terms: string[]
  distinctive: string[]
  generic: string[]
}

export function escapeRe(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

/**
 * Word-anchored pattern. Terms of 6+ characters match as a word-start prefix (so
 * "dragon" finds "dragons" and "dragonflight"); shorter terms also require a word
 * end within two letters, so "orc" never matches "torch".
 */
export function termPattern(term: string): RegExp {
  const e = escapeRe(term)
  return new RegExp(term.length >= 6 ? `\\b${e}` : `\\b${e}\\w{0,2}\\b`)
}

export function parseQuery(raw: string): ParsedQuery {
  const terms = raw.toLowerCase().split(/\s+/).filter(Boolean)
  return {
    terms,
    distinctive: terms.filter((t) => !GENERIC_TERMS.has(t)),
    generic: terms.filter((t) => GENERIC_TERMS.has(t)),
  }
}

function startingWith(term: string, title: string): boolean {
  return new RegExp(`^${escapeRe(term)}`).test(title)
}

/**
 * Returns a relevance score, or null when the artwork must be excluded.
 *
 * - With subject words in the query, EVERY subject word must appear in the
 *   title/artist. Medium words only add score.
 * - With nothing but medium words ("concept art"), any of them may match, which
 *   makes it a browsing query rather than a false-precision one.
 */
export function relevanceScore(query: ParsedQuery, title: string, artist: string | null): number | null {
  const lowerTitle = title.toLowerCase()
  const haystack = `${lowerTitle} ${(artist ?? '').toLowerCase()}`

  if (query.distinctive.length) {
    let score = 0
    for (const term of query.distinctive) {
      if (!termPattern(term).test(haystack)) return null
      score += 4
      if (startingWith(term, lowerTitle)) score += 3
    }
    for (const term of query.generic) {
      if (termPattern(term).test(haystack)) score += 1
    }
    return score
  }

  let score = 0
  let matched = false
  for (const term of query.terms) {
    if (termPattern(term).test(haystack)) {
      matched = true
      score += 2
    }
    if (startingWith(term, lowerTitle)) score += 2
  }
  return matched ? score : null
}

export function rankByRelevance<T>(
  items: T[],
  query: ParsedQuery,
  get: (item: T) => { title: string; artist: string | null },
): T[] {
  const scored: { item: T; score: number }[] = []
  for (const item of items) {
    const { title, artist } = get(item)
    const score = relevanceScore(query, title, artist)
    if (score !== null) scored.push({ item, score })
  }
  scored.sort((a, b) => b.score - a.score || get(a.item).title.localeCompare(get(b.item).title))
  return scored.map((s) => s.item)
}
