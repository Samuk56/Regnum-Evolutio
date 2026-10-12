// ==================== RENDERIZADOR (Canvas 2D otimizado) ====================
// Duas camadas: base estatica (agua + recursos, redesenhada so quando precisa)
// e camada dinamica (territorios pintados), desenhada em offscreen por celula.

const SEA1 = '#24567d', SEA2 = '#1b4463';
const RES_COLORS = ['#8a5a2e', '#9aa0a6', '#c0392b', '#16a085']; // carvao ferro petroleo uranio

export class Renderer {
  constructor(canvas, game) {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d', { alpha: false });
    this.game = game;
    this.scale = 6;          // px por celula (zoom)
    this.minScale = 2; this.maxScale = 18;
    this.offX = 0; this.offY = 0;
    this.dpr = Math.min(window.devicePixelRatio || 1, 2);
    // cache de cor por regiao neutra
    this.neutralCol = [];
    for (let i = 0; i < game.nR; i++) {
      const h = (i * 47) % 360;
      this.neutralCol.push(`hsl(${h},22%,${58 + (i % 3) * 3}%)`);
    }
    this.baseCanvas = document.createElement('canvas');
    this.dirtyBase = true;
    this.dirtyDyn = true;
    this.selectedRegion = -1;
    this.hoverRegion = -1;
    window.addEventListener('resize', () => this.resize());
    this.resize();
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
    // mar com gradiente simples em faixas
    bctx.fillStyle = SEA1; bctx.fillRect(0, 0, bw, bh);
    bctx.fillStyle = SEA2;
    for (let y = 0; y < g.H; y += 8) bctx.fillRect(0, y * this.scale, bw, 4 * this.scale);
    // terra neutra + recursos
    const s = this.scale;
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
    this.dirtyBase = false;
  }

  draw() {
    const g = this.game, ctx = this.ctx, s = this.scale;
    ctx.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
    ctx.fillStyle = '#123';
    ctx.fillRect(0, 0, this.vw, this.vh);
    if (this.dirtyBase) this.drawBase();

    const bc = this.baseCanvas;
    ctx.imageSmoothingEnabled = false;
    ctx.drawImage(bc, 0, 0, bc.width, bc.height, this.offX, this.offY, g.W * s, g.H * s);

    // ---- mapa de cores por celula (1 fillStyle por cor) ----
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
    // pintura em lote
    for (const [cid, cells] of groups) {
      ctx.fillStyle = g.countries[cid].color;
      for (const cell of cells) {
        const x = cell % g.W, y = (cell / g.W) | 0;
        const px = this.offX + x * s, py = this.offY + y * s;
        if (px > this.vw || py > this.vh || px + s < 0 || py + s < 0) continue;
        ctx.fillRect(px, py, s, s);
      }
    }
    // bordas: um unico path por espessura
    if (s >= 4) {
      ctx.strokeStyle = 'rgba(0,0,0,0.35)';
      ctx.lineWidth = 1;
      ctx.beginPath();
      for (let y = 0; y < g.H; y++) {
        const rowOff = y * g.W;
        for (let x = 0; x < g.W; x++) {
          const i = rowOff + x;
          if (cm[i] < 0) continue;
          const px = this.offX + x * s, py = this.offY + y * s;
          if (px > this.vw || py > this.vh || px + s < 0 || py + s < 0) continue;
          if (x + 1 < g.W && cm[i + 1] !== cm[i]) { ctx.moveTo(px + s, py); ctx.lineTo(px + s, py + s); }
          if (y + 1 < g.H && cm[i + g.W] !== cm[i]) { ctx.moveTo(px, py + s); ctx.lineTo(px + s, py + s); }
        }
      }
      ctx.stroke();
    }

    // icones de exercito + nomes das grandes potencias
    ctx.textAlign = 'center';
    for (let r = 0; r < g.nR; r++) {
      const cid = g.owner[r];
      if (cid < 0) continue;
      const reg = g.regions[r];
      const px = this.offX + reg.cx * s, py = this.offY + reg.cy * s;
      if (px < -50 || py < -50 || px > this.vw + 50 || py > this.vh + 50) continue;
      const army = g.army[r];
      if (army > 1 && s >= 3) {
        ctx.font = `${Math.min(16, 8 + s)}px sans-serif`;
        ctx.fillStyle = '#fff';
        ctx.strokeStyle = 'rgba(0,0,0,.7)'; ctx.lineWidth = 3;
        const txt = '⚔' + Math.round(army);
        ctx.strokeText(txt, px, py);
        ctx.fillText(txt, px, py);
      }
      if (reg.size > 60 && s >= 4) {
        ctx.font = `bold ${Math.min(13, s * 1.6)}px system-ui`;
        ctx.fillStyle = 'rgba(255,255,255,.92)';
        ctx.strokeStyle = 'rgba(0,0,0,.6)'; ctx.lineWidth = 3;
        ctx.strokeText(reg.name, px, py - s * 2);
        ctx.fillText(reg.name, px, py - s * 2);
      }
    }

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
    mctx.fillStyle = SEA1; mctx.fillRect(0, 0, mw, mh);
    const sx = mw / game.W, sy = mh / game.H;
    for (let y = 0; y < game.H; y += 1) {
      for (let x = 0; x < game.W; x += 1) {
        const i = y * game.W + x;
        if (!game.land[i]) continue;
        const rid = game.regionOf[i];
        const cid = rid >= 0 ? game.owner[rid] : -1;
        mctx.fillStyle = cid >= 0 ? game.countries[cid].color : '#7d8471';
        mctx.fillRect(x * sx, y * sy, Math.ceil(sx), Math.ceil(sy));
      }
    }
    // viewport
    mctx.strokeStyle = '#fff'; mctx.lineWidth = 1.5;
    mctx.strokeRect(-this.offX / (game.W * this.scale) * mw, -this.offY / (game.H * this.scale) * mh,
      this.vw / (game.W * this.scale) * mw, this.vh / (game.H * this.scale) * mh);
  }
}
