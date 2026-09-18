import { GIFEncoder, quantize, applyPalette } from 'gifenc';
let encoder = GIFEncoder();
self.onmessage = (event: MessageEvent) => {
  try {
    const { kind, pixels, width, height, delay, loop, transparent } = event.data;
    if (kind === 'frame') {
      const rgba = new Uint8ClampedArray(pixels);
      const isTransparent = Boolean(transparent);
      const palette = isTransparent
        ? quantize(rgba, 256, { format: 'rgba4444', oneBitAlpha: true })
        : quantize(rgba, 256);
      const index = isTransparent
        ? applyPalette(rgba, palette, 'rgba4444')
        : applyPalette(rgba, palette);
      const transparentIndex = isTransparent ? palette.findIndex(c => c[3] === 0) : -1;
      encoder.writeFrame(index, width, height, {
        palette,
        delay,
        repeat: loop ? 0 : -1,
        transparent: transparentIndex !== -1,
        transparentIndex: transparentIndex !== -1 ? transparentIndex : 0,
      });
      if (encoder.bytesView().length > 64_000_000) throw new Error('GIF export is too large. Choose a smaller resolution.');
      self.postMessage({ kind: 'ready' });
    } else if (kind === 'finish') {
      encoder.finish(); const bytes = new Uint8Array(encoder.bytes());
      self.postMessage({ kind: 'done', bytes }, { transfer: [bytes.buffer] });
      encoder = GIFEncoder();
    }
  } catch (error) { self.postMessage({ kind: 'error', message: error instanceof Error ? error.message : 'GIF encoding failed.' }); }
};

