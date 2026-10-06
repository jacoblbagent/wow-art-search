# Azeroth Art Search

A World of Warcraft art search engine — search 2,000+ pieces of official Blizzard artwork
(concept art, character paintings, environment plates, wallpapers) by character, race, creature,
zone or artist.

**🔗 Live:** https://jacoblbagent.github.io/wow-art-search/

## What it does

- Instant client-side search across the whole bundled index — every term must match, and title
  hits rank above artist hits above description hits.
- Quick collection chips (Concept Art, Characters, Creatures, Dragons, Environments, Weapons &
  Armor, Cities, All Artwork).
- Paged results grid with lazy-loaded images; click any piece for a lightbox with artist credit,
  source resolution and links to the full-resolution file and its wiki page.
- Keyboard accessible: Escape closes the lightbox, focus rings everywhere, `prefers-reduced-motion`
  respected.

## Data

Artwork and metadata are harvested from the [Warcraft Wiki](https://warcraft.wiki.gg/) (MediaWiki
API, file namespace). The site ships a **local index** (`src/data/artworks.json`) plus locally
converted WebP images (`public/images/`), so search is instant and needs no runtime API calls and
no CORS proxy. A "Full resolution" link in the lightbox points back at the original wiki file.

This is an unofficial fan index. World of Warcraft and all artwork are the property of Blizzard
Entertainment and the credited artists.

## Stack

React 19 + TypeScript + Vite + SCSS. No backend.

## Quick start

```bash
npm install
npm run dev        # http://localhost:5176 (or 5173)
npm run build      # production build into dist/
npm run deploy     # publish dist/ to the gh-pages branch
```

Dev server serves at `/`; the production build uses the `/wow-art-search/` base path for GitHub
Pages. Deployed with the `gh-pages` npm package (`--dotfiles` keeps `.nojekyll`).

## Regenerating the index

The index is built by the scripts in `tools/` (see `tools/README.md`):

1. `harvest.py` — runs ~125 MediaWiki file-namespace searches, resolves image info, and extracts
   artist credits from page wikitext into `/tmp/artworks_raw.json`.
2. `build_index.py` — downloads 640px thumbnails, converts them to WebP, and writes
   `src/data/artworks.json` + `public/images/*.webp`.
3. `clean_index.py`, `clean2.py`, `clean3.py` — tidy artist credits and titles, prune orphan images.
