# ArtSCII — ASCII motion studio

Turn images into animated ASCII art with particle morphing, customizable styles, and PNG, animated GIF, WebP, and SVG export.

Built with React, TypeScript, and Canvas 2D. Image masks become characters that morph between shapes using a persistent particle pool.

## Run

```sh
npm install
npm run dev
```

Open the URL printed by Vite. `npm run build` checks TypeScript and creates the production site in `dist`; `npm run preview` serves that build.

## Studio

- Four original SVG silhouettes: runner, knight, portrait, rocket.
- Upload or drag a PNG, JPEG, GIF, WebP, or SVG (up to 10 MB) onto the preview. Animated GIF/WebP uploads are decoded frame by frame with their timing, compositing, transparency, and disposal. Self-contained animated SVGs support declarative SMIL and CSS animations. Images are processed locally. Transparent silhouettes and white backgrounds work best; this is not automatic subject segmentation.
- Edit the character set, character font, density, morph duration, wander, time steps per loop, palette, original image colors, and grain.
- Pause, replay, scatter, cycle shapes, interact with the pointer, or expand the preview.
- Save the current canvas as PNG, or use **Export animation** for GIF, animated WebP, or animated SVG. Choose output size and looping. The animation export uses the selected source and current style; interface labels, pointer interactions, and the preset shape cycle are not recorded.
- Reduced-motion preferences disable particle animation. Static shape selection and exports remain available.

## Reuse the component

Copy `src/components/AsciiMorph.tsx`, `src/lib`, and `src/gifenc.d.ts` to a React/Vite project, install `gifenc`, `gifuct-js`, and `dompurify`, and place your images in its public directory. Give the canvas a sized container and CSS width/height.

```tsx
import { AsciiMorph } from './components/AsciiMorph';

<div style={{ width: '100%', height: 560 }}>
  <AsciiMorph
    images={['/shapes/runner.svg', '/shapes/knight.svg']}
    activeIndex={0}
    characters="@#$%&*+=:-."
    fontFamily="'Courier New', monospace"
    density={9}
    morphDuration={1800}
    maxTimeSteps={64}
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

Change `activeIndex` to morph. `density` is grid spacing (smaller means more characters). `morphDuration` controls the time to settle in milliseconds. The optional ref exposes `scatter()`, `replay()`, `exportPng()`, and `exportAnimation(format, options)`, which returns a Blob. `images` can also contain GIF, animated WebP, and SVG URLs. A decoded `source` prop avoids re-decoding an uploaded file; `onSource` reports its metadata. Remote images require CORS; local assets and uploaded object URLs work directly.

`fontFamily` accepts a CSS font stack and defaults to `'Courier New', monospace`. The studio offers Courier New, System Mono, Arial, Georgia, and Times New Roman using locally available fonts and fallbacks. The selection applies to the preview and all exports; SVG keeps the font stack as text, so its appearance depends on fonts installed on the viewing device.

Interface fonts use Google Fonts with system fallbacks. No image or artwork is sent to a server. Built-in masks are original simplified silhouettes, not extracted artwork from the reference website.

`maxTimeSteps` sets the number of seeded random sampling opportunities over one full 2π loop (default 64; studio range 4–512). Each cell has its own phase and a sparse change budget based on elapsed seconds. More steps offer finer, more varied change times without multiplying the change rate. Characters switch discretely and hold for at least 800 ms; some cells stay unchanged for an entire loop. Optional `animationSeed` (default 23) reproduces the schedule. Preview and GIF/WebP/SVG exports share these settings. The entire pattern still repeats after one loop; time steps do not change its duration or the export frame rate. Exported motion is sampled at the output frame times, so extra internal steps do not create extra frames.

## Animated inputs and exports

1. Upload an animation, or click **Try an animated SVG** for a built-in example.
2. Set the characters, density, palette, source colors, and wander. Play/pause and replay control the source timeline. Source frames are sampled directly rather than morphed into each other.
3. Choose **Export animation**, select GIF, WebP, or SVG, then export. Progress and cancellation are available. Export runs independently of the preview's playback state.

GIF and WebP keep the original frame count and positive frame delays. Zero/unspecified delays use 100 ms. Preview and exports default to looping; export can also play once. GIF output rounds to centiseconds using cumulative time to avoid drift. WebP keeps millisecond timing. Some viewers impose their own minimum frame delay.

Animated SVGs may loop indefinitely, so **Animated SVG capture settings** chooses a sampling window (1–10 seconds, 10–30 fps; default 4 seconds at 15 fps). Use **Resample SVG** after changing it. Common geometry, transforms/motion, fill, opacity, and CSS animations are sampled in a script-disabled sandbox. Embedded JavaScript, event-triggered animation, external images/fonts/styles, and interactive SVGs are not executed/supported. Embed raster resources or reference local SVG IDs. SVG filters, complex nested viewports, and advanced animation features may differ between browsers.

- Input limits: 10 MB, 300 frames, 30 seconds, 16 megapixels, 8192 pixels per side. Frames are normalized to a 250 × 280 sampling buffer; ASCII coordinates remain 500 × 560. Blank frames inside a visible animation are preserved.
- GIF encoding runs in a worker. WebP uses native still-image encoding plus an animated RIFF container. No uploads or encoding service are used.
- SVG exports contain real text characters and discrete frame visibility animations. The textured background is an embedded PNG. This makes the file self-contained, but it may be larger than GIF/WebP; SVG output is limited to 40 MB, raster animation output to 64 MB.
- Static images can be exported as a 2–10-second character/wander animation. Source animation timing takes priority over those controls.
- Reduced-motion preferences pause automatic preview motion. Explicit animated export still generates all frames.

## Verification

Run `npm run build` for TypeScript and production bundling. With `npm run dev` running, open `/tests/animation.html` in a browser for deterministic integration checks of unequal frame timing, GIF/WebP export and re-import, animated SVG text/XML, SMIL/CSS input, partial-frame disposal, sanitization, cancellation, static input, and limits. The test page shows pass/fail results and downloadable sample animations. Tests are not included in the production bundle.
