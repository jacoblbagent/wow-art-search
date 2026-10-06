export interface ArtItem {
  id: string
  title: string
  artist: string | null
  /** ready-to-use image URL (local index path or remote wiki thumb) */
  src: string
  full?: string
  page: string
  w?: number
  h?: number
  origin: 'index' | 'live'
}
