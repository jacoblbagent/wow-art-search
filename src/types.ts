export interface ArtItem {
  id: number
  title: string
  artist: string | null
  w: number
  h: number
  /** local file name inside public/images/ */
  img: string
  /** original full-resolution file on the Warcraft Wiki CDN */
  full: string
  page: string
}

export interface Page {
  items: ArtItem[]
  total: number
  hasMore: boolean
}
