// Pré-cadastro e passaporte do jogador. Os dados ficam só neste aparelho e,
// quando há um endereço de envio configurado (config.js), seguem para o organizador.
const K = 'orx_perfil', hoje = () => new Date().toLocaleDateString('sv');
export const NIVEIS = [[0, 'Visitante'], [200, 'Morador'], [500, 'Guia da Orla'], [1000, 'Embaixador do Trombetas'], [2000, 'Lenda de Oriximiná']];
export let P = null;
try { const s = JSON.parse(localStorage.getItem(K) || 'null'); if (s && s.nome && s.tel) P = s; } catch (e) {}
const gravar = () => { try { localStorage.setItem(K, JSON.stringify(P)); } catch (e) {} };
export const soDigitos = t => String(t || '').replace(/\D/g, '');
export function mascara(t) { const d = soDigitos(t).slice(0, 11); if (d.length < 3) return d; const a = '(' + d.slice(0, 2) + ') '; if (d.length <= 6) return a + d.slice(2); const c = d.length === 11 ? 7 : 6; return a + d.slice(2, c) + (d.length > c ? '-' + d.slice(c) : ''); }
export function validar(nome, sobrenome, tel, aceite) {
  const n = String(nome || '').trim(), s = String(sobrenome || '').trim(), d = soDigitos(tel), ok = /^[\p{L}][\p{L} '.-]{1,39}$/u;
  if (!ok.test(n)) return 'Escreva seu nome.'; if (!ok.test(s)) return 'Escreva seu sobrenome.';
  if (d.length < 10 || d.length > 11 || /^(\d)\1+$/.test(d) || d[0] === '0') return 'Telefone com DDD, por exemplo (93) 99999-9999.';
  if (!aceite) return 'Marque a autorização para continuar.'; return '';
}
export function nivel(p = P) { const pts = p ? p.pontos : 0; let i = 0; while (i + 1 < NIVEIS.length && pts >= NIVEIS[i + 1][0]) i++; return { nome: NIVEIS[i][1], prox: NIVEIS[i + 1] ? NIVEIS[i + 1][0] : null, n: i + 1 }; }
export function criar(nome, sobrenome, tel) { P = { nome: nome.trim(), sobrenome: sobrenome.trim(), tel: mascara(tel), criado: new Date().toISOString(), acessos: 0, dia: '', seq: 0, pontos: 0, enviado: false }; gravar(); enviar(); return P; }
// cada acesso conta; o primeiro de cada dia dá pontos, e dias seguidos aumentam o bônus
export function acesso(dia = hoje()) {
  if (!P) return null; P.acessos++; let ganho = 0;
  if (P.dia !== dia) { const ontem = new Date(new Date(dia + 'T12:00').getTime() - 864e5).toLocaleDateString('sv'); P.seq = P.dia === ontem ? P.seq + 1 : 1; ganho = 50 + Math.min(P.seq - 1, 7) * 10; P.pontos += ganho; P.dia = dia; }
  gravar(); if (!P.enviado) enviar(); return { ganho, seq: P.seq, acessos: P.acessos };
}
export function pontuar(n) { if (!P || !(n > 0)) return; const a = nivel().n; P.pontos += Math.round(n); gravar(); return nivel().n > a ? nivel().nome : null; }
export function enviar() {
  const url = typeof window !== 'undefined' && window.__CFG && window.__CFG.cadastro; if (!url || !P || P.enviado) return Promise.resolve(false);
  return fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json', Accept: 'application/json' }, body: JSON.stringify({ nome: P.nome, sobrenome: P.sobrenome, telefone: P.tel, aceite: true, criado: P.criado }) })
    .then(r => { if (r.ok) { P.enviado = true; gravar(); } return r.ok; }).catch(() => false);
}
