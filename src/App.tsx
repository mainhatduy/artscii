import { useEffect, useRef, useState } from 'react';
import { ArrowDownToLine, ArrowLeft, ArrowRight, ArrowUpRight, Check, ChevronDown, Code2, Expand, ImagePlus, Info, Maximize2, Pause, Play, RotateCcw, Shuffle, Sparkles, Upload, X } from 'lucide-react';
import { AsciiMorph, type AsciiMorphHandle, type BgMode, type Palette, sampleImage } from './components/AsciiMorph';
import { isLightColor } from './lib/render';
import { ExportDialog } from './components/ExportDialog';
import { UnicodePicker } from './components/UnicodePicker';
import { loadMedia } from './lib/media';
import type { AnimationSource } from './lib/animation';

const presets = [
  { id: 'runner', name: 'The runner', category: 'IN MOTION', file: '/shapes/runner.svg' },
  { id: 'knight', name: 'The knight', category: 'A CLASSIC', file: '/shapes/knight.svg' },
  { id: 'portrait', name: 'The thinker', category: 'HUMAN FORM', file: '/shapes/portrait.svg' },
  { id: 'rocket', name: 'Lift off', category: 'TO THE STARS', file: '/shapes/rocket.svg' },
];
const sets = {
  classic: '@#$%&*+=:-.',
  minimal: '+·:−=',
  binary: '01',
  blocks: '░▒▓█',
  keyboard: '!"#$%&\'()*+,-./0123456789:;<=>?@ABCDEFGHIJKLMNOPQRSTUVWXYZ[\\]^_`abcdefghijklmnopqrstuvwxyz{|}~',
};

function Thumbnail({ src }: { src: string }) {
  const ref = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    let active = true;
    sampleImage(src, 13).then(points => {
      if (!active || !ref.current) return;
      const ctx = ref.current.getContext('2d')!;
      ctx.clearRect(0, 0, 300, 200); ctx.font = '5.1px monospace'; ctx.textAlign = 'center';
      points.forEach((p, i) => { ctx.fillStyle = i % 4 === 0 ? '#bd9c61' : '#607366'; ctx.globalAlpha = .45 + (i % 5) * .12; ctx.fillText('@$&*+:'[i % 6], p.x * .32 + 70, p.y * .32 + 8); });
    }).catch(() => {});
    return () => { active = false; };
  }, [src]);
  return <canvas width="300" height="200" ref={ref} aria-hidden="true" />;
}

function App() {
  const [active, setActive] = useState(0);
  const [uploaded, setUploaded] = useState<{ file: string; name: string; source: AnimationSource; original: File } | null>(null);
  const [sourceInfo, setSourceInfo] = useState<AnimationSource | null>(null);
  const [exportOpen, setExportOpen] = useState(false);
  const [loadProgress, setLoadProgress] = useState<number | null>(null);
  const [svgDuration, setSvgDuration] = useState(4);
  const [svgFps, setSvgFps] = useState(15);
  const uploadTask = useRef<AbortController | null>(null);
  useEffect(() => () => uploadTask.current?.abort(), []);
  const [density, setDensity] = useState(9);
  const [duration, setDuration] = useState(1800);
  const [motion, setMotion] = useState(35);
  const [playing, setPlaying] = useState(() => !matchMedia('(prefers-reduced-motion: reduce)').matches);
  const [loop, setLoop] = useState(false);
  const [grain, setGrain] = useState(true);
  const [palette, setPalette] = useState<Palette>('lagoon');
  const [bgMode, setBgMode] = useState<BgMode>('theme');
  const [bgColor, setBgColor] = useState('#0d1117');
  const [charset, setCharset] = useState('classic');
  const [characters, setCharacters] = useState(sets.classic);
  const [showUnicodePicker, setShowUnicodePicker] = useState(false);
  const [sourceColor, setSourceColor] = useState(false);
  const [count, setCount] = useState(0);
  const [toast, setToast] = useState('');
  const [modal, setModal] = useState<'about' | 'code' | null>(null);
  const [expanded, setExpanded] = useState(false);
  const [dragging, setDragging] = useState(false);
  const art = useRef<AsciiMorphHandle>(null);
  const fileInput = useRef<HTMLInputElement>(null);
  const items = uploaded ? [...presets, { id: 'custom', category: 'YOUR IMAGE', ...uploaded }] : presets;
  const selected = items[active] ?? items[0];
  const isOverlayDark = bgMode === 'theme' ? palette === 'paper' : bgMode === 'color' ? isLightColor(bgColor) : false;

  useEffect(() => { if (!toast) return; const t = setTimeout(() => setToast(''), 4500); return () => clearTimeout(t); }, [toast]);
  useEffect(() => { if (!playing || !loop) return; const t = setInterval(() => setActive(a => (a + 1) % items.length), duration + 3300); return () => clearInterval(t); }, [loop, playing, duration, items.length]);
  useEffect(() => () => { if (uploaded) URL.revokeObjectURL(uploaded.file); }, [uploaded]);
  useEffect(() => {
    const key = (e: KeyboardEvent) => { if (e.key === 'Escape') { setExpanded(false); setModal(null); } };
    window.addEventListener('keydown', key); return () => window.removeEventListener('keydown', key);
  }, []);
  const select = (index: number) => { setActive(index); setLoop(false); if (index !== active) setSourceInfo(null); };
  async function upload(file?: File) {
    if (!file) return;
    if (!['image/png', 'image/jpeg', 'image/webp', 'image/gif', 'image/svg+xml'].includes(file.type) && !/\.(png|jpe?g|webp|gif|svg)$/i.test(file.name)) { setToast('Choose a PNG, JPG, GIF, WebP, or SVG image.'); return; }
    if (file.size > 10 * 1024 * 1024) { setToast('Choose an image smaller than 10 MB.'); return; }
    uploadTask.current?.abort();
    const task = new AbortController(); uploadTask.current = task; setLoadProgress(0);
    try {
      const source = await loadMedia(file, { signal: task.signal, svgDuration: svgDuration * 1000, svgFps, onProgress: value => setLoadProgress(Math.round(value * 100)) });
      task.signal.throwIfAborted();
      const url = URL.createObjectURL(file);
      setUploaded({ file: url, name: file.name.replace(/\.[^.]+$/, ''), source, original: file }); select(4);
      setToast(source.animated ? `${source.frames.length} frames ready. The source animation is now rendered in ASCII.` : 'Your image is ready. Make it your own.');
    } catch (error) { if (!task.signal.aborted) setToast(error instanceof Error ? error.message : 'Unable to decode this image.'); }
    finally { if (uploadTask.current === task) { uploadTask.current = null; setLoadProgress(null); } }
  }

  function reset() {
    setDensity(9);
    setDuration(1800);
    setMotion(35);
    setPalette('lagoon');
    setBgMode('theme');
    setBgColor('#0d1117');
    setGrain(true);
    setCharset('classic');
    setCharacters(sets.classic);
    setShowUnicodePicker(false);
    setSourceColor(false);
    setLoop(false);
    select(0);
    setToast('Back to a fresh canvas.');
  }

  const code = `<AsciiMorph\n  images={${JSON.stringify(uploaded && active === 4 ? ['/your-image.png'] : presets.map(p => p.file), null, 2)}}\n  activeIndex={${active === 4 ? 0 : active}}\n  characters=${JSON.stringify(characters)}\n  density={${density}}\n  morphDuration={${duration}}\n  colorMode="${sourceColor ? 'source' : 'mono'}"\n  palette="${palette}"\n  bgMode="${bgMode}"\n  bgColor="${bgColor}"\n  motion={${motion}}\n  grain={${grain}}\n  playing={${playing}}\n/>`;
  return (
    <div className="app-shell">
      <header className="site-header">
        <a href="#" className="brand" aria-label="ArtSCII home"><span className="brand-symbol">A<span>*</span></span><span>ArtSCII<span className="brand-period">.</span></span></a>
        <div className="header-divider" /><span className="header-caption">A little character goes a long way.</span>
        <nav><span className="local-status"><i /> All local. All yours.</span><button className="about-button" onClick={() => setModal('about')}>About the studio <ArrowUpRight size={15} /></button></nav>
      </header>

      <main>
        <section className="intro"><div><div className="eyebrow"><span /> THE ASCII PLAYGROUND</div><h1>Small characters. <span>Endless possibilities.</span></h1><p>Turn a simple shape into something alive. Tweak, play, and make it yours.</p></div><div className="intro-note"><Sparkles size={15} /><span>A little art.<br />A little algorithm.</span></div></section>

        <section className={`workspace ${expanded ? 'expanded' : ''}`} aria-label="ASCII art editor">
          <div className="preview-panel">
            <div className="panel-toolbar"><div className="toolbar-title"><span className="live-dot" /> LIVE PREVIEW <span className="toolbar-slash">/</span> <span className="current-name">{selected.name}</span></div><button className="icon-button" title={expanded ? 'Close expanded preview' : 'Expand preview'} aria-label={expanded ? 'Close expanded preview' : 'Expand preview'} onClick={() => setExpanded(!expanded)}>{expanded ? <X size={16} /> : <Expand size={16} />}</button></div>
            <div className={`art-stage ${dragging ? 'dragging' : ''} ${bgMode === 'transparent' ? 'stage-transparent' : ''}`} onDragOver={e => { e.preventDefault(); setDragging(true); }} onDragLeave={() => setDragging(false)} onDrop={e => { e.preventDefault(); setDragging(false); void upload(e.dataTransfer.files[0]); }}>
              <AsciiMorph ref={art} images={items.map(p => p.file)} activeIndex={active} source={active === 4 ? uploaded?.source : undefined} onSource={setSourceInfo} characters={characters} density={density} morphDuration={duration} colorMode={sourceColor ? 'source' : 'mono'} palette={palette} bgMode={bgMode} bgColor={bgColor} playing={playing} motion={motion} grain={grain} onCount={setCount} onError={setToast} />
              <div className={`stage-overlay ${isOverlayDark ? 'dark-ink' : ''}`}><div className="stage-top"><span>FORM NO. 0{active + 1}</span><span>ASCII / EXPLORATIONS</span></div><div className="stage-heading">{selected.name}<span>{active === 0 ? 'Built from characters. Made to move.' : 'A familiar form. A different language.'}</span></div><div className="stage-bottom"><span><span className="crosshair">+</span> MOVE YOUR CURSOR. MAKE A LITTLE CHAOS.</span><span>500 × 560</span></div></div>
              {loadProgress !== null && <div className="loading-overlay" role="status"><span>Decoding animation… {loadProgress}%</span><progress max="100" value={loadProgress} /><button onClick={() => uploadTask.current?.abort()}>Cancel</button></div>}
              {dragging && <div className="drop-overlay"><Upload size={30} /> Drop an image to bring it to life</div>}
            </div>
            <div className="playback-bar"><div className="playback-controls"><button className="play-button" aria-label={playing ? 'Pause animation' : 'Play animation'} onClick={() => setPlaying(!playing)}>{playing ? <Pause size={14} fill="currentColor" /> : <Play size={14} fill="currentColor" />}</button><button className="icon-button" aria-label="Replay animation" title="Replay animation" onClick={() => { setPlaying(true); art.current?.replay(); }}><RotateCcw size={16} /></button><span className="playback-state">{playing ? 'In motion' : 'Paused'}</span></div><div className="particle-count"><i />{count.toLocaleString()} characters <span>·</span> {sourceInfo?.animated ? `${sourceInfo.frames.length} frames · ${(sourceInfo.duration / 1000).toFixed(1)}s` : 'Canvas 2D'}</div><button className="scatter-button" disabled={sourceInfo?.animated} title={sourceInfo?.animated ? 'Source animation controls the shape' : 'Scatter characters'} onClick={() => { setPlaying(true); art.current?.scatter(); }}><Shuffle size={14} /> Scatter</button></div>
          </div>

          <aside className="settings"><div className="settings-heading"><h2>Make it yours</h2><button className="icon-button" onClick={reset} title="Reset settings" aria-label="Reset settings"><RotateCcw size={15} /></button></div>
            <div className="settings-section"><div className="section-label"><span>01</span> CHARACTERS</div><label htmlFor="charset">Character set</label><div className="select-wrap"><select id="charset" value={charset} onChange={e => { const val = e.target.value; setCharset(val); if (val !== 'custom') { setCharacters(sets[val as keyof typeof sets]); setShowUnicodePicker(false); } else { setShowUnicodePicker(true); } }}><option value="classic">Classic ASCII</option><option value="minimal">Minimal marks</option><option value="binary">Binary code</option><option value="blocks">Block shades</option><option value="keyboard">All keyboard characters</option><option value="custom">Custom characters</option></select><ChevronDown size={14} /></div><div className="custom-char-row"><input className="characters-input" aria-label="Characters" value={characters} maxLength={150} onChange={e => { setCharacters(e.target.value); setCharset('custom'); }} onBlur={() => { if (!characters.trim()) setCharacters(sets.classic); }} spellCheck={false} /><button type="button" className={`unicode-toggle-btn ${showUnicodePicker ? 'active' : ''}`} onClick={() => { setShowUnicodePicker(prev => !prev); if (charset !== 'custom') setCharset('custom'); }} title={showUnicodePicker ? 'Hide Unicode character palette' : 'Pick Unicode characters'} aria-label="Toggle Unicode character palette" aria-expanded={showUnicodePicker}><Sparkles size={13} /></button></div>{showUnicodePicker && <UnicodePicker characters={characters} onChange={newChars => { setCharacters(newChars); setCharset('custom'); }} maxChars={150} />}
              <div className="range-label"><label htmlFor="density">Density</label><output>{density <= 7 ? 'Fine' : density <= 11 ? 'Balanced' : 'Coarse'}</output></div><input id="density" type="range" min="5" max="17" value={22 - density} onChange={e => setDensity(22 - +e.target.value)} style={{ '--range': `${(17 - density) / 12 * 100}%` } as React.CSSProperties} /><div className="range-hints"><span>Less</span><span>More</span></div>
            </div>
            <div className="settings-section">
              <div className="section-label"><span>02</span> LOOK & FEEL</div>
              <div className="range-label">
                <label>Background</label>
                <output className="palette-name">{bgMode === 'theme' ? palette : bgMode === 'color' ? bgColor : 'transparent'}</output>
              </div>
              <div className="bg-mode-tabs" role="tablist" aria-label="Background mode">
                <button type="button" className={`bg-mode-tab ${bgMode === 'theme' ? 'active' : ''}`} onClick={() => setBgMode('theme')} role="tab" aria-selected={bgMode === 'theme'}>Theme</button>
                <button type="button" className={`bg-mode-tab ${bgMode === 'color' ? 'active' : ''}`} onClick={() => setBgMode('color')} role="tab" aria-selected={bgMode === 'color'}>Custom Color</button>
                <button type="button" className={`bg-mode-tab ${bgMode === 'transparent' ? 'active' : ''}`} onClick={() => setBgMode('transparent')} role="tab" aria-selected={bgMode === 'transparent'}>Transparent</button>
              </div>
              {bgMode === 'theme' && (
                <div className="palettes">
                  {(['lagoon', 'paper', 'midnight', 'rose', 'amber', 'emerald'] as Palette[]).map(p => (
                    <button key={p} className={`palette ${p} ${palette === p ? 'active' : ''}`} title={`${p.charAt(0).toUpperCase() + p.slice(1)} theme`} aria-label={`${p} palette`} aria-pressed={palette === p} onClick={() => setPalette(p)}>
                      {palette === p && <Check size={15} />}
                    </button>
                  ))}
                </div>
              )}
              {bgMode === 'color' && (
                <div className="custom-color-controls">
                  <div className="color-input-row">
                    <label className="color-picker-wrap" title="Pick custom color">
                      <input type="color" value={bgColor} onChange={e => setBgColor(e.target.value)} aria-label="Pick background color" />
                      <span className="color-swatch-display" style={{ backgroundColor: bgColor }} />
                    </label>
                    <input type="text" className="hex-code-input" value={bgColor} maxLength={7} spellCheck={false} aria-label="Hex color code" onChange={e => setBgColor(e.target.value)} onBlur={() => { if (!/^#[0-9A-Fa-f]{6}$/.test(bgColor)) setBgColor('#0d1117'); }} />
                  </div>
                  <div className="color-swatches" role="group" aria-label="Preset colors">
                    {[
                      { label: 'Pitch Black', color: '#000000' },
                      { label: 'Clean White', color: '#ffffff' },
                      { label: 'GitHub Dark', color: '#0d1117' },
                      { label: 'Catppuccin', color: '#1e1e2e' },
                      { label: 'Midnight Blue', color: '#0b132b' },
                      { label: 'Deep Plum', color: '#2b1a29' },
                      { label: 'Dark Pine', color: '#102419' },
                      { label: 'Warm Espresso', color: '#241a15' },
                    ].map(s => (
                      <button key={s.color} type="button" className={`color-swatch ${bgColor.toLowerCase() === s.color.toLowerCase() ? 'active' : ''}`} style={{ backgroundColor: s.color }} title={s.label} aria-label={s.label} onClick={() => setBgColor(s.color)} />
                    ))}
                  </div>
                </div>
              )}
              {bgMode === 'transparent' && (
                <div className="transparent-note">
                  <span className="transparent-chip" />
                  <span>Transparent background active. Perfect for overlaying & clean exports.</span>
                </div>
              )}
              <div className="toggle-row"><span>Original image colors</span><button className="toggle" role="switch" aria-label="Original image colors" aria-checked={sourceColor} onClick={() => setSourceColor(!sourceColor)}><span /></button></div>
              <div className="toggle-row"><span>Grain texture <Info size={12}><title>A subtle film-like texture</title></Info></span><button className="toggle" role="switch" aria-label="Grain texture" aria-checked={grain} onClick={() => setGrain(!grain)}><span /></button></div>
            </div>
            <div className="settings-section motion-section"><div className="section-label"><span>03</span> MOTION</div><div className="range-label"><label htmlFor="duration">{sourceInfo?.animated ? 'Source timing preserved' : 'Morph duration'}</label><output>{sourceInfo?.animated ? `${(sourceInfo.duration / 1000).toFixed(1)}s` : `${(duration / 1000).toFixed(1)}s`}</output></div><input id="duration" disabled={sourceInfo?.animated} type="range" min="600" max="3600" step="100" value={duration} onChange={e => setDuration(+e.target.value)} style={{ '--range': `${(duration - 600) / 30}%` } as React.CSSProperties} /><div className="range-label second-range"><label htmlFor="motion">Wander</label><output>{motion}%</output></div><input id="motion" type="range" min="0" max="100" value={motion} onChange={e => setMotion(+e.target.value)} style={{ '--range': `${motion}%` } as React.CSSProperties} /><div className="toggle-row cycle-row"><span>Cycle through shapes</span><button className="toggle" role="switch" aria-label="Cycle through shapes" aria-checked={loop} onClick={() => setLoop(!loop)}><span /></button></div></div>
            <div className="export-actions"><button className="primary-button" disabled={!sourceInfo || loadProgress !== null} onClick={() => { setLoop(false); setExportOpen(true); }}><ArrowDownToLine size={16} /> Export animation <span>GIF / WEBP / SVG</span></button><button className="primary-button" onClick={() => art.current?.exportPng()}><ArrowDownToLine size={16} /> Save current frame <span>PNG</span></button><button className="code-button" onClick={() => setModal('code')}><Code2 size={15} /> Get the component</button></div>
          </aside>
        </section>

        <section className="shape-library"><div className="library-heading"><div><h2>Start with a shape<span>OR BRING YOUR OWN</span></h2></div><div className="shape-navigation"><button className="icon-button" aria-label="Previous shape" onClick={() => select((active + items.length - 1) % items.length)}><ArrowLeft size={16} /></button><button className="icon-button" aria-label="Next shape" onClick={() => select((active + 1) % items.length)}><ArrowRight size={16} /></button></div></div><div className="shape-grid">{presets.map((p, i) => <button className={`shape-card ${active === i ? 'selected' : ''}`} key={p.id} onClick={() => select(i)} aria-pressed={active === i}><span className="shape-number">0{i + 1}</span>{active === i && <span className="selected-check"><Check size={12} /></span>}<Thumbnail src={p.file} /><span className="shape-card-footer"><span>{p.name}</span><span>{p.category}</span></span></button>)}<button className={`upload-card ${active === 4 ? 'selected' : ''}`} onClick={() => fileInput.current?.click()}><span className="upload-icon"><ImagePlus size={23} strokeWidth={1.3} /></span><strong>{uploaded ? uploaded.name : 'Your next idea'}</strong><span>Drop an image into the preview</span><span className="upload-link">Upload image <ArrowUpRight size={13} /></span><small>GIF, WEBP, SVG, PNG, JPG · 10 MB</small></button></div></section>
        <input ref={fileInput} type="file" accept="image/png,image/jpeg,image/webp,image/gif,image/svg+xml,.gif,.webp,.svg" className="hidden-input" aria-label="Upload image" onChange={e => { void upload(e.target.files?.[0]); e.target.value = ''; }} />
        <button className="animation-demo-button" disabled={loadProgress !== null} onClick={async () => { try { const response = await fetch('/shapes/animated-orbit.svg'); if (!response.ok) throw new Error(); await upload(new File([await response.blob()], 'animated-orbit.svg', { type: 'image/svg+xml' })); } catch { setToast('The sample animation could not be loaded.'); } }}><Play size={13} /> Try an animated SVG</button>
        <details className="svg-capture-settings"><summary>Animated SVG capture settings <span>{svgDuration}s · {svgFps} fps</span></summary><p>SVGs can loop forever. Choose the time window to sample; GIF and WebP keep their source timing. Self-contained SMIL and CSS animations are supported.</p><div className="export-timing"><label>Capture duration<select aria-label="SVG capture duration" value={svgDuration} onChange={e => setSvgDuration(+e.target.value)}>{[1, 2, 3, 4, 6, 8, 10].map(n => <option key={n} value={n}>{n} seconds</option>)}</select></label><label>Capture frame rate<select aria-label="SVG capture frame rate" value={svgFps} onChange={e => setSvgFps(+e.target.value)}>{[10, 15, 24, 30].map(n => <option key={n} value={n}>{n} fps</option>)}</select></label>{uploaded?.source.format === 'SVG' && <button className="primary-button" disabled={loadProgress !== null} onClick={() => void upload(uploaded.original)}>Resample SVG</button>}</div></details>
      </main>
      <footer><span><span className="footer-star">✳</span> Made of ordinary characters. Anything but ordinary.</span><span>A tiny experiment in creative coding <span className="footer-dot">·</span> ArtSCII STUDIO © {new Date().getFullYear()}</span></footer>
      {exportOpen && sourceInfo && art.current && <ExportDialog art={art.current} source={sourceInfo} onClose={() => setExportOpen(false)} onMessage={setToast} />}
      {toast && <div className="toast" role="status"><Sparkles size={16} />{toast}<button className="icon-button" aria-label="Dismiss notification" onClick={() => setToast('')}><X size={15} /></button></div>}
      {modal && <div className="modal-backdrop" onClick={() => setModal(null)}><section className="modal" role="dialog" aria-modal="true" aria-labelledby="modal-title" onClick={e => e.stopPropagation()}><button autoFocus className="modal-close icon-button" aria-label="Close dialog" onClick={() => setModal(null)}><X size={20} /></button><span className="eyebrow">A LITTLE ART. A LITTLE ALGORITHM.</span><h2 id="modal-title">{modal === 'about' ? 'Hello, character.' : 'Take the motion with you.'}</h2>{modal === 'about' ? <><p>ArtSCII is a small playground for living ASCII art. Each character is a particle that finds its place in a shape, wanders, and flows into the next.</p><p>Pick a shape, tune the details, or upload your own. Transparent silhouettes and images on white backgrounds work best. Your images stay in your browser.</p><div className="about-features"><span><Maximize2 size={17} /> Responsive Canvas</span><span><Shuffle size={17} /> Particle morphing</span><span><ImagePlus size={17} /> Your own images</span></div><p className="fine-print">Motion respects your system’s reduced-motion preference. Export the current frame as PNG or save the selected shape as animated GIF, WebP, or SVG. Animated uploads preserve source timing.</p></> : <><p>Use <code>src/components/AsciiMorph.tsx</code> in your React project, and the src/lib folder in your React project, install the dependencies listed in the README, then add your images to its public folder.</p><pre>{code}</pre><button className="primary-button" onClick={async () => { try { await navigator.clipboard.writeText(code); setToast('Component snippet copied.'); } catch { setToast('Clipboard unavailable. Select and copy the snippet above.'); } }}>Copy component snippet <Code2 size={16} /></button></>}</section></div>}
    </div>
  );
}

export default App;
