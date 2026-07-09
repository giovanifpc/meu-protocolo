"""Gera os icones do PWA (icons/) a partir do logo mestre (logo.png, fundo
transparente, ja nas cores da marca). Rodar de novo sempre que logo.png for
atualizado.
Rodar: python scripts/generate_icons.py
"""
from PIL import Image
import os

BG = (248, 249, 250, 255)  # --bg
ROOT = os.path.join(os.path.dirname(__file__), '..')
LOGO_PATH = os.path.join(ROOT, 'logo.png')
ICONS_DIR = os.path.join(ROOT, 'icons')


def on_bg(im, size, scale=1.0, bg=BG):
    canvas = Image.new('RGBA', (size, size), bg)
    inner = int(size * scale)
    resized = im.resize((inner, inner), Image.LANCZOS)
    offset = (size - inner) // 2
    canvas.paste(resized, (offset, offset), resized)
    return canvas


def main():
    src = Image.open(LOGO_PATH).convert('RGBA')
    os.makedirs(ICONS_DIR, exist_ok=True)

    on_bg(src, 192).save(os.path.join(ICONS_DIR, 'icon-192.png'))
    on_bg(src, 512).save(os.path.join(ICONS_DIR, 'icon-512.png'))
    on_bg(src, 512, scale=0.72).save(os.path.join(ICONS_DIR, 'icon-512-maskable.png'))
    on_bg(src, 180).save(os.path.join(ICONS_DIR, 'apple-touch-icon.png'))
    on_bg(src, 32).save(os.path.join(ICONS_DIR, 'favicon-32.png'))
    print('icones gerados em', ICONS_DIR)


if __name__ == '__main__':
    main()
