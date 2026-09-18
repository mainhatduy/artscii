import DOMPurify from 'dompurify';
import { abortIfNeeded, blobImage, finishSource, snapshot, yieldTask, type SourceFrame } from './animation';
import type { LoadOptions } from './media';
const SVG_NS = 'http://www.w3.org/2000/svg';
const animationTags = 'animate,animateTransform,animateMotion,set';
const styleProperties = ['fill', 'fill-opacity', 'fill-rule', 'stroke', 'stroke-width', 'stroke-opacity', 'stroke-linecap', 'stroke-linejoin', 'stroke-dasharray', 'stroke-dashoffset', 'opacity', 'visibility', 'display', 'color', 'stop-color', 'stop-opacity', 'flood-color', 'flood-opacity', 'font-family', 'font-size', 'font-weight', 'text-anchor', 'dominant-baseline', 'clip-path', 'mask', 'filter', 'd'];
const geometry = ['x', 'y', 'x1', 'x2', 'y1', 'y2', 'cx', 'cy', 'r', 'rx', 'ry', 'width', 'height', 'dx', 'dy', 'offset', 'pathLength', 'startOffset'];

function externalCssUrl(value: string): boolean {
  return [...value.matchAll(/url\(\s*([\s\S]*?)\s*\)/gi)].some(m => !m[1].replace(/^['"]|['"]$/g, '').trim().startsWith('#'));
}

export function sanitizeSvg(text: string): string {
  if (/<!DOCTYPE|<!ENTITY/i.test(text)) throw new Error('SVG document types and external entities are not supported.');
  const clean = DOMPurify.sanitize(text, {
    USE_PROFILES: { svg: true, svgFilters: true },
    ADD_TAGS: ['animate', 'animateTransform', 'animateMotion', 'mpath', 'set'],
    ADD_ATTR: ['attributeName', 'attributeType', 'begin', 'dur', 'end', 'repeatCount', 'repeatDur', 'values', 'keyTimes', 'keySplines', 'keyPoints', 'calcMode', 'from', 'to', 'by', 'additive', 'accumulate', 'rotate'],
    FORBID_TAGS: ['script', 'foreignObject', 'a'],
  });
  const doc = new DOMParser().parseFromString(clean, 'image/svg+xml');
  const root = doc.documentElement;
  if (root.localName !== 'svg' || doc.querySelector('parsererror')) throw new Error('This file is not a valid SVG image.');
  for (const el of [root, ...root.querySelectorAll('*')]) {
    for (const attr of [...el.attributes]) {
      if (/href$/i.test(attr.name) && !attr.value.startsWith('#') && !/^data:image\/(png|jpeg|webp);base64,/i.test(attr.value)) throw new Error('SVG images must be self-contained. Embed raster images and use local # references.');
      if (externalCssUrl(attr.value)) throw new Error('External SVG resources are not supported.');
    }
    if (el.localName === 'style' && (/@import/i.test(el.textContent || '') || externalCssUrl(el.textContent || ''))) throw new Error('External SVG styles and fonts are not supported.');
    if (el.matches(animationTags) && /href|^on|style/i.test(el.getAttribute('attributeName') || '')) throw new Error('SVG animations that change links or styles are not supported.');
  }
  root.setAttribute('xmlns', SVG_NS);
  return new XMLSerializer().serializeToString(root);
}

function freezeSvg(root: SVGSVGElement): string {
  const clone = root.cloneNode(true) as SVGSVGElement;
  const source = [root, ...root.querySelectorAll('*')];
  const target = [clone, ...clone.querySelectorAll('*')];
  source.forEach((el, i) => {
    const out = target[i];
    if (el.matches(`${animationTags},mpath,style`)) return;
    out.removeAttribute('style');
    const style = el.ownerDocument.defaultView!.getComputedStyle(el);
    for (const name of styleProperties) {
      const value = style.getPropertyValue(name).replace(/url\(["']?[^)"']*#([^)'"\s]+)["']?\)/g, 'url(#$1)');
      if (value) (out as SVGElement).style.setProperty(name, value);
    }
    for (const key of geometry) {
      const prop = (el as unknown as Record<string, { animVal?: unknown }>)[key];
      const val = prop?.animVal;
      if (typeof val === 'number') out.setAttribute(key, String(val));
      else if (val && typeof val === 'object' && 'value' in val) out.setAttribute(key, String(val.value));
      else if (val && typeof val === 'object' && 'numberOfItems' in val && 'getItem' in val) {
        const list = val as SVGLengthList;
        if (list.numberOfItems) out.setAttribute(key, Array.from({ length: list.numberOfItems }, (_, j) => list.getItem(j).value).join(' '));
      }
    }
    // Relative CTMs include SMIL animateTransform, animateMotion and CSS transforms.
    if (el !== root && typeof (el as SVGGraphicsElement).getCTM === 'function') {
      const matrix = (el as SVGGraphicsElement).getCTM();
      const parent = el.parentElement as unknown as SVGGraphicsElement;
      const parentMatrix = typeof parent.getCTM === 'function' ? parent.getCTM() : null;
      if (matrix && parentMatrix) {
        const m = parentMatrix.inverse().multiply(matrix);
        if ([m.a, m.b, m.c, m.d, m.e, m.f].every(Number.isFinite)) out.setAttribute('transform', `matrix(${m.a} ${m.b} ${m.c} ${m.d} ${m.e} ${m.f})`);
      }
    }
    const polygon = el as SVGPolygonElement;
    if (polygon.animatedPoints?.numberOfItems) out.setAttribute('points', Array.from({ length: polygon.animatedPoints.numberOfItems }, (_, j) => { const p = polygon.animatedPoints.getItem(j); return `${p.x},${p.y}`; }).join(' '));
  });
  clone.querySelectorAll(`${animationTags},mpath,style`).forEach(el => el.remove());
  return new XMLSerializer().serializeToString(clone);
}

export async function decodeSvg(text: string, options: LoadOptions) {
  const clean = sanitizeSvg(text);
  const parsed = new DOMParser().parseFromString(clean, 'image/svg+xml');
  const animated = !!parsed.querySelector(animationTags) || /@keyframes|animation\s*:/i.test(clean);
  if (!animated) {
    const image = await blobImage(new Blob([clean], { type: 'image/svg+xml' }));
    return finishSource([{ pixels: snapshot(image, image.naturalWidth || 500, image.naturalHeight || 560), delay: 100 }], 'SVG');
  }
  const duration = Math.max(500, Math.min(10_000, options.svgDuration ?? 4000));
  const fps = Math.max(5, Math.min(30, options.svgFps ?? 15));
  const count = Math.ceil(duration / 1000 * fps);
  const iframe = document.createElement('iframe');
  iframe.setAttribute('sandbox', 'allow-same-origin');
  iframe.setAttribute('aria-hidden', 'true');
  iframe.style.cssText = 'position:fixed;left:-10000px;top:0;width:500px;height:560px;pointer-events:none;border:0';
  iframe.srcdoc = `<!doctype html><html><head><meta http-equiv="Content-Security-Policy" content="default-src 'none'; img-src data: blob:; style-src 'unsafe-inline'"><style>html,body{margin:0;width:100%;height:100%}body>svg{width:500px;height:560px}</style></head><body>${clean}</body></html>`;
  try {
    await new Promise<void>((resolve, reject) => {
      const timeout = setTimeout(() => done(new Error('SVG animation loading timed out.')), 8000);
      const abort = () => done(new DOMException('Cancelled', 'AbortError'));
      function done(error?: Error) { clearTimeout(timeout); options.signal?.removeEventListener('abort', abort); iframe.onload = null; error ? reject(error) : resolve(); }
      iframe.onload = () => done(); options.signal?.addEventListener('abort', abort, { once: true });
      document.body.append(iframe);
      if (options.signal?.aborted) abort();
    });
    const root = iframe.contentDocument?.querySelector('svg');
    if (!root) throw new Error('Unable to sample this SVG animation.');
    root.pauseAnimations();
    const animations = root.getAnimations({ subtree: true });
    animations.forEach(a => a.pause());
    const frames: SourceFrame[] = [];
    for (let i = 0; i < count; i++) {
      abortIfNeeded(options.signal);
      const ms = i * duration / count;
      root.setCurrentTime(ms / 1000); animations.forEach(a => { a.currentTime = ms; });
      // Reading layout flushes the chosen animation time before serialization.
      root.getBoundingClientRect();
      const frozen = freezeSvg(root);
      const image = await blobImage(new Blob([frozen], { type: 'image/svg+xml' }));
      frames.push({ pixels: snapshot(image, image.naturalWidth || 500, image.naturalHeight || 560), delay: duration / count });
      options.onProgress?.((i + 1) / count); await yieldTask();
    }
    return finishSource(frames, 'SVG');
  } finally { iframe.remove(); }
}
