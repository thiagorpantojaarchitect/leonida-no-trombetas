// Confere as 30 fases contra o mapa real (roda em node, empacotado pelo build).
import { MAP, orlaAt, inWater, inBuilding, distOrla, AERO } from './geo.js';
import { criarGrafo } from './grafo.js';
import { criarFases, VEIC, TIPO, estrelas } from './fases.js';
const assert = (c, m) => { if (!c) throw new Error('falhou: ' + m); };
const G = criarGrafo(MAP.ruas, 5);
assert(G.nosP.length > 1000, 'grafo principal');
const { fases } = criarFases({ G, orlaAt, AERO });
assert(fases.length === 30, '30 fases');
const tipos = {}, veics = {};
for (const f of fases) {
  tipos[f.tipo] = (tipos[f.tipo] || 0) + 1; veics[f.veic] = (veics[f.veic] || 0) + 1;
  assert(TIPO[f.tipo] && VEIC[f.veic], 'tipo/veículo conhecido: fase ' + f.n);
  assert(f.tempo > 10 && f.len > 100, 'tempo e distância: fase ' + f.n);
  assert(f.quem && f.fala && f.nome, 'textos: fase ' + f.n);
  const k = VEIC[f.veic].kind;
  if (k === 'car') {
    assert(!inBuilding(f.start.x, f.start.z) && !inWater(f.start.x, f.start.z), 'largada livre: fase ' + f.n);
    for (const c of f.cps) assert(!inWater(c.x, c.z), 'anel fora da água: fase ' + f.n);
    const dentro = f.cps.filter(c => inBuilding(c.x, c.z)).length; assert(dentro === 0, 'anel fora de prédio: fase ' + f.n + ' (' + dentro + ')');
  }
  if (k === 'boat') for (const p of f.path) assert(inWater(p[0], p[1]) && distOrla(p[0], p[1]) > 12, 'rota na água: fase ' + f.n);
  if (f.tipo === 'voo') assert(f.cps.length >= 5 && f.cps.every(c => c.y >= 25), 'anéis no ar: fase ' + f.n);
  if (f.tipo === 'salto') assert(f.alvo && !inWater(f.alvo.x, f.alvo.z), 'alvo em terra: fase ' + f.n);
  if (f.tipo === 'corrida') assert(f.rivalV > 10, 'rival: fase ' + f.n);
}
assert(Object.keys(VEIC).every(v => veics[v] >= 1), 'todos os veículos em uso');
assert(Object.keys(tipos).length === 5, 'cinco tipos de fase');
assert(estrelas(fases[0], { tempo: 1 }) === 3 && estrelas(fases[8], { dist: 999 }) === 1, 'estrelas');
assert(AERO.len > 1400 && AERO.len < 1700, 'pista do aeroporto');
console.log('ok: 30 fases conferidas', JSON.stringify(tipos), JSON.stringify(veics));
console.log(fases.map(f => f.n + ' ' + f.tipo + ' ' + Math.round(f.len) + 'm ' + f.tempo + 's cps' + f.cps.length).join(' | '));
