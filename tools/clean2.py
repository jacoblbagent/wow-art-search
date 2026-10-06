import json, os, re

DATA = '/home/jlbroughton/Code/wow-art-search/src/data/artworks.json'
IMGS = '/home/jlbroughton/Code/wow-art-search/catalogue/images'
rows = json.load(open(DATA))
before = len(rows)

LEAD = re.compile(r"^[\s\-–—:|,.\u2022]+")
YT = re.compile(r"[-–|:]\s*(youtube|twitch)\b.*$", re.I)
TIME = re.compile(r"\s*[-–|]\s*\d{1,2}:\d{2}(?::\d{2})?\s*$")
DROP = re.compile(r"\b(youtube|twitch|livestream|vod)\b", re.I)

# report current patterns
lead = sum(1 for r in rows if LEAD.match(r['title']) and not re.match(r'^[A-Za-z0-9]', r['title']))
print("titles with leading punctuation:", lead)
print("youtube titles:", sum(1 for r in rows if DROP.search(r['title'])))
print("timecode titles:", sum(1 for r in rows if TIME.search(r['title'])))
print("title contains ' by ':", sum(1 for r in rows if ' by ' in r['title'].lower()))

out = []
for r in rows:
    t = r['title']
    t = YT.sub('', t)
    t = TIME.sub('', t)
    t = LEAD.sub('', t).strip()
    if DROP.search(t) or len(t) < 5:
        continue
    a = r['artist']
    if a and re.search(r'\bby\s+' + re.escape(a) + r'\s*$', t, re.I):
        t = re.sub(r'\s*[-–|]?\s*by\s+' + re.escape(a) + r'\s*$', '', t, flags=re.I).strip()
        t = LEAD.sub('', t).strip()
    if len(t) < 5:
        continue
    out.append({**r, 'title': t})

out.sort(key=lambda r: r['title'].lower())
json.dump(out, open(DATA, 'w'), separators=(',', ':'))

keep = {r['img'] for r in out}
removed = 0
for fn in os.listdir(IMGS):
    if fn not in keep:
        os.remove(os.path.join(IMGS, fn))
        removed += 1

print(f"rows {before} -> {len(out)}, images removed {removed}")
print("sample:", [r['title'] for r in out[:6]])
