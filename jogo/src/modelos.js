// Modelos em primitivas: carros parecidos com os da cidade (sem logos nem nomes de marca),
// avião, navio, barcos, personagem e paraquedas.
import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';

const L = (c, o = {}) => new THREE.MeshLambertMaterial(Object.assign({ color: c }, o));
const P = (c, s = 70) => new THREE.MeshPhongMaterial({ color: c, shininess: s, specular: 0x666666 });
const ESC = L(0x15151b), BORR = L(0x0e0e11), VIDRO = new THREE.MeshPhongMaterial({ color: 0x1b2836, shininess: 140, specular: 0xaabbcc });
const CROMO = P(0xc9cdd3, 110), FAROL = new THREE.MeshBasicMaterial({ color: 0xfff2c0 }), LANT = new THREE.MeshBasicMaterial({ color: 0xff2a2a });
const SOMBRA = new THREE.MeshBasicMaterial({ color: 0x000000, transparent: true, opacity: 0.32, depthWrite: false });

function cx(g, mat, w, h, d, x, y, z, rx = 0) { const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat); m.position.set(x, y, z); m.rotation.x = rx; g.add(m); return m; }
// perfil lateral [z, y] extrudado na largura w
function perfil(g, pts, w, mat, chanfro = 0.05) {
  const s = new THREE.Shape(); pts.forEach((p, i) => i ? s.lineTo(p[0], p[1]) : s.moveTo(p[0], p[1])); s.closePath();
  const geo = new THREE.ExtrudeGeometry(s, { depth: w, bevelEnabled: chanfro > 0, bevelSize: chanfro, bevelThickness: chanfro, bevelSegments: 2 });
  geo.rotateY(-Math.PI / 2); geo.translate(w / 2, 0, 0);
  const m = new THREE.Mesh(geo, mat); g.add(m); return m;
}
function rodas(g, lista, r, t = 0.26) {
  const pneu = new THREE.CylinderGeometry(r, r, t, 16).rotateZ(Math.PI / 2), calota = new THREE.CylinderGeometry(r * 0.56, r * 0.56, t + 0.03, 10).rotateZ(Math.PI / 2), raio = new THREE.BoxGeometry(t + 0.05, r * 0.9, 0.06);
  const ws = [];
  for (const [x, z] of lista) { const w = new THREE.Group(); w.add(new THREE.Mesh(pneu, BORR), new THREE.Mesh(calota, CROMO), new THREE.Mesh(raio, ESC)); w.position.set(x, r, z); g.add(w); ws.push(w); }
  g.userData.rodas = ws; g.userData.raio = r;
}
function sombra(g, w, d) { const m = new THREE.Mesh(new THREE.PlaneGeometry(w, d).rotateX(-Math.PI / 2), SOMBRA); m.position.y = 0.03; m.renderOrder = 2; g.add(m); g.userData.sombra = m; }
function luzes(g, w, zf, zt, y, lf = 0.3) {
  for (const s of [-1, 1]) { cx(g, FAROL, lf, 0.15, 0.05, s * (w / 2 - 0.3), y, zf); cx(g, LANT, 0.26, 0.14, 0.05, s * (w / 2 - 0.26), y + 0.02, zt); }
}

export function fusca(cor = 0xf7f5ef, daOrla = false) {
  const g = new THREE.Group(), body = P(cor, 90);
  const add = (geo, mat, x, y, z, sx = 1, sy = 1, sz = 1) => { const m = new THREE.Mesh(geo, mat); m.position.set(x, y, z); m.scale.set(sx, sy, sz); g.add(m); return m; };
  const sph = new THREE.SphereGeometry(1, 18, 12);
  add(sph, body, 0, 0.72, 0, 0.82, 0.42, 2.02); add(sph, body, 0, 1.08, -0.2, 0.74, 0.5, 1.08);
  add(sph, VIDRO, 0, 1.1, -0.2, 0.76, 0.4, 0.98); add(sph, body, 0, 1.2, -0.2, 0.66, 0.42, 0.9);
  for (const [x, z] of [[-0.74, 1.2], [0.74, 1.2], [-0.74, -1.2], [0.74, -1.2]]) add(sph, body, x, 0.55, z, 0.3, 0.36, 0.56);
  rodas(g, [[-0.76, 1.2], [0.76, 1.2], [-0.76, -1.2], [0.76, -1.2]], 0.36, 0.22);
  add(sph, FAROL, -0.55, 0.78, 1.72, 0.14, 0.14, 0.08); add(sph, FAROL, 0.55, 0.78, 1.72, 0.14, 0.14, 0.08);
  add(sph, LANT, -0.5, 0.74, -1.8, 0.1, 0.1, 0.06); add(sph, LANT, 0.5, 0.74, -1.8, 0.1, 0.1, 0.06);
  cx(g, CROMO, 1.5, 0.09, 0.1, 0, 0.42, 1.98); cx(g, CROMO, 1.4, 0.09, 0.1, 0, 0.42, -1.98);
  if (daOrla) { // o Fusca branco da orla: "EU ❤ ORIXIMINÁ" nas portas e teto preto
    const c = document.createElement('canvas'); c.width = 512; c.height = 256; const x = c.getContext('2d'); x.textAlign = 'center'; x.textBaseline = 'middle';
    x.fillStyle = '#16161c'; x.font = '900 120px Arial Black, Arial, sans-serif'; x.fillText('EU', 150, 80); x.font = '900 84px Arial Black, Arial, sans-serif'; x.fillText('ORIXIMINÁ', 256, 196);
    x.fillStyle = '#e0202c'; x.font = '150px Arial, sans-serif'; x.fillText('❤', 350, 84);
    const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace;
    for (const s of [-1, 1]) { const d = new THREE.Mesh(new THREE.PlaneGeometry(1.15, 0.56), new THREE.MeshBasicMaterial({ map: t, transparent: true, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -2 })); d.position.set(s * 0.835, 0.74, 0.12); d.rotation.y = s * Math.PI / 2; g.add(d); }
    add(sph, ESC, 0, 1.56, -0.25, 0.46, 0.08, 0.6);
  }
  sombra(g, 2, 4.4); return g;
}

// cupê esportivo baixo
export function esportivo(cor = 0xd81e28) {
  const g = new THREE.Group(), body = P(cor, 130);
  perfil(g, [[-2.1, 0.26], [2.05, 0.26], [2.13, 0.48], [1.9, 0.7], [0.9, 0.8], [-1.3, 0.9], [-2.1, 0.86]], 1.84, body, 0.07);
  perfil(g, [[0.92, 0.8], [0.12, 1.24], [-0.72, 1.26], [-1.72, 0.9]], 1.6, VIDRO, 0.03);
  cx(g, body, 1.5, 0.05, 0.86, 0, 1.28, -0.3); cx(g, body, 1.66, 0.4, 0.09, 0, 1.06, -0.74);
  cx(g, ESC, 1.3, 0.3, 0.06, 0, 0.5, 2.13); cx(g, ESC, 1.5, 0.05, 0.3, 0, 1.0, -2.0); for (const s of [-1, 1]) cx(g, ESC, 0.06, 0.12, 0.2, s * 0.7, 0.93, -2.0);
  luzes(g, 1.84, 2.12, -2.14, 0.66, 0.4);
  rodas(g, [[-0.86, 1.32], [0.86, 1.32], [-0.86, -1.3], [0.86, -1.3]], 0.36, 0.28);
  sombra(g, 2.2, 4.6); return g;
}
// utilitário esportivo prata
export function suv(cor = 0xc8ccd2) {
  const g = new THREE.Group(), body = P(cor, 110);
  perfil(g, [[-2.2, 0.4], [2.1, 0.4], [2.2, 0.75], [2.05, 1.0], [1.0, 1.08], [-2.2, 1.1]], 1.82, body, 0.07);
  perfil(g, [[1.0, 1.08], [0.45, 1.6], [-1.8, 1.62], [-2.15, 1.1]], 1.68, VIDRO, 0.02);
  cx(g, body, 1.78, 0.06, 2.3, 0, 1.65, -0.68); for (const z of [-0.5, -1.72]) cx(g, body, 1.8, 0.54, 0.11, 0, 1.36, z); cx(g, body, 1.8, 0.6, 0.08, 0, 1.36, 0.72, -0.8);
  for (const s of [-1, 1]) { cx(g, ESC, 0.06, 0.2, 4.2, s * 0.94, 0.5, 0); cx(g, CROMO, 0.04, 0.04, 2.1, s * 0.7, 1.72, -0.68); }
  cx(g, ESC, 1.86, 0.22, 0.14, 0, 0.5, 2.18); cx(g, ESC, 1.86, 0.22, 0.14, 0, 0.5, -2.2); cx(g, ESC, 1, 0.2, 0.05, 0, 0.82, 2.19);
  luzes(g, 1.82, 2.19, -2.22, 0.9);
  rodas(g, [[-0.84, 1.38], [0.84, 1.38], [-0.84, -1.35], [0.84, -1.35]], 0.38, 0.26);
  sombra(g, 2.2, 4.8); return g;
}
// sedã de três volumes
export function seda(cor = 0x2a5ab0) {
  const g = new THREE.Group(), body = P(cor, 110);
  perfil(g, [[-2.3, 0.32], [2.2, 0.32], [2.3, 0.6], [2.15, 0.82], [1.0, 0.9], [-1.4, 0.92], [-2.3, 0.88]], 1.78, body, 0.07);
  perfil(g, [[1.0, 0.9], [0.4, 1.38], [-0.9, 1.4], [-1.55, 0.92]], 1.62, VIDRO, 0.02);
  cx(g, body, 1.66, 0.05, 1.32, 0, 1.42, -0.25); cx(g, body, 1.72, 0.48, 0.1, 0, 1.17, -0.3); cx(g, body, 1.72, 0.56, 0.07, 0, 1.15, 0.68, -0.9);
  cx(g, ESC, 1.0, 0.16, 0.05, 0, 0.66, 2.3); cx(g, CROMO, 1.82, 0.08, 0.1, 0, 0.36, 2.28); cx(g, CROMO, 1.82, 0.08, 0.1, 0, 0.36, -2.3);
  luzes(g, 1.78, 2.29, -2.31, 0.7, 0.36);
  rodas(g, [[-0.82, 1.42], [0.82, 1.42], [-0.82, -1.4], [0.82, -1.4]], 0.33, 0.24);
  sombra(g, 2.1, 5); return g;
}
// van antiga de teto alto, azul com faixas
export function van(cor = 0x1f4a6a) {
  const g = new THREE.Group(), body = P(cor, 90), ouro = P(0xc8a060);
  perfil(g, [[-2.6, 0.45], [2.3, 0.45], [2.62, 0.8], [2.62, 1.15], [-2.6, 1.15]], 2.0, body, 0.07);
  perfil(g, [[2.62, 1.15], [1.85, 1.92], [1.4, 2.12], [-2.5, 2.12], [-2.6, 1.15]], 1.96, body, 0.07);
  cx(g, P(0xf2f0ea), 1.8, 0.08, 3.4, 0, 2.2, -0.6);
  for (const s of [-1, 1]) { cx(g, ouro, 0.04, 0.1, 5.1, s * 1.04, 1.12, 0); cx(g, P(0xf2f0ea), 0.04, 0.08, 5.1, s * 1.04, 0.98, 0); for (const z of [0.9, -0.5, -1.7]) cx(g, VIDRO, 0.05, 0.56, 1.0, s * 1.02, 1.62, z); }
  cx(g, VIDRO, 1.7, 0.86, 0.05, 0, 1.56, 2.24, -0.79); cx(g, CROMO, 1.5, 0.42, 0.06, 0, 0.9, 2.66); cx(g, ESC, 1.36, 0.3, 0.07, 0, 0.9, 2.67);
  cx(g, CROMO, 2.06, 0.18, 0.2, 0, 0.5, 2.62); cx(g, CROMO, 2.06, 0.18, 0.2, 0, 0.5, -2.64);
  luzes(g, 2.0, 2.67, -2.66, 0.92, 0.24);
  rodas(g, [[-0.92, 1.7], [0.92, 1.7], [-0.92, -1.6], [0.92, -1.6]], 0.4, 0.28);
  sombra(g, 2.4, 5.6); return g;
}

// hatch quadrado dos anos 90, branco, com rack e escada de alumínio no teto
export function uno(cor = 0xb9bcc0) {
  const g = new THREE.Group(), body = P(cor);
  perfil(g, [[-1.85, 0.3], [1.8, 0.3], [1.86, 0.6], [1.74, 0.84], [0.8, 0.93], [-1.85, 0.95]], 1.52, body);
  perfil(g, [[0.82, 0.93], [0.32, 1.42], [-1.68, 1.45], [-1.84, 0.95]], 1.42, VIDRO, 0.02);
  cx(g, body, 1.5, 0.06, 2.06, 0, 1.47, -0.68);
  for (const z of [-0.42, -1.72]) cx(g, body, 1.5, 0.52, 0.1, 0, 1.2, z);
  cx(g, body, 1.5, 0.5, 0.07, 0, 1.19, 0.55, -0.79);
  cx(g, ESC, 1.56, 0.16, 0.12, 0, 0.36, 1.86); cx(g, ESC, 1.56, 0.16, 0.12, 0, 0.36, -1.88); cx(g, ESC, 0.7, 0.12, 0.04, 0, 0.66, 1.88);
  luzes(g, 1.52, 1.88, -1.9, 0.68);
  rodas(g, [[-0.72, 1.2], [0.72, 1.2], [-0.72, -1.15], [0.72, -1.15]], 0.3, 0.2);
  // rack e escada
  for (const x of [-0.56, 0.56]) { cx(g, ESC, 0.04, 0.04, 1.9, x, 1.6, -0.68); for (const z of [-1.5, 0.1]) cx(g, ESC, 0.04, 0.12, 0.04, x, 1.54, z); }
  for (const z of [-1.5, 0.1]) cx(g, ESC, 1.16, 0.04, 0.04, 0, 1.6, z);
  const esc = L(0xc8402a); for (const x of [-0.22, 0.22]) cx(g, esc, 0.06, 0.09, 3.4, x, 1.67, -0.5);
  for (let i = 0; i < 11; i++) cx(g, esc, 0.44, 0.04, 0.05, 0, 1.67, -2.1 + i * 0.32);
  cx(g, new THREE.MeshBasicMaterial({ color: 0xff7a1a }), 0.2, 0.16, 0.05, 0, 1.66, 1.17);
  sombra(g, 1.9, 4.1); return g;
}

// picape grande de cabine dupla, grade alta e cromados
export function picapeG(cor = 0x23252b) {
  const g = new THREE.Group(), body = P(cor, 100);
  perfil(g, [[-2.9, 0.5], [2.84, 0.5], [2.92, 0.86], [2.86, 1.24], [1.62, 1.3], [-2.9, 1.28]], 2.0, body, 0.06);
  perfil(g, [[1.62, 1.3], [1.16, 1.86], [-0.84, 1.9], [-0.96, 1.3]], 1.86, VIDRO, 0.02);
  cx(g, body, 1.96, 0.07, 2.04, 0, 1.92, 0.16);
  for (const z of [0.12, -0.9]) cx(g, body, 1.98, 0.62, 0.12, 0, 1.6, z);
  cx(g, body, 1.98, 0.74, 0.08, 0, 1.58, 1.39, -0.69);
  cx(g, ESC, 1.76, 0.05, 1.86, 0, 1.3, -1.92);                       // caçamba aberta
  cx(g, CROMO, 1.62, 0.6, 0.06, 0, 0.97, 2.95); cx(g, ESC, 1.46, 0.46, 0.08, 0, 0.97, 2.96);
  for (let i = 0; i < 4; i++) cx(g, CROMO, 1.46, 0.03, 0.1, 0, 0.8 + i * 0.11, 2.97);
  cx(g, CROMO, 2.08, 0.2, 0.2, 0, 0.56, 2.92); cx(g, CROMO, 2.08, 0.2, 0.2, 0, 0.56, -2.94);
  luzes(g, 2.0, 2.96, -2.97, 1.05, 0.26);
  for (const s of [-1, 1]) { cx(g, ESC, 0.1, 0.16, 0.24, s * 1.1, 1.42, 1.3); cx(g, ESC, 0.22, 0.06, 2.4, s * 1.02, 0.46, -0.1); }
  rodas(g, [[-0.9, 1.9], [0.9, 1.9], [-0.9, -1.85], [0.9, -1.85]], 0.47, 0.34);
  sombra(g, 2.5, 6.3); return g;
}

// perua clássica de frente reta, saia-e-blusa
export function kombi(cor = 0x4f9fd0) {
  const g = new THREE.Group(), baixo = P(cor), cima = P(0xf6f4ee);
  perfil(g, [[-2.2, 0.36], [2.1, 0.36], [2.2, 0.7], [2.22, 1.06], [-2.22, 1.06]], 1.72, baixo, 0.06);
  perfil(g, [[2.22, 1.06], [2.06, 1.88], [1.8, 1.96], [-2.1, 1.96], [-2.22, 1.06]], 1.7, cima, 0.06);
  for (const s of [-1, 1]) for (const z of [0.9, -0.25, -1.4]) cx(g, VIDRO, 0.04, 0.5, 0.92, s * 0.89, 1.5, z);
  cx(g, VIDRO, 1.44, 0.56, 0.05, 0, 1.52, 2.19, -0.19); cx(g, cima, 0.06, 0.58, 0.07, 0, 1.52, 2.2, -0.19); cx(g, VIDRO, 1.2, 0.42, 0.05, 0, 1.52, -2.25);
  cx(g, cima, 0.5, 0.5, 0.05, 0, 0.82, 2.26);
  for (const s of [-1, 1]) { const f = new THREE.Mesh(new THREE.CylinderGeometry(0.15, 0.15, 0.06, 14).rotateX(Math.PI / 2), FAROL); f.position.set(s * 0.56, 0.84, 2.27); g.add(f); cx(g, LANT, 0.16, 0.3, 0.05, s * 0.7, 0.82, -2.26); }
  cx(g, CROMO, 1.8, 0.12, 0.14, 0, 0.4, 2.26); cx(g, CROMO, 1.8, 0.12, 0.14, 0, 0.4, -2.28);
  rodas(g, [[-0.78, 1.38], [0.78, 1.38], [-0.78, -1.3], [0.78, -1.3]], 0.34, 0.22);
  sombra(g, 2.1, 4.8); return g;
}

// picape pequena de cabine simples
export function picapeP(cor = 0xc2262e) {
  const g = new THREE.Group(), body = P(cor, 90);
  perfil(g, [[-2.2, 0.34], [2.14, 0.34], [2.22, 0.62], [2.1, 0.88], [1.1, 0.99], [-2.2, 1.0]], 1.66, body);
  perfil(g, [[1.1, 0.99], [0.5, 1.45], [-0.44, 1.48], [-0.6, 1.0]], 1.54, VIDRO, 0.02);
  cx(g, body, 1.62, 0.06, 1.0, 0, 1.5, 0.02); cx(g, body, 1.64, 0.5, 0.1, 0, 1.24, -0.52); cx(g, body, 1.64, 0.6, 0.07, 0, 1.23, 0.8, -0.92);
  cx(g, ESC, 1.44, 0.05, 1.5, 0, 1.03, -1.38);
  cx(g, ESC, 1.7, 0.2, 0.12, 0, 0.42, 2.2); cx(g, ESC, 1.7, 0.18, 0.12, 0, 0.42, -2.22); cx(g, ESC, 0.9, 0.14, 0.04, 0, 0.7, 2.21);
  luzes(g, 1.66, 2.2, -2.23, 0.74);
  cx(g, ESC, 1.5, 0.05, 0.05, 0, 1.52, -0.6); for (const s of [-1, 1]) cx(g, ESC, 0.05, 0.5, 0.05, s * 0.75, 1.27, -0.62);
  rodas(g, [[-0.76, 1.38], [0.76, 1.38], [-0.76, -1.35], [0.76, -1.35]], 0.32, 0.22);
  sombra(g, 2.0, 4.8); return g;
}

export function lancha(cor = 0xff3d7f) {
  const g = new THREE.Group();
  const sh = new THREE.Shape(); sh.moveTo(-1.15, -3); sh.lineTo(1.15, -3); sh.lineTo(1.2, 1); sh.quadraticCurveTo(0.9, 3.2, 0, 4); sh.quadraticCurveTo(-0.9, 3.2, -1.2, 1); sh.closePath();
  const casco = new THREE.Mesh(new THREE.ExtrudeGeometry(sh, { depth: 0.9, bevelEnabled: false }), P(0xf4f4f0, 90)); casco.rotation.x = Math.PI / 2; casco.position.y = 1.0; g.add(casco);
  const faixa = new THREE.Mesh(new THREE.ExtrudeGeometry(sh, { depth: 0.18, bevelEnabled: false }), P(cor)); faixa.rotation.x = Math.PI / 2; faixa.position.y = 1.06; faixa.scale.set(1.03, 1.02, 1); g.add(faixa);
  cx(g, VIDRO, 1.7, 0.6, 0.08, 0, 1.35, 0.9, -0.5); cx(g, ESC, 0.5, 1, 0.6, 0, 1.2, -3.1); cx(g, L(0x2de2e6), 1.5, 0.4, 0.6, 0, 1.15, -0.6); cx(g, L(0x2de2e6), 1.5, 0.5, 0.2, 0, 1.4, -0.95);
  return g;
}
// voadeira de alumínio com motor de popa
export function voadeira() {
  const g = new THREE.Group();
  const sh = new THREE.Shape(); sh.moveTo(-0.8, -3); sh.lineTo(0.8, -3); sh.lineTo(0.8, 1.6); sh.lineTo(0, 3.4); sh.lineTo(-0.8, 1.6); sh.closePath();
  const c = new THREE.Mesh(new THREE.ExtrudeGeometry(sh, { depth: 0.6, bevelEnabled: false }), P(0xb9c0c6, 100)); c.rotation.x = Math.PI / 2; c.position.y = 0.75; g.add(c);
  cx(g, ESC, 1.4, 0.04, 5.2, 0, 0.72, -0.5); cx(g, L(0x8a5a3a), 1.5, 0.08, 0.3, 0, 0.78, -1.2); cx(g, L(0x8a5a3a), 1.5, 0.08, 0.3, 0, 0.78, 0.4); cx(g, ESC, 0.4, 0.8, 0.5, 0, 0.9, -3.1);
  cx(g, L(0xe8d2a8), 0.5, 0.9, 0.4, 0, 1.25, -2.4); cx(g, L(0x7a5236), 0.34, 0.34, 0.34, 0, 1.86, -2.4);
  return g;
}
// barco de linha de dois andares
export function barcoLinha(corCasco = 0x2f6fc0, corTeto = 0xb8443a) {
  const g = new THREE.Group();
  const sh = new THREE.Shape(); sh.moveTo(-2.4, -9); sh.lineTo(2.4, -9); sh.lineTo(2.5, 5); sh.quadraticCurveTo(1.6, 9, 0, 10.5); sh.quadraticCurveTo(-1.6, 9, -2.5, 5); sh.closePath();
  const c = new THREE.Mesh(new THREE.ExtrudeGeometry(sh, { depth: 2, bevelEnabled: false }), L(corCasco)); c.rotation.x = Math.PI / 2; c.position.y = 1.7; g.add(c);
  cx(g, L(0xf4f0e6), 4.5, 2.2, 14, 0, 2.8, -1.5); cx(g, L(0xf4f0e6), 4.3, 2.1, 12, 0, 5.1, -2);
  for (const s of [-1, 1]) for (let i = 0; i < 6; i++) { cx(g, VIDRO, 0.06, 0.9, 1.3, s * 2.26, 3.1, -7 + i * 2.2); cx(g, VIDRO, 0.06, 0.9, 1.3, s * 2.16, 5.3, -7 + i * 2); }
  cx(g, L(corTeto), 5, 0.25, 13.4, 0, 6.3, -2); cx(g, L(corCasco), 4.7, 0.2, 14.6, 0, 3.98, -1.5);
  return g;
}
// graneleiro de bauxita, como os que descem o Trombetas
export function navio() {
  const g = new THREE.Group(), L1 = 150, B = 13;
  const sh = new THREE.Shape(); sh.moveTo(-B, -L1 / 2); sh.lineTo(B, -L1 / 2); sh.lineTo(B, L1 / 2 - 22); sh.quadraticCurveTo(B * 0.7, L1 / 2 - 4, 0, L1 / 2); sh.quadraticCurveTo(-B * 0.7, L1 / 2 - 4, -B, L1 / 2 - 22); sh.closePath();
  const fundo = new THREE.Mesh(new THREE.ExtrudeGeometry(sh, { depth: 5, bevelEnabled: false }), L(0x8a2a22)); fundo.rotation.x = Math.PI / 2; fundo.position.y = 4; g.add(fundo);
  const casco = new THREE.Mesh(new THREE.ExtrudeGeometry(sh, { depth: 6, bevelEnabled: false }), L(0x1c2330)); casco.rotation.x = Math.PI / 2; casco.position.y = 10; g.add(casco);
  cx(g, L(0x7a3a2a), B * 2 - 2, 0.3, L1 - 30, 0, 10.1, 6);
  for (let i = 0; i < 6; i++) cx(g, L(0xa85a3a), B * 2 - 7, 1.6, 15, 0, 11, -34 + i * 17.5);
  cx(g, L(0xf2f0ea), B * 2 - 4, 13, 14, 0, 16.5, -L1 / 2 + 12); cx(g, VIDRO, B * 2 - 3.8, 1.6, 14.2, 0, 21, -L1 / 2 + 12); cx(g, L(0xf2f0ea), B * 2 + 4, 0.6, 9, 0, 23.2, -L1 / 2 + 13);
  cx(g, L(0xe8762a), 5, 9, 6, 0, 27, -L1 / 2 + 8); cx(g, ESC, 5.2, 1.6, 6.2, 0, 31, -L1 / 2 + 8);
  for (const z of [-20, 16, 50]) { cx(g, L(0xe8c23a), 1.2, 16, 1.2, B - 3, 18, z); cx(g, L(0xe8c23a), 1, 1, 18, B - 3, 25, z + 8, 0.25); }
  return g;
}

// monomotor de asa alta, como os que atendem o interior da Amazônia
export function aviao(cor = 0xff3d7f) {
  const g = new THREE.Group(), br = P(0xf6f5f0, 100), det = P(cor);
  perfil(g, [[-4.6, 1.5], [-1.2, 0.72], [2.3, 0.72], [3.4, 1.05], [3.55, 1.5], [2.2, 1.95], [1.5, 2.35], [-1.2, 2.3], [-4.6, 1.78]], 1.2, br, 0.14);
  perfil(g, [[1.5, 2.3], [2.15, 1.95], [1.2, 1.95], [1.15, 2.3]], 1.36, VIDRO, 0.02);
  for (const s of [-1, 1]) { cx(g, VIDRO, 0.04, 0.34, 1.6, s * 0.74, 1.95, 0.1); cx(g, det, 0.04, 0.14, 6.2, s * 0.745, 1.5, -0.6); }
  cx(g, br, 11.4, 0.16, 1.7, 0, 2.48, 0.5); cx(g, det, 1.2, 0.17, 1.72, -5.2, 2.48, 0.5); cx(g, det, 1.2, 0.17, 1.72, 5.2, 2.48, 0.5);
  for (const s of [-1, 1]) { const e = cx(g, ESC, 0.07, 1.9, 0.12, s * 1.55, 1.72, 0.5); e.rotation.z = s * 0.95; }
  cx(g, br, 4, 0.1, 1.05, 0, 1.72, -4.3);
  perfil(g, [[-4.75, 1.7], [-3.5, 1.76], [-4.2, 3.3], [-4.85, 3.35]], 0.1, det, 0.02);
  const nariz = new THREE.Mesh(new THREE.ConeGeometry(0.3, 0.6, 12).rotateX(Math.PI / 2), ESC); nariz.position.set(0, 1.36, 3.85); g.add(nariz);
  const helice = new THREE.Group(); helice.position.set(0, 1.36, 3.78);
  helice.add(new THREE.Mesh(new THREE.BoxGeometry(2.3, 0.16, 0.04), ESC), new THREE.Mesh(new THREE.BoxGeometry(0.16, 2.3, 0.04), ESC));
  const disco = new THREE.Mesh(new THREE.CircleGeometry(1.16, 20), new THREE.MeshBasicMaterial({ color: 0x888888, transparent: true, opacity: 0, side: THREE.DoubleSide, depthWrite: false })); helice.add(disco);
  g.add(helice); g.userData.helice = helice; g.userData.disco = disco;
  for (const [x, z] of [[-1.1, 0.9], [1.1, 0.9], [0, 2.9]]) { cx(g, ESC, 0.07, 0.75, 0.07, x * 0.8, 0.5, z); const w = new THREE.Mesh(new THREE.CylinderGeometry(0.26, 0.26, 0.16, 12).rotateZ(Math.PI / 2), BORR); w.position.set(x, 0.26, z); g.add(w); }
  return g;
}

// personagem genérico. "rosto" aceita uma textura (foto aprovada) para substituir o desenho.
export function rostoPadrao(oculos = true) {
  const c = document.createElement('canvas'); c.width = c.height = 128; const x = c.getContext('2d');
  x.clearRect(0, 0, 128, 128); x.lineCap = 'round';
  if (oculos) { x.fillStyle = '#16161c'; x.fillRect(18, 44, 38, 22); x.fillRect(72, 44, 38, 22); x.fillRect(54, 50, 20, 5); }
  else { x.fillStyle = '#1c1410'; x.beginPath(); x.arc(40, 54, 6, 0, 7); x.arc(88, 54, 6, 0, 7); x.fill(); x.strokeStyle = '#1c1410'; x.lineWidth = 4; x.beginPath(); x.moveTo(28, 40); x.lineTo(52, 38); x.moveTo(76, 38); x.lineTo(100, 40); x.stroke(); }
  x.strokeStyle = '#7a2e22'; x.lineWidth = 5; x.beginPath(); x.arc(64, 82, 20, 0.2 * Math.PI, 0.8 * Math.PI); x.stroke();
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; return t;
}
export function pessoa({ camisa = 0xf4f2ec, calca = 0x26324a, pele = 0xc48a5e, cabelo = 0x1e1612, rosto = null, oculos = true, chapeu = null } = {}) {
  const g = new THREE.Group(), mp = L(pele), mc = L(camisa), mk = L(calca);
  const membro = (mat, w, h, d, x, y, z) => { const p = new THREE.Group(); p.position.set(x, y, z); const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat); m.position.y = -h / 2; p.add(m); g.add(p); return p; };
  const pe = membro(mk, 0.17, 0.84, 0.19, -0.11, 0.86, 0), pd = membro(mk, 0.17, 0.84, 0.19, 0.11, 0.86, 0);
  cx(g, mc, 0.46, 0.62, 0.25, 0, 1.17, 0); cx(g, mk, 0.47, 0.1, 0.26, 0, 0.87, 0);
  const be = membro(mc, 0.13, 0.3, 0.15, -0.3, 1.45, 0), bd = membro(mc, 0.13, 0.3, 0.15, 0.3, 1.45, 0);
  for (const b of [be, bd]) { const a = new THREE.Mesh(new THREE.BoxGeometry(0.11, 0.34, 0.12), mp); a.position.y = -0.47; b.add(a); }
  cx(g, mp, 0.12, 0.1, 0.12, 0, 1.52, 0);
  const cab = new THREE.Mesh(new THREE.SphereGeometry(0.135, 14, 12), mp); cab.scale.set(0.92, 1.1, 1); cab.position.set(0, 1.68, 0); g.add(cab);
  const cb = new THREE.Mesh(new THREE.SphereGeometry(0.142, 14, 8, 0, Math.PI * 2, 0, Math.PI * 0.52), L(cabelo)); cb.scale.set(0.94, 1.08, 1.04); cb.position.set(0, 1.7, -0.012); cb.rotation.x = -0.25; g.add(cb);
  const face = new THREE.Mesh(new THREE.PlaneGeometry(0.2, 0.22), new THREE.MeshBasicMaterial({ map: rosto || rostoPadrao(oculos), transparent: true, depthWrite: false })); face.position.set(0, 1.675, 0.137); g.add(face);
  if (chapeu !== null) { const ch = new THREE.Mesh(new THREE.CylinderGeometry(0.15, 0.16, 0.1, 12), L(chapeu)); ch.position.set(0, 1.83, 0); g.add(ch); cx(g, L(chapeu), 0.2, 0.02, 0.16, 0, 1.79, 0.16); }
  const s = new THREE.Mesh(new THREE.CircleGeometry(0.34, 12).rotateX(-Math.PI / 2), SOMBRA); s.position.y = 0.03; g.add(s);
  g.userData = { pe, pd, be, bd, face, sombra: s };
  return g;
}
export function andar(g, fase, forca) { const u = g.userData, a = Math.sin(fase) * 0.7 * forca; u.pe.rotation.x = a; u.pd.rotation.x = -a; u.be.rotation.x = -a * 0.8; u.bd.rotation.x = a * 0.8; }

export function paraquedas() {
  const g = new THREE.Group();
  const geo = new THREE.SphereGeometry(1, 14, 6, 0, Math.PI * 2, 0, Math.PI * 0.5), n = geo.attributes.position.count, col = new Float32Array(n * 3), a = new THREE.Color(0xff3d7f), b = new THREE.Color(0x2de2e6), w = new THREE.Color(0xfff4e0);
  for (let i = 0; i < n; i++) { const ang = Math.atan2(geo.attributes.position.getZ(i), geo.attributes.position.getX(i)); const k = Math.floor((ang + Math.PI) / (Math.PI * 2) * 7.999) % 3; const c = k === 0 ? a : k === 1 ? w : b; col[3 * i] = c.r; col[3 * i + 1] = c.g; col[3 * i + 2] = c.b; }
  geo.setAttribute('color', new THREE.BufferAttribute(col, 3));
  const vela = new THREE.Mesh(geo, new THREE.MeshLambertMaterial({ vertexColors: true, side: THREE.DoubleSide })); vela.scale.set(3.4, 1.5, 2.5); vela.position.y = 5.6; g.add(vela);
  const pts = []; for (let i = 0; i < 8; i++) { const an = i / 8 * Math.PI * 2; pts.push(Math.cos(an) * 3.3, 5.7, Math.sin(an) * 2.4, (i % 2 ? 0.2 : -0.2), 1.5, 0); }
  const lg = new THREE.BufferGeometry(); lg.setAttribute('position', new THREE.Float32BufferAttribute(pts, 3)); g.add(new THREE.LineSegments(lg, new THREE.LineBasicMaterial({ color: 0xf0f0f0 })));
  return g;
}

// placa de texto que sempre olha para a câmera
export function etiqueta(texto, cor = '#ffe6c2') {
  const c = document.createElement('canvas'); c.width = 512; c.height = 96; const x = c.getContext('2d');
  x.font = '700 44px Arial, sans-serif'; const w = Math.min(500, x.measureText(texto).width + 40);
  x.fillStyle = 'rgba(20,10,38,.82)'; x.beginPath(); x.roundRect((512 - w) / 2, 14, w, 68, 34); x.fill();
  x.fillStyle = cor; x.textAlign = 'center'; x.textBaseline = 'middle'; x.fillText(texto, 256, 50, 470);
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace;
  const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: t, transparent: true, depthWrite: false, fog: false })); s.scale.set(8, 1.5, 1); return s;
}
// iate de passeio com flybridge
export function iate() {
  const g = new THREE.Group(), br = P(0xf6f5f0, 110);
  const sh = new THREE.Shape(); sh.moveTo(-2.1, -6.5); sh.lineTo(2.1, -6.5); sh.lineTo(2.2, 2); sh.quadraticCurveTo(1.6, 6, 0, 7.6); sh.quadraticCurveTo(-1.6, 6, -2.2, 2); sh.closePath();
  const c = new THREE.Mesh(new THREE.ExtrudeGeometry(sh, { depth: 1.9, bevelEnabled: false }), br); c.rotation.x = Math.PI / 2; c.position.y = 2.1; g.add(c);
  const f = new THREE.Mesh(new THREE.ExtrudeGeometry(sh, { depth: 0.3, bevelEnabled: false }), P(0x1c2a3a)); f.rotation.x = Math.PI / 2; f.position.y = 1.5; f.scale.set(1.02, 1.01, 1); g.add(f);
  cx(g, br, 3.6, 1.5, 6.4, 0, 2.85, -0.6); cx(g, VIDRO, 3.66, 0.7, 5.4, 0, 3.0, -0.4); cx(g, VIDRO, 3.2, 1.0, 0.1, 0, 2.9, 2.75, -0.6);
  cx(g, br, 3.2, 0.2, 4.4, 0, 3.7, -1.2); cx(g, br, 3.0, 0.7, 0.15, 0, 4.1, 0.9); cx(g, L(0x8a5a3a), 3.8, 0.06, 2.2, 0, 2.14, -5.3);
  cx(g, P(0x1c2a3a), 3.2, 0.1, 3.4, 0, 5.6, -1.6); for (const s of [-1, 1]) for (const z of [-3.1, 0]) cx(g, CROMO, 0.06, 1.8, 0.06, s * 1.5, 4.7, z);
  cx(g, CROMO, 0.08, 1.6, 0.08, 0, 6.4, -3);
  return g;
}
// navio de passageiros de quatro conveses, branco e azul, como os que fazem a linha do rio
export function navioPassageiros() {
  const g = new THREE.Group(), br = L(0xf4f3ee), az = L(0x2a6ad0);
  const sh = new THREE.Shape(); sh.moveTo(-5, -22); sh.lineTo(5, -22); sh.lineTo(5.2, 12); sh.quadraticCurveTo(3.6, 20, 0, 23); sh.quadraticCurveTo(-3.6, 20, -5.2, 12); sh.closePath();
  const c = new THREE.Mesh(new THREE.ExtrudeGeometry(sh, { depth: 3, bevelEnabled: false }), br); c.rotation.x = Math.PI / 2; c.position.y = 3; g.add(c);
  const fx = new THREE.Mesh(new THREE.ExtrudeGeometry(sh, { depth: 0.5, bevelEnabled: false }), az); fx.rotation.x = Math.PI / 2; fx.position.y = 1.6; fx.scale.set(1.02, 1.01, 1); g.add(fx);
  for (let d = 0; d < 3; d++) {
    const len = 36 - d * 5, y = 4.3 + d * 2.7, z = -3 - d * 1.5;
    cx(g, br, 9.2 - d * 0.5, 2.3, len, 0, y, z); cx(g, br, 10.4 - d * 0.5, 0.2, len + 2, 0, y + 1.3, z);
    for (const s of [-1, 1]) for (let i = 0; i < Math.floor(len / 3); i++) cx(g, VIDRO, 0.08, 1.2, 1.9, s * (4.62 - d * 0.25), y + 0.1, z - len / 2 + 2 + i * 3);
  }
  cx(g, az, 9.6, 6, 1.2, 0, 6.5, -22); cx(g, br, 6, 2.2, 7, 0, 12.6, 4); cx(g, VIDRO, 6.1, 1, 6.2, 0, 12.8, 4.4); cx(g, br, 0.3, 4, 0.3, 0, 15.6, 3);
  cx(g, L(0xd8443a), 8, 0.15, 16, 0, 13, -12);
  return g;
}
// rebocador de porto
export function rebocador() {
  const g = new THREE.Group();
  const sh = new THREE.Shape(); sh.moveTo(-4, -9); sh.quadraticCurveTo(0, -11.5, 4, -9); sh.lineTo(4.2, 4); sh.quadraticCurveTo(3, 10, 0, 11); sh.quadraticCurveTo(-3, 10, -4.2, 4); sh.closePath();
  const c = new THREE.Mesh(new THREE.ExtrudeGeometry(sh, { depth: 2.6, bevelEnabled: false }), L(0x15161c)); c.rotation.x = Math.PI / 2; c.position.y = 2.4; g.add(c);
  const d = new THREE.Mesh(new THREE.ExtrudeGeometry(sh, { depth: 0.2, bevelEnabled: false }), L(0x9aa0a8)); d.rotation.x = Math.PI / 2; d.position.y = 2.5; d.scale.set(0.9, 0.92, 1); g.add(d);
  cx(g, L(0xf2f0ea), 5, 2.2, 6.5, 0, 3.6, 0.5); cx(g, L(0x2a9ad8), 5.1, 0.5, 6.6, 0, 4.9, 0.5); cx(g, L(0xf2f0ea), 3.6, 2, 3.6, 0, 6.2, 1.2); cx(g, VIDRO, 3.7, 0.9, 3.7, 0, 6.5, 1.2); cx(g, L(0x2a9ad8), 4, 0.25, 4, 0, 7.3, 1.2);
  cx(g, L(0xf2f0ea), 0.25, 4.5, 0.25, 0, 9.6, 0.6); for (const s of [-1, 1]) cx(g, ESC, 0.5, 3, 0.5, s * 1.4, 5.6, -2.4);
  cx(g, L(0x8a8f96), 1.6, 1.2, 1.6, 0, 3.1, -5.5);
  return g;
}
// funde as peças paradas por material: bem menos chamadas de desenho por veículo
export function fundir(g, tudo = false) {
  const rodasG = tudo ? [] : (g.userData.rodas || []), pula = new Set(rodasG); if (g.userData.helice) pula.add(g.userData.helice);
  g.updateMatrixWorld(true); const inv = new THREE.Matrix4().copy(g.matrixWorld).invert(), por = new Map(), tirar = [];
  g.traverse(o => {
    if (!o.isMesh || o === g.userData.sombra) return; let p = o.parent; while (p && p !== g) { if (pula.has(p)) return; p = p.parent; } if (pula.has(o)) return;
    let geo = o.geometry.index ? o.geometry.toNonIndexed() : o.geometry.clone(); geo.applyMatrix4(new THREE.Matrix4().multiplyMatrices(inv, o.matrixWorld));
    for (const k of Object.keys(geo.attributes)) if (!['position', 'normal', 'uv'].includes(k)) geo.deleteAttribute(k);
    if (!por.has(o.material)) por.set(o.material, []); por.get(o.material).push(geo); tirar.push(o);
  });
  for (const o of tirar) o.parent.remove(o);
  if (tudo) { for (const r of g.userData.rodas || []) g.remove(r); g.userData.rodas = null; }
  for (const [mat, lista] of por) { const geo = mergeGeometries(lista, false); if (geo) g.add(new THREE.Mesh(geo, mat)); }
  return g;
}
export const CARROS = { fusca, uno, picapeG, kombi, picapeP, esportivo, suv, seda, van };
