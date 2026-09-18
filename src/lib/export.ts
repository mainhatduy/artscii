import { exportSvg } from './svg-export';
import { DEFAULT_LOOP_DURATION } from './loop-noise';
import { abortIfNeeded, samplePixels, yieldTask, type AnimationSource } from './animation';
import { drawBackground, drawGlyphs, type ArtStyle } from './render';
import { encodeAnimatedWebP } from './webp';
export type ExportFormat = 'gif' | 'webp' | 'svg';
export type ExportOptions = { width: number; height: number; duration: number; fps: number; loop: boolean; signal?: AbortSignal; onProgress?: (value: number) => void };
export { escapeXml } from './svg-export';
function canvasBlob(canvas: HTMLCanvasElement, type: string): Promise<Blob> {
  return new Promise((resolve, reject) => canvas.toBlob(blob => blob?.type === type ? resolve(blob) : reject(new Error(`${type === 'image/webp' ? 'WebP' : 'Image'} export is unavailable in this browser. Try GIF or SVG.`)), type, .94));
}
export function downloadBlob(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob), a = document.createElement('a'); a.href = url; a.download = filename; a.click(); setTimeout(() => URL.revokeObjectURL(url), 10_000);
}
export async function exportAnimation(source: AnimationSource, style: ArtStyle, format: ExportFormat, options: ExportOptions): Promise<Blob> {
  const { width, height, signal } = options;
  if (!Number.isFinite(width) || !Number.isFinite(height) || width < 1 || height < 1 || width > 1600 || height > 1600) throw new Error('Choose an export size between 1 and 1600 pixels.');
  if (!Number.isFinite(options.duration) || options.duration <= 0 || !Number.isFinite(options.fps) || options.fps <= 0) throw new Error('Choose a positive duration and frame rate.');
  if (!source.frames.length || source.frames.length > 300 || !Number.isFinite(source.duration) || source.duration <= 0) throw new Error('Choose a valid source with 1–300 frames.');
  if (format === 'svg') return exportSvg(source, style, options);
  const frames = source.animated ? source.frames : Array.from({ length: Math.ceil(options.duration / 1000 * options.fps) }, () => ({ ...source.frames[0], delay: options.duration / Math.ceil(options.duration / 1000 * options.fps) }));
  if (!frames.length || frames.length > 300) throw new Error('Exports support 1–300 frames.');
  const canvas = document.createElement('canvas'); canvas.width = width; canvas.height = height;
  const ctx = canvas.getContext('2d', { willReadFrequently: true })!;
  const background = document.createElement('canvas'); background.width = width; background.height = height;
  drawBackground(background.getContext('2d')!, width, height, style.palette, style.grain, style.bgMode ?? 'theme', style.bgColor ?? '#0d1117');
  let worker: Worker | undefined;
  const workerRequest = (message: unknown, transfer: Transferable[] = []) => new Promise<Uint8Array | void>((resolve, reject) => {
    const abort = () => { cleanup(); reject(new DOMException('Cancelled', 'AbortError')); };
    const cleanup = () => { signal?.removeEventListener('abort', abort); if (worker) { worker.onmessage = null; worker.onerror = null; } };
    if (signal?.aborted) { abort(); return; }
    signal?.addEventListener('abort', abort, { once: true });
    worker!.onerror = () => { cleanup(); reject(new Error('The GIF encoder could not start. Try SVG or WebP export.')); };
    worker!.onmessage = e => { cleanup(); e.data.kind === 'error' ? reject(new Error(e.data.message)) : resolve(e.data.bytes); };
    worker!.postMessage(message, transfer);
  });
  const webp: { bytes: Uint8Array; delay: number }[] = [];
  let time = 0, byteCount = 0;
  try {
    abortIfNeeded(signal);
    if (format === 'gif') worker = new Worker(new URL('./gif-worker.ts', import.meta.url), { type: 'module' });
    const delays = frames.map(f => f.delay);
    const duration = source.animated ? delays.reduce((sum, delay) => sum + delay, 0) : DEFAULT_LOOP_DURATION;
    for (let i = 0; i < frames.length; i++) {
      abortIfNeeded(signal);
      const f = frames[i], points = samplePixels(f.pixels, style.density);
      ctx.clearRect(0, 0, width, height);
      if (style.bgMode !== 'transparent') {
        ctx.drawImage(background, 0, 0);
      }
      drawGlyphs(ctx, points, style, time, width, height, duration);
      // Quantize cumulative timing so GIF centisecond rounding does not accumulate drift.
      const gifDelay = Math.max(10, (Math.round((time + f.delay) / 10) - Math.round(time / 10)) * 10);
      if (format === 'gif') {
        const pixels = ctx.getImageData(0, 0, width, height).data.buffer;
        await workerRequest({ kind: 'frame', pixels, width, height, delay: gifDelay, loop: options.loop, transparent: style.bgMode === 'transparent' }, [pixels]);
      } else {
        const blob = await canvasBlob(canvas, 'image/webp');
        const bytes = new Uint8Array(await blob.arrayBuffer()); webp.push({ bytes, delay: Math.round(time + f.delay) - Math.round(time) });
        byteCount += bytes.length; if (byteCount > 64_000_000) throw new Error('Export is too large. Choose a smaller resolution.');
      }
      time += f.delay; options.onProgress?.((i + 1) / frames.length); await yieldTask();
    }
    abortIfNeeded(signal);
    if (format === 'gif') { const bytes = await workerRequest({ kind: 'finish' }) as Uint8Array; return new Blob([new Uint8Array(bytes)], { type: 'image/gif' }); }
    if (format === 'webp') return new Blob([new Uint8Array(encodeAnimatedWebP(webp, width, height, options.loop, style.bgMode === 'transparent'))], { type: 'image/webp' });
    throw new Error('Unsupported export format.');
  } finally { worker?.terminate(); }
}
