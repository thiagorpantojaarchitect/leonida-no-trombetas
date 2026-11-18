// Teste de fumaça: o mapa tem o que o jogo precisa e o pacote foi gerado.
const fs = require('fs'), assert = require('assert');
const m = JSON.parse(fs.readFileSync('src/mapa_jogo.json', 'utf8'));
assert(m.predios.length > 8000, 'prédios');
assert(m.ruas.length >= 150, 'ruas');
assert(m.orla.length >= 40, 'orla');
assert(m.agua.length >= 4, 'água');
assert(m.ruas.some(r => r[2] === 'Avenida Independência'), 'nomes de rua');
const js = fs.readFileSync('dist/game.js', 'utf8'), html = fs.readFileSync('dist/index.html', 'utf8');
assert(js.length > 1e6 && js.includes('Rio Trombetas'), 'game.js');
assert(m.aero && m.aero.pista.length >= 4, 'aeroporto');
require('./dist-teste/fases.cjs');
assert(html.includes('game.js?v=') && html.includes('OpenStreetMap'), 'index.html');
console.log('ok: mapa e pacote conferidos');
