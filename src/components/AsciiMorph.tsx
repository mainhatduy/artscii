import { forwardRef, useEffect, useImperativeHandle, useRef } from 'react';
import { frameAtTime, samplePixels, type AnimationSource, type Point } from '../lib/animation';
import { loadMedia } from '../lib/media';
import { drawBackground, drawGlyphs, getContrastingInk, themes, type ArtStyle, type BgMode, type Palette } from '../lib/render';
import { exportAnimation, type ExportFormat, type ExportOptions } from '../lib/export';

export type { Palette, BgMode };
export type AsciiMorphHandle = {
  exportPng: () => void; scatter: () => void; replay: () => void;
  exportAnimation: (format: ExportFormat, options: ExportOptions) => Promise<Blob>;
};
export type AsciiMorphProps = {
  images: string[];
  source?: AnimationSource;
  onSource?: (source: AnimationSource) => void;
  activeIndex?: number;
  characters?: string;
  density?: number;
  morphDuration?: number;
  colorMode?: 'source' | 'mono';
  palette?: Palette;
  bgMode?: BgMode;
  bgColor?: string;
  inkColor?: string;
  playing?: boolean;
  motion?: number;
  grain?: boolean;
  onCount?: (count: number) => void;
  onError?: (message: string) => void;
  className?: string;
};
type Particle = Point & { tx: number; ty: number; seed: number; alpha: number; targetAlpha: number; char: number };

export async function sampleImage(src: string, gap: number): Promise<Point[]> {
  const response = await fetch(src);
  if (!response.ok) throw new Error('Could not load image.');
  const source = await loadMedia(await response.blob());
  return samplePixels(source.frames[0].pixels, gap);
}

function artStyle(props: AsciiMorphProps): ArtStyle {
  return {
    characters: props.characters ?? '@#$%&*+=:-.',
    density: props.density ?? 9,
    palette: props.palette ?? 'lagoon',
    bgMode: props.bgMode ?? 'theme',
    bgColor: props.bgColor ?? '#0d1117',
    inkColor: props.inkColor,
    colorMode: props.colorMode ?? 'mono',
    motion: props.motion ?? 35,
    grain: props.grain ?? true,
  };
}

export const AsciiMorph = forwardRef<AsciiMorphHandle, AsciiMorphProps>(function AsciiMorph(props, ref) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const particles = useRef<Particle[]>([]);
  const sourceRef = useRef<AnimationSource | null>(null);
  const sourceTime = useRef(0);
  const frameCache = useRef<{ index: number; density: number; points: Point[] }>({ index: -1, density: 0, points: [] });
  const config = useRef(props);
  config.current = props;
  const reducedMotion = useRef(window.matchMedia('(prefers-reduced-motion: reduce)').matches);
  const size = useRef({ width: 800, height: 540, dpr: 1 });
  const drawRef = useRef<() => void>(() => {});
  const scatter = () => {
    if (reducedMotion.current) return;
    particles.current.forEach(p => { p.x = 250 + (Math.random() - .5) * 1000; p.y = 280 + (Math.random() - .5) * 700; });
    drawRef.current();
  };
  useImperativeHandle(ref, () => ({
    scatter,
    replay: () => { if (sourceRef.current?.animated) { sourceTime.current = 0; drawRef.current(); } else scatter(); },
    exportAnimation: async (format, options) => {
      if (!sourceRef.current) throw new Error('Wait for the image to finish loading.');
      return exportAnimation(sourceRef.current, artStyle(config.current), format, options);
    },
    exportPng: () => {
      canvasRef.current?.toBlob(blob => {
        if (!blob) { config.current.onError?.('Could not export the canvas. Please try again.'); return; }
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a'); a.href = url; a.download = 'artscii-art.png'; a.click();
        setTimeout(() => URL.revokeObjectURL(url), 1000);
      }, 'image/png');
    },
  }), []);

  const src = props.images[props.activeIndex ?? 0];
  useEffect(() => {
    const controller = new AbortController();
    sourceRef.current = null;
    const load = async () => {
      if (props.source) return props.source;
      const response = await fetch(src, { signal: controller.signal });
      if (!response.ok) throw new Error('Could not load this image.');
      return loadMedia(await response.blob(), { signal: controller.signal });
    };
    load().then(source => {
      if (controller.signal.aborted) return;
      sourceRef.current = source; sourceTime.current = 0; frameCache.current.index = -1;
      config.current.onSource?.(source);
      const points = samplePixels(source.frames[0].pixels, props.density ?? 9);
      const pool = particles.current;
      points.forEach((point, i) => {
        if (pool[i]) Object.assign(pool[i], { tx: point.x, ty: point.y, color: point.color, brightness: point.brightness, targetAlpha: 1 });
        else pool.push({ ...point, x: reducedMotion.current ? point.x : 250 + (Math.random() - .5) * 800, y: reducedMotion.current ? point.y : Math.random() * 560, tx: point.x, ty: point.y, seed: Math.random() * 100, alpha: 0, targetAlpha: 1, char: Math.random() });
      });
      for (let i = points.length; i < pool.length; i++) pool[i].targetAlpha = 0;
      if (config.current.playing === false || reducedMotion.current) pool.forEach(p => { p.x = p.tx; p.y = p.ty; p.alpha = p.targetAlpha; });
      config.current.onCount?.(points.length); drawRef.current();
    }).catch(error => { if (!controller.signal.aborted) config.current.onError?.(error instanceof Error ? error.message : 'This image could not be converted.'); });
    return () => { controller.abort(); };
  }, [src, props.source, props.density]);

  useEffect(() => {
    const canvas = canvasRef.current!;
    const ctx = canvas.getContext('2d')!;
    const background = document.createElement('canvas');
    let backgroundKey = '';
    let frame = 0, last = 0, elapsed = 0;
    const pointer = { x: -999, y: -999 };
    function render(dt = 0) {
      const p = config.current;
      const { width: w, height: h, dpr } = size.current;
      const palette = p.palette ?? 'lagoon';
      const bgMode = p.bgMode ?? 'theme';
      const bgColor = p.bgColor ?? '#0d1117';
      const key = `${w}-${h}-${dpr}-${palette}-${p.grain}-${bgMode}-${bgColor}`;
      if (backgroundKey !== key) {
        background.width = w * dpr;
        background.height = h * dpr;
        const bg = background.getContext('2d')!;
        bg.scale(dpr, dpr);
        drawBackground(bg, w, h, palette, p.grain ?? true, bgMode, bgColor);
        backgroundKey = key;
      }
      ctx.setTransform(1, 0, 0, 1, 0, 0);
      ctx.globalAlpha = 1;
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      if (bgMode !== 'transparent') {
        ctx.drawImage(background, 0, 0);
      }
      const source = sourceRef.current;
      if (source?.animated) {
        const index = frameAtTime(source.frames.map(f => f.delay), sourceTime.current);
        if (frameCache.current.index !== index || frameCache.current.density !== (p.density ?? 9)) {
          const points = samplePixels(source.frames[index].pixels, p.density ?? 9);
          frameCache.current = { index, density: p.density ?? 9, points };
          config.current.onCount?.(points.length);
        }
        ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
        drawGlyphs(ctx, frameCache.current.points, { ...artStyle(p), motion: reducedMotion.current ? 0 : p.motion ?? 35 }, sourceTime.current, w, h);
        return;
      }
      const scale = Math.min(w / 650, h / 620);
      ctx.setTransform(dpr * scale, 0, 0, dpr * scale, dpr * (w / 2 - 250 * scale), dpr * (h / 2 - 280 * scale));
      const chars = Array.from(p.characters?.trim() || '@#$%&*+=:-.');
      ctx.font = `${(p.density ?? 9) * .94}px 'Courier New', monospace`;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      const easing = 1 - Math.exp(-dt / ((p.morphDuration ?? 1800) / 6));
      let defaultInk = themes[palette]?.ink ?? '#effff8';
      if (p.inkColor) {
        defaultInk = p.inkColor;
      } else if (bgMode === 'color') {
        defaultInk = getContrastingInk(bgColor);
      }
      for (const particle of particles.current) {
        if (dt) {
          particle.x += (particle.tx - particle.x) * easing;
          particle.y += (particle.ty - particle.y) * easing;
          particle.alpha += (particle.targetAlpha - particle.alpha) * easing;
          if (Math.random() < dt * .00022) particle.char = Math.random();
        }
        if (particle.alpha < .005) continue;
        const wobble = reducedMotion.current ? 0 : (p.motion ?? 35) / 22;
        let x = particle.x + Math.sin(elapsed * .0016 + particle.seed) * wobble;
        let y = particle.y + Math.cos(elapsed * .0012 + particle.seed) * wobble;
        const dx = x - pointer.x, dy = y - pointer.y, dist = Math.hypot(dx, dy);
        if (dist < 65 && dist > 0 && p.playing !== false && !reducedMotion.current) {
          x += dx / dist * (65 - dist) * .6;
          y += dy / dist * (65 - dist) * .6;
        }
        ctx.globalAlpha = particle.alpha * (.68 + (Math.sin(particle.seed) + 1) * .16);
        ctx.fillStyle = p.colorMode === 'source' ? particle.color : defaultInk;
        ctx.fillText(chars[Math.min(chars.length - 1, Math.floor(particle.char * chars.length))], x, y);
      }
      ctx.globalAlpha = 1;
    }
    drawRef.current = () => render();
    const resize = new ResizeObserver(entries => {
      const { width, height } = entries[0].contentRect;
      size.current = { width, height, dpr: Math.min(window.devicePixelRatio || 1, 2) };
      canvas.width = width * size.current.dpr; canvas.height = height * size.current.dpr; render();
    });
    resize.observe(canvas);
    function tick(now: number) {
      const delta = now - (last || now); const dt = Math.min(delta, 40); last = now;
      if (config.current.playing !== false && !reducedMotion.current && !document.hidden) { elapsed += dt; sourceTime.current += delta; render(dt); }
      frame = requestAnimationFrame(tick);
    }
    function move(e: PointerEvent) {
      const r = canvas.getBoundingClientRect(), s = Math.min(r.width / 650, r.height / 620);
      pointer.x = (e.clientX - r.left - r.width / 2) / s + 250; pointer.y = (e.clientY - r.top - r.height / 2) / s + 280;
    }
    function leave() { pointer.x = pointer.y = -999; }
    canvas.addEventListener('pointermove', move); canvas.addEventListener('pointerleave', leave);
    frame = requestAnimationFrame(tick);
    return () => { cancelAnimationFrame(frame); resize.disconnect(); canvas.removeEventListener('pointermove', move); canvas.removeEventListener('pointerleave', leave); };
  }, []);
  useEffect(() => { drawRef.current(); }, [
    props.palette,
    props.bgMode,
    props.bgColor,
    props.inkColor,
    props.characters,
    props.colorMode,
    props.motion,
    props.grain,
    props.playing,
  ]);
  return <canvas className={props.className} ref={canvasRef} role="img" aria-label="Animated ASCII particle artwork. Move your pointer over the shape to disperse its characters." />;
});
