import { GIFEncoder, quantize, applyPalette } from 'gifenc';
let encoder = GIFEncoder();
self.onmessage = (event: MessageEvent) => {
  try {
    const { kind, pixels, width, height, delay, loop } = event.data;
    if (kind === 'frame') {
      const rgba = new Uint8ClampedArray(pixels);
      const palette = quantize(rgba, 256);
      encoder.writeFrame(applyPalette(rgba, palette), width, height, { palette, delay, repeat: loop ? 0 : -1 });
      if (encoder.bytesView().length > 64_000_000) throw new Error('GIF export is too large. Choose a smaller resolution.');
      self.postMessage({ kind: 'ready' });
    } else if (kind === 'finish') {
      encoder.finish(); const bytes = new Uint8Array(encoder.bytes());
      self.postMessage({ kind: 'done', bytes }, { transfer: [bytes.buffer] });
      encoder = GIFEncoder();
    }
  } catch (error) { self.postMessage({ kind: 'error', message: error instanceof Error ? error.message : 'GIF encoding failed.' }); }
};
