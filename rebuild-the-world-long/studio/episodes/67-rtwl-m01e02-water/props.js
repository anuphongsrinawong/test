// props.js - 67-rtwl-m01e02-water: the episode's props and LAB holograms. Continuity from 01.01 (the dirt map, the base
// stick, the direction stick + pebbles, the dead branch) is rebuilt here exactly where 01.01 left it. New: the torn leaf
// cup (made on screen), the two cups of the cold open, animal tracks at the river, the clay-bank puddle, the still
// jungle pool (larvae, tracks, droppings, rotting leaves), the rock seep at the waterfall, the water-source marks.
import * as THREE from 'three';
import { V, clamp, lerp, range, sstep, eio, eout, eback, rng } from 'toonkit';
import { box, cyl, sph, nf, put, group, glow } from '/lib/diorama.js';
import { W3, LB3, canvasPlane, dashLine, bush, ZN, Z } from '/series/rtw/kit/index.js';
import { ground, REF } from '/series/rtw/long/longkit.js';

const PI = Math.PI;
export const BED = [];
const STICK = [3.2, 1.6], MAPC = [-1.6, -1.72], TREE = ZN.TREE;
const TIP1 = [STICK[0] - 1.05, STICK[1] - 0.3], TIP2 = [STICK[0] - 0.5, STICK[1] - 0.34];
const CUPS = [22.4, -1.0], POOL = [-1.2, -6.0], SEEP = [3.3, 1.0];
const FONT = '"Leelawadee UI", Prompt, Tahoma, sans-serif';
export const LABEL_AT = {
  MUD: () => W3(CUPS[0] - 0.22, 0.7, CUPS[1]), CLEAR: () => W3(CUPS[0] + 0.22, 0.7, CUPS[1]),
  SED: () => LB3(-0.55, 1.65, 0.6), MIC: () => LB3(0.5, 2.35, 0.6), HAIR: () => LB3(-1.4, 2.0, 0.1), BAC: () => LB3(0.9, 1.74, 0.1),
  ANIMAL: () => LB3(-1.55, 2.25, 0.05), RTRACKS: () => W3(25.0, 0.05, -5.0), LARVA: () => ground('DEEPJUNGLE', POOL[0] - 0.05, POOL[1] + 0.05, 0.02),
  PTRACKS: () => ground('DEEPJUNGLE', POOL[0] - 0.9, POOL[1] - 0.9, 0.05), SEEP: () => ground('WATERFALL', SEEP[0] - 0.25, SEEP[1], 1.45),
  LAYERS: () => LB3(-0.9, 1.6, 0.05),
};
// lines where Zero holds the leaf cup; when his right hand is busy (think / stop / shade / point / raise) the cup goes to the left hand
const HELD = ['river', 'measure', 'senses', 'back', 'tracks', 'mid', 'puddle', 'dip', 'settle', 'fail1', 'rapids', 'slip', 'pool', 'best', 'kneel', 'wiggle', 'leak', 'test', 'sip', 'real', 'ragged', 'sharp'];
const BUSY_R = ['think', 'stop', 'shade', 'point', 'raise', 'chin'];
const cupLeft = (s) => HELD.includes(s.id) && BUSY_R.includes(s.z?.hand);
const CROUCH_HOLD = ['five', 'rank', 'wiggle', 'clean'];   // a crouch that continues the previous line's crouch (no stand-up bob at the line start)
const ink = (c, w, col = 'rgba(45,26,10,1)') => { c.strokeStyle = col; c.lineWidth = w * 1.6; c.lineCap = 'round'; c.lineJoin = 'round'; };
// a leaf cone (the torn leaf cup): a green cone with a ragged rim + optional water disc
function leafCup(parent, { water = null } = {}) {
  const g = group(parent), leafM = nf(0x3f8a32), vein = nf(0x8fbf5a);
  const cone = put(g, new THREE.ConeGeometry(0.11, 0.22, 14, 1, true), leafM, 0, 0, 0, 0.002); cone.rotation.x = PI; cone.position.y = 0.11;
  cone.material.side = THREE.DoubleSide;
  for (let i = 0; i < 7; i++) { const a = (i / 7) * PI * 2, tooth = put(g, new THREE.ConeGeometry(0.022, 0.05 + 0.03 * ((i * 37) % 3), 4), leafM, Math.cos(a) * 0.1, 0.235, Math.sin(a) * 0.1, 0.001); tooth.rotation.z = -Math.cos(a) * 0.3; tooth.rotation.x = Math.sin(a) * 0.3; }
  if (water) { g.userData.water = put(g, new THREE.CircleGeometry(0.095, 20), new THREE.MeshBasicMaterial({ color: water, transparent: true, opacity: 0.85 }), 0, 0.2, 0, 0); g.userData.water.rotation.x = -PI / 2; }
  return g;
}

export async function buildEp(K, IX) {
  const { api, T, lines, A } = K, { scene } = api;
  const wood = nf(0x8a6a40), pebM = nf(0x9a9284), dung = nf(0x5a4028);
  const P = {};
  // ================================================================ continuity from 01.01
  { const st = group(scene, ...W3(STICK[0], -0.12, STICK[1]).toArray()); put(st, cyl(0.016, 0.022, 1.15, 7), wood, 0, 0.575, 0, 0.0015, true);
    for (const tp of [TIP1, TIP2]) { const p = put(scene, sph(0.05, 8, 6), pebM, ...W3(tp[0], 0.035, tp[1]).toArray(), 0.002); p.scale.y = 0.6; } }
  { const g = group(scene, ...W3(TREE[0] + 0.55, 5.3, TREE[1] + 0.55).toArray()); g.rotation.set(0, PI / 4 + 0.15, 0);
    const gm = nf(0xa89c8a), arm = group(g, 0, 0, 0); arm.rotation.x = 0.55;
    const br = put(arm, cyl(0.09, 0.2, 4.4, 9), gm, 0, 0, 2.2, 0.003, true); br.rotation.x = PI / 2;
    for (let i = 0; i < 5; i++) { const tw = put(arm, cyl(0.02, 0.045, 1.1, 6), gm, 0.12 * (i % 2 ? 1 : -1), 0.1, 1.4 + i * 0.6, 0.0015, true); tw.rotation.set(0.4, 0, (i % 2 ? 1 : -1) * 0.9); } }
  // the map (all of 01.01's layers) + the water marks added at the end
  P.mapNew = [];
  { const layer = (draw, isNew) => { const m = canvasPlane(scene, 1.7, 1.2, draw, { px: 512 }); m.material.transparent = true; m.rotation.x = -PI / 2; m.position.copy(W3(MAPC[0], 0.012 + (P.mapNew.length + (isNew ? 10 : 0)) * 0.001, MAPC[1])); if (isNew) { m.visible = false; P.mapNew.push(m); } return m; };
    layer((c, cw, ch) => {
      c.fillStyle = 'rgba(150,110,70,0.55)'; c.beginPath(); c.roundRect(10, 10, cw - 20, ch - 20, 60); c.fill();
      ink(c, 14); c.beginPath(); c.moveTo(cw * 0.86, ch * 0.95); c.bezierCurveTo(cw * 0.78, ch * 0.7, cw * 0.9, ch * 0.4, cw * 0.72, ch * 0.08); c.stroke(); ink(c, 6); c.beginPath(); c.moveTo(cw * 0.9, ch * 0.95); c.lineTo(cw * 0.95, ch * 0.86); c.stroke();
      ink(c, 7); for (let i = 0; i < 6; i++) { const x = cw * (0.08 + 0.07 * (i % 2)), y = ch * (0.15 + i * 0.13); c.beginPath(); c.arc(x, y, cw * 0.035, 0, 7); c.stroke(); }
      ink(c, 8); c.beginPath(); for (let i = 0; i <= 10; i++) c.lineTo(cw * (0.12 + i * 0.07), ch * (0.9 + (i % 2) * 0.05)); c.stroke();
      for (const [x, y] of [[0.74, 0.12], [0.8, 0.8], [0.4, 0.86], [0.2, 0.84]]) { c.beginPath(); c.moveTo(cw * x - 18, ch * y - 18); c.lineTo(cw * x + 18, ch * y + 18); c.moveTo(cw * x + 18, ch * y - 18); c.lineTo(cw * x - 18, ch * y + 18); c.stroke(); }
      ink(c, 9); c.beginPath(); c.arc(cw * 0.48, ch * 0.5, cw * 0.06, 0, 7); c.stroke();
    }, false);
    // new: a drop (the seep, near the waterfall at the river's upstream end: bottom right), a circle (river, OK), X on the pool (west), X on the puddle
    layer((c, cw, ch) => { ink(c, 8, 'rgba(45,26,10,1)'); const drop = (x, y, s) => { c.beginPath(); c.moveTo(x, y - s); c.quadraticCurveTo(x + s * 0.8, y + s * 0.2, x, y + s * 0.6); c.quadraticCurveTo(x - s * 0.8, y + s * 0.2, x, y - s); c.stroke(); }; drop(cw * 0.92, ch * 0.9, 26); }, true);
    layer((c, cw, ch) => { ink(c, 7, 'rgba(45,26,10,1)'); c.beginPath(); c.arc(cw * 0.82, ch * 0.55, 22, 0, 7); c.stroke(); }, true);
    layer((c, cw, ch) => { ink(c, 9, 'rgba(45,26,10,1)'); for (const [x, y] of [[0.16, 0.42], [0.78, 0.3]]) { c.beginPath(); c.moveTo(cw * x - 20, ch * y - 20); c.lineTo(cw * x + 20, ch * y + 20); c.moveTo(cw * x + 20, ch * y - 20); c.lineTo(cw * x - 20, ch * y + 20); c.stroke(); } }, true);
    const bs = group(scene, ...W3(MAPC[0] - 0.04, -0.05, MAPC[1]).toArray()); put(bs, cyl(0.014, 0.02, 0.9, 7), wood, 0, 0.45, 0, 0.0015, true); }
  P.drawStick = group(scene); put(P.drawStick, cyl(0.012, 0.018, 0.75, 7), wood, 0, 0.37, 0, 0.0015, true);
  // ================================================================ the cold open: two leaf cups on a flat stone at the river
  { const st = put(scene, cyl(0.42, 0.48, 0.32, 14), nf(0x9a9284), ...W3(CUPS[0], 0.16, CUPS[1]).toArray(), 0.003, true); st.scale.z = 0.7;
    P.cupMud = leafCup(scene, { water: 0x8a6438 }); P.cupMud.position.copy(W3(CUPS[0] - 0.22, 0.32, CUPS[1]));
    P.cupClear = leafCup(scene, { water: 0x9fe4ff }); P.cupClear.position.copy(W3(CUPS[0] + 0.22, 0.32, CUPS[1])); P.cupClear.userData.water.material.opacity = 0.45;
    P.cupMud.scale.setScalar(1.7); P.cupClear.scale.setScalar(1.7); P.cupsAt = [P.cupMud, P.cupClear]; }
  // ================================================================ the cup Zero carries (a flat leaf first, then the torn cone)
  P.leafFlat = group(scene); { const l = put(P.leafFlat, sph(0.2, 12, 8), nf(0x3f8a32), 0, 0, 0, 0.002); l.scale.set(0.65, 0.06, 1.25); put(P.leafFlat, cyl(0.008, 0.008, 0.5, 4), nf(0x8fbf5a), 0, 0.02, 0, 0.0005).rotation.x = PI / 2; }
  P.cup = leafCup(scene, { water: 0x9fd8f0 }); P.cup.userData.water.visible = false;
  P.cup2 = leafCup(scene, { water: 0x9fd8f0 });
  // ================================================================ river: animal tracks to the water's edge
  { const tr = canvasPlane(scene, 1.2, 2.6, (c, cw, ch) => { c.fillStyle = 'rgba(38,24,12,0.95)'; for (let i = 0; i < 9; i++) { const x = cw * (0.3 + 0.38 * (i % 2)), y = ch * (0.06 + i * 0.11); c.beginPath(); c.ellipse(x, y, cw * 0.11, ch * 0.032, 0.3, 0, 7); c.fill(); c.beginPath(); c.ellipse(x - cw * 0.07, y - ch * 0.045, cw * 0.035, ch * 0.018, 0, 0, 7); c.fill(); c.beginPath(); c.ellipse(x + cw * 0.07, y - ch * 0.045, cw * 0.035, ch * 0.018, 0, 0, 7); c.fill(); } }, { px: 256 });
    tr.material.transparent = true; tr.rotation.set(-PI / 2, 0, -1.0); tr.position.copy(W3(25.4, 0.04, -5.2)); }
  // ================================================================ clay bank: a muddy puddle
  { const p = ground('CLAYBANK', 0.5, -7.6, 0.02); const pd = put(scene, new THREE.CircleGeometry(0.95, 28), new THREE.MeshBasicMaterial({ color: 0x8a6a40 }), p.x, p.y, p.z, 0); pd.rotation.x = -PI / 2; pd.scale.set(1.3, 0.85, 1);
    const ring = put(scene, new THREE.RingGeometry(0.95, 1.12, 28), new THREE.MeshBasicMaterial({ color: 0x5a4430 }), p.x, p.y - 0.004, p.z, 0); ring.rotation.x = -PI / 2; ring.scale.set(1.3, 0.85, 1); }
  // ================================================================ the deep-jungle pool
  { const p = ground('DEEPJUNGLE', POOL[0], POOL[1], 0.03); P.poolC = p;
    const mud = put(scene, new THREE.CircleGeometry(1.6, 32), nf(0x4a3420), p.x, p.y - 0.012, p.z, 0); mud.rotation.x = -PI / 2;
    const bed = put(scene, new THREE.CircleGeometry(1.15, 32), new THREE.MeshBasicMaterial({ color: 0x9a8a5a }), p.x, p.y - 0.006, p.z, 0); bed.rotation.x = -PI / 2;
    const R = rng(13);
    for (let i = 0; i < 9; i++) { const a = R() * 6.28, r = R() * 0.9; const lf = put(scene, sph(0.08, 8, 5), nf(i % 2 ? 0x6a5228 : 0x7a6a30), p.x + Math.cos(a) * r, p.y - 0.004, p.z + Math.sin(a) * r, 0.0005); lf.scale.set(1.3, 0.05, 0.7); lf.rotation.y = R() * 6.28; }
    const wat = put(scene, new THREE.CircleGeometry(1.15, 32), new THREE.MeshBasicMaterial({ color: 0x6fc8ff, transparent: true, opacity: 0.38, depthWrite: false }), p.x, p.y + 0.01, p.z, 0); wat.rotation.x = -PI / 2;
    const shine = put(scene, new THREE.RingGeometry(0.75, 0.82, 32, 1, 0.4, 1.4), new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.55, depthWrite: false }), p.x, p.y + 0.012, p.z, 0); shine.rotation.x = -PI / 2;
    // larvae: tiny dark wrigglers (pure functions of t)
    P.larvae = Array.from({ length: 22 }, (_, i) => { const a = R() * 6.28, r = 0.1 + R() * 0.75; const m = put(scene, new THREE.CapsuleGeometry(0.014, 0.05, 3, 6), nf(0x1a140c), p.x + Math.cos(a) * r, p.y, p.z + Math.sin(a) * r, 0); m.userData = { y0: p.y, ph: R() * 6.28 }; return m; });
    // tracks in the mud ring + droppings
    const tr = canvasPlane(scene, 2.6, 2.6, (c, cw, ch) => { c.fillStyle = 'rgba(40,26,14,0.9)'; const R2 = rng(4); for (let i = 0; i < 22; i++) { const a = R2() * 6.28, r = cw * (0.36 + 0.1 * R2()); const x = cw / 2 + Math.cos(a) * r, y = ch / 2 + Math.sin(a) * r; c.beginPath(); c.ellipse(x, y, cw * 0.022, ch * 0.014, a, 0, 7); c.fill(); for (let k = 0; k < 3; k++) { c.beginPath(); c.arc(x + Math.cos(a + 1.6 + k * 0.5) * cw * 0.02, y + Math.sin(a + 1.6 + k * 0.5) * cw * 0.02, cw * 0.006, 0, 7); c.fill(); } } }, { px: 512 });
    tr.material.transparent = true; tr.rotation.x = -PI / 2; tr.position.set(p.x, p.y - 0.002, p.z);
    for (let i = 0; i < 6; i++) { const q = ground('DEEPJUNGLE', POOL[0] - 1.0 + 0.12 * Math.sin(i * 2), POOL[1] - 0.95 + 0.1 * Math.cos(i * 3), 0.03); put(scene, sph(0.035, 6, 5), dung, q.x, q.y, q.z, 0.001).scale.set(1.4, 0.7, 1); } }
  // ================================================================ the waterfall: a mossy rock wall with a seep + falling drips
  { const p = ground('WATERFALL', SEEP[0], SEEP[1]); const g = group(scene, p.x, p.y, p.z); P.seepG = g;
    const rockM = nf(0x8f8a80), rock2 = nf(0x7f7a72), moss = A.mat('moss', { rep: [1, 1] });
    const b1 = put(g, sph(1.0, 20, 14), rockM, 0.75, 0.75, 0, 0.004, true); b1.scale.set(0.85, 1.25, 1.15);
    const b2 = put(g, sph(0.8, 16, 12), rock2, 0.9, 0.4, 1.15, 0.004, true); b2.scale.set(0.9, 0.7, 0.9);
    const b3 = put(g, sph(0.7, 16, 12), rock2, 0.85, 0.35, -1.1, 0.004, true); b3.scale.set(0.9, 0.75, 0.9);
    const mz = put(g, sph(0.5, 14, 10), moss, 0.02, 0.55, 0.25, 0.002); mz.scale.set(0.15, 0.9, 1.1);
    const crack = put(g, box(0.03, 0.5, 0.04), new THREE.MeshBasicMaterial({ color: 0x1a1a14 }), -0.08, 1.3, -0.05, 0); crack.rotation.x = 0.15;
    const streak = put(g, box(0.02, 0.55, 0.1), new THREE.MeshBasicMaterial({ color: 0x4a6a7a, transparent: true, opacity: 0.6 }), -0.08, 1.0, -0.05, 0);
    P.drips = Array.from({ length: 3 }, () => put(scene, sph(0.018, 8, 6), new THREE.MeshBasicMaterial({ color: 0xcfefff }), 0, 0, 0, 0));
    P.dripTop = ground('WATERFALL', SEEP[0] - 0.2, SEEP[1] - 0.05, 1.08); P.cupAt = ground('WATERFALL', SEEP[0] - 0.32, SEEP[1] - 0.05, 0.42); }

  // ================================================================ LAB
  const lab = group(scene, ...LB3(0, 0, 0).toArray());
  const holo = (w, h, draw, px = 1024) => { const m = canvasPlane(lab, w, h, draw, { px }); m.visible = false; return m; };
  // 1) the magnified drop: a big glassy sphere with sediment (brown) and microbes (capsules)
  P.drop = group(lab, 0, 2.0, 0); P.drop.visible = false;
  { put(P.drop, sph(0.95, 32, 20), new THREE.MeshBasicMaterial({ color: 0x7fd0ff, transparent: true, opacity: 0.22, depthWrite: false }), 0, 0, 0, 0);
    const R = rng(3); P.sed = []; P.mic = [];
    for (let i = 0; i < 16; i++) { const v = new THREE.Vector3(R() - 0.5, R() - 0.5, R() - 0.5).normalize().multiplyScalar(0.75 * Math.cbrt(R())); const m = put(P.drop, new THREE.DodecahedronGeometry(0.05 + 0.04 * R()), nf(i % 3 ? 0x8a6a40 : 0x6a8a3a), v.x, v.y, v.z, 0.002); P.sed.push(m); }
    for (let i = 0; i < 26; i++) { const v = new THREE.Vector3(R() - 0.5, R() - 0.5, R() - 0.5).normalize().multiplyScalar(0.8 * Math.cbrt(R())); const m = put(P.drop, new THREE.CapsuleGeometry(0.018, 0.05, 3, 6), nf([0xff5a4a, 0xff9a3a, 0xc85aff][i % 3]), v.x, v.y, v.z, 0.001); m.rotation.set(R() * 3, R() * 3, 0); P.mic.push(m); } }
  // 2) the scale: a hair (a thick rod) vs a bacterium (a speck)
  P.hair = put(lab, cyl(0.12, 0.12, 3.4, 18), nf(0x3a2a20), 0, 2.0, 0, 0.003); P.hair.rotation.z = PI / 2; P.hair.visible = false;
  P.bac = put(lab, new THREE.CapsuleGeometry(0.012, 0.03, 3, 6), nf(0xff5a4a), 0.9, 1.7, 0.15, 0.001); P.bac.rotation.z = 0.6; P.bac.visible = false;
  P.bacRing = put(lab, new THREE.RingGeometry(0.07, 0.085, 24), new THREE.MeshBasicMaterial({ color: 0xff5a4a, transparent: true, opacity: 0.9 }), 0.9, 1.7, 0.16, 0); P.bacRing.visible = false;
  // 3) the river diagram: upstream (left) an animal at the water, the current carrying dots downstream (right)
  P.riverD = holo(4.0, 1.8, (c, cw, ch) => {
    c.fillStyle = 'rgba(10,40,60,0.75)'; c.beginPath(); c.roundRect(8, 8, cw - 16, ch - 16, 40); c.fill(); c.lineWidth = 8; c.strokeStyle = '#7fe8ff'; c.stroke();
    c.fillStyle = 'rgba(60,170,230,0.85)'; c.beginPath(); c.moveTo(cw * 0.05, ch * 0.5); c.bezierCurveTo(cw * 0.35, ch * 0.3, cw * 0.6, ch * 0.75, cw * 0.95, ch * 0.5); c.lineTo(cw * 0.95, ch * 0.68); c.bezierCurveTo(cw * 0.6, ch * 0.92, cw * 0.35, ch * 0.48, cw * 0.05, ch * 0.68); c.closePath(); c.fill();
    c.fillStyle = '#ffd23f'; c.font = `800 ${ch * 0.085}px ${FONT}`; c.textAlign = 'center'; c.fillText('UPSTREAM', cw * 0.18, ch * 0.2); c.fillText('DOWNSTREAM', cw * 0.8, ch * 0.2);
    c.fillStyle = '#c89a6a'; c.beginPath(); c.ellipse(cw * 0.12, ch * 0.4, cw * 0.05, ch * 0.06, 0, 0, 7); c.fill(); c.beginPath(); c.arc(cw * 0.17, ch * 0.33, ch * 0.04, 0, 7); c.fill();
    for (let i = 0; i < 4; i++) { c.fillRect(cw * (0.09 + i * 0.022), ch * 0.44, cw * 0.008, ch * 0.08); }
    c.strokeStyle = '#ffffff'; c.lineWidth = 6; c.beginPath(); c.moveTo(cw * 0.3, ch * 0.58); c.lineTo(cw * 0.8, ch * 0.6); c.stroke(); c.beginPath(); c.moveTo(cw * 0.76, ch * 0.54); c.lineTo(cw * 0.8, ch * 0.6); c.lineTo(cw * 0.76, ch * 0.66); c.stroke();
  });
  P.riverD.position.set(0, 1.95, 0);
  P.flow = Array.from({ length: 10 }, () => { const m = put(lab, sph(0.035, 8, 6), new THREE.MeshBasicMaterial({ color: 0xff5a4a }), 0, 0, 0, 0); m.visible = false; return m; });
  // 4) the still-pool diagram: a bowl, no inlet / outlet, sediment settled at the bottom, microbes floating above
  P.poolD = holo(3.6, 1.8, (c, cw, ch) => {
    c.fillStyle = 'rgba(10,40,60,0.75)'; c.beginPath(); c.roundRect(8, 8, cw - 16, ch - 16, 40); c.fill(); c.lineWidth = 8; c.strokeStyle = '#7fe8ff'; c.stroke();
    c.fillStyle = 'rgba(110,190,230,0.55)'; c.beginPath(); c.moveTo(cw * 0.15, ch * 0.35); c.quadraticCurveTo(cw * 0.5, ch * 1.15, cw * 0.85, ch * 0.35); c.closePath(); c.fill();
    c.fillStyle = '#8a6a40'; c.beginPath(); c.moveTo(cw * 0.32, ch * 0.66); c.quadraticCurveTo(cw * 0.5, ch * 0.86, cw * 0.68, ch * 0.66); c.quadraticCurveTo(cw * 0.5, ch * 0.74, cw * 0.32, ch * 0.66); c.fill();
    const R = rng(8); for (let i = 0; i < 18; i++) { c.fillStyle = ['#ff5a4a', '#ff9a3a', '#c85aff'][i % 3]; c.beginPath(); c.ellipse(cw * (0.3 + 0.4 * R()), ch * (0.4 + 0.18 * R()), cw * 0.008, ch * 0.016, R() * 3, 0, 7); c.fill(); }
    c.fillStyle = '#ffd23f'; c.font = `800 ${ch * 0.09}px ${FONT}`; c.textAlign = 'center'; c.fillText('NO WAY IN · NO WAY OUT', cw * 0.5, ch * 0.18);
    c.fillStyle = '#fff'; c.font = `700 ${ch * 0.075}px ${FONT}`; c.fillText('SEDIMENT SINKS = WATER LOOKS CLEAR', cw * 0.5, ch * 0.93);
  });
  P.poolD.position.set(0, 1.75, 0);
  // 5) groundwater: soil + rock layers, rain soaking down, a seep coming out of the side
  P.gwD = holo(4.0, 2.0, (c, cw, ch) => {
    c.fillStyle = 'rgba(10,40,60,0.7)'; c.beginPath(); c.roundRect(8, 8, cw - 16, ch - 16, 40); c.fill(); c.lineWidth = 8; c.strokeStyle = '#7fe8ff'; c.stroke();
    const band = (y0, y1, col) => { c.fillStyle = col; c.fillRect(cw * 0.06, ch * y0, cw * 0.7, ch * (y1 - y0)); };
    band(0.25, 0.35, '#6a8a3a'); band(0.35, 0.55, '#8a6a40'); band(0.55, 0.8, '#7a7a80'); band(0.8, 0.92, '#5a5a62');
    c.strokeStyle = '#9fe4ff'; c.lineWidth = 6; c.setLineDash([14, 12]);
    for (let i = 0; i < 5; i++) { const x = cw * (0.15 + i * 0.12); c.beginPath(); c.moveTo(x, ch * 0.12); c.lineTo(x + cw * 0.04, ch * 0.62); c.lineTo(cw * 0.76, ch * 0.66); c.stroke(); }
    c.setLineDash([]); c.fillStyle = '#9fe4ff'; for (let i = 0; i < 3; i++) { c.beginPath(); c.arc(cw * 0.8, ch * (0.7 + i * 0.07), cw * 0.01, 0, 7); c.fill(); }
    c.fillStyle = '#fff'; c.font = `800 ${ch * 0.075}px ${FONT}`; c.textAlign = 'left'; c.fillText('SOIL', cw * 0.08, ch * 0.47); c.fillText('ROCK', cw * 0.08, ch * 0.7);
    c.textAlign = 'center'; c.fillStyle = '#ffd23f'; c.fillText('SEEP', cw * 0.86, ch * 0.6);
  });
  P.gwD.position.set(0, 1.85, 0);

  // ---- beds by place
  const bedOf = (s) => (s.at === 'LAB' ? null : ['RAPIDS', 'CLAYBANK', 'WATERFALL'].includes(s.at) || (s.at || 'WILD') === 'WILD' && (s.z?.at?.[0] ?? s.cam?.pos?.[0] ?? 0) > 15 ? 'el_river_bed' : 'el_forest_bed');
  let bedDone = false;
  const tAt = (id, dt = 0) => T.l[IX[id]] + dt;
  const inL = (t, a, b) => t >= T.l[IX[a]] && t < (b ? T.l[IX[b]] : 1e9);
  const handsMid = (rig) => rig.handL.position.clone().add(rig.handR.position).multiplyScalar(0.5);

  return {
    update(t, S) {
      if (!bedDone && T.ready) {
        bedDone = true; let cur = null, t0 = 0;
        lines.forEach((s, i) => { const b = bedOf(s); if (b !== cur) { if (cur) BED.push([cur, +t0.toFixed(2), +T.l[i].toFixed(2)]); cur = b; t0 = T.l[i]; } });
        if (cur) BED.push([cur, +t0.toFixed(2), +T.d.toFixed(2)]);
      }
      const rig = S.rig, id = lines[S.li].id, cam = S.camera;
      // the leaf: flat leaf in the hand during 'leaf' after the pick, torn cone from 'fold' to the pool's dump, again at the seep
      const pick = tAt('leaf', 2.6);
      P.leafFlat.visible = id === 'leaf' && t > pick || id === 'fold' && t < tAt('fold', 2.2);
      if (P.leafFlat.visible) { P.leafFlat.position.copy(id === 'fold' ? handsMid(rig) : rig.handR.position); P.leafFlat.rotation.set(0.3, rig.root.rotation.y, 0.2); }
      const held = (id === 'fold' && t >= tAt('fold', 2.2)) || HELD.includes(id);
      P.cup.visible = held && S.spec;
      if (P.cup.visible) {
        const two = ['kneel', 'wiggle', 'leak', 'test', 'sip', 'river', 'dip', 'fold'].includes(id);
        P.cup.position.copy(two ? handsMid(rig) : cupLeft(lines[S.li]) ? rig.handL.position : rig.handR.position).add(V(0, -0.06, 0)); P.cup.rotation.set(0, rig.root.rotation.y, 0);
        const full = ['kneel', 'wiggle', 'measure', 'senses', 'leak', 'test', 'sip'].includes(id) || (id === 'river' && t > tAt('river', 1.3)) || (id === 'dip' && t > tAt('dip', 1.3));
        P.cup.userData.water.visible = full; P.cup.userData.water.material.color.setHex(id === 'dip' ? 0x8a6438 : 0x9fd8f0);
        if (id === 'wiggle') P.cup.rotation.z = 0;
      }
      // the cup on the seep (placed under the drips, filling)
      const onSeep = inL(t, 'place', 'leak') && t > tAt('place', 1.2);
      P.cup2.visible = onSeep; if (onSeep) { P.cup2.position.copy(P.cupAt); const fill = sstep(range(t, tAt('place', 1.2), tAt('full', 4.0))); P.cup2.userData.water.position.y = lerp(0.04, 0.2, fill); P.cup2.userData.water.scale.setScalar(lerp(0.3, 1, fill)); }
      // the drips: three drops on a 1.1 s cycle from the crack down to the cup (or the ground)
      P.drips.forEach((m, i) => { const k = ((t + i * 0.37) % 1.1) / 1.1; m.position.copy(P.dripTop).lerp(P.cupAt.clone().add(V(0, 0.22, 0)), k * k); m.visible = inL(t, 'seep', 'later') && S.at === 'WATERFALL'; });
      // larvae wriggle up and down
      for (const m of P.larvae) { const u = t * 1.7 + m.userData.ph; m.position.y = m.userData.y0 - 0.03 + 0.025 * Math.abs(Math.sin(u)); m.rotation.z = 0.8 * Math.sin(u * 6); }
      // the draw stick (the map, end)
      if (id === 'mapadd') { P.drawStick.visible = true; P.drawStick.position.copy(rig.handR.position); P.drawStick.quaternion.setFromUnitVectors(V(0, 1, 0), V(0, -1, 0.35).normalize()); } else P.drawStick.visible = false;
      P.mapNew.forEach((m, i) => { m.visible = t >= tAt('mapadd', 1.2 + i * 1.4); });
      // LAB
      P.drop.visible = inL(t, 'unseen', 'today') || inL(t, 'drop', 'eye') || inL(t, 'virus', 'from') || inL(t, 'criteria', 'back');
      if (P.drop.visible) {
        P.drop.rotation.y = t * 0.25;
        const sedOn = !inL(t, 'microbe', 'eye'), micOn = !inL(t, 'sediment', 'microbe');
        P.sed.forEach((m) => { m.visible = sedOn && !(inL(t, 'virus', 'world')); });
        P.mic.forEach((m, i) => { m.visible = micOn; m.position.y += 0.0; m.rotation.x = t * 0.8 + i; });
      }
      P.hair.visible = inL(t, 'eye', 'virus'); P.bac.visible = P.bacRing.visible = inL(t, 'bact', 'virus');
      if (P.bacRing.visible) P.bacRing.scale.setScalar(1 + 0.15 * Math.sin(t * 6));
      P.riverD.visible = inL(t, 'from', 'warm');
      P.flow.forEach((m, i) => { m.visible = inL(t, 'downstream', 'warm') && t > tAt('downstream', 1.5); if (!m.visible) return; const k = ((t * 0.25 + i / 10) % 1); m.position.set(lerp(-1.3, 1.3, k), 1.83 + 0.12 * Math.sin(k * 6), 0.06); });
      P.poolD.visible = inL(t, 'warm', 'criteria') || inL(t, 'labpool', 'worst');
      P.gwD.visible = inL(t, 'ground', 'nodirt');
      const ped = !(P.riverD.visible || P.poolD.visible || P.gwD.visible || P.hair.visible); const lb = REF.Wd?.lab; if (lb) { lb.ped.visible = ped; lb.rim.visible = ped; }
    },
    pose(t, S) {
      const id = lines[S.li].id;
      // 'place': reach the cup under the drips with both hands
      if (id === 'place' && S.spec?.P) { const k = sstep(range(S.u, 0.4, 1.2)); S.spec.P.handR = V(-0.08, lerp(0.95, 0.75, k), lerp(0.2, 0.62, k)); S.spec.P.handL = V(0.08, lerp(0.95, 0.75, k), lerp(0.2, 0.62, k)); }
      if (CROUCH_HOLD.includes(id) && S.spec?.P) {
        const P0 = S.spec.P, z = lines[S.li].z || {};
        Object.assign(P0, Z.crouch(0.95, { pos: P0.pos, yaw: P0.yaw, face: P0.face, headPitch: z.o?.pitch ?? 0.45 }));
        if (id === 'wiggle') { P0.handR = V(-0.08, 1.02, 0.44); P0.handL = V(0.08, 1.02, 0.44); P0.headPitch = 0.6; }
        if (id === 'clean') { P0.handR = V(-0.08, 0.75, 0.62); P0.handL = V(0.08, 0.75, 0.62); }
      }
      // at the seep: squat upright (no forward lean) so the head stays clear of the crack and the falling drips
      if ((id === 'place' || id === 'clean') && S.spec?.P) { S.spec.P.hipsRX = 0.04; S.spec.P.headPitch = Math.min(S.spec.P.headPitch || 0, 0.25); }
      if (cupLeft(lines[S.li]) && S.spec?.P) S.spec.P.handL = V(0.3, 1.12, 0.36);
      if (id === 'dump' && S.spec?.P) { const k = sstep(range(S.u, 0.2, 0.7)); S.spec.P.handR = V(-0.3, lerp(1.2, 1.0, k), 0.5); S.spec.P.handL = V(0.2, 1.0, 0.3); }
      return undefined;
    },
  };
}
