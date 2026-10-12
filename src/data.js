// ==================== DADOS DO JOGO ====================
// Recursos: 0 carvao, 1 ferro, 2 petroleo, 3 uranio. Madeira = bonus de bioma.

export const RES = ['coal', 'iron', 'oil', 'uranium'];
export const RES_ICONS = { coal: '⚫', iron: '🔩', oil: '🛢️', uranium: '☢️', wood: '🌲' };
export const RES_NAMES_PT = { coal: 'Carvão', iron: 'Ferro', oil: 'Petróleo', uranium: 'Urânio', wood: 'Madeira' };

// ---------------- ÁRVORE TECNOLÓGICA ----------------
// req: { tech:[ids], res:{tipo:min}, gov:'id' }
// eff: efeitos acumulativos (power, prod, income, growth, defense, upkeepMul...)
export const TECHS = [
  // era antiga
  { id: 'agriculture', name: 'Agricultura', cat: 'base', era: -3000, cost: { pt: 10 }, req: {}, eff: { growth: 0.15 }, desc: '+15% crescimento populacional' },
  { id: 'tools', name: 'Ferramentas de Pedra', cat: 'base', era: -2800, cost: { pt: 12 }, req: { techs: ['agriculture'] }, eff: { prod: 0.10 }, desc: '+10% produção' },
  { id: 'bronze', name: 'Bronze', cat: 'military', era: -3000, cost: { pt: 25, iron: 2 }, req: { techs: ['tools'] }, eff: { power: 0.25 }, desc: '+25% poder militar' },
  { id: 'writing', name: 'Escrita', cat: 'science', era: -3200, cost: { pt: 20 }, req: { techs: ['agriculture'] }, eff: { research: 0.15 }, desc: '+15% pesquisa' },
  { id: 'wheel', name: 'Roda', cat: 'dev', era: -3000, cost: { pt: 18 }, req: { techs: ['tools'] }, eff: { prod: 0.10, logistics: 0.1 }, desc: '+10% produção e logística' },
  { id: 'iron', name: 'Ferro Fundido', cat: 'military', era: -1200, cost: { pt: 40, iron: 4 }, req: { techs: ['bronze'] }, eff: { power: 0.35 }, desc: '+35% poder militar' },
  { id: 'pickaxe', name: 'Picareta de Aço', cat: 'mining', era: -800, cost: { pt: 35, iron: 3 }, req: { techs: ['iron', 'tools'] }, eff: { mine: 0.30 }, desc: '+30% mineração' },
  { id: 'aqueduct', name: 'Aquedutos', cat: 'dev', era: -300, cost: { pt: 45 }, req: { techs: ['wheel'] }, eff: { growth: 0.20 }, desc: '+20% crescimento' },
  { id: 'roads', name: 'Estradas Romanas', cat: 'dev', era: -200, cost: { pt: 50, wood: 5 }, req: { techs: ['wheel'] }, eff: { prod: 0.15, logistics: 0.15 }, desc: '+15% produção/logística' },
  { id: 'math', name: 'Matemática Avançada', cat: 'science', era: 300, cost: { pt: 60 }, req: { techs: ['writing'] }, eff: { research: 0.20 }, desc: '+20% pesquisa' },
  { id: 'stirrups', name: 'Estribos & Cavalaria', cat: 'military', era: 500, cost: { pt: 55 }, req: { techs: ['iron'] }, eff: { power: 0.30 }, desc: '+30% poder militar' },
  { id: 'windmill', name: 'Moinhos de Vento', cat: 'energy', era: 900, cost: { pt: 70, wood: 6 }, req: { techs: ['aqueduct'] }, eff: { prod: 0.20 }, desc: '+20% produção' },
  { id: 'waterwheel', name: 'Roda d\u2019Água', cat: 'mining', era: 800, cost: { pt: 65, wood: 5 }, req: { techs: ['pickaxe'] }, eff: { mine: 0.25, prod: 0.10 }, desc: '+25% mineração' },
  { id: 'castle', name: 'Castelos', cat: 'defense', era: 1000, cost: { pt: 90, wood: 6 }, req: { techs: ['aqueduct'] }, eff: { defense: 0.40 }, desc: '+40% defesa' },
  { id: 'compass', name: 'Bússola', cat: 'navy', era: 1100, cost: { pt: 80 }, req: { techs: ['math'] }, eff: { navy: 0.35, logistics: 0.15 }, desc: '+35% marinha' },
  { id: 'gunpowder', name: 'Pólvora', cat: 'military', era: 1300, cost: { pt: 140, coal: 4 }, req: { techs: ['iron', 'math'] }, eff: { power: 0.60 }, desc: '+60% poder militar' },
  { id: 'printing', name: 'Imprensa', cat: 'science', era: 1440, cost: { pt: 130, wood: 6 }, req: { techs: ['math'] }, eff: { research: 0.30 }, desc: '+30% pesquisa' },
  { id: 'caravel', name: 'Caravelas', cat: 'navy', era: 1450, cost: { pt: 150, wood: 10 }, req: { techs: ['compass'] }, eff: { navy: 0.45 }, desc: '+45% marinha' },
  { id: 'cannon', name: 'Canhões', cat: 'military', era: 1500, cost: { pt: 190, iron: 8, coal: 6 }, req: { techs: ['gunpowder'] }, eff: { power: 0.65, siege: 0.5 }, desc: '+65% poder, +50% cerco' },
  { id: 'starFort', name: 'Fortes Estrelados', cat: 'defense', era: 1550, cost: { pt: 210, wood: 10, iron: 4 }, req: { techs: ['castle', 'cannon'] }, eff: { defense: 0.55 }, desc: '+55% defesa' },
  { id: 'miningDeep', name: 'Mineração Profunda', cat: 'mining', era: 1550, cost: { pt: 180, iron: 6 }, req: { techs: ['waterwheel'] }, eff: { mine: 0.45 }, desc: '+45% mineração' },
  { id: 'banking', name: 'Bancos & Moeda', cat: 'econ', era: 1400, cost: { pt: 160 }, req: { techs: ['printing'] }, eff: { income: 0.30 }, desc: '+30% renda' },
  { id: 'spinningJenny', name: 'Fiandeira Mecânica', cat: 'industry', era: 1760, cost: { pt: 260, iron: 8 }, req: { techs: ['miningDeep'] }, eff: { prod: 0.35 }, desc: '+35% produção' },
  { id: 'steamEngine', name: 'Máquina a Vapor', cat: 'industry', era: 1770, cost: { pt: 340, coal: 12, iron: 10 }, req: { techs: ['spinningJenny', 'miningDeep'] }, eff: { prod: 0.55, mine: 0.35 }, needCoal: true, desc: '+55% produção (exige carvão no território)' },
  { id: 'factory', name: 'Fábricas', cat: 'industry', era: 1800, cost: { pt: 420, iron: 14, coal: 12 }, req: { techs: ['steamEngine'] }, eff: { prod: 0.65 }, desc: '+65% produção industrial' },
  { id: 'railroad', name: 'Ferrovias', cat: 'dev', era: 1830, cost: { pt: 480, iron: 16, coal: 12 }, req: { techs: ['steamEngine'] }, eff: { logistics: 0.6, prod: 0.25 }, desc: '+60% logística' },
  { id: 'telegraph', name: 'Telégrafo', cat: 'science', era: 1840, cost: { pt: 430, iron: 8 }, req: { techs: ['railroad'] }, eff: { research: 0.35, admin: 0.2 }, desc: '+35% pesquisa/administração' },
  { id: 'rifles', name: 'Fuzis de Repetição', cat: 'military', era: 1850, cost: { pt: 460, iron: 12 }, req: { techs: ['cannon'] }, eff: { power: 0.8 }, desc: '+80% poder militar' },
  { id: 'dreadnought', name: 'Couraçados', cat: 'navy', era: 1880, cost: { pt: 560, iron: 16, oil: 6 }, req: { techs: ['caravel', 'factory'] }, eff: { navy: 0.9 }, desc: '+90% marinha' },
  { id: 'electricity', name: 'Eletricidade', cat: 'energy', era: 1880, cost: { pt: 540, iron: 10 }, req: { techs: ['telegraph'] }, eff: { prod: 0.5, research: 0.2 }, desc: '+50% produção' },
  { id: 'combustion', name: 'Motor a Combustão', cat: 'energy', era: 1890, cost: { pt: 590, oil: 10 }, req: { techs: ['electricity'] }, eff: { prod: 0.45, logistics: 0.4 }, needOil: true, desc: '+45% produção (exige petróleo)' },
  { id: 'steel', name: 'Aço Bessemer', cat: 'industry', era: 1860, cost: { pt: 520, coal: 12, iron: 14 }, req: { techs: ['factory'] }, eff: { prod: 0.4, power: 0.3 }, desc: '+40% produção, +30% militar' },
  { id: 'machineTools', name: 'Máquinas-Ferramenta', cat: 'industry', era: 1900, cost: { pt: 640, iron: 16 }, req: { techs: ['steel'] }, eff: { prod: 0.5, mine: 0.3 }, desc: '+50% produção' },
  { id: 'chemicals', name: 'Indústria Química', cat: 'science', era: 1900, cost: { pt: 620, coal: 10, oil: 8 }, req: { techs: ['electricity'] }, eff: { research: 0.4, power: 0.2 }, desc: '+40% pesquisa' },
  { id: 'flight', name: 'Aviação', cat: 'military', era: 1910, cost: { pt: 750, oil: 12, iron: 16 }, req: { techs: ['combustion'] }, eff: { power: 0.9, recon: 0.5 }, desc: '+90% poder aéreo' },
  { id: 'tank', name: 'Tanques de Guerra', cat: 'military', era: 1916, cost: { pt: 820, oil: 14, iron: 20 }, req: { techs: ['combustion', 'steel'] }, eff: { power: 1.1 }, desc: '+110% poder blindado' },
  { id: 'submarine', name: 'Submarinos', cat: 'navy', era: 1900, cost: { pt: 760, iron: 18, oil: 8 }, req: { techs: ['dreadnought'] }, eff: { navy: 1.0 }, desc: '+100% marinha' },
  { id: 'radio', name: 'Rádio', cat: 'science', era: 1920, cost: { pt: 700, iron: 10 }, req: { techs: ['electricity'] }, eff: { research: 0.3, admin: 0.3 }, desc: '+30% pesquisa/admin' },
  { id: 'radar', name: 'Radar', cat: 'defense', era: 1935, cost: { pt: 850, iron: 14 }, req: { techs: ['radio'] }, eff: { defense: 0.8 }, desc: '+80% defesa' },
  { id: 'carrier', name: 'Porta-Aviões', cat: 'navy', era: 1940, cost: { pt: 1050, iron: 26, oil: 16 }, req: { techs: ['flight', 'dreadnought'] }, eff: { navy: 1.3, power: 0.4 }, desc: '+130% marinha' },
  { id: 'blitzkrieg', name: 'Doutrina Blindada', cat: 'military', era: 1940, cost: { pt: 980, oil: 14 }, req: { techs: ['tank'] }, eff: { power: 0.8, attack: 0.3 }, desc: '+80% poder ofensivo' },
  { id: 'rocketry', name: 'Foguetes', cat: 'military', era: 1944, cost: { pt: 1150, oil: 16, uranium: 4 }, req: { techs: ['chemicals', 'flight'] }, eff: { power: 1.2 }, desc: '+120% poder' },
  { id: 'nuclear', name: 'Energia Nuclear', cat: 'energy', era: 1945, cost: { pt: 1500, uranium: 16, iron: 20 }, req: { techs: ['chemicals', 'machineTools'] }, eff: { prod: 0.8, research: 0.4 }, needUranium: true, desc: '+80% produção (exige urânio)' },
  { id: 'nukeWeapon', name: 'Arma Nuclear', cat: 'military', era: 1947, cost: { pt: 1900, uranium: 24 }, req: { techs: ['nuclear', 'rocketry'] }, eff: { power: 2.2, deterrent: 1 }, desc: 'Dissuasão nuclear massiva' },
  { id: 'computer', name: 'Computador', cat: 'science', era: 1950, cost: { pt: 1100, iron: 16 }, req: { techs: ['radar', 'radio'] }, eff: { research: 0.6, admin: 0.4 }, desc: '+60% pesquisa' },
  { id: 'missiles', name: 'Mísseis Guiados', cat: 'military', era: 1955, cost: { pt: 1350, iron: 18, oil: 14 }, req: { techs: ['rocketry', 'computer'] }, eff: { power: 1.4 }, desc: '+140% poder' },
  { id: 'satellite', name: 'Satélites', cat: 'science', era: 1957, cost: { pt: 1500, uranium: 8, iron: 18 }, req: { techs: ['rocketry', 'computer'] }, eff: { recon: 1, research: 0.5 }, desc: '+100% reconhecimento' },
  { id: 'automation', name: 'Automação Industrial', cat: 'industry', era: 1970, cost: { pt: 1400, iron: 20, oil: 14 }, req: { techs: ['computer', 'machineTools'] }, eff: { prod: 1.0 }, desc: '+100% produção' },
  { id: 'internet', name: 'Internet', cat: 'science', era: 1985, cost: { pt: 1700, iron: 18 }, req: { techs: ['computer', 'satellite'] }, eff: { research: 0.9, admin: 0.6 }, desc: '+90% pesquisa' },
  { id: 'stealth', name: 'Tecnologia Stealth', cat: 'military', era: 1990, cost: { pt: 1800, oil: 16, iron: 22 }, req: { techs: ['missiles', 'automation'] }, eff: { power: 1.3, defense: 0.6 }, desc: '+130% poder' },
  { id: 'drone', name: 'Drones Militares', cat: 'military', era: 2005, cost: { pt: 2000, iron: 20, oil: 18 }, req: { techs: ['internet', 'stealth'] }, eff: { power: 1.5, recon: 0.8 }, desc: '+150% poder' },
  { id: 'modernMining', name: 'Mineração Moderna', cat: 'mining', era: 1995, cost: { pt: 1600, iron: 22, oil: 12 }, req: { techs: ['automation'] }, eff: { mine: 1.2 }, desc: '+120% mineração' },
  { id: 'fusion', name: 'Fusão Nuclear', cat: 'energy', era: 2035, cost: { pt: 3200, uranium: 30, iron: 30 }, req: { techs: ['nuclear', 'modernMining'] }, eff: { prod: 1.6, research: 0.8 }, desc: 'Futuro: +160% produção' },
  { id: 'ai', name: 'IA Militar', cat: 'military', era: 2030, cost: { pt: 3000, iron: 26 }, req: { techs: ['drone', 'internet'] }, eff: { power: 2.0, admin: 0.8 }, desc: 'Futuro: +200% poder' },
];

// ---------------- ÁRVORE DE GOVERNO ----------------
export const GOS = [
  { id: 'anarchy', name: 'Anarquismo', icon: '🏴', tier: 0, parents: [], mods: { prod: -0.4, income: -0.4, research: -0.4, growth: 0.25, morale: 0.2, liberty: 1 }, desc: 'Sem estado: nada pode ser construído ou pesquisado, mas o povo é livre.', locked: 'state' },
  { id: 'anarchoCapitalism', name: 'Anarcocapitalismo', icon: '🆓', tier: 1, parents: ['anarchy'], mods: { income: 0.35, prod: 0.1, research: 0.1, morale: 0.1, liberty: 0.8, unrest: 0.15 }, desc: 'Mercado totalmente livre. Só é possível criar uma MOEDA própria.' },
  { id: 'feudal', name: 'Feudalismo', icon: '🏰', tier: 0, parents: [], mods: { defense: 0.25, prod: -0.1, income: -0.1, growth: 0.05, liberty: -0.2 }, desc: 'Senhores locais protegem a terra. Defesa melhor, economia fraca.' },
  { id: 'absolutism', name: 'Absolutismo', icon: '👑', tier: 1, parents: ['feudal'], mods: { prod: 0.15, income: 0.2, admin: 0.2, militaryBias: 0.2, liberty: -0.4, unrest: -0.1 }, desc: 'Poder centralizado no monarca. Ordem e exércitos fortes.' },
  { id: 'communism', name: 'Comunismo', icon: '☭', tier: 1, parents: ['feudal'], mods: { prod: 0.3, growth: 0.3, research: 0.1, income: -0.15, equal: 0.3, liberty: -0.35 }, desc: 'Estado planificador: produção e bem-estar altos, menos lucro.' },
  { id: 'stateCapitalism', name: 'Capitalismo de Estado', icon: '🏭', tier: 2, parents: ['absolutism', 'communism'], mods: { prod: 0.45, income: 0.25, militaryBias: 0.25, research: 0.15, liberty: -0.3 }, desc: 'Empresas estatais gigantes impulsionam a indústria.' },
  { id: 'liberalCapitalism', name: 'Capitalismo Liberal', icon: '💼', tier: 2, parents: ['anarchoCapitalism', 'absolutism'], mods: { income: 0.55, research: 0.35, prod: 0.15, morale: 0.1, liberty: 0.3, unrest: 0.1 }, desc: 'Estado mínimo, mercado forte: muita renda e inovação.' },
  { id: 'republic', name: 'República Democrática', icon: '🗳️', tier: 2, parents: ['liberalCapitalism', 'communism'], mods: { income: 0.3, research: 0.4, growth: 0.25, morale: 0.25, admin: 0.25, liberty: 0.5, warWeariness: 0.2 }, desc: 'Democracia: inova muito, mas evita guerras longas.' },
  { id: 'technocracy', name: 'Tecnocracia', icon: '🔬', tier: 3, parents: ['republic', 'stateCapitalism'], mods: { research: 0.8, prod: 0.3, income: 0.2, admin: 0.3, liberty: -0.1 }, desc: 'Governo de especialistas: ciência acelerada ao máximo.' },
];

// ---------------- ERAS / PAÍSES HISTÓRICOS POR ANO ----------------
// Cada entrada: regiões que "existem" como nações naquele ano (agressividade/tech inicial).
// Simples e robusto: usamos um fator global de civilização por era + bônus regionais.
// 8 ERAS: Primitiva → Futurista
export const ERAS = [
  { key: 'primitiva',     label: 'Era Primitiva',      icon: '🪵', from: -10000, techPower: 0.03, milBase: 4,  incBase: 0.3 },
  { key: 'antiga',        label: 'Idade Antiga',       icon: '🏛️', from: -3000,  techPower: 0.07, milBase: 7,  incBase: 0.55 },
  { key: 'classica',      label: 'Idade Clássica',   icon: '⚔️', from: -1200,  techPower: 0.15, milBase: 11, incBase: 0.85 },
  { key: 'medieval',      label: 'Idade Média',      icon: '🏰', from: 500,    techPower: 0.28, milBase: 17, incBase: 1.25 },
  { key: 'moderna',       label: 'Era Moderna',        icon: '📜', from: 1500,   techPower: 0.45, milBase: 27, incBase: 1.85 },
  { key: 'industrial',    label: 'Era Industrial',     icon: '🏭', from: 1800,   techPower: 0.65, milBase: 43, incBase: 2.85 },
  { key: 'contemporanea', label: 'Era Contemporânea', icon: '💻', from: 1915,   techPower: 0.83, milBase: 63, incBase: 4.3 },
  { key: 'futurista',     label: 'Era Futurista',      icon: '🛰️', from: 2000,   techPower: 1.05, milBase: 90, incBase: 6.5 },
];
export function eraIndex(year) {
  let idx = 0;
  for (let i = 0; i < ERAS.length; i++) if (year >= ERAS[i].from) idx = i;
  return idx;
}
export function eraInfo(year) {
  const e = ERAS[eraIndex(year)];
  return { key: e.key, label: e.icon + ' ' + e.label, plainLabel: e.label, techPower: e.techPower, milBase: e.milBase, incBase: e.incBase };
}

// países "fortes" por época (nomes do geojson) -> ganham mais tech inicial
const POWER_BY_ERA = {
  primitiva: [],
  antiga: ['Egypt', 'Greece', 'Persia', 'China', 'India', 'Rome', 'Italy', 'Turkey', 'Iraq', 'Iran'],
  classica: ['Rome', 'Italy', 'China', 'India', 'Persia', 'Iran', 'Greece', 'Turkey', 'France', 'Spain'],
  medieval: ['France', 'England', 'Spain', 'Italy', 'Turkey', 'China', 'India', 'Persia', 'Iran', 'Germany', 'Russia', 'Egypt', 'Mongolia'],
  moderna: ['France', 'England', 'United Kingdom', 'Spain', 'Portugal', 'Netherlands', 'Sweden', 'France', 'Russia', 'Austria', 'Germany', 'Italy', 'Turkey', 'China', 'Japan', 'United States of America'],
  industrial: ['United States of America', 'Germany', 'United Kingdom', 'England', 'France', 'Russia', 'Japan', 'Italy', 'Belgium', 'Netherlands'],
  contemporanea: ['United States of America', 'Russia', 'China', 'Germany', 'Japan', 'United Kingdom', 'England', 'France', 'India'],
  moderna2: ['United States of America', 'China', 'Russia', 'Germany', 'Japan', 'United Kingdom', 'England', 'France', 'India', 'Brazil', 'South Korea', 'Canada'],
  futurista: ['United States of America', 'China', 'Russia', 'Germany', 'Japan', 'India', 'United Kingdom'],
};
export function eraBonus(countryName, eraKey) {
  const list = POWER_BY_ERA[eraKey] || [];
  return list.includes(countryName) ? 1 : 0;
}

export const COLORS = [
  '#e74c3c', '#3498db', '#2ecc71', '#f1c40f', '#9b59b6', '#e67e22', '#1abc9c', '#fd79a8',
  '#6c5ce7', '#00b894', '#ff7675', '#74b9ff', '#a29cfe', '#ffeaa7', '#55efc4', '#fab1a0',
  '#e17055', '#0984e3', '#00cec9', '#d63031', '#e84393', '#2d3436', '#6ab04c', '#badc58',
];
