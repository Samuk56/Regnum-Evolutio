// ==================== MAIN / UI ====================
import { Game, newGame, fmtYear } from './game.js';
import { Renderer } from './render.js';
import { TECHS, GOS, eraInfo, RES_NAMES_PT, RES_ICONS } from './data.js';

const $ = (id) => document.getElementById(id);
let world = null;
let game = null;
let renderer = null;
let running = false;
let speedIdx = 1;
const SPEEDS = [0.5, 2, 6, 15]; // anos por segundo
let panelTab = 'tech';
let selectedRegion = -1;
let dragging = false, dragMoved = false, lastX = 0, lastY = 0;

// ---------------- setup de selecao ----------------
async function init() {
  const resp = await fetch(assetUrl('world.json'));
  world = await resp.json();
  buildEraSlider();
  buildGovPicker();
  $('btnStart').addEventListener('click', startGame);
  $('randomName').addEventListener('click', () => {
    $('pname').value = randomName();
  });
  $('pname').value = randomName();
  $('setupScreen').style.display = 'flex';
}

function assetUrl(p) {
  // compatível com GitHub Pages em subpasta: caminhos relativos
  return new URL('assets/' + p, import.meta.url).href;
}

function randomName() {
  const pre = ['Nova', 'Grande', 'Reino de', 'República de', 'Império de', 'União de', 'Federação de'];
  const base = ['Aurora', 'Vespera', 'Solaris', 'Terra Nova', 'Alvorada', 'Meridiana', 'Zafira', 'Ígnea', 'Verdânia', 'Aquilônia', 'Marésia', 'Ferrovia', 'Helvécia', 'Andaluz', 'Oriente'];
  return `${pre[Math.floor(Math.random() * pre.length)]} ${base[Math.floor(Math.random() * base.length)]}`;
}

let selYear = 1500;
let selGov = 'feudal';
function buildEraSlider() {
  const sl = $('yearSlider');
  sl.min = -3000; sl.max = 2026; sl.value = 1500; sl.step = 10;
  const upd = () => {
    selYear = +sl.value;
    $('yearLabel').textContent = `${fmtYear(selYear)} — ${eraInfo(selYear).label}`;
    renderPreview();
  };
  sl.addEventListener('input', upd);
  upd();
}

function buildGovPicker() {
  const box = $('govPicker');
  box.innerHTML = '';
  for (const g of GOS) {
    const b = document.createElement('button');
    b.className = 'govbtn' + (g.id === selGov ? ' active' : '');
    b.innerHTML = `<span class="gi">${g.icon}</span><span>${g.name}</span>`;
    b.title = g.desc;
    b.onclick = () => { selGov = g.id; buildGovPicker(); };
    box.appendChild(b);
  }
}

// preview canvas do setup
let previewR = null;
function renderPreview() {
  const cv = $('previewCanvas');
  if (!world) return;
  if (!previewR) previewR = new Renderer(cv, fakeGameForPreview());
  else previewR.game = fakeGameForPreview();
  // ajusta escala para caber o mundo inteiro no canvas
  const rect = cv.getBoundingClientRect();
  previewR.vw = rect.width || 640; previewR.vh = rect.height || 320;
  previewR.canvas.width = Math.floor(previewR.vw * previewR.dpr);
  previewR.canvas.height = Math.floor(previewR.vh * previewR.dpr);
  previewR.scale = Math.min(previewR.vw / previewR.game.W, previewR.vh / previewR.game.H);
  previewR.offX = (previewR.vw - previewR.game.W * previewR.scale) / 2;
  previewR.offY = (previewR.vh - previewR.game.H * previewR.scale) / 2;
  previewR.dirtyBase = true; previewR.dirtyDyn = true;
  previewR.draw();
}

// mini "game" apenas para preview estatico
let _fake = null;
function fakeGameForPreview() {
  if (_fake) return _fake;
  const g = new Game(world);
  _fake = g;
  return g;
}

// ---------------- iniciar partida ----------------
function startGame() {
  const name = $('pname').value.trim() || randomName();
  // regioes iniciais: clicadas no preview ou padrao (aleatorias conforme ano)
  let regions = previewClicks.slice(0, 3);
  if (!regions.length) {
    // escolhe regiao aleatoria adequada ao ano (dentro de terra firme, tamanho razoavel)
    const cands = world.regions.filter(r => !r.start && r.size >= 4 && r.size <= 300);
    const pick = cands[Math.floor(Math.random() * cands.length)];
    regions = [pick.id];
    for (const n of pick.neighbors) {
      if (regions.length < 2) {
        const nr = world.regions[n];
        if (!nr.start && nr.country === pick.country) regions.push(n);
      }
    }
  }
  game = newGame(world, { year: selYear, playerName: name, gov: selGov, playerRegions: regions, bots: 16 });
  game.onPlayerLoss = () => updateInfoPanel();
  $('setupScreen').style.display = 'none';
  $('hud').style.display = 'flex';
  setupControls();
  renderer = new Renderer($('map'), game);
  renderer.centerOn(game.regions[regions[0]].cx, game.regions[regions[0]].cy);
  running = true;
  requestAnimationFrame(loop);
  buildTechTree();
  buildGovTree();
  updateInfoPanel();
  addToast(`Bem-vindo a ${name}! Começando em ${fmtYear(selYear)}.`);
}

let previewClicks = [];
// cliques no preview para escolher local de nascimento
window.addEventListener('DOMContentLoaded', () => {
  init();
  const cv = $('previewCanvas');
  cv.addEventListener('click', (e) => {
    if (!world) return;
    const rect = cv.getBoundingClientRect();
    const x = Math.floor((e.clientX - rect.left) / rect.width * world.w);
    const y = Math.floor((e.clientY - rect.top) / rect.height * world.h);
    if (x < 0 || y < 0 || x >= world.w || y >= world.h) return;
    const rid = world.region[y][x];
    if (rid < 0) return;
    const reg = world.regions[rid];
    if (reg.start) return;
    if (!previewClicks.includes(rid)) {
      if (previewClicks.length >= 3) previewClicks.shift();
      previewClicks.push(rid);
    } else previewClicks = previewClicks.filter(r => r !== rid);
    drawPreviewOverlay();
  });
});

function drawPreviewOverlay() {
  const g = fakeGameForPreview();
  for (const r of previewClicks) g.owner[r] = 999;
  for (let r = 0; r < g.nR; r++) if (g.owner[r] === 999 && !previewClicks.includes(r)) g.owner[r] = -1;
  g.countries = [{ id: 999, color: '#ffd166' }];
  if (previewR) previewR.invalidate();
}

// ---------------- loop principal ----------------
let lastT = performance.now();
let acc = 0;
function loop(now) {
  if (!running) return;
  const dt = Math.min(0.1, (now - lastT) / 1000);
  lastT = now;
  if (!game.finished) {
    acc += dt * SPEEDS[speedIdx];
    while (acc >= 1) { game.step(1); acc -= 1; tickUI++; }
  }
  renderer.invalidate();
  renderer.draw();
  if (tickUI % 15 === 0) { updateHud(); updateInfoPanel(); drawMinimap(); }
  if (game.finished) showEnd();
  requestAnimationFrame(loop);
}
let tickUI = 0;

function drawMinimap() {
  if (!renderer) return;
  renderer.minimap($('minimap'), game);
}

// ---------------- HUD ----------------
function updateHud() {
  if (!game) return;
  const p = game.player;
  $('hudYear').textContent = fmtYear(game.year);
  $('hudEra').textContent = game.era.label;
  $('hudMoney').textContent = Math.round(p.treasury).toLocaleString('pt-BR');
  $('hudPop').textContent = Math.round(p.pop * 8).toLocaleString('pt-BR');
  const totalArmy = Math.round(p.armyPool + game.allArmies(p));
  $('hudArmy').textContent = totalArmy.toLocaleString('pt-BR');
  const st = game.resStock(p);
  p._stocksCache = st;
  $('resBar').innerHTML = Object.entries(st).map(([k, v]) =>
    `<span class="reschip" title="${RES_NAMES_PT[k]}">${RES_ICONS[k]} ${Math.round(v)}</span>`).join('');
  if (p.researching) {
    const t = TECHS.find(x => x.id === p.researching.id);
    $('researchNow').innerHTML = `🔬 Pesquisando <b>${t.name}</b> (${Math.floor(p.researching.progress / p.researching.need * 100)}%)`;
  } else {
    $('researchNow').innerHTML = GOV_LOCKED(p) ? '⛔ Sem Estado — nada é pesquisado' : '🕊️ Pesquisa ociosa';
  }
}
function GOV_LOCKED(c) { const g = GOS.find(x => x.id === c.gov); return g && g.locked; }

// ---------------- painel lateral ----------------
function setupControls() {
  const cv = $('map');
  cv.addEventListener('mousedown', (e) => { dragging = true; dragMoved = false; lastX = e.clientX; lastY = e.clientY; });
  window.addEventListener('mouseup', (e) => {
    if (dragging && !dragMoved) onClickMap(e);
    dragging = false;
  });
  window.addEventListener('mousemove', (e) => {
    if (!renderer) return;
    const rect = cv.getBoundingClientRect();
    renderer.hoverRegion = renderer.regionAtScreen(e.clientX - rect.left, e.clientY - rect.top);
    if (dragging) {
      const dx = e.clientX - lastX, dy = e.clientY - lastY;
      if (Math.abs(dx) + Math.abs(dy) > 3) dragMoved = true;
      renderer.offX += dx; renderer.offY += dy; renderer.clampOff();
      lastX = e.clientX; lastY = e.clientY;
    }
  });
  cv.addEventListener('wheel', (e) => {
    e.preventDefault();
    const rect = cv.getBoundingClientRect();
    renderer.zoomAt(e.clientX - rect.left, e.clientY - rect.top, e.deltaY < 0 ? 1.15 : 0.87);
  }, { passive: false });
  // touch
  let pinchD = 0;
  cv.addEventListener('touchstart', (e) => {
    if (e.touches.length === 1) { dragging = true; dragMoved = false; lastX = e.touches[0].clientX; lastY = e.touches[0].clientY; }
    if (e.touches.length === 2) pinchD = Math.hypot(e.touches[0].clientX - e.touches[1].clientX, e.touches[0].clientY - e.touches[1].clientY);
  });
  cv.addEventListener('touchmove', (e) => {
    e.preventDefault();
    if (e.touches.length === 1 && dragging) {
      const dx = e.touches[0].clientX - lastX, dy = e.touches[0].clientY - lastY;
      if (Math.abs(dx) + Math.abs(dy) > 3) dragMoved = true;
      renderer.offX += dx; renderer.offY += dy; renderer.clampOff();
      lastX = e.touches[0].clientX; lastY = e.touches[0].clientY;
    } else if (e.touches.length === 2) {
      const d = Math.hypot(e.touches[0].clientX - e.touches[1].clientX, e.touches[0].clientY - e.touches[1].clientY);
      const rect = cv.getBoundingClientRect();
      renderer.zoomAt((e.touches[0].clientX + e.touches[1].clientX) / 2 - rect.left, (e.touches[0].clientY + e.touches[1].clientY) / 2 - rect.top, d / pinchD);
      pinchD = d;
    }
  }, { passive: false });
  cv.addEventListener('touchend', (e) => {
    if (dragging && !dragMoved && e.changedTouches.length) {
      const t = e.changedTouches[0];
      onClickMap({ clientX: t.clientX, clientY: t.clientY });
    }
    dragging = false;
  });

  $('speedBtns').querySelectorAll('button').forEach((b, i) => {
    b.onclick = () => { speedIdx = i; $('speedBtns').querySelectorAll('button').forEach(x => x.classList.remove('active')); b.classList.add('active'); };
  });
  $('tabTech').onclick = () => switchTab('tech');
  $('tabGov').onclick = () => switchTab('gov');
  $('tabLog').onclick = () => switchTab('log');
  $('closePanel').onclick = () => { $('sidePanel').classList.remove('open'); };
  $('openPanelBtn').onclick = () => switchTab(panelTab);
  $('centerCapital').onclick = () => {
    const r = game.regions[game.player.capital];
    renderer.centerOn(r.cx, r.cy);
  };
  $('minimap').addEventListener('click', (e) => {
    const rect = e.target.getBoundingClientRect();
    const gx = (e.clientX - rect.left) / rect.width * game.W;
    const gy = (e.clientY - rect.top) / rect.height * game.H;
    renderer.centerOn(gx, gy);
  });
}

function switchTab(t) {
  panelTab = t;
  for (const id of ['tech', 'gov', 'log']) $('tab' + id[0].toUpperCase() + id.slice(1)).classList.toggle('active', id === t);
  $('panelTech').style.display = t === 'tech' ? '' : 'none';
  $('panelGov').style.display = t === 'gov' ? '' : 'none';
  $('panelLog').style.display = t === 'log' ? '' : 'none';
  $('sidePanel').classList.add('open');
}

function onClickMap(e) {
  const rect = $('map').getBoundingClientRect();
  const rid = renderer.regionAtScreen(e.clientX - rect.left, e.clientY - rect.top);
  selectedRegion = rid;
  renderer.selectedRegion = rid;
  updateInfoPanel();
  $('sidePanel').classList.add('open');
  if (panelTab === 'log') {} else switchTabKeep(panelTab);
}
function switchTabKeep(t) { /* painel ja aberto */ }

function updateInfoPanel() {
  if (!game) return;
  const p = game.player;
  const info = $('regionInfo');
  if (selectedRegion < 0) { info.innerHTML = '<i>Clique numa região do mapa.</i>'; return; }
  const reg = game.regions[selectedRegion];
  const cid = game.owner[selectedRegion];
  const owner = cid >= 0 ? game.countries[cid] : null;
  const army = Math.round(game.army[selectedRegion]);
  let html = `<div class="ri-title">${reg.name}</div>`;
  html += `<div class="ri-row">Dono: <b style="color:${owner ? owner.color : '#aaa'}">${owner ? owner.name : 'Neutro'}</b></div>`;
  html += `<div class="ri-row">Exército: <b>⚔ ${army}</b></div>`;
  const isMine = cid === p.id;
  if (isMine) {
    html += `<div class="ri-actions">
      <button onclick="window._deploySel(10)">+10 tropas</button>
      <button onclick="window._deploySel(50)">+50</button>
      <button onclick="window._withdrawSel()">Retirar</button>
    </div>`;
    html += `<div class="ri-row small">Reserva nacional: ⚔ ${Math.round(p.armyPool)}</div>`;
  } else if (owner && isAdjacentToMine(selectedRegion)) {
    const atWar = p.atWarWith.has(owner.id);
    html += `<div class="ri-actions">
      <button class="${atWar ? 'danger' : 'warn'}" onclick="window._declareOrAttack(${owner.id})">${atWar ? '⚔ Atacar esta região' : '📢 Declarar guerra'}</button>
    </div>`;
  } else if (!owner && reg.start) {
    html += `<div class="ri-row small">Território inexplorado/gelo perpétuo.</div>`;
  }
  info.innerHTML = html;
}

function isAdjacentToMine(r) {
  for (const n of game.regions[r].neighbors) if (game.owner[n] === game.player.id) return true;
  return false;
}

window._deploySel = (amt) => {
  if (selectedRegion < 0) return;
  game.deployArmy(game.player, selectedRegion, amt);
  updateInfoPanel(); updateHud();
};
window._withdrawSel = () => {
  if (selectedRegion < 0) return;
  const a = game.army[selectedRegion];
  game.army[selectedRegion] = 1;
  game.player.armyPool += a - 1;
  updateInfoPanel(); updateHud();
};
window._declareOrAttack = (eid) => {
  const p = game.player, e = game.countries[eid];
  if (!p.atWarWith.has(eid)) {
    p.atWarWith.add(eid); e.atWarWith.add(p.id);
    game.addLog(`📢 ${p.name} declarou guerra a ${e.name}!`);
    addToast(`Guerra declarada contra ${e.name}!`);
  } else {
    // ataca todas as fronteiras possiveis com essa nacao
    let did = false;
    for (let r = 0; r < game.nR; r++) {
      if (game.owner[r] !== p.id) continue;
      for (const n of game.regions[r].neighbors) {
        if (game.owner[n] === eid && game.army[r] > game.army[n]) {
          if (game.attackFrom(p, r, n)) did = true;
        }
      }
    }
    if (!did) addToast('Ataque falhou — concentre mais tropas na fronteira.');
  }
  updateInfoPanel(); updateHud();
};

// ---------------- arvore tecnologica ----------------
const CAT_COLORS = { base: '#8d99ae', military: '#e74c3c', science: '#3498db', dev: '#2ecc71', mining: '#e67e22', energy: '#f1c40f', defense: '#9b59b6', navy: '#1abc9c', industry: '#d35400', econ: '#fdcb6e' };
function buildTechTree() {
  const wrap = $('panelTech');
  wrap.innerHTML = '';
  const cats = [...new Set(TECHS.map(t => t.cat))];
  for (const cat of cats) {
    const sec = document.createElement('div');
    sec.className = 'techcat';
    sec.innerHTML = `<h4 style="border-color:${CAT_COLORS[cat]}">${cat.toUpperCase()}</h4>`;
    const list = TECHS.filter(t => t.cat === cat);
    for (const t of list) {
      const card = document.createElement('div');
      card.className = 'techcard';
      card.dataset.id = t.id;
      sec.appendChild(card);
    }
    wrap.appendChild(sec);
  }
  refreshTechCards();
}

function refreshTechCards() {
  if (!game) return;
  const p = game.player;
  document.querySelectorAll('.techcard').forEach(card => {
    const t = TECHS.find(x => x.id === card.dataset.id);
    const done = p.researched.has(t.id);
    const avail = game.techAvailable(p, t);
    const afford = game.canAfford(p, t.cost);
    const researching = p.researching && p.researching.id === t.id;
    card.className = 'techcard' + (done ? ' done' : researching ? ' busy' : avail ? (afford ? ' ready' : ' needres') : ' locked');
    const costStr = Object.entries(t.cost).filter(([k]) => k !== 'pt').map(([k, v]) => `${RES_ICONS[k] || k} ${v}`).join(' ');
    let pct = '';
    if (researching) pct = `<div class="prog"><div style="width:${Math.min(100, p.researching.progress / p.researching.need * 100)}%"></div></div>`;
    card.innerHTML = `<div class="tc-head"><b>${t.name}</b><span class="tc-era">${fmtYear(t.era)}</span></div>
      <div class="tc-desc">${t.desc}</div>
      <div class="tc-cost">🧪 ${t.cost.pt}${costStr ? ' · ' + costStr : ''}</div>${pct}`;
    card.onclick = () => {
      if (done || researching) return;
      if (!avail) { addToast('⚠️ Requisitos não atendidos (pré-requisitos, era ou recursos no território).'); return; }
      if (!afford) { addToast('⚠️ Faltam recursos no seu território.'); return; }
      if (game.startResearch(p, t.id)) { addToast(`🔬 Pesquisa iniciada: ${t.name}`); refreshTechCards(); }
    };
  });
}

// ---------------- arvore de governo ----------------
function buildGovTree() {
  const wrap = $('panelGov');
  wrap.innerHTML = '<h4>Sistema de Governo</h4>';
  const grid = document.createElement('div');
  grid.className = 'govtree';
  for (const g of GOS) {
    const cur = game.player.gov === g.id;
    const can = !cur && g.parents.includes(game.player.gov) && !GOV_LOCKED(game.player);
    const el = document.createElement('div');
    el.className = 'govnode' + (cur ? ' current' : can ? ' available' : ' locked');
    el.innerHTML = `<div class="gn-icon">${g.icon}</div><b>${g.name}</b><div class="gn-desc">${g.desc}</div>
      <div class="gn-mods">${Object.entries(g.mods).map(([k, v]) => `<span class="${v >= 0 ? 'up' : 'down'}">${k}: ${v > 0 ? '+' : ''}${Math.round(v * 100)}%</span>`).join('')}</div>`;
    if (can) el.onclick = () => {
      if (confirm(`Adotar ${g.name}? Isso muda todo o funcionamento do país.`)) {
        game.changeGov(game.player, g.id);
        buildGovTree(); refreshTechCards(); updateHud();
      }
    };
    grid.appendChild(el);
  }
  wrap.appendChild(grid);
  const note = document.createElement('div');
  note.className = 'gnote';
  note.textContent = '💡 Anarcocapitalismo só permite descobrir Bancos & Moeda. Anarquismo trava toda ação estatal.';
  wrap.appendChild(note);
}

// ---------------- log ----------------
function renderLog() {
  const el = $('panelLog');
  el.innerHTML = game.log.map(l => `<div class="logline"><span class="lgy">${fmtYear(l.year)}</span> ${l.msg}</div>`).join('');
}

// ---------------- toast / fim ----------------
function addToast(msg) {
  const t = document.createElement('div');
  t.className = 'toast';
  t.textContent = msg;
  $('toasts').appendChild(t);
  setTimeout(() => { t.classList.add('out'); setTimeout(() => t.remove(), 400); }, 3500);
}

let endShown = false;
function showEnd() {
  if (endShown) return;
  endShown = true;
  $('endTitle').textContent = game.victory ? '🏆 VITÓRIA!' : '☠️ DERROTA';
  $('endSub').textContent = game.victory
    ? `${game.player.name} dominou o mundo em ${fmtYear(game.year)}!`
    : `${game.player.name} foi apagada da história.`;
  $('endScreen').style.display = 'flex';
}
$('btnRestart') && $('btnRestart').addEventListener('click', () => location.reload());

// atualizacao periodica das abas abertas
setInterval(() => {
  if (!game || !running) return;
  if (panelTab === 'tech') refreshTechCards();
  if (panelTab === 'log') renderLog();
}, 700);
