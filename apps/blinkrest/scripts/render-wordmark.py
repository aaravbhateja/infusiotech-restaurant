# Renders the splash-screen "BlinkRest" wordmark to assets/images/wordmark{,@2x,@3x}.png.
# Usage (needs Pillow and node_modules installed): python3 scripts/render-wordmark.py

from pathlib import Path

from PIL import Image, ImageDraw, ImageFont

ROOT = Path(__file__).resolve().parent.parent
FONT = ROOT / "node_modules/@expo-google-fonts/bricolage-grotesque/800ExtraBold/BricolageGrotesque_800ExtraBold.ttf"
OUT = ROOT / "assets/images/wordmark"
TEXT = "BlinkRest"
SPLIT = 5  # "Blink" white, "Rest" orange
WHITE = (255, 255, 255, 255)
ORANGE = (255, 90, 54, 255)
SIZE_PT = 44
SPACING_PT = -1.0


def render(scale):
    font = ImageFont.truetype(str(FONT), SIZE_PT * scale)
    spacing = SPACING_PT * scale
    xs = [font.getlength(TEXT[:i]) + i * spacing for i in range(len(TEXT))]
    ascent, descent = font.getmetrics()
    width = xs[-1] + font.getlength(TEXT[-1])
    pad = 4 * scale
    img = Image.new("RGBA", (int(width + 2 * pad), int(ascent + descent + 2 * pad)), (0, 0, 0, 0))
    draw = ImageDraw.Draw(img)
    for i, ch in enumerate(TEXT):
        draw.text((pad + xs[i], pad), ch, font=font, fill=WHITE if i < SPLIT else ORANGE)
    # Trim to the actual ink so the image's box is exactly the word.
    box = img.getbbox()
    img = img.crop((box[0] - pad, box[1] - pad, box[2] + pad, box[3] + pad))
    return img


base = render(1)
w1, h1 = base.size
for scale, suffix in ((1, ""), (2, "@2x"), (3, "@3x")):
    img = render(scale).resize((w1 * scale, h1 * scale), Image.LANCZOS) if scale > 1 else base
    img.save(f"{OUT}{suffix}.png")
print(w1, h1)
