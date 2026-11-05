// series/rtw/long/longkit.js - REBUILD THE WORLD long-form (16:9, Thai, ~10 min episodes; roadmap of 400 episodes).
// One episode = a list of STATIONS, one per narration line: where we are (valley / atlas place / LAB), the light, the
// camera (an orbit round Zero's spot, pushing in through the line) and what Zero does (an act from the library below).
// The station list feeds the story engine (lib/story.js: voice timing, Thai sentence subtitles, labels, sound cues) and
// this kit's per-frame director poses Zero, lights the place and draws the HUD (mission tag, clock, title / unlock cards).
//
//   import { runLong } from '/series/rtw/long/longkit.js';
//   runLong({ title, mission, lines: [...stations], places: ['BEND', ...], build: async (K) => ({ update(t, S) {} }), hud })
//
// Station fields:
//   n (narration, Thai), beat ('hook' | 'loop' | 'rehook' | 'payoff' | 'cta'), gap (held silence after the line, s)
//   at: 'WILD' (valley, WILD-local coords) | atlas place ('BEND', 'RAPIDS', ...: place-local coords) | 'LAB'
//   look: 'DAY' | 'CLEAR' | 'GOLD' (default 'CLEAR'); clock: a HUD clock text that holds until the next one
//   z: Zero { at: [x, z], yaw, act, face, from: [x, z], y, hand, o: {...act options} } or null (Zero off screen)
//   c: camera orbit [a, d, h, ly, lx, lz] round c.spot || z.at (a = direction spot -> camera, 0 = +z), c2: the end of the
//      push (default: 8 % closer, a little arc); or cam: { pos, look, to } in local coords; fov; via ('cut' default)
// Everything is a pure function of t.
import * as THREE from 'three';
import { V, clamp, lerp, range, sstep, eio, eout, eback } from 'toonkit';
import { runEpisode } from '/lib/story.js';
import { buildWorld, worldAtlas, ATLAS_AT, W3, w, lb, LB3, Z, FACE, direct, HIDE, timeline, fillTimeline, zeroCast } from '/series/rtw/kit/index.js';

const PI = Math.PI;
export const REF = { A: null, Wd: null, K: null, lineAt: null };
// local -> world (array) for cameras; places' ground offsets are added per frame (atlas terrain is not flat)
export function toWorld(at, [x, y, z]) {
  if (!at || at === 'WILD') return w(x, y, z);
  if (at === 'LAB') return lb(x, y, z);
  const o = ATLAS_AT[at]; return [o.x + x, o.y + y, o.z + z];
}
// a world Vector3 on the ground of a place (+ dy); usable after build (atlas ground heights)
export function ground(at, x, z, dy = 0) {
  if (!at || at === 'WILD') return W3(x, dy, z);
  if (at === 'LAB') return LB3(x, dy, z);
  const p = REF.A?.place(at);
  return p ? p.V3g(x, z, dy) : V(ATLAS_AT[at].x + x, dy, ATLAS_AT[at].z + z);
}
export const gyAt = (at, x, z) => (!at || at === 'WILD' || at === 'LAB' ? 0 : REF.A?.place(at)?.yAt(x, z) ?? 0);

// ------------------------------------------------------------------------------------------------ cameras
const CAM = { scale: 1 };
const orbit = (at, spot, [a, d, h, ly, lx = 0, lz = 0]) => ({
  pos: toWorld(at, [spot[0] + d * Math.sin(a), h, spot[1] + d * Math.cos(a)]),
  look: toWorld(at, [spot[0] + lx, ly, spot[1] + lz]),
});
function camOf(s) {
  const at = s.at || 'WILD', fov = s.fov ?? 42, via = s.via === undefined ? 'cut' : s.via;
  if (s.cam) {
    const c = { pos: toWorld(at, s.cam.pos), look: toWorld(at, s.cam.look), fov, ease: 'io', via, drift: 0, orbit: 0 };
    if (s.cam.to) c.to = { pos: toWorld(at, s.cam.to.pos), look: toWorld(at, s.cam.to.look ?? s.cam.look) };
    return c;
  }
  const spot = s.c?.spot || s.z?.at || [0, 0], c0 = s.c || [0.4, 5, 1.7, 1.2], c = [c0[0], c0[1] * CAM.scale, c0[2], ...c0.slice(3)];
  const A = orbit(at, spot, c);
  const c2 = s.c2 ? [s.c2[0], s.c2[1] * CAM.scale, ...s.c2.slice(2)] : [c[0] + (s.arc ?? 0.07), c[1] * (s.push ?? 0.9), c[2], c[3], c[4] || 0, c[5] || 0];
  const B = orbit(at, spot, c2);
  return { pos: A.pos, look: A.look, to: { pos: B.pos, look: B.look }, fov, ease: 'io', via, drift: 0, orbit: 0 };
}

// ------------------------------------------------------------------------------------------------ Zero's acts
// u = seconds into the line, d = the line's length; returns a director spec { P, after, noBlink } or HIDE
const HANDS = {
  shade: () => ({ handR: V(-0.12, 1.98, 0.34), headPitch: -0.08 }),
  point: () => ({ handR: V(-0.42, 1.72, 0.62) }),
  pointL: () => ({ handL: V(0.42, 1.72, 0.62) }),
  think: () => ({ handR: V(-0.08, 1.62, 0.4), headRoll: 0.08 }),
  chin: () => ({ handR: V(-0.08, 1.62, 0.4), handL: V(0.16, 1.2, 0.34) }),
  wipe: (u) => ({ handR: V(-0.2 + 0.2 * Math.sin(u * 5), 2.02, 0.3), headPitch: 0.05 }),
  shrug: () => Z.H.shrug(), palms: () => Z.H.palmsUp(), fists: () => Z.H.fistsUp(), hips: () => Z.H.hipsFists(),
  scratch: (u) => Z.H.scratch(u), wave: (u) => Z.H.wave(u), scared: () => Z.H.scaredUp(), raise: () => Z.H.raiseR(),
  cheer: (u) => ({ handL: V(0.36, 2.2 + 0.05 * Math.sin(u * 9), 0.2), handR: V(-0.36, 2.2 + 0.05 * Math.sin(u * 9 + 1), 0.2), headPitch: -0.15 }),
  hold: () => ({ handR: V(-0.3, 1.32, 0.44), handL: V(0.22, 1.25, 0.42) }),
  holdR: () => ({ handR: V(-0.32, 1.38, 0.46) }),
  stop: () => ({ handR: V(-0.3, 1.5, 0.6), handL: V(0.3, 1.5, 0.6) }),
  belly: () => ({ handR: V(-0.12, 1.1, 0.3), handL: V(0.12, 1.15, 0.3) }),
  throat: () => ({ handR: V(-0.06, 1.55, 0.26), headPitch: 0.1 }),
  count: (u) => ({ handR: V(-0.32, 1.45, 0.5), handL: V(0.3, 1.3 + 0.06 * Math.sin(u * 4), 0.46) }),
};
const facing = (from, to) => Math.atan2(to[0] - from[0], to[1] - from[1]);
function zeroSpec(s, u, d, t) {
  const z = s.z; if (!z) return HIDE;
  const at = s.at || 'WILD', o = z.o || {}, k = clamp(u / Math.max(0.1, d));
  const face = FACE[z.face || 'neutral'] || FACE.neutral;
  const pos = ground(at, z.at[0], z.at[1], z.y || 0), yaw = z.yaw ?? 0;
  const hands = (P) => { if (z.hand && HANDS[z.hand]) Object.assign(P, HANDS[z.hand](u)); return P; };
  const scan = (P) => { if (o.scan) P.headYaw = (P.headYaw || 0) + (o.scan === true ? 0.7 : o.scan) * Math.sin(u * (o.scanRate || 0.8)); return P; };
  let P;
  switch (z.act || 'stand') {
    case 'stand': P = scan(hands(Z.stand({ pos, yaw, face, headPitch: o.pitch || 0, headYaw: o.headYaw || 0 }))); break;
    case 'lookup': P = hands(Z.stand({ pos, yaw, face, headPitch: -0.55 * sstep(range(u, 0.2, 1.0)), headYaw: o.headYaw || 0 })); break;
    case 'walk': case 'climb': case 'backoff': {
      const a = ground(at, z.from[0], z.from[1], o.fromY || 0), kk = eio(range(u, o.t0 ?? 0.15, (o.t1 ?? 0.88) * d));
      const back = z.act === 'backoff';
      const wy = back ? yaw : z.act === 'climb' ? Math.atan2(pos.x - a.x, pos.z - a.z) : undefined;
      P = Z.walk(a, pos, kk, { face, yaw: wy, steps: o.steps, ...(z.hand && HANDS[z.hand] ? HANDS[z.hand](u) : {}) });
      if (z.act === 'climb') { P.hipsRX = 0.25 * Math.sin(PI * kk); }
      if (kk >= 1 && !back) P.yaw = lerp(P.yaw, yaw, sstep(range(u, (o.t1 ?? 0.88) * d, (o.t1 ?? 0.88) * d + 0.5)));
      scan(P);
      break;
    }
    case 'wake': {
      // lying on the back, eyes open, then sit up with the legs out
      const up = sstep(range(u, d * 0.45, d * 0.85));
      P = Z.recline(lerp(-1.3, -0.3, up), { pos, yaw, face: u < d * 0.3 ? FACE.sleepy : u < d * 0.5 ? FACE.surprised : FACE.curious });
      if (up > 0.6) P.headYaw = 0.5 * Math.sin((u - d * 0.7) * 1.2);
      break;
    }
    case 'situp': {
      P = Z.recline(-0.3, { pos, yaw, face, headYaw: 0.75 * Math.sin(u * 0.9), handL: V(0.42, 0.72, -0.25), handR: V(-0.42, 0.72, -0.25) });
      break;
    }
    case 'getup': {
      // from sitting (legs out) to standing: crouch through
      const a = sstep(range(u, 0.1, d * 0.45)), b = sstep(range(u, d * 0.45, d * 0.8));
      const sit = Z.recline(-0.3, { pos, yaw, face }), cr = Z.crouch(1, { pos: pos.clone().add(V(0, 0, -0.35).applyAxisAngle(V(0, 1, 0), yaw)), yaw, face });
      const st = hands(Z.stand({ pos: cr.pos, yaw, face }));
      P = b > 0 ? Z.mix(cr, st, b) : Z.mix(sit, cr, a);
      P.pos = (b > 0 ? cr.pos : sit.pos.clone().lerp(cr.pos, a));
      break;
    }
    case 'crouch': case 'touch': case 'draw': case 'plant': case 'drink': case 'scoop': {
      const c = sstep(range(u, 0.1, 0.7));
      P = Z.crouch(0.95 * c, { pos, yaw, face, headPitch: (o.pitch ?? 0.45) * c, headYaw: o.headYaw || 0 });
      const act = z.act;
      if (act === 'touch') P.handR = V(-0.16, lerp(0.95, 0.22, c), lerp(0.12, 0.55, c));
      if (act === 'draw') { const a = (u - 0.7) * 2.4, on = c > 0.95 ? 1 : 0; P.handR = V(-0.12 + on * 0.18 * Math.cos(a), lerp(0.95, 0.24, c), lerp(0.12, 0.6 + on * 0.12 * Math.sin(a), c)); }
      if (act === 'plant') { const push = sstep(range(u, 0.7, 1.2)); P.handR = V(-0.12, lerp(0.95, 0.62 - 0.22 * push, c), lerp(0.12, 0.5, c)); P.handL = V(0.1, lerp(0.95, 0.66 - 0.22 * push, c), lerp(0.12, 0.48, c)); }
      if (act === 'scoop') { const sp = sstep(range(u, 0.7, 1.3)); P.handR = V(-0.1, lerp(0.95, lerp(0.22, 0.9, sp), c), lerp(0.12, 0.6, c)); P.handL = V(0.1, lerp(0.95, lerp(0.22, 0.9, sp), c), lerp(0.12, 0.6, c)); }
      if (act === 'drink') { const up = sstep(range(u, 0.6, 1.4)); P.handR = V(-0.07, lerp(0.9, 1.62, up), lerp(0.4, 0.34, up)); P.handL = V(0.07, lerp(0.9, 1.62, up), lerp(0.4, 0.34, up)); P.headPitch = lerp(0.4, -0.15, up) * c; }
      hands(P);
      break;
    }
    case 'reachstop': {
      const r = sstep(range(u, 0.3, 1.2)), back = sstep(range(u, o.stopAt ?? d * 0.5, (o.stopAt ?? d * 0.5) + 0.5));
      P = Z.stand({ pos, yaw, face: back > 0 ? FACE.worried : face, hipsRX: 0.12 * r * (1 - back) });
      P.handR = V(-0.36, 0.95, 0.12).lerp(V(-0.22, o.reachY ?? 1.2, 0.72), r * (1 - back));
      if (back > 0) P.handL = V(0.3, 1.5, 0.55).lerp(V(0.43, 0.95, 0.12), 1 - back);
      break;
    }
    case 'lie': P = Z.recline(-1.22, { pos, yaw, face, handL: V(0.3, 2.0, -0.1), handR: V(-0.3, 2.0, -0.1) }); break;
    case 'sit': P = hands(Z.sitGround({ pos, yaw, face, headPitch: o.pitch || 0, headYaw: o.headYaw || 0 })); scan(P); break;
    case 'tear': {
      const pull = sstep(range(u, d * 0.35, d * 0.6));
      P = Z.stand({ pos, yaw, face, headPitch: 0.25 });
      P.handR = V(-0.1 - 0.16 * pull, 1.25, 0.46); P.handL = V(0.1 + 0.16 * pull, 1.25 + 0.04 * pull, 0.46);
      break;
    }
    case 'jump': {
      const h = Math.abs(Math.sin(u * 5.2)) * 0.18 * (u < 1.8 ? 1 : 0);
      P = Z.stand({ pos: pos.clone().add(V(0, h, 0)), yaw, face, ...HANDS.cheer(u) });
      break;
    }
    case 'stumble': {
      const s = eout(range(u, 0.2, 0.6));
      P = Z.stand({ pos: pos.clone().add(V(0, 0, -0.3 * s).applyAxisAngle(V(0, 1, 0), yaw)), yaw, face, hipsRX: 0.18 * Math.sin(PI * s), ...HANDS.scared() });
      break;
    }
    default: P = Z.stand({ pos, yaw, face });
  }
  return { P, noBlink: z.act === 'wake' && u < d * 0.3 };
}

// ------------------------------------------------------------------------------------------------ HUD
export const HUD = {
  ink: '#1d1714', cyan: '#5ae8ff', yellow: '#ffd23f', orange: '#ff8a2a', green: '#5af07a', red: '#ff5a4a',
};
function panel(g, x, y, w, h, { fill = 'rgba(14,24,32,0.78)', stroke = 'rgba(120,230,255,0.9)', r = 22, lw = 4 } = {}) {
  g.beginPath(); g.roundRect(x, y, w, h, r); g.fillStyle = fill; g.fill(); if (stroke) { g.lineWidth = lw; g.strokeStyle = stroke; g.stroke(); }
}
function txt(g, s, x, y, { size = 40, color = '#fff', font, align = 'left', weight = 700, stroke = 0, base = 'middle', max = 0 } = {}) {
  g.font = `${weight} ${size}px ${font}`;
  if (max && g.measureText(s).width > max) { size *= max / g.measureText(s).width; g.font = `${weight} ${size}px ${font}`; } g.textAlign = align; g.textBaseline = base;
  if (stroke) { g.lineJoin = 'round'; g.lineWidth = stroke; g.strokeStyle = '#111'; g.strokeText(s, x, y); }
  g.fillStyle = color; g.fillText(s, x, y);
}
export function drawIconBadge(g, x, y, r, kind) {
  g.save(); g.translate(x, y);
  g.beginPath(); g.arc(0, 0, r, 0, 7); g.fillStyle = kind === 'x' ? HUD.red : kind === '!' ? HUD.orange : HUD.green; g.fill();
  g.lineWidth = r * 0.16; g.strokeStyle = '#111'; g.stroke();
  g.strokeStyle = '#fff'; g.lineWidth = r * 0.24; g.lineCap = 'round'; g.beginPath();
  if (kind === 'x') { g.moveTo(-r * 0.4, -r * 0.4); g.lineTo(r * 0.4, r * 0.4); g.moveTo(r * 0.4, -r * 0.4); g.lineTo(-r * 0.4, r * 0.4); }
  else if (kind === '!') { g.moveTo(0, -r * 0.5); g.lineTo(0, r * 0.12); g.stroke(); g.beginPath(); g.arc(0, r * 0.45, r * 0.08, 0, 7); g.fillStyle = '#fff'; g.fill(); }
  else { g.moveTo(-r * 0.45, 0); g.lineTo(-r * 0.12, r * 0.35); g.lineTo(r * 0.48, -r * 0.35); }
  g.stroke(); g.restore();
}
// cards: { at, until | dur, kind: 'title' | 'unlock' | 'earlier' | 'list' | 'chapter' | 'next' | 'note', ... }
function makeHud(cfg) {
  return (g, t, { W, H, FONT }) => {
    const L = REF.lineAt; if (!L) return;
    const tl = cfg.lines;
    // the line now (for the clock)
    let li = 0; for (let i = 0; i < tl.length; i++) if (t >= L('line:' + i) - 0.05) li = i;
    let clock = null; for (let i = 0; i <= li; i++) if (tl[i].clock !== undefined) clock = tl[i].clock;
    const titleAt = cfg.hud?.titleAt ? L(cfg.hud.titleAt) : 0;
    const tagOn = t > titleAt + 4.6 && !(cfg.hud?.noTagAfter && t > L(cfg.hud.noTagAfter));
    // mission tag (top left) + clock (top right)
    if (tagOn) {
      const a = sstep(range(t, titleAt + 4.6, titleAt + 5.1));
      g.save(); g.globalAlpha = a;
      panel(g, 40, 34, 560, 74, { r: 37 });
      txt(g, cfg.hud.tag, 72, 72, { size: 32, color: HUD.cyan, font: FONT });
      if (clock) {
        g.font = `700 34px ${FONT}`; const cw = g.measureText(clock).width + 64;
        panel(g, W - 40 - cw, 34, cw, 74, { r: 37, stroke: 'rgba(255,210,63,0.95)' });
        txt(g, clock, W - 40 - cw / 2, 72, { size: 34, color: HUD.yellow, font: FONT, align: 'center' });
      }
      g.restore();
    }
    for (const c of cfg.hud?.cards || []) {
      const t0 = L(c.at), t1 = c.until ? L(c.until) : t0 + (c.dur ?? 4);
      if (t < t0 || t >= t1) continue;
      const pop = eback(range(t, t0, t0 + 0.35)), fade = 1 - sstep(range(t, t1 - 0.3, t1)), u = t - t0;
      g.save(); g.globalAlpha = fade;
      if (c.kind === 'title') {
        // the series logo line, the mission line, the episode title (big), the number badge
        g.translate(W / 2, H * 0.4); g.scale(0.7 + 0.3 * pop, 0.7 + 0.3 * pop);
        panel(g, -760, -190, 1520, 360, { r: 40, fill: 'rgba(10,18,26,0.82)', stroke: 'rgba(255,138,42,0.95)', lw: 6 });
        txt(g, 'REBUILD THE WORLD', 0, -128, { size: 46, color: HUD.orange, font: FONT, align: 'center', weight: 800 });
        txt(g, c.sub, 0, -62, { size: 40, color: HUD.cyan, font: FONT, align: 'center' });
        txt(g, c.title, 0, 40, { size: 96, color: '#fff', font: FONT, align: 'center', weight: 800, stroke: 14, max: 1440 });
        if (c.note) txt(g, c.note, 0, 124, { size: 38, color: HUD.yellow, font: FONT, align: 'center' });
      } else if (c.kind === 'chapter') {
        const x = 40 + (1 - eout(range(t, t0, t0 + 0.4))) * -700;
        panel(g, x, 136, 760, 92, { r: 26, stroke: 'rgba(255,210,63,0.95)' });
        txt(g, c.title, x + 34, 182, { size: 42, color: HUD.yellow, font: FONT, weight: 800 });
      } else if (c.kind === 'unlock' || c.kind === 'earlier') {
        const early = c.kind === 'earlier';
        g.translate(W / 2, H * (c.y ?? 0.3)); g.scale(0.6 + 0.4 * pop, 0.6 + 0.4 * pop); g.rotate(-0.02);
        const wd = early ? 1000 : 1240, ht = early ? 210 : 270;
        panel(g, -wd / 2, -ht / 2, wd, ht, { r: 34, fill: early ? 'rgba(10,30,40,0.88)' : 'rgba(30,22,6,0.9)', stroke: early ? HUD.cyan : HUD.yellow, lw: 7 });
        txt(g, early ? 'UNLOCKED EARLIER' : 'UNLOCKED', 0, -ht / 2 + 52, { size: early ? 40 : 56, color: early ? HUD.cyan : HUD.yellow, font: FONT, align: 'center', weight: 800 });
        txt(g, c.title, 0, early ? 16 : 30, { size: early ? 62 : 80, color: '#fff', font: FONT, align: 'center', weight: 800, stroke: 12, max: (early ? 1000 : 1240) - 80 });
        if (c.sub) txt(g, c.sub, 0, ht / 2 - 40, { size: early ? 30 : 36, color: early ? '#bfefff' : '#ffe9a8', font: FONT, align: 'center' });
        if (!early) for (let i = 0; i < 10; i++) { const a = i * 0.63 + u * 0.6, r = 690 + 40 * Math.sin(u * 3 + i); g.fillStyle = HUD.yellow; g.globalAlpha = fade * (0.5 + 0.5 * Math.sin(u * 6 + i)); g.beginPath(); g.arc(Math.cos(a) * r * 0.95, Math.sin(a) * r * 0.24, 7, 0, 7); g.fill(); }
      } else if (c.kind === 'list') {
        // a checklist; item i appears at items[i].at (line ref) or evenly over the card
        const x0 = c.x ?? (c.side === 'left' ? 60 : W - 60 - (c.w || 700)), y0 = c.top ?? 150, wd = c.w || 700, rowH = c.rowH || 74;
        const n = c.items.length, ht = 96 + n * rowH;
        const slide = eout(range(t, t0, t0 + 0.35));
        g.translate((1 - slide) * (c.side === 'left' ? -800 : 800), 0);
        panel(g, x0, y0, wd, ht, { r: 28 });
        txt(g, c.title, x0 + 34, y0 + 50, { size: 40, color: HUD.yellow, font: FONT, weight: 800 });
        c.items.forEach((it, i) => {
          const ta = it.at ? L(it.at) : t0 + 0.5 + i * ((t1 - t0 - 1) / n);
          const on = sstep(range(t, ta, ta + 0.3)); if (on <= 0) return;
          g.save(); g.globalAlpha = fade * on;
          const y = y0 + 96 + i * rowH + rowH / 2 - 10;
          drawIconBadge(g, x0 + 58, y, 24, it.icon || 'ok');
          txt(g, it.text, x0 + 100, y + 2, { size: it.size || 36, color: '#fff', font: FONT });
          g.restore();
        });
      } else if (c.kind === 'note') {
        g.translate(W / 2, H * (c.y ?? 0.18)); g.scale(0.8 + 0.2 * pop, 0.8 + 0.2 * pop);
        g.font = `800 ${c.size || 54}px ${FONT}`; const tw = g.measureText(c.title).width + 90;
        panel(g, -tw / 2, -52, tw, 104, { r: 52, fill: c.fill || 'rgba(255,255,255,0.94)', stroke: c.color || HUD.ink, lw: 6 });
        txt(g, c.title, 0, 2, { size: c.size || 54, color: c.ink || HUD.ink, font: FONT, align: 'center', weight: 800 });
      } else if (c.kind === 'next') {
        g.translate(W / 2, H * 0.34); g.scale(0.7 + 0.3 * pop, 0.7 + 0.3 * pop);
        panel(g, -620, -120, 1240, 240, { r: 36, fill: 'rgba(10,18,26,0.86)', stroke: HUD.cyan, lw: 6 });
        txt(g, c.sub || 'ตอนต่อไป', 0, -62, { size: 40, color: HUD.cyan, font: FONT, align: 'center', weight: 800 });
        txt(g, c.title, 0, 26, { size: 64, color: '#fff', font: FONT, align: 'center', weight: 800, stroke: 12, max: 1160 });
      }
      g.restore();
    }
  };
}

// ------------------------------------------------------------------------------------------------ run
export function runLong(cfg) {
  const lines = cfg.lines;
  CAM.scale = cfg.camScale ?? 1.25;
  const T = timeline();
  REF.T = T;
  runEpisode({
    set: 'park', setOpts: { time: 'day' }, style: 'viral', lang: cfg.lang || 'en', title: cfg.title, captions: 'line',
    // English (default): Liam on ElevenLabs at the main machine, edge-tts Andrew as the free draft; Thai: Preecha / Niwat
    narrator: cfg.narrator || ((cfg.lang || 'en') === 'th' ? { edge: ['th-TH-NiwatNeural', '+0Hz', '-8%'], eleven: 'FaUQoAqt8WX5mfvrvb3A' } : { edge: ['en-US-AndrewNeural', '+0Hz', '+0%'], eleven: 'TX3LPaxmHKxFdv7VOQHJ' }),
    voiceTempo: cfg.voiceTempo || 1.0,
    chunkLen: cfg.chunkLen || ((cfg.lang || 'en') === 'th' ? 34 : 46), subY: 0.88, subSize: 54, subStroke: 12,
    nearHide: 0.45, viaGain: -14, transitionGain: -12,
    keep: cfg.keep || [],
    bed: cfg.bed, music: cfg.music,
    cast: { zero: zeroCast([400, 470, 0]) },
    labels: cfg.labels || [], events: cfg.events || [], cards: [],
    hud: makeHud(cfg),
    build: async (api) => {
      const Wd = await buildWorld(api, { clear: cfg.clear || [] });
      const A = await worldAtlas(api, Wd, { south: true, places: cfg.places || [] });
      REF.A = A; REF.Wd = Wd;
      // the far places' painted walls fade at their edges and leave the sky showing at the corners (a pale vertical bar
      // in 16:9 frames): widen them so neighbouring walls overlap
      for (const W of A.walls) if (W.place) W.m.scale.x = cfg.wallWiden ?? 1.35;
      const K = { api, Wd, A, T, ground, gyAt, toWorld, lines };
      REF.K = K;
      const ep = cfg.build ? await cfg.build(K) : {};
      return {
        props: {},
        update(t, ctx) { REF.lineAt = ctx.lineAt; fillTimeline(T, ctx.lineAt, lines.length); ep.update0?.(t, ctx); },
        late(t, { cast }) {
          let li = 0; for (let i = 0; i < lines.length; i++) if (t >= T.l[i] - 1e-4) li = i;
          const s = lines[li], at = s.at || 'WILD', u = t - T.l[li], d = (T.l[li + 1] ?? T.d) - T.l[li];
          const look = s.look || 'CLEAR';
          const place = Wd.frame(t, { gold: look === 'GOLD', storm: s.storm || 0, lift: s.lift || 0 });
          A.frame(t, { look: at === 'LAB' ? 'CLEAR' : look });
          // atlas terrain: lift the camera by the ground height under the subject
          if (at !== 'WILD' && at !== 'LAB') { const sp = s.c?.spot || s.z?.at || [0, 0]; api.camera.position.y += gyAt(at, sp[0], sp[1]); api.camera.updateMatrixWorld(true); }
          const spec = zeroSpec(s, u, d, t);
          const S = { li, s, u, d, at, look, place, cast, rig: cast.zero.rig, camera: api.camera, spec };
          if (ep.pose) { const r = ep.pose(t, S); if (r !== undefined) S.spec = r; }
          direct(t, cast, { zero: S.spec }, api.camera);
          // landscape framing: keep the camera at least minD from Zero's head (back along the view axis)
          if (S.spec && S.spec !== HIDE) {
            api.camera.updateMatrixWorld(true);
            const head = cast.zero.rig.head.getWorldPosition(new THREE.Vector3()), dist = api.camera.position.distanceTo(head), minD = s.minD ?? cfg.minD ?? 4.6;
            if (dist < minD) { const f = new THREE.Vector3(); api.camera.updateMatrixWorld(true); api.camera.getWorldDirection(f); api.camera.position.addScaledVector(f, -(minD - dist)); api.camera.updateMatrixWorld(true); cast.zero.rig.setVisible(true); }
          }
          ep.update?.(t, S);
        },
      };
    },
    lines: lines.map((s) => ({ n: s.n, ...(s.beat ? { beat: s.beat } : {}), ...(s.gap != null ? { gap: s.gap } : {}), cam: camOf(s) })),
  });
}
export { PI, V, clamp, lerp, range, sstep, eio, eout, eback, FACE, Z, HIDE, facing };
