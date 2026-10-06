import { config } from './config.ts'
import type { ArtItem } from './types.ts'

interface WikiSearchHit {
  title: string
  snippet?: string
}

interface WikiImageInfo {
  url?: string
  thumburl?: string
  width?: number
  height?: number
  mime?: string
  extmetadata?: Record<string, { value?: string }>
}

interface WikiPage {
  pageid: number
  title: string
  imageinfo?: WikiImageInfo[]
  revisions?: { slots?: { main?: { '*'?: string } } }[]
}

export interface RawArt {
  id: number
  title: string
  artist: string | null
  w: number
  h: number
  full: string
  page: string
  ctx: string
}

const NON_ART =
  /\b(icon|icons|logo|logos|map|maps|minimap|sprite|sprites|flag|banner|achievement|tabard|emote|button|arrow|signpost|tooltip|hud|inventory|screenshot|wowhead|glyph|sigil|crest|frame|border|texture|blp|dds|ogg|mp3|wav|sound|audio|voice|spell|ability|currency|token|cursor|font|rank|badge|pixel|datamine|ptr|beta)\b/i

function stripTags(s: string): string {
  return s.replace(/<[^>]*>/g, '')
}

function decodeEntities(s: string): string {
  return s
    .replace(/&quot;/g, '"')
    .replace(/&#0?39;/g, "'")
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&nbsp;/g, ' ')
}

export function cleanTitle(t: string): string {
  return decodeEntities(
    t.replace(/^File:/i, '').replace(/\.(jpe?g|png|gif|webp|bmp)$/i, '').replace(/_/g, ' '),
  ).trim()
}

export function parseArtist(text: string): string | null {
  const t = decodeEntities(stripTags(text)).replace(/\s+/g, ' ').trim()
  const m =
    t.match(
      /(?:artwork|illustration|image|piece|concept art|concept|art|painted|drawn|created|illustrated)\s+by\s+([^.<;|]{2,50})/i,
    ) ?? t.match(/(?:^|[.\s])by\s+([A-Z][^.<;|]{2,45})/)
  if (!m) return null
  const name = m[1].split('.')[0].replace(/\s+/g, ' ').trim().replace(/[,.]$/, '')
  if (!name || /^(blizzard|unknown|anonymous|the|a|an|and|with|fan)\b/i.test(name)) return null
  if (name.length > 45) return null
  return name
}

export function pageUrl(title: string): string {
  return `https://warcraft.wiki.gg/wiki/${encodeURIComponent(title.replace(/ /g, '_'))}`
}

async function getJson(params: Record<string, string>, timeoutMs = 30000): Promise<Record<string, unknown>> {
  const url = new URL(config.wikiApi)
  url.search = new URLSearchParams({ action: 'query', format: 'json', ...params }).toString()
  const ctrl = new AbortController()
  const timer = setTimeout(() => ctrl.abort(), timeoutMs)
  try {
    const res = await fetch(url, { headers: { 'User-Agent': config.wikiUa, Accept: 'application/json' }, signal: ctrl.signal })
    if (!res.ok) throw new Error(`wiki request failed (${res.status})`)
    return (await res.json()) as Record<string, unknown>
  } finally {
    clearTimeout(timer)
  }
}

/** Live MediaWiki file-namespace search + image info. Returns artwork rows. */
export async function searchWiki(
  query: string,
  limit = 16,
  minWidth = 600,
): Promise<{ items: ArtItem[]; total: number }> {
  const q = query.trim()
  if (!q) return { items: [], total: 0 }

  const searchRes = await getJson({
    list: 'search',
    srsearch: q,
    srnamespace: '6',
    srlimit: String(Math.min(Math.max(limit * 3, 24), 50)),
    srprop: 'snippet',
  })
  const query_ = (searchRes.query ?? {}) as { search?: WikiSearchHit[]; searchinfo?: { totalhits?: number } }
  const hits = query_.search ?? []
  if (!hits.length) return { items: [], total: query_.searchinfo?.totalhits ?? 0 }

  const artistByTitle = new Map<string, string>()
  for (const h of hits) {
    const a = parseArtist(h.snippet ?? '')
    if (a) artistByTitle.set(h.title.replace(/_/g, ' '), a)
  }

  const infoRes = await getJson({
    titles: hits.map((h) => h.title).join('|'),
    prop: 'imageinfo',
    iiprop: 'url|size|mime|extmetadata',
    iiurlwidth: '800',
  })
  const infoQuery = (infoRes.query ?? {}) as { pages?: Record<string, WikiPage> }
  const pages = Object.values(infoQuery.pages ?? {})

  const items: ArtItem[] = []
  for (const p of pages) {
    const ii = p.imageinfo?.[0]
    if (!ii) continue
    const mime = ii.mime ?? ''
    if (!['image/jpeg', 'image/png', 'image/webp'].includes(mime)) continue
    if ((ii.width ?? 0) < minWidth) continue
    const title = cleanTitle(p.title)
    if (NON_ART.test(title)) continue
    const em = ii.extmetadata ?? {}
    const emArtist = stripTags(decodeEntities(String(em.Artist?.value ?? ''))).trim()
    const artist = emArtist && !/unknown/i.test(emArtist) ? emArtist : (artistByTitle.get(p.title.replace(/_/g, ' ')) ?? null)
    const src = ii.thumburl ?? ii.url
    if (!src) continue
    items.push({
      id: String(p.pageid),
      title,
      artist,
      src,
      full: ii.url ?? src,
      page: pageUrl(p.title),
      w: ii.width ?? 0,
      h: ii.height ?? 0,
      origin: 'live',
    })
    if (items.length >= limit) break
  }
  return { items, total: query_.searchinfo?.totalhits ?? items.length }
}

/** File page details: artist, description, categories, source resolution. */
export async function fileDetails(file: string): Promise<Record<string, unknown> | null> {
  const title = /^file:/i.test(file) ? file : `File:${file}`
  const res = await getJson({
    titles: title,
    prop: 'imageinfo|revisions|categories',
    iiprop: 'url|size|mime|extmetadata',
    rvprop: 'content',
    rvslots: 'main',
    cllimit: '30',
  })
  const query_ = (res.query ?? {}) as { pages?: Record<string, WikiPage & { categories?: { title: string }[] }> }
  const page = Object.values(query_.pages ?? {})[0]
  if (!page) return null
  const ii = page.imageinfo?.[0] ?? {}
  const wikitext = page.revisions?.[0]?.slots?.main?.['*'] ?? ''
  const desc = decodeEntities(
    stripTags(
      wikitext
        .replace(/\{\{[^}]*\}\}/g, ' ')
        .replace(/\[\[(?:[^\]|]*\|)?([^\]]*)\]\]/g, '$1')
        .replace(/^==+.*$/gm, ' ')
        .replace(/https?:\/\/\S+/g, ' ')
        .replace(/\s+/g, ' '),
    ),
  ).trim()
  const em = ii.extmetadata ?? {}
  return {
    title: cleanTitle(page.title),
    artist: parseArtist(wikitext) ?? (String(em.Artist?.value ?? '').trim() || null),
    description: desc.slice(0, 700),
    categories: (page.categories ?? []).map((c) => c.title.replace(/^Category:/, '')).slice(0, 20),
    width: ii.width ?? null,
    height: ii.height ?? null,
    mime: ii.mime ?? null,
    fileUrl: ii.url ?? null,
    page: pageUrl(page.title),
  }
}

/** Plain-text intro of a wiki article — for lore/context questions. */
export async function articleSummary(topic: string): Promise<{ title: string; extract: string; page: string } | null> {
  const res = await getJson({
    titles: topic,
    prop: 'extracts',
    exintro: '1',
    explaintext: '1',
    exlimit: '1',
    redirects: '1',
  })
  const query_ = (res.query ?? {}) as { pages?: { title: string; extract?: string; missing?: boolean }[] }
  const page = Object.values(query_.pages ?? {})[0]
  if (!page || page.missing || !page.extract) return null
  return { title: page.title, extract: page.extract.slice(0, 1500), page: pageUrl(page.title) }
}
