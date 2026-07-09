"""Gera os icones do PWA (fundo azul da marca + monograma 'MP' branco).
Rodar uma vez: python scripts/generate_icons.py
"""
from PIL import Image, ImageDraw, ImageFont
import os

PRIMARY = (45, 107, 228)  # --primary
OUT_DIR = os.path.join(os.path.dirname(__file__), '..', 'icons')
FONT_PATH = 'C:/Windows/Fonts/arialbd.ttf'

os.makedirs(OUT_DIR, exist_ok=True)


def make_icon(size, filename, corner_radius_ratio=0.22, maskable=False):
    img = Image.new('RGBA', (size, size), (0, 0, 0, 0))
    draw = ImageDraw.Draw(img)
    if maskable:
        # maskable icons devem preencher o quadrado inteiro (sem raio),
        # o SO aplica a mascara/recorte dele mesmo.
        draw.rectangle([0, 0, size, size], fill=PRIMARY)
        text_scale = 0.34
    else:
        radius = int(size * corner_radius_ratio)
        draw.rounded_rectangle([0, 0, size, size], radius=radius, fill=PRIMARY)
        text_scale = 0.42

    font_size = int(size * text_scale)
    font = ImageFont.truetype(FONT_PATH, font_size)
    text = 'MP'
    bbox = draw.textbbox((0, 0), text, font=font)
    tw, th = bbox[2] - bbox[0], bbox[3] - bbox[1]
    pos = ((size - tw) / 2 - bbox[0], (size - th) / 2 - bbox[1])
    draw.text(pos, text, font=font, fill=(255, 255, 255, 255))

    img.save(os.path.join(OUT_DIR, filename))
    print('gerado', filename)


make_icon(192, 'icon-192.png')
make_icon(512, 'icon-512.png')
make_icon(512, 'icon-512-maskable.png', maskable=True)
make_icon(180, 'apple-touch-icon.png')
make_icon(32, 'favicon-32.png', corner_radius_ratio=0.15)

print('OK')
