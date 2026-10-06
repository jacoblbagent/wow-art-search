#!/usr/bin/env python3
"""Download + convert selected artworks (threaded) and emit the bundled index."""
import json, os, re, io, sys, urllib.request
from concurrent.futures import ThreadPoolExecutor, as_completed
from PIL import Image

RAW = "/tmp/artworks_raw.json"
PROJ = "/home/jlbroughton/Code/wow-art-search"
IMG_DIR = os.path.join(PROJ, "public", "images")
DATA_OUT = os.path.join(PROJ, "src", "data", "artworks.json")

CAP = 2200
BUDGET = 90 * 1024 * 1024
MAX_W = 640
QUALITY = 72
UA = "wow-art-search-indexer/1.0 (personal fan project)"

os.makedirs(IMG_DIR, exist_ok=True)
os.makedirs(os.path.dirname(DATA_OUT), exist_ok=True)

rows = json.load(open(RAW))


def score(r):
    s = 0
    if r.get("artist"):
        s += 3
    if r["w"] >= 1600:
        s += 3
    elif r["w"] >= 1100:
        s += 2
    elif r["w"] >= 800:
        s += 1
    t = r["title"].lower()
    if "concept art" in t:
        s += 2
    if any(k in t for k in ("wallpaper", "artwork", "art of")):
        s += 1
    if "portrait" in t:
        s += 1
    return s


rows.sort(key=lambda r: (-score(r), r["title"].lower()))
rows = rows[:CAP]
print(f"selected: {len(rows)} of {len(json.load(open(RAW)))}")


def slugify(s):
    return re.sub(r"[^a-z0-9]+", "-", s.lower()).strip("-")[:70] or "art"


used, jobs = {}, []
for r in rows:
    slug = slugify(r["title"])
    if slug in used:
        used[slug] += 1
        slug = f"{slug}-{used[slug]}"
    else:
        used[slug] = 0
    jobs.append((r, slug + ".webp"))


def fetch(job):
    r, fn = job
    path = os.path.join(IMG_DIR, fn)
    if os.path.exists(path) and os.path.getsize(path) > 0:
        return fn, os.path.getsize(path)
    try:
        req = urllib.request.Request(r["thumb"], headers={"User-Agent": UA, "Accept": "image/*"})
        with urllib.request.urlopen(req, timeout=60) as resp:
            data = resp.read()
        im = Image.open(io.BytesIO(data)).convert("RGB")
        if im.width > MAX_W:
            im = im.resize((MAX_W, round(im.height * MAX_W / im.width)), Image.LANCZOS)
        im.save(path, "WEBP", quality=QUALITY, method=5)
        return fn, os.path.getsize(path)
    except Exception as e:  # noqa: BLE001
        print(f"  !! {r['title'][:40]}: {type(e).__name__}", file=sys.stderr)
        return fn, 0


done, total = 0, 0
with ThreadPoolExecutor(max_workers=12) as pool:
    futs = [pool.submit(fetch, j) for j in jobs]
    for f in as_completed(futs):
        fn, sz = f.result()
        done += 1
        total += sz
        if done % 50 == 0:
            print(f"  {done}/{len(jobs)}  {total/1e6:.1f} MB", flush=True)

out = []
for r, fn in jobs:
    path = os.path.join(IMG_DIR, fn)
    if not os.path.exists(path):
        continue
    out.append({
        "id": r["id"],
        "title": r["title"],
        "artist": r.get("artist"),
        "w": r["w"],
        "h": r["h"],
        "img": fn,
        "full": r["full"],
        "page": r["page"],
        "ctx": (r["title"] + " " + (r.get("artist") or "") + " " + r.get("ctx", ""))[:600],
    })

out.sort(key=lambda r: r["title"].lower())
json.dump(out, open(DATA_OUT, "w"), separators=(",", ":"))
print(f"WROTE {len(out)} artworks, {total/1e6:.1f} MB of webp")

for t in ["concept art", "character", "creature", "dragon", "environment", "weapon", "city",
          "orc", "night elf", "undead", "demon", "titan", "elemental", "wallpaper", "mount",
          "human", "troll", "dwarf", "goblin", "tauren", "void", "fel", "old god", "cinematic"]:
    n = sum(1 for r in out if t in r["ctx"].lower())
    print(f"  {t:14} {n}")
