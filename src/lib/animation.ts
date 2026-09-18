export type Point = { x: number; y: number; color: string; brightness: number };
export type SourceFrame = { pixels: ImageData; delay: number };
export type AnimationSource = { frames: SourceFrame[]; duration: number; animated: boolean; format: string };
export const MAX_FRAMES = 300;
export const MAX_DURATION = 30_000;
export const SAMPLE_WIDTH = 250;
export const SAMPLE_HEIGHT = 280;
export const abortIfNeeded = (signal?: AbortSignal) => { signal?.throwIfAborted(); };
export const yieldTask = () => new Promise<void>(resolve => setTimeout(resolve, 0));

export function frameAtTime(delays: number[], time: number): number {
  const duration = delays.reduce((a, b) => a + b, 0);
  if (!duration) return 0;
  let t = ((time % duration) + duration) % duration;
  for (let i = 0; i < delays.length; i++) { if (t < delays[i]) return i; t -= delays[i]; }
  return 0;
}

export function samplePixels(pixels: ImageData, gap: number): Point[] {
  gap = Math.max(4, Math.min(30, Number.isFinite(gap) ? gap : 9));
  const { data, width, height } = pixels;
  const points: Point[] = [];
  for (let y = 0; y < 560; y += gap) for (let x = 0; x < 500; x += gap * .68) {
    const i = (Math.min(height - 1, Math.floor(y / 560 * height)) * width + Math.min(width - 1, Math.floor(x / 500 * width))) * 4;
    const r = data[i], g = data[i + 1], b = data[i + 2];
    if (data[i + 3] < 80) continue;
    points.push({ x, y, color: `rgb(${r},${g},${b})`, brightness: (r * .299 + g * .587 + b * .114) / 255 });
  }
  return points;
}

export function validateTimeline(frameCount: number, duration: number) {
  if (!frameCount) throw new Error('This animation has no decodable frames.');
  if (frameCount > MAX_FRAMES || duration > MAX_DURATION) throw new Error('Use an animation with at most 300 frames and a duration of 30 seconds or less.');
}

export function finishSource(frames: SourceFrame[], format: string): AnimationSource {
  const duration = frames.reduce((sum, f) => sum + f.delay, 0);
  validateTimeline(frames.length, duration);
  if (!frames.some(f => f.pixels.data.some((v, i) => i % 4 === 3 && v > 80))) throw new Error('No visible image found. Try a visible shape on a transparent or white background.');
  return { frames, duration, animated: frames.length > 1, format };
}

export function snapshot(source: CanvasImageSource, width: number, height: number): ImageData {
  const canvas = document.createElement('canvas'); canvas.width = SAMPLE_WIDTH; canvas.height = SAMPLE_HEIGHT;
  const ctx = canvas.getContext('2d', { willReadFrequently: true })!;
  const scale = Math.min(230 / width, 260 / height), w = width * scale, h = height * scale;
  const x0 = (250 - w) / 2, y0 = (280 - h) / 2;
  ctx.drawImage(source, x0, y0, w, h);
  const pixels = ctx.getImageData(0, 0, 250, 280);
  let transparent = false;
  for (let y = Math.ceil(y0) + 1; y < y0 + h - 1 && !transparent; y += 2) for (let x = Math.ceil(x0) + 1; x < x0 + w - 1; x += 2) {
    if (pixels.data[(y * 250 + x) * 4 + 3] < 80) { transparent = true; break; }
  }
  if (!transparent) for (let i = 0; i < pixels.data.length; i += 4) {
    if (pixels.data[i] > 245 && pixels.data[i + 1] > 245 && pixels.data[i + 2] > 245) pixels.data[i + 3] = 0;
  }
  return pixels;
}

export async function blobImage(blob: Blob): Promise<HTMLImageElement> {
  const url = URL.createObjectURL(blob);
  try { const img = new Image(); img.src = url; await img.decode(); return img; }
  finally { URL.revokeObjectURL(url); }
}

export function checkDimensions(width: number, height: number) {
  if (!width || !height || width * height > 16_000_000 || width > 8192 || height > 8192) throw new Error('Image dimensions are too large. Use an image under 16 megapixels and 8192 pixels per side.');
}
