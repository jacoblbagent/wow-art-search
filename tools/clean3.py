import json, os, re

DATA = '/home/jlbroughton/Code/wow-art-search/src/data/artworks.json'
IMGS = '/home/jlbroughton/Code/wow-art-search/public/images'
rows = json.load(open(DATA))
before = len(rows)

BY = re.compile(r"\s*[-–|]?\s*by\s+([A-Z][\w.'\-]*(?:\s+[A-Z][\w.'\-]*){0,2})\s*$", re.I)
LEADNUM = re.compile(r"^\(\d+\)\s*")
LEAD = re.compile(r"^[\s\-–—:|,.\u2022]+")

out, stripped = [], 0
for r in rows:
    t = r['title']
    t = LEADNUM.sub('', t)
    t2 = BY.sub('', t).strip()
    if t2 != t and len(t2) >= 6:
        stripped += 1
        t = t2
    t = LEAD.sub('', t).strip()
    if len(t) < 5:
        continue
    a = r['artist']
    ctx = (t + ' ' + (a or '') + ' ' + r['ctx']).lower()[:260]
    out.append({**r, 'title': t, 'ctx': ctx})

out.sort(key=lambda r: r['title'].lower())
json.dump(out, open(DATA, 'w'), separators=(',', ':'))

keep = {r['img'] for r in out}
removed = 0
for fn in os.listdir(IMGS):
    if fn not in keep:
        os.remove(os.path.join(IMGS, fn))
        removed += 1

print(f"rows {before} -> {len(out)}, trailing 'by X' stripped {stripped}, images removed {removed}")
print("remaining with ' by ':", sum(1 for r in out if ' by ' in r['title'].lower()))
print("sample:", [r['title'] for r in out[:6]])
