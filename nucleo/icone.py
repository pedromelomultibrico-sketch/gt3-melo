# Gera o ícone do GT3 Melo em todas as densidades Android.
import math, os, sys
from PIL import Image, ImageDraw, ImageFont
destino = sys.argv[1]
S = 768
im = Image.new("RGBA", (S, S), (0, 0, 0, 0)); d = ImageDraw.Draw(im)
d.ellipse((24, 24, S-24, S-24), fill=(12, 12, 14, 255))
d.ellipse((24, 24, S-24, S-24), outline=(212, 175, 55, 255), width=34)
for i in range(60):
    a = math.radians(i*6); r1 = S/2-80; r2 = r1-(40 if i % 5 == 0 else 16)
    d.line((S/2+r1*math.sin(a), S/2-r1*math.cos(a), S/2+r2*math.sin(a), S/2-r2*math.cos(a)),
           fill=(212, 175, 55, 255) if i % 5 == 0 else (120, 120, 120, 255), width=10 if i % 5 == 0 else 4)
fonte = "/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf"
try:
    ft = ImageFont.truetype(fonte, 210); fs = ImageFont.truetype(fonte, 96)
except Exception:
    ft = fs = ImageFont.load_default()
d.text((S/2, S/2-40), "GT3", font=ft, fill=(245, 245, 245, 255), anchor="mm")
d.text((S/2, S/2+120), "MELO", font=fs, fill=(212, 175, 55, 255), anchor="mm")
os.makedirs(destino, exist_ok=True)
for n, s in dict(mdpi=48, hdpi=72, xhdpi=96, xxhdpi=144, xxxhdpi=192).items():
    im.resize((s, s), Image.LANCZOS).save(os.path.join(destino, f"icone-{n}.png"))
