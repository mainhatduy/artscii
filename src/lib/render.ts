import type { Point } from './animation';
export type Palette = 'lagoon' | 'paper' | 'midnight' | 'rose';
export type ArtStyle = { characters: string; density: number; colorMode: 'source' | 'mono'; palette: Palette; motion: number; grain: boolean };
export const themes = {
  lagoon: { bg: '#203c44', glow: '#779f9e', glow2: '#345e72', ink: '#effff8' },
  paper: { bg: '#f4f1e7', glow: '#fffdf6', glow2: '#e5e4d7', ink: '#455448' },
  midnight: { bg: '#171d29', glow: '#384565', glow2: '#222b40', ink: '#b9c9f4' },
  rose: { bg: '#583a47', glow: '#b58b86', glow2: '#765163', ink: '#ffe6cf' },
};
export function drawBackground(ctx: CanvasRenderingContext2D, w: number, h: number, palette: Palette, grain: boolean) {
  const theme = themes[palette]; ctx.fillStyle = theme.bg; ctx.fillRect(0, 0, w, h);
  const grad = ctx.createRadialGradient(w * .52, h * .45, 0, w * .5, h * .5, w * .63);
  grad.addColorStop(0, theme.glow); grad.addColorStop(.62, theme.glow2); grad.addColorStop(1, theme.bg);
  ctx.fillStyle = grad; ctx.fillRect(0, 0, w, h);
  if (grain) {
    const noise = document.createElement('canvas'); noise.width = noise.height = 180;
    const nc = noise.getContext('2d')!, data = nc.createImageData(180, 180); let seed = 23;
    for (let i = 0; i < data.data.length; i += 4) { seed = (seed * 16807) % 2147483647; const v = seed % 255; data.data[i] = data.data[i + 1] = data.data[i + 2] = v; data.data[i + 3] = 40; }
    nc.putImageData(data, 0, 0); ctx.fillStyle = ctx.createPattern(noise, 'repeat')!; ctx.fillRect(0, 0, w, h);
  }
}
export function glyphs(points: Point[], style: ArtStyle, time: number) {
  const chars = Array.from(style.characters.trim() || '@#$%&*+=:-.');
  return points.map(p => {
    const seed = (Math.floor(p.x * 7) * 31 + Math.floor(p.y * 7) * 17) % 997;
    const phase = time * .0015 + seed;
    return { x: p.x + Math.sin(phase) * style.motion / 22, y: p.y + Math.cos(phase) * style.motion / 22, char: chars[Math.floor(seed + time / 240) % chars.length], alpha: .68 + (Math.sin(seed) + 1) * .16, color: style.colorMode === 'source' ? p.color : themes[style.palette].ink };
  });
}
export function drawGlyphs(ctx: CanvasRenderingContext2D, points: Point[], style: ArtStyle, time: number, w: number, h: number) {
  const scale = Math.min(w / 650, h / 620);
  ctx.save(); ctx.translate(w / 2 - 250 * scale, h / 2 - 280 * scale); ctx.scale(scale, scale);
  ctx.font = `${style.density * .94}px 'Courier New', monospace`; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
  for (const p of glyphs(points, style, time)) { ctx.globalAlpha = p.alpha; ctx.fillStyle = p.color; ctx.fillText(p.char, p.x, p.y); }
  ctx.restore();
}
