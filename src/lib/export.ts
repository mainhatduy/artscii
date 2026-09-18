import { abortIfNeeded, samplePixels, yieldTask, type AnimationSource } from './animation';
import { drawBackground, drawGlyphs, glyphs, type ArtStyle } from './render';
import { encodeAnimatedWebP } from './webp';
export type ExportFormat = 'gif' | 'webp' | 'svg';
export type ExportOptions = { width: number; height: number; duration: number; fps: number; loop: boolean; signal?: AbortSignal; onProgress?: (value: number) => void };
export const escapeXml = (value: string) => value.replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&apos;' })[c]!);
export function svgVisibility(index: number, delays: number[], loop: boolean) {
  const duration = delays.reduce((a, b) => a + b, 0);
  const start = delays.slice(0, index).reduce((a, b) => a + b, 0) / duration;
  const end = start + delays[index] / duration;
  const times = index === 0 ? [0] : [0, start];
  const values = index === 0 ? ['visible'] : ['hidden', 'visible'];
  if (index < delays.length - 1) { times.push(end); values.push('hidden'); }
  times.push(1); values.push(index === delays.length - 1 ? 'visible' : 'hidden');
  return `<animate attributeName="visibility" calcMode="discrete" values="${values.join(';')}" keyTimes="${times.map(n => n.toFixed(8)).join(';')}" dur="${duration / 1000}s" repeatCount="${loop ? 'indefinite' : '1'}" fill="freeze"/>`;
}
function canvasBlob(canvas: HTMLCanvasElement, type: string): Promise<Blob> {
  return new Promise((resolve, reject) => canvas.toBlob(blob => blob?.type === type ? resolve(blob) : reject(new Error(`${type === 'image/webp' ? 'WebP' : 'Image'} export is unavailable in this browser. Try GIF or SVG.`)), type, .94));
}
export function downloadBlob(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob), a = document.createElement('a'); a.href = url; a.download = filename; a.click(); setTimeout(() => URL.revokeObjectURL(url), 10_000);
}
export async function exportAnimation(source: AnimationSource, style: ArtStyle, format: ExportFormat, options: ExportOptions): Promise<Blob> {
  const { width, height, signal } = options;
  if (!Number.isFinite(width) || !Number.isFinite(height) || width < 1 || height < 1 || width > 1600 || height > 1600) throw new Error('Choose an export size between 1 and 1600 pixels.');
  const frames = source.animated ? source.frames : Array.from({ length: Math.ceil(options.duration / 1000 * options.fps) }, () => ({ ...source.frames[0], delay: options.duration / Math.ceil(options.duration / 1000 * options.fps) }));
  if (!frames.length || frames.length > 300) throw new Error('Exports support 1–300 frames.');
  const canvas = document.createElement('canvas'); canvas.width = width; canvas.height = height;
  const ctx = canvas.getContext('2d', { willReadFrequently: true })!;
  const background = document.createElement('canvas'); background.width = width; background.height = height;
  drawBackground(background.getContext('2d')!, width, height, style.palette, style.grain);
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
  const svg: string[] = [], webp: { bytes: Uint8Array; delay: number }[] = [];
  let time = 0, byteCount = 0;
  try {
    abortIfNeeded(signal);
    if (format === 'gif') worker = new Worker(new URL('./gif-worker.ts', import.meta.url), { type: 'module' });
    if (format === 'svg') svg.push(`<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}" role="img" aria-label="Animated ASCII artwork"><title>ArtSCII animation</title><image width="${width}" height="${height}" href="${background.toDataURL('image/png')}"/>`);
    const delays = frames.map(f => f.delay);
    for (let i = 0; i < frames.length; i++) {
      abortIfNeeded(signal);
      const f = frames[i], points = samplePixels(f.pixels, style.density);
      if (format === 'svg') {
        const scale = Math.min(width / 650, height / 620);
        const text = glyphs(points, style, time).map(p => `<text x="${p.x.toFixed(2)}" y="${p.y.toFixed(2)}" fill="${p.color}" opacity="${p.alpha.toFixed(2)}">${escapeXml(p.char)}</text>`).join('');
        const group = `<g visibility="${i === 0 ? 'visible' : 'hidden'}" transform="translate(${width / 2 - 250 * scale} ${height / 2 - 280 * scale}) scale(${scale})" font-family="Courier New,monospace" font-size="${style.density * .94}" text-anchor="middle" dominant-baseline="central">${svgVisibility(i, delays, options.loop)}${text}</g>`;
        byteCount += group.length; if (byteCount > 40_000_000) throw new Error('SVG is too detailed. Lower density or use GIF/WebP for a smaller file.');
        svg.push(group);
      } else {
        ctx.clearRect(0, 0, width, height); ctx.drawImage(background, 0, 0); drawGlyphs(ctx, points, style, time, width, height);
        // Quantize cumulative timing so GIF centisecond rounding does not accumulate drift.
        const gifDelay = Math.max(10, (Math.round((time + f.delay) / 10) - Math.round(time / 10)) * 10);
        if (format === 'gif') {
          const pixels = ctx.getImageData(0, 0, width, height).data.buffer;
          await workerRequest({ kind: 'frame', pixels, width, height, delay: gifDelay, loop: options.loop }, [pixels]);
        } else {
          const blob = await canvasBlob(canvas, 'image/webp');
          const bytes = new Uint8Array(await blob.arrayBuffer()); webp.push({ bytes, delay: Math.round(time + f.delay) - Math.round(time) });
          byteCount += bytes.length; if (byteCount > 64_000_000) throw new Error('Export is too large. Choose a smaller resolution.');
        }
      }
      time += f.delay; options.onProgress?.((i + 1) / frames.length); await yieldTask();
    }
    abortIfNeeded(signal);
    if (format === 'gif') { const bytes = await workerRequest({ kind: 'finish' }) as Uint8Array; return new Blob([new Uint8Array(bytes)], { type: 'image/gif' }); }
    if (format === 'webp') return new Blob([new Uint8Array(encodeAnimatedWebP(webp, width, height, options.loop))], { type: 'image/webp' });
    svg.push('</svg>'); return new Blob(svg, { type: 'image/svg+xml' });
  } finally { worker?.terminate(); }
}
