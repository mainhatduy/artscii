import { abortIfNeeded, samplePixels, yieldTask, type AnimationSource, type Point } from './animation';
import { characterSchedule, DEFAULT_LOOP_DURATION, sampleGlyphLoop, wanderCycles } from './loop-noise';
import { DEFAULT_FONT_FAMILY, drawBackground, glyphs, themes, type ArtStyle } from './render';
import type { ExportOptions } from './export';

export const escapeXml = (value: string) => value.replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&apos;' })[c]!);
const number = (value: number) => String(+value.toFixed(6));
type Event = { time: number; value: string };
type Cell = { point: Point; color: Event[]; display: Event[] };
function append(events: Event[], time: number, value: string) {
  if (events.at(-1)?.value !== value) events.push({ time, value });
}

// Discrete tracks contain only changes. At a finite end, preserve the last
// displayed state; repeating animations naturally restart at the first state.
function track(attribute: string, events: Event[], duration: number, playback: number, loop: boolean) {
  if (events.length < 2) return '';
  return `<animate attributeName="${attribute}" calcMode="discrete" values="${events.map(e => escapeXml(e.value)).join(';')};${escapeXml(events.at(-1)!.value)}" keyTimes="${events.map(e => number(e.time / duration)).join(';')};1" dur="${number(duration / 1000)}s" repeatCount="${loop ? 'indefinite' : number(playback / duration)}" fill="freeze"/>`;
}

function background(style: ArtStyle, width: number, height: number) {
  if (style.bgMode === 'transparent') return '';
  if (style.grain) {
    const canvas = document.createElement('canvas'); canvas.width = width; canvas.height = height;
    drawBackground(canvas.getContext('2d')!, width, height, style.palette, true, style.bgMode, style.bgColor);
    return `<image width="${width}" height="${height}" href="${canvas.toDataURL('image/png')}"/>`;
  }
  if (style.bgMode === 'color') return `<rect width="${width}" height="${height}" fill="${escapeXml(style.bgColor || '#0d1117')}"/>`;
  const theme = themes[style.palette] ?? themes.lagoon;
  return `<defs><radialGradient id="background" gradientUnits="userSpaceOnUse" cx="${width * .5}" cy="${height * .5}" fx="${width * .52}" fy="${height * .45}" r="${width * .63}"><stop stop-color="${theme.glow}"/><stop offset=".62" stop-color="${theme.glow2}"/><stop offset="1" stop-color="${theme.bg}"/></radialGradient></defs><rect width="${width}" height="${height}" fill="url(#background)"/>`;
}

export async function exportSvg(source: AnimationSource, style: ArtStyle, options: ExportOptions): Promise<Blob> {
  const duration = source.animated ? source.duration : DEFAULT_LOOP_DURATION;
  const playback = source.animated ? source.duration : options.duration;
  const { width, height, signal, loop } = options;
  abortIfNeeded(signal);
  const cells = new Map<string, Cell>();
  let previous = new Set<string>(), time = 0;
  // Source frames change only presence and color. The random character clock
  // and continuous wander remain independent of source FPS, just like preview.
  for (const [index, frame] of source.frames.entries()) {
    abortIfNeeded(signal);
    const present = new Set<string>();
    const points = samplePixels(frame.pixels, style.density);
    const rendered = glyphs(points, style, 0, duration);
    points.forEach((point, i) => {
      const key = `${point.x}:${point.y}`;
      present.add(key);
      let cell = cells.get(key);
      if (!cell) {
        cell = { point, color: [{ time: 0, value: rendered[i].color }], display: [{ time: 0, value: time ? 'none' : 'inline' }] };
        cells.set(key, cell);
      }
      append(cell.color, time, rendered[i].color);
      append(cell.display, time, 'inline');
    });
    for (const key of previous) if (!present.has(key)) append(cells.get(key)!.display, time, 'none');
    previous = present;
    time += frame.delay;
    options.onProgress?.((index + 1) / source.frames.length * .4);
    await yieldTask();
    if (!source.animated) break;
  }
  const scale = Math.min(width / 650, height / 620);
  const parts = [`<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}" role="img" aria-label="Animated ASCII artwork"><title>ArtSCII animation</title>${background(style, width, height)}<g transform="translate(${number(width / 2 - 250 * scale)} ${number(height / 2 - 280 * scale)}) scale(${number(scale)})" font-family="${escapeXml(style.fontFamily ?? DEFAULT_FONT_FAMILY)}" font-size="${number(style.density * .94)}" text-anchor="middle" dominant-baseline="central">`];
  const chars = Array.from(style.characters.trim() || '@#$%&*+=:-.');
  const char = (value: number) => chars[Math.min(chars.length - 1, Math.floor(value * chars.length))];
  let bytes = new TextEncoder().encode(parts[0]).length, index = 0;
  for (const { point, color, display } of cells.values()) {
    abortIfNeeded(signal);
    const { x, y } = point;
    const schedule = characterSchedule(x, y, duration, style.animationSeed, style.maxTimeSteps);
    const changes: Event[] = [{ time: 0, value: char(schedule.changes.at(-1)?.value ?? schedule.base) }];
    for (const event of schedule.changes) {
      if (event.time === 0) changes[0].value = char(event.value);
      else append(changes, event.time, char(event.value));
    }
    const state = sampleGlyphLoop(0, x, y, duration, style.animationSeed, style.maxTimeSteps);
    let content = track('fill', color, duration, playback, loop) + track('display', display, duration, playback, loop);
    if (style.motion) {
      const radius = Math.abs(style.motion / 22), dx = state.dx * style.motion / 22, dy = state.dy * style.motion / 22;
      const period = duration / wanderCycles(duration);
      content += `<animateMotion path="M ${number(dx)} ${number(dy)} A ${number(radius)} ${number(radius)} 0 1 0 ${number(-dx)} ${number(-dy)} A ${number(radius)} ${number(radius)} 0 1 0 ${number(dx)} ${number(dy)}" calcMode="paced" dur="${number(period / 1000)}s" repeatCount="${loop ? 'indefinite' : number(playback / period)}" fill="freeze"/>`;
    }
    for (const value of new Set(changes.map(e => e.value))) {
      const visibility: Event[] = [];
      for (const event of changes) append(visibility, event.time, event.value === value ? 'visible' : 'hidden');
      content += `<text visibility="${visibility[0].value}">${escapeXml(value)}${track('visibility', visibility, duration, playback, loop)}</text>`;
    }
    const group = `<g transform="translate(${number(x)} ${number(y)})" fill="${escapeXml(color[0].value)}" opacity="${number(state.alpha)}" display="${display[0].value}">${content}</g>`;
    bytes += new TextEncoder().encode(group).length;
    if (bytes > 40_000_000) throw new Error('SVG is too detailed. Use fewer characters or GIF/WebP for a smaller file.');
    parts.push(group);
    if (++index % 100 === 0) { options.onProgress?.(.4 + .6 * index / cells.size); await yieldTask(); }
  }
  abortIfNeeded(signal);
  parts.push('</g></svg>');
  options.onProgress?.(1);
  abortIfNeeded(signal);
  return new Blob(parts, { type: 'image/svg+xml' });
}
