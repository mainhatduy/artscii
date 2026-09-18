import { forwardRef, useEffect, useImperativeHandle, useRef } from 'react';

export type Palette = 'lagoon' | 'paper' | 'midnight' | 'rose';
export type AsciiMorphHandle = { exportPng: () => void; scatter: () => void; replay: () => void };
export type AsciiMorphProps = {
  images: string[];
  activeIndex?: number;
  characters?: string;
  density?: number;
  morphDuration?: number;
  colorMode?: 'source' | 'mono';
  palette?: Palette;
  playing?: boolean;
  motion?: number;
  grain?: boolean;
  onCount?: (count: number) => void;
  onError?: (message: string) => void;
  className?: string;
};
type Point = { x: number; y: number; color: string; brightness: number };
type Particle = Point & { tx: number; ty: number; seed: number; alpha: number; targetAlpha: number; char: number };
const themes = {
  lagoon: { bg: '#203c44', glow: '#779f9e', glow2: '#345e72', ink: '#effff8' },
  paper: { bg: '#f4f1e7', glow: '#fffdf6', glow2: '#e5e4d7', ink: '#455448' },
  midnight: { bg: '#171d29', glow: '#384565', glow2: '#222b40', ink: '#b9c9f4' },
  rose: { bg: '#583a47', glow: '#b58b86', glow2: '#765163', ink: '#ffe6cf' },
};

export async function sampleImage(src: string, gap: number): Promise<Point[]> {
  gap = Math.max(4, Math.min(30, Number.isFinite(gap) ? gap : 9));
  const img = new Image();
  img.crossOrigin = 'anonymous';
  img.src = src;
  await img.decode();
  const canvas = document.createElement('canvas');
  canvas.width = 500; canvas.height = 560;
  const ctx = canvas.getContext('2d', { willReadFrequently: true })!;
  const scale = Math.min(460 / img.naturalWidth, 520 / img.naturalHeight);
  const w = img.naturalWidth * scale, h = img.naturalHeight * scale;
  ctx.drawImage(img, (500 - w) / 2, (560 - h) / 2, w, h);
  const { data } = ctx.getImageData(0, 0, 500, 560);
  let hasTransparency = false;
  for (let y = Math.ceil((560 - h) / 2) + 1; y < (560 + h) / 2 - 1 && !hasTransparency; y += 3) {
    for (let x = Math.ceil((500 - w) / 2) + 1; x < (500 + w) / 2 - 1; x += 3) {
      if (data[(Math.floor(y) * 500 + Math.floor(x)) * 4 + 3] < 80) { hasTransparency = true; break; }
    }
  }
  const points: Point[] = [];
  for (let y = 0; y < 560; y += gap) {
    for (let x = 0; x < 500; x += gap * 0.68) {
      const i = (Math.floor(y) * 500 + Math.floor(x)) * 4;
      const r = data[i], g = data[i + 1], b = data[i + 2];
      // Preserve white silhouettes on transparency; remove white opaque backgrounds.
      if (data[i + 3] < 80 || (!hasTransparency && r > 245 && g > 245 && b > 245)) continue;
      points.push({ x, y, color: `rgb(${r},${g},${b})`, brightness: (r * .299 + g * .587 + b * .114) / 255 });
    }
  }
  if (!points.length) throw new Error('No visible shape found. Try a darker image or a transparent silhouette.');
  return points;
}

export const AsciiMorph = forwardRef<AsciiMorphHandle, AsciiMorphProps>(function AsciiMorph(props, ref) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const particles = useRef<Particle[]>([]);
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
    replay: scatter,
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
    let cancelled = false;
    sampleImage(src, props.density ?? 9).then(points => {
      if (cancelled) return;
      // Keep existing particles alive when a shape changes. Only their targets change.
      const pool = particles.current;
      points.forEach((point, i) => {
        if (pool[i]) Object.assign(pool[i], { tx: point.x, ty: point.y, color: point.color, brightness: point.brightness, targetAlpha: 1 });
        else pool.push({ ...point, x: reducedMotion.current ? point.x : 250 + (Math.random() - .5) * 800, y: reducedMotion.current ? point.y : Math.random() * 560, tx: point.x, ty: point.y, seed: Math.random() * 100, alpha: 0, targetAlpha: 1, char: Math.random() });
      });
      for (let i = points.length; i < pool.length; i++) pool[i].targetAlpha = 0;
      if (config.current.playing === false || reducedMotion.current) pool.forEach(p => { p.x = p.tx; p.y = p.ty; p.alpha = p.targetAlpha; });
      config.current.onCount?.(points.length);
      drawRef.current();
    }).catch(() => { if (!cancelled) config.current.onError?.('This image could not be converted. Use a visible PNG, JPG, WebP, or SVG shape.'); });
    return () => { cancelled = true; };
  }, [src, props.density]);

  useEffect(() => {
    const canvas = canvasRef.current!;
    const ctx = canvas.getContext('2d')!;
    const background = document.createElement('canvas');
    let backgroundKey = '';
    let frame = 0, last = 0, elapsed = 0;
    const pointer = { x: -999, y: -999 };
    function drawBackground(palette: Palette, grain: boolean) {
      const { width: w, height: h, dpr } = size.current;
      background.width = w * dpr; background.height = h * dpr;
      const bg = background.getContext('2d')!;
      bg.scale(dpr, dpr);
      const theme = themes[palette];
      bg.fillStyle = theme.bg; bg.fillRect(0, 0, w, h);
      const grad = bg.createRadialGradient(w * .52, h * .45, 0, w * .5, h * .5, w * .63);
      grad.addColorStop(0, theme.glow); grad.addColorStop(.62, theme.glow2); grad.addColorStop(1, theme.bg);
      bg.fillStyle = grad; bg.fillRect(0, 0, w, h);
      if (grain) {
        const noise = document.createElement('canvas'); noise.width = 180; noise.height = 180;
        const nc = noise.getContext('2d')!, data = nc.createImageData(180, 180);
        let seed = 23;
        for (let i = 0; i < data.data.length; i += 4) {
          seed = (seed * 16807) % 2147483647;
          const v = seed % 255;
          data.data[i] = data.data[i + 1] = data.data[i + 2] = v; data.data[i + 3] = 40;
        }
        nc.putImageData(data, 0, 0); bg.fillStyle = bg.createPattern(noise, 'repeat')!; bg.fillRect(0, 0, w, h);
      }
    }
    function render(dt = 0) {
      const p = config.current;
      const { width: w, height: h, dpr } = size.current;
      const palette = p.palette ?? 'lagoon';
      const key = `${w}-${h}-${dpr}-${palette}-${p.grain}`;
      if (backgroundKey !== key) { drawBackground(palette, p.grain ?? true); backgroundKey = key; }
      ctx.setTransform(1, 0, 0, 1, 0, 0); ctx.globalAlpha = 1;
      ctx.drawImage(background, 0, 0);
      const scale = Math.min(w / 650, h / 620);
      ctx.setTransform(dpr * scale, 0, 0, dpr * scale, dpr * (w / 2 - 250 * scale), dpr * (h / 2 - 280 * scale));
      const chars = Array.from(p.characters?.trim() || '@#$%&*+=:-.');
      ctx.font = `${(p.density ?? 9) * .94}px 'Courier New', monospace`;
      ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
      const easing = 1 - Math.exp(-dt / ((p.morphDuration ?? 1800) / 6));
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
        if (dist < 65 && dist > 0 && p.playing !== false && !reducedMotion.current) { x += dx / dist * (65 - dist) * .6; y += dy / dist * (65 - dist) * .6; }
        ctx.globalAlpha = particle.alpha * (.68 + (Math.sin(particle.seed) + 1) * .16);
        ctx.fillStyle = p.colorMode === 'source' ? particle.color : themes[palette].ink;
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
      const dt = Math.min(now - (last || now), 40); last = now;
      if (config.current.playing !== false && !reducedMotion.current && !document.hidden) { elapsed += dt; render(dt); }
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
  useEffect(() => { drawRef.current(); }, [props.palette, props.characters, props.colorMode, props.motion, props.grain, props.playing]);
  return <canvas className={props.className} ref={canvasRef} role="img" aria-label="Animated ASCII particle artwork. Move your pointer over the shape to disperse its characters." />;
});
