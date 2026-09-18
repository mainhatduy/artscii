// RIFF/ANMF layout follows the WebP container specification.
export const read24 = (b: Uint8Array, p: number) => b[p] | b[p + 1] << 8 | b[p + 2] << 16;
export const write24 = (b: Uint8Array, p: number, n: number) => { b[p] = n; b[p + 1] = n >>> 8; b[p + 2] = n >>> 16; };
const tag = (b: Uint8Array, p: number) => String.fromCharCode(...b.subarray(p, p + 4));
export function chunks(bytes: Uint8Array, start = 12, end = bytes.length): { type: string; data: Uint8Array }[] {
  const out = [];
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  for (let p = start; p < end;) {
    if (p + 8 > end) throw new Error('Invalid WebP chunk header.');
    const size = view.getUint32(p + 4, true);
    if (p + 8 + size > end) throw new Error('Invalid WebP chunk length.');
    out.push({ type: tag(bytes, p), data: bytes.slice(p + 8, p + 8 + size) });
    p += 8 + size + (size & 1);
  }
  return out;
}
export function chunk(type: string, data: Uint8Array): Uint8Array {
  const result = new Uint8Array(8 + data.length + (data.length & 1));
  result.set([...type].map(c => c.charCodeAt(0)));
  new DataView(result.buffer).setUint32(4, data.length, true); result.set(data, 8); return result;
}
export function concat(parts: Uint8Array[]): Uint8Array {
  const bytes = new Uint8Array(parts.reduce((sum, p) => sum + p.length, 0)); let offset = 0;
  for (const part of parts) { bytes.set(part, offset); offset += part.length; } return bytes;
}
export function riff(parts: Uint8Array[]): Uint8Array {
  const body = concat(parts), header = new Uint8Array(12);
  header.set([82, 73, 70, 70]); new DataView(header.buffer).setUint32(4, body.length + 4, true); header.set([87, 69, 66, 80], 8);
  return concat([header, body]);
}
export function vp8x(width: number, height: number, flags: number) {
  const x = new Uint8Array(10); x[0] = flags; write24(x, 4, width - 1); write24(x, 7, height - 1); return chunk('VP8X', x);
}
export type WebPFrame = { x: number; y: number; width: number; height: number; delay: number; dispose: boolean; blend: boolean; data: Uint8Array };
export function parseWebP(bytes: Uint8Array) {
  if (tag(bytes, 0) !== 'RIFF' || tag(bytes, 8) !== 'WEBP') throw new Error('Invalid WebP file.');
  const all = chunks(bytes), header = all.find(c => c.type === 'VP8X');
  if (!header || !(header.data[0] & 2)) return null;
  if (header.data.length < 10) throw new Error('Invalid animated WebP header.');
  const anim = all.find(c => c.type === 'ANIM');
  if (!anim || anim.data.length < 6) throw new Error('Invalid WebP animation header.');
  const frames = all.filter(c => c.type === 'ANMF').map(({ data }): WebPFrame => {
    if (data.length < 16) throw new Error('Invalid WebP animation frame.');
    const width = read24(data, 6) + 1, height = read24(data, 9) + 1;
    return { x: read24(data, 0) * 2, y: read24(data, 3) * 2, width, height, delay: read24(data, 12) || 100, dispose: !!(data[15] & 1), blend: !(data[15] & 2), data: riff([vp8x(width, height, 16), data.slice(16)]) };
  });
  return { width: read24(header.data, 4) + 1, height: read24(header.data, 7) + 1, background: `rgba(${anim.data[2]},${anim.data[1]},${anim.data[0]},${anim.data[3] / 255})`, frames };
}
export function encodeAnimatedWebP(frames: { bytes: Uint8Array; delay: number }[], width: number, height: number, loop: boolean, hasAlpha = false): Uint8Array {
  const anim = new Uint8Array(6); anim[4] = loop ? 0 : 1;
  const parts = [vp8x(width, height, hasAlpha ? 18 : 2), chunk('ANIM', anim)];
  for (const frame of frames) {
    const header = new Uint8Array(16); write24(header, 6, width - 1); write24(header, 9, height - 1); write24(header, 12, Math.round(frame.delay));
    header[15] = hasAlpha ? 0 : 2;
    const imageChunks = chunks(frame.bytes).filter(c => ['VP8 ', 'VP8L', 'ALPH'].includes(c.type));
    if (!imageChunks.some(c => c.type === 'VP8 ' || c.type === 'VP8L')) throw new Error('WebP encoding is unavailable in this browser. Choose GIF or SVG.');
    parts.push(chunk('ANMF', concat([header, ...imageChunks.map(c => chunk(c.type, c.data))])));
  }
  return riff(parts);
}

