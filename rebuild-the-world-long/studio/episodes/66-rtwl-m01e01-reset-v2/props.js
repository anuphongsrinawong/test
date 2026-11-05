// props.js - 66-rtwl-m01e01-reset: the episode's props (all found in nature: sticks, pebbles, the ground) and the LAB
// holograms (rule of threes, the survey method, the flood cutaway). Pure functions of t.
import * as THREE from 'three';
import { V, clamp, lerp, range, sstep, eio, eout, eback, rng } from 'toonkit';
import { box, cyl, sph, nf, put, group, glow } from '/lib/diorama.js';
import { W3, LB3, Z, lianaTube, canvasPlane, holoMat, dashLine, bush, ZN } from '/series/rtw/kit/index.js';
import { ground, REF } from '/series/rtw/long/longkit.js';

const PI = Math.PI;
export const BED = [];
const STICK = [3.2, 1.6], MAPC = [-1.6, -1.72], TREE = ZN.TREE;
// shadow tips: the first (morning) and the second (later): the tip moves west -> east (+x)
const TIP1 = [STICK[0] - 1.05, STICK[1] - 0.3], TIP2 = [STICK[0] - 0.5, STICK[1] - 0.34];
const FONT = '"Leelawadee UI", Prompt, Tahoma, sans-serif';
export const LABEL_AT = {
  W: () => W3(TIP1[0], 0.06, TIP1[1]), E: () => W3(TIP2[0], 0.06, TIP2[1]),
  SCREE: () => ground('REDROCKS', 0.5, -13.5, 0.6), TRACKS: () => ground('SHELTER', 0.3, -1.9, 0.05),
  DEBRIS: () => ground('BEND', -3.4, 3.8, 2.45), HWM: () => LB3(-1.15, 2.05, 0.05), SANDLAB: () => LB3(0.35, 1.05, 0.05),
  BRANCH: () => W3(TREE[0] + 2.4, 3.9, TREE[1] + 2.3),
};

// a canvas card (hologram look): title + optional big text, drawn once
function holoCard(parent, w, h, draw, o = {}) { return canvasPlane(parent, w, h, draw, { px: 512, ...o }); }
function cardDraw(icon, big, small, col = '#7fe8ff') {
  return (c, cw, ch) => {
    c.fillStyle = 'rgba(10,40,60,0.72)'; c.beginPath(); c.roundRect(8, 8, cw - 16, ch - 16, 40); c.fill();
    c.lineWidth = 10; c.strokeStyle = col; c.stroke();
    c.textAlign = 'center'; c.textBaseline = 'middle'; c.fillStyle = '#fff';
    c.font = `800 ${ch * 0.2}px ${FONT}`; c.fillText(icon, cw / 2, ch * 0.24);
    c.font = `800 ${ch * 0.2}px ${FONT}`; c.fillStyle = col; c.fillText(big, cw / 2, ch * 0.55);
    c.font = `700 ${ch * 0.12}px ${FONT}`; c.fillStyle = '#e8fbff'; c.fillText(small, cw / 2, ch * 0.8);
  };
}
// simple line icons for the option holograms
function iconDraw(kind) {
  return (c, cw, ch) => {
    c.fillStyle = 'rgba(10,40,60,0.7)'; c.beginPath(); c.arc(cw / 2, ch / 2, cw * 0.46, 0, 7); c.fill();
    c.lineWidth = cw * 0.04; c.strokeStyle = '#7fe8ff'; c.stroke();
    c.strokeStyle = '#ffffff'; c.lineWidth = cw * 0.05; c.lineCap = 'round'; c.lineJoin = 'round'; c.beginPath();
    const x = cw / 2, y = ch / 2, s = cw * 0.22;
    if (kind === 'food') { c.arc(x, y + s * 0.15, s, 0, 7); c.moveTo(x, y - s * 0.85); c.quadraticCurveTo(x + s * 0.5, y - s * 1.4, x + s * 0.8, y - s * 1.1); }
    if (kind === 'house') { c.moveTo(x - s, y + s); c.lineTo(x - s, y - s * 0.1); c.lineTo(x, y - s); c.lineTo(x + s, y - s * 0.1); c.lineTo(x + s, y + s); c.closePath(); }
    if (kind === 'fire') { c.moveTo(x, y - s * 1.1); c.quadraticCurveTo(x + s, y, x + s * 0.4, y + s); c.lineTo(x - s * 0.4, y + s); c.quadraticCurveTo(x - s, y, x, y - s * 1.1); }
    c.stroke();
  };
}
function xDraw(c, cw, ch) { c.strokeStyle = '#ff5a4a'; c.lineWidth = cw * 0.1; c.lineCap = 'round'; c.beginPath(); c.moveTo(cw * 0.2, ch * 0.2); c.lineTo(cw * 0.8, ch * 0.8); c.moveTo(cw * 0.8, ch * 0.2); c.lineTo(cw * 0.2, ch * 0.8); c.stroke(); }

export async function buildEp(K, IX) {
  const { api, T, lines } = K, { scene } = api;
  const wood = nf(0x8a6a40), dark = nf(0x6a5034), pebM = nf(0x9a9284), redM = nf(0xd8262a);
  const P = {};
  // ---- the direction stick (held, then planted) + its painted shadow + the two pebbles
  P.stick = group(scene); put(P.stick, cyl(0.016, 0.022, 1.15, 7), wood, 0, 0.575, 0, 0.0015, true);
  P.stickTop = put(P.stick, cyl(0.008, 0.012, 0.22, 5), wood, 0.05, 0.95, 0, 0.001); P.stickTop.rotation.z = -0.6;
  P.shadow = put(scene, new THREE.PlaneGeometry(1, 0.05), new THREE.MeshBasicMaterial({ color: 0x2a3a1a, transparent: true, opacity: 0.55, depthWrite: false }), 0, 0, 0, 0);
  P.shadow.rotation.x = -PI / 2; P.shadow.visible = false;
  P.peb1 = put(scene, sph(0.05, 8, 6), pebM, ...W3(TIP1[0], 0.035, TIP1[1]).toArray(), 0.002); P.peb1.scale.y = 0.6;
  P.peb2 = put(scene, sph(0.05, 8, 6), pebM, ...W3(TIP2[0], 0.035, TIP2[1]).toArray(), 0.002); P.peb2.scale.y = 0.6;
  { const a = W3(TIP1[0], 0.05, TIP1[1]), b = W3(TIP2[0], 0.05, TIP2[1]), d = b.clone().sub(a).normalize(), m = a.clone().lerp(b, 0.5), n = V(-d.z, 0, d.x);
    const ew = [a.clone().addScaledVector(d, -0.5), b.clone().addScaledVector(d, 0.5)], ns = [m.clone().addScaledVector(n, -0.7), m.clone().addScaledVector(n, 0.7)];
    P.ewLine = dashLine(scene, [[ew[0].toArray(), ew[1].toArray()]], { r: 0.014, dash: 0.08, gap: 0.05, color: 0xffd23f });
    P.nsLine = dashLine(scene, [[ns[0].toArray(), ns[1].toArray()]], { r: 0.014, dash: 0.08, gap: 0.05, color: 0x5ae8ff });
    const letter = (s, p, col) => { const m2 = canvasPlane(scene, 0.32, 0.32, (c, cw, ch) => { c.font = `900 ${ch * 0.7}px Arial Black, sans-serif`; c.textAlign = 'center'; c.textBaseline = 'middle'; c.lineWidth = 14; c.strokeStyle = '#06303a'; c.strokeText(s, cw / 2, ch / 2); c.fillStyle = col; c.fillText(s, cw / 2, ch / 2); }, { px: 256 }); m2.position.copy(p).add(V(0, 0.22, 0)); return m2; };
    P.letters = [letter('W', ew[0], '#ffd23f'), letter('E', ew[1], '#ffd23f'), letter('N', ns[0], '#5ae8ff'), letter('S', ns[1], '#5ae8ff')];
  }
  // ---- the option holograms over Zero (food / house / fire), each crossed out
  P.opts = ['food', 'house', 'fire'].map((k) => { const m = canvasPlane(scene, 0.62, 0.62, iconDraw(k), { px: 256 }); const x = canvasPlane(m, 0.62, 0.62, xDraw, { px: 256 }); x.position.z = 0.01; m.userData.x = x; m.visible = false; return m; });
  // ---- jungle edge: hanging lianas in reach + the berry bush
  { const [x, z] = [-23.25, -5.55];
    P.vine = lianaTube(scene, [[WD(x - 0.6), 6.5, WDz(z - 0.3)], [WD(x - 0.15), 4.2, WDz(z - 0.1)], [WD(x), 2.6, WDz(z)], [WD(x + 0.05), 1.55, WDz(z + 0.05)]], { r: 0.035, leaves: 5 });
    lianaTube(scene, [[WD(x - 1.4), 7, WDz(z + 0.8)], [WD(x - 0.9), 4.0, WDz(z + 0.6)], [WD(x - 0.8), 1.7, WDz(z + 0.7)]], { r: 0.03 });
    lianaTube(scene, [[WD(x - 0.9), 7, WDz(z - 1.3)], [WD(x - 0.5), 4.4, WDz(z - 1.1)], [WD(x - 0.45), 2.0, WDz(z - 1.2)]], { r: 0.028 }); }
  { const g = bush(scene, ...[-21.0, -3.0].map((v, i) => (i ? WDz(v) : WD(v))), { s: 1.25, seed: 7, colors: [0x2f6a2c, 0x3a7c32, 0x2a5f28] }); const R = rng(5);
    for (let i = 0; i < 22; i++) { const a = R() * 6.28, h = 0.25 + R() * 0.45, r = 0.38 + 0.12 * R(); put(g, sph(0.045, 8, 6), redM, Math.cos(a) * r, h, Math.sin(a) * r * 0.9, 0.0012); } }
  // ---- deep jungle: the sapling Zero bends (a trail marker)
  { const p = ground('DEEPJUNGLE', 0.75, -4.0); P.sap = group(scene, p.x, p.y, p.z);
    put(P.sap, cyl(0.014, 0.022, 1.0, 6), wood, 0, 0.5, 0, 0.0012, true);
    P.sapTop = group(P.sap, 0, 1.0, 0); put(P.sapTop, cyl(0.009, 0.014, 0.7, 6), wood, 0, 0.35, 0, 0.0012, true);
    for (let i = 0; i < 4; i++) { const l = put(P.sapTop, sph(0.09, 8, 6), nf(0x3f8a32), 0.06 * (i % 2 ? 1 : -1), 0.4 + i * 0.1, 0, 0.001); l.scale.set(1.4, 0.25, 0.8); } }
  // ---- rock shelter: paw prints + fur tufts
  { const p = ground('SHELTER', 0.3, -1.7, 0.012);
    P.tracks = canvasPlane(scene, 1.1, 1.6, (c, cw, ch) => { c.fillStyle = 'rgba(60,42,28,0.8)'; for (let i = 0; i < 6; i++) { const x = cw * (0.35 + 0.3 * (i % 2)), y = ch * (0.12 + i * 0.15); c.beginPath(); c.ellipse(x, y, cw * 0.06, ch * 0.035, 0, 0, 7); c.fill(); for (let k = 0; k < 4; k++) { c.beginPath(); c.arc(x + cw * (-0.06 + k * 0.04), y - ch * 0.045, cw * 0.018, 0, 7); c.fill(); } } }, { px: 256 });
    P.tracks.material.transparent = true; P.tracks.rotation.x = -PI / 2; P.tracks.position.copy(p);
    const q = ground('SHELTER', 1.1, -0.4, 0.55); for (let i = 0; i < 4; i++) { const f = put(scene, sph(0.06, 6, 5), nf(0x8a6a4a), q.x + i * 0.05, q.y + 0.03 * Math.sin(i * 2), q.z, 0.001); f.scale.set(1.4, 0.5, 0.6); } }
  // ---- river bend: a tall shrub with flood debris (dry grass + sticks) caught at its top
  { const p = ground('BEND', -3.4, 3.8); const g = group(scene, p.x, p.y, p.z);
    put(g, cyl(0.05, 0.08, 1.6, 6), dark, 0, 0.8, 0, 0.002, true);
    bush(g, 0, 0, { s: 1.9, seed: 11, y: 0.9 });
    const straw = nf(0xc8b07a), R = rng(9);
    for (let i = 0; i < 9; i++) { const s = put(g, cyl(0.012, 0.016, 0.9 + 0.5 * R(), 5), i % 3 ? straw : dark, (R() - 0.5) * 0.9, 2.3 + 0.12 * R(), (R() - 0.5) * 0.6, 0.0012); s.rotation.set(PI / 2 * (0.7 + 0.4 * R()), R() * 6.28, 0.3 * R()); }
    for (let i = 0; i < 4; i++) { const b = put(g, sph(0.14, 8, 6), straw, (R() - 0.5) * 0.7, 2.32, (R() - 0.5) * 0.5, 0.0015); b.scale.set(1.6, 0.45, 1); } }
  // ---- the shade tree's dead branch (grey, bare, cracked at the trunk)
  { const g = group(scene, ...W3(TREE[0] + 0.55, 5.3, TREE[1] + 0.55).toArray()); g.rotation.set(0, PI / 4 + 0.15, 0);
    const gm = nf(0xa89c8a); const arm = group(g, 0, 0, 0); arm.rotation.x = 0.55;
    const br = put(arm, cyl(0.09, 0.2, 4.4, 9), gm, 0, 0, 2.2, 0.003, true); br.rotation.x = PI / 2;
    put(arm, cyl(0.215, 0.215, 0.12, 9), nf(0x4a3a2a), 0, 0, 0.12, 0.002).rotation.x = PI / 2;
    for (let i = 0; i < 5; i++) { const tw = put(arm, cyl(0.02, 0.045, 1.1, 6), gm, 0.12 * (i % 2 ? 1 : -1), 0.1, 1.4 + i * 0.6, 0.0015, true); tw.rotation.set(0.4, 0, (i % 2 ? 1 : -1) * 0.9); }
    P.branch = g; }
  // ---- the map in the dirt: layers revealed one by one; the base stick
  P.mapLayers = [];
  { const layer = (draw) => { const m = canvasPlane(scene, 1.7, 1.2, draw, { px: 512 }); m.material.transparent = true; m.rotation.x = -PI / 2; m.position.copy(W3(MAPC[0], 0.012 + P.mapLayers.length * 0.001, MAPC[1])); m.visible = false; P.mapLayers.push(m); return m; };
    const ink = (c, w) => { c.strokeStyle = 'rgba(45,26,10,1)'; c.lineWidth = w * 1.6; c.lineCap = 'round'; c.lineJoin = 'round'; };
    layer((c, cw, ch) => { c.fillStyle = 'rgba(150,110,70,0.55)'; c.beginPath(); c.roundRect(10, 10, cw - 20, ch - 20, 60); c.fill(); });
    // river (east = +x = the right side; north = -z = the top of the canvas as seen from the south)
    layer((c, cw, ch) => { ink(c, 14); c.beginPath(); c.moveTo(cw * 0.86, ch * 0.95); c.bezierCurveTo(cw * 0.78, ch * 0.7, cw * 0.9, ch * 0.4, cw * 0.72, ch * 0.08); c.stroke(); ink(c, 6); c.beginPath(); c.moveTo(cw * 0.9, ch * 0.95); c.lineTo(cw * 0.95, ch * 0.86); c.stroke(); });
    // jungle (west): tree loops
    layer((c, cw, ch) => { ink(c, 7); for (let i = 0; i < 6; i++) { const x = cw * (0.08 + 0.07 * (i % 2)), y = ch * (0.15 + i * 0.13); c.beginPath(); c.arc(x, y, cw * 0.035, 0, 7); c.stroke(); } });
    // cliffs (south): a zigzag
    layer((c, cw, ch) => { ink(c, 8); c.beginPath(); for (let i = 0; i <= 10; i++) c.lineTo(cw * (0.12 + i * 0.07), ch * (0.9 + (i % 2) * 0.05)); c.stroke(); });
    // dangers: X marks (the sandbar, the rapids, the scree, the shelter's animal)
    layer((c, cw, ch) => { ink(c, 8); for (const [x, y] of [[0.74, 0.12], [0.8, 0.8], [0.4, 0.86], [0.2, 0.84]]) { c.beginPath(); c.moveTo(cw * x - 18, ch * y - 18); c.lineTo(cw * x + 18, ch * y + 18); c.moveTo(cw * x + 18, ch * y - 18); c.lineTo(cw * x - 18, ch * y + 18); c.stroke(); } });
    // the base: a circle near the middle
    layer((c, cw, ch) => { ink(c, 9); c.beginPath(); c.arc(cw * 0.48, ch * 0.5, cw * 0.06, 0, 7); c.stroke(); });
  }
  P.mapStick = group(scene); put(P.mapStick, cyl(0.014, 0.02, 0.9, 7), wood, 0, 0.45, 0, 0.0015, true);

  // ---- LAB: the rule of threes (4 cards), the survey (compass + 3 questions), the flood cutaway
  const lab = group(scene, ...LB3(0, 0, 0).toArray());
  P.r3 = [['AIR', '3 MIN', 'breathing'], ['SHELTER', '3 HOURS', 'harsh weather'], ['WATER', '3 DAYS', 'drinking'], ['FOOD', '3 WEEKS', 'eating']].map(([a, b, s], i) => {
    const m = holoCard(lab, 1.25, 1.25, cardDraw(a, b, s, ['#7fe8ff', '#ffd23f', '#5ae8ff', '#8fd06a'][i])); m.position.set(-2.03 + i * 1.35, 2.05, 0); m.visible = false; return m; });
  P.r3order = holoCard(lab, 4.6, 0.42, (c, cw, ch) => { c.font = `800 ${ch * 0.55}px ${FONT}`; c.textAlign = 'center'; c.textBaseline = 'middle'; c.fillStyle = '#ffd23f'; c.fillText('MOST URGENT  →  →  →  CAN WAIT LONGER', cw / 2, ch / 2); }, { px: 1024 });
  P.r3order.position.set(0, 1.2, 0.2); P.r3order.visible = false;
  P.compass = holoCard(lab, 2.4, 2.4, (c, cw, ch) => {
    const x = cw / 2, y = ch / 2, r = cw * 0.34; c.strokeStyle = '#7fe8ff'; c.lineWidth = 8; c.beginPath(); c.arc(x, y, r, 0, 7); c.stroke();
    c.beginPath(); c.moveTo(x - r, y); c.lineTo(x + r, y); c.moveTo(x, y - r); c.lineTo(x, y + r); c.stroke();
    c.font = `800 ${cw * 0.06}px ${FONT}`; c.textAlign = 'center'; c.textBaseline = 'middle'; c.fillStyle = '#fff';
    c.fillText('N', x, y - r - cw * 0.06); c.fillText('S', x, y + r + cw * 0.06); c.fillText('W', x - r - cw * 0.05, y); c.fillText('E', x + r + cw * 0.05, y);
  }, { px: 1024 });
  P.compass.position.set(-0.9, 2.0, -0.2); P.compass.visible = false;
  P.q3 = ['WHAT IS USEFUL?', 'WHAT CAN HURT ME?', 'WHERE DO I RUN?'].map((s, i) => { const m = holoCard(lab, 1.25, 0.42, (c, cw, ch) => { c.fillStyle = 'rgba(10,40,60,0.8)'; c.beginPath(); c.roundRect(6, 6, cw - 12, ch - 12, 30); c.fill(); c.lineWidth = 8; c.strokeStyle = ['#8fd06a', '#ff5a4a', '#ffd23f'][i]; c.stroke(); let fz = ch * 0.42; c.font = `800 ${fz}px ${FONT}`; const tw = c.measureText(s).width; if (tw > cw * 0.86) { fz *= cw * 0.86 / tw; c.font = `800 ${fz}px ${FONT}`; } c.textAlign = 'center'; c.textBaseline = 'middle'; c.fillStyle = '#fff'; c.fillText(s, cw / 2, ch / 2); }, { px: 512 }); m.scale.setScalar(1.2); m.position.set(1.5, 2.6 - i * 0.62, 0.4); m.visible = false; return m; });
  // flood cutaway: the river section (bank, sandbar, the meadow rise), a rising water body, the debris on a shrub
  P.flood = group(lab, 0, 0, 0); P.flood.visible = false;
  { const prof = new THREE.Shape(); prof.moveTo(-2.4, 0.75); prof.lineTo(-2.4, 2.35); prof.lineTo(-1.6, 2.3); prof.lineTo(-1.2, 1.5); prof.lineTo(-0.2, 1.05); prof.lineTo(0.9, 1.0); prof.lineTo(1.2, 0.8); prof.lineTo(2.4, 0.8); prof.lineTo(2.4, 0.75); prof.closePath();
    const geo = new THREE.ExtrudeGeometry(prof, { depth: 0.6, bevelEnabled: false }); geo.translate(0, 0, -0.3);
    put(P.flood, geo, nf(0xb8945a), 0, 0, 0, 0.003);
    P.water = put(P.flood, box(1, 1, 0.62), new THREE.MeshBasicMaterial({ color: 0x3aa8e0, transparent: true, opacity: 0.55, depthWrite: false }), 0, 0, 0, 0);
    const sh = group(P.flood, -0.9, 1.2, 0.1); put(sh, cyl(0.02, 0.03, 0.75, 5), nf(0x6a5034), 0, 0.38, 0, 0.001); bush(sh, 0, 0, { s: 0.55, seed: 3, y: 0.5 });
    P.hwm = dashLine(P.flood, [[[-2.4, 2.05, 0.34], [2.4, 2.05, 0.34]]], { r: 0.012, dash: 0.08, gap: 0.05, color: 0xff5a4a });
    P.fz = canvasPlane(P.flood, 0.5, 0.5, (c, cw, ch) => { c.font = `800 ${ch * 0.5}px ${FONT}`; c.textAlign = 'center'; c.textBaseline = 'middle'; c.fillStyle = '#fff'; c.fillText('Z', cw / 2, ch / 2); }, { px: 128 }); P.fz.visible = false; }

  // ---- beds: forest / river by place (none in the LAB), filled on the first frame
  const bedOf = (s) => (s.at === 'LAB' ? null : ['RAPIDS', 'BEND', 'CLAYBANK'].includes(s.at) || (s.at || 'WILD') === 'WILD' && (s.z?.at?.[0] ?? s.cam?.pos?.[0] ?? 0) > 15 ? 'el_river_bed' : 'el_forest_bed');
  let bedDone = false;
  const tAt = (id, dt = 0) => T.l[IX[id]] + dt;
  const inL = (t, a, b) => t >= T.l[IX[a]] && t < (b ? T.l[IX[b]] : 1e9);

  return {
    update(t, S) {
      if (!bedDone && T.ready) {
        bedDone = true; let cur = null, t0 = 0;
        lines.forEach((s, i) => { const b = bedOf(s); if (b !== cur) { if (cur) BED.push([cur, +t0.toFixed(2), +T.l[i].toFixed(2)]); cur = b; t0 = T.l[i]; } });
        if (cur) BED.push([cur, +t0.toFixed(2), +T.d.toFixed(2)]);
      }
      const cam = S.camera, rig = S.rig, id = lines[S.li].id;
      // the stick: in the hand while he walks to the spot, then planted
      const planted = t >= tAt('plant', 1.0);
      if (id === 'pick' || (id === 'plant' && !planted)) {
        const h = rig.handR.position; P.stick.position.copy(h).add(V(0, -0.5, 0)); P.stick.rotation.set(0.15, 0, -0.1);
        if (id === 'plant') { const k = sstep(range(t, tAt('plant', 0.5), tAt('plant', 1.0))); P.stick.position.lerp(W3(STICK[0], -0.12 * k, STICK[1]), k); P.stick.rotation.set(0.15 * (1 - k), 0, -0.1 * (1 - k)); }
      } else if (planted) { P.stick.position.copy(W3(STICK[0], -0.12, STICK[1])); P.stick.rotation.set(0, 0, 0); }
      else P.stick.position.set(0, -50, 0);
      // the shadow: from the stick foot to the tip; swings from TIP1 to TIP2 during the wait
      const sh = planted && inL(t, 'plant', 'climb'), k2 = sstep(range(t, tAt('shadow', 1.5), tAt('shadow', 6.5)));
      P.shadow.visible = sh;
      if (sh) { const tip = [lerp(TIP1[0], TIP2[0], k2), lerp(TIP1[1], TIP2[1], k2)], a = W3(STICK[0], 0.02, STICK[1]), b = W3(tip[0], 0.02, tip[1]); P.shadow.position.copy(a.clone().lerp(b, 0.5)); P.shadow.scale.set(a.distanceTo(b), 1, 1); P.shadow.rotation.set(-PI / 2, 0, -Math.atan2(b.z - a.z, b.x - a.x)); }
      P.peb1.visible = t >= tAt('plant', 3.6); P.peb2.visible = t >= tAt('ew', 0.8);
      const ewOn = inL(t, 'ew', 'blind') ? sstep(range(t, tAt('ew', 2.4), tAt('ew', 3.4))) : 0, nsOn = inL(t, 'nesw', 'blind') ? sstep(range(t, tAt('nesw', 0.5), tAt('nesw', 1.5))) : 0;
      P.ewLine.reveal(ewOn); P.nsLine.reveal(nsOn);
      P.letters.forEach((m, i) => { m.visible = (i < 2 ? ewOn : nsOn) > 0.5; m.quaternion.copy(cam.quaternion); });
      // the option holograms
      const oOn = inL(t, 'opts', 'guess');
      P.opts.forEach((m, i) => {
        m.visible = oOn && t > tAt('opts', 0.4 + i * 1.2);
        if (!m.visible) return;
        const head = rig.head.getWorldPosition(new THREE.Vector3());
        m.position.copy(head).add(V(0, 0.75, 0)).add(new THREE.Vector3((i - 1) * 0.75, 0, 0).applyQuaternion(cam.quaternion));
        m.quaternion.copy(cam.quaternion); m.scale.setScalar(eback(range(t, tAt('opts', 0.4 + i * 1.2), tAt('opts', 0.75 + i * 1.2))));
        m.userData.x.visible = t > tAt('opts', 4.3);
      });
      // the sapling bends over once he snaps it
      P.sapTop.rotation.z = -2.2 * sstep(range(t, tAt('marks', 1.3), tAt('marks', 1.6)));
      // the map layers + the base stick
      const mapOn = t >= tAt('map', 1.0);
      P.mapLayers.forEach((m, i) => { m.visible = mapOn && t >= tAt('map', 1.0 + i * 1.3); });
      if (id === 'map' || (id === 'base' && t < tAt('base', 1.0))) {
        const h = rig.handR.position; P.mapStick.position.copy(h); P.mapStick.quaternion.setFromUnitVectors(V(0, 1, 0), V(0, -1, 0.35).normalize());
        if (id === 'base') { const k = sstep(range(t, tAt('base', 0.4), tAt('base', 1.0))); const tgt = W3(MAPC[0] - 0.04, -0.05, MAPC[1]); P.mapStick.position.lerp(tgt, k); P.mapStick.quaternion.slerp(new THREE.Quaternion(), k); }
      } else if (t >= tAt('base', 1.0)) { P.mapStick.position.copy(W3(MAPC[0] - 0.04, -0.05, MAPC[1])); P.mapStick.quaternion.identity(); }
      else P.mapStick.position.set(0, -50, 0);
      // LAB
      P.r3.forEach((m, i) => { const ta = [tAt('air', 0.3), tAt('air', 3.6), tAt('water3', 0.3), tAt('water3', 2.0)][i]; m.visible = t < tAt('where', 1.4) && inL(t, 'lab3', 'method') && t > ta; if (m.visible) m.scale.setScalar(eback(range(t, ta, ta + 0.35))); if (inL(t, 'order', 'method')) m.material.opacity = i < 1 ? 0.45 : 1; else m.material.opacity = 1; });
      P.r3order.visible = inL(t, 'rough', 'method') && t < tAt('where', 1.4);
      P.compass.visible = inL(t, 'where', 'north') && t > tAt('where', 1.6);
      P.q3.forEach((m, i) => { m.visible = inL(t, 'three', 'north') && t > tAt('three', 0.3 + i * 2.0); });
      if (Wd()) { const ped = !inL(t, 'flood', 'drift'); Wd().ped.visible = ped; Wd().rim.visible = ped; }
      P.flood.visible = inL(t, 'flood', 'drift');
      if (P.flood.visible) { const lv = lerp(0.85, 2.05, sstep(range(t, tAt('flood', 0.5), tAt('flood', 3.0)))) - (inL(t, 'under', 'drift') ? 0.0 : 0) ; const dn = inL(t, 'under', 'drift') ? sstep(range(t, tAt('under', 1.0), tAt('under', 3.0))) : 0; const h = lerp(lv, 0.9, dn); P.water.scale.set(4.8, h - 0.76, 1); P.water.position.set(0, 0.76 + (h - 0.76) / 2, 0); P.hwm.reveal(sstep(range(t, tAt('flood', 2.8), tAt('flood', 3.4)))); }
    },
    // the pull on the liana (line 'vines'): both hands up on the vine, a lean back
    pose(t, S) {
      const id = lines[S.li].id;
      if (id === 'vines' && S.spec?.P) { const k = sstep(range(S.u, 1.4, 2.4)), tug = 0.03 * Math.sin(S.u * 30) * k; Object.assign(S.spec.P, { handR: V(-0.06, 1.9 + tug, 0.5), handL: V(0.06, 1.62 - tug, 0.5), hipsRX: -0.18 * k }); }
      if (id === 'marks' && S.spec?.P) { const k = sstep(range(S.u, 0.3, 1.2)), back = sstep(range(S.u, 1.6, 2.2)); S.spec.P.handR = V(-0.36, 0.95, 0.12).lerp(V(-0.12, 1.55, 0.6), k * (1 - back)); S.spec.P.handL = V(0.36, 0.95, 0.12).lerp(V(0.08, 1.35, 0.6), k * (1 - back)); }
      return undefined;
    },
  };
}
const WD = (x) => W3(x, 0, 0).x, WDz = (z) => W3(0, 0, z).z;
const Wd = () => REF.Wd?.lab;
