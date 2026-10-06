#!/usr/bin/env python3
"""Harvest real World of Warcraft artwork metadata from the Warcraft Wiki."""
import json, re, time, urllib.parse, urllib.request, html, sys

API = "https://warcraft.wiki.gg/api.php"
UA = "wow-art-search-indexer/1.0 (personal fan project)"

QUERIES = [
    "concept art", "wallpaper", "artwork", "cinematic",
    # races / peoples
    "human concept art", "orc concept art", "night elf concept art", "undead concept art",
    "tauren concept art", "troll concept art", "gnome concept art", "dwarf concept art",
    "blood elf concept art", "draenei concept art", "worgen concept art", "goblin concept art",
    "pandaren concept art", "vulpera concept art", "dracthyr concept art", "earthen concept art",
    "harronir concept art", "nerubian concept art", "vrykul concept art", "ogre concept art",
    "murloc concept art", "kobold concept art", "arakkoa concept art", "ethereal concept art",
    "naga concept art", "centaur concept art", "tuskarr concept art", "furbolg concept art",
    # creatures
    "dragon concept art", "proto-dragon concept art", "demon concept art", "undead creature concept art",
    "wolf concept art", "bear concept art", "spider concept art", "elemental concept art",
    "old god concept art", "titan concept art",
    # characters
    "Arthas concept art", "Illidan concept art", "Sylvanas concept art", "Thrall concept art",
    "Jaina concept art", "Anduin concept art", "Alexstrasza concept art", "Deathwing concept art",
    "Gul'dan concept art", "Xal'atath concept art", "Alleria concept art", "Varian concept art",
    "Malfurion concept art", "Tyrande concept art", "Kael'thas concept art", "Ragnaros concept art",
    "N'Zoth concept art", "Sargeras concept art", "Kil'jaeden concept art", "Grommash concept art",
    "Baine concept art", "Vol'jin concept art", "Kel'Thuzad concept art", "Maiev concept art",
    "Valeera concept art", "Rexxar concept art", "Lich King concept art", "Xavius concept art",
    "Azshara concept art", "Wrathion concept art", "Nozdormu concept art", "Neltharion concept art",
    "Chromie concept art", "Yrel concept art", "Garrosh concept art", "Uther concept art",
    # places
    "Stormwind concept art", "Orgrimmar concept art", "Ironforge concept art", "Darnassus concept art",
    "Undercity concept art", "Thunder Bluff concept art", "Silvermoon concept art", "Exodar concept art",
    "Dalaran concept art", "Suramar concept art", "Zuldazar concept art", "Boralus concept art",
    "Valdrakken concept art", "Bastion concept art", "Revendreth concept art", "Ardenweald concept art",
    "Maldraxxus concept art", "Azj-Kahet concept art", "Dornogal concept art", "Hallowfall concept art",
    "Icecrown concept art", "Northrend concept art", "Pandaria concept art", "Draenor concept art",
    "Outland concept art", "Kalimdor concept art", "Eastern Kingdoms concept art", "Azeroth concept art",
    # expansions
    "The War Within art", "Dragonflight art", "Shadowlands art", "Battle for Azeroth art",
    "Legion art", "Warlords of Draenor art", "Mists of Pandaria art", "Cataclysm art",
    "Wrath of the Lich King art", "The Burning Crusade art", "Midnight art",
    # props / other
    "weapon concept art", "armor concept art", "mount concept art", "environment concept art",
    "tier set concept art", "dungeon concept art", "raid concept art", "class concept art",
]

NON_ART = re.compile(
    r"\b(icon|icons|logo|logos|map|maps|minimap|sprite|sprites|flag|banner|achievement|tabard|emote"
    r"|button|arrow|signpost|tooltip|hud|inventory|screenshot|wowhead|glyph|sigil|crest|frame"
    r"|border|texture|blp|dds|ogg|mp3|wav|sound|audio|voice|spell|ability|currency|token|cursor"
    r"|font|rank|badge|pixel|datamine|ptr|beta|card|tcg|hearthstone|movie|film|poster|comic book"
    r"|logo|box art|cover art|book cover|patch notes|blizzcon|celebration)\b",
    re.I,
)


def api(params: dict) -> dict:
    params = {"format": "json", **params}
    url = API + "?" + urllib.parse.urlencode(params)
    req = urllib.request.Request(url, headers={"User-Agent": UA, "Accept": "application/json"})
    for attempt in range(4):
        try:
            with urllib.request.urlopen(req, timeout=40) as r:
                return json.loads(r.read().decode("utf-8"))
        except Exception as e:  # noqa: BLE001
            if attempt == 3:
                print(f"  !! {type(e).__name__}: {e}", file=sys.stderr)
                return {}
            time.sleep(1.5 * (attempt + 1))
    return {}


def clean_title(t: str) -> str:
    t = re.sub(r"^File:", "", t, flags=re.I)
    t = re.sub(r"\.(jpe?g|png|gif|webp|bmp)$", "", t, flags=re.I)
    return html.unescape(t.replace("_", " ")).strip()


def artist_from_text(text: str) -> str | None:
    if not text:
        return None
    t = re.sub(r"[\[\]{}=|']", " ", text)
    t = re.sub(r"\s+", " ", t)
    m = re.search(
        r"(?:artwork|art|illustration|illustrated|image|piece|concept art|painting|painted|drawn|created)"
        r"\s+by\s+([A-Z][A-Za-z.'’\-]+(?:\s+[A-Z][A-Za-z.'’\-]+){0,3})",
        t,
    )
    if not m:
        m = re.search(r"(?:^|\s)by\s+([A-Z][A-Za-z.'’\-]+(?:\s+[A-Z][A-Za-z.'’\-]+){0,3})", t)
    if not m:
        return None
    name = m.group(1).strip().rstrip(".")
    if re.match(r"^(Blizzard|Unknown|Anonymous|The|A|An|And|With|Fan)\b", name):
        return None
    if len(name) > 45:
        return None
    return name


def main():
    titles: dict[str, str] = {}  # title -> snippet-ish context
    for i, q in enumerate(QUERIES):
        for offset in (0, 50):
            d = api({
                "action": "query", "list": "search", "srsearch": q, "srnamespace": "6",
                "srlimit": "50", "sroffset": str(offset), "srprop": "snippet",
            })
            hits = (d.get("query") or {}).get("search") or []
            for h in hits:
                t = h["title"]
                if t not in titles:
                    titles[t] = h.get("snippet", "")
            if not hits or not (d.get("continue") or {}).get("sroffset"):
                break
            time.sleep(0.25)
        if i % 10 == 0:
            print(f"[{i+1}/{len(QUERIES)}] {q!r} -> {len(titles)} candidate files", flush=True)
        time.sleep(0.2)

    print(f"total candidate files: {len(titles)}")
    all_titles = list(titles.keys())

    # imageinfo in batches of 50
    meta: dict[str, dict] = {}
    for i in range(0, len(all_titles), 50):
        chunk = all_titles[i:i + 50]
        d = api({
            "action": "query", "titles": "|".join(chunk), "prop": "imageinfo",
            "iiprop": "url|size|mime|extmetadata", "iiurlwidth": "640",
        })
        for p in ((d.get("query") or {}).get("pages") or {}).values():
            ii = (p.get("imageinfo") or [{}])[0]
            meta[p["title"]] = {"pageid": p.get("pageid"), "ii": ii}
        time.sleep(0.25)
        print(f"  imageinfo {i+len(chunk)}/{len(all_titles)}", flush=True)

    # wikitext for artist credit
    pages_text: dict[str, str] = {}
    for i in range(0, len(all_titles), 50):
        chunk = all_titles[i:i + 50]
        d = api({
            "action": "query", "titles": "|".join(chunk), "prop": "revisions",
            "rvprop": "content", "rvslots": "main",
        })
        for p in ((d.get("query") or {}).get("pages") or {}).values():
            try:
                pages_text[p["title"]] = p["revisions"][0]["slots"]["main"]["*"]
            except (KeyError, IndexError, TypeError):
                pages_text[p["title"]] = ""
        time.sleep(0.25)

    out = []
    for title, m in meta.items():
        ii = m["ii"]
        mime = ii.get("mime", "")
        w, h = ii.get("width", 0), ii.get("height", 0)
        if mime not in ("image/jpeg", "image/png"):
            continue
        if w < 600 or h < 420:
            continue
        name = clean_title(title)
        if NON_ART.search(name):
            continue
        thumb = ii.get("thumburl") or ii.get("url")
        full = ii.get("url")
        if not thumb or not full:
            continue
        text = pages_text.get(title, "")
        artist = artist_from_text(text) or artist_from_text(titles.get(title, ""))
        em = (ii.get("extmetadata") or {})
        if not artist:
            ema = re.sub(r"<[^>]+>", "", str((em.get("Artist") or {}).get("value", ""))).strip()
            if ema and not re.search(r"unknown", ema, re.I) and len(ema) < 60:
                artist = html.unescape(ema)
        # searchable context (not displayed)
        desc = re.sub(r"\{\{[^}]*\}\}", " ", text)
        desc = re.sub(r"<[^>]+>", " ", desc)
        desc = re.sub(r"\[\[(?:[^\]|]*\|)?([^\]]*)\]\]", r"\1", desc)
        desc = re.sub(r"[^A-Za-z0-9 ,.'\-]", " ", desc)
        desc = re.sub(r"\s+", " ", desc).strip()[:400]
        out.append({
            "id": m["pageid"],
            "title": name,
            "artist": artist,
            "w": w, "h": h,
            "thumb": thumb,
            "full": full,
            "page": "https://warcraft.wiki.gg/wiki/" + urllib.parse.quote(title.replace(" ", "_")),
            "ctx": (name + " " + desc).lower(),
        })

    # dedupe by title
    seen, uniq = set(), []
    for r in out:
        k = r["title"].lower()
        if k in seen:
            continue
        seen.add(k)
        uniq.append(r)

    uniq.sort(key=lambda r: r["title"].lower())
    json.dump(uniq, open("/tmp/artworks_raw.json", "w"), indent=0)
    with_artist = sum(1 for r in uniq if r["artist"])
    print(f"kept {len(uniq)} artworks ({with_artist} with artist credit)")


if __name__ == "__main__":
    main()
