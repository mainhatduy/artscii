import { decompressFrame, parseGIF } from 'gifuct-js';
import { abortIfNeeded, blobImage, checkDimensions, finishSource, snapshot, validateTimeline, yieldTask, type AnimationSource, type SourceFrame } from './animation';
import { parseWebP } from './webp';
import { decodeSvg } from './svg-input';
export type LoadOptions = { signal?: AbortSignal; svgDuration?: number; svgFps?: number; onProgress?: (value: number) => void };
export async function loadMedia(blob: Blob, options: LoadOptions = {}): Promise<AnimationSource> {
  if (blob.size > 10 * 1024 * 1024) throw new Error('Choose a file smaller than 10 MB.');
  const bytes = new Uint8Array(await blob.arrayBuffer()); abortIfNeeded(options.signal);
  const header = new TextDecoder().decode(bytes.subarray(0, 200));
  if (header.startsWith('GIF87a') || header.startsWith('GIF89a')) return decodeGif(bytes, options);
  if (header.startsWith('RIFF') && header.slice(8, 12) === 'WEBP') {
    const webp = parseWebP(bytes);
    if (webp) {
      checkDimensions(webp.width, webp.height);
      validateTimeline(webp.frames.length, webp.frames.reduce((s, f) => s + f.delay, 0));
      const canvas = document.createElement('canvas'); canvas.width = webp.width; canvas.height = webp.height;
      const ctx = canvas.getContext('2d')!; ctx.fillStyle = webp.background; ctx.fillRect(0, 0, canvas.width, canvas.height);
      const frames: SourceFrame[] = [];
      for (const frame of webp.frames) {
        abortIfNeeded(options.signal);
        if (frame.x + frame.width > canvas.width || frame.y + frame.height > canvas.height) throw new Error('WebP frame extends beyond its canvas.');
        const img = await blobImage(new Blob([new Uint8Array(frame.data)], { type: 'image/webp' }));
        if (!frame.blend) ctx.clearRect(frame.x, frame.y, frame.width, frame.height);
        ctx.drawImage(img, frame.x, frame.y);
        frames.push({ pixels: snapshot(canvas, canvas.width, canvas.height), delay: frame.delay });
        if (frame.dispose) { ctx.clearRect(frame.x, frame.y, frame.width, frame.height); ctx.fillStyle = webp.background; ctx.fillRect(frame.x, frame.y, frame.width, frame.height); }
        options.onProgress?.(frames.length / webp.frames.length); await yieldTask();
      }
      return finishSource(frames, 'WebP');
    }
  }
  if (blob.type === 'image/svg+xml' || /<svg[\s>]/i.test(header)) return decodeSvg(await blob.text(), options);
  const img = await blobImage(blob); checkDimensions(img.naturalWidth, img.naturalHeight); abortIfNeeded(options.signal);
  return finishSource([{ pixels: snapshot(img, img.naturalWidth, img.naturalHeight), delay: 100 }], blob.type.split('/')[1]?.toUpperCase() || 'Image');
}
async function decodeGif(bytes: Uint8Array, options: LoadOptions): Promise<AnimationSource> {
  const gif = parseGIF(bytes.buffer as ArrayBuffer);
  checkDimensions(gif.lsd.width, gif.lsd.height);
  const raw = gif.frames.filter(f => 'image' in f);
  validateTimeline(raw.length, raw.reduce((s, f) => s + (f.gce?.delay || 10) * 10, 0));
  const canvas = document.createElement('canvas'); canvas.width = gif.lsd.width; canvas.height = gif.lsd.height;
  const ctx = canvas.getContext('2d', { willReadFrequently: true })!;
  const background = gif.gct?.[gif.lsd.backgroundColorIndex] ?? [0, 0, 0];
  const hasTransparency = raw[0]?.gce?.extras.transparentColorGiven;
  if (!hasTransparency) { ctx.fillStyle = `rgb(${background.join(',')})`; ctx.fillRect(0, 0, canvas.width, canvas.height); }
  const frames: SourceFrame[] = [];
  for (const frame of raw) {
    abortIfNeeded(options.signal);
    const d = frame.image.descriptor;
    if (d.left + d.width > canvas.width || d.top + d.height > canvas.height) throw new Error('GIF frame extends beyond its canvas.');
    const f = decompressFrame(frame, gif.gct, true);
    const previous = f.disposalType === 3 ? ctx.getImageData(0, 0, canvas.width, canvas.height) : null;
    const patch = document.createElement('canvas'); patch.width = d.width; patch.height = d.height;
    patch.getContext('2d')!.putImageData(new ImageData(new Uint8ClampedArray(f.patch), d.width, d.height), 0, 0);
    ctx.drawImage(patch, d.left, d.top);
    frames.push({ pixels: snapshot(canvas, canvas.width, canvas.height), delay: f.delay || 100 });
    if (f.disposalType === 2) {
      ctx.clearRect(d.left, d.top, d.width, d.height);
      if (f.transparentIndex === undefined) { ctx.fillStyle = `rgb(${background.join(',')})`; ctx.fillRect(d.left, d.top, d.width, d.height); }
    } else if (previous) ctx.putImageData(previous, 0, 0);
    options.onProgress?.(frames.length / raw.length); await yieldTask();
  }
  return finishSource(frames, 'GIF');
}
