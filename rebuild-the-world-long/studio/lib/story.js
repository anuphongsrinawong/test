// story.js — the toon3d story engine: a set from the library + the recurring cast + a script of lines
// (narration ~80 %, character dialogue ~20 %) -> a frame-exact 9:16 clip.
// Timing comes from voice.json when a voice-over exists (scripts/voice.py), otherwise from estimated reading time,
// so a voice can be added later without touching the episode. Everything is a pure function of t.
import * as THREE from 'three';
import { clamp, lerp, range, sstep, eio, eout, ein, eback, rng, V, vlerp, createStage, loadTexOr, tex, oneTake, applyCamera, toon, part, outline,
  installRenderAPI, drawCaptions } from 'toonkit';
import { CAST, MOODS, buildHuman, buildDog, applyHumanPose, applyDogPose, makeProp, parseWear, setWear, WEAR_COLORS } from './cast.js';

// frame size: portrait 1080x1920 by default; a page may set globalThis.TOON_W / TOON_H (logical layout size, e.g. 1920x1080)
// and TOON_PX (pixel scale: 0.6667 renders a 1920x1080 layout at 1280x720), TOON_FPS
const W = globalThis.TOON_W ?? 1080, H = globalThis.TOON_H ?? 1920, PXS = globalThis.TOON_PX ?? 1, FPS = globalThis.TOON_FPS ?? 30, UPV = new THREE.Vector3(0, 1, 0);
const FONT = '"Leelawadee UI", Prompt, Tahoma, sans-serif';
const PUNCH_FONT = '"Arial Black", "Segoe UI Black", Impact, "Leelawadee UI", Prompt, sans-serif';     // viral captions / cards
// style 'viral' = the curiosity-short format: voice-over, punch captions, one-take camera, music, tight pacing
const isViral = (spec) => spec.style === 'viral';
const introOf = (spec) => spec.intro ?? (isViral(spec) ? 0.15 : 0.5);
const outroOf = (spec) => spec.outro ?? (isViral(spec) ? 0.9 : 1.4);
const THAI_MARKS = /[ัิ-ฺ็-๎\s]/g;
const baseLen = (s) => s.replace(THAI_MARKS, '').length;
const segmenter = new Intl.Segmenter('th', { granularity: 'word' });
// spec.keep: words the captions never split - names and words the Thai dictionary does not know
// (e.g. ['ซีโร่', 'กรีด', 'กระเทาะ']: the segmenter cuts ซี|โร่, มาก|รีด, กระ|เทาะ)
let KEEP = [];
// spec.glue (English punch captions): small words that never end a chunk, they ride with the next word
// ("slicing | a leaf." instead of "slicing a | leaf."): true = GLUE_EN, or a list of your own
const GLUE_EN = ['a', 'an', 'the', 'to', 'of', 'by', 'from', 'with', 'his', 'her', 'its', 'my', 'your', 'our', 'their', 'and', 'but', 'so', 'very', 'no'];
let GLUE = new Set();
// word segments; punctuation and ๆ stick to the word before them (no line ever starts with "!" or ",")
const words = (s) => {
  const cut = new Set([0, s.length]); let o = 0;
  for (const { segment } of segmenter.segment(s)) cut.add((o += segment.length));
  for (const k of KEEP) for (let i = s.indexOf(k); i >= 0; i = s.indexOf(k, i + 1)) {
    for (let j = i + 1; j < i + k.length; j++) cut.delete(j);
    cut.add(i); cut.add(i + k.length);
  }
  const at = [...cut].sort((a, b) => a - b), out = [];
  for (let n = 1; n < at.length; n++) { const w = s.slice(at[n - 1], at[n]); if (out.length && /^[!?.,:;…)\]"'”’ๆ]+$/.test(w)) out[out.length - 1] += w; else out.push(w); }
  return out;
};
const fwd = (yaw) => V(Math.sin(yaw), 0, Math.cos(yaw));
const angLerp = (a, b, k) => { const d = ((b - a + Math.PI) % (2 * Math.PI) + 2 * Math.PI) % (2 * Math.PI) - Math.PI; return a + d * k; };

// ------------------------------------------------------------------ script -> timed lines
function normalize(spec) {
  const castKeys = [...Object.keys(spec.cast || {}), ...(spec.extras || []).map((_, i) => `x${i + 1}`)];
  return spec.lines.map((item, i) => {
    let who = 'narrator', text = item.n;
    if (text === undefined) { if (item.who) { who = item.who; text = item.say; } else { who = castKeys.find((k) => typeof item[k] === 'string'); text = who ? item[who] : ''; } }
    const raw = text || '', emph = []; let clean = '';
    for (const part of raw.split(/(\*[^*]+\*)/)) {
      if (/^\*[^*]+\*$/.test(part)) { emph.push([clean.length, clean.length + part.length - 2]); clean += part.slice(1, -1); } else clean += part;
    }
    return { i, who, text: clean, emph, mood: item.mood, act: item.act || {}, cam: item.cam, gap: item.gap, dur: item.dur, sfx: item.sfx, boom: item.boom, boomAt: item.boomAt, emote: item.emote, beat: item.beat };
  });
}
function estimate(l, lang = 'th') {
  if (lang === 'en') { const w = l.text.split(/\s+/).filter(Boolean).length; return l.who === 'narrator' ? clamp(w / 2.9 + 0.25, 1.0, 9) : clamp(w / 2.6 + 0.3, 0.8, 5); }
  const n = baseLen(l.text); return l.who === 'narrator' ? clamp(n / 11 + 0.5, 1.5, 6) : clamp(n / 9.5 + 0.55, 1.2, 5);
}
// time at which character `ch` of line l is spoken (voice marks when present, else proportional to the text)
function timeOfChar(l, ch) {
  const m = l.marks;
  if (m?.length > 1) {
    if (ch <= m[0][0]) return m[0][1];
    for (let i = 1; i < m.length; i++) if (ch <= m[i][0]) return lerp(m[i - 1][1], m[i][1], (ch - m[i - 1][0]) / Math.max(1, m[i][0] - m[i - 1][0]));
    return m[m.length - 1][1];
  }
  return lerp(l.t0, l.t1, clamp(ch / Math.max(1, l.text.length)));
}
function layout(lines, spec, voice) {
  const intro = introOf(spec), outro = outroOf(spec);
  if (voice && voice.lines?.length === lines.length && voice.lines.every((v, i) => v.text === lines[i].text)) {
    lines.forEach((l, i) => { const v = voice.lines[i]; l.t0 = v.start; l.t1 = v.end; l.marks = v.marks; l.audio = v.file; });
    return Math.max(spec.duration || 0, Math.ceil((voice.duration + outro) * 10) / 10);
  }
  if (voice) console.warn('voice.json does not match the script any more (lines changed) - using estimated timing; rerun voice.py');
  let d = lines.map((l) => l.dur || estimate(l, spec.lang));
  let gaps = lines.map((l) => l.gap ?? (isViral(spec) ? 0.1 : 0.25));
  // viral clips run as long as the script needs (no padding); story clips are fitted into `duration`
  const DUR = spec.duration || (isViral(spec) ? Math.ceil((intro + d.reduce((a, b) => a + b, 0) + gaps.slice(0, -1).reduce((a, b) => a + b, 0) + outro) * 10) / 10 : 30);
  const avail = DUR - intro - outro, used = d.reduce((a, b) => a + b, 0) + gaps.slice(0, -1).reduce((a, b) => a + b, 0);
  if (used > avail) { const k = avail / used; d = d.map((x) => x * k); gaps = gaps.map((x) => x * k); }
  else { const per = Math.min(0.5, (avail - used) / Math.max(1, lines.length - 1)); gaps = gaps.map((x, i) => (i < lines.length - 1 ? x + per : x)); }
  let t = intro;
  lines.forEach((l, i) => { l.t0 = t; l.t1 = t + d[i]; t = l.t1 + gaps[i]; });
  return DUR;
}
// Narration -> punch caption chunks: 1-3 words (~10 characters), breaking after punctuation; emphasised words in yellow.
function punchChunks(l, maxLen = 10) {
  const toks = []; const re = /\S+/g; let m;
  while ((m = re.exec(l.text))) {
    const w = m[0], a = m.index;
    if (baseLen(w) > maxLen + 4 && /[\u0E00-\u0E7F]/.test(w)) { let o = a; for (const x of words(w)) { if (x.trim()) toks.push({ s: x, a: o }); o += x.length; } }
    else toks.push({ s: w, a });
  }
  for (let i = toks.length - 2; i >= 0; i--) if (GLUE.has(toks[i].s.toLowerCase())) {   // glue: back to front, so chains join
    const nx = toks.splice(i + 1, 1)[0]; toks[i] = { s: l.text.slice(toks[i].a, nx.a + nx.s.length), a: toks[i].a };
  }
  const out = []; let cur = [];
  const flush = () => { if (!cur.length) return; const a = cur[0].a, b = cur[cur.length - 1].a + cur[cur.length - 1].s.length; out.push({ text: l.text.slice(a, b), a, b, emph: (l.emph || []).some(([x, y]) => x < b && y > a) }); cur = []; };
  for (const tk of toks) {
    const len = cur.reduce((n, x) => n + baseLen(x.s) + 1, 0);
    if (cur.length && (len + baseLen(tk.s) > maxLen || cur.length >= 3)) flush();
    cur.push(tk);
    if (/[,.!?;:\u2014\u2026]$/.test(tk.s)) flush();
  }
  flush();
  return out.map((c, i) => ({ ...c, t0: i ? timeOfChar(l, c.a) : l.t0, t1: i < out.length - 1 ? timeOfChar(l, out[i + 1].a) : l.t1 }));
}
// Narration text -> caption chunks with times. With a voice-over, voice.json gives `marks` = [[charOffset, time], ...]
// (word or character boundaries from the TTS) and each chunk starts when its first character is spoken.
function chunks(l, maxLen = 17) {
  // phrase-first: the writer's spaces are kept, only phrases longer than maxLen split into words; balanced pieces
  const toks = []; let off = 0;
  for (const part of l.text.split(/(\s+)/)) {
    if (!part) continue;
    if (/^\s+$/.test(part)) toks.push({ s: part, a: off, sp: true });
    else if (baseLen(part) <= maxLen) toks.push({ s: part, a: off });
    else { let o = off; for (const w of words(part)) { toks.push({ s: w, a: o }); o += w.length; } }
    off += part.length;
  }
  const total = baseLen(l.text), n = Math.max(1, Math.ceil(total / maxLen)), target = total / n;
  const out = []; let cur = [], cl = 0;
  const flush = () => { const t = cur.map((x) => x.s).join('').trim(); if (t) out.push({ text: t, a: cur[0].a, b: cur[cur.length - 1].a + cur[cur.length - 1].s.length }); cur = []; cl = 0; };
  for (const tk of toks) {
    if (tk.sp) { if (cur.length) cur.push(tk); continue; }
    const ul = baseLen(tk.s);
    if (cl && out.length < n - 1 && cl + ul > target && (cl >= target * 0.6 || cl + ul > maxLen + 3)) flush();
    cur.push(tk); cl += ul;
  }
  flush();
  if (l.marks?.length > 1) {
    const at = (ch) => { const m = l.marks; if (ch <= m[0][0]) return m[0][1]; for (let i = 1; i < m.length; i++) if (ch <= m[i][0]) return lerp(m[i - 1][1], m[i][1], (ch - m[i - 1][0]) / Math.max(1, m[i][0] - m[i - 1][0])); return m[m.length - 1][1]; };
    return out.map((c, i) => ({ text: c.text, t0: i ? at(c.a) : l.t0, t1: i < out.length - 1 ? at(out[i + 1].a) : l.t1 }));
  }
  const sum = out.reduce((acc, c) => acc + baseLen(c.text), 0) || 1;
  let t = l.t0;
  return out.map((c) => { const d = ((l.t1 - l.t0) * baseLen(c.text)) / sum; const r = { text: c.text, t0: t, t1: t + d }; t += d; return r; });
}

// ------------------------------------------------------------------ background extras (original generic people)
const stagger = (a, i) => (Array.isArray(a) ? a.map((x) => stagger(x, i)) : typeof a === 'string' ? { do: a, t: 0.06 * (i % 5) } : { ...a, t: (typeof a.t === 'number' ? a.t : 0) + 0.06 * (i % 5) });
function extraSpec(kind, seed) {
  const R = rng(seed * 7919 + 13), pick = (arr) => arr[Math.floor(R() * arr.length) % arr.length];
  const skin = pick(['#f1c79f', '#e8b88c', '#f6d2ad', '#d9a57a', '#c98e62', '#efc4a0']);
  const tops = ['#e8453c', '#2d6cdf', '#3fae5a', '#ffd23f', '#ff8fb1', '#7c5cbf', '#ff9f1c', '#2bb3b1', '#f2f2f2'];
  const bottoms = ['#2b3a5a', '#3a2f2a', '#4a4a55', '#1f4e5f', '#5a3d2b'];
  const girl = R() < 0.5, hairC = pick(['#1d1714', '#2a1d16', '#3b2a20', '#5a3622']);
  const hair = { style: girl ? pick(['ponytail', 'pigtails', 'bun', 'curly']) : pick(['short', 'short', 'side', 'curly']), color: kind === 'elder' ? '#e6e6e6' : hairC };
  if (hair.style === 'pigtails') hair.bows = pick([0xffd23f, 0xff6f9f, 0x7fd8ff]);
  const kid = kind === 'kid' || kind === 'student';
  const s = {
    name: kind === 'student' || kind === 'kid' ? 'เพื่อน' : 'คนแถวนั้น', kind: 'human', extra: true, skin, hair, voice: null,
    scale: kid ? 0.64 + R() * 0.08 : kind === 'elder' ? 0.88 + R() * 0.05 : 0.92 + R() * 0.1, build: 0.95 + R() * 0.2,
    clothes: kind === 'student' ? [[0.12, '#ffffff'], [0.56, '#ffffff'], [0.32, girl ? '#1f3a6b' : '#22314f']] : [[0.12, pick(tops)], [0.56, pick(tops)], [0.32, pick(bottoms)]],
    lashes: girl, freckles: R() < 0.15, glasses: R() < (kind === 'elder' ? 0.6 : 0.15) ? 0x3a2a20 : undefined,
  };
  if (s.clothes[1][1] !== s.clothes[0][1] && kind !== 'student') s.clothes[0][1] = s.clothes[1][1];
  if (girl && (kind === 'student' || R() < 0.4)) s.skirt = { color: new THREE.Color(kind === 'student' ? '#1f3a6b' : pick(bottoms)).getHex(), length: kid ? 0.36 : 0.45 };
  if (kind === 'student') s.pattern = undefined; else if (R() < 0.25) s.pattern = pick(['dots', 'stripe-chest']);
  if (kind === 'elder') s.wrinkles = true;
  if (kind === 'worker') {                         // coverall + hard hat (+ hi-vis vest)
    const c = pick(['#2b4c7e', '#3d6f8f', '#56606b', '#2f6b5a', '#34495e']);
    Object.assign(s, { clothes: [[0.12, c], [0.88, c]], skirt: undefined, pattern: undefined, name: 'พนักงาน' });
    s.wear = [`hardhat:${pick(['yellow', 'white', 'blue', 'orange'])}`, ...(R() < 0.6 ? [`vest:${pick(['orange', 'lime'])}`] : [])];
  }
  if (kind === 'vendor') { s.apron = new THREE.Color(pick(['#f7e3b0', '#ffffff', '#cfe8ff', '#ffd6e0'])).getHex(); s.name = girl ? 'แม่ค้า' : 'พ่อค้า'; }
  return s;
}

// ------------------------------------------------------------------ actions (upper body), all in hips-local space
const A = {
  talk: (t, c) => { const a = Math.sin(t * 5.2 + c.phase), b = Math.sin(t * 4.1 + 1.3 + c.phase); return { handR: V(-0.38 + 0.05 * a, 1.08 + 0.1 * Math.max(0, a), 0.32), handL: V(0.36, 1.0 + 0.06 * Math.max(0, b), 0.26), headRoll: 0.04 * a }; },
  wave: (t) => ({ handR: V(-0.55 + 0.12 * Math.sin(t * 12), 1.98, 0.15), headRoll: 0.08 }),
  cheer: (t) => ({ handL: V(0.55, 2.0 + 0.06 * Math.sin(t * 12), 0.1), handR: V(-0.55, 2.0 + 0.06 * Math.sin(t * 12 + 1), 0.1), hipsY: 0.06 * Math.abs(Math.sin(t * 6)), face: { eyes: 'happy', mouth: 'laugh' } }),
  shrug: () => ({ handL: V(0.56, 1.15, 0.3), handR: V(-0.56, 1.15, 0.3), headRoll: 0.15, face: { brow: -0.2, browUp: 0.8, mouth: 'flat' } }),
  facepalm: () => ({ handR: V(-0.06, 1.78, 0.44), headPitch: 0.25, face: { eyes: 'closed', mouth: 'flat' } }),
  think: () => ({ handR: V(-0.08, 1.58, 0.42), handL: V(0.08, 1.08, 0.32), headRoll: 0.1, face: { look: [0.35, 0.5], mouth: 'flat', brow: 0.15 } }),
  laugh: (t) => ({ handL: V(0.18, 1.0, 0.33), handR: V(-0.18, 1.0, 0.33), hipsRX: -0.12 + 0.04 * Math.sin(t * 14), face: { eyes: 'happy', mouth: 'laugh' } }),
  scared: (t) => ({ handL: V(0.26, 1.72, 0.42), handR: V(-0.26, 1.72, 0.42), shake: 0.018, face: { eyes: 'wide', mouth: 'wavy', brow: -0.45, browUp: 0.6 } }),
  cry: (t) => ({ handL: V(0.12, 1.86, 0.43), handR: V(-0.12, 1.86, 0.43), headPitch: 0.15, shake: 0.008, face: { eyes: 'closed', mouth: 'frown', brow: -0.45 } }),
  clap: (t) => { const k = Math.abs(Math.sin(t * 9)); return { handL: V(0.05 + 0.12 * k, 1.28, 0.42), handR: V(-0.05 - 0.12 * k, 1.28, 0.42), face: { eyes: 'happy', mouth: 'grin' } }; },
  eat: (t) => { const k = 0.5 - 0.5 * Math.cos(t * 4.5); return { handR: vlerp(V(-0.36, 1.08, 0.32), V(-0.08, 1.62, 0.42), k) }; },
  hold: () => ({ handR: V(-0.3, 1.12, 0.36) }),
  holdBoth: () => ({ handL: V(0.17, 1.12, 0.38), handR: V(-0.17, 1.12, 0.38) }),
  give: () => ({ handR: V(-0.18, 1.22, 0.66) }),
  phone: () => ({ handR: V(-0.12, 1.45, 0.45), headPitch: 0.28 }),
  read: () => ({ handL: V(0.17, 1.2, 0.42), handR: V(-0.17, 1.2, 0.42), headPitch: 0.32 }),
  sleep: () => ({ headPitch: 0.35, headRoll: 0.25, face: { eyes: 'closed', mouth: 'o-small' }, emote: 'zzz' }),
  dance: (t) => { const a = Math.sin(t * 7); return { handL: V(0.5, 1.5 + 0.4 * a, 0.2), handR: V(-0.5, 1.5 - 0.4 * a, 0.2), hipsRZ: 0.12 * a, hipsY: 0.05 * Math.abs(Math.sin(t * 7)), face: { eyes: 'happy', mouth: 'grin' } }; },
  wai: () => ({ handL: V(0.04, 1.6, 0.42), handR: V(-0.04, 1.6, 0.42), headPitch: 0.28, hipsRX: 0.14 }),
  search: (t) => ({ hipsRX: 0.38, handL: V(0.42 + 0.08 * Math.sin(t * 6), 0.72, 0.5), handR: V(-0.42 - 0.08 * Math.sin(t * 6 + 1), 0.72, 0.5), headPitch: 0.35 }),
  stretch: (t) => { const a = Math.sin(t * 3); return { handL: V(0.62, 1.9 + 0.1 * a, 0.05), handR: V(-0.62, 1.9 - 0.1 * a, 0.05), hipsRZ: 0.18 * a }; },
  exercise: (t) => { const a = Math.abs(Math.sin(t * 3.6)); return { handL: V(0.55, 1.2 + 0.7 * a, 0.2), handR: V(-0.55, 1.2 + 0.7 * a, 0.2), hipsY: -0.12 * (1 - a) }; },
  jump: (t, c, o) => ({ rootY: 0.42 * Math.abs(Math.sin((t - o.t0) * Math.PI * 2.4)), handL: V(0.5, 1.85, 0.1), handR: V(-0.5, 1.85, 0.1), face: { eyes: 'happy', mouth: 'laugh' } }),
  nod: (t) => ({ headPitch: 0.18 * Math.max(0, Math.sin(t * 9)) }),
  shush: () => ({ handR: V(-0.03, 1.74, 0.45), headPitch: -0.05, face: { mouth: 'o-small', brow: 0.35 } }),
  bite: (t, c, o) => { const k = Math.sin(Math.PI * clamp((t - o.t0) / 0.7, 0, 1)); return { handR: vlerp(V(-0.3, 1.12, 0.36), V(-0.06, 1.6, 0.42), k), face: { mouth: k > 0.85 ? 'o' : 'grin' } }; },   // one bite, mouth reached at t0 + 0.35
  inhale: (t, c, o) => { const k = sstep(range(t, o.t0, o.t0 + 0.8)); return { headPitch: -0.3 * k, hipsRX: -0.05 * k, handL: V(0.3, 1.2 + 0.1 * k, 0.3), handR: V(-0.3, 1.2 + 0.1 * k, 0.3), face: { eyes: 'closed', mouth: 'o-small' } }; },
  pull: (t, c, o) => { const k = sstep(range(t, o.t0 + 0.15, o.t0 + 0.5)); return { handR: V(-0.45, 2.3 - 0.22 * k, 0.6), handL: V(0.36, 1.05, 0.25), headPitch: -0.25, headYaw: -0.35 }; },
  press: (t) => ({ handR: V(-0.12, 1.25, 0.6 + 0.04 * Math.max(0, Math.sin(t * 8))), headPitch: 0.15 }),
  type: (t) => ({ handL: V(0.16, 1.02 + 0.025 * Math.max(0, Math.sin(t * 15)), 0.5), handR: V(-0.16, 1.02 + 0.025 * Math.max(0, Math.sin(t * 15 + 1.7)), 0.5), headPitch: 0.3 }),
  stir: (t) => ({ handR: V(-0.2 + 0.07 * Math.cos(t * 5), 1.12, 0.52 + 0.07 * Math.sin(t * 5)), handL: V(0.26, 1.02, 0.38), headPitch: 0.25 }),
  fan: (t) => ({ handR: V(-0.3 + 0.16 * Math.sin(t * 9), 1.02, 0.5), handL: V(0.3, 0.98, 0.25), headPitch: 0.2 }),
  spicy: (t) => ({ handR: V(-0.2 + 0.07 * Math.sin(t * 20), 1.64, 0.5), handL: V(0.3, 1.0, 0.3), headPitch: -0.12, shake: 0.006, face: { eyes: 'closed', mouth: 'o', brow: -0.35, blush: 1 }, emote: 'steam' }),   // too hot! fans the mouth, steam from the head
  aim: (t) => ({ handR: V(-0.12, 1.3, 0.56), handL: V(0.06, 1.24, 0.46), headPitch: 0.04, hipsRX: 0.05 }),   // water gun at chest height
  throw: (t, c, o) => { const k = eout(range(t, o.t0 + 0.15, o.t0 + 0.5)); return { handL: vlerp(V(0.2, 0.95, 0.15), V(0.2, 1.65, 0.62), k), handR: vlerp(V(-0.2, 0.95, 0.15), V(-0.2, 1.65, 0.62), k), hipsRX: 0.18 - 0.3 * k, face: { mouth: 'laugh', eyes: 'happy' } }; },   // bucket splash, peak at t0 + 0.5
  pour: () => ({ handR: V(-0.08, 1.2, 0.55), handL: V(0.1, 1.15, 0.48), headPitch: 0.3, hipsRX: 0.12 }),   // pouring from a bowl held out front
  receive: () => ({ handL: V(0.06, 1.12, 0.46), handR: V(-0.06, 1.12, 0.46), headPitch: 0.18, face: { eyes: 'happy', mouth: 'smile' } }),   // palms together, held out (blessing)
  pound: (t, c, o) => { const k = Math.abs(Math.sin((t - o.t0) * 6.5)); return { handR: V(-0.12, 1.02 + 0.22 * k, 0.46), handL: V(0.22, 0.95, 0.4), headPitch: 0.3 }; },   // mortar & pestle: hits at t0 + n * 0.483 s
  carry: () => ({ handL: V(0.19, 1.12, 0.46), handR: V(-0.19, 1.12, 0.46) }),
  raise: (t) => ({ handR: V(-0.32, 2.2 + 0.04 * Math.sin(t * 9), 0.08), handL: V(0.36, 1.0, 0.25), face: { mouth: 'grin' } }),
  shake: (t) => ({ headYaw: 0.3 * Math.sin(t * 10), face: { mouth: 'flat' } }),
  point: (t, c, o, ctx) => {
    const target = ctx.resolve(o.target);
    if (!target) return { handR: V(-0.55, 1.4, 0.55) };
    const lt = c.rig.hips.worldToLocal(target.clone()), sh = V(-0.25, 1.3, 0.02);
    const d = lt.sub(sh); d.y = clamp(d.y, -0.4, 0.8); d.normalize();
    return { handR: sh.addScaledVector(d, 0.72) };
  },
};
const DOG = { sit: { sit: 1 }, lie: { lie: 1, eyesClosed: true, wag: 0.05, pant: 0 }, sleep: { lie: 1, eyesClosed: true, wag: 0, pant: 0, emote: 'zzz' },
  wag: { wag: 1 }, bark: { bark: 1, wag: 0.8 }, beg: { sit: 1, headPitch: -0.3, wag: 1 }, sniff: { headPitch: 0.5, wag: 0.5 } };

// ------------------------------------------------------------------ the episode
// hooks (for the bundled single-file player, see web/): { loadSet(name) -> module, asset(file) -> url, voice: object|null }
export async function runEpisode(spec, hooks = {}) {
  KEEP = spec.keep || []; GLUE = new Set(spec.glue === true ? GLUE_EN : spec.glue || []);
  const stage = createStage({ W: Math.round(W * PXS), H: Math.round(H * PXS) });
  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(50, W / H, 0.05, 800);
  const assetUrl = hooks.asset || ((file) => '/assets/' + file);
  const ctxSet = {
    tex: (file, o = {}) => loadTexOr(assetUrl(file), o.fallback || (() => tex(8, 8, (g) => { g.fillStyle = '#cfcac0'; g.fillRect(0, 0, 8, 8); })), { rep: o.rep, srgb: o.srgb !== false }),
    rng, opts: typeof spec.setOpts === 'function' ? spec.setOpts(0) : spec.setOpts || {},
  };
  const setMod = hooks.loadSet ? await hooks.loadSet(spec.set) : await import(`./sets/${spec.set}.js`);
  const set = await setMod.buildSet(scene, ctxSet);
  // episode-specific additions: spec.build({ scene, set, THREE, tex, V, rng, toon, part, outline, makeProp })
  //   -> { props?: { name: Object3D }, update?(t, { lineAt, cast, set }) }  (update runs before the cast is posed: use timeline data only)
  const extra = (spec.build && (await spec.build({ scene, set, THREE, tex: ctxSet.tex, V, rng, toon, part, outline, makeProp, renderer: stage.renderer, camera, W, H }))) || {};
  // big static set meshes (walls, cabinets ...) that auto-framed cameras must not pass through
  const blockers = [], clutter = [];
  scene.updateMatrixWorld(true);
  scene.traverse((o) => {
    // clutter = anything solid that can stand in front of a face (noBlock poles, awnings and fences included: cameras
    // may pass through them, but an angle with a pole across the subject still loses to a clear one)
    const m = o.material, solid = m && !m.isShaderMaterial && (!m.transparent || (m.opacity ?? 1) >= 0.5 || m.alphaTest > 0);
    if (o.isMesh && solid && !o.userData.noClutter) clutter.push(o);
    if (!o.isMesh || o.userData.noBlock || o.material?.isShaderMaterial || o.material?.transparent || o.isInstancedMesh) return;
    o.geometry.computeBoundingSphere();
    const r = o.geometry.boundingSphere.radius * o.getWorldScale(new THREE.Vector3()).length() / Math.sqrt(3);
    if (r > 1.2 && r < 60) blockers.push(o);
  });
  let voice = hooks.voice ?? null;
  if (!('voice' in hooks)) try { const r = await fetch('voice.json', { cache: 'no-store' }); if (r.ok) voice = await r.json(); } catch { /* no voice-over yet */ }
  const lines = normalize(spec);
  const DUR = layout(lines, spec, voice);
  const outroAt = DUR - outroOf(spec);
  // 'line:4' | 'line:4+0.5' | 'line:4@cord' (when the word 'cord' is spoken) | 'line:4@cord-0.2' | 'end' | seconds
  const lineAt = (ref) => {
    if (typeof ref === 'number') return ref;
    if (ref === 'end') return outroAt;
    const m = /^line:(\d+)(?:@([^+\-\s]+))?([+-][\d.]+)?$/.exec(ref);
    if (!m) { console.warn('bad time reference', ref); return 0; }
    const l = lines[+m[1]];
    let t = l.t0;
    if (m[2]) {                                    // '@word' = first match; '@word#2' = the second match, ...
      const [w, nth] = m[2].split('#'), low = l.text.toLowerCase(), ww = w.toLowerCase();
      let k = low.indexOf(ww); for (let n = 1; k >= 0 && n < (+nth || 1); n++) k = low.indexOf(ww, k + ww.length);
      if (k >= 0) t = timeOfChar(l, k); else console.warn(`word "${m[2]}" not in line ${m[1]}`);
    }
    return t + (+m[3] || 0);
  };

  // ---- cast
  const C = {};
  for (const [key, v0] of Object.entries(spec.cast)) {
    // { base: 'max', as: { clothes, pattern, ... } } = a second look of a cast member (e.g. Max in a new outfit) under its own key
    const v = typeof v0 === 'string' || Array.isArray(v0) ? { at: v0 } : v0, base = CAST[v.base || key], cs = base && (v.as ? { ...base, ...v.as } : base);
    if (!cs) throw new Error('unknown cast member ' + key);
    const rig = cs.kind === 'dog' ? buildDog(scene, key, cs) : buildHuman(scene, key, cs);
    const spot = resolveSpot(v.at);
    C[key] = { key, rig, spec: cs, scale: cs.scale, phase: (key.length * 1.37) % 6.28, start: v.at, startSpot: spot, yaw0: v.yaw ?? spot.yaw ?? 0,
      mood0: v.mood || 'neutral', moves: [], acts: [], moods: [], looks: [], speaks: [], holds: [], emotes: [], turns: [], arrivals: [],
      wear0: (v.wear ? [].concat(v.wear) : []).map(parseWear), wears: [] };
  }
  // ---- extras: generic background people (classmates, audience, shoppers) - spec.extras = ['desk_1', { at, kind, seed, mood }]
  //      kind: 'kid' | 'student' (Thai school uniform) | 'adult' | 'elder'. Address them all in an act with the key `extras`.
  const extraKeys = [];
  (spec.extras || []).forEach((e0, i) => {
    const e = typeof e0 === 'string' || Array.isArray(e0) ? { at: e0 } : e0, key = `x${i + 1}`;
    const es = extraSpec(e.kind || spec.extraKind || 'kid', (e.seed ?? i) + 17 * (spec.extraSeed || 0));
    Object.assign(es, spec.extraAs || {}, e.as || {});                                    // e.g. spec.extraAs = VARIANT (cast.js)
    if (e.name) es.name = e.name;
    if (e.clothes) { es.clothes = e.clothes; es.skirt = e.skirt; es.pattern = undefined; }      // e.g. a priest in white: [[0.12,'#fff'],[0.56,'#fff'],[0.32,'#fff']]
    const spot = resolveSpot(e.at);
    C[key] = { key, rig: buildHuman(scene, key, es), spec: es, scale: es.scale, phase: (i * 2.39 + 0.7) % 6.28, start: e.at, startSpot: spot,
      yaw0: e.yaw ?? spot.yaw ?? 0, mood0: e.mood || 'neutral', extra: true, moves: [], acts: [], moods: [], looks: [], speaks: [], holds: [], emotes: [], turns: [], arrivals: [],
      wear0: [...(es.wear || []), ...(e.wear ? [].concat(e.wear) : [])].map(parseWear), wears: [] };
    extraKeys.push(key);
  });
  function resolveSpot(name) {
    if (name && typeof name === 'object' && name.isVector3) return { pos: name.clone(), yaw: 0 };
    if (Array.isArray(name)) return { pos: V(name[0], 0, name[1]), yaw: name[2] ?? 0, sit: name[3] };   // [x, z, yaw, seatHeight?]
    if (typeof name === 'object' && name.pos) return name.pos.isVector3 ? name : { ...name, pos: V(...name.pos) };
    const s = set.spots[name];
    if (!s) throw new Error(`set ${spec.set} has no spot "${name}" (spots: ${Object.keys(set.spots).join(', ')})`);
    return s;
  }

  // ---- props (set props with the same name are reused)
  const P = {};
  const propOf = (name, kind) => {
    const given = extra.props?.[name] || set.props?.[name];
    return (P[name] ||= { obj: given || makeProp(scene, spec.props?.[name]?.kind || kind || name), own: !given, rest: spec.props?.[name]?.rest, hidden: !!spec.props?.[name]?.hidden });
  };
  for (const [name, v] of Object.entries(spec.props || {})) propOf(name, v.kind);

  // ---- compile timelines from the lines
  const addAct = (c, a, l) => {
    if (typeof a === 'string') a = { do: a };
    if (Array.isArray(a)) return a.forEach((x) => addAct(c, x, l));
    if (a.t === 'arrive') { c.arrivals.push({ a: { ...a, t: 0 }, base: l.t0 }); return; }     // starts when this line's walk ends
    const t0 = typeof a.t === 'string' && a.t.startsWith('line:') ? lineAt(a.t) : (a.t ?? 0) + l.t0;        // t: offset | 'line:3@word'
    const t1 = a.dur ? t0 + a.dur : a.until ? (a.until === 'end' ? DUR : lineAt(a.until)) : l.t1;
    if (a.mood) c.moods.push({ t: t0, mood: a.mood });
    if (a.look) c.looks.push({ t0, t1, target: a.look });
    if (a.emote) c.emotes.push({ t0, t1: Math.min(t0 + 1.6, DUR), kind: a.emote });
    if (a.turn !== undefined) c.turns.push({ t: t0, target: a.turn });
    for (const w of a.wear ? [].concat(a.wear) : []) c.wears.push({ t: t0, on: true, ...parseWear(w) });
    for (const w of a.unwear ? [].concat(a.unwear) : []) c.wears.push({ t: t0, on: false, ...parseWear(w) });
    if (!a.do) return;
    if (a.do === 'walk' || a.do === 'run') c.moves.push({ t0, to: a.to, run: a.do === 'run', dur: a.dur, silent: a.silent });   // silent: no footsteps (off-screen walks)
    else if (a.do === 'hold' || a.do === 'holdBoth') { c.holds.push({ t0, t1, prop: a.prop, both: a.do === 'holdBoth', left: a.hand === 'L', tilt: a.tilt || 0 }); propOf(a.prop, a.kind); if (a.do === 'holdBoth' || a.pose !== false) c.acts.push({ t0, t1, name: a.do, o: a }); }
    else c.acts.push({ t0, t1, name: a.do, o: { ...a, t0 } });
  };
  for (const l of lines) {
    if (l.who !== 'narrator') {
      const c = C[l.who];
      c.speaks.push({ t0: l.t0, t1: l.t1 });
      if (l.mood) c.moods.push({ t: l.t0, mood: l.mood });
      if (l.emote) c.emotes.push({ t0: l.t0, t1: Math.min(l.t0 + 1.6, DUR), kind: l.emote });
      if (!l.act[l.who] && c.spec.kind !== 'dog') c.acts.push({ t0: l.t0, t1: l.t1, name: 'talk', o: {} });
      for (const other of Object.values(C)) if (other !== c && !(l.act[other.key]?.look)) other.looks.push({ t0: l.t0, t1: l.t1, target: l.who, soft: true });
    }
    for (const [k, a] of Object.entries(l.act)) {
      if (C[k]) addAct(C[k], a, l);
      else if (k === 'extras') extraKeys.forEach((ek, i) => addAct(C[ek], stagger(a, i), l));   // everyone in the background, slightly out of sync
    }
  }
  for (const e of spec.events || []) {
    const l = { t0: lineAt(e.at), t1: lineAt(e.at) + (e.dur || 1.5) };
    for (const [k, a] of Object.entries(e.act || {})) { if (C[k]) addAct(C[k], a, l); else if (k === 'extras') extraKeys.forEach((ek, i) => addAct(C[ek], stagger(a, i), l)); }
  }
  // walks: resolve path, duration and the spot each one ends on
  for (const c of Object.values(C)) {
    c.moves.sort((a, b) => a.t0 - b.t0);
    let fromName = c.start, from = c.startSpot;
    for (const m of c.moves) {
      const via = Array.isArray(m.to) && Array.isArray(m.to[0]) ? m.to.slice(0, -1).map((p) => V(p[0], 0, p[1])) : null;
      const dest = via ? m.to[m.to.length - 1] : m.to;
      const to = resolveSpot(dest);
      const mid = via || set.routes?.[`${fromName}>${dest}`] || [];
      const feet = (sp) => (sp.sit ? sp.pos.clone().addScaledVector(fwd(sp.yaw ?? 0), 0.3) : sp.pos.clone());
      const path = [feet(from), ...mid.map((p) => p.clone()), feet(to)];
      let len = 0; for (let i = 1; i < path.length; i++) len += path[i].distanceTo(path[i - 1]);
      const speed = (m.run ? 2.6 : 1.25) * Math.max(0.75, c.scale);
      Object.assign(m, { from, fromName, toSpot: to, path, len, t1: m.t0 + (m.dur || Math.max(0.6, len / speed)) + (from.sit ? 0.35 : 0) + (to.sit ? 0.35 : 0) });
      fromName = typeof dest === 'string' ? dest : '?'; from = to;
    }
    for (const { a, base } of c.arrivals) {        // actions queued after a walk (t: 'arrive')
      const m = c.moves.find((mv) => mv.t0 >= base - 0.01) || c.moves[c.moves.length - 1];
      const at = m ? m.t1 : base;
      if (a.do === 'walk' || a.do === 'run') { console.warn('t: "arrive" walks are not chained; give the second walk its own line'); continue; }
      addAct(c, { ...a, dur: a.dur || (a.until === 'end' ? undefined : 1.6) }, { t0: at, t1: at + 1.6 });
    }
    c.acts.sort((a, b) => a.t0 - b.t0); c.moods.sort((a, b) => a.t - b.t); c.wears.sort((a, b) => a.t - b.t);
  }
  // speakers standing with a wall (or a fridge, a board ...) right in front of them turn toward the nearest listener
  {
    const fwdRay = new THREE.Raycaster();
    for (const l of lines) {
      const c = C[l.who];
      if (!c || c.spec.kind === 'dog' || (l.act[l.who] && l.act[l.who].turn !== undefined)) continue;
      const pl = placeAt(c, l.t0);
      if (pl.sit || pl.moving) continue;
      fwdRay.set(pl.pos.clone().add(V(0, 1.2 * c.scale, 0)), fwd(pl.yaw)); fwdRay.far = 1.4;
      if (!fwdRay.intersectObjects(blockers, false).length) continue;
      let best = null, bd = Infinity;
      for (const o of Object.values(C)) { if (o === c) continue; const d = placeAt(o, l.t0, true).pos.distanceTo(pl.pos) + (o.spec.kind === 'dog' ? 3 : 0); if (d < bd) { bd = d; best = o.key; } }
      if (best) { c.turns.push({ t: l.t0 - 0.2, target: best }); c.turns.sort((a, b) => a.t - b.t); }
    }
    for (const c of Object.values(C)) c.turns.sort((a, b) => a.t - b.t);
  }

  // ---- wardrobe at t (hard hat / vest), from the cast entry's `wear` and timed `wear` / `unwear` actions
  function wearAt(c, t) {
    const st = { hardhat: null, vest: null };
    const apply = (w, on) => { if (w.kind in st) st[w.kind] = on ? (w.color ?? (w.kind === 'vest' ? WEAR_COLORS.orange : WEAR_COLORS.yellow)) : null; };
    for (const w of c.wear0) apply(w, true);
    for (const e of c.wears) if (t >= e.t) apply(e, e.on);
    return st;
  }

  // ---- where is a character at t (root position/yaw, sitting amount, gait)
  // Turns ({ turn: target } in an act, or automatic for speakers facing a wall) rotate a standing character in place
  // until their next walk. target: cast key | point | spot | [x, z] | yaw in radians.
  function turnTarget(target, t) {
    if (typeof target === 'number') return null;
    if (C[target]) return placeAt(C[target], t, true).pos;
    if (Array.isArray(target)) return V(target[0], 0, target[target.length === 3 ? 2 : 1]);
    return set.points?.[target]?.clone() || set.spots?.[target]?.pos.clone() || null;
  }
  function standYaw(c, spot, yaw, since, t, pos) {
    if (spot.sit) return yaw;
    for (const tr of c.turns) {
      if (tr.t < since || t < tr.t) continue;
      const p = turnTarget(tr.target, tr.t);
      const want = typeof tr.target === 'number' ? tr.target : p ? Math.atan2(p.x - pos.x, p.z - pos.z) : yaw;
      yaw = angLerp(yaw, want, sstep(range(t, tr.t, tr.t + 0.4)));
    }
    return yaw;
  }
  function placeAt(c, t, noTurn = false) {
    let spot = c.startSpot, yaw = c.yaw0, since = -Infinity;
    for (const m of c.moves) {
      if (t < m.t0) break;
      if (t >= m.t1) { spot = m.toSpot; yaw = m.toSpot.yaw ?? yaw; since = m.t1; continue; }
      if (!noTurn) yaw = standYaw(c, spot, yaw, since, m.t0, spot.pos);
      const up = m.from.sit ? 0.35 : 0, down = m.toSpot.sit ? 0.35 : 0;
      const tw0 = m.t0 + up, tw1 = m.t1 - down;
      if (t < tw0) return { ...seatPlace(m.from, m.from.sit ? m.from.yaw ?? yaw : yaw), sit: 1 - sstep(range(t, m.t0, tw0)), gait: 0 };
      if (t > tw1) return { ...seatPlace(m.toSpot, m.toSpot.yaw ?? yaw), sit: sstep(range(t, tw1, m.t1)), gait: 0 };
      const k = eio(range(t, tw0, tw1)), dist = k * m.len;
      let acc = 0, pos = m.path[0].clone(), dir = V(0, 0, 1);
      for (let i = 1; i < m.path.length; i++) {
        const seg = m.path[i].distanceTo(m.path[i - 1]);
        dir = m.path[i].clone().sub(m.path[i - 1]).normalize();
        if (acc + seg >= dist || i === m.path.length - 1) { pos = m.path[i - 1].clone().addScaledVector(dir, Math.min(seg, dist - acc)); break; }
        acc += seg;
      }
      const travelYaw = Math.atan2(dir.x, dir.z);
      let y = angLerp(m.from.sit ? m.from.yaw ?? yaw : yaw, travelYaw, sstep(range(t, tw0, tw0 + 0.25)));
      y = angLerp(y, m.toSpot.yaw ?? travelYaw, sstep(range(t, tw1 - 0.3, tw1)));
      const stride = (m.run ? 0.75 : 0.52) * c.scale;
      return { pos, yaw: y, sit: 0, gait: (dist / stride) * Math.PI, run: m.run, moving: true };
    }
    if (!noTurn) yaw = standYaw(c, spot, yaw, since, t, spot.pos);
    return { ...seatPlace(spot, yaw), sit: spot.sit ? 1 : 0, gait: 0 };
  }
  function seatPlace(spot, yaw) { const p = spot.pos.clone(); if (spot.sit) p.addScaledVector(fwd(yaw), 0.3); return { pos: p, yaw, seatH: spot.sit || 0 }; }

  // ---- look targets: a cast key, a set point, a spot, 'camera', or a Vector3
  const ctx = {
    t: 0,                                   // the frame being posed (set by setScene) for function targets
    resolve(target) {
      if (!target) return null;
      if (typeof target === 'function') { const v = target(this.t); return Array.isArray(v) ? V(v[0], v[1], v[2]) : v; }
      if (target.isVector3) return target;
      if (Array.isArray(target)) return V(...target);
      if (target === 'camera') return camera.position.clone();
      if (C[target]) return C[target].headW?.clone() || C[target].rig.root.position.clone().add(V(0, 1.8, 0));
      if (set.points?.[target]) return set.points[target].clone();
      if (set.spots?.[target]) return set.spots[target].pos.clone().add(V(0, 1.5, 0));
      return null;
    },
  };
  const active = (list, t) => { let cur = null; for (const x of list) if (t >= x.t0 && t < x.t1) cur = x; return cur; };
  const blendW = (x, t, edge = 0.22) => sstep(range(t, x.t0, x.t0 + edge)) * (1 - sstep(range(t, x.t1 - edge, x.t1)));

  // ---- pose humans and dogs
  function poseHuman(c, t, pass) {
    const pl = placeAt(c, t), s = c.scale, ph = pl.gait;
    const Pp = { pos: pl.pos, yaw: pl.yaw, hipsY: 0.012 * Math.sin(t * 5 + c.phase), hipsZ: 0, hipsRX: 0, hipsRZ: 0.02 * Math.sin(t * 1.9 + c.phase),
      handL: V(0.45, 0.95 + 0.02 * Math.sin(t * 2.4 + c.phase), 0.12), handR: V(-0.45, 0.95 + 0.02 * Math.sin(t * 2.4 + c.phase + 1), 0.12),
      footL: V(0.2, 0.08, 0.05), footR: V(-0.2, 0.08, 0.05), kneeL: null, kneeR: null, headYaw: 0, headPitch: 0, headRoll: 0.03 * Math.sin(t * 1.3 + c.phase) };
    if (pl.moving) {
      const lift = pl.run ? 0.16 : 0.1, swing = pl.run ? 0.3 : 0.22;
      Pp.footL = V(0.18, 0.08 + lift * Math.max(0, Math.sin(ph)), 0.05 + swing * Math.cos(ph));
      Pp.footR = V(-0.18, 0.08 + lift * Math.max(0, Math.sin(ph + Math.PI)), 0.05 + swing * Math.cos(ph + Math.PI));
      Pp.hipsY = 0.028 * Math.abs(Math.sin(ph)); Pp.hipsRX = pl.run ? 0.16 : 0.04;
      Pp.handL = V(0.43, 0.97, 0.12 + 0.18 * Math.cos(ph + Math.PI)); Pp.handR = V(-0.43, 0.97, 0.12 + 0.18 * Math.cos(ph));
    }
    if (pl.sit > 0) {
      const sh = pl.seatH / s, k = pl.sit;
      Pp.hipsY = lerp(Pp.hipsY, sh - 0.58, k); Pp.hipsZ = lerp(0, -0.52 / s, k);
      // knees just past the cushion edge; feet on the floor, or dangling when the seat is high for this character (kids)
      const kz = -0.3 / s + 0.24, fy = Math.max(0.08, sh + 0.03 - 0.62);
      Pp.footL = vlerp(Pp.footL, V(0.17, fy, kz + 0.1), k); Pp.footR = vlerp(Pp.footR, V(-0.17, fy, kz + 0.1), k);
      if (k > 0.05) { Pp.kneeL = V(0.15, lerp(0.4, sh + 0.03, k), lerp(0.1, kz, k)); Pp.kneeR = V(-0.15, lerp(0.4, sh + 0.03, k), lerp(0.1, kz, k)); }
      Pp.handL = vlerp(Pp.handL, V(0.3, 0.82, 0.3), k); Pp.handR = vlerp(Pp.handR, V(-0.3, 0.82, 0.3), k);
    }
    // face: mood + action override + talking + blink
    let mood = c.mood0; for (const m of c.moods) if (t >= m.t) mood = m.mood;
    const face = { ...MOODS.neutral, ...(MOODS[mood] || {}) };
    const act = active(c.acts, t);
    let emote = null, shakeAmp = 0, rootY = 0;
    if (act && A[act.name]) {
      const w = blendW(act, t), o = A[act.name](t, c, act.o, ctx) || {};
      for (const k of ['handL', 'handR']) if (o[k]) Pp[k] = vlerp(Pp[k], o[k], w);
      for (const k of ['hipsY', 'hipsRX', 'hipsRZ', 'headPitch', 'headRoll', 'headYaw']) if (o[k] !== undefined) Pp[k] = lerp(Pp[k], o[k], w);
      if (o.face && w > 0.5) Object.assign(face, o.face);
      if (o.emote) emote = o.emote; shakeAmp = (o.shake || 0) * w; rootY = (o.rootY || 0) * w;
    }
    const hold = active(c.holds, t);
    if (hold) { const w = blendW(hold, t); if (!hold.both) Pp.handR = vlerp(Pp.handR, V(-0.3, 1.12, 0.36), act ? 0 : w); }
    const speak = active(c.speaks, t);
    if (speak) {
      const lv = Math.sin(t * 23 + c.phase) + Math.sin(t * 14.7 + 2 * c.phase);
      face.mouth = lv > 0.7 ? 'talk2' : lv > -0.3 ? 'talk1' : face.mouth === 'laugh' || face.mouth === 'grin' ? 'grin' : 'smile-small';
    }
    face.blink = ((t + c.phase * 3.1) % 3.6) < 0.11;
    if (shakeAmp) { Pp.pos = Pp.pos.clone().add(V(shakeAmp * Math.sin(t * 61), 0, shakeAmp * Math.sin(t * 53))); }
    Pp.pos = Pp.pos.clone().add(V(0, rootY, 0));
    Pp.face = face;
    if (pass === 'base') return Pp;
    // head look (needs camera / other heads, so second pass)
    const look = active(c.looks.filter((x) => !x.soft), t) || active(c.looks, t);
    if (look && !(act && ['facepalm', 'cry', 'sleep', 'search', 'read', 'phone'].includes(act.name))) {
      const target = ctx.resolve(look.target);
      if (target) {
        c.rig.root.position.copy(Pp.pos); c.rig.root.rotation.set(0, Pp.yaw, 0); c.rig.root.updateMatrixWorld(true);
        const lt = c.rig.root.worldToLocal(target.clone()), w = blendW(look, t, 0.3);
        Pp.headYaw += clamp(Math.atan2(lt.x, lt.z), -1.0, 1.0) * w;
        Pp.headPitch += clamp(-Math.atan2(lt.y - 1.86 - Pp.hipsY, Math.hypot(lt.x, lt.z)) * 0.6, -0.35, 0.35) * w;
      }
    }
    c.emote = active(c.emotes, t)?.kind || emote;
    return Pp;
  }
  function poseDog(c, t) {
    const pl = placeAt(c, t);
    const Pp = { pos: pl.pos, yaw: pl.yaw, gait: pl.moving ? pl.gait * 1.6 : 0, wag: 0.4, pant: 0.6 };
    const act = active(c.acts, t);
    if (act && DOG[act.name]) Object.assign(Pp, DOG[act.name]);
    if (act?.name === 'jump') Pp.jump = 0.35 * Math.abs(Math.sin((t - act.t0) * Math.PI * 2.4));
    if (active(c.speaks, t)) Object.assign(Pp, DOG.bark);
    const look = active(c.looks, t);
    if (look) { const target = ctx.resolve(look.target); if (target) { c.rig.root.position.copy(Pp.pos); c.rig.root.rotation.set(0, Pp.yaw, 0); c.rig.root.updateMatrixWorld(true); const lt = c.rig.root.worldToLocal(target.clone()); Pp.headYaw = clamp(Math.atan2(lt.x, lt.z), -0.8, 0.8); } }
    c.emote = active(c.emotes, t)?.kind || DOG[act?.name]?.emote || null;
    return Pp;
  }

  // ---- camera shots (set presets or computed from the cast)
  const shots = [];
  let lastCam = null;
  for (const l of lines) {
    let cam = l.cam;
    if (!cam && !lastCam) cam = 'wide';
    if (!cam && l.who !== 'narrator' && !String(lastCam).includes(l.who)) cam = `medium:${l.who}`;
    if (cam) { shots.push(parseShot(cam, l.t0)); lastCam = cam; }
  }
  for (const e of spec.events || []) if (e.cam) shots.push(parseShot(e.cam, lineAt(e.at)));
  shots.sort((a, b) => a.t - b.t);
  function parseShot(str, t) {
    if (typeof str === 'object') return { ...str, t, move: str.move || 0 };
    const [main, move] = String(str).split('~'), push = main.endsWith('+push');
    const [type, args] = main.replace('+push', '').split(':');
    return { t, type, args: args ? args.split(',') : [], move: move ? +move : 0, push };
  }
  const headOf = (k) => C[k].headW || C[k].rig.root.position.clone().add(V(0, (C[k].spec.kind === 'dog' ? 0.75 : 1.86) * C[k].scale, 0));
  const tanV = (fov) => Math.tan((fov * Math.PI) / 360), tanH = (fov) => tanV(fov) * (W / H);
  // Camera in front of a character (3/4 view): `vh` metres of height fill the frame, `look` sits at the frame centre.
  const camDir = (yaw, side) => { const f = fwd(yaw), r = V(f.z, 0, -f.x); return f.multiplyScalar(Math.cos(side)).addScaledVector(r, Math.sin(side)).normalize(); };
  function frontCam(c, look, vh, fov, side, up, yaw = c.rig.root.rotation.y) {
    const dist = vh / 2 / tanV(fov);
    return { p: unblock(look, look.clone().addScaledVector(camDir(yaw, side), dist).add(V(0, up, 0))), l: look, fov };
  }
  // Rough head position from the timeline alone (pure; used to choose camera sides before anything is posed).
  function approxHead(c, t) {
    const pl = placeAt(c, t), p = pl.pos.clone();
    if (c.spec.kind === 'dog') return p.addScaledVector(fwd(pl.yaw), 0.4).add(V(0, 0.72, 0));
    if (pl.sit > 0.5) { p.addScaledVector(fwd(pl.yaw), -0.52); p.y += pl.seatH + 1.28 * c.scale; } else p.y += 1.86 * c.scale;
    return p;
  }
  const segDist = (a, b, p) => { const ab = b.clone().sub(a), k = clamp(p.clone().sub(a).dot(ab) / ab.lengthSq()); return a.clone().addScaledVector(ab, k).distanceTo(p); };
  // Is any other cast member (head or chest) between the camera and the subject?
  function blocked(cam, look, skip, t) {
    for (const o of castList) {
      if (skip.includes(o.key)) continue;
      const h = approxHead(o, t), r = (o.spec.kind === 'dog' ? 0.3 : 0.46) * o.scale;
      const parts = o.spec.kind === 'dog' ? [[h, 0.32], [placeAt(o, t, true).pos.add(V(0, 0.5, 0)), 0.45]] : [[h, r], [h.clone().add(V(0, -0.75 * o.scale, 0)), r]];
      for (const [p, rr] of parts) if (segDist(cam, look, p) < rr) return true;
    }
    return false;
  }
  // Pick (once per shot, from the state shortly after the cut) the first camera side that no one blocks.
  // Screen-space judgement of a candidate camera (pure: positions come from the timeline at time t):
  // members must be in frame and not hide each other; nobody else may stand in the foreground.
  const tmpCam = new THREE.PerspectiveCamera(50, W / H, 0.05, 800);
  function shotQuality(cam, look, fov, members, t) {
    tmpCam.position.copy(cam); tmpCam.fov = fov; tmpCam.updateProjectionMatrix(); tmpCam.lookAt(look); tmpCam.updateMatrixWorld();
    const pts = Object.values(C).flatMap((o) => {
      const h = approxHead(o, t), mem = members.includes(o.key), dog = o.spec.kind === 'dog';
      const at = (q, rr, body) => { const d = q.distanceTo(cam); return { p: q.clone().project(tmpCam), d, r: (rr * o.scale) / d / tanV(fov), mem, body }; };
      const out = [at(h, dog ? 0.32 : 0.42, false)];
      if (!mem && !dog) out.push(at(h.clone().add(V(0, -0.8 * o.scale, 0)), 0.45, true));     // a bystander's body blocks too
      return out;
    });
    const mem = pts.filter((x) => x.mem && !x.body), near = Math.min(...mem.map((x) => x.d));
    let q = 0;
    for (const x of pts) {
      const ahead = x.p.z < 1;
      if (x.mem) { if (!(ahead && Math.abs(x.p.x) < 0.88 && Math.abs(x.p.y) < 0.92)) q -= 2; continue; }
      if (!ahead || x.d > near + 0.4 || Math.abs(x.p.x) > 1 + x.r * (H / W) || Math.abs(x.p.y) > 1 + x.r) continue;
      // a bystander in front: only a real problem when it covers someone in the shot
      const covers = mem.some((m) => Math.hypot((m.p.x - x.p.x) * (W / H), m.p.y - x.p.y) < (m.r * 1.6 + x.r));
      q -= covers ? 1.5 : 0.25;
    }
    for (const k of members) {                     // a pole, post or shelf straight across a face is a hard fail
      const h = approxHead(C[k], t), d = h.clone().sub(cam), len = d.length();
      ray.set(cam, d.multiplyScalar(1 / len)); ray.far = Math.max(0.1, len - 0.45 * C[k].scale);
      if (ray.intersectObjects(clutter, false).length) q -= 1.5;
    }
    for (let i = 0; i < mem.length; i++) for (let j = i + 1; j < mem.length; j++) {
      const a = mem[i], b = mem[j];
      if (Math.hypot((a.p.x - b.p.x) * (W / H), a.p.y - b.p.y) < (a.r + b.r) * 0.9) q -= 0.8;
    }
    return q;
  }
  // the moment a shot is judged by: ~1 s in (after turns that start with the line), before the next cut
  const settleT = (sh) => { const next = shots.find((x) => x.t > sh.t + 1e-3)?.t ?? DUR; return Math.min(sh.t + 1.0, sh.t + (next - sh.t) * 0.6); };
  function autoSide(sh, a, vh, fov, lookDy, up) {
    if (sh.side !== undefined) return sh.side;
    const t = settleT(sh), c = C[a], h = approxHead(c, t), look = h.clone().add(V(0, lookDy, 0)), yaw = placeAt(c, t).yaw, dist = vh / 2 / tanV(fov);
    let best = -1;
    for (const s of [0.3, -0.3, 0, 0.6, -0.6, 0.9, -0.9, 1.3, -1.3]) {
      const cam = look.clone().addScaledVector(camDir(yaw, s), dist).add(V(0, up, 0));
      const free = unblock(look, cam).distanceTo(look) / cam.distanceTo(look);           // 1 = no wall in the way
      const placed = unblock(look, cam);
      const score = 2 + shotQuality(placed, look, fov, [a], t) + Math.min(1, free / 0.85) + 0.8 * clearance(placed, look) + 1.2 * Math.cos(s);
      if (score > best + 1e-6) { best = score; sh.side = s; }
    }
    return sh.side;
  }
  // Keep the camera inside the set: if a wall (or any big set mesh) is between the subject and the camera, move in.
  const ray = new THREE.Raycaster();
  // 0..1: how far from the camera the first set object between it and the subject is (1 = clear view; tables,
  // chairs, shelves in the foreground score lower). Used once per shot to choose among camera candidates.
  function clearance(cam, look) {         // average over the centre and four points around the subject
    const fwdV = look.clone().sub(cam), len = fwdV.length(); fwdV.multiplyScalar(1 / len);
    const right = new THREE.Vector3().crossVectors(fwdV, UPV).normalize(), up = new THREE.Vector3().crossVectors(right, fwdV);
    const w = len * 0.22, h = len * 0.3;
    let sum = 0;
    for (const [a, b] of [[0, 0], [-w, h * 0.4], [w, h * 0.4], [-w, -h], [w, -h]]) {
      const target = look.clone().addScaledVector(right, a).addScaledVector(up, b), d = target.clone().sub(cam), l = d.length();
      ray.set(cam, d.multiplyScalar(1 / l)); ray.far = Math.max(0.1, l - 0.7);
      const hit = ray.intersectObjects(clutter, false)[0];
      sum += hit ? hit.distance / l : 1;
    }
    return sum / 5;
  }
  // camera-free zones (roads with traffic, water ...): set.noCam / spec.noCam = [{ x0, z0, x1, z1 }]
  const noCam = [...(set.noCam || []), ...(spec.noCam || [])];
  function outOfZones(target, cam) {
    for (const zn of noCam) {
      if (!(cam.x > zn.x0 && cam.x < zn.x1 && cam.z > zn.z0 && cam.z < zn.z1)) continue;
      // slide back toward the subject until the camera leaves the zone (slab exit along the line target -> cam)
      const d = cam.clone().sub(target); let k = 1;
      for (const [a, lo, hi] of [['x', zn.x0, zn.x1], ['z', zn.z0, zn.z1]]) {
        if (Math.abs(d[a]) < 1e-6) continue;
        const kk = ((d[a] > 0 ? lo : hi) - target[a]) / d[a];
        if (kk > 0 && kk < k) k = kk;
      }
      cam = target.clone().addScaledVector(d, Math.max(0.15, k - 0.04));
    }
    return cam;
  }
  function unblock(target, cam) {
    cam = outOfZones(target, cam);
    if (!blockers.length) return cam;
    const d = cam.clone().sub(target), len = d.length();
    ray.set(target, d.multiplyScalar(1 / len)); ray.far = len;
    const hit = ray.intersectObjects(blockers, false)[0];
    return hit ? target.clone().addScaledVector(ray.ray.direction, Math.max(0.6, hit.distance - 0.25)) : cam;
  }
  // camera points: [x, y, z] | Vector3 | cast key (head) | set point name | (t) => [x, y, z] or Vector3
  const camVec = (v, t) => {
    if (typeof v === 'function') v = v(t);
    if (Array.isArray(v)) return V(v[0], v[1], v[2]);
    if (typeof v === 'string') return C[v] ? headOf(v) : ctx.resolve(v);
    return V(v.x, v.y, v.z);
  };
  const CAM_EASE = { linear: (k) => k, io: eio, in: ein, out: eout };
  function shotPose(sh, t) {
    if (set.shots?.[sh.type]) { const s = set.shots[sh.type]; return { p: s.pos.clone(), l: s.look.clone(), fov: s.fov || 50 }; }
    if (sh.pos && sh.look) {           // cam: { pos, look, fov, roll?, to?: { pos?, look?, fov?, roll? }, dur?, ease? } - see viral-format.md
      const p = camVec(sh.pos, t), l = camVec(sh.look, t);
      let fov = sh.fov || 50, roll = sh.roll || 0;
      if (sh.to) {                       // the camera keeps moving through the shot: push / pull / truck / crane / orbit / follow
        const k = (CAM_EASE[sh.ease] || CAM_EASE.linear)(range(t, sh.t, sh.dur ? sh.t + sh.dur : sh.tEnd ?? sh.t + 2));
        if (sh.to.pos) p.lerp(camVec(sh.to.pos, t), k);
        if (sh.to.look) l.lerp(camVec(sh.to.look, t), k);
        if (sh.to.fov) fov = lerp(fov, sh.to.fov, k);
        if (sh.to.roll !== undefined) roll = lerp(roll, sh.to.roll, k);
      }
      return { p, l, fov, roll };
    }
    const a = sh.args[0], c = C[a];
    const single = c && ['close', 'medium', 'full', 'follow'].includes(sh.type);
    if (single) {
      const s = c.scale, dog = c.spec.kind === 'dog', type = sh.type === 'follow' ? 'full' : sh.type;
      const [vh, dy, fov, up] = dog ? [{ close: 1.0, medium: 1.5, full: 2.2 }[type], 0, 42, 0.25]
        : { close: [1.75 * s + 0.25, 0, 38, 0.04], medium: [2.1 * s + 0.4, 0, 42, 0.16], full: [2.5 * s + 1.1, 0, 45, 0.55] }[type];
      const lookDy = dog ? -0.12 * vh : type === 'close' ? -0.16 * vh : type === 'medium' ? -0.22 * vh : -(0.74 * s + 0.1);
      const side = { left: -0.35, right: 0.35, front: 0 }[sh.args[1]] ?? autoSide(sh, a, vh, fov, lookDy, up);
      sh.yaw ??= placeAt(c, settleT(sh)).yaw;          // the camera keeps this direction for the whole shot (no swinging on turns)
      const h = headOf(a), look = h.clone().add(V(0, lookDy, 0)); look.y = Math.max(look.y, dog ? 0.45 : 0.6);
      return frontCam(c, look, vh, fov, side, up, type === 'full' && sh.type === 'follow' ? c.rig.root.rotation.y : sh.yaw);
    }
    if (sh.type === 'two' || sh.type === 'group') {
      // Chosen once per shot (at settleT): try 16 directions around the group. In a 9:16 frame people should stack in
      // depth rather than spread sideways, face the lens, and leave walls, furniture and bystanders out of the way.
      const ks = sh.args.filter((k) => C[k]), fov = 50, sMax = Math.max(...ks.map((k) => C[k].scale));
      const fit = (hs, dir) => {                       // distance that fits every head across and the tallest body down
        const right = V(dir.z, 0, -dir.x), us = hs.map((h) => h.dot(right)), span = Math.max(...us) - Math.min(...us);
        return Math.max((span + 1.05 * sMax) / 2 / tanH(fov), ((sh.seated ? 1.75 : 2.6) * sMax + 0.5) / 2 / tanV(fov), 2.2);
      };
      const frame = (hs, dir, dist) => {
        const mid = hs.reduce((m, h) => m.add(h), V(0, 0, 0)).multiplyScalar(1 / hs.length);
        const vh = 2 * dist * tanV(fov), look = V(mid.x, Math.max(0.7, mid.y - (sh.seated ? 0.12 : 0.22) * vh), mid.z);
        return { look, cam: look.clone().addScaledVector(dir, dist).add(V(0, (sh.seated ? 0.7 : 0.35) + 0.04 * dist, 0)) };
      };
      if (sh.dir === undefined) {
        const tt = settleT(sh), hs = ks.map((k) => approxHead(C[k], tt)), yaws = ks.map((k) => placeAt(C[k], tt).yaw);
        sh.seated = ks.every((k) => placeAt(C[k], tt).sit > 0.5);           // seated groups need less height in frame
        let best = -Infinity;
        for (let i = 0; i < 16; i++) {
          const th = (i / 16) * Math.PI * 2, dir = V(Math.sin(th), 0, Math.cos(th)), dist = fit(hs, dir);
          const { look, cam } = frame(hs, dir, dist), placed = unblock(look, cam), free = placed.distanceTo(look) / cam.distanceTo(look);
          const facing = yaws.reduce((m, y) => m + Math.max(-0.3, fwd(y).dot(dir)), 0) / yaws.length;
          const score = 2 + shotQuality(placed, look, fov, ks, tt) + 1.6 * facing + 1.2 * Math.min(1, free / 0.9) + 0.8 * clearance(placed, look) - 0.06 * dist;
          if (score > best) { best = score; sh.dir = dir; }
        }
      }
      const hs = ks.map(headOf), dist = fit(hs, sh.dir), { look, cam } = frame(hs, sh.dir, dist);
      return { p: unblock(look, cam), l: look, fov };
    }
    if (sh.type === 'ots') {
      const ha = headOf(sh.args[0]), hb = headOf(sh.args[1]), d = hb.clone().sub(ha); d.y = 0; d.normalize();
      const r = V(d.z, 0, -d.x), l = hb.clone().add(V(0, -0.35 * C[sh.args[1]].scale, 0));
      return { p: unblock(l, ha.clone().addScaledVector(d, -1.3).addScaledVector(r, -0.55).add(V(0, 0.12, 0))), l, fov: 42 };
    }
    const s = set.shots.wide; return { p: s.pos.clone(), l: s.look.clone(), fov: s.fov || 50 };
  }
  // One-take camera (viral style, or spec.camera = 'onetake'): every change of shot is a glide with a little crane arc
  // (no cuts), and inside a shot the camera keeps drifting in and orbiting slowly. A shot with via: 'flash' | 'zoom'
  // jumps instead (hidden by a white flash; 'zoom' also dives into the subject before and pulls out after).
  const ONE_TAKE = spec.camera === 'onetake' || (isViral(spec) && spec.camera !== 'cuts');
  const orbitAround = (p, c, a) => { const d = p.clone().sub(c); const x = d.x * Math.cos(a) + d.z * Math.sin(a), z = -d.x * Math.sin(a) + d.z * Math.cos(a); return V(c.x + x, p.y, c.z + z); };
  const camShots = shots.map((sh, i) => {
    const next = shots[i + 1], tNext = next?.t ?? DUR;
    sh.tEnd = tNext;
    const move = i === 0 ? 0 : sh.via ? 0.001 : (sh.move || (ONE_TAKE ? clamp((tNext - sh.t) * 0.45, 0.6, 1.15) : 0.001));
    sh.blend = move;
    return {
      in: i === 0 ? undefined : [sh.t, sh.t + move], fov: 50, move,
      pos: (t) => {
        const q = shotPose(sh, t), k = range(t, sh.t, tNext);
        let p = q.p.clone();
        const push = sh.push ? 0.12 : ONE_TAKE ? (sh.drift ?? 0.06) : 0;
        if (push) p.lerp(q.l, k * push);
        if (ONE_TAKE && sh.orbit !== 0) p = orbitAround(p, q.l, (sh.orbit ?? 0.06) * (k - 0.5));
        if (next?.via === 'zoom') p.lerp(q.l, 0.8 * ein(range(t, next.t - 0.4, next.t)));
        if (sh.via === 'zoom') p.lerp(q.l, 0.65 * (1 - eout(range(t, sh.t, sh.t + 0.7))));
        return p.add(V(0.03 * Math.sin(t * 0.5), 0.02 * Math.sin(t * 0.7), 0));
      },
      look: (t) => shotPose(sh, t).l, fovAt: (t) => shotPose(sh, t).fov, rollAt: (t) => shotPose(sh, t).roll || 0,
    };
  });
  // camera shakes: events [{ at, shake: metres, shakeDur? }] (impacts, landings, punch-ins)
  const shakes = (spec.events || []).filter((e) => e.shake).map((e) => ({ t: lineAt(e.at), amp: e.shake, dur: e.shakeDur || 0.45 }));
  function camAt(t) {
    let p = camShots[0].pos(t), l = camShots[0].look(t), fov = camShots[0].fovAt(t), roll = camShots[0].rollAt(t);
    for (let i = 1; i < camShots.length; i++) {
      const s = camShots[i], w = eio(range(t, s.in[0], s.in[1]));
      if (w <= 0) continue;
      const pn = s.pos(t), lift = ONE_TAKE && w < 1 && s.move >= 0.6 ? Math.min(1.4, p.distanceTo(pn) * 0.12) * Math.sin(Math.PI * w) : 0;
      p = vlerp(p, pn, w); p.y += lift; l = vlerp(l, s.look(t), w); fov = lerp(fov, s.fovAt(t), w); roll = lerp(roll, s.rollAt(t), w);
    }
    for (const s of shakes) {
      const dt = t - s.t;
      if (dt < 0 || dt > s.dur) continue;
      const a = s.amp * (1 - dt / s.dur) ** 2;
      p = p.clone().add(V(a * Math.sin(dt * 71 + 1.3), a * Math.sin(dt * 83 + 0.4), a * Math.sin(dt * 67 + 2.1)));
      l = l.clone().add(V(1.6 * a * Math.sin(dt * 77 + 0.7), 1.6 * a * Math.sin(dt * 91 + 2.4), 0)); roll += 0.6 * a * Math.sin(dt * 59);
    }
    return { p, l, fov, roll };
  }

  // ---- the whole world at t
  const castList = Object.values(C);
  // set options over time: spec.setOpts (object or t => object) + spec.setAt [{ at: 'line:4+0.5', opts: { tv: 'cartoon', door: 1 }, dur? }]
  // (numbers blend over `dur` seconds, e.g. a door swinging open)
  const setAt = (spec.setAt || []).map((e) => ({ ...e, t: lineAt(e.at) })).sort((a, b) => a.t - b.t);
  function setOptsAt(t) {
    const o = { ...(typeof spec.setOpts === 'function' ? spec.setOpts(t, { lineAt }) : spec.setOpts || {}) };
    for (const e of setAt) {
      if (t < e.t) break;
      for (const [k, v] of Object.entries(e.opts)) o[k] = typeof v === 'number' && typeof o[k] === 'number' && e.dur ? lerp(o[k], v, sstep(range(t, e.t, e.t + e.dur))) : v;
    }
    return o;
  }
  function setScene(t) {
    ctx.t = t;
    set.update?.(t, setOptsAt(t));
    extra.update?.(t, { lineAt, cast: C, set });
    const base = new Map();
    for (const c of castList) {
      if (c.spec.kind === 'dog') {
        const pl = placeAt(c, t); c.rig.root.position.copy(pl.pos); c.rig.root.rotation.set(0, pl.yaw, 0); c.rig.root.updateMatrixWorld(true);
        c.headW = c.rig.head.getWorldPosition(new THREE.Vector3()); continue;
      }
      const Pp = poseHuman(c, t, 'base');
      c.rig.root.position.copy(Pp.pos); c.rig.root.rotation.set(0, Pp.yaw, 0);
      c.rig.hips.position.set(0, Pp.hipsY, Pp.hipsZ); c.rig.root.updateMatrixWorld(true);
      c.headW = c.rig.head.getWorldPosition(new THREE.Vector3());
      base.set(c, Pp);
    }
    applyCamera(camera, camAt(t));
    camera.updateMatrixWorld();
    for (const c of castList) {                         // never let a head fill the lens: hide anyone the camera is inside
      const body = c.spec.kind === 'dog' ? c.rig.root.position.clone().add(V(0, 0.45 * c.scale, 0))          // (hips, not the root: seated bodies sit behind it)
        : c.rig.hips.getWorldPosition(new THREE.Vector3()).add(V(0, 0.2 * c.scale, 0));
      const nh = spec.nearHide ?? 1;                    // < 1 allows closer close-ups (viral episodes use ~0.45)
      c.rig.setVisible(!(c.headW.distanceTo(camera.position) < 0.75 * c.scale * nh || body.distanceTo(camera.position) < (0.85 * c.scale + 0.15) * nh));
    }
    for (const c of castList) {
      if (c.spec.kind === 'dog') { const Pd = poseDog(c, t); applyDogPose(c.rig, Pd, t); c.headW = c.rig.head.getWorldPosition(new THREE.Vector3()); continue; }
      const Pp = poseHuman(c, t, 'full');
      applyHumanPose(c.rig, Pp);
      setWear(c.rig, wearAt(c, t));
      c.headW = c.rig.head.getWorldPosition(new THREE.Vector3());
    }
    for (const [name, pr] of Object.entries(P)) {
      let holder = null, both = false, left = false, tilt = 0;
      for (const c of castList) { const h = active(c.holds, t); if (h && h.prop === name) { holder = c; both = h.both; left = h.left; tilt = h.tilt || 0; } }
      if (holder) {
        const dog = holder.spec.kind === 'dog';
        const hand = dog ? holder.rig.headG.localToWorld(V(0, -0.15, 0.3))                     // in the dog's mouth
          : both ? holder.rig.handL.position.clone().add(holder.rig.handR.position).multiplyScalar(0.5) : (left ? holder.rig.handL : holder.rig.handR).position.clone();
        if (pr.own || !pr.home) pr.home ||= { p: pr.obj.position.clone(), q: pr.obj.quaternion.clone(), parent: pr.obj.parent };
        if (pr.obj.parent !== scene) scene.attach(pr.obj);
        pr.obj.position.copy(hand).add(V(0, dog ? 0 : 0.04 * holder.scale, 0)); pr.obj.rotation.set(tilt, holder.rig.root.rotation.y + (dog ? Math.PI / 2 : 0), 0, 'YXZ'); pr.obj.visible = true;
      } else if (pr.own || pr.rest) {                 // own props show only at `rest`; set props can be moved there too
        if (!pr.own) { pr.home ||= { p: pr.obj.position.clone(), q: pr.obj.quaternion.clone(), parent: pr.obj.parent }; if (pr.obj.parent !== scene) scene.attach(pr.obj); }
        const r = pr.rest && ctx.resolve(pr.rest);
        pr.obj.visible = !!r && !pr.hidden;
        if (r) { pr.obj.position.copy(r); pr.obj.rotation.set(0, 0, 0); }
      } else {
        if (pr.home) { pr.home.parent.attach(pr.obj); pr.obj.position.copy(pr.home.p); pr.obj.quaternion.copy(pr.home.q); }
        pr.obj.visible = !pr.hidden;                    // { hidden: true }: a set prop stays out of sight until someone holds it
      }
    }
    extra.late?.(t, { lineAt, cast: C, set, props: P });   // episode code that needs the final poses / prop positions
  }

  // ---- 2-D overlay: title, narration captions, speech bubbles, emotes, punch words
  const CAPS = spec.captions || (isViral(spec) ? 'punch' : 'line');
  const narr = lines.filter((l) => l.who === 'narrator').flatMap((l) => (CAPS === 'punch' ? punchChunks(l) : chunks(l, spec.chunkLen || 17)));
  // labels: [{ at, until | dur, to: castKey | point | spot | [x, y, z], text, dir: 'ul'|'ur'|'dl'|'dr'|'u'|'d'|'l'|'r', color }]
  const LDIR = { ul: [-1, -1], ur: [1, -1], dl: [-1, 1], dr: [1, 1], u: [0, -1.3], d: [0, 1.3], l: [-1.4, 0], r: [1.4, 0] };
  const labels = (spec.labels || []).map((b) => { const t0 = lineAt(b.at); return { ...b, t0, t1: b.until ? lineAt(b.until) : t0 + (b.dur ?? 2.6) }; });
  // cards: [{ at, until | dur, text, sub, y (0..1 of the height), color }] - big stat / punch cards in the upper half
  const cards = (spec.cards || []).map((b) => { const t0 = lineAt(b.at); return { ...b, t0, t1: b.until ? lineAt(b.until) : t0 + (b.dur ?? 2.4) }; });
  const flashes = shots.filter((sh) => sh.via === 'flash' || sh.via === 'zoom').map((sh) => sh.t);
  const wipes = shots.filter((sh) => sh.via === 'wipe').map((sh) => ({ t: sh.t, color: sh.wipeColor || '#ffd23f', dir: sh.wipeDir || 1 }));
  function labelAnchor(to, t) {
    if (typeof to === 'function') { const v = to(t); return Array.isArray(v) ? V(v[0], v[1], v[2]) : v; }
    if (C[to]) return (C[to].headW || C[to].rig.root.position).clone().add(V(0, 0.35 * C[to].scale, 0));
    return ctx.resolve(to);
  }
  function drawLabel(g, b, t) {
    const at = labelAnchor(b.to, t); if (!at) return;
    const p = project(at); if (!p.ok) return;
    const pop = eback(range(t, b.t0, b.t0 + 0.28)), fade = 1 - range(t, b.t1 - 0.2, b.t1);
    const [dx, dy] = LDIR[b.dir || 'ul'], col = b.color || '#ffd23f';
    g.save(); g.globalAlpha = fade;
    g.font = `900 ${b.size || 46}px ${spec.lang === 'en' ? PUNCH_FONT : FONT}`;
    const tw = g.measureText(b.text).width, bw = tw + 52, bh = (b.size || 46) + 38;
    let x = p.x + dx * 175, y = p.y + dy * 150;
    x = clamp(x, bw / 2 + 30, W - bw / 2 - 30); y = clamp(y, bh / 2 + 120, H - bh / 2 - 120);
    if (y + bh / 2 > H * 0.6 && y - bh / 2 < H * 0.8) y = H * 0.6 - bh / 2;      // keep clear of the caption band
    const k = 0.4 + 0.6 * pop;
    g.lineCap = 'round'; g.strokeStyle = '#1d1714'; g.lineWidth = 9;
    g.beginPath(); g.moveTo(p.x, p.y); g.lineTo(lerp(p.x, x, k), lerp(p.y, y, k)); g.stroke();
    g.strokeStyle = col; g.lineWidth = 4.5; g.stroke();
    g.fillStyle = col; g.beginPath(); g.arc(p.x, p.y, 11, 0, 7); g.fill(); g.lineWidth = 4; g.strokeStyle = '#1d1714'; g.stroke();
    g.translate(x, y); g.scale(k, k);
    g.fillStyle = '#ffffff'; g.strokeStyle = '#1d1714'; g.lineWidth = 7; g.beginPath(); g.roundRect(-bw / 2, -bh / 2, bw, bh, 22); g.fill(); g.stroke();
    g.fillStyle = col; g.fillRect(-bw / 2 + 14, -bh / 2 + 10, 10, bh - 20);
    g.fillStyle = '#1d1714'; g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillText(b.text, 6, 3);
    g.restore();
  }
  function drawCard(g, b, t) {
    const pop = eback(range(t, b.t0, b.t0 + 0.3)), fade = 1 - range(t, b.t1 - 0.2, b.t1);
    g.save(); g.globalAlpha = fade; g.translate(W / 2, H * (b.y ?? 0.3)); g.rotate(-0.03); g.scale(0.5 + 0.5 * pop, 0.5 + 0.5 * pop);
    g.textAlign = 'center'; g.textBaseline = 'middle'; g.lineJoin = 'round';
    g.font = `900 ${b.size || 132}px ${PUNCH_FONT}`;
    let tw = g.measureText(b.text).width; const sc = Math.min(1, 960 / tw); g.scale(sc, sc);
    g.lineWidth = 24; g.strokeStyle = '#141414'; g.strokeText(b.text, 0, 0); g.fillStyle = b.color || '#ffd23f'; g.fillText(b.text, 0, 0);
    if (b.sub) {
      g.font = `900 ${b.subSize || 52}px ${PUNCH_FONT}`; tw = g.measureText(b.sub).width;
      const ss = Math.min(1, 940 / sc / tw); g.save(); g.scale(ss, ss);
      g.lineWidth = 14; g.strokeText(b.sub, 0, (b.size || 132) * 0.78 / ss); g.fillStyle = '#ffffff'; g.fillText(b.sub, 0, (b.size || 132) * 0.78 / ss); g.restore();
    }
    g.restore();
  }
  const project = (v) => { const p = v.clone().project(camera); return { x: (p.x + 1) / 2 * W, y: (1 - p.y) / 2 * H, ok: p.z < 1 && Math.abs(p.x) < 1.1 && Math.abs(p.y) < 1.1 }; };
  function wrap(g, text, maxW) {          // balanced lines, breaking at the writer's spaces first (like captions)
    const toks = [];
    for (const part of text.split(/(\s+)/)) {
      if (!part) continue;
      if (/^\s+$/.test(part) || g.measureText(part).width <= maxW * 0.8) toks.push(part); else toks.push(...words(part));
    }
    const full = g.measureText(text).width, n = Math.max(1, Math.ceil(full / maxW)), target = full / n;
    const out = []; let cur = '';
    for (const w of toks) {
      if (cur.trim() && w.trim() && out.length < n - 1 && g.measureText(cur + w).width > target * 1.04) { out.push(cur.trim()); cur = w; } else cur += w;
    }
    if (cur.trim()) out.push(cur.trim());
    return out;
  }
  function bubble(g, l, t) {
    const c = C[l.who]; if (!c) return;
    const pop = eback(range(t, l.t0, l.t0 + 0.2)), fade = 1 - range(t, l.t1 - 0.12, l.t1);
    g.save(); g.font = `700 58px ${FONT}`;
    const ls = wrap(g, l.text, 600), lw = Math.max(...ls.map((s) => g.measureText(s).width)), bw = lw + 70, bh = ls.length * 74 + 46;
    const hc = project(c.headW), top = project(c.headW.clone().add(V(0, (c.spec.kind === 'dog' ? 0.3 : 0.48) * c.scale, 0))), rpx = Math.max(30, Math.abs(hc.y - top.y));
    // above the head when there is room, otherwise beside it (close-ups), centred near the top when off-screen
    let x = W / 2, y = 330, aim = null;
    if (hc.ok) {
      x = hc.x; y = top.y - 40 - bh / 2; aim = top;
      if (y - bh / 2 < 140) { const sd = hc.x < W / 2 ? 1 : -1; x = hc.x + sd * (rpx * 0.9 + bw / 2 + 20); y = hc.y - rpx * 0.9; aim = { x: hc.x + sd * rpx * 0.75, y: hc.y - rpx * 0.3 }; }
    }
    x = clamp(x, bw / 2 + 36, W - bw / 2 - 36); y = clamp(y, bh / 2 + 140, H * 0.7 - bh / 2);
    g.globalAlpha = fade; g.translate(x, y); g.scale(0.6 + 0.4 * pop, 0.6 + 0.4 * pop);
    g.fillStyle = '#ffffff'; g.strokeStyle = '#1d1714'; g.lineWidth = 7; g.lineJoin = 'round';
    const body = () => { g.beginPath(); g.roundRect(-bw / 2, -bh / 2, bw, bh, 42); };
    let tail = null;
    if (aim) {   // tail: a wedge from inside the bubble toward the head, drawn under the bubble's fill
      const dx = aim.x - x, dy = aim.y - y, dist = Math.hypot(dx, dy), ux = dx / dist, uy = dy / dist;
      const edge = Math.min(bw / 2 / Math.max(1e-3, Math.abs(ux)), bh / 2 / Math.max(1e-3, Math.abs(uy)));
      const reach = Math.min(dist - 10, edge + 75);
      if (reach > edge + 18) tail = () => { const b = edge - 24; g.beginPath(); g.moveTo(ux * b - uy * 24, uy * b + ux * 24); g.lineTo(ux * reach, uy * reach); g.lineTo(ux * b + uy * 24, uy * b - ux * 24); g.closePath(); };
    }
    if (tail) { tail(); g.stroke(); }
    body(); g.stroke();
    if (tail) { tail(); g.fill(); }
    body(); g.fill();
    g.fillStyle = '#1d1714'; g.textAlign = 'center'; g.textBaseline = 'middle';
    ls.forEach((s, i) => g.fillText(s, 0, -bh / 2 + 23 + 37 + i * 74));
    if (!hc.ok) { g.font = `700 34px ${FONT}`; g.fillStyle = '#e8453c'; g.fillText(spec.names?.[c.key] || c.spec.name, 0, -bh / 2 - 26); }
    g.restore();
  }
  function emote(g, c, kind, t) {
    if (kind === 'steam') {           // spicy: puffs shooting up from both sides of the head (screen space, any camera)
      const h0 = project(c.headW.clone()), ht = project(c.headW.clone().add(V(0, 0.3 * c.scale, 0))); if (!h0.ok || !ht.ok) return;
      const r = Math.max(20, Math.abs(h0.y - ht.y));
      for (const s of [-1, 1]) for (let i = 0; i < 3; i++) {
        const k = (t * 1.6 + i / 3 + (s > 0 ? 0.17 : 0)) % 1;
        g.save(); g.globalAlpha = 0.85 * Math.sin(Math.PI * k); g.fillStyle = '#ffffff'; g.strokeStyle = '#1d1714'; g.lineWidth = 3;
        g.beginPath(); g.arc(h0.x + s * r * (1.2 + 0.7 * k), h0.y - r * (0.5 + 1.7 * k), r * (0.13 + 0.22 * k), 0, 7); g.fill(); g.stroke(); g.restore();
      }
      return;
    }
    const h = project(c.headW.clone().add(V(0.32 * c.scale, 0.42 * c.scale, 0))); if (!h.ok) return;
    g.save(); g.translate(h.x, h.y); g.lineJoin = 'round';
    if (kind === '!' || kind === '?') { g.font = `900 120px ${FONT}`; g.textAlign = 'center'; g.lineWidth = 12; g.strokeStyle = '#1d1714'; g.strokeText(kind, 0, 0); g.fillStyle = kind === '!' ? '#ffd23f' : '#7fd8ff'; g.fillText(kind, 0, 0); }
    else if (kind === 'heart') { g.scale(1.3, 1.3); g.beginPath(); g.moveTo(0, 18); g.bezierCurveTo(-46, -10, -24, -46, 0, -24); g.bezierCurveTo(24, -46, 46, -10, 0, 18); g.fillStyle = '#ff5a7a'; g.fill(); g.lineWidth = 6; g.strokeStyle = '#1d1714'; g.stroke(); }
    else if (kind === 'sweat') { g.beginPath(); g.moveTo(0, -40); g.quadraticCurveTo(26, 0, 0, 18); g.quadraticCurveTo(-26, 0, 0, -40); g.fillStyle = '#7fd8ff'; g.fill(); g.lineWidth = 5; g.strokeStyle = '#1d1714'; g.stroke(); }
    else if (kind === 'zzz') { g.font = `900 64px ${FONT}`; g.lineWidth = 9; g.strokeStyle = '#1d1714'; g.fillStyle = '#ffffff'; for (let i = 0; i < 3; i++) { const k = ((t * 0.8 + i / 3) % 1); g.globalAlpha = Math.sin(Math.PI * k); g.strokeText('Z', 10 + 30 * k, -60 * k); g.fillText('Z', 10 + 30 * k, -60 * k); } }
    else if (kind === 'sparkle') { g.fillStyle = '#ffd23f'; g.strokeStyle = '#1d1714'; g.lineWidth = 5; for (const [dx, dy, r] of [[0, 0, 26], [44, -30, 14], [-36, -44, 12]]) { g.beginPath(); for (let i = 0; i < 8; i++) { const a = (i / 8) * Math.PI * 2, rr = i % 2 ? r * 0.35 : r; g.lineTo(dx + Math.cos(a) * rr, dy + Math.sin(a) * rr); } g.closePath(); g.fill(); g.stroke(); } }
    g.restore();
  }
  function overlay(g, t) {
    for (const ft of flashes) {        // white flash that hides a jump cut (via: 'flash' | 'zoom')
      const a = t < ft ? sstep(range(t, ft - 0.12, ft)) : 1 - sstep(range(t, ft, ft + 0.28));
      if (a > 0.001) { g.save(); g.globalAlpha = 0.92 * a; g.fillStyle = '#ffffff'; g.fillRect(0, 0, W, H); g.restore(); }
    }
    for (const w of wipes) {            // slanted colour band sweeping across the frame; the cut happens under it (via: 'wipe')
      const k = range(t, w.t - 0.24, w.t + 0.24);
      if (k <= 0 || k >= 1) continue;
      const L = 1.5 * W, s = 0.4 * W, e = 0.05 * W, x0 = -L - s + eio(k) * (W + L + s), X = (x) => (w.dir > 0 ? x : W - x);
      const band = (a, b, col) => { g.fillStyle = col; g.beginPath(); g.moveTo(X(a), H); g.lineTo(X(a + s), 0); g.lineTo(X(b + s), 0); g.lineTo(X(b), H); g.closePath(); g.fill(); };
      g.save(); band(x0, x0 + L, w.color); band(x0 + L, x0 + L + e, 'rgba(255,255,255,0.92)'); band(x0 - e, x0, 'rgba(255,255,255,0.92)'); g.restore();
    }
    for (const b of labels) if (t >= b.t0 && t < b.t1) drawLabel(g, b, t);
    for (const b of cards) if (t >= b.t0 && t < b.t1) drawCard(g, b, t);
    if (spec.title && t < 2.6 && !isViral(spec) && spec.titleCard !== false) {
      const a = sstep(range(t, 0.1, 0.4)) * (1 - sstep(range(t, 2.2, 2.6)));
      g.save(); g.globalAlpha = a; g.font = `700 64px ${FONT}`; g.textAlign = 'center'; g.textBaseline = 'middle';
      const tw = g.measureText(spec.title).width + 80;
      g.fillStyle = 'rgba(255,255,255,0.92)'; g.strokeStyle = '#1d1714'; g.lineWidth = 6; g.beginPath(); g.roundRect(W / 2 - tw / 2, 150, tw, 104, 52); g.fill(); g.stroke();
      g.fillStyle = '#1d1714'; g.fillText(spec.title, W / 2, 204); g.restore();
    }
    for (const c of castList) if (c.emote && c.headW && c.headW.distanceTo(camera.position) < 60) emote(g, c, c.emote, t);   // an emote outlasting its line must not show in the next place (places are 150 m apart)
    for (const l of lines) if (l.who !== 'narrator' && t >= l.t0 && t < l.t1) bubble(g, l, t);
    const ch = narr.find((x) => t >= x.t0 && t < x.t1);
    if (ch && CAPS === 'punch') {        // 1-3 words, big, centre-low, white (emphasis yellow), a quick pop per chunk
      const pop = eback(range(t, ch.t0, ch.t0 + 0.12));
      g.save(); g.translate(W / 2, H * (spec.captionY ?? 0.7)); g.scale(0.82 + 0.18 * pop, 0.82 + 0.18 * pop);
      g.font = `900 ${spec.captionSize || 104}px ${spec.lang === 'en' ? PUNCH_FONT : FONT}`; g.textAlign = 'center'; g.textBaseline = 'middle'; g.lineJoin = 'round';
      const tw = g.measureText(ch.text).width, cap = Math.min(980, W - 100) * (W > H ? 1.6 : 1); if (tw > cap) g.scale(cap / tw, cap / tw);
      g.lineWidth = 22; g.strokeStyle = '#141414'; g.strokeText(ch.text, 0, 0); g.fillStyle = ch.emph ? '#ffd23f' : '#ffffff'; g.fillText(ch.text, 0, 0);
      g.restore();
    } else if (ch) {
      const pop = eout(range(t, ch.t0, ch.t0 + 0.12));
      g.save(); g.translate(W / 2, H * (spec.subY ?? 0.8)); g.scale(0.9 + 0.1 * pop, 0.9 + 0.1 * pop);
      g.font = `700 ${spec.subSize || 76}px ${FONT}`; g.textAlign = 'center'; g.textBaseline = 'middle'; g.lineJoin = 'round';
      const tw = g.measureText(ch.text).width, cap = W > H ? W - 160 : 990; if (tw > cap) g.scale(cap / tw, cap / tw);
      g.lineWidth = spec.subStroke || 15; g.strokeStyle = '#141414'; g.strokeText(ch.text, 0, 0); g.fillStyle = '#ffffff'; g.fillText(ch.text, 0, 0);
      g.restore();
    }
    const booms = lines.filter((l) => l.boom).map((l) => [l.t0 + (l.boomAt || 0.15), l.t0 + 1.0, l.boom, 'boom']);
    if (booms.length) drawCaptions(g, t, booms, { W, H, boomY: 0.45 });
    if (spec.hud) spec.hud(g, t, { W, H, FONT, PUNCH_FONT, camera, project });   // episode HUD drawn over everything (title cards, mission tags)
  }

  // ---- sound hits: dialogue ticks, punch words, line sfx, events
  const hits = [];
  // a line's sfx: 'boing' | ['boing', offset, gainDb] | [['boing', 0.4], ['thud', 1.2, -3]]
  const sfxList = (x) => (typeof x === 'string' ? [[x]] : Array.isArray(x) && typeof x[0] === 'string' && x.slice(1).every((v) => typeof v === 'number') ? [x] : (x || []).map((v) => [].concat(v)));
  for (const l of lines) {
    if (l.who !== 'narrator') hits.push(C[l.who]?.spec.kind === 'dog' ? [l.t0, 'bark', -2] : [l.t0, 'tick', -8]);
    if (l.boom) hits.push([l.t0 + (l.boomAt ?? 0.15), 'pop', -4]);
    for (const [type, off = 0, gain = 0] of sfxList(l.sfx)) hits.push([l.t0 + off, type, gain]);
  }
  for (const c of castList) for (const e of c.emotes) if (e.kind === '!') hits.push([e.t0, 'pop', -6]);
  for (const e of spec.events || []) for (const [type, off = 0, gain = 0] of sfxList(e.sfx)) hits.push([lineAt(e.at) + off, type, gain]);
  for (const s of spec.sfx || []) hits.push([lineAt(s.at), s.type, s.gain || 0]);
  // footsteps on every stride of every walk
  for (const c of castList) for (const m of c.moves) {
    if (m.silent) continue;
    const tw0 = m.t0 + (m.from.sit ? 0.35 : 0), tw1 = m.t1 - (m.toSpot.sit ? 0.35 : 0), stride = (m.run ? 0.75 : 0.52) * c.scale * (c.spec.kind === 'dog' ? 0.6 : 1);
    let last = 0;
    for (let t = tw0; t <= tw1; t += 1 / 120) {
      const k = Math.floor((eio(range(t, tw0, tw1)) * m.len) / stride + 0.5);
      if (k > last) { last = k; hits.push([+t.toFixed(3), 'step', (c.spec.kind === 'dog' ? -9 : c.scale < 0.8 ? -4 : 0) + (m.run ? 3 : 0)]); }
    }
  }
  if (ONE_TAKE) for (const sh of shots.slice(1)) {
    if (sh.via === 'cut') hits.push([+sh.t.toFixed(3), 'swish', -10 + (spec.viaGain || 0)]);          // viaGain: quieter jumps between places (dB)
    else if (sh.via) hits.push([+(sh.t - 0.18).toFixed(3), 'whoosh', (sh.via === 'wipe' ? -6 : -4) + (spec.viaGain || 0)]);
    else if (sh.blend >= 0.6) hits.push([+sh.t.toFixed(3), 'swish', -12 + (spec.transitionGain || 0)]);
    else if (sh.move > 0.001) hits.push([+sh.t.toFixed(3), 'whoosh', -12 + (spec.transitionGain || 0)]);          // whip pan (cam.move < 0.6)
  }
  hits.sort((a, b) => a[0] - b[0]);
  // voices for scripts/voice.py (narrator default: male Thai; episodes may set spec.narrator = { edge: [voice, pitch, rate] })
  const voices = { narrator: spec.narrator || (spec.lang === 'en' ? { edge: ['en-US-AndrewNeural', '+0Hz', '+8%'], eleven: null } : { edge: ['th-TH-NiwatNeural', '+0Hz', '+5%'], eleven: null }) };
  for (const c of castList) voices[c.key] = c.spec.voice || null;
  for (const [k, v] of Object.entries(spec.voices || {})) voices[k] = { ...(voices[k] || {}), ...v };
  // music: 'curious' | 'tension' | 'upbeat' | [[kind, from, to], ...] (from/to: seconds or line refs) -> sfx.py
  const music = !spec.music ? (isViral(spec) ? [['curious', 0, DUR]] : null)
    : typeof spec.music === 'string' ? [[spec.music, 0, DUR]] : spec.music.map(([k, a, b]) => [k, +lineAt(a ?? 0).toFixed(3), +(b === undefined ? DUR : lineAt(b)).toFixed(3)]);

  window.__story = { camAt, shots, C, P, lines, placeAt, blockers, camera };   // debugging hook (camera / staging / overlap checks)
  // spec.post: depth of field (focus follows the camera's look point by default) and bloom - studio renders only
  const draw = spec.post ? (await import('./post.js')).makePost({ renderer: stage.renderer, scene, camera, W: stage.W, H: stage.H, ...spec.post,
    focusAt: (t) => { const c = camAt(t); return c.p.distanceTo(c.l); } }) : null;
  installRenderAPI({ stage, scene, camera, setScene, draw, fps: FPS, duration: DUR, hits, bed: spec.bed || set.bed || 'none',
    overlay: PXS === 1 ? overlay : (g, t) => { g.save(); g.setTransform(PXS, 0, 0, PXS, 0, 0); overlay(g, t); g.restore(); }, blurSamples: (t) => (shots.some((s) => (s.blend > 0.01 && t > s.t && t < s.t + s.blend) || (s.via === 'zoom' && Math.abs(t - s.t) < 0.45)) || shakes.some((s) => t > s.t && t < s.t + 0.25) ? 3 : 1),
    meta: { title: spec.title, set: spec.set, voice: !!voice, voices, intro: introOf(spec), outro: outroOf(spec), target: spec.duration || (isViral(spec) ? 0 : 30),
      style: spec.style || 'story', lang: spec.lang || 'th', music, lufs: spec.lufs ?? (isViral(spec) ? -14 : null),
      voiceModel: spec.voiceModel, voiceSpeed: spec.voiceSpeed, voiceTempo: spec.voiceTempo,
      lines: lines.map(({ who, text, t0, t1, beat, cam, gap }) => ({ who, name: spec.names?.[who] || C[who]?.spec.name || (spec.lang === 'en' ? 'Narrator' : 'ผู้บรรยาย'), text, t0: +t0.toFixed(3), t1: +t1.toFixed(3),
        ...(beat ? { beat } : {}), ...(gap != null ? { gap } : {}), ...(cam && typeof cam === 'object' && cam.via ? { via: cam.via } : {}) })),
      shots: shots.map((s) => ({ t: +s.t.toFixed(3), ...(s.via ? { via: s.via } : {}) })) } });   // retention.py: camera / place changes
}
