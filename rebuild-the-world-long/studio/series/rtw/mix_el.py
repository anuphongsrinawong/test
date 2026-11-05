# /// script
# requires-python = ">=3.10"
# dependencies = ["numpy"]
# ///
"""Rebuild the World (rtw) final mix: ElevenLabs sounds instead of synthesized effects.

    uv run series/rtw/mix_el.py episodes/<slug> [--music-db -18] [--keep-synth pop,ding] [--lufs -14]

Reads the episode's out/hits.json (every render writes it) and builds out/final.mp4:
  - hits whose type is `el_<name>` play series/rtw/sfx/<name>.mp3 at that time and at the hit's gain (dB). Cue them in
    scene.js like any sound: sfx: [['el_vine_creak', 0, -4]]. `el_<name>@0.8` plays only the first 0.8 s.
  - `bed` entries whose kind is `el_<name>` tile that ElevenLabs loop over [t0, t1] at the catalog's "gain"
    (default -14 dB), ducked under the voice. Other (synthesized) beds and hits are dropped, except hit types listed
    in --keep-synth.
  - `music` segments use sfx.py's music tracks at --music-db (default -18).
  - the voice (voice.json files) on top, with the effects, beds and music ducked under the speech.
  - two-pass loudness to -14 LUFS with a -2.0 dBTP ceiling (the AAC encode adds about 1 dB), muxed with out/video.mp4.
Writes stems (voice / fx / beds / music) to out/ for the listen-check. Missing sounds are listed and the mix stops:
generate them first with series/rtw/sfx_el.py.
"""
import argparse
import importlib.util
import json
import pathlib
import subprocess
import sys
import wave

import numpy as np

sys.stdout.reconfigure(encoding='utf-8')
HERE = pathlib.Path(__file__).resolve().parent
_spec = importlib.util.spec_from_file_location('toon3d_sfx', '/root/.claude/skills/toon3d/scripts/sfx.py')
sx = importlib.util.module_from_spec(_spec)
_spec.loader.exec_module(sx)
SR = sx.SR
TP = -2.0


def load(f):
    raw = subprocess.run(['ffmpeg', '-v', 'error', '-i', str(f), '-f', 'f32le', '-ac', '1', '-ar', str(SR), '-'], capture_output=True, check=True).stdout
    return np.frombuffer(raw, dtype='<f4').astype(np.float64)


def fade(x, a=0.005, r=0.08):
    x = x.copy(); n = len(x)
    ai, ri = min(n, int(a * SR)), min(n, int(r * SR))
    if ai: x[:ai] *= np.linspace(0, 1, ai)
    if ri: x[-ri:] *= np.linspace(1, 0, ri)
    return x


def put(buf, x, t):
    i = int(round(t * SR))
    if i < 0:
        x, i = x[-i:], 0
    j = min(len(buf), i + len(x))
    if i < len(buf) and j > i:
        buf[i:j] += x[:j - i]


def wav_out(path, x, ch=1):
    data = (np.clip(x, -1, 1) * 32767).astype('<i2')
    with wave.open(str(path), 'wb') as wf:
        wf.setnchannels(ch); wf.setsampwidth(2); wf.setframerate(SR)
        wf.writeframes((np.repeat(data[:, None], 2, axis=1) if ch == 2 else data).tobytes())


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('episode')
    ap.add_argument('--music-db', type=float, default=-18.0)
    ap.add_argument('--keep-synth', default='')
    ap.add_argument('--lufs', type=float, default=-14.0)
    a = ap.parse_args()
    ep = pathlib.Path(a.episode); out = ep / 'out'
    hj = json.loads((out / 'hits.json').read_text(encoding='utf-8'))
    cat = json.loads((HERE / 'catalog.json').read_text(encoding='utf-8'))
    for p in sorted((HERE / 'catalog').glob('*.json')):          # the episodes' own sounds
        cat.update(json.loads(p.read_text(encoding='utf-8')))
    dur = sx.duration_of(out / 'video.mp4', hj.get('duration', 10))
    n = int(dur * SR) + 1
    keep = {k for k in a.keep_synth.split(',') if k}

    beds = hj.get('bed') or []
    beds = [[beds, 0, dur]] if isinstance(beds, str) else beds
    want = {h['type'].split('@')[0][3:] for h in hj.get('hits', []) if h['type'].startswith('el_')}
    want |= {b[0][3:] for b in beds if str(b[0]).startswith('el_')}
    missing = sorted(w for w in want if not (HERE / 'sfx' / f'{w}.mp3').exists())
    if missing:
        raise SystemExit('missing ElevenLabs sounds (python series/rtw/sfx_el.py gen ...): ' + ' '.join(missing))
    src = {w: load(HERE / 'sfx' / f'{w}.mp3') for w in want}

    # ---- effects: ElevenLabs hits (+ any kept synth types)
    fx, used, dropped = np.zeros(n), 0, 0
    for h in hj.get('hits', []):
        typ, t, g = h['type'], float(h['t']), float(h.get('gain', 0))
        if typ.startswith('el_'):
            name, _, cut = typ[3:].partition('@')
            x = src[name]
            if cut:
                x = fade(x[:int(float(cut) * SR)], 0.003, 0.06)
            put(fx, fade(x, 0.003, 0.03) * 10 ** (g / 20), t); used += 1
        elif typ in keep and typ in sx.PALETTE:
            put(fx, sx.PALETTE[typ][0]() * 10 ** ((sx.PALETTE[typ][1] + g) / 20), t); used += 1
        else:
            dropped += 1
    print(f'effects: {used} placed, {dropped} synthesized cues dropped')

    # ---- beds: ElevenLabs loops tiled over their span
    bd = np.zeros(n)
    for b in beds:
        kind, b0, b1 = str(b[0]), float(b[1]), min(float(b[2]), dur)
        if not kind.startswith('el_') or b1 <= b0:
            continue
        x = src[kind[3:]]
        need = int((b1 - b0) * SR)
        x = np.tile(x, need // len(x) + 1)[:need]
        put(bd, fade(x, 0.4 if b0 > 0.05 else 0.02, 0.6 if b1 < dur - 0.05 else 0.3) * 10 ** (float(cat.get(kind[3:], {}).get('gain', -14)) / 20), b0)

    # ---- music (sfx.py tracks)
    mus = np.zeros(n)
    for mk, m0, m1 in (hj.get('music') or []):
        m0, m1 = float(m0), min(float(m1), dur)
        if not mk or mk == 'none' or m1 <= m0:
            continue
        put(mus, sx.fade(sx.music_track(mk, m1 - m0), 0.05 if m0 <= 0.05 else 0.35, 1.2 if m1 >= dur - 0.05 else 0.45), m0)
    mus *= 10 ** (a.music_db / 20) / (float(np.max(np.abs(mus))) or 1)

    # ---- voice + ducking
    vo = np.zeros(n)
    vj = ep / 'voice.json'
    if vj.exists():
        for ln in json.loads(vj.read_text(encoding='utf-8')).get('lines', []):
            if ln.get('file'):
                put(vo, load(ep / ln['file']), float(ln['start']))
    vo *= 0.71 / (float(np.max(np.abs(vo))) or 1)
    w = int(0.25 * SR)
    # moving average (same result as np.convolve(..., ones(w)/w, mode='same'), O(n) so long-form episodes mix in seconds)
    on = (np.abs(vo) > 0.02).astype(np.float64)
    cs = np.concatenate([[0.0], np.cumsum(on)])
    lo = np.clip(np.arange(len(on)) - (w - 1) // 2, 0, len(on)); hi = np.clip(np.arange(len(on)) + w // 2 + 1, 0, len(on))
    duck = np.clip((cs[hi] - cs[lo]) / w * 3, 0, 1)
    fxd, bdd, mud = fx * 0.5 * (1 - 0.45 * duck), bd * (1 - 0.6 * duck), mus * (1 - 0.65 * duck)
    total = vo + fxd + bdd + mud
    pk = float(np.max(np.abs(total)))
    if pk > 0.95:
        total *= 0.95 / pk
    wav = out / 'mix_el.wav'
    wav_out(wav, total, 2)
    for name, x in (('stem_voice', vo), ('stem_fx', fxd), ('stem_beds', bdd), ('stem_music', mud)):
        wav_out(out / f'{name}.wav', x)
    Lm = sx.loudness(wav)
    af = []
    if Lm:
        af = ['-af', f"loudnorm=I={a.lufs}:TP={TP}:LRA=11:measured_I={Lm['input_i']}:measured_TP={Lm['input_tp']}:measured_LRA={Lm['input_lra']}:"
                     f"measured_thresh={Lm['input_thresh']}:offset={Lm['target_offset']}:linear=true", '-ar', '48000']
        print(f"loudness: {float(Lm['input_i']):.1f} LUFS -> {a.lufs} LUFS")
    final = out / 'final.mp4'
    subprocess.run(['ffmpeg', '-hide_banner', '-loglevel', 'error', '-y', '-i', str(out / 'video.mp4'), '-i', str(wav), '-map', '0:v:0', '-map', '1:a:0',
                    '-c:v', 'copy', *af, '-c:a', 'aac', '-b:a', '192k', '-shortest', '-movflags', '+faststart', str(final)], check=True)
    print(f'final: {final}  ({dur:.2f} s)')


if __name__ == '__main__':
    main()
