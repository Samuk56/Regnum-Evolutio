#!/usr/bin/env python3
"""Gera src/assets/world.json a partir de tools/world.geo.json (Natural Earth).

- Grade alta resolucao (default 720x360 = 2 graus/celula; use --w 1000 para ~500+)
- Cada pais vira uma REGIAO; ilhas desconectadas viram regioes proprias
- Recursos naturais por bioma/continente com pesos + seed fixa
- Antartida: regiao "inicial" neutra (nao pintavel); oceano idem
Saida: src/assets/world.json + preview.png
Uso: python3 tools/build_world.py [--seed N] [--w 720] [--min-cells 12]
Requer: pillow
"""
import argparse, json, math, os, random

BASE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.dirname(BASE)
ASSETS = os.path.join(ROOT, 'src', 'assets')
os.makedirs(ASSETS, exist_ok=True)

ap_early = argparse.ArgumentParser(add_help=False)
ap_early.add_argument('--w', type=int, default=None)
_pre, _ = ap_early.parse_known_args()
W = _pre.w if _pre.w else 720    # colunas (largura do mapa em celulas)
H = max(1, int(round(W * 0.5)))  # proporcao 2:1
CELL_ARC = 360.0 / W

ap = argparse.ArgumentParser()
ap.add_argument('--seed', type=int, default=7)
ap.add_argument('--w', type=int, default=720)
ap.add_argument('--min-cells', type=int, default=None,
                help='celulas minimas por regiao (default: proporcional a resolucao)')
args = ap.parse_args()
rng = random.Random(args.seed)

geo = json.load(open(os.path.join(BASE, 'world.geo.json')))
features = geo['features']

def point_in_poly(px, py, ring):
    inside = False
    n = len(ring); j = n - 1
    for i in range(n):
        xi, yi = ring[i][0], ring[i][1]
        xj, yj = ring[j][0], ring[j][1]
        if ((yi > py) != (yj > py)) and (px < (xj - xi) * (py - yi) / (yj - yi) + xi):
            inside = not inside
        j = i
    return inside

# ---------------- prepara aneis ----------------
# rings_by_country[fi] = lista de (ext_ring, holes)
rings_by_country = []
country_meta = []
for fi, f in enumerate(features):
    geom = f.get('geometry')
    name = f['properties'].get('name', f['id'])
    country_meta.append({'name': name, 'iso': f['id']})
    rings = []
    if geom:
        polys = [geom['coordinates']] if geom['type'] == 'Polygon' else (geom['coordinates'] if geom['type'] == 'MultiPolygon' else [])
        for poly in polys:
            rings.append((poly[0], poly[1:]))
    rings_by_country.append(rings)

# buckets para acelerar teste ponto-em-poligono
BBOX_GRID = 24
buckets = {}
for fi, rings in enumerate(rings_by_country):
    for ri, (ext, holes) in enumerate(rings):
        lons = [p[0] for p in ext]; lats = [p[1] for p in ext]
        mnx, mxx, mny, mxy = min(lons), max(lons), min(lats), max(lats)
        gx0 = max(0, int((mnx + 180) / 360 * BBOX_GRID)); gx1 = min(BBOX_GRID - 1, int((mxx + 180) / 360 * BBOX_GRID))
        gy0 = max(0, int((90 - mxy) / 180 * BBOX_GRID)); gy1 = min(BBOX_GRID - 1, int((90 - mny) / 180 * BBOX_GRID))
        for gyy in range(gy0, gy1 + 1):
            for gxx in range(gx0, gx1 + 1):
                buckets.setdefault((gxx, gyy), []).append((fi, ri))

print('rasterizando %d paises...' % len(features))
owner = [[None] * W for _ in range(H)]   # (fi, ri) da maior poligon que contem a celula
for cy in range(H):
    lat_c = 90 - (cy + 0.5) * CELL_ARC
    gy = min(BBOX_GRID - 1, max(0, int((90 - lat_c) / 180 * BBOX_GRID)))
    for cx in range(W):
        lon_c = -180 + (cx + 0.5) * CELL_ARC
        gx = min(BBOX_GRID - 1, max(0, int((lon_c + 180) / 360 * BBOX_GRID)))
        cand = buckets.get((gx, gy))
        if not cand: continue
        hit = None
        for (fi, ri) in cand:
            ext, holes = rings_by_country[fi][ri]
            if point_in_poly(lon_c, lat_c, ext):
                inhole = any(point_in_poly(lon_c, lat_c, hd) for hd in holes)
                if not inhole:
                    hit = (fi, ri); break
        owner[cy][cx] = hit

# ---------------- componentes conectados -> regioes ----------------
dirs4 = [(1, 0), (-1, 0), (0, 1), (0, -1)]
region_of = [[-1] * W for _ in range(H)]
regions = []  # {id, cells, country_index or None, start(bool)}
for cy in range(H):
    for cx in range(W):
        o = owner[cy][cx]
        if o is None or region_of[cy][cx] != -1: continue
        rid = len(regions)
        stack = [(cx, cy)]; region_of[cy][cx] = rid
        cells = []
        while stack:
            x, y = stack.pop(); cells.append((x, y))
            for dx, dy in dirs4:
                nx, ny = x + dx, y + dy
                if 0 <= nx < W and 0 <= ny < H and region_of[ny][nx] == -1 and owner[ny][nx] == o:
                    region_of[ny][nx] = rid; stack.append((nx, ny))
        regions.append({'cells': cells, 'country': o[0]})

# limpa rotulos antigos (serao reatribuidos apos filtro)
for cy in range(H):
    for cx in range(W):
        if region_of[cy][cx] >= 0:
            region_of[cy][cx] = -1

MIN_CELLS = args.min_cells if args.min_cells is not None else max(3, int(round(W * H * 3.0 / (240 * 120))))
filtered = []
for rid, r in enumerate(regions):
    if len(r['cells']) >= MIN_CELLS:
        filtered.append(r)
        for (x, y) in r['cells']:
            region_of[y][x] = len(filtered) - 1
regions = filtered

# Antarctica => regiao inicial neutra
ANTARCTICA_NAME = 'Antarctica'
for r in regions:
    nm = country_meta[r['country']]['name']
    r['start'] = (nm == ANTARCTICA_NAME)

# ---------------- continentes (classificacao por bounding box + heuristica) ----------------
CONTINENT_OVERRIDES = {
    'Greenland': 'northamerica', 'Iceland': 'europe',
    'United States of America': 'northamerica', 'Canada': 'northamerica', 'Mexico': 'northamerica',
    'Australia': 'oceania', 'New Zealand': 'oceania', 'Papua New Guinea': 'oceania', 'Fiji': 'oceania',
    'Solomon Is.': 'oceania', 'Vanuatu': 'oceania', 'New Caledonia': 'oceania',
}

def classify_continent(name, lons, lats):
    if name in CONTINENT_OVERRIDES:
        return CONTINENT_OVERRIDES[name]
    lon = sum(lons) / len(lons); lat = sum(lats) / len(lats)
    w, e = min(lons), max(lons); s, n = min(lats), max(lats)
    # Russia / Turkiye / Kazakhstan etc. => Europa (padrao politico simples)
    if name in ('Russia', 'Turkey', 'Kazakhstan', 'Georgia', 'Azerbaijan'):
        return 'europe'
    if name in ('Egypt',):  # Africa (Sinai pequeno)
        return 'africa'
    if name in ('Saudi Arabia', 'Yemen', 'Oman', 'United Arab Emirates', 'Qatar', 'Bahrain',
                'Kuwait', 'Iraq', 'Iran', 'Israel', 'Jordan', 'Lebanon', 'Syria', 'Palestine',
                'West Bank', 'Gaza Strip', 'Afghanistan', 'Pakistan', 'India', 'Bangladesh',
                'Sri Lanka', 'Nepal', 'Bhutan', 'Myanmar', 'Thailand', 'Vietnam', 'Laos',
                'Cambodia', 'Malaysia', 'China', 'Mongolia', 'North Korea', 'South Korea',
                'Taiwan', 'Japan', 'Philippines', 'Brunei', 'Indonesia', 'East Timor',
                'Timor-Leste', 'Uzbekistan', 'Turkmenistan', 'Tajikistan', 'Kyrgyzstan'):
        return 'asia'
    if name in ('Antarctica',):
        return 'antarctica'
    # heuristica por centroide
    if lat < -45: return 'antarctica'
    if lat > 12 and lon < -30: return 'northamerica'
    if lat <= 12 and lon < -30 or (lat < 13 and lon < -34 and e < -34): return 'southamerica'
    if lon >= -30 and lon < 60 and lat > 34: return 'europe'
    if lon >= -30 and lat <= 34 and n > 12 and not (lon > 35 and lat < 12): return 'africa'
    if lon >= 25 and lat > -10 and lon < 180:
        if lat < -35 or lon > 110 and lat < -10: pass
        return 'asia'
    if lon >= 110 and lat < 0: return 'oceania'
    return 'asia'

# Indonesia/Oceania split simples: nomes ilhas abaixo
for r in regions:
    nm = country_meta[r['country']]['name']
    lons = [x * CELL_ARC - 180 for (x, y) in r['cells']]
    lats = [90 - (y + 0.5) * CELL_ARC for (x, y) in r['cells']]
    cont = classify_continent(nm, lons, lats)
    if nm in ('Indonesia', 'Malaysia') and max(lat for lat in lats) < 8 and min(lon for lon in lons) > 95:
        pass
    if nm == 'Australia': cont = 'oceania'
    if nm in ('Papua New Guinea', 'Solomon Is.', 'Vanuatu', 'Fiji', 'New Caledonia'): cont = 'oceania'
    if nm in ('Indonesia', 'East Timor', 'Timor-Leste'): cont = 'asia'
    r['continent'] = cont

# nomes: pais + numero se multiplas ilhas
by_country = {}
for i, r in enumerate(regions):
    by_country.setdefault(r['country'], []).append(i)
for ci, idxs in by_country.items():
    base = country_meta[ci]['name']
    for k, i in enumerate(sorted(idxs, key=lambda i: -len(regions[i]['cells']))):
        regions[i]['name'] = base if k == 0 else '%s %d' % (base, k + 1)

# centroides + vizinhos
for r in regions:
    xs = [c[0] for c in r['cells']]; ys = [c[1] for c in r['cells']]
    r['cx'] = sum(xs) / len(xs); r['cy'] = sum(ys) / len(ys)
    r['size'] = len(r['cells'])

nbrs = [set() for _ in regions]
for cy in range(H):
    for cx in range(W):
        a = region_of[cy][cx]
        if a < 0: continue
        for dx, dy in ((1, 0), (0, 1)):
            nx, ny = cx + dx, cy + dy
            if nx < W and ny < H:
                b = region_of[ny][nx]
                if b >= 0 and a != b:
                    if b < len(nbrs) and a < len(nbrs):
                        nbrs[a].add(b); nbrs[b].add(a)
for i, r in enumerate(regions):
    r['neighbors'] = sorted(nbrs[i])

# ---------------- recursos por bioma ----------------
BIOMES = ['tundra', 'boreal', 'temperate', 'desert', 'tropical', 'steppe']
RES_W = {  # pesos [carvao, ferro, petroleo, uranio]
    'tundra':   [0.10, 0.20, 0.15, 0.55],
    'boreal':   [0.30, 0.30, 0.10, 0.30],
    'temperate':[0.40, 0.30, 0.15, 0.15],
    'desert':   [0.10, 0.15, 0.60, 0.15],
    'tropical': [0.15, 0.25, 0.40, 0.20],
    'steppe':   [0.25, 0.25, 0.35, 0.15],
}
def biome(lat, lon):
    if lat > 66: return 'tundra'
    if lat > 50: return 'boreal' if not (-10 < lon < 40 and lat < 60) else 'temperate'
    if lat > 30:
        if -120 < lon < -60 and lat > 30: return 'temperate'
        return 'desert' if ((-8 < lon < 55 and 18 < lat < 35) or (60 < lon < 75 and 20 < lat < 32) or (115 < lon < 130)) else 'steppe'
    if lat > 10:
        return 'desert' if ((-20 < lon < 60 and 15 < lat < 30) or (43 < lon < 62)) else 'tropical'
    if lat > -15: return 'tropical'
    if lat > -35: return 'steppe'
    return 'temperate'

resources = [-1] * (W * H)
res_frac = {'tundra': 0.10, 'boreal': 0.14, 'temperate': 0.16, 'desert': 0.13, 'tropical': 0.12, 'steppe': 0.13}
for r in regions:
    if r['start']: continue
    cells = r['cells']
    counts = {}
    for (x, y) in cells:
        lat = 90 - (y + 0.5) * CELL_ARC
        counts[biome(lat, x * CELL_ARC - 180)] = counts.get(biome(lat, x * CELL_ARC - 180), 0) + 1
    dom = max(counts, key=counts.get)
    r['biome'] = dom
    n_res = max(1, int(len(cells) * res_frac[dom]))
    chosen = rng.sample(cells, min(n_res, len(cells)))
    w = RES_W[dom]; tot = sum(w)
    for (x, y) in chosen:
        t = rng.random(); acc = 0; ti = 3
        for k, ww in enumerate(w):
            acc += ww / tot
            if t <= acc: ti = k; break
        resources[y * W + x] = ti
for r in regions:
    r.setdefault('biome', 'temperate')

# floresta (madeira): chance extra em tropical/boreal/temperate
forest_bonus = {'tropical': 0.35, 'boreal': 0.25, 'temperate': 0.18, 'steppe': 0.06, 'desert': 0.02, 'tundra': 0.02}

# ---------------- saida ----------------
land = ''.join('1' if region_of[y][x] >= 0 else '0' for y in range(H) for x in range(W))
out = {
    'w': W, 'h': H,
    'land': land,
    'region': region_of,
    'resources': resources,
    'regions': [{'id': i, 'name': r['name'], 'country': r['country'], 'continent': r.get('continent'),
                 'size': r['size'], 'cx': round(r['cx'], 2), 'cy': round(r['cy'], 2),
                 'neighbors': r['neighbors'], 'start': r['start'], 'biome': r['biome']}
                for i, r in enumerate(regions)],
    'countries': country_meta,
    'forestBonus': forest_bonus,
}
with open(os.path.join(ASSETS, 'world.json'), 'w') as f:
    json.dump(out, f, separators=(',', ':'))
print('OK: %d regioes, terra=%d celulas' % (len(regions), land.count('1')))

# preview
try:
    from PIL import Image, ImageDraw
    PX = max(1, 1440 // W)
    pv = Image.new('RGB', (W * PX, H * PX), (35, 78, 110))
    d = ImageDraw.Draw(pv)
    COLR = [(120, 80, 40), (150, 150, 160), (210, 60, 60), (60, 200, 160)]
    import colorsys
    pal = []
    for rid in range(len(regions)):
        rnd = random.Random(rid * 977 + 13)
        hcol = rnd.random()
        r_, g_, b_ = colorsys.hsv_to_rgb(hcol, 0.55, 0.8)
        pal.append((int(r_*255), int(g_*255), int(b_*255)))
    for y in range(H):
        for x in range(W):
            rid = region_of[y][x]
            if rid >= 0:
                d.rectangle([x*PX, y*PX, x*PX+PX-1, y*PX+PX-1], fill=pal[rid])
                rr = resources[y*W+x]
                if rr >= 0 and PX >= 3:
                    d.rectangle([x*PX+PX//3, y*PX+PX//3, x*PX+2*PX//3, y*PX+2*PX//3], fill=COLR[rr])
    pv.save(os.path.join(ASSETS, 'preview.png'))
    print('preview salvo')
except ImportError:
    print('sem Pillow; preview ignorado')
