import type { Point } from './animation';
import { DEFAULT_LOOP_DURATION, sampleGlyphLoop } from './loop-noise';

export type Palette = 'lagoon' | 'paper' | 'midnight' | 'rose' | 'amber' | 'emerald';
export type BgMode = 'theme' | 'color' | 'transparent';

export const DEFAULT_FONT_FAMILY = "'Courier New', monospace";
export const characterFonts = [
  { label: 'Courier New', family: DEFAULT_FONT_FAMILY },
  { label: 'System Mono', family: 'ui-monospace, SFMono-Regular, Menlo, Consolas, monospace' },
  { label: 'Arial', family: 'Arial, Helvetica, sans-serif' },
  { label: 'Georgia', family: 'Georgia, serif' },
  { label: 'Times New Roman', family: "'Times New Roman', Times, serif" },
];

export function glyphFont(density: number, fontFamily = DEFAULT_FONT_FAMILY) {
  return `${density * .94}px ${fontFamily}`;
}

export type ArtStyle = {
  characters: string;
  fontFamily?: string;
  density: number;
  colorMode: 'source' | 'mono';
  palette: Palette;
  bgMode?: BgMode;
  bgColor?: string;
  inkColor?: string;
  motion: number;
  grain: boolean;
  animationSeed?: number;
  maxTimeSteps?: number;
};

export const themes: Record<Palette, { bg: string; glow: string; glow2: string; ink: string }> = {
  lagoon: { bg: '#203c44', glow: '#779f9e', glow2: '#345e72', ink: '#effff8' },
  paper: { bg: '#f4f1e7', glow: '#fffdf6', glow2: '#e5e4d7', ink: '#455448' },
  midnight: { bg: '#171d29', glow: '#384565', glow2: '#222b40', ink: '#b9c9f4' },
  rose: { bg: '#583a47', glow: '#b58b86', glow2: '#765163', ink: '#ffe6cf' },
  amber: { bg: '#1c1511', glow: '#a36d41', glow2: '#4a2f20', ink: '#ffe6bf' },
  emerald: { bg: '#0b1b15', glow: '#2e8c68', glow2: '#184737', ink: '#b6ffda' },
};

export function parseHexColor(hex: string): { r: number; g: number; b: number } {
  let clean = hex.replace('#', '').trim();
  if (clean.length === 3) clean = clean.split('').map(c => c + c).join('');
  if (clean.length !== 6) return { r: 13, g: 17, b: 23 };
  const num = parseInt(clean, 16);
  return { r: (num >> 16) & 255, g: (num >> 8) & 255, b: num & 255 };
}

export function isLightColor(colorHex: string): boolean {
  const { r, g, b } = parseHexColor(colorHex);
  return 0.299 * r + 0.587 * g + 0.114 * b > 145;
}

export function getContrastingInk(bgColor: string): string {
  return isLightColor(bgColor) ? '#1f2923' : '#f0f5ef';
}

export function drawGrain(ctx: CanvasRenderingContext2D, w: number, h: number) {
  const noise = document.createElement('canvas');
  noise.width = noise.height = 180;
  const nc = noise.getContext('2d')!, data = nc.createImageData(180, 180);
  let seed = 23;
  for (let i = 0; i < data.data.length; i += 4) {
    seed = (seed * 16807) % 2147483647;
    const v = seed % 255;
    data.data[i] = data.data[i + 1] = data.data[i + 2] = v;
    data.data[i + 3] = 40;
  }
  nc.putImageData(data, 0, 0);
  ctx.fillStyle = ctx.createPattern(noise, 'repeat')!;
  ctx.fillRect(0, 0, w, h);
}

export function drawBackground(
  ctx: CanvasRenderingContext2D,
  w: number,
  h: number,
  palette: Palette,
  grain: boolean,
  bgMode: BgMode = 'theme',
  bgColor: string = '#0d1117'
) {
  if (bgMode === 'transparent') {
    ctx.clearRect(0, 0, w, h);
    return;
  }
  if (bgMode === 'color') {
    ctx.fillStyle = bgColor;
    ctx.fillRect(0, 0, w, h);
    if (grain) drawGrain(ctx, w, h);
    return;
  }
  const theme = themes[palette] ?? themes.lagoon;
  ctx.fillStyle = theme.bg;
  ctx.fillRect(0, 0, w, h);
  const grad = ctx.createRadialGradient(w * .52, h * .45, 0, w * .5, h * .5, w * .63);
  grad.addColorStop(0, theme.glow);
  grad.addColorStop(.62, theme.glow2);
  grad.addColorStop(1, theme.bg);
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, w, h);
  if (grain) drawGrain(ctx, w, h);
}

export function glyphs(points: Point[], style: ArtStyle, time: number, duration = DEFAULT_LOOP_DURATION) {
  const chars = Array.from(style.characters.trim() || '@#$%&*+=:-.');
  let defaultInk: string;
  if (style.inkColor) {
    defaultInk = style.inkColor;
  } else if (style.bgMode === 'color') {
    defaultInk = getContrastingInk(style.bgColor || '#0d1117');
  } else if (style.bgMode === 'transparent') {
    defaultInk = themes[style.palette]?.ink ?? '#effff8';
  } else {
    defaultInk = themes[style.palette]?.ink ?? '#effff8';
  }

  return points.map(p => {
    const state = sampleGlyphLoop(time, p.x, p.y, duration, style.animationSeed, style.maxTimeSteps);
    const charIndex = Math.min(chars.length - 1, Math.floor(state.character * chars.length));
    return {
      x: p.x + state.dx * style.motion / 22,
      y: p.y + state.dy * style.motion / 22,
      char: chars[charIndex],
      alpha: state.alpha,
      color: style.colorMode === 'source' ? p.color : defaultInk,
    };
  });
}

export function drawGlyphs(ctx: CanvasRenderingContext2D, points: Point[], style: ArtStyle, time: number, w: number, h: number, duration = DEFAULT_LOOP_DURATION) {
  const scale = Math.min(w / 650, h / 620);
  ctx.save();
  ctx.translate(w / 2 - 250 * scale, h / 2 - 280 * scale);
  ctx.scale(scale, scale);
  ctx.font = glyphFont(style.density, style.fontFamily);
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  for (const p of glyphs(points, style, time, duration)) {
    ctx.globalAlpha = p.alpha;
    ctx.fillStyle = p.color;
    ctx.fillText(p.char, p.x, p.y);
  }
  ctx.restore();
}
