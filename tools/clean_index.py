#!/usr/bin/env python3
"""Clean artist credits + titles in the built index; prune orphan images."""
import json, os, re

DATA = "/home/jlbroughton/Code/wow-art-search/src/data/artworks.json"
IMGS = "/home/jlbroughton/Code/wow-art-search/catalogue/images"

rows = json.load(open(DATA))
before = len(rows)

VERSION = re.compile(r"^(?:\d+(?:[._]\d+)*|[IVX]{1,4})\s+")
GENERIC = re.compile(r"^(?:artwork|art|concept art|concept|wow|warcraft|wowpedia)\s*[-–:]?\s+", re.I)
CODEY = re.compile(r"^[A-Za-z][A-Za-z0-9]{2,14}$")


def clean_title(t: str) -> str:
    prev = None
    while prev != t:
        prev = t
        t = VERSION.sub("", t).strip()
        t = GENERIC.sub("", t).strip()
    return t


def is_codey(t: str) -> bool:
    if " " in t:
        return False
    if not CODEY.match(t):
        return False
    if t.islower():
        return False
    return bool(re.search(r"\d", t)) or bool(re.search(r"[a-z][A-Z]", t))


out = []
for r in rows:
    t = clean_title(r["title"])
    if len(t) < 5 or is_codey(t):
        continue
    a = r.get("artist")
    if a:
        a = a.split(".")[0].strip().rstrip(",")
        if len(a) < 3 or re.search(r"\d|https?|www", a):
            a = None
    r = {**r, "title": t, "artist": a}
    r.pop("ctx", None)
    out.append(r)

out.sort(key=lambda r: r["title"].lower())
json.dump(out, open(DATA, "w"), separators=(",", ":"))

keep = {r["img"] for r in out}
removed = 0
for fn in os.listdir(IMGS):
    if fn not in keep:
        os.remove(os.path.join(IMGS, fn))
        removed += 1

print(f"rows {before} -> {len(out)}  (dropped {before - len(out)}), images removed {removed}")
print("artists:", len({r['artist'] for r in out if r['artist']}), "uncredited:", sum(1 for r in out if not r['artist']))
