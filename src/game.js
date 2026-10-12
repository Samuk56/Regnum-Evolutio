// ==================== ENGINE DO JOGO ====================
import { TECHS, GOS, eraInfo, eraBonus, COLORS } from './data.js';

const TECH_BY_ID = {}; TECHS.forEach(t => TECH_BY_ID[t.id] = t);
const GOV_BY_ID = {}; GOS.forEach(g => GOV_BY_ID[g.id] = g);

export class Game {
  constructor(world) {
    this.world = world;
    this.W = world.w; this.H = world.h;
    this.land = new Uint8Array(world.w * world.h);
    for (let i = 0; i < this.land.length; i++) this.land[i] = world.land.charCodeAt(i) === 49 ? 1 : 0;
    this.regionOf = Int16Array.from(this.flatRegion(world.region));
    this.resGrid = Int8Array.from(world.resources);
    this.regions = world.regions;
    this.nR = world.regions.length;
    // celulas por regiao
    this.regionCells = [];
    for (let r = 0; r < this.nR; r++) this.regionCells.push([]);
    for (let y = 0; y < this.H; y++)
      for (let x = 0; x < this.W; x++) {
        const rid = this.regionOf[y * this.W + x];
        if (rid >= 0) this.regionCells[rid].push(y * this.W + x);
      }
    this.owner = new Int16Array(this.nR).fill(-1); // pais dono de cada regiao (-1 neutro)
    this.army = new Float32Array(this.nR);          // exercito estacionado na regiao
    this.era = eraInfo(1500);
    this.events = [];
    this.log = [];
    this.tickCount = 0;
    this.finished = false;
    this.victory = null;
  }

  flatRegion(region2d) {
    const out = new Int16Array(this.W * this.H);
    for (let y = 0; y < this.H; y++)
      for (let x = 0; x < this.W; x++) out[y * this.W + x] = region2d[y][x];
    return out;
  }

  // ---------- fundar paises ----------
  makeCountry(name, color, isPlayer, govId, startRegions, year) {
    const era = eraInfo(year);
    const c = {
      id: this.countries.length,
      name, color, isPlayer,
      gov: govId || 'feudal',
      researched: new Set(),
      researching: null,       // {id, progress}
      pt: 0,                   // pontos de pesquisa acumulados? usamos direto progresso
      treasury: 120 * (1 + era.techPower),
      money: 0,                // moeda nacional (anarcocapitalismo)
      pop: 0,                  // populacao total (celulas * fator)
      armyPool: 0,             // soldados treinados sem alocar
      upkeep: 0,
      aggression: 0.3 + Math.random() * 0.5,
      aiPersonality: ['defensive', 'aggressive', 'opportunist'][Math.floor(Math.random() * 3)],
      atWarWith: new Set(),
      wars: {},                // idInimigo -> {front:[], pressure}
      alive: true,
      techLevel: era.techPower,
      capital: startRegions[0],
      foundedYear: year,
      morale: 0.7,
      hasCurrency: false,
    };
    if (!this.countries) this.countries = [];
    this.countries.push(c);
    for (const r of startRegions) {
      this.owner[r] = c.id;
      this.army[r] = (era.milBase * (0.5 + Math.random())) * (era.techPower + 0.3);
    }
    this.recalcPop(c);
    return c;
  }

  recalcPop(c) {
    let n = 0;
    for (let r = 0; r < this.nR; r++) if (this.owner[r] === c.id) n += this.regionCells[r].length;
    c.pop = n;
  }

  // ---------- estatisticas derivadas ----------
  effMods(c) {
    const m = { power: 0, prod: 0, income: 0, growth: 0, research: 0, defense: 0, mine: 0, navy: 0, logistics: 0, admin: 0 };
    for (const id of c.researched) {
      const t = TECH_BY_ID[id]; if (!t) continue;
      for (const k in t.eff) if (k in m) m[k] += t.eff[k]; else m[k] = (m[k] || 0) + t.eff[k];
    }
    const gov = GOV_BY_ID[c.gov];
    if (gov) for (const k in gov.mods) m[k] = (m[k] || 0) + gov.mods[k];
    return m;
  }

  resStock(c) {
    const st = { coal: 0, iron: 0, oil: 0, uranium: 0, wood: 0 };
    const m = this.effMods(c);
    const fb = this.world.forestBonus;
    for (let r = 0; r < this.nR; r++) {
      if (this.owner[r] !== c.id) continue;
      const reg = this.regions[r];
      const mineMul = 1 + m.mine;
      for (const cell of this.regionCells[r]) {
        const t = this.resGrid[cell];
        if (t === 0) st.coal += 0.1 * mineMul;
        else if (t === 1) st.iron += 0.1 * mineMul;
        else if (t === 2) st.oil += 0.08 * mineMul;
        else if (t === 3) st.uranium += 0.06 * mineMul;
      }
      st.wood += reg.size * (fb[reg.biome] || 0.1) * (1 + m.prod * 0.3);
    }
    // estoque = taxa anual * anos acumulados desde fundacao - gastos
    const years = Math.max(1, this.year - c.foundedYear);
    const ded = c._resDeduct || {};
    for (const k in st) st[k] = Math.max(0, st[k] * years - (ded[k] || 0));
    c._stocks = st;
    return st;
  }

  territoryRes(c, type) {
    const idx = ['coal', 'iron', 'oil', 'uranium'].indexOf(type);
    if (idx < 0) return 0;
    for (let r = 0; r < this.nR; r++) {
      if (this.owner[r] !== c.id) continue;
      for (const cell of this.regionCells[r]) if (this.resGrid[cell] === idx) return 1;
    }
    return 0;
  }

  income(c) {
    const m = this.effMods(c);
    const era = this.era;
    const base = c.pop * era.incBase * 0.35 * (1 + m.income + m.prod * 0.5);
    return base;
  }

  researchRate(c) {
    const m = this.effMods(c);
    const gov = GOV_BY_ID[c.gov];
    if (gov && gov.locked) return 0;
    if (c.gov === 'anarchoCapitalism' && !c.hasCurrency) return 0.5; // quase nada sem moeda
    return (2 + c.pop * 0.012) * (1 + m.research) * (0.6 + this.era.techPower * 0.6);
  }

  // disponibilidade historica de tech
  techAvailable(c, t) {
    if (c.researched.has(t.id)) return false;
    const req = t.req || {};
    for (const p of (req.techs || [])) if (!c.researched.has(p)) return false;
    // era: so pode pesquisar techs com era <= ano atual (+tolerancia)
    if (t.era > this.year + 150) return false;
    // requisitos de recurso no territorio
    if (t.needCoal && !this.territoryRes(c, 'coal')) return false;
    if (t.needOil && !this.territoryRes(c, 'oil')) return false;
    if (t.needUranium && !this.territoryRes(c, 'uranium')) return false;
    return true;
  }

  canAfford(c, cost) {
    const st = this.resStock(c);
    for (const k in cost) {
      if (k === 'pt') continue;
      if ((st[k] || 0) < cost[k]) return false;
    }
    return true;
  }

  spend(c, cost) {
    const st = this.resStock(c); // recompute + persiste em c._stocks
    for (const k in cost) {
      if (k === 'pt') continue;
      st[k] -= cost[k];
    }
    if (!c._resDeduct) c._resDeduct = { coal: 0, iron: 0, oil: 0, uranium: 0, wood: 0 };
    for (const k in cost) if (k !== 'pt' && k in c._resDeduct) c._resDeduct[k] += cost[k];
    c._stocks = st;
  }

  startResearch(c, techId) {
    const gov = GOV_BY_ID[c.gov];
    if (gov && gov.locked) return false;
    if (c.gov === 'anarchoCapitalism' && techId !== 'banking') return false;
    const t = TECH_BY_ID[techId];
    if (!t || !this.techAvailable(c, t)) return false;
    if (!this.canAfford(c, t.cost)) return false;
    this.spend(c, t.cost);
    c.researching = { id: techId, need: t.cost.pt, progress: 0 };
    return true;
  }

  changeGov(c, govId) {
    const gov = GOV_BY_ID[govId];
    if (!gov) return false;
    const cur = GOV_BY_ID[c.gov];
    if (cur && cur.locked) return false;
    if (gov.parents.length && !gov.parents.includes(c.gov)) return false;
    c.gov = govId;
    this.addLog(`🏛️ ${c.name} adotou ${gov.name}.`);
    return true;
  }

  // ---------- exercito / guerra ----------
  recruitCost(c) {
    const era = this.era;
    return 4 + era.milBase * 0.25;
  }

  trainArmy(c, amount) {
    const gov = GOV_BY_ID[c.gov];
    if (gov && gov.locked) return false;
    const cost = this.recruitCost(c) * amount;
    if (c.treasury < cost) amount = Math.floor(c.treasury / this.recruitCost(c));
    if (amount <= 0) return false;
    c.treasury -= this.recruitCost(c) * amount;
    c.armyPool += amount * (1 + this.effMods(c).power * 0.5);
    return true;
  }

  deployArmy(c, regionId, amount) {
    if (this.owner[regionId] !== c.id) return false;
    const a = Math.min(amount, c.armyPool);
    if (a <= 0) return false;
    c.armyPool -= a; this.army[regionId] += a;
    return true;
  }

  borderRegions(c) {
    const out = [];
    for (let r = 0; r < this.nR; r++) {
      if (this.owner[r] !== c.id) continue;
      for (const n of this.regions[r].neighbors) {
        if (this.owner[n] !== c.id && this.owner[n] !== -1 && this.landOK(n)) { out.push([r, n]); break; }
      }
    }
    return out;
  }
  landOK(r) { return this.regions[r] && !this.regions[r].start; }

  attackFrom(c, fromR, toR) {
    const defOwner = this.owner[toR];
    if (defOwner < 0) return false;
    const d = this.countries[defOwner];
    const mA = this.effMods(c), mAval = this.army[fromR] * (1 + mA.power) * (1 + mA.logistics * 0.3);
    const mD = this.effMods(d), dVal = this.army[toR] * (1 + mD.power + mD.defense) * 1.25;
    if (mAval <= 0) return false;
    if (mAval > dVal) {
      const lost = dVal / (1 + mA.power);
      this.army[fromR] = Math.max(1, mAval / (1 + mA.power) - lost * 0.4);
      this.army[toR] = 0;
      const prev = this.owner[toR];
      this.owner[toR] = c.id;
      this.recalcPop(c); this.recalcPop(d);
      this.addLog(`⚔️ ${c.name} capturou ${this.regions[toR].name} de ${this.countries[prev].name}!`);
      if (!d.isPlayer && this.checkEliminated(d)) {}
      if (prev === (this.player && this.player.id)) this.onPlayerLoss?.(toR);
      return true;
    } else {
      this.army[fromR] = Math.max(0, this.army[fromR] - dVal / (1 + mA.power) * 0.7);
      this.army[toR] = Math.max(0.5, this.army[toR] - mAval / (1 + mD.power) * 0.35);
      return false;
    }
  }

  checkEliminated(c) {
    let any = false;
    for (let r = 0; r < this.nR; r++) if (this.owner[r] === c.id) { any = true; break; }
    if (!any) {
      c.alive = false;
      this.addLog(`☠️ ${c.name} foi eliminado do mapa!`);
      // capitais orfas mudam para uma regiao que elas possuem
      for (const other of this.countries) {
        if (other.alive && other.capital != null && this.owner[other.capital] !== other.id) {
          for (let r = 0; r < this.nR; r++) if (this.owner[r] === other.id) { other.capital = r; break; }
        }
      }
      if (c.isPlayer) { this.finished = true; this.victory = false; }
      return true;
    }
    return false;
  }

  // ---------- IA ----------
  aiTurn(c) {
    if (!c.alive || c.isPlayer) return;
    const gov = GOV_BY_ID[c.gov];
    if (gov && gov.locked) return;
    const m = this.effMods(c);
    const inc = this.income(c);
    c.treasury += inc * 0.08;

    // pesquisa
    if (!c.researching) {
      const opts = TECHS.filter(t => this.techAvailable(c, t));
      if (opts.length) {
        // pontua: militar se agressivo, ciencia se defensivo
        let best = null, bs = -1e9;
        for (const t of opts) {
          if (t.cost.pt > c.treasury * 2 + 50) continue;
          let s = Object.values(t.eff).reduce((a, b) => a + b, 0);
          if (c.aiPersonality === 'aggressive') s += (t.cat === 'military' ? 1.5 : 0) + (t.eff.power || 0) * 2;
          if (c.aiPersonality === 'defensive') s += (t.cat === 'defense' ? 1.2 : 0) + (t.eff.defense || 0) * 2;
          if (c.aiPersonality === 'opportunist') s += (t.eff.income || 0) * 1.8 + (t.eff.prod || 0);
          s -= t.cost.pt * 0.004;
          if (s > bs) { bs = s; best = t; }
        }
        if (best) this.startResearch(c, best.id);
      }
    }

    // mudar de governo as vezes (se tiver pai valido e chance)
    if (Math.random() < 0.002) {
      const nexts = GOS.filter(g => g.parents.includes(c.gov) && !g.locked);
      if (nexts.length) this.changeGov(c, nexts[Math.floor(Math.random() * nexts.length)].id);
    }

    // treinar exercito: guarda reserva
    const wantArmy = (this.era.milBase * 0.6 + m.power * 20) * (c.aiPersonality === 'aggressive' ? 1.4 : 1);
    const total = c.armyPool + this.frontArmies(c);
    if (total < wantArmy && c.treasury > this.recruitCost(c) * 5) {
      this.trainArmy(c, Math.min(20, Math.floor(c.treasury / this.recruitCost(c) / 2)));
    }
    // distribuir no front
    const borders = this.borderRegions(c);
    if (borders.length && c.armyPool > 0) {
      const per = c.armyPool / borders.length;
      for (const [fromR] of borders) this.deployArmy(c, fromR, per);
    }

    // atacar
    const warTargets = [];
    for (const [fromR, toR] of borders) {
      const d = this.countries[this.owner[toR]];
      if (!d || !d.alive) continue;
      if (d.atWarWith.has(c.id)) continue; // ja em guerra => ataques continuam abaixo
      const mA = this.army[fromR] * (1 + m.power);
      const mD = this.army[toR] * (1 + this.effMods(d).power + this.effMods(d).defense) * 1.25;
      const weak = d.armyPool + this.frontArmies(d) < this.frontArmies(c) * 0.8;
      const rich = this.income(d) > this.income(c) * 1.3;
      let desire = 0;
      if (mA > mD * 1.35) desire += 0.5;
      if (weak && c.aiPersonality === 'opportunist') desire += 0.4;
      if (rich && c.aiPersonality === 'aggressive') desire += 0.3;
      desire *= c.aggression;
      if (desire > 0.35 && Math.random() < 0.05) {
        c.atWarWith.add(d.id); d.atWarWith.add(c.id);
        this.addLog(`📢 ${c.name} declarou guerra a ${d.name}!`);
      }
    }
    // executar ataques nas fronteiras em guerra
    for (const [fromR, toR] of borders) {
      const d = this.countries[this.owner[toR]];
      if (!d || !d.alive) continue;
      if (c.atWarWith.has(d.id) || d.atWarWith.has(c.id)) {
        if (this.army[fromR] > this.army[toR] * 1.15 && this.army[fromR] > 2) {
          this.attackFrom(c, fromR, toR);
        }
      }
    }
    // paz ocasional se perdendo muito
    if (c.atWarWith.size && Math.random() < 0.01) {
      for (const eid of c.atWarWith) {
        const e = this.countries[eid];
        if (this.frontArmies(c) < this.frontArmies(e) * 0.6) {
          c.atWarWith.delete(eid); e.atWarWith.delete(c.id);
          this.addLog(`🕊️ ${c.name} fez paz com ${e.name}.`);
          break;
        }
      }
    }
  }

  frontArmies(c) {
    let s = 0;
    const set = new Set();
    for (let r = 0; r < this.nR; r++) {
      if (this.owner[r] !== c.id) continue;
      for (const n of this.regions[r].neighbors)
        if (this.owner[n] !== c.id && this.owner[n] >= 0) { s += this.army[r]; set.add(r); break; }
    }
    return s;
  }

  // ---------- expansao neutra ----------
  expandNeutral() {
    const adds = [];
    for (let r = 0; r < this.nR; r++) {
      if (this.owner[r] !== -1 || !this.landOK(r)) continue;
      let best = -1, bc = 0;
      for (const n of this.regions[r].neighbors) {
        const o = this.owner[n];
        if (o >= 0) { if (o > best) { best = o; } }
      }
      if (best >= 0) adds.push([r, best]);
    }
    if (!adds.length) return;
    const [, cid] = adds[Math.floor(Math.random() * adds.length)];
    const [r] = adds[Math.floor(Math.random() * adds.length)];
    this.owner[r] = cid;
    this.army[r] = 2 + Math.random() * 4;
    this.recalcPop(this.countries[cid]);
  }

  // ---------- tick global ----------
  step(dtYears) {
    if (this.finished) return;
    this.year += dtYears;
    this.era = eraInfo(this.year);
    this.tickCount++;

    // manutencao + renda dos jogadores/IA passiva
    for (const c of this.countries) {
      if (!c.alive) continue;
      const up = (c.armyPool + this.allArmies(c)) * (0.05 + this.era.milBase * 0.004) * (1 - (this.effMods(c).admin || 0) * 0.3);
      c.treasury -= up * 0.1;
      if (c.treasury < 0) {
        c.treasury = 0;
        // desercao
        for (let r = 0; r < this.nR; r++) if (this.owner[r] === c.id) this.army[r] *= 0.97;
        c.armyPool *= 0.97;
      }
      // crescimento de tropa por conscripao leve conforme pop/crescimento
      const m = this.effMods(c);
      c.armyPool += c.pop * 0.0004 * (1 + m.growth);
    }

    // pesquisa de todos (inclui player)
    for (const c of this.countries) {
      if (!c.alive || !c.researching) continue;
      c.researching.progress += this.researchRate(c);
      if (c.researching.progress >= c.researching.need) {
        const t = TECH_BY_ID[c.researching.id];
        c.researched.add(t.id);
        this.addLog(`🔬 ${c.name} descobriu: ${t.name}`);
        if (t.id === 'banking') c.hasCurrency = true;
        c.researching = null;
      }
    }

    // turnos de IA (alternados para custo baixo)
    const ais = this.countries.filter(c => c.alive && !c.isPlayer);
    if (ais.length) {
      const idx = this.tickCount % ais.length;
      this.aiTurn(ais[idx]);
      // segunda metade do tick pra outro AI em ticks pares
      if (this.tickCount % 2 === 0 && ais.length > 1) this.aiTurn(ais[(idx + 1) % ais.length]);
    }

    // expansao de nações sobre terras sem dono
    if (this.tickCount % 3 === 0) this.expandNeutral();

    // victoria do jogador
    if (this.player && this.player.alive) {
      let enemies = 0;
      for (const c of this.countries) if (c.alive && !c.isPlayer) enemies++;
      if (enemies === 0) { this.finished = true; this.victory = true; }
    }
  }

  allArmies(c) {
    let s = 0;
    for (let r = 0; r < this.nR; r++) if (this.owner[r] === c.id) s += this.army[r];
    return s;
  }

  addLog(msg) {
    this.log.unshift({ msg, year: Math.round(this.year) });
    if (this.log.length > 60) this.log.pop();
  }
}

// ---------- setup de partida ----------
export function newGame(world, opts) {
  const g = new Game(world);
  g.year = opts.year;
  g.era = eraInfo(opts.year);
  g.countries = [];
  g.player = null;

  const playable = g.regions.map((r, i) => ({ r, i })).filter(o => !o.r.start);
  // agrupar por pais geojson
  const byCountry = new Map();
  for (const { r, i } of playable) {
    if (!byCountry.has(r.country)) byCountry.set(r.country, []);
    byCountry.get(r.country).push(i);
  }
  const countryIds = [...byCountry.keys()];
  const era = g.era;

  // regioes do jogador
  const pStart = opts.playerRegions;
  const pName = opts.playerName || 'Minha Nação';
  const pc = g.makeCountry(pName, '#ffd166', true, opts.gov, pStart, opts.year);
  g.player = pc;
  pc.aggression = 0.5;
  g.recalcPop(pc);

  // bots: pega paises vizinhos/near ate N bots
  const nearSet = new Set();
  for (const r of pStart) for (const n of g.regions[r].neighbors) nearSet.add(n);
  const used = new Set(pStart);
  let colorIdx = 1;
  const botCount = opts.bots || 14;
  // ordena paises por distancia ao jogador
  const scored = countryIds.map(ci => {
    const regs = byCountry.get(ci);
    let score = 1e9;
    for (const ri of regs) {
      if (used.has(ri)) continue;
      const dx = g.regions[ri].cx - g.regions[pStart[0]].cx;
      const dy = g.regions[ri].cy - g.regions[pStart[0]].cy;
      score = Math.min(score, Math.hypot(dx, dy));
    }
    return { ci, score, regs: regs.filter(x => !used.has(x)) };
  }).filter(o => o.regs.length).sort((a, b) => a.score - b.score);

  let made = 0;
  for (const { ci, regs } of scored) {
    if (made >= botCount) break;
    // pega ate 2 regioes contiguas desse pais
    const take = [regs[0]];
    for (let k = 1; k < regs.length && take.length < 2; k++) {
      if (g.regions[regs[k]].neighbors.includes(take[0])) take.push(regs[k]);
    }
    const cname = world.countries[ci].name;
    const govPool = ['feudal', 'absolutism', 'communism', 'stateCapitalism', 'liberalCapitalism', 'republic'];
    const gov = era.key === 'antiga' || era.key === 'classica' ? 'feudal' : govPool[Math.floor(Math.random() * govPool.length)];
    const bc = g.makeCountry(cname, COLORS[colorIdx++ % COLORS.length], false, gov, take, opts.year);
    // bônus de grande potencia
    if (eraBonus(cname, era.key)) {
      for (let k = 0; k < Math.floor(era.techPower * 8); k++) {
        const optsT = TECHS.filter(t => g.techAvailable(bc, t) && t.era <= g.year);
        if (!optsT.length) break;
        const pick = optsT[Math.floor(Math.random() * optsT.length)];
        bc.researched.add(pick.id);
      }
      bc.treasury *= 2;
    }
    for (const r of take) used.add(r);
    made++;
  }
  g.addLog(`🌍 Partida iniciada em ${fmtYear(opts.year)} (${era.label}). ${made} nações rivais surgiram.`);
  return g;
}

export function fmtYear(y) {
  y = Math.round(y);
  return y < 0 ? `${-y} a.C.` : `${y} d.C.`;
}
