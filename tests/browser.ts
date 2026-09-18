import { GIFEncoder } from 'gifenc';
import { loadMedia } from '../src/lib/media';
import { frameAtTime, samplePixels } from '../src/lib/animation';
import { exportAnimation } from '../src/lib/export';
import { parseWebP, chunks, chunk, concat, riff, vp8x, write24 } from '../src/lib/webp';
import { sanitizeSvg } from '../src/lib/svg-input';
import { DEFAULT_MAX_TIME_STEPS, normalizeTimeSteps, sampleGlyphLoop, sinRandom } from '../src/lib/loop-noise';
import { glyphs } from '../src/lib/render';
const results = document.querySelector('#results')!;
let failures = 0, total = 0;
async function test(name: string, run: () => Promise<void> | void) {
  total++; const row = document.createElement('li'); row.textContent = `RUN ${name}`; results.append(row);
  try { await run(); row.textContent = `PASS ${name}`; } catch (e) { failures++; row.className = 'fail'; row.textContent = `FAIL ${name}: ${e instanceof Error ? e.stack : e}`; }
}
function assert(value: unknown, message: string): asserts value { if (!value) throw new Error(message); }
const palette = [[255, 0, 0], [0, 180, 0], [0, 0, 255], [0, 0, 0]];
function makeGif() {
  const gif = GIFEncoder();
  for (const [i, delay] of [100, 250, 150].entries()) {
    const pixels = new Uint8Array(16 * 16).fill(i);
    gif.writeFrame(pixels, 16, 16, { palette, delay, repeat: 0 });
  }
  gif.finish(); return new Blob([new Uint8Array(gif.bytes())], { type: 'image/gif' });
}
const style = { characters: '<>&"@', density: 16, colorMode: 'source' as const, palette: 'paper' as const, motion: 0, grain: false };
const options = { width: 240, height: 230, duration: 1000, fps: 10, loop: true };
await test('Seeded character noise repeats for arbitrary durations and random access', () => {
  for (const duration of [170, 500, 1375, 4000, 30000]) {
    for (let cell = 0; cell < 100; cell++) {
      const x = cell * 6.12, y = cell % 13 * 9;
      const time = duration * .37;
      const first = sampleGlyphLoop(time, x, y, duration, 42);
      sampleGlyphLoop(time * 2, x, y, duration, 99);
      assert(JSON.stringify(first) === JSON.stringify(sampleGlyphLoop(time, x, y, duration, 42)), 'Rendering order changed the result');
      for (const offset of [-2, 1, 17]) {
        const repeated = sampleGlyphLoop(time + offset * duration, x, y, duration, 42);
        for (const key of ['character', 'dx', 'dy', 'alpha'] as const) assert(Math.abs(first[key] - repeated[key]) < 1e-10, `${key} did not repeat`);
      }
      assert(first.character >= 0 && first.character <= 1, 'Noise outside character range');
      assert(first.character !== sampleGlyphLoop(time, x, y, duration, 43).character, 'Seed has no effect');
    }
  }
});
await test('Noise and wobble have continuous values and velocity across the loop seam', () => {
  for (const duration of [500, 1375, 4000, 30000]) {
    const epsilon = duration * 1e-6;
    for (let cell = 0; cell < 100; cell++) {
      const at = (t: number) => sampleGlyphLoop(t, cell * 6.12, cell % 13 * 9, duration);
      const before = at(duration - epsilon), seam = at(0), after = at(epsilon);
      assert(JSON.stringify(at(duration)) === JSON.stringify(seam), 'Endpoint mismatch');
      for (const key of ['dx', 'dy'] as const) {
        assert(Math.abs(before[key] - after[key]) < .0001, `${key} jumps at the seam`);
        assert(Math.abs((seam[key] - before[key]) - (after[key] - seam[key])) < 1e-8, `${key} velocity jumps at the seam`);
      }
      const noise = (t: number) => sinRandom(t, cell * 6.12, cell % 13 * 9, duration);
      assert(Math.abs(noise(duration - epsilon) - noise(epsilon)) < .0001, 'Sine noise jumps at the seam');
    }
  }
});
await test('Characters change discretely without a collective reset at the seam', () => {
  const points = Array.from({ length: 500 }, (_, i) => ({ x: i % 25 * 6.12, y: Math.floor(i / 25) * 9, color: '#fff', brightness: 1 }));
  const duration = 4000, frames = 60;
  const states = Array.from({ length: frames }, (_, i) => glyphs(points, { ...style, motion: 35 }, i * duration / frames, duration));
  const changes = states.map((state, i) => state.filter((p, j) => p.char !== states[(i + 1) % frames][j].char).length);
  const average = changes.reduce((a, b) => a + b, 0) / frames;
  assert(average > 0, 'Characters never change');
  assert(changes[frames - 1] < average * 1.5, 'Collective character reset at loop seam');
  assert(states.every(state => state.every(p => Array.from(style.characters).includes(p.char))), 'Invalid character');
  assert(states.every(state => state.every((p, j) => p.alpha === states[0][j].alpha)), 'Character changes crossfade');
  const reversed = glyphs([...points].reverse(), style, 1234, duration).reverse();
  assert(JSON.stringify(reversed) === JSON.stringify(glyphs(points, style, 1234, duration)), 'Cell identity depends on particle order');
  assert(sinRandom(0, 0, 0, duration) !== sinRandom(0, 6.12, 0, duration), 'Cells share the same phase');
});
await test('Character holds stay sparse, varied by cell, and slow even on short loops', () => {
  for (const duration of [500, 1375, 4000, 10000, 30000]) {
    let total = 0, still = 0, lively = 0;
    for (let cell = 0; cell < 1000; cell++) {
      const at = (t: number) => Math.floor(sampleGlyphLoop(t, cell % 40 * 6.12, Math.floor(cell / 40) * 9, duration).character * 10);
      let previous = at(0), changes = 0;
      const changeTimes: number[] = [];
      for (let t = 100; t < duration; t += 100) {
        const current = at(t);
        if (current !== previous) { changes++; changeTimes.push(t); }
        previous = current;
      }
      if (previous !== at(0)) { changes++; changeTimes.push(duration); }
      for (let i = 0; i < changeTimes.length; i++) {
        const next = i + 1 < changeTimes.length ? changeTimes[i + 1] : changeTimes[0] + duration;
        assert(next - changeTimes[i] >= 700, 'Rapid character flicker, including across the seam');
      }
      total += changes; still += Number(changes === 0); lively += Number(changes >= 3);
      assert(at(1234) === at(1234 + 10 * duration), 'Hold schedule does not repeat');
    }
    const rate = total / 1000 / (duration / 1000);
    if (duration < 1600) assert(total === 0, 'Short loop forces fast character changes');
    else assert(rate > .14 && rate < .27, `Character rhythm drifted from the original rate: ${rate}/s`);
    if (duration === 4000) {
      assert(still > 450 && still < 750, 'Too few quiet cells or too little activity');
      assert(lively > 0, 'No variation between slow and lively cells');
    }
  }
});
await test('Time steps add timing choices without multiplying the change rate or breaking holds', () => {
  const rates: number[] = [];
  const patterns: string[] = [];
  const timingChoices: number[] = [];
  for (const steps of [4, 64, 512]) {
    const duration = 10000, gaps = new Set<number>();
    let changes = 0;
    const pattern: number[] = [];
    for (let cell = 0; cell < 300; cell++) {
      const at = (t: number) => sampleGlyphLoop(t, cell % 30 * 6.12, Math.floor(cell / 30) * 9, duration, 23, steps).character;
      let previous = at(0);
      const times: number[] = [];
      for (let time = 20; time <= duration; time += 20) {
        const value = at(time);
        if (value !== previous) { times.push(time); changes++; }
        previous = value;
      }
      times.forEach((time, i) => {
        const gap = (times[i + 1] ?? times[0] + duration) - time;
        assert(gap >= 780, 'Increasing time steps caused rapid flicker at a boundary');
        gaps.add(gap);
      });
      assert(at(1371) === at(1371 + 3 * duration), 'Configured time-step schedule failed to loop');
      pattern.push(at(1371));
    }
    rates.push(changes / 300 / (duration / 1000));
    patterns.push(pattern.join(',')); timingChoices.push(gaps.size);
  }
  assert(Math.max(...rates) / Math.min(...rates) < 1.25, 'Sampling resolution multiplied the change rate');
  assert(new Set(patterns).size === 3, 'Time-step control does not affect the random schedule');
  assert(timingChoices[2] > timingChoices[0] * 3, 'Higher step count did not offer finer timing');
  assert(normalizeTimeSteps(NaN) === DEFAULT_MAX_TIME_STEPS && normalizeTimeSteps(Infinity) === DEFAULT_MAX_TIME_STEPS, 'Invalid sample count has no safe default');
  assert(normalizeTimeSteps(0) === 1 && normalizeTimeSteps(1000000) === 512 && normalizeTimeSteps(12.6) === 13, 'Sample count is unbounded or fractional');
});
const gifBlob = makeGif();
let source = await loadMedia(gifBlob);
function preview(blob: Blob, name: string) {
  const url = URL.createObjectURL(blob), img = document.createElement('img'), a = document.createElement('a'); img.src = url; img.alt = name;
  a.href = url; a.download = name; a.textContent = `Download ${name}`; document.querySelector('#previews')!.append(img, a);
}
await test('Frame clock respects unequal delays and loop boundaries', () => {
  const delays = [100, 250, 150];
  assert(frameAtTime(delays, 99) === 0 && frameAtTime(delays, 100) === 1 && frameAtTime(delays, 349) === 1 && frameAtTime(delays, 350) === 2 && frameAtTime(delays, 500) === 0, 'Incorrect frame boundaries');
});
await test('GIF input decodes every frame and original delays', () => {
  assert(source.animated && source.frames.length === 3 && source.duration === 500, 'Incorrect GIF timing');
  assert(source.frames.map(f => f.delay).join() === '100,250,150', 'Delays changed');
  assert(source.frames[0].pixels.data.toString() !== source.frames[1].pixels.data.toString(), 'Frames collapsed');
});
await test('GIF output round-trip preserves frame count, duration, and motion', async () => {
  const blob = await exportAnimation(source, style, 'gif', options);
  const decoded = await loadMedia(blob);
  assert(decoded.frames.length === 3 && decoded.duration === 500, 'GIF export is static or timing changed');
  assert(decoded.frames[0].pixels.data.toString() !== decoded.frames[1].pixels.data.toString(), 'ASCII GIF frames identical');
  preview(blob, 'test-ascii.gif');
});
await test('Animated WebP output and input round-trip', async () => {
  const blob = await exportAnimation(source, style, 'webp', options);
  const parsed = parseWebP(new Uint8Array(await blob.arrayBuffer()));
  assert(parsed?.frames.length === 3 && parsed.width === 240 && parsed.height === 230, 'Invalid WebP container');
  const decoded = await loadMedia(blob);
  assert(decoded.frames.length === 3 && decoded.duration === 500, 'WebP timing not preserved');
  assert(decoded.frames[0].pixels.data.toString() !== decoded.frames[1].pixels.data.toString(), 'WebP source frames collapsed');
  preview(blob, 'test-ascii.webp');
});
await test('Animated SVG export contains escaped vector text and exact timeline', async () => {
  const blob = await exportAnimation(source, style, 'svg', options);
  const text = await blob.text(); const doc = new DOMParser().parseFromString(text, 'image/svg+xml');
  assert(!doc.querySelector('parsererror'), 'Malformed XML with special characters');
  assert(doc.querySelectorAll('animate').length === 3 && doc.querySelectorAll('text').length > 10, 'Missing vector frames');
  assert(doc.querySelector('animate')?.getAttribute('dur') === '0.5s', 'SVG duration changed');
  preview(blob, 'test-ascii.svg');
});
await test('Export samples the shared loop at cumulative source delays, without duplicating the endpoint', async () => {
  for (const input of [source, { ...source, animated: false, frames: [source.frames[0]] }]) {
    const exportOptions = { ...options, duration: 4000 };
    const duration = input.animated ? input.duration : exportOptions.duration;
    const exportStyle = { ...style, motion: 35, animationSeed: 42, maxTimeSteps: 128 };
    const blob = await exportAnimation(input, exportStyle, 'svg', exportOptions);
    const doc = new DOMParser().parseFromString(await blob.text(), 'image/svg+xml');
    const groups = [...doc.querySelectorAll('g')];
    assert(groups.length === (input.animated ? 3 : 40), 'Extra endpoint or missing frames');
    let time = 0;
    groups.forEach((group, i) => {
      const frame = input.frames[input.animated ? i : 0];
      const expected = glyphs(samplePixels(frame.pixels, style.density), exportStyle, time, duration);
      const actual = [...group.querySelectorAll('text')];
      assert(actual.length === expected.length, 'Missing cells');
      actual.forEach((node, j) => {
        assert(node.textContent === expected[j].char && node.getAttribute('x') === expected[j].x.toFixed(2) && node.getAttribute('y') === expected[j].y.toFixed(2), 'Export differs from shared renderer timing');
      });
      time += input.animated ? frame.delay : 1000 / options.fps;
    });
  }
});
await test('SMIL SVG input samples changing geometry', async () => {
  const svg = '<svg xmlns="http://www.w3.org/2000/svg" width="200" height="100" viewBox="0 0 200 100"><rect x="10" y="20" width="30" height="30" fill="red"><animate attributeName="x" values="10;150;10" dur="1s" repeatCount="indefinite"/></rect></svg>';
  const decoded = await loadMedia(new Blob([svg], { type: 'image/svg+xml' }), { svgDuration: 1000, svgFps: 10 });
  assert(decoded.frames.length === 10 && decoded.duration === 1000, 'Wrong SVG sample window');
  const first = samplePixels(decoded.frames[0].pixels, 9), middle = samplePixels(decoded.frames[5].pixels, 9);
  assert(first.length > 0 && middle.length > 0, 'Missing SVG shape');
  const mean = (a: typeof first) => a.reduce((s, p) => s + p.x, 0) / a.length;
  assert(mean(middle) - mean(first) > 150, `SVG did not advance: ${mean(first)} -> ${mean(middle)}`);
  preview(await exportAnimation(decoded, style, 'gif', options), 'test-moving-svg.gif');
});
await test('CSS SVG input samples changing transforms', async () => {
  const svg = '<svg xmlns="http://www.w3.org/2000/svg" width="200" height="100" viewBox="0 0 200 100"><style>@keyframes move {from {transform:translateX(0px)}to {transform:translateX(120px)}}rect{animation:move 1s linear infinite}</style><rect x="10" y="20" width="25" height="25" fill="blue"/></svg>';
  const decoded = await loadMedia(new Blob([svg], { type: 'image/svg+xml' }), { svgDuration: 1000, svgFps: 10 });
  assert(decoded.frames[0].pixels.data.toString() !== decoded.frames[5].pixels.data.toString(), 'CSS animation collapsed');
});
await test('SVG sanitization blocks active content and external resources', () => {
  const clean = sanitizeSvg('<svg xmlns="http://www.w3.org/2000/svg" onload="alert(1)"><script>alert(1)</script><rect width="10" height="10"/></svg>');
  assert(!clean.includes('script') && !clean.includes('onload'), 'Active content retained');
  let rejected = false; try { sanitizeSvg('<svg xmlns="http://www.w3.org/2000/svg"><image href="https://example.com/image.png"/></svg>'); } catch { rejected = true; }
  assert(rejected, 'External resource accepted');
});
await test('Export cancellation stops before creating a result', async () => {
  const controller = new AbortController(); let cancelled = false;
  try { await exportAnimation(source, style, 'gif', { ...options, signal: controller.signal, onProgress: () => controller.abort() }); }
  catch (e) { cancelled = e instanceof DOMException && e.name === 'AbortError'; }
  assert(cancelled, 'Cancel did not reject export');
});
await test('Static input remains supported and exports an idle animation', async () => {
  const blob = new Blob(['<svg xmlns="http://www.w3.org/2000/svg" width="100" height="100"><circle cx="50" cy="50" r="30" fill="white"/></svg>'], { type: 'image/svg+xml' });
  const image = await loadMedia(blob);
  assert(!image.animated && samplePixels(image.frames[0].pixels, 9).length > 50, 'White silhouette lost');
  const exported = await exportAnimation(image, { ...style, motion: 35 }, 'gif', options);
  assert((await loadMedia(exported)).frames.length === 10, 'Static idle animation missing');
});
await test('GIF transparency and restore-previous disposal preserve prior pixels', async () => {
  const gif = GIFEncoder();
  gif.writeFrame(new Uint8Array(16).fill(0), 4, 4, { palette, delay: 100, repeat: 0 });
  const overlay = new Uint8Array(16).fill(3); overlay[0] = 1;
  gif.writeFrame(overlay, 4, 4, { palette, delay: 100, repeat: 0, dispose: 3, transparent: true, transparentIndex: 3 });
  const after = new Uint8Array(16).fill(3); after[15] = 2;
  gif.writeFrame(after, 4, 4, { palette, delay: 100, repeat: 0, transparent: true, transparentIndex: 3 }); gif.finish();
  const decoded = await loadMedia(new Blob([new Uint8Array(gif.bytes())], { type: 'image/gif' }));
  const topLeft = (i: number) => [...decoded.frames[i].pixels.data.slice((40 * 250 + 30) * 4, (40 * 250 + 30) * 4 + 3)];
  assert(topLeft(0)[0] > 250 && topLeft(1)[1] > 175 && topLeft(2)[0] > 250 && topLeft(2)[1] < 4 && topLeft(2)[2] < 4, `GIF disposal incorrect: ${[0,1,2].map(topLeft)}`);
});
await test('WebP partial frame offsets, blending and disposal are composited', async () => {
  async function imageBytes(width: number, height: number, color: string) {
    const c = document.createElement('canvas'); c.width = width; c.height = height; const ctx = c.getContext('2d')!; ctx.fillStyle = color; ctx.fillRect(0, 0, width, height);
    const blob = await new Promise<Blob>(resolve => c.toBlob(b => resolve(b!), 'image/webp', 1));
    return concat(chunks(new Uint8Array(await blob.arrayBuffer())).filter(c => ['VP8 ', 'VP8L', 'ALPH'].includes(c.type)).map(c => chunk(c.type,c.data)));
  }
  const full = await imageBytes(8,8,'red'), green = await imageBytes(2,2,'lime'), blue = await imageBytes(2,2,'blue');
  function frame(data: Uint8Array, x: number, y: number, w: number, h: number, flags: number) { const header = new Uint8Array(16); write24(header,0,x/2);write24(header,3,y/2);write24(header,6,w-1);write24(header,9,h-1);write24(header,12,100);header[15]=flags;return chunk('ANMF',concat([header,data])); }
  const anim = new Uint8Array(6);
  const bytes = riff([vp8x(8,8,18),chunk('ANIM',anim),frame(full,0,0,8,8,2),frame(green,2,2,2,2,1),frame(blue,4,4,2,2,0)]);
  const decoded = await loadMedia(new Blob([bytes],{type:'image/webp'}));
  const pixel = (frame:number,x:number,y:number) => [...decoded.frames[frame].pixels.data.slice((y*250+x)*4,(y*250+x)*4+4)];
  assert(pixel(1,95,100)[1]>200,'Partial green patch missing');
  assert(pixel(2,95,100)[3]===0,'Disposed patch not cleared');
  assert(pixel(2,155,170)[2]>200,'Offset blue patch missing');
  assert(pixel(2,30,40)[0]>200,'Prior red pixels not preserved');
});
await test('Quoted local SVG gradients and animateTransform remain supported', async () => {
  const sample = await fetch('/shapes/animated-orbit.svg').then(r=>r.text());
  const decoded = await loadMedia(new Blob([sample.replace('url(#color)', "url('#color')")],{type:'image/svg+xml'}),{svgDuration:1000,svgFps:10});
  assert(decoded.frames[0].pixels.data.toString() !== decoded.frames[3].pixels.data.toString(),'Transform did not animate');
});
await test('Animation limits reject more than 300 frames', async () => {
  const gif = GIFEncoder(); for (let i = 0; i < 301; i++) gif.writeFrame(new Uint8Array([0]), 1, 1, { palette, delay: 100, repeat: 0 }); gif.finish();
  let rejected = false; try { await loadMedia(new Blob([new Uint8Array(gif.bytes())], { type: 'image/gif' })); } catch { rejected = true; }
  assert(rejected, 'Oversized animation accepted');
});
preview(gifBlob, 'sample-input.gif');
document.querySelector('#status')!.textContent = `${total - failures}/${total} passed. ${failures} failed. Complete.`;
