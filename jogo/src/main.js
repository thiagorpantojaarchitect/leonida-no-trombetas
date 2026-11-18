import * as THREE from 'three';
import { MAP, rng, clamp, lerp, has, FLAGS, ring, bbox, area, pip, centroid, AGUA, PRED, ORLA, inWater, inBuilding, predioEm, distSeg, distOrla, orlaAt, streetName, snapRoad, fixUp, AERO } from './geo.js';
import { criarGrafo, acumulado, pontoEm } from './grafo.js';
import * as PF from './perfil.js';
import { criarFases, VEIC, TIPO, estrelas } from './fases.js';
import * as MOD from './modelos.js';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { RoomEnvironment } from 'three/examples/jsm/environments/RoomEnvironment.js';

// Pessoas reais só entram com autorização por escrito e foto aprovada por elas.
// Até lá, o personagem é genérico. Para ligar: ponha o caminho da foto aprovada em "rosto".
const PESSOAS = { prefeito: { rotulo: 'Prefeito Delegado Fonseca', modelo: 'prefeito' }, dama: { rotulo: 'Renata Fonseca', modelo: 'dama' } };
const AVATAR = { 'Prefeito Delegado Fonseca': 'prefeito', 'Renata Fonseca': 'dama' };
const LEVE = has('leve') || matchMedia('(pointer:coarse)').matches;

const $ = id => document.getElementById(id);
const G = criarGrafo(MAP.ruas, 5);
const { fases: FASES, P: LUG } = criarFases({ G, orlaAt, AERO });

// ---------- cena ----------
const canvas = $('c');
const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: 'high-performance' });
renderer.setPixelRatio(Math.min(devicePixelRatio || 1, LEVE ? 1.5 : 2));
renderer.toneMapping = THREE.ACESFilmicToneMapping; renderer.toneMappingExposure = 1.2;
renderer.shadowMap.enabled = !LEVE; renderer.shadowMap.type = THREE.PCFSoftShadowMap;
const TL = new THREE.TextureLoader();
function tex(nome, rx = 1, ry = rx) { const t = TL.load('tex/' + nome + '.jpg'); t.wrapS = t.wrapT = THREE.RepeatWrapping; t.repeat.set(rx, ry); t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 8; return t; }
const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(58, 1, 0.5, 20000);
scene.fog = new THREE.Fog(0xff8a5a, 250, 3200);
const hemi = new THREE.HemisphereLight(0xffc9d8, 0x3a2a4a, 1.0); scene.add(hemi);
const sun = new THREE.DirectionalLight(0xffb070, 2.2); scene.add(sun, sun.target);
sun.castShadow = !LEVE; sun.shadow.mapSize.set(2048, 2048); { const c = sun.shadow.camera; c.left = c.bottom = -150; c.right = c.top = 150; c.near = 10; c.far = 1200; sun.shadow.bias = -0.0006; sun.shadow.normalBias = 0.6; }
if (!LEVE) { const pm = new THREE.PMREMGenerator(renderer); scene.environment = pm.fromScene(new RoomEnvironment(), 0.04).texture; scene.environmentIntensity = 0.3; }
const SUN_DIR = new THREE.Vector3(-0.86, 0.16, 0.3).normalize();

const sky = new THREE.Mesh(new THREE.SphereGeometry(15000, 32, 16), new THREE.ShaderMaterial({
  side: THREE.BackSide, depthWrite: false, fog: false,
  uniforms: { top: { value: new THREE.Color() }, mid: { value: new THREE.Color() }, hor: { value: new THREE.Color() }, sunDir: { value: SUN_DIR }, sunCol: { value: new THREE.Color() }, sunAmt: { value: 1 } },
  vertexShader: 'varying vec3 d; void main(){ d = normalize(position); gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }',
  fragmentShader: `varying vec3 d; uniform vec3 top, mid, hor, sunDir, sunCol; uniform float sunAmt;
    void main(){ float h = clamp(d.y, 0.0, 1.0);
      vec3 c = mix(hor, mid, smoothstep(0.0, 0.22, h)); c = mix(c, top, smoothstep(0.18, 0.75, h));
      float s = max(dot(normalize(d), sunDir), 0.0);
      c += sunCol * (pow(s, 600.0) * 3.0 + pow(s, 24.0) * 0.55 + pow(s, 4.0) * 0.18) * sunAmt;
      gl_FragColor = vec4(c, 1.0); }`
}));
sky.renderOrder = -20; scene.add(sky);
let stars;
{
  const n = 900, p = new Float32Array(n * 3);
  for (let i = 0; i < n; i++) { const a = rng() * 6.283, y = 0.08 + rng() * 0.9, r = Math.sqrt(1 - y * y); p[3 * i] = Math.cos(a) * r * 14000; p[3 * i + 1] = y * 14000; p[3 * i + 2] = Math.sin(a) * r * 14000; }
  const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.BufferAttribute(p, 3));
  stars = new THREE.Points(g, new THREE.PointsMaterial({ color: 0xffffff, size: 2.2, sizeAttenuation: false, transparent: true, opacity: 0, fog: false, depthWrite: false }));
  scene.add(stars);
}
// ---------- modelos 3D (GLB gerados a partir das referências) ----------
const R90 = -Math.PI / 2, GIRO_PES = 0;
const MODS = { fusca: { len: 4.1, rot: Math.PI }, uno: { len: 4.4, rot: 0 }, picapeG: { len: 5.9, rot: R90 }, kombi: { len: 4.5, rot: R90 }, picapeP: { len: 4.5, rot: R90 }, esportivo: { len: 4.2, rot: R90 }, suv: { len: 4.4, rot: 0 }, seda: { len: 4.7, rot: R90 }, van: { len: 5.4, rot: R90 },
  lancha: { len: 9, rot: 0, afunda: 0.4 }, iate: { len: 15, rot: 0, afunda: 0.36 }, navioP: { arq: 'navio', len: 46, rot: 0, afunda: 0.2 }, aviao: { esc: 2.25, rot: -0.485 } };
const GLB = {}, ESPERA = {}, GL = new GLTFLoader();
// os modelos vão embutidos em arquivos .js (base64), que qualquer hospedagem serve
function carregarGLB(arq, ok) { const sc = document.createElement('script'); sc.src = 'modelos/' + arq + '.js'; sc.onload = () => { const b = atob(window.__GLB[arq]), u = new Uint8Array(b.length); for (let i = 0; i < b.length; i++) u[i] = b.charCodeAt(i); if (arq !== 'navio') delete window.__GLB[arq]; GL.parse(u.buffer, '', ok, () => { }); }; document.head.appendChild(sc); }
function aplicar(g, id, k) { if (g.userData.glb) return; for (const c of g.children) if (c !== g.userData.sombra && !c.isSprite) c.visible = false; const m = GLB[id].clone(); m.scale.multiplyScalar(k); g.add(m); g.userData.glb = m; g.userData.rodas = null; if (id === 'fusca') adesivo(g); }
let texAdesivo = null;
function adesivo(g) { // refaz o adesivo das portas, legível dos dois lados
  if (!texAdesivo) { const c = document.createElement('canvas'); c.width = 512; c.height = 256; const x = c.getContext('2d'); x.fillStyle = '#f4f3ee'; x.beginPath(); x.roundRect(4, 4, 504, 248, 40); x.fill(); x.textAlign = 'center'; x.textBaseline = 'middle'; x.fillStyle = '#16161c'; x.font = '900 118px Arial Black, Arial, sans-serif'; x.fillText('EU', 150, 82); x.font = '900 82px Arial Black, Arial, sans-serif'; x.fillText('ORIXIMINÁ', 256, 192); x.fillStyle = '#e0202c'; x.font = '150px Arial, sans-serif'; x.fillText('❤', 352, 86); texAdesivo = new THREE.CanvasTexture(c); texAdesivo.colorSpace = THREE.SRGBColorSpace; texAdesivo.anisotropy = 8; }
  for (const s of [-1, 1]) { const d = new THREE.Mesh(new THREE.PlaneGeometry(1.12, 0.66), new THREE.MeshLambertMaterial({ map: texAdesivo })); d.position.set(s * 0.8, 0.72, 0.02); d.rotation.y = s * Math.PI / 2; g.add(d); }
}
function vestir(g, id, k = 1) { if (has('blocos')) return g; (ESPERA[id] = ESPERA[id] || []).push([g, k]); if (GLB[id]) aplicar(g, id, k); return g; }
if (!has('blocos')) for (const id in MODS) carregarGLB(MODS[id].arq || id, gl => {
  const c = MODS[id], inner = gl.scene; inner.rotation.y = c.rot; inner.updateMatrixWorld(true);
  const b = new THREE.Box3().setFromObject(inner), sz = b.getSize(new THREE.Vector3()), ce = b.getCenter(new THREE.Vector3()), k = c.esc || c.len / Math.max(sz.x, sz.z);
  inner.position.set(-ce.x, -b.min.y - (c.afunda || 0) * sz.y, -ce.z);
  inner.traverse(o => { if (o.isMesh) { o.castShadow = true; o.material.metalness = 0.12; o.material.roughness = 0.5; } });
  const g = new THREE.Group(); g.add(inner); g.scale.setScalar(k); GLB[id] = g; (ESPERA[id] || []).forEach(([x, kk]) => aplicar(x, id, kk));
});
// personagens com esqueleto e animação
const semDeslize = clip => { if (clip) for (const t of clip.tracks) if (/Hips\.position$/.test(t.name)) for (let i = 0; i < t.values.length; i += 3) { t.values[i] = t.values[0]; t.values[i + 2] = t.values[2]; } return clip; };
function pessoaGLB(arq, pronto, anda) { if (has('blocos')) return; carregarGLB(arq, gl => {
  const sc = gl.scene; sc.traverse(o => { if (o.isMesh) { o.castShadow = true; o.frustumCulled = false; o.material.metalness = 0; o.material.roughness = 0.8; } });
  const clip = semDeslize(gl.animations[0]);
  const mix = new THREE.AnimationMixer(sc), act = clip ? mix.clipAction(clip) : null; if (act) act.play(); mix.update(0);
  sc.updateMatrixWorld(true); const b = new THREE.Box3().setFromObject(sc); const w = new THREE.Group(); sc.position.y = -b.min.y; w.add(sc); pronto(w, mix, act, b);
  if (anda) carregarGLB(anda, g2 => { const c2 = semDeslize(g2.animations[0]); if (!c2) return; const a2 = mix.clipAction(c2); a2.play(); a2.setEffectiveWeight(0); w.userData.anda = a2; w.userData.parado = act; });
}); }

const ground = new THREE.Mesh(new THREE.PlaneGeometry(60000, 60000), new THREE.MeshLambertMaterial({ color: 0xffffff, map: tex('grama', 24000) }));
ground.receiveShadow = true; ground.rotation.x = -Math.PI / 2; ground.position.y = -0.05; ground.material.depthWrite = false; ground.renderOrder = -12; scene.add(ground);
let RO = -11; const addFlat = m => { m.receiveShadow = true; m.material.depthWrite = false; m.renderOrder = RO; RO += 0.25; scene.add(m); return m; };

function flatGeo(polys, y) {
  const pos = [];
  for (const a of polys) {
    const pts = []; for (let i = 0; i < a.length; i += 2) pts.push(new THREE.Vector2(a[i], a[i + 1]));
    let tris; try { tris = THREE.ShapeUtils.triangulateShape(pts, []); } catch (e) { continue; }
    for (const t of tris) for (const k of t) pos.push(pts[k].x, y, pts[k].y);
  }
  fixUp(pos);
  const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  const nrm = new Float32Array(pos.length); for (let i = 1; i < nrm.length; i += 3) nrm[i] = 1; g.setAttribute('normal', new THREE.BufferAttribute(nrm, 3)); g.setAttribute('uv', uvPlano(pos, 2.5));
  return g;
}
function uvPlano(pos, m) { const u = new Float32Array(pos.length / 3 * 2); for (let i = 0, k = 0; i < pos.length; i += 3) { u[k++] = pos[i] / m; u[k++] = pos[i + 2] / m; } return new THREE.BufferAttribute(u, 2); }
const waterMat = new THREE.MeshPhongMaterial({ color: 0x24465a, specular: 0xff9a66, shininess: 90, side: THREE.DoubleSide });
const uAgua = { value: 0 };
waterMat.onBeforeCompile = sh => { sh.uniforms.uT = uAgua;
  sh.vertexShader = sh.vertexShader.replace('#include <common>', '#include <common>\nvarying vec3 vWP;').replace('#include <begin_vertex>', '#include <begin_vertex>\nvWP = (modelMatrix * vec4(position, 1.0)).xyz;');
  sh.fragmentShader = sh.fragmentShader.replace('#include <common>', '#include <common>\nvarying vec3 vWP; uniform float uT;').replace('#include <normal_fragment_begin>', '#include <normal_fragment_begin>\nfloat wa = sin(vWP.x * 0.31 + uT * 1.3) + sin(vWP.z * 0.23 - uT * 0.9 + vWP.x * 0.11) + 0.5 * sin(vWP.x * 1.3 + vWP.z * 1.7 + uT * 2.1); float wb = cos(vWP.z * 0.37 + uT * 1.1) + sin(vWP.x * 0.19 + uT * 0.7) + 0.5 * cos(vWP.x * 1.9 - vWP.z * 1.1 + uT * 1.7); normal = normalize(normal + vec3(wa, wb, 0.0) * 0.045);'); };
addFlat(new THREE.Mesh(flatGeo(AGUA, 0.02), waterMat));
const verdeMat = new THREE.MeshLambertMaterial({ color: 0x9ad08a, map: tex('grama'), side: THREE.DoubleSide });
addFlat(new THREE.Mesh(flatGeo(MAP.verde.filter(v => v[0] !== 'wood' && v[0] !== 'scrub').map(v => ring(v[1])).filter(a => a.length >= 6), 0.04), verdeMat));
const mataMat = new THREE.MeshLambertMaterial({ color: 0x5a9a5a, map: tex('grama'), side: THREE.DoubleSide });
const MATAS = MAP.verde.filter(v => v[0] === 'wood' || v[0] === 'scrub').map(v => ring(v[1])).filter(a => a.length >= 6);
addFlat(new THREE.Mesh(flatGeo(MATAS, 0.03), mataMat));

function ribbon(lines, y, colorFn) {
  const pos = [], col = [];
  lines.forEach((ln) => {
    const a = ln.a, w = ln.w / 2, n = a.length / 2; if (n < 2) return;
    const L = [], R = [];
    for (let i = 0; i < n; i++) {
      const p = Math.max(0, i - 1), q = Math.min(n - 1, i + 1);
      let tx = a[2 * q] - a[2 * p], tz = a[2 * q + 1] - a[2 * p + 1]; const l = Math.hypot(tx, tz) || 1; tx /= l; tz /= l;
      L.push([a[2 * i] - tz * w, a[2 * i + 1] + tx * w]); R.push([a[2 * i] + tz * w, a[2 * i + 1] - tx * w]);
    }
    const c = colorFn(ln);
    for (let i = 0; i < n - 1; i++) { const v = [L[i], R[i], R[i + 1], L[i], R[i + 1], L[i + 1]]; for (const p of v) { pos.push(p[0], y, p[1]); col.push(c.r, c.g, c.b); } }
  });
  fixUp(pos);
  const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); g.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
  const nrm = new Float32Array(pos.length); for (let i = 1; i < nrm.length; i += 3) nrm[i] = 1; g.setAttribute('normal', new THREE.BufferAttribute(nrm, 3)); g.setAttribute('uv', uvPlano(pos, 6));
  return g;
}
const flatMat = new THREE.MeshLambertMaterial({ vertexColors: true, side: THREE.DoubleSide });
const roadMat = new THREE.MeshLambertMaterial({ vertexColors: true, side: THREE.DoubleSide, map: tex('asfalto') }), deckMat = new THREE.MeshLambertMaterial({ color: 0xffffff, side: THREE.DoubleSide, map: tex('piso', 2.4) }), pierMat = new THREE.MeshLambertMaterial({ color: 0xffffff, side: THREE.DoubleSide, map: tex('deck', 1.5) });
const cAsfT = new THREE.Color(0xc8c6cc), cCalT = new THREE.Color(0xf4efe6), cPistaT = new THREE.Color(0x9a98a0), cAsf = new THREE.Color(0x4a4552), cCal = new THREE.Color(0x9a959c), cDeck = new THREE.Color(0xd8a078), cPier = new THREE.Color(0x8a5a3a), cFaixa = new THREE.Color(0xffd23a), cBranco = new THREE.Color(0xf2f2f2), cPista = new THREE.Color(0x34323a);
addFlat(new THREE.Mesh(ribbon(MAP.ruas.filter(r => r[0] >= 6 && r[3] !== 'aero').map(r => ({ a: r[1], w: r[0] + 3.6 })), 0.05, () => cCalT), roadMat));   // calçadas
addFlat(new THREE.Mesh(ribbon(MAP.ruas.map(r => ({ a: r[1], w: r[0] })), 0.07, l => l.w < 5 ? cCalT : cAsfT), roadMat));
addFlat(new THREE.Mesh(ribbon(MAP.ruas.filter(r => r[0] >= 9).map(r => ({ a: r[1], w: 0.35 })), 0.09, () => cFaixa), flatMat));
const orlaFlat = ORLA.flat();
addFlat(new THREE.Mesh(ribbon([{ a: orlaFlat, w: 17 }], 0.32, () => cDeck), deckMat));
addFlat(new THREE.Mesh(ribbon([{ a: orlaFlat, w: 0.5 }], 0.34, () => cFaixa), flatMat));
addFlat(new THREE.Mesh(ribbon(MAP.pier.map(a => ({ a, w: 4 })), 0.5, () => cPier), pierMat));
// aeroporto
{
  const pa = MAP.aero.pista, d = AERO.dir, px = -d[1], pz = d[0], pt = AERO.patio;
  addFlat(new THREE.Mesh(ribbon([{ a: [pt[0] - d[0] * 70, pt[1] - d[1] * 70, pt[0] + d[0] * 70, pt[1] + d[1] * 70], w: 110 }].concat(MAP.aero.taxi.map(a => ({ a, w: 14 }))), 0.08, () => cAsfT), roadMat));
  addFlat(new THREE.Mesh(ribbon([{ a: pa, w: AERO.larg }], 0.1, () => cPistaT), roadMat));
  const tr = []; for (let s = 40; s < AERO.len - 40; s += 60) tr.push({ a: [AERO.B[0] + d[0] * s, AERO.B[1] + d[1] * s, AERO.B[0] + d[0] * (s + 30), AERO.B[1] + d[1] * (s + 30)], w: 0.9 });
  for (const e of [AERO.B, AERO.A]) for (let k = -5; k <= 5; k++) { if (!k) continue; const s = e === AERO.B ? 8 : -38, ox = e[0] + px * k * 2.4, oz = e[1] + pz * k * 2.4; tr.push({ a: [ox + d[0] * s, oz + d[1] * s, ox + d[0] * (s + 30), oz + d[1] * (s + 30)], w: 1.2 }); }
  addFlat(new THREE.Mesh(ribbon(tr, 0.12, () => cBranco), flatMat));
}

if (has('log')) console.log('M0', Math.round(performance.now()));
// prédios: paredes com janelas, telhados de quatro águas nas casas
const winPts = [];
function texFachada() {
  const mk = () => { const c = document.createElement('canvas'); c.width = c.height = 256; return c; };
  const c = mk(), x = c.getContext('2d'); x.fillStyle = '#fff'; x.fillRect(0, 0, 256, 256);
  for (let i = 0; i < 500; i++) { x.fillStyle = `rgba(${rng() < 0.5 ? 0 : 90},60,40,${rng() * 0.05})`; x.fillRect(rng() * 256, rng() * 256, 4 + rng() * 40, 2 + rng() * 10); }
  x.fillStyle = 'rgba(0,0,0,.14)'; x.fillRect(0, 236, 256, 20); x.fillStyle = 'rgba(0,0,0,.08)'; x.fillRect(0, 0, 256, 8);
  x.fillStyle = '#3a4654'; x.fillRect(78, 62, 100, 112); x.strokeStyle = '#ece8df'; x.lineWidth = 7; x.strokeRect(78, 62, 100, 112);
  x.lineWidth = 4; x.beginPath(); x.moveTo(128, 62); x.lineTo(128, 174); x.moveTo(78, 112); x.lineTo(178, 112); x.stroke();
  x.fillStyle = '#d8d3c8'; x.fillRect(70, 176, 116, 9); x.fillStyle = 'rgba(160,200,230,.28)'; x.fillRect(84, 68, 40, 40);
  const e = mk(), y = e.getContext('2d'); y.fillStyle = '#000'; y.fillRect(0, 0, 256, 256); y.fillStyle = '#ffc878'; y.fillRect(84, 68, 88, 100); y.fillStyle = '#000'; y.fillRect(126, 68, 4, 100);
  return [c, e].map(k => { const t = new THREE.CanvasTexture(k); t.wrapS = t.wrapT = THREE.RepeatWrapping; t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 4; return t; });
}
const [texPar, texLuz] = texFachada();
const cityMat = new THREE.MeshLambertMaterial({ vertexColors: true, side: THREE.DoubleSide, map: tex('parede'), emissive: 0x3a2c1c, emissiveIntensity: 0 });
const lojaMat = new THREE.MeshLambertMaterial({ vertexColors: true, side: THREE.DoubleSide, map: tex('loja'), emissive: 0x3a2c1c, emissiveIntensity: 0 });
const roofMat = new THREE.MeshLambertMaterial({ vertexColors: true, side: THREE.DoubleSide, map: tex('telha') });
{
  const WALL = [0xfff4e0, 0xf6e2b8, 0x9ccbee, 0x7ab8e0, 0xffd878, 0xf8b090, 0xf08a98, 0xb0e6c8, 0xffffff, 0xdcd6ec, 0x74a6e0, 0xfffaf0].map(c => new THREE.Color(c));
  const ROOF = [0xffffff, 0xf2dcd0, 0xe6e6e6, 0xd8ccc4, 0xffe8d8, 0xc8c8d0].map(c => new THREE.Color(c));
  let pos = [], col = [], uv = []; const rp = [], rc0 = [], A = [pos, col, uv], B = [[], [], []];
  PRED.forEach((p) => {
    const r = rng(); const h = p.h || (r < 0.68 ? 3.2 + rng() * 1.4 : r < 0.94 ? 6 + rng() * 1.6 : 9 + rng() * 3.5);
    const a = p.a, n = a.length / 2, wc = WALL[Math.floor(rng() * WALL.length)], rc = ROOF[Math.floor(rng() * ROOF.length)], V = Math.max(1, Math.round(h / 3.2));
    [pos, col, uv] = (V === 1 && area(a) > 60 && rng() < 0.3) ? B : A;
    for (let i = 0; i < n; i++) {
      const j = (i + 1) % n, x0 = a[2 * i], z0 = a[2 * i + 1], x1 = a[2 * j], z1 = a[2 * j + 1], len = Math.hypot(x1 - x0, z1 - z0), U = Math.max(1, Math.round(len / 4));
      pos.push(x0, 0, z0, x1, 0, z1, x1, h, z1, x0, 0, z0, x1, h, z1, x0, h, z0); uv.push(0, 0, U, 0, U, V, 0, 0, U, V, 0, V);
      const s = 0.82 + 0.18 * Math.abs((z1 - z0) / (len || 1));
      for (let k = 0; k < 6; k++) { const d = (k === 0 || k === 1 || k === 3) ? 0.82 : 1; col.push(wc.r * s * d, wc.g * s * d, wc.b * s * d); }
    }
    const r0 = rp.length, ar = area(a);
    if (n <= 6 && ar < 320 && ar > 16 && rng() < 0.8) {            // telhado de quatro águas
      const c = centroid(a), rh = 0.9 + rng() * 0.9; p.hh = h + rh;
      for (let i = 0; i < n; i++) { const j = (i + 1) % n; rp.push(a[2 * i], h, a[2 * i + 1], a[2 * j], h, a[2 * j + 1], c[0], h + rh, c[1]); const s = 0.78 + 0.22 * Math.abs(Math.sin(i * 1.7 + 0.4)); for (let k = 0; k < 3; k++) rc0.push(rc.r * s, rc.g * s, rc.b * s); }
    } else {
      p.hh = h; const pts = []; for (let i = 0; i < a.length; i += 2) pts.push(new THREE.Vector2(a[i], a[i + 1]));
      let tris = []; try { tris = THREE.ShapeUtils.triangulateShape(pts, []); } catch (e) { }
      for (const t of tris) for (const k of t) { rp.push(pts[k].x, h, pts[k].y); rc0.push(rc.r, rc.g, rc.b); }
    }
    fixUp(rp, r0);
    if (rng() < 0.4) { const c = centroid(a); winPts.push(c[0], h * 0.55, c[1]); }
  });
  for (const [L, mat] of [[A, cityMat], [B, lojaMat]]) { const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(L[0], 3)); g.setAttribute('color', new THREE.Float32BufferAttribute(L[1], 3)); g.setAttribute('uv', new THREE.Float32BufferAttribute(L[2], 2)); g.computeVertexNormals(); const m = new THREE.Mesh(g, mat); m.castShadow = m.receiveShadow = true; scene.add(m); }
  const g2 = new THREE.BufferGeometry(); g2.setAttribute('position', new THREE.Float32BufferAttribute(rp, 3)); g2.setAttribute('color', new THREE.Float32BufferAttribute(rc0, 3)); g2.computeVertexNormals(); g2.setAttribute('uv', uvPlano(rp, 3.5));
  { const m = new THREE.Mesh(g2, roofMat); m.castShadow = true; scene.add(m); }
}
function glowTex() { const c = document.createElement('canvas'); c.width = c.height = 64; const x = c.getContext('2d'); const g = x.createRadialGradient(32, 32, 0, 32, 32, 32); g.addColorStop(0, 'rgba(255,255,255,1)'); g.addColorStop(0.3, 'rgba(255,255,255,.55)'); g.addColorStop(1, 'rgba(255,255,255,0)'); x.fillStyle = g; x.fillRect(0, 0, 64, 64); return new THREE.CanvasTexture(c); }
const GLOW = glowTex();
function points(arr, color, size, colors) {
  const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(arr, 3));
  if (colors) g.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3));
  const p = new THREE.Points(g, new THREE.PointsMaterial({ color, size, map: GLOW, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, vertexColors: !!colors, fog: true })); scene.add(p); return p;
}
const winLights = points(winPts, 0xffc070, 9);

// instâncias
const M4 = new THREE.Matrix4(), Q = new THREE.Quaternion(), V = new THREE.Vector3(), S = new THREE.Vector3(), UP = new THREE.Vector3(0, 1, 0);
function inst(geo, mat, list, cores) { // list: [x,y,z,rotY,sx,sy,sz]
  const m = new THREE.InstancedMesh(geo, mat, list.length);
  list.forEach((t, i) => { Q.setFromAxisAngle(UP, t[3] || 0); V.set(t[0], t[1], t[2]); S.set(t[4] || 1, t[5] || 1, t[6] || 1); M4.compose(V, Q, S); m.setMatrixAt(i, M4); if (cores) m.setColorAt(i, cores[i]); });
  scene.add(m); return m;
}
const white = new THREE.MeshLambertMaterial({ color: 0xf6f4ee }), LM = c => new THREE.MeshLambertMaterial({ color: c });
const OBST = [], oStart = orlaAt(0.42);
// orla: postes de bandeirola, guarda-corpo, palmeiras
const lampPts = [], lampCols = [], poles = [], rails = [], palms = [], penPos = [];
let orlaLen = 0; for (let i = 0; i < ORLA.length - 1; i++) orlaLen += Math.hypot(ORLA[i + 1][0] - ORLA[i][0], ORLA[i + 1][1] - ORLA[i][1]);
for (let d = 6; d < orlaLen - 4; d += 2.6) { const o = orlaAt(d / orlaLen); rails.push([o.x + o.nx * 8, 0.85, o.z + o.nz * 8, 0, 1, 1, 1]); }
for (let d = 12, k = 0; d < orlaLen - 8; d += 26, k++) {
  const o = orlaAt(d / orlaLen), x = o.x + o.nx * 6.2, z = o.z + o.nz * 6.2;
  poles.push([x, 4.8, z, 0, 1, 1, 1]);
  lampPts.push(x - o.nx * 1.6, 9.3, z - o.nz * 1.6); lampCols.push(1, 0.93, 0.8);
  if (k % 2 === 0) { lampPts.push(x, 6.4, z); lampCols.push(k % 4 ? 0.2 : 1, k % 4 ? 1 : 0.15, 0.2); }
  const ax = x - o.nx * 0.2, az = z - o.nz * 0.2; penPos.push(ax, 9.4, az, ax, 7.6, az, ax - o.nx * 1.7, 9.1, az - o.nz * 1.7);
  if (k % 2 === 1) palms.push([o.x - o.nx * 6.5, 0, o.z - o.nz * 6.5, rng() * 6, 1, 0.9 + rng() * 0.4, 1]);
}
inst(new THREE.CylinderGeometry(0.11, 0.15, 9.6, 6), white, poles);
inst(new THREE.BoxGeometry(0.12, 1.1, 0.12), white, rails);
{
  const o = ORLA.map((p, i) => { const q = orlaAt(i / (ORLA.length - 1)); return [q.x + q.nx * 8, q.z + q.nz * 8]; }).flat();
  const railMat = new THREE.MeshLambertMaterial({ color: 0xf6f4ee, side: THREE.DoubleSide });
  for (const y of [1.38, 0.9]) scene.add(new THREE.Mesh(ribbon([{ a: o, w: 0.16 }], y, () => new THREE.Color(1, 1, 1)), railMat));
  const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(penPos, 3)); g.computeVertexNormals(); scene.add(new THREE.Mesh(g, railMat));
}
inst(new THREE.CylinderGeometry(0.16, 0.24, 7, 6).translate(0, 3.5, 0), LM(0x8a6a4a), palms);
{ const fr = []; for (const p of palms) for (let i = 0; i < 7; i++) fr.push([p[0], 6.9 * p[5], p[2], p[3] + i * 0.9, 1, 1, 1]); const g = new THREE.SphereGeometry(1, 8, 5).scale(0.42, 0.1, 1.7).translate(0, 0, 1.6); g.rotateX(0.35); inst(g, new THREE.MeshLambertMaterial({ color: 0x3f8a4a }), fr); }
const lampGlow = points(lampPts, 0xffffff, 7, lampCols);
// quiosques
{
  const list = [0.2, 0.47, 0.72].map(t => { const o = orlaAt(t); OBST.push([o.x - o.nx * 6, o.z - o.nz * 6, 4.2]); return [o.x - o.nx * 6, 1.9, o.z - o.nz * 6, Math.atan2(o.tx, o.tz)]; });
  inst(new THREE.BoxGeometry(4, 3.2, 8), LM(0xe8703a), list);
  inst(new THREE.BoxGeometry(5.4, 0.3, 9.6).translate(0, 1.8, 0), LM(0x7a4a2a), list);
}
const pSign = orlaAt(0.33), pTree = orlaAt(0.58), pCais = orlaAt(0.96), pEst = orlaAt(0.1), pPort = orlaAt(0.5), pPark = orlaAt(0.4);
{ // letreiro EU ❤ ORIXIMINÁ
  const c = document.createElement('canvas'); c.width = 1024; c.height = 400; const x = c.getContext('2d');
  x.textAlign = 'center'; x.textBaseline = 'middle'; x.shadowColor = 'rgba(255,255,255,.9)'; x.shadowBlur = 18;
  x.fillStyle = '#fff'; x.font = '900 150px Arial Black, Arial, sans-serif'; x.fillText('EU', 400, 110); x.fillText('ORIXIMINÁ', 512, 290);
  x.shadowColor = 'rgba(255,40,60,.9)'; x.fillStyle = '#ff2a3c'; x.font = '170px Arial, sans-serif'; x.fillText('❤', 610, 108);
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace;
  const m = new THREE.Mesh(new THREE.PlaneGeometry(13, 5.1), new THREE.MeshBasicMaterial({ map: t, transparent: true, side: THREE.DoubleSide, fog: false, depthWrite: false }));
  m.position.set(pSign.x + pSign.nx * 3, 3.1, pSign.z + pSign.nz * 3); m.rotation.y = Math.atan2(-pSign.nx, -pSign.nz); scene.add(m);
  const b = new THREE.Mesh(new THREE.BoxGeometry(13, 0.5, 1.2), white); b.position.set(m.position.x, 0.55, m.position.z); b.rotation.y = m.rotation.y; scene.add(b);
  OBST.push([pSign.x + pSign.nx * 3, pSign.z + pSign.nz * 3, 3]);
}
const treeMat = new THREE.MeshLambertMaterial({ color: 0x7ee04a, emissive: 0x2a7a10, flatShading: true });
let treeGlow;
{ // árvore de Natal
  const t = new THREE.Mesh(new THREE.ConeGeometry(5.5, 17, 9), treeMat); t.position.set(pTree.x, 8.8, pTree.z); scene.add(t);
  const lp = [], lc = [];
  for (let i = 0; i < 120; i++) { const u = i / 120, a = u * 38, r = 5.6 * (1 - u) + 0.15; lp.push(pTree.x + Math.cos(a) * r, 0.6 + u * 16.5, pTree.z + Math.sin(a) * r); const k = i % 3; lc.push(k === 0 ? 1 : 0.4, k === 1 ? 1 : 0.5, k === 2 ? 1 : 0.3); }
  lp.push(pTree.x, 18, pTree.z); lc.push(0.8, 0.5, 1); treeGlow = points(lp, 0xffffff, 3.2, lc); OBST.push([pTree.x, pTree.z, 6.2]);
}
{ // estátua na rotatória, portais de madeira, espreguiçadeiras e parquinho (pelas referências enviadas)
  const add = (geo, mat, x, y, z, ry = 0) => { const m = new THREE.Mesh(geo, mat); m.position.set(x, y, z); m.rotation.y = ry; scene.add(m); return m; };
  const ex = pEst.x - pEst.nx * 15, ez = pEst.z - pEst.nz * 15, ry = Math.atan2(pEst.tx, pEst.tz);
  add(new THREE.CylinderGeometry(5.5, 5.8, 0.5, 20), LM(0x8a8088), ex, 0.3, ez); add(new THREE.CylinderGeometry(4.6, 4.6, 0.3, 20), LM(0x4f9a4a), ex, 0.62, ez);
  add(new THREE.BoxGeometry(2, 2.6, 2), LM(0xd8a040), ex, 1.8, ez, ry); add(new THREE.BoxGeometry(2.3, 0.2, 2.3), LM(0x2a2430), ex, 3.15, ez, ry);
  add(new THREE.CylinderGeometry(0.42, 0.72, 3.1, 10), LM(0xf2ece0), ex, 4.8, ez); add(new THREE.CylinderGeometry(0.5, 0.76, 1.7, 10, 1, false, 0, 3.6), LM(0xc0302a), ex, 4.3, ez, ry);
  add(new THREE.SphereGeometry(0.34, 10, 8), LM(0xc89a78), ex, 6.6, ez); add(new THREE.SphereGeometry(0.37, 10, 8, 0, 6.3, 0, 1.7), LM(0x4a3020), ex, 6.66, ez);
  const br = add(new THREE.BoxGeometry(0.22, 0.22, 1.2), LM(0xf2ece0), ex + Math.sin(ry) * 0.6 + Math.cos(ry) * 0.5, 5.5, ez + Math.cos(ry) * 0.6 - Math.sin(ry) * 0.5, ry); br.rotation.x = 0.3;
  OBST.push([ex, ez, 6]);
  const wood = LM(0xb8623a), px = pPort.x - pPort.nx * 4, pz = pPort.z - pPort.nz * 4, py = Math.atan2(pPort.tx, pPort.tz);
  [[6.5, 0], [5.6, 1.6], [4.6, 3.2], [3.6, 4.8]].forEach(([h, d]) => { const cxp = px + pPort.tx * d, czp = pz + pPort.tz * d; for (const s of [-1, 1]) add(new THREE.BoxGeometry(0.5, h, 0.5), wood, cxp - pPort.nx * s * 2.2, h / 2 + 0.3, czp - pPort.nz * s * 2.2, py); add(new THREE.BoxGeometry(0.5, 0.5, 4.9), wood, cxp, h + 0.3, czp, py + Math.PI / 2); });
  for (let i = 0; i < 4; i++) { const m = add(new THREE.BoxGeometry(0.8, 0.12, 2), wood, px - pPort.tx * (3 + i * 1.3) + pPort.nx * 3, 0.75, pz - pPort.tz * (3 + i * 1.3) + pPort.nz * 3, Math.atan2(pPort.nx, pPort.nz)); m.rotation.x = -0.28; }
  const qx = pPark.x - pPark.nx * 3, qz = pPark.z - pPark.nz * 3;
  add(new THREE.BoxGeometry(7, 0.08, 5), LM(0x4f9a4a), qx, 0.38, qz, py); for (const s of [-1, 1]) { add(new THREE.BoxGeometry(0.2, 2.6, 0.2), wood, qx + pPark.tx * s * 2, 1.6, qz + pPark.tz * s * 2); } add(new THREE.BoxGeometry(0.2, 0.2, 4.4), wood, qx, 2.9, qz, py); add(new THREE.ConeGeometry(1.5, 1, 4), LM(0x8a4a2a), qx + pPark.tx * 2, 3.4, qz + pPark.tz * 2, py + 0.78);
}
{ // barcos de linha atracados nos píeres
  let k = 0;
  MAP.pier.forEach((a, i) => {
    const n = a.length / 2; let ex = a[0], ez = a[1], ox = a[2 * n - 2], oz = a[2 * n - 1];
    if (!inWater(ex, ez) && inWater(ox, oz)) { [ex, ez, ox, oz] = [ox, oz, ex, ez]; }
    if (!inWater(ex, ez)) return;
    const ang = Math.atan2(ex - ox, ez - oz), sx = Math.cos(ang), sz = -Math.sin(ang), side = i % 2 ? 1 : -1;
    const x = ex + sx * 5.5 * side - Math.sin(ang) * 6, z = ez + sz * 5.5 * side - Math.cos(ang) * 6;
    if (!inWater(x, z) || k++ > 9) return;
    const b = vestir(MOD.fundir(MOD.barcoLinha([0x2f6fc0, 0xf2f0ea, 0x3a8a5a][i % 3], [0xb8443a, 0x3a70b0, 0xd87a3a][i % 3]), true), 'navioP', 0.5); b.position.set(x, has('blocos') ? -0.9 : 0, z); b.rotation.y = ang; b.scale.setScalar(0.85); scene.add(b);
  });
}
{ // árvores nas matas e em volta do aeroporto
  const list = [];
  for (const a of MATAS) { const b = bbox(a), n = Math.min(60, Math.floor(area(a) / 260)); for (let i = 0, t = 0; i < n && t < n * 6; t++) { const x = lerp(b[0], b[2], rng()), z = lerp(b[1], b[3], rng()); if (pip(a, x, z) && !inBuilding(x, z)) { const s = 0.8 + rng() * 0.9; list.push([x, 0, z, 0, s, s, s]); i++; } } }
  for (let i = 0; i < 700; i++) { const s0 = rng() * (AERO.len + 600) - 300, lado = (rng() < 0.5 ? -1 : 1) * (90 + rng() * 520), x = AERO.B[0] + AERO.dir[0] * s0 - AERO.dir[1] * lado, z = AERO.B[1] + AERO.dir[1] * s0 + AERO.dir[0] * lado; if (Math.hypot(x - AERO.patio[0], z - AERO.patio[1]) < 150 || Math.hypot(x - AERO.term[0], z - AERO.term[1]) < 60) continue; const s = 1 + rng() * 1.4; list.push([x, 0, z, 0, s, s, s]); }
  inst(new THREE.CylinderGeometry(0.25, 0.35, 3, 5).translate(0, 1.5, 0), LM(0x6a4a32), list);
  { const cs = list.map(() => new THREE.Color().setHSL(0.27 + rng() * 0.08, 0.5, 0.26 + rng() * 0.12)); const g1 = new THREE.IcosahedronGeometry(3, 1).scale(1, 0.85, 1); inst(g1.clone().translate(0, 5, 0), new THREE.MeshLambertMaterial({ color: 0xffffff }), list, cs); }
  const t = new THREE.Mesh(new THREE.BoxGeometry(34, 6, 14), LM(0xf2f0ea)); t.position.set(AERO.term[0], 3, AERO.term[1]); t.rotation.y = AERO.h; scene.add(t);
  const r = new THREE.Mesh(new THREE.BoxGeometry(37, 0.5, 17), LM(0x3a70b0)); r.position.set(AERO.term[0], 6.2, AERO.term[1]); r.rotation.y = AERO.h; scene.add(r);
  const e = MOD.etiqueta('AEROPORTO DE ORIXIMINÁ'); e.position.set(AERO.term[0], 10, AERO.term[1]); e.scale.set(26, 4.9, 1); scene.add(e); OBST.push([AERO.term[0], AERO.term[1], 19]);
}
{ // postes de luz com fiação nas ruas da cidade
  const ps = [], fios = [];
  for (const r of MAP.ruas) { if (r[0] < 7 || r[3] === 'aero') continue; const a = r[1], p = []; for (let i = 0; i < a.length; i += 2) p.push([a[i], a[i + 1]]); const acc = acumulado(p), T = acc[acc.length - 1]; let ant = null;
    for (let d = 12; d < T - 8 && ps.length < 1400; d += 38) { const q = pontoEm(p, acc, d), x = q.x + Math.cos(q.h) * (r[0] / 2 + 1.3), z = q.z - Math.sin(q.h) * (r[0] / 2 + 1.3); if (inBuilding(x, z) || distOrla(x, z) < 12 || Math.abs(x) > 2300 || Math.abs(z) > 2300) { ant = null; continue; } ps.push([x, 4, z, q.h]); if (ant) for (const o of [-0.7, 0.7]) fios.push(ant[0] + Math.cos(ant[2]) * o, 7.7, ant[1] - Math.sin(ant[2]) * o, x + Math.cos(q.h) * o, 7.7, z - Math.sin(q.h) * o); ant = [x, z, q.h]; } }
  inst(new THREE.CylinderGeometry(0.11, 0.15, 8, 6), LM(0x8a8580), ps); inst(new THREE.BoxGeometry(1.7, 0.1, 0.1).translate(0, 3.7, 0), LM(0x5a5550), ps);
  const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(fios, 3)); scene.add(new THREE.LineSegments(g, new THREE.LineBasicMaterial({ color: 0x1a1a1e, transparent: true, opacity: 0.7 })));
}
{ // gente na orla
  const corpo = [], cab = [], cores = [], pal = [0xff3d7f, 0x2de2e6, 0xf2f2ee, 0xffd23a, 0x3a70b0, 0x7ee04a, 0xe8703a, 0x8a4ac0].map(c => new THREE.Color(c));
  for (let i = 0; i < 80; i++) { const o = orlaAt(0.03 + rng() * 0.94), d = -5 + rng() * 11, x = o.x + o.nx * d, z = o.z + o.nz * d; if (OBST.some(b => Math.hypot(x - b[0], z - b[1]) < b[2] + 1) || Math.hypot(x - oStart.x, z - oStart.z) < 13) continue; const s = 0.9 + rng() * 0.2; corpo.push([x, 0.32, z, rng() * 6.3, s, s, s]); cab.push([x, 0.32 + 1.6 * s, z, 0, s, s, s]); cores.push(pal[Math.floor(rng() * pal.length)]); }
  inst(new THREE.CapsuleGeometry(0.2, 1.05, 4, 10).translate(0, 0.73, 0), new THREE.MeshLambertMaterial({ color: 0xffffff }), corpo, cores);
  inst(new THREE.SphereGeometry(0.15, 8, 6), LM(0xc48a5e), cab);
}


if (has('log')) console.log('M1', Math.round(performance.now()));
// ---------- jogador e veículos ----------
const VS = {};
function veic(id, kind, m, x, z, h, o) { vestir(m, id); const v = Object.assign({ id, kind, m, x, z, h, v: 0, y: 0, vy: 0, thr: 0, nome: VEIC[id].nome, home: [x, z, h] }, o); scene.add(m); VS[id] = v; return v; }
const vaga = (t, d) => { const o = orlaAt(t), n = G.perto(o.x - o.nx * d, o.z - o.nz * d), q = n.e[0][0]; return [n.x, n.z, Math.atan2(q.x - n.x, q.z - n.z)]; };
const car = veic('fusca', 'car', MOD.fusca(0xf7f5ef, true), oStart.x - oStart.nx * 2, oStart.z - oStart.nz * 2, Math.atan2(oStart.tx, oStart.tz), { max: 30, acc: 15, turn: 1.9, cam: [10.5, 4.2] });
veic('uno', 'car', MOD.uno(), ...vaga(0.3, 26), { max: 31, acc: 14, turn: 2.0, cam: [10.5, 4.3] });
veic('picapeG', 'car', MOD.picapeG(), ...vaga(0.16, 30), { max: 36, acc: 15, turn: 1.6, cam: [13.5, 5.4] });
veic('kombi', 'car', MOD.kombi(), ...vaga(0.56, 28), { max: 26, acc: 11, turn: 1.7, cam: [12.5, 5.2] });
veic('picapeP', 'car', MOD.picapeP(), ...vaga(0.7, 26), { max: 34, acc: 16, turn: 1.9, cam: [11.5, 4.6] });
veic('esportivo', 'car', MOD.esportivo(), ...vaga(0.44, 30), { max: 46, acc: 22, turn: 2.1, cam: [10.5, 3.8] });
veic('suv', 'car', MOD.suv(), ...vaga(0.86, 26), { max: 35, acc: 15, turn: 1.8, cam: [11.5, 4.8] });
veic('seda', 'car', MOD.seda(), ...vaga(0.08, 30), { max: 37, acc: 16, turn: 1.9, cam: [11, 4.3] });
veic('van', 'car', MOD.van(), ...vaga(0.93, 40), { max: 29, acc: 12, turn: 1.6, cam: [13.5, 5.6] });
const boat = veic('lancha', 'boat', MOD.lancha(), oStart.x + oStart.nx * 14, oStart.z + oStart.nz * 14, Math.atan2(oStart.tx, oStart.tz), { max: 26, acc: 10, turn: 1.15, cam: [15, 5.5] });
const iate = veic('iate', 'boat', MOD.iate(), orlaAt(0.66).x + orlaAt(0.66).nx * 17, orlaAt(0.66).z + orlaAt(0.66).nz * 17, Math.atan2(orlaAt(0.66).tx, orlaAt(0.66).tz), { max: 21, acc: 6, turn: 0.8, cam: [26, 9] });
const BOATS = [boat, iate]; BOATS.forEach(b => MOD.fundir(b.m, true));
const plane = veic('aviao', 'plane', MOD.aviao(), AERO.patio[0], AERO.patio[1], AERO.h, { max: 72, acc: 11, turn: 0.85, cam: [24, 8] });
MOD.fundir(plane.m);
const planeSombra = new THREE.Mesh(new THREE.PlaneGeometry(11, 9).rotateX(-Math.PI / 2), new THREE.MeshBasicMaterial({ color: 0, transparent: true, opacity: 0.28, depthWrite: false })); planeSombra.renderOrder = 2; scene.add(planeSombra);
const CARS = Object.values(VS).filter(v => v.kind === 'car'); CARS.forEach(v => MOD.fundir(v.m));
const pedM = MOD.pessoa({ camisa: 0xf7f5ef, calca: 0x1f2a44, oculos: true });
let pedMix = null, damaMix = null, pedAnda = null;
// dois personagens jogáveis: quem não está no controle fica de pé na orla
const FIG = { prefeito: {}, dama: {} }; let jog = 'prefeito';
try { const g = localStorage.getItem('orx_jog'); if (g === 'dama' || g === 'prefeito') jog = g; } catch (e) {}
if (has('dama')) jog = 'dama';
const damaG = new THREE.Group(); scene.add(damaG); let rotuloNPC = null;
function vestirPessoas() {
  const npc = jog === 'prefeito' ? 'dama' : 'prefeito', J = FIG[jog], N = FIG[npc];
  for (const k of ['prefeito', 'dama']) for (const t of ['parado', 'anda']) { const f = FIG[k][t]; if (f && f.w.parent) f.w.parent.remove(f.w); }
  if (J.parado) { J.parado.w.visible = true; pedM.add(J.parado.w); } if (J.anda) { J.anda.w.visible = false; pedM.add(J.anda.w); }
  if (N.parado) { N.parado.w.visible = true; damaG.add(N.parado.w); }
  for (const c of pedM.children) if (c !== pedM.userData.sombra && c !== chute && !c.userData.pes) c.visible = !J.parado;
  pedMix = J.parado ? J.parado.mix : null; pedAnda = J.anda || null; damaMix = N.parado ? N.parado.mix : null;
  if (rotuloNPC) damaG.remove(rotuloNPC); rotuloNPC = MOD.etiqueta(PESSOAS[npc].rotulo); rotuloNPC.position.y = 2.15; rotuloNPC.scale.set(3.2, 0.6, 1); damaG.add(rotuloNPC);
  const c = $('cena'); if (c) c.innerHTML = jog === 'prefeito' ? '<b>Prefeito Delegado Fonseca</b><span>e a primeira-dama Renata Fonseca · Oriximiná</span>' : '<b>Renata Fonseca</b><span>primeira-dama, com o Prefeito Delegado Fonseca · Oriximiná</span>';
  const bt = $('bTroca'); if (bt) bt.textContent = jog === 'prefeito' ? 'Jogar com Renata' : 'Jogar com o Prefeito';
}
function trocarPersonagem(quem) {
  if (cut || salto) return; const novo = quem || (jog === 'prefeito' ? 'dama' : 'prefeito'); if (novo === jog) return;
  jog = novo; try { localStorage.setItem('orx_jog', jog); } catch (e) {}
  vestirPessoas(); toast('Você agora é ' + PESSOAS[jog].rotulo + (cur === ped ? '' : ' · ao volante: ' + cur.nome), 2.4);
}
for (const k of ['prefeito', 'dama']) {
  pessoaGLB(k, (w, mix, act) => { w.userData.pes = true; w.rotation.y = GIRO_PES; FIG[k].parado = { w, mix, act }; vestirPessoas(); });
  pessoaGLB(k + '_anda', (w, mix, act) => { w.userData.pes = true; w.rotation.y = GIRO_PES; FIG[k].anda = { w, mix, act }; vestirPessoas(); });
}
const chute = MOD.paraquedas(); chute.visible = false; pedM.add(chute); chute.isSprite = true;
const ped = { id: 'ped', kind: 'ped', m: pedM, x: car.x + Math.cos(car.h) * 3.2, z: car.z - Math.sin(car.h) * 3.2, h: car.h, v: 0, y: 0, vy: 0, fase: 0, cam: [6.5, 3.1], nome: 'A pé' };
scene.add(pedM);
damaG.position.set(ped.x + Math.sin(car.h) * 1.6, 0.32, ped.z + Math.cos(car.h) * 1.6); damaG.rotation.y = car.h + Math.PI * 0.5; vestirPessoas();
let cur = ped, salto = null;
const wake = []; { const g = new THREE.CircleGeometry(1.6, 16).rotateX(-Math.PI / 2); for (let i = 0; i < 26; i++) { const m = new THREE.Mesh(g, new THREE.MeshBasicMaterial({ color: 0xffffff, map: GLOW, transparent: true, opacity: 0, depthWrite: false })); m.position.y = 0.06; scene.add(m); wake.push({ m, t: 9 }); } }
let wakeI = 0, wakeT = 0;

if (has('log')) console.log('M2', Math.round(performance.now()));
// ---------- vida na cidade: navio, barcos, trânsito e avião de carreira ----------
const navio = MOD.fundir(MOD.navio(), true); navio.position.y = -6; scene.add(navio);
const reboc = MOD.fundir(MOD.rebocador(), true); scene.add(reboc);
const rota = (pts) => { const p = pts.map(([t, d]) => { const o = orlaAt(t); return [o.x + o.nx * d, o.z + o.nz * d]; }); return { p, acc: acumulado(p) }; };
const tn = orlaAt(0.5), NAV = { a: [tn.x + tn.nx * 520 - tn.tx * 2600, tn.z + tn.nz * 520 - tn.tz * 2600], b: [tn.x + tn.nx * 520 + tn.tx * 2600, tn.z + tn.nz * 520 + tn.tz * 2600], u: 0.42 };
const NPCB = [[MOD.voadeira(), rota([[0.05, 70], [0.5, 150], [0.95, 90], [0.5, 240], [0.05, 70]]), 9, 0], [MOD.voadeira(), rota([[0.9, 200], [0.4, 330], [0.1, 180], [0.5, 90], [0.9, 200]]), 11, 300], [vestir(MOD.navioPassageiros(), 'navioP'), rota([[0.02, 300], [0.98, 340], [0.5, 470], [0.02, 300]]), 5, 500], [vestir(MOD.iate(), 'iate'), rota([[0.1, 520], [0.9, 600], [0.5, 700], [0.1, 520]]), 9, 900], [vestir(MOD.lancha(0x2de2e6), 'lancha'), rota([[0.3, 400], [0.8, 180], [0.6, 480], [0.3, 400]]), 15, 100]].map(([m, r, sp, s]) => { MOD.fundir(m, true); scene.add(m); return { m, r, sp, s }; });
const TRAF = [];
{
  const nos = G.nosP.filter(n => Math.abs(n.x) < 1600 && Math.abs(n.z) < 1500 && n.e.length > 1), tipos = ['uno', 'suv', 'seda', 'kombi', 'picapeG', 'van', 'esportivo', 'picapeP'], cores = [0xd8d8d2, 0x9aa0a8, 0xe8c23a, 0xf2f2ee, 0x7a1420, 0x2a6ab0, 0x2f8a5a, 0x1c1c22];
  for (let i = 0; i < 8; i++) { const a = nos[Math.floor(rng() * nos.length)], m = vestir(MOD.fundir(MOD.CARROS[tipos[i]](cores[i]), true), tipos[i]); scene.add(m); TRAF.push({ m, a, b: a.e[0][0], u: 0, sp: 8 + rng() * 5, x: a.x, z: a.z }); }
  // carros estacionados na avenida da orla
  [[0.24, 'picapeP', 0x9aa0a8], [0.36, 'uno', 0xc23a2a], [0.5, 'picapeG', 0xf2f2ee], [0.64, 'fusca', 0x3a8ac0], [0.8, 'uno', 0xd8d8d2]].forEach(([t, k, c]) => { const o = orlaAt(t), m = vestir(MOD.fundir(MOD.CARROS[k](c), true), k); m.position.set(o.x - o.nx * 12.5, 0.07, o.z - o.nz * 12.5); m.rotation.y = Math.atan2(o.tx, o.tz) + (rng() < 0.5 ? Math.PI : 0); scene.add(m); OBST.push([m.position.x, m.position.z, 2.3]); });
}
const jato = vestir(MOD.fundir(MOD.aviao(0x2de2e6)), 'aviao'); jato.scale.setScalar(1.6); scene.add(jato); jato.userData.disco.material.opacity = 0.35;

// ---------- cartões-postais (com as artes enviadas) ----------
const CPS = [];
function cp(nome, x, z, kind, img) { CPS.push({ id: 'c' + CPS.length, nome, x, z, kind, img, done: false }); }
cp('EU ❤ ORIXIMINÁ', pSign.x - pSign.nx * 2, pSign.z - pSign.nz * 2, 'terra', 'orla');
cp('Árvore de Natal da orla', pTree.x - pTree.tx * 9, pTree.z - pTree.tz * 9, 'terra', 'pordosol');
cp('Portais de madeira do deck', pPort.x - pPort.tx * 6, pPort.z - pPort.tz * 6, 'terra', 'deck');
cp('Estátua da rotatória', pEst.x - pEst.nx * 6, pEst.z - pEst.nz * 6, 'terra', 'estatua');
cp('Cais da orla', pCais.x, pCais.z, 'terra', 'comunidade');
{ const p = snapRoad(-395, -520); cp('Porto de Oriximiná', p[0], p[1], 'terra', 'praia'); }
{ const p = snapRoad(29.8, 56.4); cp('Praça Santo Antônio', p[0], p[1], 'terra', 'mural2'); }
{ const p = snapRoad(-271, -290); cp('Praça da Saudade', p[0], p[1], 'terra', 'fonte'); }
{ const p = snapRoad(416, -276); cp('Estádio do Bauxitão', p[0], p[1], 'terra', 'mural1'); }
{ const p = snapRoad(1003, 258); cp('Parque Centenário', p[0], p[1], 'terra', 'lago'); }
{ const p = snapRoad(848, 1025); cp('Prefeitura de Oriximiná', p[0], p[1], 'terra', 'riacho'); }
{ const o = orlaAt(0.5); cp('Pôr do sol no rio Trombetas', o.x + o.nx * 380, o.z + o.nz * 380, 'boat', 'corredeira'); }
{ let x = -470, z = -600; while (!inWater(x, z) && x > -900) x -= 10; cp('Barcos de linha no porto', x - 60, z, 'boat', 'cachoeira'); }
const cpGeo = new THREE.TorusGeometry(6, 0.35, 8, 28).rotateX(Math.PI / 2), beamGeo = new THREE.CylinderGeometry(1.2, 1.2, 60, 10, 1, true).translate(0, 30, 0);
const beamMat = c => new THREE.MeshBasicMaterial({ color: c, transparent: true, opacity: 0.28, side: THREE.DoubleSide, depthWrite: false, blending: THREE.AdditiveBlending, fog: false });
CPS.forEach(c => {
  c.g = new THREE.Group(); c.g.position.set(c.x, 1.2, c.z); c.g.scale.setScalar(0.55);
  c.g.add(new THREE.Mesh(cpGeo, new THREE.MeshBasicMaterial({ color: 0xffd23a, fog: false })), new THREE.Mesh(beamGeo, beamMat(0xffd23a))); scene.add(c.g);
});

if (has('log')) console.log('M3', Math.round(performance.now()));
// ---------- progresso salvo ----------
let SAVE = { f: {}, c: [] };
try { const s = JSON.parse(localStorage.getItem('orx_v2') || 'null'); if (s && s.f) SAVE = s; } catch (e) { }
const salvar = () => { try { localStorage.setItem('orx_v2', JSON.stringify(SAVE)); } catch (e) { } };
if (has('tudo')) FASES.forEach(f => { SAVE.f[f.id] = SAVE.f[f.id] || { e: 1, t: 0 }; });
CPS.forEach(c => { if (SAVE.c.includes(c.id)) { c.done = true; c.g.visible = false; } });
const nFeitas = () => FASES.filter(f => SAVE.f[f.id]).length, nEstrelas = () => FASES.reduce((s, f) => s + (SAVE.f[f.id] ? SAVE.f[f.id].e : 0), 0);
const liberada = f => f.n <= nFeitas() + 3;

// ---------- hora do dia ----------
const HORAS = ['tarde', 'por', 'noite'], HORA_NOME = { tarde: 'Tarde', por: 'Pôr do sol', noite: 'Noite' };
let hora = has('night') ? 'noite' : has('por') ? 'por' : 'tarde', fogBase = 3400;
function applyTime() {
  const u = sky.material.uniforms, n = hora === 'noite';
  if (hora === 'tarde') {
    SUN_DIR.set(-0.55, 0.62, 0.3).normalize();
    u.top.value.set(0x1f5fc8); u.mid.value.set(0x6fb0f0); u.hor.value.set(0xe8f0f8); u.sunCol.value.set(0xfff4d8); u.sunAmt.value = 0.8;
    scene.fog.color.set(0xcfe2f4); scene.fog.near = 400; fogBase = 5200;
    hemi.color.set(0xffffff); hemi.groundColor.set(0x6a7a5a); hemi.intensity = 1.45; sun.color.set(0xfff0d8); sun.intensity = 2.3;
    waterMat.color.set(0x3a6f8a); waterMat.specular.set(0xffffff); ground.material.color.set(0xffffff);
  } else if (hora === 'por') {
    SUN_DIR.set(-0.86, 0.16, 0.3).normalize();
    u.top.value.set(0x2b1a5e); u.mid.value.set(0xe0457f); u.hor.value.set(0xffa04a); u.sunCol.value.set(0xffd9a0); u.sunAmt.value = 1;
    scene.fog.color.set(0xf08a5a); scene.fog.near = 300; fogBase = 3400;
    hemi.color.set(0xffc4d4); hemi.groundColor.set(0x4a3050); hemi.intensity = 1.25; sun.color.set(0xffa860); sun.intensity = 2.4;
    waterMat.color.set(0x35506a); waterMat.specular.set(0xffa070); ground.material.color.set(0xf0c8a0);
  } else {
    SUN_DIR.set(0.4, 0.8, -0.3).normalize();
    u.top.value.set(0x05030f); u.mid.value.set(0x140a26); u.hor.value.set(0x3a1f5a); u.sunCol.value.set(0xbfd0ff); u.sunAmt.value = 0.25;
    scene.fog.color.set(0x1a0f30); scene.fog.near = 150; fogBase = 2400;
    hemi.color.set(0x5a6ab0); hemi.groundColor.set(0x1a1028); hemi.intensity = 0.75; sun.color.set(0x8090ff); sun.intensity = 0.5;
    waterMat.color.set(0x0c1830); waterMat.specular.set(0x6070c0); ground.material.color.set(0x55507a);
  }
  sun.castShadow = !LEVE && !n;
  cityMat.emissiveIntensity = lojaMat.emissiveIntensity = n ? 1 : 0; stars.material.opacity = n ? 0.9 : 0; winLights.visible = n; lampGlow.material.size = n ? 5 : 2.4; treeGlow.material.size = n ? 3 : 1.8; treeMat.emissive.set(n ? 0x3aa018 : 0x1a4a0a);
  $('bHora').textContent = HORA_NOME[HORAS[(HORAS.indexOf(hora) + 1) % 3]];
}

// ---------- fases ----------
function mkAnel(cor) {
  const g = new THREE.Group(), chao = new THREE.Group(); chao.add(new THREE.Mesh(cpGeo, new THREE.MeshBasicMaterial({ color: cor, fog: false })), new THREE.Mesh(beamGeo, beamMat(cor)));
  const ar = new THREE.Mesh(new THREE.TorusGeometry(1, 0.07, 8, 40), new THREE.MeshBasicMaterial({ color: cor, fog: false })); g.add(chao, ar); g.userData = { chao, ar }; g.visible = false; scene.add(g); return g;
}
const anel = mkAnel(0xff3d7f), anel2 = mkAnel(0x7a5a8a), alvoM = mkAnel(0xffd23a);
function porAnel(g, c, h = 0) {
  if (!c) { g.visible = false; return; } g.visible = true; const u = g.userData;
  if (c.y) { g.position.set(c.x, c.y, c.z); u.ar.visible = true; u.chao.visible = false; u.ar.scale.setScalar(c.r); g.rotation.y = h; }
  else { g.position.set(c.x, 0.5, c.z); u.chao.visible = true; u.ar.visible = false; u.chao.scale.set(c.r / 6, 1, c.r / 6); g.rotation.y = 0; }
}
// marcas de largada no mundo
FASES.forEach((f, i) => { if (VEIC[f.veic].kind === 'plane') { const k = FASES.filter(q => VEIC[q.veic].kind === 'plane').indexOf(f); f.marc = [AERO.patio[0] + AERO.dir[0] * (k - 4) * 15 + AERO.dir[1] * 30, AERO.patio[1] + AERO.dir[1] * (k - 4) * 15 - AERO.dir[0] * 30]; } else f.marc = [f.start.x, f.start.z]; });
const marcas = new THREE.Group(); scene.add(marcas);
const CORT = { tempo: 0x2de2e6, corrida: 0xff3d7f, entrega: 0xffd23a, voo: 0x7ee04a, salto: 0xb07aff };
function refazerMarcas() {
  marcas.clear();
  FASES.filter(f => liberada(f) && !SAVE.f[f.id]).slice(0, 5).forEach((f, i) => {
    const g = new THREE.Group(); g.position.set(f.marc[0], 0, f.marc[1]); g.userData.f = f;
    const r = new THREE.Mesh(cpGeo, new THREE.MeshBasicMaterial({ color: CORT[f.tipo], fog: false })); r.position.y = 0.7; r.scale.setScalar(0.75); g.add(r, new THREE.Mesh(beamGeo, beamMat(CORT[f.tipo])));
    const e = MOD.etiqueta('FASE ' + f.n + ' · ' + f.nome); e.position.y = 6.5; g.add(e);
    if (VEIC[f.veic].kind !== 'boat') { const p = MOD.pessoa({ camisa: [0xff3d7f, 0x2de2e6, 0xffd23a, 0x7ee04a, 0xe8703a][f.n % 5], calca: 0x2a2a34, pele: [0xc48a5e, 0x9a6a44, 0xd8a47a][f.n % 3], oculos: false, chapeu: f.n % 2 ? 0x2a2a34 : null }); p.position.set(5.6, 0.07, 0); p.rotation.y = -Math.PI / 2; g.add(p); }
    marcas.add(g);
  });
}
let M = null, cool = 0, horaAntes = null;
const rivalG = new THREE.Group(); rivalG.visible = false; scene.add(rivalG);
function porVeiculo(v, x, z, h, y = 0, vel = 0) { v.x = x; v.z = z; v.h = h; v.y = y; v.vy = 0; v.v = vel; v.thr = vel ? 0.8 : 0; }
function iniciar(f) {
  fecharMapa(); fecharCartaz(); salto = null; chute.visible = false; ped.y = 0;
  const v = VS[f.veic]; cur = v; pedM.visible = false;
  if (f.ar) porVeiculo(v, f.ar.x, f.ar.z, f.ar.h, f.ar.y, 55); else porVeiculo(v, f.start.x, f.start.z, f.start.h);
  if (f.noite && hora !== 'noite') { horaAntes = hora; hora = 'noite'; applyTime(); }
  M = { f, st: 'intro', t: 0, i: 0, tempo: f.tempo, rel: 0, par: 0, sP: 0, acc: acumulado(f.path), rs: 6, fora: false };
  rivalG.clear(); rivalG.visible = false;
  if (f.tipo === 'corrida') { const rid = f.veic === 'esportivo' ? 'esportivo' : ['uno', 'picapeP', 'seda', 'suv'][f.n % 4], m = VEIC[f.veic].kind === 'boat' ? MOD.voadeira() : vestir(MOD.fundir(MOD.CARROS[rid](0xffd23a), true), rid); const e = MOD.etiqueta(f.quem, '#ffd23a'); e.position.y = 4; e.scale.set(5.5, 1.03, 1); rivalG.add(m, e); rivalG.visible = true; }
  if (f.alvo) porAnel(alvoM, { x: f.alvo.x, z: f.alvo.z, r: f.alvo.r }); else alvoM.visible = false;
  $('objT').textContent = objetivoDe(f); $('obj').classList.add('on'); marcas.visible = false; for (const c of CPS) c.g.visible = false;
  atualizarAneis(); camera.position.set(v.x - Math.sin(v.h) * 30, v.y + 14, v.z - Math.cos(v.h) * 30);
  cartaz({ k: 'Fase ' + f.n + ' · ' + TIPO[f.tipo] + ' · ' + VEIC[f.veic].nome, t: f.nome, quem: f.quem, p: '“' + f.fala + '”', obj: objetivoDe(f), nota: f.tipo === 'corrida' ? 'Chegue antes de ' + f.quem + '.' : f.tipo === 'salto' ? 'Salte com E e pouse a até ' + f.alvo.r + ' m do alvo amarelo.' : f.tipo === 'entrega' ? 'Pare dentro de cada anel até a entrega terminar. Tempo: ' + f.tempo + ' s.' : 'Tempo: ' + f.tempo + ' s.', botoes: [['Começar', () => { fecharCartaz(); M.st = 'conta'; M.t = 0; }, 1], ['Sair', () => encerrar()]] });
  if (has('auto')) { fecharCartaz(); M.st = 'run'; }
}
function atualizarAneis() {
  if (!M) { anel.visible = anel2.visible = false; return; } const c = M.f.cps, i = M.i, p = M.f.path;
  const dir = k => { const a = k ? c[k - 1] : { x: p[0][0], z: p[0][1] }; return Math.atan2(c[k].x - a.x, c[k].z - a.z); };
  porAnel(anel, c[i], c[i] ? dir(i) : 0); porAnel(anel2, c[i + 1], c[i + 1] ? dir(i + 1) : 0);
}
function encerrar() { M = null; marcas.visible = true; for (const c of CPS) c.g.visible = !c.done; $('obj').classList.remove('on'); $('fala').classList.remove('on'); atualizarAneis(); alvoM.visible = false; rivalG.visible = false; fecharCartaz(); cool = 4; if (horaAntes) { hora = horaAntes; horaAntes = null; applyTime(); } if (cur !== plane && plane.y > 0) porVeiculo(plane, ...plane.home); refazerMarcas(); hudFase(); }
function fim(ok, msg, res = {}) {
  if (!M || M.st === 'fim') return; const f = M.f; M.st = 'fim';
  let e = 0, novo = false;
  if (ok) { e = estrelas(f, res); const a = SAVE.f[f.id]; novo = !a; premiar((novo ? 60 : 0) + Math.max(0, e - (a ? a.e : 0)) * 40); if (!a || e > a.e || (e === a.e && res.tempo < a.t)) SAVE.f[f.id] = { e, t: +(res.tempo || 0).toFixed(1) }; salvar(); }
  const prox = FASES[f.n], tot = nFeitas();
  const bt = []; if (ok && prox && liberada(prox)) bt.push(['Próxima fase', () => iniciar(prox), 1]); bt.push(['Repetir', () => iniciar(f), ok ? 0 : 1], ['Mapa', () => { encerrar(); abrirMapa(); }], ['Continuar livre', () => encerrar()]);
  cartaz({ k: ok ? 'Fase ' + f.n + ' concluída' : 'Não foi dessa vez', t: ok ? '★'.repeat(e) + '☆'.repeat(3 - e) : f.nome, p: msg, nota: ok ? (tot === 30 ? 'Você zerou Leonida no Trombetas! Tira um print e marca @diariodeleonidabr.' : tot + ' de 30 fases · ' + nEstrelas() + ' estrelas') : 'Dica: ' + (f.tipo === 'corrida' ? 'freie antes das curvas e corte por dentro dos anéis.' : f.tipo === 'voo' ? 'Espaço sobe, Shift desce. Mantenha a velocidade acima de 100 km/h.' : f.tipo === 'salto' ? 'salte um pouco antes do alvo e use A/D para girar o paraquedas.' : 'siga a linha rosa do minimapa.'), botoes: bt });
}
function passoFase(dt) {
  const f = M.f, v = cur;
  if (M.st === 'intro') { v.v = f.ar ? 55 : 0; return; }
  if (M.st === 'conta') { M.t += dt; if (!f.ar) v.v = 0; const n = 3 - Math.floor(M.t); toast(n > 0 ? String(n) : 'JÁ!', 0.9); if (M.t >= 3) { M.st = 'run'; proximoPasso(true); } return; }
  if (M.st !== 'run') return;
  M.rel += dt; M.tempo -= dt;
  const c = f.cps[M.i];
  if (c && (v === VS[f.veic])) {
    const d = Math.hypot(c.x - v.x, c.z - v.z), dentro = c.y ? (d < c.r && Math.abs(c.y - v.y) < c.r) : d < c.r;
    if (dentro && c.parar) { if (Math.abs(v.v) < 2.5) { M.par += dt; if (M.par >= 1.6) { M.par = 0; M.i++; atualizarAneis(); toast('Entrega ' + M.i + ' de ' + f.cps.length, 1.4); proximoPasso(false); } } }
    else if (dentro) { M.i++; atualizarAneis(); proximoPasso(false); }
    else M.par = 0;
  }
  if (f.tipo === 'corrida') {
    const q = pontoEm(f.path, M.acc, M.rs), q2 = pontoEm(f.path, M.acc, M.rs + 14); let dh = Math.abs(q2.h - q.h); if (dh > Math.PI) dh = 2 * Math.PI - dh;
    M.rs += f.rivalV * (1 - 0.5 * clamp(dh / 1.0, 0, 1)) * dt;
    rivalG.position.set(q.x, VEIC[f.veic].kind === 'boat' ? -0.3 : 0.07, q.z); let d = q.h - rivalG.rotation.y; while (d > Math.PI) d -= 6.283; while (d < -Math.PI) d += 6.283; rivalG.rotation.y += d * Math.min(1, dt * 6);
    if (M.rs >= f.len) return fim(false, f.quem + ' chegou primeiro.');
  }
  if (f.tipo !== 'salto' && M.i >= f.cps.length) return fim(true, f.tipo === 'corrida' ? 'Você venceu ' + f.quem + ' em ' + M.rel.toFixed(1) + ' s.' : 'Tempo: ' + M.rel.toFixed(1) + ' s de ' + f.tempo + ' s.', { tempo: f.tipo === 'corrida' ? M.rel * 0.8 : M.rel });
  if (f.tipo !== 'corrida' && M.tempo <= 0) return fim(false, 'O tempo acabou.');
}
function pousoSalto(x, z) { if (!M || M.f.tipo !== 'salto' || M.st !== 'run') return; const f = M.f, d = Math.hypot(x - f.alvo.x, z - f.alvo.z); if (M.i < f.cps.length) return fim(false, 'Faltou passar pelos anéis antes de saltar.'); if (d <= f.alvo.r) fim(true, 'Pouso a ' + d.toFixed(0) + ' m do centro do alvo.', { dist: d, tempo: M.rel }); else fim(false, 'Você pousou a ' + d.toFixed(0) + ' m do alvo. O limite é ' + f.alvo.r + ' m.'); }


// ---------- objetivo da fase e comentário a cada ponto conquistado ----------
let falaT = 0;
function fala(q, t, seg = 6) { $('falaQ').textContent = q; $('falaT').textContent = t; const im = $('falaI'), av = AVATAR[q]; im.style.display = av ? '' : 'none'; if (av) im.src = 'fotos/' + av + '.jpg'; $('fala').classList.add('on'); falaT = seg; }
function objetivoDe(f) {
  const n = f.cps.length;
  return f.tipo === 'tempo' ? `Passe pelos ${n} pontos de luz até ${f.destino} em ${f.tempo} s.` : f.tipo === 'corrida' ? `Chegue até ${f.destino} antes de ${f.quem}. São ${n} pontos de luz.` : f.tipo === 'entrega' ? `Faça ${n} entregas, parando dentro de cada ponto de luz: ${f.nomes.join(', ')}.` : f.tipo === 'voo' ? `Passe com o avião pelos ${n} anéis no ar em ${f.tempo} s.` : `${n ? 'Passe pelos ' + n + ' anéis, voe' : 'Voe'} até o alvo amarelo (${f.destino}), salte acima de 150 m e pouse a até ${f.alvo.r} m do centro.`;
}
const ELOG = ['Boa!', 'Isso aí!', 'Mandou bem!', 'É isso!', 'Segue assim!', 'Perfeito!', 'Tá voando!'];
function proximoPasso(primeiro) {
  const f = M.f, c = f.cps[M.i], v = cur, e = primeiro ? '' : ELOG[(M.i + f.n) % ELOG.length] + ' ';
  if (!c) { if (f.tipo === 'salto') fala(f.quem, e + `Agora voe até o alvo amarelo, sobre ${f.destino}. Suba acima de 150 m e salte com E quando estiver perto.`, 8); return; }
  const d = Math.round(Math.hypot(c.x - v.x, c.z - v.z)), ult = M.i === f.cps.length - 1; let an = Math.atan2(c.x - v.x, c.z - v.z) - v.h; while (an > Math.PI) an -= 6.283; while (an < -Math.PI) an += 6.283;
  const lado = Math.abs(an) < 0.45 ? 'siga em frente' : Math.abs(an) > 2.5 ? 'faça o retorno' : an > 0 ? 'vire à esquerda' : 'vire à direita', Lado = lado[0].toUpperCase() + lado.slice(1);
  let t;
  if (c.y) t = `${ult ? 'Último anel' : 'Próximo anel'}: ${lado}, a ${d} m, e ${c.y > (v.y || 0) + 15 ? 'suba para' : c.y < (v.y || 0) - 15 ? 'desça para' : 'mantenha'} ${Math.round(c.y)} m de altura.`;
  else if (f.tipo === 'entrega') t = `${ult ? 'Última entrega' : 'Próxima entrega'}: ${f.nomes[M.i]}, a ${d} m. ${Lado} e pare dentro do ponto de luz.`;
  else if (v.kind === 'boat') t = `${ult ? 'Última boia, a chegada' : 'Próxima boia'}: ${lado}, a ${d} m.`;
  else { const rua = streetName(c.x, c.z); t = ult ? `Último ponto: a chegada é ${f.destino}, a ${d} m. ${Lado}.` : `Próximo ponto de luz${rua ? ' na ' + rua : ''}, a ${d} m. ${Lado}.`; }
  if (ult && f.tipo === 'corrida') t += ` Acelera, que ${f.quem} não desiste!`;
  fala(f.quem, e + t);
}

// ---------- cartaz (falas, resultados, cartões-postais) ----------
let pausa = false;
function cartaz({ k, t, quem, p, nota, img, botoes, obj }) {
  $('cO').textContent = obj ? 'Objetivo: ' + obj : ''; $('cO').style.display = obj ? '' : 'none'; { const a = $('cA'), av = AVATAR[quem]; a.style.display = av ? '' : 'none'; if (av) a.src = 'fotos/' + av + '.jpg'; }
  $('cK').textContent = k || ''; $('cT').textContent = t || ''; $('cQ').textContent = quem || ''; $('cQ').style.display = quem ? '' : 'none'; $('cP').textContent = p || ''; $('cN').textContent = nota || '';
  const im = $('cImg'); if (img) { im.style.display = ''; im.onerror = () => { im.style.display = 'none'; }; im.src = 'fotos/' + img + '.jpg'; } else im.style.display = 'none';
  const b = $('cB'); b.innerHTML = ''; (botoes || [['Fechar', fecharCartaz, 1]]).forEach(([l, fn, pri]) => { const e = document.createElement('button'); e.textContent = l; if (pri) e.className = 'pri'; e.onclick = fn; b.appendChild(e); });
  $('cartaz').classList.add('on'); pausa = true;
}
function fecharCartaz() { $('cartaz').classList.remove('on'); pausa = $('mapa').classList.contains('on'); }

if (has('log')) console.log('M4', Math.round(performance.now()));
// ---------- minimapa e mapa grande ----------
const MS = 0.4, MM = document.createElement('canvas'); MM.width = MM.height = 1500;
const LONGE = MAP.ruas.filter(r => { const a = r[1]; for (let i = 0; i < a.length; i += 2) if (Math.abs(a[i]) > 1850 || Math.abs(a[i + 1]) > 1850) return true; return false; });
{
  const x = MM.getContext('2d'), T = v => v * MS + 750;
  x.fillStyle = '#2a1b45'; x.fillRect(0, 0, 1500, 1500);
  const poly = (a) => { x.beginPath(); for (let i = 0; i < a.length; i += 2) i ? x.lineTo(T(a[i]), T(a[i + 1])) : x.moveTo(T(a[i]), T(a[i + 1])); x.closePath(); };
  x.fillStyle = '#1d6f8f'; AGUA.forEach(a => { poly(a); x.fill(); });
  x.fillStyle = '#2f5e45'; MAP.verde.forEach(v => { if (v[1].length >= 6) { poly(v[1]); x.fill(); } });
  x.strokeStyle = 'rgba(255,230,194,.75)'; x.lineCap = 'round';
  MAP.ruas.forEach(r => { const a = r[1]; x.lineWidth = Math.max(1.2, r[0] * MS * 0.6); x.beginPath(); for (let i = 0; i < a.length; i += 2) i ? x.lineTo(T(a[i]), T(a[i + 1])) : x.moveTo(T(a[i]), T(a[i + 1])); x.stroke(); });
  x.fillStyle = '#6a4f86'; PRED.forEach(p => { poly(p.a); x.fill(); });
  x.strokeStyle = '#ff3d7f'; x.lineWidth = 4; x.beginPath(); ORLA.forEach((p, i) => i ? x.lineTo(T(p[0]), T(p[1])) : x.moveTo(T(p[0]), T(p[1]))); x.stroke();
}
// desenha o que fica fora da imagem da cidade; t = função mundo → tela
function longe(x, t, k) {
  x.strokeStyle = 'rgba(255,230,194,.7)'; x.lineWidth = Math.max(1, 3 * k); x.lineCap = 'round';
  for (const r of LONGE) { const a = r[1]; x.beginPath(); for (let i = 0; i < a.length; i += 2) { const p = t(a[i], a[i + 1]); i ? x.lineTo(p[0], p[1]) : x.moveTo(p[0], p[1]); } x.stroke(); }
  x.strokeStyle = '#d8d8e0'; x.lineWidth = Math.max(2.5, 30 * k); x.lineCap = 'butt'; x.beginPath(); let p = t(AERO.A[0], AERO.A[1]); x.moveTo(p[0], p[1]); p = t(AERO.B[0], AERO.B[1]); x.lineTo(p[0], p[1]); x.stroke();
}
let gps = null, gpsT = 0;
const mm = $('mm'), mx = mm.getContext('2d');
function drawMini() {
  const R = mm.width / 2, zoom = cur.kind === 'plane' && cur.y > 5 ? 0.45 : 1.25, k = MS * zoom; mx.clearRect(0, 0, mm.width, mm.height);
  mx.save(); mx.beginPath(); mx.arc(R, R, R - 3, 0, 6.3); mx.clip(); mx.fillStyle = '#2a1b45'; mx.fillRect(0, 0, mm.width, mm.height);
  mx.translate(R, R); mx.rotate(Math.PI + cur.h); mx.scale(zoom, zoom);
  mx.drawImage(MM, -(cur.x * MS + 750), -(cur.z * MS + 750));
  const t = (X, Z) => [(X - cur.x) * MS, (Z - cur.z) * MS];
  if (Math.abs(cur.x) > 1300 || Math.abs(cur.z) > 1300) longe(mx, t, MS);
  const linha = (pts, cor, w) => { mx.strokeStyle = cor; mx.lineWidth = w / zoom; mx.lineJoin = 'round'; mx.beginPath(); pts.forEach((p, i) => { const q = t(p[0], p[1]); i ? mx.lineTo(q[0], q[1]) : mx.moveTo(q[0], q[1]); }); mx.stroke(); };
  if (M && M.f.path) linha(M.f.path, 'rgba(255,61,127,.9)', 4); else if (gps && gps.path) linha(gps.path, 'rgba(255,210,58,.95)', 4);
  const ponto = (X, Z, cor, r) => { let [dx, dz] = t(X, Z); const d = Math.hypot(dx, dz), lim = (R - 12) / zoom; if (d > lim) { dx *= lim / d; dz *= lim / d; } mx.fillStyle = cor; mx.beginPath(); mx.arc(dx, dz, r / zoom, 0, 6.3); mx.fill(); mx.strokeStyle = '#140a26'; mx.lineWidth = 1.2 / zoom; mx.stroke(); };
  if (M) { const c = M.f.cps[M.i]; if (c) ponto(c.x, c.z, '#ff3d7f', 7); if (M.f.alvo) ponto(M.f.alvo.x, M.f.alvo.z, '#ffd23a', 7); if (rivalG.visible) ponto(rivalG.position.x, rivalG.position.z, '#ffd23a', 5); }
  else { for (const c of CPS) if (!c.done) ponto(c.x, c.z, '#ffd23a', 3.5); for (const g of marcas.children) ponto(g.position.x, g.position.z, '#' + CORT[g.userData.f.tipo].toString(16).padStart(6, '0'), 6.5); if (gps) ponto(gps.x, gps.z, '#ffffff', 5); }
  mx.restore();
  mx.fillStyle = '#ffe6c2'; mx.strokeStyle = '#140a26'; mx.lineWidth = 2; mx.beginPath(); mx.moveTo(R, R - 10); mx.lineTo(R + 7, R + 8); mx.lineTo(R, R + 4); mx.lineTo(R - 7, R + 8); mx.closePath(); mx.fill(); mx.stroke();
  mx.strokeStyle = '#ffe6c2'; mx.lineWidth = 3; mx.beginPath(); mx.arc(R, R, R - 2.5, 0, 6.3); mx.stroke();
}
const mapc = $('mapc'), mc = mapc.getContext('2d'), mv = { x: 250, z: 100, s: 0.2 };
const POIS = [{ nome: 'Aeroporto de Oriximiná', x: AERO.patio[0], z: AERO.patio[1], txt: 'O avião fica no pátio. Decole pela pista de 1,5 km e salte de paraquedas sobre a cidade.', ir: () => { cur = ped; pedM.visible = true; ped.x = plane.x + 7; ped.z = plane.z; ped.y = 0; } }, { nome: 'Orla de Oriximiná', x: car.home[0], z: car.home[1], txt: 'O ponto de partida, ao lado do Fusca.', ir: () => { cur = ped; pedM.visible = true; ped.x = car.x + Math.cos(car.h) * 3; ped.z = car.z - Math.sin(car.h) * 3; ped.y = 0; } }];
let sel = null;
const mT = (X, Z) => [(X - mv.x) * mv.s + mapc.width / 2, (Z - mv.z) * mv.s + mapc.height / 2];
function drawMapa() {
  const W = mapc.width = mapc.clientWidth * (devicePixelRatio > 1 ? 2 : 1), H = mapc.height = mapc.clientHeight * (devicePixelRatio > 1 ? 2 : 1), dp = W / mapc.clientWidth;
  mc.fillStyle = '#24183f'; mc.fillRect(0, 0, W, H);
  const o = mT(-1875, -1875), sz = 3750 * mv.s; mc.drawImage(MM, o[0], o[1], sz, sz); longe(mc, mT, mv.s);
  mc.textAlign = 'center'; mc.textBaseline = 'middle';
  for (const p of POIS) { const q = mT(p.x, p.z); mc.fillStyle = '#ffe6c2'; mc.fillRect(q[0] - 7 * dp, q[1] - 7 * dp, 14 * dp, 14 * dp); mc.font = `700 ${11 * dp}px Arial`; mc.fillText(p.nome, q[0], q[1] - 16 * dp); }
  for (const f of FASES) {
    const q = mT(f.marc[0], f.marc[1]), feita = SAVE.f[f.id], lib = liberada(f), r = (sel === f ? 15 : 11) * dp;
    mc.fillStyle = feita ? '#7ee04a' : lib ? '#' + CORT[f.tipo].toString(16).padStart(6, '0') : '#6a6478'; mc.beginPath(); mc.arc(q[0], q[1], r, 0, 6.3); mc.fill(); mc.lineWidth = (sel === f ? 4 : 2) * dp; mc.strokeStyle = sel === f ? '#fff' : '#140a26'; mc.stroke();
    mc.fillStyle = '#140a26'; mc.font = `700 ${11 * dp}px Arial`; mc.fillText(f.n, q[0], q[1] + dp);
  }
  const q = mT(cur.x, cur.z); mc.save(); mc.translate(q[0], q[1]); mc.rotate(Math.PI - cur.h); mc.fillStyle = '#fff'; mc.strokeStyle = '#140a26'; mc.lineWidth = 2 * dp; mc.beginPath(); mc.moveTo(0, -12 * dp); mc.lineTo(8 * dp, 9 * dp); mc.lineTo(0, 4 * dp); mc.lineTo(-8 * dp, 9 * dp); mc.closePath(); mc.fill(); mc.stroke(); mc.restore();
}
function selecionar(o) {
  sel = o; const e = $('sel'); if (!o) { e.classList.remove('on'); drawMapa(); return; }
  e.classList.add('on'); const b = $('sB'); b.innerHTML = ''; const bot = (l, fn, pri) => { const x = document.createElement('button'); x.textContent = l; if (pri) x.className = 'pri'; x.onclick = fn; b.appendChild(x); };
  if (o.n) {
    const s = SAVE.f[o.id], lib = liberada(o);
    $('sK').textContent = 'Fase ' + o.n + ' · ' + TIPO[o.tipo] + ' · ' + VEIC[o.veic].nome; $('sT').textContent = o.nome;
    $('sP').textContent = lib ? o.quem + ': “' + o.fala + '”' : 'Bloqueada. Conclua mais fases para liberar esta.';
    $('sN').textContent = (s ? '★'.repeat(s.e) + '☆'.repeat(3 - s.e) + ' · ' : '') + Math.round(o.len) + ' m' + (o.tipo === 'salto' ? ' · alvo de ' + o.alvo.r + ' m' : ' · ' + o.tempo + ' s');
    if (lib) { bot('Ir até lá e jogar', () => iniciar(o), 1); bot('Marcar no GPS', () => { gps = { x: o.marc[0], z: o.marc[1], nome: 'Fase ' + o.n }; gpsT = 0; fecharMapa(); toast('GPS: fase ' + o.n, 2); }); }
  } else { $('sK').textContent = 'Lugar'; $('sT').textContent = o.nome; $('sP').textContent = o.txt; $('sN').textContent = ''; bot('Ir até lá', () => { if (M) encerrar(); o.ir(); salto = null; chute.visible = false; fecharMapa(); toast(o.nome, 2); }, 1); bot('Marcar no GPS', () => { gps = { x: o.x, z: o.z, nome: o.nome }; gpsT = 0; fecharMapa(); }); }
  drawMapa();
}
function abrirMapa() {
  if (!started) return; $('mapa').classList.add('on'); pausa = true;
  const l = $('lista'); l.innerHTML = '';
  FASES.forEach(f => { const s = SAVE.f[f.id], e = document.createElement('button'); e.className = s ? 'ok' : liberada(f) ? '' : 'tr'; e.innerHTML = `<b>${f.n}</b><span>${f.nome}<i>${TIPO[f.tipo]} · ${VEIC[f.veic].nome}</i></span><em>${s ? '★'.repeat(s.e) : liberada(f) ? '' : '🔒'}</em>`; e.onclick = () => { mv.x = f.marc[0]; mv.z = f.marc[1]; selecionar(f); }; l.appendChild(e); });
  $('mTit').textContent = nFeitas() + ' de 30 fases · ' + nEstrelas() + ' ★ · ' + CPS.filter(c => c.done).length + ' de ' + CPS.length + ' cartões';
  if (!sel) { mv.x = clamp(cur.x, -1500, 4500); mv.z = clamp(cur.z, -7000, 1500); } selecionar(sel);
}
function fecharMapa() { $('mapa').classList.remove('on'); pausa = $('cartaz').classList.contains('on'); }
{
  let dn = null, mov = 0;
  mapc.addEventListener('pointerdown', e => { dn = [e.clientX, e.clientY]; mov = 0; mapc.setPointerCapture(e.pointerId); });
  mapc.addEventListener('pointermove', e => { if (!dn) return; const dx = e.clientX - dn[0], dy = e.clientY - dn[1]; mov += Math.abs(dx) + Math.abs(dy); const dp = mapc.width / mapc.clientWidth; mv.x -= dx * dp / mv.s; mv.z -= dy * dp / mv.s; dn = [e.clientX, e.clientY]; drawMapa(); });
  mapc.addEventListener('pointerup', e => {
    if (dn && mov < 8) { const r = mapc.getBoundingClientRect(), dp = mapc.width / mapc.clientWidth, px = (e.clientX - r.left) * dp, py = (e.clientY - r.top) * dp; let b = null, bd = 26 * dp; for (const o of FASES.concat(POIS)) { const q = o.n ? mT(o.marc[0], o.marc[1]) : mT(o.x, o.z), d = Math.hypot(q[0] - px, q[1] - py); if (d < bd) { bd = d; b = o; } } selecionar(b); }
    dn = null;
  });
  mapc.addEventListener('wheel', e => { mv.s = clamp(mv.s * (e.deltaY < 0 ? 1.2 : 0.83), 0.03, 1.2); drawMapa(); e.preventDefault(); }, { passive: false });
  $('zMais').onclick = () => { mv.s = clamp(mv.s * 1.4, 0.03, 1.2); drawMapa(); }; $('zMenos').onclick = () => { mv.s = clamp(mv.s / 1.4, 0.03, 1.2); drawMapa(); };
  $('zTudo').onclick = () => { mv.x = 1500; mv.z = -2700; mv.s = Math.min(mapc.width, mapc.height) / 10500; drawMapa(); };
  $('mFechar').onclick = fecharMapa; mm.addEventListener('click', abrirMapa); $('bMapa').onclick = abrirMapa;
}

if (has('log')) console.log('M5', Math.round(performance.now()));
// ---------- entrada ----------
const keys = {}; let joy = { x: 0, y: 0, on: false }; const toque = { gas: 0, freio: 0, sobe: 0, desce: 0, nitro: 0 };
addEventListener('keydown', e => {
  keys[e.code] = true; if (['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'Space'].includes(e.code)) e.preventDefault();
  if (!started) return; if (cut) { cut.t = 99; return; }
  if (e.code === 'KeyM') return $('mapa').classList.contains('on') ? fecharMapa() : abrirMapa();
  if (e.code === 'Escape') { fecharMapa(); return; }
  if (pausa) { if (e.code === 'Enter' || e.code === 'Space') { const b = document.querySelector('#cartaz.on .pri'); if (b) b.click(); } return; }
  if (e.code === 'KeyE' || e.code === 'KeyF' || e.code === 'KeyT') acao(); if (e.code === 'KeyC' && !e.repeat) trocarPersonagem(); if (e.code === 'KeyN') mudarHora(); if (e.code === 'KeyR') voltar(); if (e.code === 'KeyH' && !e.repeat) buzinaOn(); if (e.code === 'KeyL') alternarFarol(); if (e.code === 'KeyU') { somOn = !somOn; toast(somOn ? 'Som ligado' : 'Som desligado', 1.2); }
});
addEventListener('keyup', e => { keys[e.code] = false; if (e.code === 'KeyH') buzinaOff(); });
const jz = $('joy'), jk = $('knob');
function joyMove(e) { const r = jz.getBoundingClientRect(), t = e.touches ? e.touches[0] : e; let x = (t.clientX - r.left - r.width / 2) / (r.width / 2), y = (t.clientY - r.top - r.height / 2) / (r.height / 2); const l = Math.hypot(x, y); if (l > 1) { x /= l; y /= l; } joy = { x, y, on: true }; jk.style.transform = `translate(${x * 38}px,${y * 38}px)`; e.preventDefault(); }
function joyEnd() { joy = { x: 0, y: 0, on: false }; jk.style.transform = ''; }
jz.addEventListener('touchstart', joyMove, { passive: false }); jz.addEventListener('touchmove', joyMove, { passive: false }); jz.addEventListener('touchend', joyEnd); jz.addEventListener('touchcancel', joyEnd);
for (const [id, k] of [['pGas', 'gas'], ['pFreio', 'freio'], ['pSobe', 'sobe'], ['pDesce', 'desce'], ['pNitro', 'nitro']]) { const b = $(id); const on = e => { toque[k] = 1; e.preventDefault(); }, off = () => { toque[k] = 0; }; b.addEventListener('touchstart', on, { passive: false }); b.addEventListener('touchend', off); b.addEventListener('touchcancel', off); b.addEventListener('mousedown', on); b.addEventListener('mouseup', off); b.addEventListener('mouseleave', off); }
function orlaPerto(x, z) { let b = null, bd = 1e9; for (let i = 0; i <= 160; i++) { const o = orlaAt(i / 160), d = Math.hypot(o.x - x, o.z - z); if (d < bd) { bd = d; b = o; } } return b; }
function acao() {
  if (cut) return;
  if (salto) { if (salto.st === 'queda') abrirChute(); return; }
  if (cur === ped) {
    let b = null, bd = 1e9; for (const v of Object.values(VS)) { const d = Math.hypot(v.x - ped.x, v.z - ped.z) - (v.kind === 'boat' ? 14 : v.kind === 'plane' ? 5 : 0); if (d < bd) { bd = d; b = v; } }
    if (b && bd < 6) { cur = b; pedM.visible = false; toast(b.nome, 1.6); } else toast('Chegue perto de um veículo', 1.6);
    return;
  }
  const v = cur;
  if (v.kind === 'plane' && v.y > 40) return pular();
  if (M && M.st !== 'fim') return toast('Termine a fase ou aperte R para repetir', 1.8);
  if (v.kind === 'plane' && v.y > 0.5) return toast('Suba acima de 40 m para saltar', 1.8);
  if (Math.abs(v.v) > 4) return toast('Pare o veículo para descer', 1.6);
  if (v.kind === 'boat') { const o = orlaPerto(v.x, v.z); if (Math.hypot(o.x - v.x, o.z - v.z) > 30) return toast('Encoste na orla para descer', 1.8); ped.x = o.x - o.nx * 2; ped.z = o.z - o.nz * 2; }
  else { let ok = false; for (const s of [1, -1]) { const x = v.x + Math.cos(v.h) * 2.6 * s, z = v.z - Math.sin(v.h) * 2.6 * s; if (!blocked(ped, x, z)) { ped.x = x; ped.z = z; ok = true; break; } } if (!ok) { ped.x = v.x - Math.sin(v.h) * 4; ped.z = v.z - Math.cos(v.h) * 4; } }
  ped.h = v.h; ped.y = 0; ped.v = 0; v.v = 0; cur = ped; pedM.visible = true; toast('A pé', 1.2);
}
function pular() { const v = plane; salto = { st: 'queda', vx: Math.sin(v.h) * v.v * 0.55, vz: Math.cos(v.h) * v.v * 0.55 }; ped.x = v.x; ped.z = v.z; ped.y = v.y - 2; ped.vy = -4; ped.h = v.h; cur = ped; pedM.visible = true; plane.auto = true; toast('Queda livre! E ou Espaço abre o paraquedas', 2.6); }
function abrirChute() { salto.st = 'aberto'; chute.visible = true; toast('Paraquedas aberto: A e D giram, W acelera, S freia', 2.6); }
function mudarHora() { hora = HORAS[(HORAS.indexOf(hora) + 1) % 3]; horaAntes = null; applyTime(); }
function voltar() { if (M) return iniciar(M.f); salto = null; chute.visible = false; if (cur === ped || cur.kind === 'plane') { POIS[cur.kind === 'plane' ? 0 : 1].ir(); if (plane.y > 0 || cur === ped) porVeiculo(plane, ...plane.home); } else { const h = cur.home; porVeiculo(cur, h[0], h[1], h[2]); } toast('De volta', 1.4); }
{ const b = $('bBuzina'); b.addEventListener('pointerdown', buzinaOn); for (const ev of ['pointerup', 'pointerleave', 'pointercancel']) b.addEventListener(ev, buzinaOff); } $('bFarol').onclick = alternarFarol; $('bAcao').onclick = acao; $('bTroca').onclick = () => trocarPersonagem(); $('bMais').onclick = ev => { ev.stopPropagation(); $('maisP').classList.toggle('on'); }; $('maisP').addEventListener('click', () => $('maisP').classList.remove('on')); $('bSom').onclick = () => { somOn = !somOn; $('bSom').textContent = somOn ? 'Som: ligado' : 'Som: desligado'; toast(somOn ? 'Som ligado' : 'Som desligado', 1.2); }; $('bHora').onclick = mudarHora; $('bVoltar').onclick = voltar;
let toastT = 0; function toast(t, s = 2.6) { const e = $('toast'); e.textContent = t; e.classList.add('on'); toastT = s; }
let started = false, cut = null;
const SEM_CADASTRO = has('auto') || has('cena') || has('teste');
function premiar(n) { const sobe = PF.pontuar(n); passaporte(); if (sobe) toast('Novo nível no passaporte: ' + sobe, 3); }
function passaporte() {
  const p = PF.P, el = $('pass'); if (!el) return; if (!p) { el.textContent = ''; return; } const nv = PF.nivel();
  el.textContent = p.nome + ' · ' + nv.nome + ' · ' + p.pontos + ' pts' + (nv.prox ? ' (próximo nível: ' + nv.prox + ')' : '') + ' · acesso nº ' + Math.max(1, p.acessos) + ' · ' + Math.max(1, p.seq) + (p.seq > 1 ? ' dias seguidos' : ' dia');
  const h = $('passH'); if (h) h.textContent = nv.nome + ' · ' + p.pontos + ' pts';
}
function telaCadastro() {
  const tem = !!PF.P || SEM_CADASTRO; $('cad').style.display = tem ? 'none' : ''; $('jogar').style.display = tem ? '' : 'none';
  if (PF.P) { $('ola').textContent = 'Olá, ' + PF.P.nome + '!'; passaporte(); }
}
{ const t = $('cTel'); t.addEventListener('input', () => { t.value = PF.mascara(t.value); });
  $('cad').addEventListener('submit', ev => { ev.preventDefault(); const er = PF.validar($('cNome').value, $('cSobre').value, t.value, $('cOk').checked); $('cErro').textContent = er; if (er) return; PF.criar($('cNome').value, $('cSobre').value, t.value); telaCadastro(); });
  for (const id of ['cNome', 'cSobre', 'cTel']) $(id).addEventListener('keydown', ev => ev.stopPropagation());
  telaCadastro(); }
function start() { if (started) return; if (!PF.P && !SEM_CADASTRO) return telaCadastro(); started = true; if (window.__verGira) window.__verGira(); try { const o = screen.orientation; if (o && o.lock) o.lock('landscape').catch(() => {}); } catch (e) {} { const a = PF.acesso(); passaporte(); if (a && a.ganho) setTimeout(() => toast('+' + a.ganho + ' pontos pelo acesso de hoje' + (a.seq > 1 ? ' · ' + a.seq + ' dias seguidos' : ''), 3.2), 7000); } somIniciar(); $('title').classList.add('off'); $('hud').classList.add('on'); refazerMarcas(); hudFase(); if (has('auto')) { cur = car; pedM.visible = false; } else cut = { t: 0, x0: ped.x, z0: ped.z }; }
$('play').onclick = () => { trocarPersonagem('prefeito'); start(); }; $('playD').onclick = () => { trocarPersonagem('dama'); start(); };


// ---------- som (WebAudio), faróis e nitro ----------
let AC = null, SOM = null, somOn = true, marcha = 1, rpm = 0.2, trocaT = 0;
const LIM = [0, 0.2, 0.4, 0.6, 0.8, 1.05];
// No iPhone, a chave de silencioso corta o som de páginas web. Declarar a sessão como "reprodução"
// e manter um áudio mudo tocando faz o som do jogo sair como o de um vídeo, em qualquer sistema.
let mudo = null;
function destravarSom() {
  try { if (navigator.audioSession) navigator.audioSession.type = 'playback'; } catch (e) {}
  try {
    if (!mudo) {
      const n = 4000, b = new ArrayBuffer(44 + n), v = new DataView(b), w = (o, t) => { for (let i = 0; i < t.length; i++) v.setUint8(o + i, t.charCodeAt(i)); };
      w(0, 'RIFF'); v.setUint32(4, 36 + n, true); w(8, 'WAVEfmt '); v.setUint32(16, 16, true); v.setUint16(20, 1, true); v.setUint16(22, 1, true); v.setUint32(24, 8000, true); v.setUint32(28, 8000, true); v.setUint16(32, 1, true); v.setUint16(34, 8, true); w(36, 'data'); v.setUint32(40, n, true);
      for (let i = 0; i < n; i++) v.setUint8(44 + i, 128);
      mudo = new Audio(URL.createObjectURL(new Blob([b], { type: 'audio/wav' }))); mudo.loop = true; mudo.setAttribute('playsinline', ''); mudo.preload = 'auto';
    }
    if (mudo.paused && !document.hidden) { const pr = mudo.play(); if (pr && pr.catch) pr.catch(() => {}); }
  } catch (e) {}
  if (AC && AC.state !== 'running' && !document.hidden) { try { const pr = AC.resume(); if (pr && pr.catch) pr.catch(() => {}); } catch (e) {} }
}
function somIniciar() {
  if (AC) return destravarSom(); try { AC = new (window.AudioContext || window.webkitAudioContext)(); } catch (e) { return; } destravarSom();
  const master = AC.createGain(), comp = AC.createDynamicsCompressor(); master.gain.value = 0.9; master.connect(comp); comp.connect(AC.destination);
  const osc = (tipo, det = 0) => { const o = AC.createOscillator(); o.type = tipo; o.detune.value = det; o.start(); return o; };
  const o1 = osc('sawtooth'), o2 = osc('sawtooth', 16), o3 = osc('square'), f = AC.createBiquadFilter(), g = AC.createGain(), g3 = AC.createGain(); f.type = 'lowpass'; f.Q.value = 2.5; g.gain.value = 0; g3.gain.value = 0.55;
  o1.connect(f); o2.connect(f); o3.connect(g3); g3.connect(f); f.connect(g); g.connect(master);
  const tw = osc('sine'), tg = AC.createGain(); tg.gain.value = 0; tw.connect(tg); tg.connect(master);     // assobio da turbina
  const nb = AC.createBuffer(1, AC.sampleRate, AC.sampleRate), d = nb.getChannelData(0); for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
  SOM = { master, o1, o2, o3, f, g, tw, tg, nb, horn: null };
}
// alívio da turbina a cada troca de marcha: "psssh-tu-tu-tu"
function turbina(forca) {
  if (!SOM || !somOn) return; const t = AC.currentTime, src = AC.createBufferSource(), f = AC.createBiquadFilter(), g = AC.createGain(), lfo = AC.createOscillator(), lg = AC.createGain();
  src.buffer = SOM.nb; f.type = 'bandpass'; f.Q.value = 1.6; f.frequency.setValueAtTime(5600, t); f.frequency.exponentialRampToValueAtTime(1300, t + 0.42);
  g.gain.setValueAtTime(0.0001, t); g.gain.linearRampToValueAtTime(0.26 * forca, t + 0.03); g.gain.exponentialRampToValueAtTime(0.001, t + 0.5);
  lfo.type = 'square'; lfo.frequency.setValueAtTime(34, t + 0.12); lfo.frequency.linearRampToValueAtTime(16, t + 0.5); lg.gain.setValueAtTime(0, t); lg.gain.setValueAtTime(0.1 * forca, t + 0.14); lfo.connect(lg); lg.connect(g.gain);
  src.connect(f); f.connect(g); g.connect(SOM.master); src.start(t); src.stop(t + 0.55); lfo.start(t); lfo.stop(t + 0.55);
}
function somMotor(dt) {
  if (!SOM) return; const v = cur, a = Math.abs(v.v || 0), t = AC.currentTime, ativo = somOn && started && !pausa && v !== ped && !salto;
  if (v.kind === 'car') {
    if (marcha < 1) marcha = 1; const fr = clamp(a / v.max, 0, 1.04);
    if (marcha < 5 && fr > LIM[marcha] + 0.012) { marcha++; trocaT = 0.26; if (ativo) turbina(0.55 + 0.45 * thrIn); }
    else if (marcha > 1 && fr < LIM[marcha - 1] - 0.05) { marcha--; trocaT = 0.1; }
    rpm = 0.22 + 0.78 * clamp((fr - LIM[marcha - 1]) / (LIM[marcha] - LIM[marcha - 1]), 0, 1);
  } else { marcha = 0; rpm = v.kind === 'plane' ? 0.25 + 0.75 * (v.thr || 0) : 0.2 + 0.8 * clamp(a / (v.max || 1), 0, 1); }
  trocaT = Math.max(0, trocaT - dt);
  const k = v.kind === 'plane' ? 1.5 : v.kind === 'boat' ? 0.8 : v.id === 'esportivo' ? 1.35 : v.id === 'fusca' || v.id === 'kombi' ? 0.9 : v.id === 'picapeG' || v.id === 'van' ? 0.75 : 1;
  const fq = (46 + rpm * 150) * k * (trocaT > 0 ? 0.8 : 1), vol = ativo ? (0.03 + 0.065 * thrIn + 0.025 * rpm + (nitroOn ? 0.03 : 0)) * (trocaT > 0 ? 0.35 : 1) : 0;
  SOM.o1.frequency.setTargetAtTime(fq, t, 0.04); SOM.o2.frequency.setTargetAtTime(fq * 1.5, t, 0.04); SOM.o3.frequency.setTargetAtTime(fq * 0.5, t, 0.04);
  SOM.f.frequency.setTargetAtTime(350 + rpm * 2400 + (nitroOn ? 1200 : 0), t, 0.06); SOM.g.gain.setTargetAtTime(vol, t, 0.05);
  SOM.tw.frequency.setTargetAtTime(2600 + rpm * 5200, t, 0.08); SOM.tg.gain.setTargetAtTime(ativo && v.kind === 'car' ? 0.011 * thrIn * rpm * (nitroOn ? 2 : 1) : 0, t, 0.1);
}
// buzina de dois tons, enquanto o botão ou a tecla H estiverem apertados
function buzinaOn() {
  somIniciar(); if (cur === ped || salto || !SOM || !somOn || SOM.horn) return; const t = AC.currentTime, id = cur.id;
  const fr = cur.kind === 'boat' ? [174, 220] : cur.kind === 'plane' ? [300, 300] : id === 'picapeG' || id === 'van' ? [335, 420] : id === 'fusca' || id === 'kombi' ? [440, 554] : id === 'esportivo' ? [480, 600] : [400, 500];
  const g = AC.createGain(), pk = AC.createBiquadFilter(), lp = AC.createBiquadFilter(); pk.type = 'peaking'; pk.frequency.value = 2300; pk.Q.value = 0.9; pk.gain.value = 10; lp.type = 'lowpass'; lp.frequency.value = 4600;
  g.gain.setValueAtTime(0, t); g.gain.linearRampToValueAtTime(0.2, t + 0.012);
  const os = []; for (const f of fr) for (const d of [-5, 6]) { const o = AC.createOscillator(); o.type = 'sawtooth'; o.frequency.value = f; o.detune.value = d; o.connect(pk); o.start(t); os.push(o); }
  pk.connect(lp); lp.connect(g); g.connect(SOM.master); SOM.horn = { g, os, t };
}
function buzinaOff() { const h = SOM && SOM.horn; if (!h) return; const t = Math.max(AC.currentTime, h.t + 0.2); h.g.gain.setTargetAtTime(0, t, 0.018); for (const o of h.os) o.stop(t + 0.14); SOM.horn = null; }
let farolOn = false, farolAuto = true;
const farol = new THREE.SpotLight(0xfff0c8, 0, 90, 0.5, 0.6, 1.1); scene.add(farol, farol.target);
const facho = new THREE.Mesh(new THREE.PlaneGeometry(9, 22).rotateX(-Math.PI / 2).translate(0, 0, 13), new THREE.MeshBasicMaterial({ map: GLOW, color: 0xfff0c8, transparent: true, opacity: 0, depthWrite: false, blending: THREE.AdditiveBlending })); facho.renderOrder = 3; scene.add(facho);
function alternarFarol() { farolAuto = false; farolOn = !farolOn; toast(farolOn ? 'Faróis ligados' : 'Faróis desligados', 1.2); }
let nitro = 1, nitroOn = false;
const chama = new THREE.Mesh(new THREE.ConeGeometry(0.28, 2.2, 8).rotateX(-Math.PI / 2).translate(0, 0, -1.1), new THREE.MeshBasicMaterial({ color: 0x4ad8ff, transparent: true, opacity: 0.85, depthWrite: false, blending: THREE.AdditiveBlending })); chama.visible = false; scene.add(chama);
function efeitos(dt, e) {
  const v = cur, veic = v !== ped && !salto;
  nitroOn = veic && !pausa && (!M || M.st === 'run') && (keys.KeyX || toque.nitro || (v.kind !== 'plane' && (keys.ShiftLeft || keys.ShiftRight))) && nitro > 0.02 && e.thr > 0;
  nitro = clamp(nitro + (nitroOn ? -0.3 : 0.07) * dt, 0, 1);
  chama.visible = nitroOn; if (nitroOn) { const tr = v.kind === 'plane' ? 4.8 : v.kind === 'boat' ? 3.4 : 2.2; chama.position.set(v.x - Math.sin(v.h) * tr, (v.y || 0) + (v.kind === 'plane' ? 1.5 : 0.5), v.z - Math.cos(v.h) * tr); chama.rotation.y = v.h; chama.scale.setScalar(0.8 + Math.random() * 0.5); }
  if (farolAuto) farolOn = hora === 'noite';
  const lig = farolOn && veic && v.kind !== 'plane'; farol.intensity = lig ? 260 : 0; facho.material.opacity = lig ? (hora === 'noite' ? 0.5 : 0.16) : 0;
  if (lig) { farol.position.set(v.x + Math.sin(v.h) * 1.5, 1.1, v.z + Math.cos(v.h) * 1.5); farol.target.position.set(v.x + Math.sin(v.h) * 30, 0, v.z + Math.cos(v.h) * 30); facho.position.set(v.x, v.kind === 'boat' ? 0.1 : 0.4, v.z); facho.rotation.y = v.h; }
  camera.fov = lerp(camera.fov, (innerWidth < innerHeight ? 72 : 58) + (nitroOn ? 12 : 0), 0.1); camera.updateProjectionMatrix();
  somMotor(dt);
}

// ---------- simulação ----------
function blocked(v, x, z) {
  const dO = distOrla(x, z);
  if (v.kind === 'boat') return !inWater(x, z) || dO < 10.5;
  const r = v.kind === 'ped' ? 0.6 : 0; for (const o of OBST) if (Math.hypot(x - o[0], z - o[1]) < o[2] - (v.kind === 'ped' ? 1.2 : 0) + r) return true;
  if (dO < 7.6) return false;
  return inWater(x, z) || inBuilding(x, z);
}
function entrada() {
  let thr = (keys.KeyW || keys.ArrowUp ? 1 : 0) - (keys.KeyS || keys.ArrowDown ? 1 : 0), st = (keys.KeyD || keys.ArrowRight ? 1 : 0) - (keys.KeyA || keys.ArrowLeft ? 1 : 0), sobe = (keys.Space ? 1 : 0) - (keys.ShiftLeft || keys.ShiftRight || keys.KeyC ? 1 : 0);
  if (joy.on) { st = clamp(joy.x * 1.3, -1, 1); if (cur.kind === 'plane') sobe = clamp(joy.y * 1.4, -1, 1); else if (!toque.gas && !toque.freio) thr = clamp(-joy.y * 1.4, -1, 1); }
  if (toque.gas) thr = 1; if (toque.freio) thr = -1; if (toque.sobe) sobe = 1; if (toque.desce) sobe = -1;
  if (has('drive')) thr = 1;
  return { thr, st, sobe };
}
function cair(msg) { if (M && M.st === 'run') { porVeiculo(plane, ...plane.home); return fim(false, msg); } porVeiculo(plane, ...plane.home); toast(msg + ' O avião voltou ao pátio.', 3); }
function passoAviao(v, e, dt) {
  v.thr = clamp(v.thr + e.thr * 0.7 * dt, 0, 1); const alvo = v.thr * v.max * (nitroOn ? 1.3 : 1);
  v.v += clamp(alvo - v.v, -9 * dt, v.acc * (nitroOn ? 2 : 1) * dt); if (v.y <= 0 && e.thr < 0) v.v = Math.max(0, v.v - 14 * dt);
  if (v.y <= 0) {
    v.h -= e.st * 1.2 * dt * clamp(v.v / 8, -1, 1);
    const nx = v.x + Math.sin(v.h) * v.v * dt, nz = v.z + Math.cos(v.h) * v.v * dt; if (!blocked(v, nx, nz)) { v.x = nx; v.z = nz; } else v.v *= 0.5;
    if (v.v > 31 && (e.sobe > 0 || v.v > 42)) { v.y = 0.05; v.vy = 4; }
    return;
  }
  v.h -= e.st * v.turn * dt; const estol = v.v < 26;
  const vyAlvo = estol ? -16 : e.sobe * 17; v.vy += clamp(vyAlvo - v.vy, -22 * dt, 22 * dt); v.y += v.vy * dt; v.y = Math.min(v.y, 900);
  v.x += Math.sin(v.h) * v.v * dt; v.z += Math.cos(v.h) * v.v * dt;
  if (estol && v.y > 8 && Math.floor(tAll * 2) % 4 === 0) toast('Estol! Acelere (W)', 0.6);
  const p = predioEm(v.x, v.z); if (p && v.y < p.hh + 1) return cair('O avião bateu num prédio.');
  if (v.y <= 0) { if (inWater(v.x, v.z)) return cair('Pouso na água.'); if (v.vy < -13) return cair('Pouso forte demais.'); v.y = 0; v.vy = 0; }
}
function passoSalto(e, dt) {
  const p = ped;
  if (salto.st === 'queda') { p.vy = Math.max(-46, p.vy - 22 * dt); salto.vx *= 1 - 0.5 * dt; salto.vz *= 1 - 0.5 * dt; p.h -= e.st * 1.6 * dt; p.x += salto.vx * dt; p.z += salto.vz * dt; if (p.y < 95) abrirChute(); }
  else { const alvoVy = e.thr > 0 ? -8 : e.thr < 0 ? -4.2 : -5.6, vf = e.thr > 0 ? 15 : e.thr < 0 ? 6 : 11; p.vy += clamp(alvoVy - p.vy, -60 * dt, 60 * dt); p.h -= e.st * 1.3 * dt; p.x += Math.sin(p.h) * vf * dt; p.z += Math.cos(p.h) * vf * dt; }
  p.y += p.vy * dt;
  const b = predioEm(p.x, p.z), chao = b ? b.hh : 0;
  if (p.y <= chao) {
    const tx = p.x, tz = p.z; salto = null; chute.visible = false; p.y = 0; p.vy = 0;
    if (inWater(tx, tz) && distOrla(tx, tz) > 8) { const o = orlaPerto(tx, tz); p.x = o.x - o.nx * 2; p.z = o.z - o.nz * 2; toast('Caiu no rio! Um barqueiro te deixou na orla.', 3); }
    else if (b) { const s = snapRoad(tx, tz); p.x = s[0]; p.z = s[1]; toast('Pousou num telhado e desceu pela rua.', 3); }
    else toast('Pouso!', 1.5);
    pousoSalto(tx, tz);
  }
}
let nameT = 0, last = performance.now(), tAll = 0, thrIn = 0;
function step(dt) {
  tAll += dt;
  if (cut) passoCena(dt);
  else if (started && !pausa) {
    const e = entrada(), v = cur; thrIn = Math.abs(e.thr);
    const livre = !M || M.st === 'run';
    if (M) passoFase(dt);
    if (!livre) { /* parado na largada */ }
    else if (salto) passoSalto(e, dt);
    else if (v.kind === 'plane') passoAviao(v, e, dt);
    else if (v.kind === 'ped') {
      const corre = keys.ShiftLeft || keys.ShiftRight ? 1.6 : 1; v.v = e.thr * 5.2 * corre * (e.thr < 0 ? 0.5 : 1); v.h -= e.st * 2.9 * dt;
      const nx = v.x + Math.sin(v.h) * v.v * dt, nz = v.z + Math.cos(v.h) * v.v * dt; if (!blocked(v, nx, nz)) { v.x = nx; v.z = nz; } else if (!blocked(v, nx, v.z)) v.x = nx; else if (!blocked(v, v.x, nz)) v.z = nz;
      v.fase += Math.abs(v.v) * dt * 2.2;
    } else {
      const nb = nitroOn ? 1.45 : 1; v.v += e.thr * v.acc * (nitroOn ? 2.3 : 1) * dt * (e.thr * v.v < 0 ? 2.4 : 1);
      v.v *= 1 - (e.thr ? 0.35 : 1.3) * dt; if (keys.Space) v.v *= 1 - 4 * dt;
      v.v = clamp(v.v, -v.max * 0.3, Math.max(v.max * nb, Math.abs(v.v) - 12 * dt));
      v.rol = lerp(v.rol || 0, -e.st * clamp(v.v / 20, -1, 1) * 0.07, 0.15); v.arf = lerp(v.arf || 0, -e.thr * 0.025 * (nitroOn ? 2 : 1), 0.1);
      v.h -= e.st * v.turn * dt * clamp(v.v / 7, -1, 1);
      const nx = v.x + Math.sin(v.h) * v.v * dt, nz = v.z + Math.cos(v.h) * v.v * dt;
      if (!blocked(v, nx, nz)) { v.x = nx; v.z = nz; } else if (!blocked(v, nx, v.z)) { v.x = nx; v.v *= 0.9; } else if (!blocked(v, v.x, nz)) { v.z = nz; v.v *= 0.9; } else v.v *= -0.25;
      if (v.kind === 'car') for (const t of TRAF) if (Math.hypot(t.x - v.x, t.z - v.z) < 2.8) v.v *= 1 - 3 * dt;
    }
    if (plane.auto) { if (cur === plane) plane.auto = false; else { plane.x += Math.sin(plane.h) * plane.v * dt; plane.z += Math.cos(plane.h) * plane.v * dt; } }
    // cartões-postais e largadas
    const c0 = cur, noChao = (c0.y || 0) < 2;
    if (!M && noChao) {
      for (const c of CPS) if (!c.done && (c.kind === 'boat') === (c0.kind === 'boat') && Math.hypot(c.x - c0.x, c.z - c0.z) < 7) {
        c.done = true; c.g.visible = false; SAVE.c.push(c.id); salvar(); premiar(25); const n = CPS.filter(q => q.done).length;
        cartaz({ k: 'Cartão-postal ' + n + ' de ' + CPS.length, t: c.nome, img: c.img, nota: n === CPS.length ? 'Álbum completo! Você conhece Oriximiná.' : (() => { let b = null, bd = 1e9; for (const q of CPS) if (!q.done) { const d = Math.hypot(q.x - c0.x, q.z - c0.z); if (d < bd) { bd = d; b = q; } } return 'Próximo cartão: ' + b.nome + ', a ' + Math.round(bd) + ' m' + (b.kind === 'boat' ? ' (de barco).' : '.'); })(), botoes: [['Continuar', fecharCartaz, 1]] });
      }
      cool -= dt;
      if (cool <= 0) for (const g of marcas.children) if (Math.hypot(g.position.x - c0.x, g.position.z - c0.z) < 6.5) { iniciar(g.userData.f); break; }
    }
    // GPS
    if (gps && !M) { gpsT -= dt; if (gpsT <= 0) { gpsT = 1.5; const d = Math.hypot(gps.x - c0.x, gps.z - c0.z); if (d < 14) { gps = null; toast('Você chegou', 1.6); } else gps.path = (c0.kind === 'car' || c0.kind === 'ped') && d < 9000 ? ([[c0.x, c0.z]].concat(G.rotaPor([[c0.x, c0.z], [gps.x, gps.z]]) || [], [[gps.x, gps.z]])) : [[c0.x, c0.z], [gps.x, gps.z]]; } }
    nameT -= dt; if (nameT <= 0) { nameT = 0.25; hudTexto(); }
  }
  mundo(dt);
  camara(dt);
  efeitos(dt, started && !pausa && !cut ? entrada() : { thr: 0, st: 0 });
  if (falaT > 0 && !pausa) { falaT -= dt; if (falaT <= 0) $('fala').classList.remove('on'); }
  if (toastT > 0) { toastT -= dt; if (toastT <= 0) $('toast').classList.remove('on'); }
}
// cena de abertura: o personagem de pé, de frente, e depois entrando no Fusca
function passoCena(dt) {
  cut.t += dt; if (has('pose')) cut.t = 2; if (has('pose2')) cut.t = Math.min(cut.t, 4.3); const t = cut.t, dx = car.x + Math.cos(car.h) * 1.15, dz = car.z - Math.sin(car.h) * 1.15;
  if (t < 3.4) { ped.h = car.h + Math.PI * 0.5 + Math.sin(t * 0.9) * 0.12; MOD.andar(pedM, 0, 0); pedM.userData.bd.rotation.x = t > 1.2 && t < 2.6 ? -2.6 + Math.sin(t * 12) * 0.25 : 0; }
  else if (t < 4.9) { const u = (t - 3.4) / 1.5; ped.x = lerp(cut.x0, dx, u); ped.z = lerp(cut.z0, dz, u); ped.h = Math.atan2(dx - cut.x0, dz - cut.z0); ped.fase += dt * 9; MOD.andar(pedM, ped.fase, 1); pedM.userData.bd.rotation.x = 0; }
  else if (t < 5.5) { const u = (t - 4.9) / 0.6; pedM.scale.setScalar(1 - u * 0.75); pedM.position.y = 0.3 + u * 0.3; }
  if (t >= 5.5) { pedM.scale.setScalar(1); pedM.visible = false; ped.x = cut.x0; ped.z = cut.z0; cur = car; cut = null; $('cena').classList.remove('on'); fala(PESSOAS[jog].rotulo, 'Bem-vindo a Oriximiná! Siga a luz da fase 1 aqui na orla, ou ' + (matchMedia('(pointer:coarse)').matches ? 'toque em Mapa' : 'aperte M') + ' e escolha a fase no mapa. As luzes amarelas são os cartões-postais da cidade.', 9); return; }
  $('cena').classList.add('on');
}
function mundo(dt) {
  for (const v of CARS) { v.m.position.set(v.x, distOrla(v.x, v.z) < 8.6 ? 0.32 : 0.07, v.z); v.m.rotation.set(v.arf || 0, v.h, v.rol || 0, 'YXZ'); const r = v.m.userData.rodas; if (r) for (const w of r) w.rotation.x += v.v * dt / v.m.userData.raio; }
  const bob = Math.sin(tAll * 2.2) * 0.07; for (const b of BOATS) { b.m.position.set(b.x, (b.m.userData.glb ? 0 : b === iate ? -1.1 : -0.42) + bob + Math.min(0.25, Math.abs(b.v) * 0.012), b.z); b.m.rotation.set(-Math.min(0.14, Math.abs(b.v) * 0.007), b.h, 0, 'YXZ'); }
  const e = cur === plane && !pausa ? entrada() : { st: 0 };
  plane.m.position.set(plane.x, plane.y + 0.1, plane.z); plane.m.rotation.set(plane.y > 0 ? -clamp(plane.vy / 40, -0.4, 0.4) : 0, plane.h, plane.y > 0 ? e.st * 0.5 : 0, 'YXZ');
  plane.m.userData.helice.rotation.z += (4 + plane.v) * dt * 3; plane.m.userData.disco.material.opacity = clamp(plane.v / 40, 0, 0.35);
  planeSombra.position.set(plane.x, 0.14, plane.z); planeSombra.rotation.y = plane.h; planeSombra.material.opacity = 0.3 * clamp(1 - plane.y / 160, 0, 1);
  uAgua.value = tAll; if (damaMix) damaMix.update(dt); if (rotuloNPC) rotuloNPC.visible = !cut;
  if (pedMix) { const andando = cur === ped && !salto && Math.abs(ped.v) > 0.3 || (cut && cut.t > 3.4 && cut.t < 4.9); const J = FIG[jog]; if (pedAnda) { pedAnda.w.visible = andando; J.parado.w.visible = !andando; if (andando) { pedAnda.act.timeScale = cut ? 1 : Math.max(0.6, Math.abs(ped.v) / 1.4); pedAnda.mix.update(dt); } else pedMix.update(dt); } else pedMix.update(dt); }
  pedM.position.x = ped.x; pedM.position.z = ped.z; if (!cut || cut.t < 4.9) pedM.position.y = ped.y + (ped.y > 0 ? 0 : distOrla(ped.x, ped.z) < 8.6 ? 0.32 : 0.07); pedM.rotation.y = ped.h;
  if (!cut) { if (salto) { MOD.andar(pedM, 0, 0); pedM.userData.be.rotation.x = pedM.userData.bd.rotation.x = salto.st === 'aberto' ? -2.7 : -1.2; pedM.userData.sombra.visible = false; } else { MOD.andar(pedM, ped.fase, clamp(Math.abs(ped.v) / 4, 0, 1)); pedM.userData.sombra.visible = true; } }
  wakeT -= dt; const bw = cur.kind === 'boat' ? cur : boat; if (Math.abs(bw.v) > 3 && wakeT <= 0) { wakeT = 0.07; const w = wake[wakeI++ % wake.length]; w.t = 0; w.m.position.x = bw.x - Math.sin(bw.h) * (bw === iate ? 7 : 3.2); w.m.position.z = bw.z - Math.cos(bw.h) * (bw === iate ? 7 : 3.2); }
  for (const w of wake) { w.t += dt; const k = w.t / 1.8; w.m.material.opacity = k < 1 ? 0.5 * (1 - k) : 0; const s = 1 + k * 4; w.m.scale.set(s, 1, s); }
  for (const c of CPS) if (!c.done) c.g.rotation.y += dt;
  for (const g of marcas.children) g.children[0].rotation.y += dt * 1.5;
  if (anel.visible) { anel.userData.chao.rotation.y += dt * 2; anel.userData.ar.rotation.z += dt; }
  // navio e barcos
  NAV.u = (NAV.u + dt * 4.2 / 5200) % 2; const nu = NAV.u < 1 ? NAV.u : 2 - NAV.u; navio.position.x = lerp(NAV.a[0], NAV.b[0], nu); navio.position.z = lerp(NAV.a[1], NAV.b[1], nu); navio.rotation.y = Math.atan2(NAV.b[0] - NAV.a[0], NAV.b[1] - NAV.a[1]) + (NAV.u < 1 ? 0 : Math.PI);
  reboc.rotation.y = navio.rotation.y; reboc.position.set(navio.position.x + Math.sin(navio.rotation.y) * 110 + Math.cos(navio.rotation.y) * 26, -1.2, navio.position.z + Math.cos(navio.rotation.y) * 110 - Math.sin(navio.rotation.y) * 26);
  for (const b of NPCB) { const T = b.r.acc[b.r.acc.length - 1]; b.s = (b.s + b.sp * dt) % T; const q = pontoEm(b.r.p, b.r.acc, b.s); b.m.position.set(q.x, (b.m.userData.glb ? 0 : -0.35) + Math.sin(tAll * 2 + b.sp) * 0.06, q.z); let d = q.h - b.m.rotation.y; while (d > Math.PI) d -= 6.283; while (d < -Math.PI) d += 6.283; b.m.rotation.y += d * Math.min(1, dt * 2.5); }
  for (const t of TRAF) {
    const L = Math.hypot(t.b.x - t.a.x, t.b.z - t.a.z) || 1; t.u += t.sp * dt / L;
    if (t.u >= 1) { const op = t.b.e.filter(q => q[0] !== t.a && Math.abs(q[0].x) < 1900 && Math.abs(q[0].z) < 1800), nx = op.length ? op[Math.floor(Math.random() * op.length)][0] : t.a; t.a = t.b; t.b = nx; t.u = 0; }
    const hx = t.b.x - t.a.x, hz = t.b.z - t.a.z, h = Math.atan2(hx, hz); t.x = lerp(t.a.x, t.b.x, t.u) + Math.cos(h) * 1.9; t.z = lerp(t.a.z, t.b.z, t.u) - Math.sin(h) * 1.9;
    t.m.position.set(t.x, 0.07, t.z); let d = h - t.m.rotation.y; while (d > Math.PI) d -= 6.283; while (d < -Math.PI) d += 6.283; t.m.rotation.y += d * Math.min(1, dt * 5);
    const r = t.m.userData.rodas; if (r) for (const w of r) w.rotation.x += t.sp * dt / t.m.userData.raio;
  }
  const ja = tAll * 0.045 + 1; jato.position.set(600 + Math.cos(ja) * 2600, 420, -300 + Math.sin(ja) * 2600); jato.rotation.set(0, -ja, -0.25, 'YXZ'); jato.userData.helice.rotation.z += dt * 40;
}
function camara(dt) {
  const v = cur, k = started ? 1 - Math.exp(-dt * 4.5) : 1; let tx, ty, tz, lx, ly, lz;
  if (!started) { const a = tAll * 0.06 + 1.2; tx = pTree.x + Math.cos(a) * 190; tz = pTree.z + Math.sin(a) * 190; ty = 62; lx = pTree.x; ly = 6; lz = pTree.z; }
  else if (cut && cut.t < 3.4) { const a = car.h + Math.PI * 0.5 + (cut.t - 1.7) * 0.16, d = 2.9 - cut.t * 0.32; tx = ped.x + Math.sin(a) * d; tz = ped.z + Math.cos(a) * d; ty = 1.95; lx = ped.x; ly = 1.72; lz = ped.z; }
  else if (cut) { tx = car.x + Math.cos(car.h) * 6 - Math.sin(car.h) * 5; tz = car.z - Math.sin(car.h) * 6 - Math.cos(car.h) * 5; ty = 2.6; lx = car.x; ly = 1.1; lz = car.z; }
  else { const [cd, ch] = salto ? [10, 5] : v.cam, y = v.y || 0; tx = v.x - Math.sin(v.h) * cd; tz = v.z - Math.cos(v.h) * cd; ty = y + ch; lx = v.x + Math.sin(v.h) * 6; ly = y + 1.6 - (salto ? 3 : 0); lz = v.z + Math.cos(v.h) * 6; }
  const kk = cut && cut.t < 0.1 ? 1 : k;
  camera.position.x = lerp(camera.position.x, tx, kk); camera.position.y = lerp(camera.position.y, ty, kk); camera.position.z = lerp(camera.position.z, tz, kk);
  camera.lookAt(lx, ly, lz); { const f = cut ? ped : cur; sun.target.position.set(f.x, 0, f.z); sun.position.set(f.x + SUN_DIR.x * 500, SUN_DIR.y * 500, f.z + SUN_DIR.z * 500); }
  sky.position.copy(camera.position); stars.position.copy(camera.position);
  scene.fog.far = lerp(scene.fog.far, fogBase * (1 + clamp(camera.position.y / 110, 0, 2.6)), 0.05);
}

// ---------- HUD ----------
function hudFase() { $('lab').textContent = 'fases'; $('count').textContent = nFeitas() + '/30'; }
function hudTexto() {
  const v = cur, dO = distOrla(v.x, v.z), perto = Math.hypot(v.x - AERO.patio[0], v.z - AERO.patio[1]) < 900;
  $('rua').textContent = salto ? 'Paraquedas' : v.kind === 'boat' ? 'Rio Trombetas' : v.kind === 'plane' && v.y > 3 ? 'Céu de Oriximiná' : perto ? 'Aeroporto de Oriximiná' : dO < 9 ? 'Orla de Oriximiná' : (streetName(v.x, v.z) || 'Oriximiná');
  $('vel').textContent = v.nome + ((v.y || 0) > 1 ? ' · ' + Math.round(v.y) + ' m de altura' : '');
  $('bAcao').textContent = salto ? 'Abrir paraquedas' : v === ped ? 'Entrar' : v.kind === 'plane' && v.y > 40 ? 'Saltar' : 'Descer';
  document.body.dataset.modo = salto ? 'salto' : v.kind;
  if (M) {
    const f = M.f; $('lab').textContent = 'fase ' + f.n + ' · ' + TIPO[f.tipo].toLowerCase();
    $('count').textContent = f.tipo === 'corrida' ? M.rel.toFixed(0) + ' s' : Math.max(0, Math.ceil(M.tempo)) + ' s';
    let t = f.nome;
    if (f.tipo === 'corrida') { let bi = 0, bd = 1e9; for (let i = 0; i < f.path.length; i++) { const d = Math.hypot(f.path[i][0] - v.x, f.path[i][1] - v.z); if (d < bd) { bd = d; bi = i; } } t = (M.acc[bi] >= M.rs ? '1º' : '2º') + ' lugar · anel ' + Math.min(M.i + 1, f.cps.length) + '/' + f.cps.length; }
    else if (f.tipo === 'salto') { const d = Math.hypot(f.alvo.x - v.x, f.alvo.z - v.z); t = M.i < f.cps.length ? 'Anel ' + (M.i + 1) + '/' + f.cps.length : salto ? 'Alvo a ' + Math.round(d) + ' m' : d < 420 && v.y > 120 ? 'SALTE AGORA (E)' : 'Alvo a ' + Math.round(d) + ' m · suba acima de 150 m'; }
    else if (f.tipo === 'entrega') t = M.par > 0 ? 'Entregando… ' + Math.round(M.par / 1.6 * 100) + '%' : 'Entrega ' + Math.min(M.i + 1, f.cps.length) + '/' + f.cps.length + ' · pare dentro do anel';
    else t = 'Anel ' + Math.min(M.i + 1, f.cps.length) + '/' + f.cps.length + (f.cps[M.i] && f.cps[M.i].y ? ' · altura ' + Math.round(f.cps[M.i].y) + ' m' : '');
    $('alvo').textContent = t;
  } else {
    hudFase(); let nx = null, nd = 1e9; for (const g of marcas.children) { const d = Math.hypot(g.position.x - v.x, g.position.z - v.z); if (d < nd) { nd = d; nx = g.userData.f; } }
    $('alvo').textContent = gps ? 'GPS: ' + gps.nome + ' · ' + Math.round(Math.hypot(gps.x - v.x, gps.z - v.z)) + ' m' : nx ? 'Fase ' + nx.n + ': ' + nx.nome + ' · ' + (nd > 2500 ? (nd / 1000).toFixed(1) + ' km (use o mapa)' : Math.round(nd) + ' m') : 'Todas as fases concluídas';
  }
}
const vg = $('velo'), vx = vg.getContext('2d');
function drawVelo() {
  const v = cur, W = vg.width, c = W / 2, kmh = Math.abs(v.v) * 3.6 * (salto ? 0 : 1), max = v.kind === 'plane' ? 280 : v.kind === 'boat' ? 110 : 140, a0 = Math.PI * 0.75, a1 = Math.PI * 2.25;
  vx.clearRect(0, 0, W, W); if (v.kind === 'ped') return;
  vx.fillStyle = 'rgba(20,10,38,.78)'; vx.beginPath(); vx.arc(c, c, c - 4, 0, 6.3); vx.fill();
  vx.lineWidth = 10; vx.lineCap = 'round'; vx.strokeStyle = 'rgba(255,230,194,.25)'; vx.beginPath(); vx.arc(c, c, c - 22, a0, a1); vx.stroke();
  const u = clamp(kmh / max, 0, 1); vx.strokeStyle = u > 0.8 ? '#ff3d7f' : '#2de2e6'; vx.beginPath(); vx.arc(c, c, c - 22, a0, a0 + (a1 - a0) * u); vx.stroke();
  vx.fillStyle = '#ffe6c2'; vx.font = '700 15px Arial'; vx.textAlign = 'center'; vx.textBaseline = 'middle';
  for (let i = 0; i <= 4; i++) { const a = a0 + (a1 - a0) * i / 4; vx.fillText(Math.round(max * i / 4), c + Math.cos(a) * (c - 46), c + Math.sin(a) * (c - 46)); }
  const an = a0 + (a1 - a0) * u; vx.strokeStyle = '#fff'; vx.lineWidth = 4; vx.beginPath(); vx.moveTo(c, c); vx.lineTo(c + Math.cos(an) * (c - 30), c + Math.sin(an) * (c - 30)); vx.stroke();
  vx.font = "400 46px Anton, Impact, sans-serif"; vx.fillText(Math.round(kmh), c, c + 34); vx.font = '700 12px Arial'; vx.fillStyle = '#2de2e6'; vx.fillText('km/h', c, c + 62);
  if (v.kind === 'car') { vx.lineWidth = 5; vx.strokeStyle = 'rgba(255,230,194,.18)'; vx.beginPath(); vx.arc(c, c, c - 36, a0, a1); vx.stroke(); vx.strokeStyle = rpm > 0.9 ? '#ff3d7f' : '#ff8a3d'; vx.beginPath(); vx.arc(c, c, c - 36, a0, a0 + (a1 - a0) * rpm); vx.stroke(); vx.fillStyle = '#ffd23a'; vx.font = "400 26px Anton, Impact, sans-serif"; vx.fillText(marcha + 'ª', c, c - 22); }
  // acelerador
  const ac = v.kind === 'plane' ? v.thr : thrIn; vx.fillStyle = 'rgba(255,230,194,.25)'; vx.fillRect(c - 44, W - 30, 88, 8); vx.fillStyle = '#ff8a3d'; vx.fillRect(c - 44, W - 30, 88 * ac, 8);
  vx.fillStyle = 'rgba(255,230,194,.25)'; vx.fillRect(c - 44, W - 18, 88, 6); vx.fillStyle = nitroOn ? '#fff' : '#4ad8ff'; vx.fillRect(c - 44, W - 18, 88 * nitro, 6);
}
function resize() { const w = innerWidth, h = innerHeight; renderer.setSize(w, h, false); camera.aspect = w / h; camera.updateProjectionMatrix(); if ($('mapa').classList.contains('on')) drawMapa(); }
addEventListener('resize', resize); resize(); applyTime();
// mobile, sem depender do sistema: a barra do navegador muda o tamanho da tela e nem sempre dispara 'resize'
addEventListener('orientationchange', () => setTimeout(resize, 250)); if (window.visualViewport) visualViewport.addEventListener('resize', resize);
for (const ev of ['gesturestart', 'gesturechange', 'dblclick']) document.addEventListener(ev, e => e.preventDefault(), { passive: false });
document.addEventListener('contextmenu', e => { if (!/^(INPUT|TEXTAREA)$/.test(e.target.tagName)) e.preventDefault(); });
document.addEventListener('visibilitychange', () => { if (!AC) return; try { if (document.hidden) { AC.suspend(); if (mudo) mudo.pause(); } else destravarSom(); } catch (e) {} });
for (const ev of ['touchend', 'pointerup', 'click', 'keydown']) addEventListener(ev, () => { if (AC && (AC.state !== 'running' || (mudo && mudo.paused))) destravarSom(); }, { passive: true });
renderer.domElement.addEventListener('webglcontextlost', e => { e.preventDefault(); $('perdeu').classList.add('on'); });
$('perdeuOk').onclick = () => location.reload();
{ const retrato = matchMedia('(orientation:portrait)'), toque = matchMedia('(pointer:coarse)'); let dispensado = false;
  const ver = () => $('gira').classList.toggle('on', started && toque.matches && retrato.matches && !dispensado);
  $('giraOk').onclick = () => { dispensado = true; ver(); }; (retrato.addEventListener ? retrato.addEventListener('change', ver) : retrato.addListener(ver)); addEventListener('resize', ver); window.__verGira = ver; }
if (has('foto')) { $('title').style.display = 'none'; }
// teste no computador: #toque aplica o layout de toque sem precisar de um celular
if (has('toque')) for (const folha of document.styleSheets) { try { for (const r of folha.cssRules) if (r.media && r.media.mediaText.includes('pointer')) r.media.mediaText = r.media.mediaText.replace(/\(pointer:\s*coarse\)/g, 'all'); } catch (e) {} }
camera.position.set(car.x, 60, car.z);
let nFr = 0;
function frame(now) {
  const dt = Math.min(0.05, (now - last) / 1000); last = now;
  const t0 = performance.now(); step(dt); const t1 = performance.now(); renderer.render(scene, camera); if (started) { drawMini(); drawVelo(); } if (has('log') && (nFr++ < 4)) console.log('F', nFr, Math.round(t1 - t0), Math.round(performance.now() - t1), renderer.info.render.calls, renderer.info.render.triangles);
  requestAnimationFrame(frame);
}
if (has('log')) console.log('M6', Math.round(performance.now()));
// atalhos de teste pela URL (#auto-f8, #auto-mapa, #auto-ar, #auto-salto, #cena)
if (has('auto') || has('cena')) start();
const ff = FLAGS.find(f => /^f\d+$/.test(f)); if (ff && started) iniciar(FASES[+ff.slice(1) - 1]);
if (has('ar') && started) { cur = plane; porVeiculo(plane, 300, -300, 2.4, 220, 55); }
if (has('salto') && started) { cur = plane; porVeiculo(plane, -100, 100, 2.4, 260, 50); pular(); if (has('aberto')) abrirChute(); }
if (has('aero') && started) POIS[0].ir();
if (has('pe') && started) { cur = ped; pedM.visible = true; }
if (has('warp')) { for (let i = 0; i < 240; i++) step(1 / 30); }
if (has('cenaw')) { for (let i = 0; i < 60; i++) step(1 / 30); }
if (has('mapa') && started) { abrirMapa(); if (ff) selecionar(FASES[+ff.slice(1) - 1]); }
if (has('teste')) { // roda todas as fases por alguns segundos e escreve o resultado no título
  let erros = []; start();
  for (const f of FASES) { try { iniciar(f); fecharCartaz(); M.st = 'run'; for (let i = 0; i < 90; i++) step(1 / 30); if (M) encerrar(); fecharCartaz(); } catch (e) { erros.push(f.n + ': ' + e.message); } }
  try { cur = plane; porVeiculo(plane, 0, 0, 1, 200, 50); pular(); for (let i = 0; i < 1200 && salto; i++) step(1 / 30); abrirMapa(); selecionar(FASES[0]); fecharMapa(); drawMini(); drawVelo(); } catch (e) { erros.push('salto/mapa: ' + e.message); }
  document.title = 'TESTE ' + (erros.length ? 'ERRO ' + erros.join(' | ') : 'OK 30 fases');
}
requestAnimationFrame(frame);
if (has('info')) setTimeout(() => { document.title = 'INFO chamadas ' + renderer.info.render.calls + ' tris ' + renderer.info.render.triangles; }, 1500);
window.__jogo = { VS, FASES, CPS, step, iniciar, SAVE };
