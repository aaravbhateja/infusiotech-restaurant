# BlinkRest marketing site

Next.js 16 (App Router) + Tailwind CSS 4. One responsive page built from the
Claude Design artboards `Main.dc.html` (desktop, 1024px and up) and
`Mobile.dc.html` (phones, below 768px). Widths in between use the desktop
design.

## Run it

```bash
cd apps/site
npm install
npm run dev            # http://localhost:3000
# or a production build
npm run build && npm start -- -p 3100
```

## Fill these in before launch

Everything is in `src/config/site.ts`. Replace the three bracketed values, or
set the matching environment variable and leave the file alone:

| Value | Environment variable |
|---|---|
| `[APP STORE LINK]` | `NEXT_PUBLIC_APP_STORE_URL` |
| `[PLAY STORE LINK]` | `NEXT_PUBLIC_PLAY_STORE_URL` |
| `[YOUR SUPPORT EMAIL]` | `NEXT_PUBLIC_SUPPORT_EMAIL` |

The same file also holds the Log in, Terms and Privacy addresses and the site
URL used for metadata.

## How it is put together

- `src/components/` has one file per section. Sections whose layout differs
  between the two designs render both versions and switch with `md:` classes.
- `src/app/globals.css` has the design tokens and all the 3D and animation CSS
  (hero scene, orbit rings, marquee, order demo, screen carousel).
- Scroll animations use CSS scroll-driven animations. For browsers without
  them, `layout.tsx` adds `no-sda` to `<html>` before first paint and
  `ScrollEffects.tsx` reveals elements with an IntersectionObserver. Visitors
  who prefer reduced motion see everything at once with no animation.
- Images and the brand film are in `public/` (copied from the design).
- Only `Roles`, `MobileMenu`, `BrandFilm` and `ScrollEffects` are client
  components.
