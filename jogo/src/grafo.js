// Grafo das ruas (nós = pontos do OpenStreetMap) com rota A*. Puro: sem THREE nem DOM.
export function criarGrafo(ruas, minW = 5) {
  const nos = new Map();
  const K = (x, z) => Math.round(x * 10) + ',' + Math.round(z * 10);
  const no = (x, z) => { const k = K(x, z); let n = nos.get(k); if (!n) { n = { x, z, e: [], id: nos.size, c: -1 }; nos.set(k, n); } return n; };
  for (const r of ruas) {
    if (r[0] < minW) continue; const a = r[1]; let p = no(a[0], a[1]);
    for (let i = 2; i < a.length; i += 2) {
      const q = no(a[i], a[i + 1]);
      if (q !== p) { const d = Math.hypot(q.x - p.x, q.z - p.z); p.e.push([q, d]); q.e.push([p, d]); }
      p = q;
    }
  }
  const lista = [...nos.values()];
  // componente principal: só nela as rotas são garantidas
  const tam = []; let c = 0;
  for (const n of lista) {
    if (n.c >= 0) continue; let s = 0; const pilha = [n]; n.c = c;
    while (pilha.length) { const u = pilha.pop(); s++; for (const [v] of u.e) if (v.c < 0) { v.c = c; pilha.push(v); } }
    tam.push(s); c++;
  }
  const principal = tam.indexOf(Math.max(...tam));
  const nosP = lista.filter(n => n.c === principal);

  function perto(x, z) { let b = null, bd = 1e18; for (const n of nosP) { const d = (n.x - x) ** 2 + (n.z - z) ** 2; if (d < bd) { bd = d; b = n; } } return b; }

  function rota(a, b) { // a, b: nós → lista de [x,z] (ou null)
    if (!a || !b) return null; if (a === b) return [[a.x, a.z]];
    const g = new Map([[a, 0]]), de = new Map(), aberto = [a], f = new Map([[a, 0]]), fechado = new Set();
    while (aberto.length) {
      let bi = 0; for (let i = 1; i < aberto.length; i++) if (f.get(aberto[i]) < f.get(aberto[bi])) bi = i;
      const u = aberto.splice(bi, 1)[0];
      if (u === b) { const out = []; let n = b; while (n) { out.push([n.x, n.z]); n = de.get(n); } return out.reverse(); }
      fechado.add(u);
      for (const [v, d] of u.e) {
        if (fechado.has(v)) continue; const ng = g.get(u) + d;
        if (ng < (g.has(v) ? g.get(v) : 1e18)) { g.set(v, ng); de.set(v, u); f.set(v, ng + Math.hypot(v.x - b.x, v.z - b.z)); if (!aberto.includes(v)) aberto.push(v); }
      }
    }
    return null;
  }
  // rota passando por vários pontos [x,z]
  function rotaPor(pts) {
    let out = [];
    for (let i = 0; i < pts.length - 1; i++) {
      const r = rota(perto(pts[i][0], pts[i][1]), perto(pts[i + 1][0], pts[i + 1][1])); if (!r) return null;
      out = out.concat(i ? r.slice(1) : r);
    }
    return out;
  }
  return { lista, nosP, perto, rota, rotaPor, componentes: tam.length, total: lista.length };
}

export function comprimento(p) { let s = 0; for (let i = 1; i < p.length; i++) s += Math.hypot(p[i][0] - p[i - 1][0], p[i][1] - p[i - 1][1]); return s; }
// distâncias acumuladas ao longo do caminho
export function acumulado(p) { const s = [0]; for (let i = 1; i < p.length; i++) s.push(s[i - 1] + Math.hypot(p[i][0] - p[i - 1][0], p[i][1] - p[i - 1][1])); return s; }
// ponto e direção a uma distância d do início
export function pontoEm(p, acc, d) {
  d = Math.max(0, Math.min(acc[acc.length - 1], d)); let i = 1; while (i < acc.length - 1 && acc[i] < d) i++;
  const a = p[i - 1], b = p[i], L = acc[i] - acc[i - 1] || 1, u = (d - acc[i - 1]) / L;
  return { x: a[0] + (b[0] - a[0]) * u, z: a[1] + (b[1] - a[1]) * u, h: Math.atan2(b[0] - a[0], b[1] - a[1]), i };
}
// pontos espaçados ao longo do caminho (para os anéis de controle)
export function amostrar(p, passo, incluirFim = true) {
  const acc = acumulado(p), T = acc[acc.length - 1], out = [];
  const n = Math.max(1, Math.round(T / passo));
  for (let k = 1; k <= n; k++) { if (k === n && !incluirFim) break; const q = pontoEm(p, acc, T * k / n); out.push({ x: q.x, z: q.z, s: T * k / n }); }
  return out;
}
