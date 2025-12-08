# make_favicon.py
# Gera favicon.ico e favicon.png com o monograma "LA" no tema azul (#3b82f6)

from PIL import Image, ImageDraw, ImageFont
from pathlib import Path

# garante a pasta static
Path("static").mkdir(exist_ok=True)

# cria imagem base (64x64)
img = Image.new("RGBA", (64, 64), "#3b82f6")
d = ImageDraw.Draw(img)

# fonte (usa Arial Bold se disponível)
try:
    fnt = ImageFont.truetype("arialbd.ttf", 36)
except:
    fnt = ImageFont.load_default()

# escreve "LA" centralizado
text = "LA"
bbox = d.textbbox((0, 0), text, font=fnt)
w, h = bbox[2] - bbox[0], bbox[3] - bbox[1]
d.text(((64 - w) / 2, (64 - h) / 2 - 2), text, font=fnt, fill="white")

# salva versões
img.save("static/favicon.png", format="PNG")
img.save("static/favicon.ico", sizes=[(16, 16), (32, 32), (48, 48), (64, 64)])

print("✅ Favicons gerados em /static (favicon.png e favicon.ico)")
