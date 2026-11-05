# Wrapper around the toon3d srt.py: same timing, but long sentences are split into balanced chunks (no 1-word orphans).
import sys, re, math, importlib.util
spec = importlib.util.spec_from_file_location('srt', '/root/.claude/skills/toon3d/scripts/srt.py'); srt = importlib.util.module_from_spec(spec); spec.loader.exec_module(srt)
SMALL = {'a','an','the','of','to','in','on','at','and','or','but','for','with','from','by','his','he','is','it','its','as','that','than','your','you','can'}
def L(ws): return len(' '.join(w[0] for w in ws))
def split_bal(seg, mx):
    n = len(seg)
    if L(seg) <= mx: return [seg]
    best = None
    for k in range(2, n + 1):
        # DP: cost = max piece length + penalty for a piece ending in a small word
        INF = 1e9; dp = [[INF] * (n + 1) for _ in range(k + 1)]; bk = [[0] * (n + 1) for _ in range(k + 1)]; dp[0][0] = 0
        for j in range(1, k + 1):
            for e in range(1, n + 1):
                for s in range(j - 1, e):
                    if dp[j - 1][s] >= INF: continue
                    ln = L(seg[s:e])
                    if ln > mx: continue
                    pen = 8 if (e < n and re.sub(r'\W', '', seg[e - 1][0].lower()) in SMALL) else 0
                    c = max(dp[j - 1][s], ln + pen)
                    if c < dp[j][e]: dp[j][e] = c; bk[j][e] = s
        if dp[k][n] < INF:
            out, e = [], n
            for j in range(k, 0, -1): s = bk[j][e]; out.append(seg[s:e]); e = s
            return out[::-1]
    return [seg]
def cues_of(words, mx):
    segs, cur = [], []
    for w in words:
        cur.append(w)
        if re.search(r'[.?!]["\')]*$', w[0]) or (re.search(r'[,;:]$', w[0]) and len(cur) >= 3) or w[0].endswith('...'): segs.append(cur); cur = []
    if cur: segs.append(cur)
    return [p for s in segs for p in split_bal(s, mx)]
srt.cues_of = cues_of
srt.main()
