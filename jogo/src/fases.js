// As 30 fases de "Leonida no Trombetas: Oriximiná". Puro: sem THREE nem DOM.
// Os desafiantes são personagens de ficção; nenhum representa pessoa real.
import { comprimento, amostrar, acumulado, pontoEm } from './grafo.js';

export const VEIC = {
  fusca: { nome: 'Fusca', kind: 'car' }, uno: { nome: 'Hatch com escada', kind: 'car' }, picapeG: { nome: 'Picape grande', kind: 'car' },
  kombi: { nome: 'Kombi', kind: 'car' }, picapeP: { nome: 'Picape pequena', kind: 'car' }, esportivo: { nome: 'Cupê esportivo', kind: 'car' }, suv: { nome: 'SUV', kind: 'car' }, seda: { nome: 'Sedã', kind: 'car' }, van: { nome: 'Van', kind: 'car' },
  lancha: { nome: 'Lancha', kind: 'boat' }, iate: { nome: 'Iate', kind: 'boat' }, aviao: { nome: 'Avião', kind: 'plane' },
};
export const TIPO = { tempo: 'Contra o relógio', corrida: 'Racha', entrega: 'Entrega', voo: 'Voo', salto: 'Paraquedas' };

export function criarFases({ G, orlaAt, AERO }) {
  const o = (t, d = 0) => { const q = orlaAt(t); return [q.x + q.nx * d, q.z + q.nz * d]; };
  const P = {
    placa: o(0.33, -14), arvore: o(0.58, -14), cais: o(0.96, -12), orlaSul: o(0.03, -14), orlaMeio: o(0.45, -14),
    porto: [-395, -520], pracaSA: [29.8, 56.4], saudade: [-271, -290], baux: [416, -276], pref: [848, 1025], cent: [1003, 258], term: [-25, 380],
    goretti: [585, 516], poli: [481, 642], joana: [978, 949], sjose: [1293, 1353], betania: [1398, 1393], sinai: [1398, 757], barbara: [1405, 868],
    norte: [650, -1150], leste: [1500, -300], aero: AERO.patio,
  };
  const NOME = { placa: 'o letreiro EU ❤ ORIXIMINÁ', arvore: 'a árvore de Natal', cais: 'o cais da orla', orlaSul: 'o início da orla', orlaMeio: 'o meio da orla', porto: 'o porto', pracaSA: 'a Praça Santo Antônio', saudade: 'a Praça da Saudade', baux: 'o Estádio do Bauxitão', pref: 'a Prefeitura', cent: 'o Parque Centenário', term: 'o terminal hidroviário', goretti: 'a Escola Santa Maria Goretti', poli: 'a Policlínica', joana: 'a Escola Joana Bandeira', sjose: 'a Igreja São José', betania: 'a Congregação Betânia', sinai: 'a Congregação Monte Sinai', barbara: 'o Ilê Asé Santa Bárbara', leste: 'a saída leste', norte: 'a saída norte' };
  const nk = (n) => (n - 1) / 29;
  const fases = [];
  const base = (n, nome, tipo, veic, quem, fala, extra) => Object.assign({ n, id: 'f' + n, nome, tipo, veic, quem, fala, k: nk(n) }, extra);

  function carro(n, nome, tipo, veic, chaves, quem, fala, extra = {}) {
    const pts = chaves.map(c => P[c]); const path = G.rotaPor(pts); if (!path || path.length < 2) throw new Error('sem rota: fase ' + n);
    const len = comprimento(path), k = nk(n);
    let cps;
    if (tipo === 'entrega') cps = pts.slice(1).map(p => { const q = G.perto(p[0], p[1]); return { x: q.x, z: q.z, r: 11, parar: true }; });
    else cps = amostrar(path, 190).map(c => ({ x: c.x, z: c.z, r: 11 }));
    const vref = 10.5 + 5.5 * k;
    fases.push(base(n, nome, tipo, veic, quem, fala, Object.assign({
      path, len, cps, start: { x: path[0][0], z: path[0][1], h: Math.atan2(path[1][0] - path[0][0], path[1][1] - path[0][1]) },
      destino: NOME[chaves[chaves.length - 1]], nomes: chaves.slice(1).map(c => NOME[c]),
      tempo: Math.round(len / vref + (tipo === 'entrega' ? cps.length * 5 : 6)), rivalV: tipo === 'corrida' ? (12 + 7 * k) * (veic === 'esportivo' ? 1.25 : 1) : 0,
    }, extra)));
  }
  function barco(n, nome, tipo, td, quem, fala, extra = {}) { // td: [[t, distância da orla], ...]
    const wp = td.map(([t, d]) => o(t, d)); const path = [];
    for (let i = 0; i < wp.length - 1; i++) { const a = wp[i], b = wp[i + 1], m = Math.max(1, Math.round(Math.hypot(b[0] - a[0], b[1] - a[1]) / 40)); for (let j = i ? 1 : 0; j <= m; j++) path.push([a[0] + (b[0] - a[0]) * j / m, a[1] + (b[1] - a[1]) * j / m]); }
    const len = comprimento(path), k = nk(n);
    fases.push(base(n, nome, tipo, extra.veic || 'lancha', quem, fala, Object.assign({
      destino: 'a última boia', path, len, cps: wp.slice(1).map(p => ({ x: p[0], z: p[1], r: 17 })),
      start: { x: wp[0][0], z: wp[0][1], h: Math.atan2(wp[1][0] - wp[0][0], wp[1][1] - wp[0][1]) },
      tempo: Math.round(len / (11 + 5 * k) + 8), rivalV: tipo === 'corrida' ? 12.5 + 6 * k : 0,
    }, extra)));
  }
  // ponto de partida já em voo, a "dist" metros do alvo, vindo do lado do aeroporto
  function noAr(alvo, dist, y) { const dx = AERO.patio[0] - alvo[0], dz = AERO.patio[1] - alvo[1], l = Math.hypot(dx, dz); return { x: alvo[0] + dx / l * dist, z: alvo[1] + dz / l * dist, y, h: Math.atan2(-dx, -dz) }; }
  function voo(n, nome, aneis, quem, fala, extra = {}) { // aneis: [[x, z, y], ...]
    const pista = !extra.ar; const ini = pista ? [AERO.ini[0], AERO.ini[1]] : [extra.ar.x, extra.ar.z];
    const path = [ini].concat(aneis.map(a => [a[0], a[1]])); const len = comprimento(path);
    fases.push(base(n, nome, 'voo', 'aviao', quem, fala, Object.assign({
      path, len, cps: aneis.map(a => ({ x: a[0], z: a[1], y: a[2], r: extra.raio || 20 })),
      start: pista ? { x: AERO.ini[0], z: AERO.ini[1], h: AERO.h } : { x: extra.ar.x, z: extra.ar.z, h: extra.ar.h },
      tempo: Math.round(len / 42 + 25), rivalV: 0,
    }, extra)));
  }
  function salto(n, nome, chave, raio, quem, fala, extra = {}) {
    const alvo = P[chave]; const pista = !extra.ar;
    const ar = pista ? null : noAr(alvo, extra.ar, 400);
    const ini = pista ? [AERO.ini[0], AERO.ini[1]] : [ar.x, ar.z]; const aneis = extra.aneis || [];
    const path = [ini].concat(aneis.map(a => [a[0], a[1]]), [alvo]); const len = comprimento(path);
    fases.push(base(n, nome, 'salto', 'aviao', quem, fala, Object.assign({}, extra, {
      path, len, cps: aneis.map(a => ({ x: a[0], z: a[1], y: a[2], r: 22 })), alvo: { x: alvo[0], z: alvo[1], r: raio }, ar, destino: NOME[chave],
      start: pista ? { x: AERO.ini[0], z: AERO.ini[1], h: AERO.h } : { x: ar.x, z: ar.z, h: ar.h },
      tempo: Math.round(len / 40 + 110), rivalV: 0,
    })));
  }
  const rumo = (a, b, f, y) => [a[0] + (b[0] - a[0]) * f, a[1] + (b[1] - a[1]) * f, y];
  const sobre = (c, y) => [P[c][0], P[c][1], y];
  const decol = [AERO.fim[0] + Math.sin(AERO.h) * 650, AERO.fim[1] + Math.cos(AERO.h) * 650];
  const rioA = o(0.02, 150), rioB = o(0.98, 150), rd = [rioB[0] - rioA[0], rioB[1] - rioA[1]], rl = Math.hypot(rd[0], rd[1]); rd[0] /= rl; rd[1] /= rl;
  const rio = (m, y) => [rioA[0] + rd[0] * m, rioA[1] + rd[1] * m, y];

  // ---------- as 30 fases ----------
  carro(1, 'Primeira volta na orla', 'tempo', 'fusca', ['orlaSul', 'placa', 'arvore', 'cais'], 'Prefeito Delegado Fonseca', 'Bora dar uma volta na orla? É só seguir os anéis.');
  carro(2, 'Racha da orla', 'corrida', 'fusca', ['cais', 'pracaSA', 'placa', 'orlaSul'], 'Seu Raimundo, do táxi', 'Meu táxi conhece cada buraco dessa cidade. Duvido tu chegar antes de mim!');
  carro(3, 'Internet pra vizinhança', 'entrega', 'uno', ['pracaSA', 'goretti', 'poli', 'term'], 'Dona Nazaré', 'Três casas sem sinal desde ontem. Sobe essa escada e resolve, meu filho!');
  carro(4, 'Lotação da Kombi', 'entrega', 'kombi', ['term', 'pracaSA', 'saudade', 'baux'], 'Tio Bené, da lotação', 'Três paradas, e ninguém pode perder o jogo no Bauxitão.');
  barco(5, 'Travessia do Trombetas', 'tempo', [[0.45, 40], [0.5, 420], [0.85, 300], [0.9, 60]], 'Zé da Voadeira', 'Leva o iate até o meio do rio e volta pro cais. Quero ver se tu tem braço!', { veic: 'iate' });
  carro(6, 'Carga do porto', 'tempo', 'picapeG', ['porto', 'saudade', 'baux'], 'Mestre Dico, estivador', 'Essa carga tem hora. Do porto ao Bauxitão, sem amassar nada.');
  carro(7, 'Racha da Prefeitura', 'corrida', 'picapeP', ['pracaSA', 'cent', 'pref'], 'Juca da Picape', 'Da praça até a Prefeitura. Quem perder paga o tacacá.');
  voo(8, 'Primeiro voo', [[decol[0], decol[1], 80], rumo(decol, P.orlaMeio, 0.3, 190), rumo(decol, P.orlaMeio, 0.6, 230), rumo(decol, P.orlaMeio, 0.85, 200), [o(0.5, 120)[0], o(0.5, 120)[1], 120]], 'Comandante Tatá', 'Acelera na pista, sobe e segue os cinco anéis até a orla. Não encosta no chão!');
  salto(9, 'Salto na orla', 'placa', 60, 'Comandante Tatá', 'Decola, voa até a cidade e salta sobre a orla. Abre o paraquedas antes dos telhados!');
  barco(10, 'Regata do pôr do sol', 'corrida', [[0.05, 60], [0.3, 200], [0.6, 140], [0.95, 80]], 'Zé da Voadeira', 'Do começo ao fim da orla. Minha voadeira nunca perdeu regata.');
  carro(11, 'Entrega expressa', 'tempo', 'seda', ['porto', 'pracaSA', 'pref'], 'Dona Nazaré', 'A Prefeitura ficou sem internet. Corre, que hoje tem transmissão!');
  carro(12, 'Racha do Bauxitão', 'corrida', 'esportivo', ['baux', 'cent', 'goretti', 'cais'], 'Seu Raimundo, do táxi', 'Revanche! Do estádio até o cais, pelo Centenário.');
  barco(13, 'Slalom das boias', 'tempo', [[0.1, 50], [0.2, 180], [0.32, 50], [0.45, 180], [0.58, 50], [0.72, 180], [0.86, 50]], 'Zé da Voadeira', 'Sete boias em zigue-zague. Encostou na margem, perdeu tempo.');
  carro(14, 'Mudança na Kombi', 'entrega', 'kombi', ['pref', 'joana', 'poli', 'placa'], 'Tio Bené, da lotação', 'Mudança é assim: três paradas e nada de freada brusca.');
  voo(15, 'Rasante no rio', [rio(0, 90), rio(200, 45), rio(400, 30), rio(600, 30), rio(800, 45), rio(1100, 110)], 'Comandante Tatá', 'Voo baixo na frente da cidade. Passa nos seis anéis sem molhar a barriga do avião.', { ar: { x: rio(-1900, 0)[0], z: rio(-1900, 0)[1], y: 200, h: Math.atan2(rd[0], rd[1]) } });
  salto(16, 'Salto no Bauxitão', 'baux', 55, 'Comandante Tatá', 'Tem jogo hoje. Pousa no gramado e entrega a bola!', { ar: 2300 });
  carro(17, 'Racha das picapes', 'corrida', 'picapeG', ['porto', 'pracaSA', 'goretti', 'pref'], 'Dona Socorro, da picape preta', 'Picape grande é comigo. Do porto à Prefeitura, e sem choro.');
  carro(18, 'Volta completa da cidade', 'tempo', 'suv', ['placa', 'baux', 'leste', 'sinai', 'pref', 'poli', 'term'], 'Juca da Picape', 'Uma volta inteira em Oriximiná. Se parar pra conversar, não chega.');
  barco(19, 'Corrida até o porto', 'corrida', [[0.95, 70], [0.6, 260], [0.2, 160], [0.02, 120], [0.0, 330]], 'Capitão Bira', 'Do cais até o porto, na frente dos barcos de linha. Vamos ver quem atraca primeiro.');
  carro(20, 'Chamado urgente', 'entrega', 'uno', ['baux', 'saudade', 'pracaSA', 'poli', 'joana'], 'Dona Nazaré', 'Quatro chamados e a tarde acabando. Hoje tu vai suar essa camisa!');
  voo(21, 'Voo panorâmico', [sobre('cais', 150), sobre('term', 140), sobre('pref', 150), sobre('sinai', 150), sobre('cent', 140), sobre('baux', 140), sobre('saudade', 130), sobre('placa', 120)], 'Comandante Tatá', 'Uma volta sobre a cidade inteira. Oito anéis, do cais à orla.', { ar: noAr(P.cais, 2000, 260) });
  salto(22, 'Salto de precisão na praça', 'pracaSA', 40, 'Comandante Tatá', 'Praça Santo Antônio. O alvo é pequeno, então capricha na curva.', { ar: 2300 });
  carro(23, 'Racha noturno', 'corrida', 'fusca', ['orlaSul', 'baux', 'cent', 'pref', 'term', 'cais'], 'Seu Raimundo, do táxi', 'De noite a cidade é minha. Última chance de ganhar de mim!', { noite: true });
  carro(24, 'Kombi lotada', 'entrega', 'kombi', ['cais', 'term', 'poli', 'joana', 'sjose', 'betania'], 'Tio Bené, da lotação', 'Cinco paradas até o fim da linha. Passageiro em pé reclama, viu?');
  barco(25, 'Regata longa', 'corrida', [[0.02, 80], [0.25, 420], [0.5, 120], [0.75, 480], [0.97, 90], [0.6, 300], [0.3, 100]], 'Capitão Bira', 'Ida e volta, cruzando o rio duas vezes. Regata de gente grande.');
  carro(26, 'Carga pesada', 'tempo', 'van', ['porto', 'baux', 'leste', 'barbara', 'sjose'], 'Mestre Dico, estivador', 'Do porto até o outro lado da cidade. O relógio não perdoa.');
  voo(27, 'Anéis baixos', [sobre('pracaSA', 55), sobre('goretti', 50), sobre('pref', 55), sobre('cent', 50), sobre('baux', 50), sobre('saudade', 45), sobre('porto', 45)], 'Comandante Tatá', 'Sete anéis pequenos, pouco acima dos telhados. Só pra piloto de verdade.', { ar: noAr(P.pracaSA, 1900, 180), raio: 15 });
  salto(28, 'Salto noturno na árvore de Natal', 'arvore', 35, 'Comandante Tatá', 'Noite de Natal na orla. Pousa ao lado da árvore, com a cidade toda olhando.', { ar: 2300, noite: true });
  carro(29, 'Grande Prêmio de Oriximiná', 'corrida', 'esportivo', ['placa', 'porto', 'baux', 'leste', 'sinai', 'pref', 'poli', 'term', 'cais'], 'Seu Raimundo, do táxi', 'Agora é a cidade inteira. Quem ganhar leva o título.');
  salto(30, 'Final: o salto da vitória', 'placa', 30, 'Prefeito Delegado Fonseca', 'Última fase! Três anéis sobre a cidade e o pouso no letreiro da orla.', { ar: 3200, aneis: [sobre('pref', 330), sobre('pracaSA', 300), sobre('arvore', 280)] });

  fases.sort((a, b) => a.n - b.n);
  return { fases, P };
}

// estrelas pelo tempo (ou pela distância, no paraquedas)
export function estrelas(f, r) {
  if (f.tipo === 'salto') return r.dist <= f.alvo.r * 0.3 ? 3 : r.dist <= f.alvo.r * 0.65 ? 2 : 1;
  const u = r.tempo / f.tempo; return u <= 0.72 ? 3 : u <= 0.88 ? 2 : 1;
}
export { acumulado, pontoEm };
