declare module 'gifenc' {
  export function GIFEncoder(): {
    writeFrame(data: Uint8Array, width: number, height: number, options: { palette: number[][]; delay: number; repeat: number; dispose?: number; transparent?: boolean; transparentIndex?: number }): void;
    finish(): void;
    bytes(): Uint8Array;
    bytesView(): Uint8Array;
  };
  export function quantize(data: Uint8ClampedArray | Uint8Array, colors: number, options?: { format?: string; clearAlpha?: boolean; clearAlphaColor?: number; clearAlphaThreshold?: number; oneBitAlpha?: boolean | number }): number[][];
  export function applyPalette(data: Uint8ClampedArray | Uint8Array, palette: number[][], format?: string): Uint8Array;
}

