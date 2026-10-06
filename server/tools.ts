import { artistLeaderboard, findArtists, searchIndex } from './artindex.ts'
import { articleSummary, fileDetails, searchWiki } from './wiki.ts'
import type { ArtItem } from './types.ts'

export interface ToolOutcome {
  /** JSON-serialisable payload handed back to the model. */
  result: unknown
  /** Plain-language status line streamed to the user. */
  status: string
  /** Artwork cards to surface in the UI. */
  artworks: ArtItem[]
  /** Source URLs the answer drew on. */
  citations: { label: string; url: string }[]
}

export const toolSchemas = [
  {
    type: 'function' as const,
    function: {
      name: 'search_index',
      description:
        'Search the local index of 2,090 catalogued World of Warcraft artworks. Fast, offline, and the best first call for any art request. Matches on artwork TITLES and ARTIST NAMES only, so every result is visibly relevant: each returned title contains your search words. Generic words such as "art", "concept" or "wallpaper" are treated as optional, so "orc concept art" really means "orc".',
      parameters: {
        type: 'object',
        properties: {
          query: { type: 'string', description: 'Keywords, e.g. "dragon concept art", "Sylvanas", "nerubian architecture".' },
          limit: { type: 'integer', description: 'Max results (default 24).' },
        },
        required: ['query'],
      },
    },
  },
  {
    type: 'function' as const,
    function: {
      name: 'search_wiki',
      description:
        'Search the live Warcraft Wiki file library. Use when the local index has nothing, or when the user wants fan art, newer pieces, or anything not catalogued. Slower.',
      parameters: {
        type: 'object',
        properties: {
          query: { type: 'string', description: 'Search terms.' },
          limit: { type: 'integer', description: 'Max results (default 16).' },
        },
        required: ['query'],
      },
    },
  },
  {
    type: 'function' as const,
    function: {
      name: 'get_file_details',
      description:
        'Get full details for one artwork file: credited artist, description, categories, and original resolution. Use to verify the artist of a specific piece or to answer questions about it.',
      parameters: {
        type: 'object',
        properties: { file: { type: 'string', description: 'File name, with or without the "File:" prefix.' } },
        required: ['file'],
      },
    },
  },
  {
    type: 'function' as const,
    function: {
      name: 'artist_leaderboard',
      description:
        'Count catalogued artworks per artist, optionally filtered by a subject. Use for questions like "who made the most Dragonflight art".',
      parameters: {
        type: 'object',
        properties: {
          topic: { type: 'string', description: 'Optional subject filter, e.g. "dragonflight", "weapons", "nerubian".' },
          limit: { type: 'integer', description: 'How many artists to return (default 10).' },
        },
      },
    },
  },
  {
    type: 'function' as const,
    function: {
      name: 'find_artists',
      description: 'Resolve a partial artist name (e.g. "Gonzalez") to full credited names with artwork counts.',
      parameters: {
        type: 'object',
        properties: {
          fragment: { type: 'string', description: 'Name fragment.' },
          limit: { type: 'integer', description: 'Max names (default 12).' },
        },
        required: ['fragment'],
      },
    },
  },
  {
    type: 'function' as const,
    function: {
      name: 'wiki_article',
      description:
        'Read the opening summary of a Warcraft Wiki article. Use for lore or context questions about a character, race, zone or expansion.',
      parameters: {
        type: 'object',
        properties: { topic: { type: 'string', description: 'Article title, e.g. "Sylvanas Windrunner".' } },
        required: ['topic'],
      },
    },
  },
]

export const TOOL_NAMES = toolSchemas.map((t) => t.function.name)

function argNum(v: unknown, fallback: number): number {
  const n = Number(v)
  return Number.isFinite(n) && n > 0 ? Math.min(Math.floor(n), 50) : fallback
}

function argStr(v: unknown): string {
  return typeof v === 'string' ? v : String(v ?? '')
}

/** Trim artwork payloads so tool results stay small in the context window. */
function slim(items: ArtItem[]) {
  return items.map((i) => ({ title: i.title, artist: i.artist, page: i.page, src: i.src, origin: i.origin }))
}

export async function executeTool(name: string, args: Record<string, unknown>): Promise<ToolOutcome> {
  switch (name) {
    case 'search_index': {
      const query = argStr(args.query)
      const { items, total } = searchIndex(query, argNum(args.limit, 24))
      return {
        result: { query, total_matches: total, returned: items.length, artworks: slim(items) },
        status: `Searching the catalogue for “${query}”`,
        artworks: items,
        citations: [],
      }
    }
    case 'search_wiki': {
      const query = argStr(args.query)
      const { items, total } = await searchWiki(query, argNum(args.limit, 16))
      return {
        result: { query, total_matches: total, returned: items.length, artworks: slim(items) },
        status: `Searching the live wiki for “${query}”`,
        artworks: items,
        citations: [],
      }
    }
    case 'get_file_details': {
      const file = argStr(args.file)
      const details = await fileDetails(file)
      return {
        result: details ?? { error: `No wiki file page found for “${file}”.` },
        status: `Reading the wiki page for “${file}”`,
        artworks: [],
        citations: details ? [{ label: String(details.title), url: String(details.page) }] : [],
      }
    }
    case 'artist_leaderboard': {
      const topic = argStr(args.topic)
      const board = artistLeaderboard(topic, argNum(args.limit, 10))
      return {
        result: { topic: topic || 'all artworks', artists: board },
        status: topic ? `Counting artists for “${topic}”` : 'Counting artworks per artist',
        artworks: [],
        citations: [],
      }
    }
    case 'find_artists': {
      const fragment = argStr(args.fragment)
      const names = findArtists(fragment, argNum(args.limit, 12))
      return {
        result: { fragment, artists: names },
        status: `Looking up artists matching “${fragment}”`,
        artworks: [],
        citations: [],
      }
    }
    case 'wiki_article': {
      const topic = argStr(args.topic)
      const summary = await articleSummary(topic)
      return {
        result: summary ?? { error: `No wiki article found for “${topic}”.` },
        status: `Reading the wiki article “${topic}”`,
        artworks: [],
        citations: summary ? [{ label: summary.title, url: summary.page }] : [],
      }
    }
    default:
      return { result: { error: `Unknown tool “${name}”.` }, status: '', artworks: [], citations: [] }
  }
}
