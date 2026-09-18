# ArtSCII — ASCII motion studio

Turn images into animated ASCII art with particle morphing, customizable styles, and PNG export.

Built with React, TypeScript, and Canvas 2D. Image masks become characters that morph between shapes using a persistent particle pool.

## Run

```sh
npm install
npm run dev
```

Open the URL printed by Vite. `npm run build` checks TypeScript and creates the production site in `dist`; `npm run preview` serves that build.

## Studio

- Four original SVG silhouettes: runner, knight, portrait, rocket.
- Upload or drag a PNG, JPEG, WebP, or SVG (up to 10 MB) onto the preview. Images are processed locally. Transparent silhouettes and white backgrounds work best; this is not automatic subject segmentation.
- Edit the character set, density, morph duration, wander, palette, original image colors, and grain.
- Pause, replay, scatter, cycle shapes, interact with the pointer, or expand the preview.
- Export the current canvas as PNG, including its background. Interface labels are not part of the export.
- Reduced-motion preferences disable particle animation. Static shape selection and exports remain available.

## Reuse the component

Copy `src/components/AsciiMorph.tsx` to a React project and place your images in its public directory. Give the canvas a sized container and CSS width/height.

```tsx
import { AsciiMorph } from './components/AsciiMorph';

<div style={{ width: '100%', height: 560 }}>
  <AsciiMorph
    images={['/shapes/runner.svg', '/shapes/knight.svg']}
    activeIndex={0}
    characters="@#$%&*+=:-."
    density={9}
    morphDuration={1800}
    colorMode="mono"
    palette="lagoon"
    playing
    grain
    className="ascii-canvas"
  />
</div>
```

```css
.ascii-canvas { display: block; width: 100%; height: 100%; }
```

Change `activeIndex` to morph. `density` is grid spacing (smaller means more characters). `morphDuration` controls the time to settle in milliseconds. The optional ref exposes `scatter()`, `replay()`, and `exportPng()`. Remote images require CORS; local assets and uploaded object URLs work directly.

Fonts use Google Fonts with system fallbacks. No image or artwork is sent to a server. Built-in masks are original simplified silhouettes, not extracted artwork from the reference website.
