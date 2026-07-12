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


def square_master(im):
    """Recorta pro conteudo visivel e centraliza num canvas quadrado —
    logo.png não é um arquivo quadrado nem tem o desenho centralizado nele
    (sobra assimétrica de espaço transparente), então redimensionar direto
    pra ícone deixava o círculo torto/fora de centro."""
    bbox = im.getbbox()
    cropped = im.crop(bbox)
    w, h = cropped.size
    side = max(w, h)
    square = Image.new('RGBA', (side, side), (0, 0, 0, 0))
    square.paste(cropped, ((side - w) // 2, (side - h) // 2), cropped)
    return square


def on_bg(im, size, scale=1.0, bg=BG):
    canvas = Image.new('RGBA', (size, size), bg)
    inner = int(size * scale)
    resized = im.resize((inner, inner), Image.LANCZOS)
    offset = (size - inner) // 2
    canvas.paste(resized, (offset, offset), resized)
    return canvas


def main():
    src = square_master(Image.open(LOGO_PATH).convert('RGBA'))
    os.makedirs(ICONS_DIR, exist_ok=True)

    on_bg(src, 192).save(os.path.join(ICONS_DIR, 'icon-192.png'))
    on_bg(src, 512).save(os.path.join(ICONS_DIR, 'icon-512.png'))
    on_bg(src, 512, scale=0.72).save(os.path.join(ICONS_DIR, 'icon-512-maskable.png'))
    on_bg(src, 180).save(os.path.join(ICONS_DIR, 'apple-touch-icon.png'))
    on_bg(src, 32).save(os.path.join(ICONS_DIR, 'favicon-32.png'))
    print('icones gerados em', ICONS_DIR)


if __name__ == '__main__':
    main()
