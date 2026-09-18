import { useEffect, useRef, useState } from 'react';
import { ArrowDownToLine, X } from 'lucide-react';
import type { AnimationSource } from '../lib/animation';
import { DEFAULT_LOOP_DURATION } from '../lib/loop-noise';
import { downloadBlob, type ExportFormat } from '../lib/export';
import type { AsciiMorphHandle } from './AsciiMorph';

type Props = { art: AsciiMorphHandle; source: AnimationSource; onClose: () => void; onMessage: (message: string) => void };
export function ExportDialog({ art, source, onClose, onMessage }: Props) {
  const [format, setFormat] = useState<ExportFormat>('gif');
  const [width, setWidth] = useState(640);
  const [duration, setDuration] = useState(DEFAULT_LOOP_DURATION / 1000);
  const [fps, setFps] = useState(15);
  const [loop, setLoop] = useState(true);
  const [progress, setProgress] = useState<number | null>(null);
  const [error, setError] = useState('');
  const controller = useRef<AbortController | null>(null);
  const dialog = useRef<HTMLDialogElement>(null);
  useEffect(() => { dialog.current?.showModal(); return () => controller.current?.abort(); }, []);
  async function save() {
    const task = new AbortController(); controller.current = task;
    setProgress(0); setError('');
    try {
      const blob = await art.exportAnimation(format, { width, height: Math.round(width * 620 / 650), duration: duration * 1000, fps, loop, signal: task.signal, onProgress: n => setProgress(Math.round(n * 100)) });
      task.signal.throwIfAborted();
      downloadBlob(blob, `artscii-animation.${format}`); onMessage(`${format.toUpperCase()} animation exported.`); onClose();
    } catch (e) {
      if (!task.signal.aborted) setError(e instanceof Error ? e.message : 'Export failed. Please try again.');
    } finally { controller.current = null; setProgress(null); }
  }
  const busy = progress !== null;
  return <dialog ref={dialog} className="modal export-dialog" onCancel={e => { e.preventDefault(); if (busy) controller.current?.abort(); else onClose(); }} onClick={e => { if (e.target === e.currentTarget && !busy) onClose(); }} aria-labelledby="export-title">
    <button className="modal-close icon-button" aria-label={busy ? 'Cancel export' : 'Close export'} onClick={() => { if (busy) controller.current?.abort(); else onClose(); }}><X size={20} /></button>
    <span className="eyebrow">CHARACTERS IN MOTION</span><h2 id="export-title">Keep it moving.</h2>
    <p>{source.animated ? `${source.format} source · ${source.frames.length} frames · ${(source.duration / 1000).toFixed(2)}s. Source frame timing is preserved.` : 'Export a character animation of the selected shape. Shape cycling and pointer interactions are not included.'}</p>
    <fieldset disabled={busy} className="export-options">
      <label htmlFor="export-format">Animation format</label><select id="export-format" value={format} onChange={e => setFormat(e.target.value as ExportFormat)}><option value="gif">GIF — widely supported</option><option value="webp">Animated WebP — compact image</option><option value="svg">Animated SVG — vector characters</option></select>
      <p className="export-help">{format === 'svg' ? 'Compact SVG: characters are reused, changes keep their exact timing, and wander stays smooth without a frame rate. Grain is embedded as an image.' : format === 'gif' ? '256-color animation. GIF timing is rounded to hundredths of a second.' : 'Full-color WebP animation. Best for modern browsers and websites.'}</p>
      <label htmlFor="export-width">Output size</label><select id="export-width" value={width} onChange={e => setWidth(+e.target.value)}>{[480, 640, 960].map(w => <option key={w} value={w}>{w} × {Math.round(w * 620 / 650)} px</option>)}</select>
      {!source.animated && <>
        <p className="export-help">The preview repeats every 4 seconds. Export keeps the same character timing and wander. Time steps change the timing choices, not the frame rate.</p>
        <div className="export-timing">
          {(format !== 'svg' || !loop) && <label>Playback duration<select aria-label="Export duration" value={duration} onChange={e => setDuration(+e.target.value)}>{[4, 8].map(n => <option key={n} value={n}>{n} seconds · {n / 4} {n === 4 ? 'cycle' : 'cycles'}</option>)}</select></label>}
          {format !== 'svg' && <label>Frame rate<select aria-label="Export frame rate" value={fps} onChange={e => setFps(+e.target.value)}>{[10, 15, 24, 30].map(n => <option key={n} value={n}>{n} fps</option>)}</select></label>}
        </div>
        {format === 'svg' && loop && <p className="export-help">One 4-second cycle repeats indefinitely; extra cycles do not add file size.</p>}
      </>}
      <label className="loop-checkbox"><input type="checkbox" checked={loop} onChange={e => setLoop(e.target.checked)} /> Loop animation</label>
    </fieldset>
    {error && <p role="alert" className="export-error">{error}</p>}
    {busy ? <div className="export-progress"><label htmlFor="export-progress">Rendering animation… {progress}%</label><progress id="export-progress" max="100" value={progress} /><button className="code-button" onClick={() => controller.current?.abort()}>Cancel export</button></div> : <button className="primary-button" onClick={() => void save()}><ArrowDownToLine size={16} /> Export {format.toUpperCase()} animation</button>}
  </dialog>;
}
