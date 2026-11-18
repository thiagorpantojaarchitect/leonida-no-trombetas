// Geometria pura do mapa (sem THREE nem DOM): serve ao jogo e aos testes.
import MAP from './mapa_jogo.json';

// ---------- utilidades ----------
export const rng = (s => () => { s |= 0; s = s + 0x6D2B79F5 | 0; let t = Math.imul(s ^ s >>> 15, 1 | s); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; })(1911);
export const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
export const lerp = (a, b, t) => a + (b - a) * t;
export const FLAGS = ((typeof location !== 'undefined' && location.hash) || '').replace('#', '').split('-');
export const has = f => FLAGS.includes(f);

export function ring(a) { // remove ponto de fechamento repetido
  const n = a.length / 2;
  if (n > 2 && a[0] === a[a.length - 2] && a[1] === a[a.length - 1]) return a.slice(0, -2);
  return a;
}
export function bbox(a) {
  let x0 = 1e9, x1 = -1e9, z0 = 1e9, z1 = -1e9;
  for (let i = 0; i < a.length; i += 2) { x0 = Math.min(x0, a[i]); x1 = Math.max(x1, a[i]); z0 = Math.min(z0, a[i + 1]); z1 = Math.max(z1, a[i + 1]); }
  return [x0, z0, x1, z1];
}
export function area(a) { let s = 0; const n = a.length / 2; for (let i = 0; i < n; i++) { const j = (i + 1) % n; s += a[2 * i] * a[2 * j + 1] - a[2 * j] * a[2 * i + 1]; } return Math.abs(s) / 2; }
export function pip(a, x, z) {
  let c = false; const n = a.length / 2;
  for (let i = 0, j = n - 1; i < n; j = i++) {
    const xi = a[2 * i], zi = a[2 * i + 1], xj = a[2 * j], zj = a[2 * j + 1];
    if ((zi > z) !== (zj > z) && x < (xj - xi) * (z - zi) / (zj - zi) + xi) c = !c;
  }
  return c;
}
export function centroid(a) { let x = 0, z = 0; const n = a.length / 2; for (let i = 0; i < n; i++) { x += a[2 * i]; z += a[2 * i + 1]; } return [x / n, z / n]; }

// ---------- dados ----------
export const AGUA = MAP.agua.map(ring).filter(a => a.length >= 6);
export const AGUA_BIG = AGUA.filter(a => area(a) > 20000).map(a => ({ a, b: bbox(a) }));
export const inWater = (x, z) => { for (const w of AGUA_BIG) { const b = w.b; if (x >= b[0] && x <= b[2] && z >= b[1] && z <= b[3] && pip(w.a, x, z)) return true; } return false; };
export const PRED = MAP.predios.map(p => ({ h: p[0], a: ring(p[1]) })).filter(p => p.a.length >= 6);
PRED.forEach(p => { p.b = bbox(p.a); });
export const ORLA = MAP.orla;

// grade de prédios para colisão
const CELL = 50, grid = new Map();
const key = (cx, cz) => cx * 4096 + cz;
PRED.forEach((p, i) => {
  for (let cx = Math.floor(p.b[0] / CELL); cx <= Math.floor(p.b[2] / CELL); cx++)
    for (let cz = Math.floor(p.b[1] / CELL); cz <= Math.floor(p.b[3] / CELL); cz++) {
      const k = key(cx, cz); if (!grid.has(k)) grid.set(k, []); grid.get(k).push(i);
    }
});
export function inBuilding(x, z) {
  const l = grid.get(key(Math.floor(x / CELL), Math.floor(z / CELL))); if (!l) return false;
  for (const i of l) { const p = PRED[i], b = p.b; if (x >= b[0] && x <= b[2] && z >= b[1] && z <= b[3] && pip(p.a, x, z)) return true; }
  return false;
}
export function distSeg(px, pz, ax, az, bx, bz) {
  const dx = bx - ax, dz = bz - az, l = dx * dx + dz * dz || 1;
  const t = clamp(((px - ax) * dx + (pz - az) * dz) / l, 0, 1);
  return Math.hypot(px - ax - t * dx, pz - az - t * dz);
}
export function distOrla(x, z) { let m = 1e9; for (let i = 0; i < ORLA.length - 1; i++) m = Math.min(m, distSeg(x, z, ORLA[i][0], ORLA[i][1], ORLA[i + 1][0], ORLA[i + 1][1])); return m; }
export function orlaAt(t) { // t 0..1 → ponto, tangente, normal para o lado da água
  const f = clamp(t, 0, 0.9999) * (ORLA.length - 1), i = Math.floor(f), u = f - i;
  const a = ORLA[i], b = ORLA[i + 1];
  const x = lerp(a[0], b[0], u), z = lerp(a[1], b[1], u);
  let tx = b[0] - a[0], tz = b[1] - a[1]; const l = Math.hypot(tx, tz); tx /= l; tz /= l;
  let nx = -tz, nz = tx; if (!inWater(x + nx * 25, z + nz * 25)) { nx = -nx; nz = -nz; }
  return { x, z, tx, tz, nx, nz };
}

// ruas com nome, em grade
const RG = new Map(), RC = 80;
MAP.ruas.forEach((r, ri) => {
  if (!r[2]) return; const a = r[1];
  for (let i = 0; i < a.length - 2; i += 2) {
    const k = key(Math.floor(a[i] / RC), Math.floor(a[i + 1] / RC)); if (!RG.has(k)) RG.set(k, []); RG.get(k).push([ri, i]);
  }
});
export function streetName(x, z) {
  let best = 30, name = '';
  const cx = Math.floor(x / RC), cz = Math.floor(z / RC);
  for (let i = -1; i <= 1; i++) for (let j = -1; j <= 1; j++) {
    const l = RG.get(key(cx + i, cz + j)); if (!l) continue;
    for (const [ri, k] of l) { const a = MAP.ruas[ri][1]; const d = distSeg(x, z, a[k], a[k + 1], a[k + 2], a[k + 3]); if (d < best) { best = d; name = MAP.ruas[ri][2]; } }
  }
  return name;
}
export function snapRoad(x, z) {
  let best = 1e9, out = [x, z];
  for (const r of MAP.ruas) { if (r[0] < 7) continue; const a = r[1]; for (let i = 0; i < a.length; i += 2) { const d = Math.hypot(a[i] - x, a[i + 1] - z); if (d < best && !inBuilding(a[i], a[i + 1]) && !inWater(a[i], a[i + 1])) { best = d; out = [a[i], a[i + 1]]; } } }
  return out;
}

export function fixUp(pos, from = 0) { // garante triângulos virados para cima
  for (let i = from; i + 8 < pos.length; i += 9) {
    const ax = pos[i + 3] - pos[i], az = pos[i + 5] - pos[i + 2], bx = pos[i + 6] - pos[i], bz = pos[i + 8] - pos[i + 2];
    if (az * bx - ax * bz < 0) { for (let k = 0; k < 3; k++) { const t = pos[i + 3 + k]; pos[i + 3 + k] = pos[i + 6 + k]; pos[i + 6 + k] = t; } }
  }
  return pos;
}
export function predioEm(x, z) { // prédio sob o ponto (ou null)
  const l = grid.get(key(Math.floor(x / CELL), Math.floor(z / CELL))); if (!l) return null;
  for (const i of l) { const p = PRED[i], b = p.b; if (x >= b[0] && x <= b[2] && z >= b[1] && z <= b[3] && pip(p.a, x, z)) return p; }
  return null;
}
export { MAP };

// ---------- aeroporto (pista real do OpenStreetMap) ----------
export const AERO = (() => {
  const pa = MAP.aero.pista, A = [pa[0], pa[1]], B = [pa[pa.length - 2], pa[pa.length - 1]];
  let dx = A[0] - B[0], dz = A[1] - B[1]; const len = Math.hypot(dx, dz); dx /= len; dz /= len;
  let patio = B, md = -1;
  for (const t of MAP.aero.taxi) for (let i = 0; i < t.length; i += 2) { const px = t[i] - B[0], pz = t[i + 1] - B[1], d = Math.abs(px * dz - pz * dx); if (d > md) { md = d; patio = [t[i], t[i + 1]]; } }
  const term = MAP.aero.terminal ? centroid(ring(MAP.aero.terminal)) : patio;
  return { A, B, len, dir: [dx, dz], h: Math.atan2(dx, dz), ini: [B[0] + dx * 70, B[1] + dz * 70], fim: A, patio, term, larg: 30 };
})();
