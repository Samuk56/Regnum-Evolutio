// ==================== RENDERIZADOR (Canvas 2D otimizado) ====================
// Duas camadas: base estatica (agua + recursos, redesenhada so quando precisa)
// e camada dinamica (territorios pintados), desenhada em offscreen por celula.

const SEA1 = '#24567d', SEA2 = '#1b4463';
const RES_COLORS = ['#8a5a2e', '#9aa0a6', '#c0392b', '#16a085']; // carvao ferro petroleo uranio

// retangulo arredondado (path) — usado nos rotulos do mapa
function roundRect(ctx, x, y, w, h, r) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

function hslToRgb(h, s, l) {
  h = ((h % 360) + 360) % 360; s /= 100; l /= 100;
  const c = (1 - Math.abs(2 * l - 1)) * s, x = c * (1 - Math.abs((h / 60) % 2 - 1)), m = l - c / 2;
  let r = 0, g = 0, b = 0;
  if (h < 60) [r, g, b] = [c, x, 0]; else if (h < 120) [r, g, b] = [x, c, 0];
  else if (h < 180) [r, g, b] = [0, c, x]; else if (h < 240) [r, g, b] = [0, x, c];
  else if (h < 300) [r, g, b] = [x, 0, c]; else [r, g, b] = [c, 0, x];
  return [Math.round((r + m) * 255), Math.round((g + m) * 255), Math.round((b + m) * 255)];
}
function rgbToHex(r, g, b) { return '#' + [r, g, b].map(v => v.toString(16).padStart(2, '0')).join(''); }
export function hslToHex(h, s, l) { const [r, g, b] = hslToRgb(h, s, l); return rgbToHex(r, g, b); }
// distribui N cores maximalmente distintas no circulo cromatico (offset aureo + jitter)
export function distinctColors(n, seed = 0) {
  const out = [];
  for (let i = 0; i < n; i++) {
    const rnd = Math.sin((i + 1) * 127.1 + seed * 311.7) * 43758.5453;
    const j = rnd - Math.floor(rnd);
    const h = (i * 360 / n + j * 14 - 7 + 360) % 360;
    const s = 52 + Math.round(j * 16);            // 52..68%
    const l = 44 + Math.round(((i % 3) * 7 + j * 6)); // camadas de brilho p/ vizinhos
    out.push(hslToHex(h, s, l));
  }
  return out;
}

export class Renderer {
  constructor(canvas, game) {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d', { alpha: false });
    this.game = game;
    this.scale = Math.max(2, Math.min(4, Math.floor(this.vwSafe() / game.W)));  // px por celula (zoom)
    this.minScale = 1; this.maxScale = 20;
    this.offX = 0; this.offY = 0;
    this.dpr = Math.min(window.devicePixelRatio || 1, 2);
    // cache de cor por regiao neutra (tons de "terreno natural", suaves)
    this.neutralCol = [];
    for (let i = 0; i < game.nR; i++) {
      const biomeHue = { tundra: 200, boreal: 150, temperate: 90, desert: 42, tropical: 110, steppe: 60 }[game.regions[i].biome] ?? 90;
      const h = biomeHue + ((i * 13) % 11) - 5;
      const l = 60 + ((i * 7) % 3) * 3;
      this.neutralCol.push(`hsl(${h},${biomeHue === 42 ? 38 : 26}%,${l}%)`);
    }
    this.baseCanvas = document.createElement('canvas');
    this.dirtyBase = true;
    this.dirtyDyn = true;
    this.selectedRegion = -1;
    this.hoverRegion = -1;
    window.addEventListener('resize', () => this.resize());
    this.resize();
  }

  vwSafe() {
    const r = this.canvas.getBoundingClientRect();
    return r.width || 800;
  }

  resize() {
    const r = this.canvas.getBoundingClientRect();
    this.canvas.width = Math.floor(r.width * this.dpr);
    this.canvas.height = Math.floor(r.height * this.dpr);
    this.vw = r.width; this.vh = r.height;
    this.dirtyBase = true; this.dirtyDyn = true;
  }

  centerOn(gx, gy) {
    this.offX = this.vw / 2 - gx * this.scale;
    this.offY = this.vh / 2 - gy * this.scale;
  }

  clampOff() {
    const W = this.game.W * this.scale, H = this.game.H * this.scale;
    this.offX = Math.min(60, Math.max(this.vw - W - 60, this.offX));
    this.offY = Math.min(60, Math.max(this.vh - H - 60, this.offY));
  }

  screenToCell(sx, sy) {
    const x = Math.floor((sx - this.offX) / this.scale);
    const y = Math.floor((sy - this.offY) / this.scale);
    return [x, y];
  }

  regionAtScreen(sx, sy) {
    const [x, y] = this.screenToCell(sx, sy);
    const g = this.game;
    if (x < 0 || y < 0 || x >= g.W || y >= g.H) return -1;
    return g.regionOf[y * g.W + x];
  }

  zoomAt(sx, sy, factor) {
    const [cx, cy] = this.screenToCell(sx, sy);
    this.scale = Math.min(this.maxScale, Math.max(this.minScale, this.scale * factor));
    this.offX = sx - cx * this.scale;
    this.offY = sy - cy * this.scale;
    this.clampOff();
    this.dirtyBase = true;
  }

  invalidate() { this.dirtyDyn = true; }

  drawBase() {
    const g = this.game, ctx = this.ctx;
    const bw = g.W * this.scale, bh = g.H * this.scale;
    const bc = this.baseCanvas;
    bc.width = Math.max(1, Math.floor(bw * this.dpr));
    bc.height = Math.max(1, Math.floor(bh * this.dpr));
    const bctx = bc.getContext('2d');
    bctx.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
    // oceano: gradiente vertical (equador mais claro, polos mais escuros)
    const og = bctx.createLinearGradient(0, 0, 0, bh);
    og.addColorStop(0, '#17395a'); og.addColorStop(0.5, '#2b6895'); og.addColorStop(1, '#17395a');
    bctx.fillStyle = og; bctx.fillRect(0, 0, bw, bh);
    // faixa de profundidade proxima a costa (efeito "plataforma continental")
    const s = this.scale;
    if (s >= 2) {
      bctx.fillStyle = 'rgba(120, 200, 235, 0.16)';
      for (let y = 0; y < g.H; y++) {
        const rowOff = y * g.W;
        for (let x = 0; x < g.W; x++) {
          const i = rowOff + x;
          if (g.land[i]) continue;
          let near = false;
          for (const [dx, dy] of [[1,0],[-1,0],[0,1],[0,-1],[1,1],[-1,-1],[1,-1],[-1,1]]) {
            const nx = x + dx, ny = y + dy;
            if (nx >= 0 && ny >= 0 && nx < g.W && ny < g.H && g.land[ny * g.W + nx]) { near = true; break; }
          }
          if (near) bctx.fillRect(x * s, y * s, s, s);
        }
      }
    }
    // terra neutra + recursos
    for (let y = 0; y < g.H; y++) {
      for (let x = 0; x < g.W; x++) {
        const i = y * g.W + x;
        if (!g.land[i]) continue;
        const rid = g.regionOf[i];
        if (rid < 0) continue;
        bctx.fillStyle = this.neutralCol[rid];
        bctx.fillRect(x * s, y * s, s, s);
        const t = g.resGrid[i];
        if (t >= 0 && s >= 4) {
          bctx.fillStyle = RES_COLORS[t];
          const m = Math.max(1, s * 0.28);
          bctx.fillRect(x * s + s / 2 - m / 2, y * s + s / 2 - m / 2, m, m);
        }
      }
    }
    // contornos costeiros suaves
    if (s >= 3) {
      bctx.strokeStyle = 'rgba(10,25,40,0.45)';
      bctx.lineWidth = 1;
      bctx.beginPath();
      for (let y = 0; y < g.H; y++) {
        const rowOff = y * g.W;
        for (let x = 0; x < g.W; x++) {
          const i = rowOff + x;
          if (!g.land[i]) continue;
          const px = x * s, py = y * s;
          if (!(x + 1 < g.W && g.land[i + 1])) { bctx.moveTo(px + s, py); bctx.lineTo(px + s, py + s); }
          if (!(y + 1 < g.H && g.land[i + g.W])) { bctx.moveTo(px, py + s); bctx.lineTo(px + s, py + s); }
          if (!(x - 1 >= 0 && g.land[i - 1])) { bctx.moveTo(px, py); bctx.lineTo(px, py + s); }
          if (!(y - 1 >= 0 && g.land[i - g.W])) { bctx.moveTo(px, py); bctx.lineTo(px + s, py); }
        }
      }
      bctx.stroke();
    }
    this.dirtyBase = false;
  }

  draw() {
    const g = this.game, ctx = this.ctx, s = this.scale;
    ctx.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
    // fundo alem dos limites do mapa: oceano profundo
    ctx.fillStyle = '#0d2438';
    ctx.fillRect(0, 0, this.vw, this.vh);
    if (this.dirtyBase) this.drawBase();

    const bc = this.baseCanvas;
    ctx.imageSmoothingEnabled = false;
    ctx.drawImage(bc, 0, 0, bc.width, bc.height, this.offX, this.offY, g.W * s, g.H * s);

    // ---- mapa de donos por celula + pintura dos territorios ----
    const nPix = g.W * g.H;
    if (!this._colorMap || this._colorMap.length !== nPix) this._colorMap = new Int16Array(nPix).fill(-1);
    const cm = this._colorMap;
    cm.fill(-1);
    const groups = new Map(); // cid -> [cells]
    for (let r = 0; r < g.nR; r++) {
      const cid = g.owner[r];
      if (cid < 0) continue;
      let arr = groups.get(cid);
      if (!arr) { arr = []; groups.set(cid, arr); }
      const cells = g.regionCells[r];
      for (const cell of cells) { cm[cell] = cid; arr.push(cell); }
    }
    // pintura em lote (uma cor por pais)
    for (const [cid, cells] of groups) {
      ctx.fillStyle = g.countries[cid].color;
      for (const cell of cells) {
        const x = cell % g.W, y = (cell / g.W) | 0;
        const px = this.offX + x * s, py = this.offY + y * s;
        if (px > this.vw || py > this.vh || px + s < 0 || py + s < 0) continue;
        ctx.fillRect(px, py, s, s);
      }
    }
    // sombreado sutil nas bordas externas de cada pais (efeito "relevo")
    if (s >= 3) {
      ctx.globalAlpha = 0.15;
      ctx.fillStyle = '#000';
      const t = Math.max(1, s * 0.22);
      for (let y = 0; y < g.H; y++) {
        const rowOff = y * g.W;
        for (let x = 0; x < g.W; x++) {
          const i = rowOff + x;
          if (cm[i] < 0) continue;
          const px = this.offX + x * s, py = this.offY + y * s;
          if (px > this.vw || py > this.vh || px + s < 0 || py + s < 0) continue;
          if (!(x + 1 < g.W && cm[i + 1] === cm[i])) ctx.fillRect(px + s - t, py, t, s);
          if (!(y + 1 < g.H && cm[i + g.W] === cm[i])) ctx.fillRect(px, py + s - t, s, t);
        }
      }
      ctx.globalAlpha = 1;
    }
    // fronteiras entre PAISES distintos: traco escuro forte
    if (s >= 2) {
      ctx.strokeStyle = 'rgba(12,18,26,0.8)';
      ctx.lineWidth = Math.max(1, s * 0.18);
      ctx.beginPath();
      for (let y = 0; y < g.H; y++) {
        const rowOff = y * g.W;
        for (let x = 0; x < g.W; x++) {
          const i = rowOff + x;
          if (cm[i] < 0) continue;
          const px = this.offX + x * s, py = this.offY + y * s;
          if (px > this.vw || py > this.vh || px + s < 0 || py + s < 0) continue;
          const c = cm[i];
          if (x + 1 < g.W && cm[i + 1] !== c) { ctx.moveTo(px + s, py); ctx.lineTo(px + s, py + s); }
          if (y + 1 < g.H && cm[i + g.W] !== c) { ctx.moveTo(px, py + s); ctx.lineTo(px + s, py + s); }
        }
      }
      ctx.stroke();
      // divisoes INTERNAS entre regioes do mesmo pais: traco claro fino
      if (s >= 3) {
        const ro = g.regionOf;
        ctx.strokeStyle = 'rgba(255,255,255,0.22)';
        ctx.lineWidth = 1;
        ctx.beginPath();
        for (let y = 0; y < g.H; y++) {
          const rowOff = y * g.W;
          for (let x = 0; x < g.W; x++) {
            const i = rowOff + x;
            if (cm[i] < 0) continue;
            const px = this.offX + x * s, py = this.offY + y * s;
            if (px > this.vw || py > this.vh || px + s < 0 || py + s < 0) continue;
            const rid = ro[i];
            if (x + 1 < g.W && cm[i + 1] === cm[i]) {
              const r2 = ro[i + 1];
              if (r2 >= 0 && r2 !== rid) { ctx.moveTo(px + s, py); ctx.lineTo(px + s, py + s); }
            }
            if (y + 1 < g.H && cm[i + g.W] === cm[i]) {
              const r2 = ro[i + g.W];
              if (r2 >= 0 && r2 !== rid) { ctx.moveTo(px, py + s); ctx.lineTo(px + s, py + s); }
            }
          }
        }
        ctx.stroke();
      }
    }

    // nomes dos paises (no centro do territorio, com fundo legivel) + icones de exercito
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    const drawnCountryNames = new Set();
    for (let r = 0; r < g.nR; r++) {
      const cid = g.owner[r];
      if (cid < 0) continue;
      const reg = g.regions[r];
      const country = g.countries[cid];
      // nome do PAIS: uma unica vez, no centroide ponderado do territorio
      if (!drawnCountryNames.has(cid) && country.name && (country.cells || 0) > 0 && s >= 2) {
        const ccx = this.offX + country.cx * s, ccy = this.offY + country.cy * s;
        if (ccx > -80 && ccy > -30 && ccx < this.vw + 80 && ccy < this.vh + 30) {
          drawnCountryNames.add(cid);
          const fs = Math.min(15, Math.max(9, Math.sqrt(country.cells) * 0.55));
          ctx.font = `700 ${fs}px system-ui`;
          const label = country.isPlayer ? `★ ${country.name}` : country.name;
          const tw = ctx.measureText(label).width;
          ctx.fillStyle = 'rgba(8,12,18,0.55)';
          roundRect(ctx, ccx - tw / 2 - 5, ccy - fs / 2 - 3, tw + 10, fs + 6, 4);
          ctx.fill();
          ctx.fillStyle = '#fff';
          ctx.strokeStyle = 'rgba(0,0,0,.8)'; ctx.lineWidth = 2;
          ctx.strokeText(label, ccx, ccy);
          ctx.fillText(label, ccx, ccy);
        }
      }
      // nome da REGIAO (apenas com zoom alto)
      if (s >= 7 && reg.size >= 12) {
        const px = this.offX + reg.cx * s, py = this.offY + reg.cy * s;
        if (px < -60 || py < -60 || px > this.vw + 60 || py > this.vh + 60) continue;
        ctx.font = `${Math.min(11, s)}px system-ui`;
        ctx.fillStyle = 'rgba(255,255,255,.75)';
        ctx.strokeStyle = 'rgba(0,0,0,.55)'; ctx.lineWidth = 2.5;
        ctx.strokeText(reg.name, px, py - s * 2.2);
        ctx.fillText(reg.name, px, py - s * 2.2);
      }
      // exercito estacionado
      const px = this.offX + reg.cx * s, py = this.offY + reg.cy * s;
      if (px < -50 || py < -50 || px > this.vw + 50 || py > this.vh + 50) continue;
      const army = g.army[r];
      if (army > 1 && s >= 4) {
        ctx.font = `${Math.min(14, 7 + s)}px sans-serif`;
        ctx.fillStyle = '#fff';
        ctx.strokeStyle = 'rgba(0,0,0,.7)'; ctx.lineWidth = 3;
        const txt = '⚔' + Math.round(army);
        ctx.strokeText(txt, px, py + s * 2);
        ctx.fillText(txt, px, py + s * 2);
      }
    }
    ctx.textBaseline = 'alphabetic';

    // destaque hover/selecao
    for (const rid of [this.hoverRegion, this.selectedRegion]) {
      if (rid < 0 || !g.regions[rid]) continue;
      ctx.strokeStyle = rid === this.selectedRegion ? '#ffd166' : 'rgba(255,255,255,.7)';
      ctx.lineWidth = 2;
      const cells = g.regionCells[rid];
      ctx.beginPath();
      for (const cell of cells) {
        const x = cell % g.W, y = (cell / g.W) | 0;
        const px = this.offX + x * s, py = this.offY + y * s;
        const right = !(x + 1 < g.W && g.regionOf[cell + 1] === rid);
        const down = !(y + 1 < g.H && g.regionOf[cell + g.W] === rid);
        const left = !(x - 1 >= 0 && g.regionOf[cell - 1] === rid);
        const up = !(y - 1 >= 0 && g.regionOf[cell - g.W] === rid);
        if (right) { ctx.moveTo(px + s, py); ctx.lineTo(px + s, py + s); }
        if (left) { ctx.moveTo(px, py); ctx.lineTo(px, py + s); }
        if (down) { ctx.moveTo(px, py + s); ctx.lineTo(px + s, py + s); }
        if (up) { ctx.moveTo(px, py); ctx.lineTo(px + s, py); }
      }
      ctx.stroke();
    }
    this.dirtyDyn = false;
  }

  minimap(miniCanvas, game) {
    const mc = miniCanvas, mctx = mc.getContext('2d');
    const mw = mc.width, mh = mc.height;
    // oceano com gradiente
    const og = mctx.createLinearGradient(0, 0, 0, mh);
    og.addColorStop(0, '#17395a'); og.addColorStop(0.5, '#2b6895'); og.addColorStop(1, '#17395a');
    mctx.fillStyle = og; mctx.fillRect(0, 0, mw, mh);
    // amostragem: varre as celulas do jogo e pinta no pixel do minimapa
    // (evita buracos quando o mapa e maior que o minimapa)
    const px = new Int32Array(mw * mh).fill(-2); // -2 oceano, -1 neutro, >=0 cid
    const sx = mw / game.W, sy = mh / game.H;
    for (let y = 0; y < game.H; y++) {
      const my = Math.min(mh - 1, (y * sy) | 0);
      for (let x = 0; x < game.W; x++) {
        const i = y * game.W + x;
        if (!game.land[i]) continue;
        const rid = game.regionOf[i];
        const cid = rid >= 0 ? game.owner[rid] : -1;
        const mx = Math.min(mw - 1, (x * sx) | 0);
        const v = cid >= 0 ? cid : -1;
        // pais tem prioridade sobre neutro
        const cur = px[my * mw + mx];
        if (cur < 0 && v >= 0 || cur === -1 && v >= 0 || cur === -2) px[my * mw + mx] = v;
      }
    }
    for (let my = 0; my < mh; my++) {
      for (let mx = 0; mx < mw; mx++) {
        const v = px[my * mw + mx];
        if (v === -2) continue;
        mctx.fillStyle = v >= 0 ? game.countries[v].color : '#8a917d';
        mctx.fillRect(mx, my, 1, 1);
      }
    }
    // destaque do territorio do jogador
    if (game.player && game.player.alive) {
      mctx.fillStyle = 'rgba(255,209,102,0.45)';
      for (let r = 0; r < game.nR; r++) {
        if (game.owner[r] !== game.player.id) continue;
        const reg = game.regions[r];
        mctx.fillRect(reg.cx * sx - 1, reg.cy * sy - 1, 3, 3);
      }
    }
    // viewport
    mctx.strokeStyle = '#fff'; mctx.lineWidth = 1.5;
    mctx.strokeRect(-this.offX / (game.W * this.scale) * mw, -this.offY / (game.H * this.scale) * mh,
      this.vw / (game.W * this.scale) * mw, this.vh / (game.H * this.scale) * mh);
  }
}
