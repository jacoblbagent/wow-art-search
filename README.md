# Azeroth Art Search

A World of Warcraft art explorer: a local-model agent that searches the Warcraft Wiki, credits
artists, saves what you find into projects, and answers questions with sources.

- **🤖 Agent app (self-hosted):** http://jlb-hermes.tail1caa84.ts.net:3090 — runs on this machine,
  reachable over Tailscale

> **The bundled catalogue is switched off.** `shared/features.ts` exports
> `CATALOGUE_ENABLED = false`, and the app is being built as an agent-first tool — as though the
> pre-loaded index never existed. Nothing below depends on the flag being off; see
> [The catalogue flag](#the-catalogue-flag) to turn it back on.

## What the agent does

Ask in plain English. The agent calls tools, then answers in a sentence or two and drops the
matching artwork into the gallery.

| Tool | Purpose | Needs the catalogue |
|---|---|---|
| `search_wiki` | live Warcraft Wiki file search (server-side, so Cloudflare doesn't block it) | no |
| `get_file_details` | credited artist, description, categories, original resolution for one file | no |
| `wiki_article` | opening summary of a wiki article, for lore context | no |
| `search_index` | the bundled 2,090-artwork index — fast, offline | **yes** |
| `artist_leaderboard` | "who painted the most Dragonflight art?" | **yes** |
| `find_artists` | resolve a partial name ("Gonzalez" → full credited names) | **yes** |

With the flag off the catalogue tools are not advertised to the model at all, so it cannot call
them, cannot promise index results, and does not mention a catalogue — the live-wiki and lore
tools are the whole toolset. The server-side prompt swaps in a matching rule set.

Every example prompt the panel offers is valid for the current flag: with the catalogue off they
are all live-wiki and lore questions.

### The layout

Two states, driven by whether the active chat has been used:

- **Landing** — the projects sidebar on the left and one large chat canvas filling the rest. Header,
  chat tabs, suggestion chips and the input all sit in a single centred column so the eye has one
  place to go.
- **Split** — the moment you send a message the chat docks to the right and the gallery takes the
  middle: `sidebar | gallery | chat`. The gallery column is the widest of the three.

While the agent is working the gallery shows **shimmering skeleton cards**, and the chat shows
skeleton lines until the first tokens arrive, so the wait has a shape. On narrow screens the panels
stack (chat first) and the page scrolls normally; from 1100px up the whole app is one screen-height
grid with each column scrolling independently.

### Multiple chats

The panel holds several conversations at once — **New chat** adds one, the tab strip switches
between them (titles come from the first thing you asked), and each tab has its own close button.
Every chat keeps its own transcript, typed-but-unsent draft, example prompts and artwork results;
the gallery mirrors whichever chat is active. Runs are not tied to the visible tab: start one,
switch away, and it keeps streaming — a running chat is marked `…` in the strip, and **Stop** only
cancels the chat you are looking at. Starting a fresh chat returns the view to the landing state.

Note: the local model shares one GPU. Simultaneous runs overlap rather than blocking each other,
but token throughput is split, so two questions together take longer than either alone.

### Projects

The left sidebar holds projects — named collections you save artwork into, stored server-side in
`data/projects.json` (gitignored) so they follow you across devices on the tailnet.

- **New** in the sidebar creates one and makes it the save target.
- Hover any card and press the **bookmark** to add or remove it, or open an artwork and use
  **Save to** — that list also creates a project on the spot and saves into it.
- Click a row to view that project's saved images; **Clear results** goes back to an empty gallery.
- Double-click a name to rename, `×` deletes.

Saving does **not** switch the gallery to the project (that would yank you out of whatever you were
looking at), and an empty project keeps showing the previous results so there is always something to
save from. The row you have selected stays the save target even while you browse, and a line above
the grid says which project is receiving saves.

## The catalogue flag

`shared/features.ts` is the single switch, imported by the client, the server and the Vite config so
all three agree:

```ts
export const CATALOGUE_ENABLED = false
```

What it gates when off:

| Piece | Off | On |
|---|---|---|
| `src/data/artworks.json` (0.6 MB) | not bundled | bundled |
| `catalogue/images/` (~64 MB, 2,090 WebP) | not built, not served | copied into `dist/images` and served at `/images` in dev |
| Catalogue search box + collection chips | hidden | in the gallery toolbar |
| `search_index`, `artist_leaderboard`, `find_artists` | not advertised to the model | available |
| `GET /api/artworks` | returns `{total: 0, items: []}` | real results |
| Agent prompt | live-wiki rules | live-wiki + catalogue rules |
| `GET /api/health` | `"catalogue": false` | `"catalogue": true` |

The flag is a `false` constant, so the JSON import is dead-code eliminated: the bundle is 240 kB
(75 kB gzipped) with it off versus 832 kB (172 kB gzipped) with it on, and nothing else had to
change to drop 64 MB of images out of the build.

The catalogue code paths are all still there — flip the constant and everything returns, including
`split` always being true in `App.tsx` so the search box has a column to live in.

## Stack

React 19 + TypeScript + Vite + SCSS front end; Express 5 backend; the agent loop runs against a
local model on Ollama's OpenAI-compatible endpoint (tool calling + streaming). Runs entirely on
your machine — no cloud API keys, nothing leaves the box except wiki requests.

## Quick start

```bash
npm install
npm run dev      # web on :5176 (proxies /api), agent API on :3090
```

Production / single port:

```bash
npm run build    # type-check + build the front end into dist/
npm start        # Express serves dist/ AND the agent API on :3090
```

Reachable in the tailnet at `http://jlb-hermes.tail1caa84.ts.net:3090` (mapped with
`tailscale serve --bg --tcp=3090 tcp://127.0.0.1:3090`; undo with `tailscale serve --tcp=3090 off`).

### Configuration

| Env var | Default | Notes |
|---|---|---|
| `PORT` | `3090` | Express port (API + built site) |
| `OLLAMA_URL` | `http://127.0.0.1:11434/v1` | OpenAI-compatible endpoint |
| `AGENT_MODEL` | `qwen3.6-27b:latest` | `qwen3-14b:latest` is a faster, smaller option |
| `AGENT_MAX_STEPS` | `6` | max tool-calling rounds per question |
| `DATA_DIR` | `<repo>/data` | where `projects.json` is stored |
| `VITE_BASE` | `/` | set to `/wow-art-search/` for a GitHub Pages build |

### API

- `POST /api/ask` → server-sent events: `status`, `reasoning`, `delta`, `artworks`, `done`, `error`
- `GET /api/artworks?q=&limit=` → catalogue search without the model (empty while the flag is off)
- `GET /api/img?src=<wiki file url>` → same-origin image proxy (locked to warcraft.wiki.gg `/images/`)
- `GET|POST /api/projects`, `PATCH|DELETE /api/projects/:id`, `POST|DELETE /api/projects/:id/items`
- `GET /api/health` → model, endpoint, `catalogue` flag and catalogue size

## Data

Artwork and metadata are harvested from the [Warcraft Wiki](https://warcraft.wiki.gg/) (MediaWiki
API, file namespace). The harvest output is `src/data/artworks.json` plus locally converted WebP
images in `catalogue/images/`. Artist credits come from page wikitext. `tools/` holds the harvest
and index-build scripts — see `tools/README.md`.

Live-wiki results are the only artwork the app shows while the catalogue is off; they are fetched
through `/api/img` and flagged `live wiki` on each card.

Relevance: search matches artwork **titles and artist names only**; wiki page prose is never
searched. Subject words ("orc", "nerubian", "revendreth") must all appear in the title or artist for
a piece to be returned, while medium words ("art", "concept", "wallpaper") are optional and only
affect ranking. The agent is instructed to describe a piece only in terms its own title supports,
and to say there is no close match rather than pad an answer with near-misses. Why: matching used to
include the wiki description, and Wikipedia-style prose is full of incidental mentions — a
black-and-white sketch of an *archer* matched "orc concept art" because its caption read "an archer
from *Warcraft: Orcs & Humans*". One matcher (`shared/match.ts`) serves both the client and the
server so they cannot drift apart again.

This is an unofficial fan index. World of Warcraft and all artwork belong to Blizzard
Entertainment and the credited artists. Agent answers are generated by a local model and can be
wrong; the sources are linked.

## Deploying the static demo

```bash
npm run deploy   # build with base=/wow-art-search/ then push dist/ to the gh-pages branch
```

**Note:** this deploys a *static* build with no backend, so the agent does not work there. With the
catalogue flag off it also has no bundled artwork, which leaves the page with nothing to show —
don't deploy until the flag is back on (or until there is a static fallback worth hosting).

## Gotchas worth knowing

- **Cloudflare challenges browser-shaped requests to the wiki API.** A purely client-side fetch is
  blocked with no CORS header, which is why the live search runs server-side. Plain (non-browser)
  User-Agents pass fine.
- **Wiki images cannot be hotlinked from a browser.** Cloudflare answers a browser request that
  carries a foreign `Referer` with a 403 challenge whose response includes
  `cross-origin-resource-policy: same-origin` — so Chrome kills the `<img>` with
  `ERR_BLOCKED_BY_RESPONSE.NotSameOrigin` (curl alone doesn't reveal this, since a cache HIT is
  served without the challenge). Live-wiki images therefore go through `/api/img`, which fetches
  server-side with a plain User-Agent and serves them from our own origin.
- **Use `res.on('close')`, not `req.on('close')`, for SSE abort detection.** In modern Node
  `req`'s `close` fires as soon as the POST body is consumed, which silently killed every stream.
- **A sticky child needs a tall parent.** The catalogue search box sticks inside the gallery column;
  where the panels stack instead, `.toolbar` gets `display: contents` so the search box becomes a
  child of a column tall enough to stick in.
- Ollama returns the model's thinking in a separate `reasoning` field; the UI shows it in a
  collapsible "Reasoning" block and streams only `content` as the answer.
