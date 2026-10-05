# Renders the store/launcher icons from the BlinkRest logo geometry
# (src/components/Logo.tsx): assets/images/{icon,splash-icon,favicon,
# notification-icon,android-icon-foreground,android-icon-monochrome}.png.
#
# Usage (needs Pillow and a Chromium/Chrome binary):
#   pip install pillow
#   CHROME=/path/to/chrome python3 scripts/render-app-icons.py

import os
import subprocess
import tempfile
from pathlib import Path

from PIL import Image

ROOT = Path(__file__).resolve().parent.parent
OUT = ROOT / "assets/images"
CHROME = os.environ.get("CHROME") or next(
    iter(sorted(Path("/opt/pw-browsers").glob("chromium-*/chrome-linux/chrome"))), None
)
if not CHROME:
    raise SystemExit("Set CHROME to a Chrome/Chromium executable.")

ORANGE, YELLOW, WHITE = "#FF5A36", "#FFC93C", "#FFFFFF"
BOLT = "M27.5 4.5 13 27.5h10l-3.5 16L35 19.5H25z"
# Same inset the in-app "icon" logo variant uses.
INSET = "translate(24 24) scale(0.74) translate(-24 -24)"


def mark(ring, bolt, knock, transform=INSET):
    return (
        f'<g transform="{transform}">'
        f'<circle cx="24" cy="24" r="15" fill="none" stroke="{ring}" stroke-width="5.5"/>'
        f'<path d="{BOLT}" fill="{bolt}" stroke="{knock}" stroke-width="3.2" stroke-linejoin="round"/>'
        f"</g>"
    )


def silhouette(transform=INSET):
    """Single-colour mark; the gap around the bolt is cut out, not painted."""
    return (
        f'<defs><mask id="m"><rect x="-20" y="-20" width="90" height="90" fill="#fff"/>'
        f'<path d="{BOLT}" fill="#000" stroke="#000" stroke-width="3.2" stroke-linejoin="round"/></mask></defs>'
        f'<g transform="{transform}">'
        f'<circle cx="24" cy="24" r="15" fill="none" stroke="#fff" stroke-width="5.5" mask="url(#m)"/>'
        f'<path d="{BOLT}" fill="#fff"/></g>'
    )


def render(name, size, body, flatten=False):
    html = (
        '<html><body style="margin:0;background:transparent">'
        f'<svg width="{size}" height="{size}" viewBox="0 0 48 48" style="display:block">{body}</svg></body></html>'
    )
    with tempfile.TemporaryDirectory() as tmp:
        page, shot = Path(tmp, "p.html"), Path(tmp, "s.png")
        page.write_text(html)
        subprocess.run(
            [CHROME, "--headless", "--no-sandbox", "--disable-gpu", "--hide-scrollbars",
             "--default-background-color=00000000", f"--window-size={size},{size + 200}",
             f"--screenshot={shot}", f"file://{page}"],
            check=True, capture_output=True,
        )
        img = Image.open(shot).convert("RGBA").crop((0, 0, size, size))
    if flatten:  # the App Store rejects icons with transparency
        img = img.convert("RGB")
    img.save(OUT / name)
    print(f"{name}: {size}x{size}")


rounded_tile = f'<rect width="48" height="48" rx="11" fill="{ORANGE}"/>' + mark(WHITE, YELLOW, ORANGE)

render("icon.png", 1024, f'<rect width="48" height="48" fill="{ORANGE}"/>' + mark(WHITE, YELLOW, ORANGE), flatten=True)
render("android-icon-foreground.png", 512, mark(WHITE, YELLOW, ORANGE))
render("android-icon-monochrome.png", 432, silhouette())
render("notification-icon.png", 96, silhouette(transform=""))
render("splash-icon.png", 512, rounded_tile)
render("favicon.png", 64, rounded_tile)
