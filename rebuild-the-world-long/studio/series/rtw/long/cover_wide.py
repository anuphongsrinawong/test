# /// script
# requires-python = ">=3.10"
# dependencies = ["pillow"]
# ///
"""cover_wide.py <frame.png> <out.jpg> --kicker "REBUILD THE WORLD · 01.01" --title "LINE ONE|LINE *TWO*" [--side left|right]

A 16:9 YouTube thumbnail (1280x720) for the long-form episodes: the clean frame, a dark gradient on the text side, a small
orange kicker and a two-line hook in heavy type (words in *stars* turn yellow), thick black outlines."""
import argparse
import re
from PIL import Image, ImageDraw, ImageFilter, ImageFont

FONTS = ['/root/.fonts/Prompt-800.ttf', '/root/.fonts/Prompt-700.ttf', 'C:/Windows/Fonts/ariblk.ttf', '/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf']


def font(size):
    for f in FONTS:
        try:
            return ImageFont.truetype(f, size)
        except OSError:
            continue
    return ImageFont.load_default()


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('frame'); ap.add_argument('out')
    ap.add_argument('--kicker', default='REBUILD THE WORLD')
    ap.add_argument('--title', required=True)
    ap.add_argument('--side', default='left')
    a = ap.parse_args()
    W, H = 1280, 720
    im = Image.open(a.frame).convert('RGB').resize((W, H), Image.LANCZOS)
    # a soft dark gradient behind the text
    grad = Image.new('L', (W, H), 0)
    g = ImageDraw.Draw(grad)
    for x in range(W):
        k = x / W if a.side == 'right' else 1 - x / W
        g.line([(x, 0), (x, H)], fill=int(190 * max(0, k - 0.35) / 0.65))
    im = Image.composite(Image.new('RGB', (W, H), (10, 14, 20)), im, grad.filter(ImageFilter.GaussianBlur(30)))
    d = ImageDraw.Draw(im)
    x0 = 56 if a.side == 'left' else W - 56
    anchor = 'la' if a.side == 'left' else 'ra'
    fk = font(40)
    d.text((x0, 70), a.kicker, font=fk, fill=(255, 138, 42), anchor=anchor, stroke_width=5, stroke_fill=(0, 0, 0))
    lines = a.title.split('|')
    size = 118
    maxw = W * 0.62
    while size > 50:
        f = font(size)
        if all(d.textlength(re.sub(r'\*', '', ln), font=f) <= maxw for ln in lines):
            break
        size -= 4
    f = font(size)
    y = H - 70 - len(lines) * size * 1.08
    for ln in lines:
        parts = re.split(r'(\*[^*]+\*)', ln)
        total = sum(d.textlength(p.strip('*'), font=f) for p in parts)
        x = x0 if a.side == 'left' else x0 - total
        for p in parts:
            if not p:
                continue
            col = (255, 210, 63) if p.startswith('*') else (255, 255, 255)
            t = p.strip('*')
            d.text((x, y), t, font=f, fill=col, stroke_width=max(6, size // 12), stroke_fill=(0, 0, 0))
            x += d.textlength(t, font=f)
        y += size * 1.08
    im.save(a.out, quality=92)
    print(a.out)


if __name__ == '__main__':
    main()
