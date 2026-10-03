#!/usr/bin/env python3
"""Contact sheet: put several screenshots side by side, each labelled, scaled so the sheet stays readable.
   sheet.py <out.png> <per-row-height-px> <img1> <img2> ...   (labels are the file names)"""
import sys
from PIL import Image, ImageDraw, ImageFont

out, height, files = sys.argv[1], int(sys.argv[2]), sys.argv[3:]
imgs = []
for f in files:
    im = Image.open(f).convert('RGB')
    scale = height / im.height
    imgs.append((f, im.resize((max(1, round(im.width * scale)), height), Image.LANCZOS)))
gap, label_h = 14, 26
width = sum(i.width for _, i in imgs) + gap * (len(imgs) + 1)
sheet = Image.new('RGB', (width, height + label_h + gap * 2), (70, 70, 78))
draw = ImageDraw.Draw(sheet)
try:
    font = ImageFont.truetype('/System/Library/Fonts/Helvetica.ttc', 16)
except Exception:
    font = ImageFont.load_default()
x = gap
for f, im in imgs:
    sheet.paste(im, (x, gap + label_h))
    name = f.split('/')[-1].replace('.png', '')
    draw.text((x, gap + 2), name, fill=(235, 235, 240), font=font)
    x += im.width + gap
sheet.save(out)
print(out, sheet.size)
