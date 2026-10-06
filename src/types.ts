export interface ArtItem {
  id: string
  title: string
  artist: string | null
  /** ready-to-use image URL — local `/images/...` or a remote wiki thumbnail */
  src: string
  /** original full-resolution file, when known */
  full?: string
  page: string
  w?: number
  h?: number
  origin: 'index' | 'live'
}

export interface Page {
  items: ArtItem[]
  total: number
  hasMore: boolean
}

export interface Citation {
  label: string
  url: string
}

export interface ChatTurn {
  role: 'user' | 'assistant'
  content: string
  citations?: Citation[]
  steps?: number
}
