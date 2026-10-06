# Index build scripts

These regenerate `src/data/artworks.json` and `public/images/*.webp` from the
Warcraft Wiki. They are not part of the site build — run them only when you want
to refresh the artwork index.

Run in order (from the repo root), with Pillow available:

```bash
python3 tools/harvest.py      # ~125 wiki searches -> /tmp/artworks_raw.json
python3 tools/build_index.py  # download + convert -> public/images + src/data/artworks.json
python3 tools/clean_index.py  # trim artist credits, strip version/generic title prefixes
python3 tools/clean2.py       # strip leading punctuation, youtube/timecode noise
python3 tools/clean3.py       # strip trailing "by <Artist>" duplications
```

Notes:

- `harvest.py` uses the MediaWiki API on `warcraft.wiki.gg`. Use a plain
  (non-browser) User-Agent — Cloudflare challenges browser-shaped requests.
- `build_index.py` is threaded; re-runs skip images already on disk.
- `clean*.py` also delete WebP files whose rows were dropped, so run them after
  `build_index.py` and then rebuild the site.
- The index deliberately stores only `id, title, artist, w, h, img, full, page`.
  Wiki page prose (`ctx`) is **not** stored or searched — matching is title/artist
  only (see `shared/match.ts`), which is what keeps results relevant. Don't
  reintroduce a prose field into the search path.
- Keep image width/quality settings in `build_index.py` in mind — the repo is
  ~60 MB of WebP at 640 px / quality 72.
