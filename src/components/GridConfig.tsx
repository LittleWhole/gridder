import { useState, useEffect, useRef } from 'react';
import type { GridConfig, PhotoItem } from '../types';
import { parseAspectRatio, getAverageAspectRatio, gcd, cellSize } from '../utils/imageUtils';

interface Props {
  photos: PhotoItem[];
  config: GridConfig;
  onChange: (config: GridConfig) => void;
}

const FIT_MODES = [
  { value: 'crop', label: 'Crop & Fill', desc: 'Center-crop each photo to fill the cell — drag to reposition in preview' },
  { value: 'fit', label: 'Fit (Letterbox)', desc: 'Scale photo to fit, adding background bars' },
  { value: 'stretch', label: 'Stretch', desc: 'Stretch photo to fill, ignoring aspect ratio' },
] as const;

function parsePosInt(s: string): number | undefined {
  if (s.trim() === '') return undefined;
  const n = parseInt(s, 10);
  return isNaN(n) || n <= 0 ? undefined : n;
}

function toRatioString(w: number, h: number): string {
  if (w <= 0 || h <= 0) return '—';
  const d = gcd(Math.round(w), Math.round(h));
  const rw = Math.round(w) / d;
  const rh = Math.round(h) / d;
  if (rw <= 64 && rh <= 64) return `${rw}:${rh}`;
  return `${(w / h).toFixed(3)}:1`;
}

function cp(commit: () => void) {
  return {
    onBlur: commit,
    onKeyDown: (e: React.KeyboardEvent) => { if (e.key === 'Enter') commit(); },
  };
}

export default function GridConfigPanel({ photos, config, onChange }: Props) {
  const set = (partial: Partial<GridConfig>) => onChange({ ...config, ...partial });

  const [colsStr, setColsStr] = useState(String(config.cols));
  const [rowsStr, setRowsStr] = useState(String(config.rows));
  const [outWStr, setOutWStr] = useState(String(config.outputWidth));
  const [outHStr, setOutHStr] = useState(String(config.outputHeight));
  const [gapStr, setGapStr] = useState(String(config.gap));
  const [arStr, setArStr] = useState('');
  const [arError, setArError] = useState('');
  const arFocused = useRef(false);
  const colsFocused = useRef(false);
  const rowsFocused = useRef(false);

  // Sync cols/rows textboxes when config changes externally (e.g. span compensation)
  useEffect(() => {
    if (!colsFocused.current) setColsStr(String(config.cols));
  }, [config.cols]);
  useEffect(() => {
    if (!rowsFocused.current) setRowsStr(String(config.rows));
  }, [config.rows]);

  // Keep AR field reflecting actual cell ratio when not being edited
  const { cellWidth, cellHeight } = cellSize(config);
  useEffect(() => {
    if (!arFocused.current) setArStr(toRatioString(cellWidth, cellHeight));
  }, [cellWidth, cellHeight]);

  // ── Commits ──────────────────────────────────────────────────────────────

  const commitOutW = () => {
    const w = parsePosInt(outWStr);
    if (!w) { setOutWStr(String(config.outputWidth)); return; }
    set({ outputWidth: w });
  };

  const commitOutH = () => {
    const h = parsePosInt(outHStr);
    if (!h) { setOutHStr(String(config.outputHeight)); return; }
    set({ outputHeight: h });
  };

  const commitCols = () => {
    const n = Math.max(1, Math.min(parsePosInt(colsStr) ?? config.cols, 20));
    setColsStr(String(n));
    set({ cols: n });
    // Output dims unchanged — cell size is re-derived automatically
  };

  const commitRows = () => {
    const n = Math.max(1, Math.min(parsePosInt(rowsStr) ?? config.rows, 20));
    setRowsStr(String(n));
    set({ rows: n });
  };

  const commitGap = () => {
    const n = Math.max(0, parseInt(gapStr, 10) || 0);
    setGapStr(String(n));
    set({ gap: n });
  };

  // Apply AR: keep outputWidth fixed, derive outputHeight so cell AR matches
  const applyAR = (str: string) => {
    const ratio = parseAspectRatio(str);
    if (!ratio) { setArError('Use W:H format, e.g. 16:9'); return; }
    setArError('');
    const { cellWidth: cw } = cellSize(config);
    // target cellH = cw * ratio.h / ratio.w
    const targetCellH = (cw * ratio.h) / ratio.w;
    const newOutH = Math.round(config.rows * targetCellH + (config.rows - 1) * config.gap);
    setOutHStr(String(newOutH));
    set({ outputHeight: newOutH });
  };

  const applyFromImages = () => {
    if (!photos.length) return;
    const avg = getAverageAspectRatio(photos);
    applyAR(`${avg.w}:${avg.h}`);
  };

  // ── Derived display ───────────────────────────────────────────────────────
  const totalCells = config.cols * config.rows;
  const photosPlaced = Math.min(photos.length, totalCells);
  const derivedCellW = cellWidth.toFixed(1);
  const derivedCellH = cellHeight.toFixed(1);
  const cellRatio = toRatioString(cellWidth, cellHeight);

  const inputCls = 'bg-slate-800 border border-slate-700 rounded-lg px-3 py-2 text-white text-sm focus:outline-none focus:border-indigo-500 transition-colors w-full';
  const readonlyCls = 'bg-slate-800/50 border border-slate-700/50 rounded-lg px-3 py-2 text-slate-400 text-sm w-full cursor-default select-none';

  return (
    <div className="flex flex-col gap-6">

      {/* ── Output Dimensions (supreme) ── */}
      <div className="flex flex-col gap-3">
        <div className="flex items-center gap-2">
          <h3 className="text-sm font-semibold text-slate-300 uppercase tracking-wider">Output Size</h3>
          <span className="text-[10px] font-bold text-indigo-400 uppercase tracking-wider px-1.5 py-0.5 bg-indigo-900/40 rounded border border-indigo-800/50">Supreme</span>
        </div>
        <div className="grid grid-cols-2 gap-3">
          <label className="flex flex-col gap-1">
            <span className="text-xs text-slate-400">Width (px)</span>
            <input type="number" min={1} value={outWStr}
              onChange={(e) => setOutWStr(e.target.value)}
              {...cp(commitOutW)}
              className={inputCls} />
          </label>
          <label className="flex flex-col gap-1">
            <span className="text-xs text-slate-400">Height (px)</span>
            <input type="number" min={1} value={outHStr}
              onChange={(e) => setOutHStr(e.target.value)}
              {...cp(commitOutH)}
              className={inputCls} />
          </label>
        </div>

        {/* AR helper */}
        <div className="flex flex-col gap-1.5 p-3 rounded-lg bg-slate-800/60 border border-slate-700/50">
          <span className="text-xs text-slate-400">Aspect Ratio shortcut — adjusts output height to match</span>
          <div className="flex gap-2 items-start">
            <div className="flex-1 flex flex-col gap-1">
              <input
                value={arStr}
                onChange={(e) => setArStr(e.target.value)}
                onFocus={() => { arFocused.current = true; }}
                onBlur={() => { arFocused.current = false; applyAR(arStr); }}
                onKeyDown={(e) => { if (e.key === 'Enter') applyAR(arStr); }}
                placeholder="e.g. 16:9"
                className="bg-slate-900 border border-slate-700 rounded-lg px-3 py-2 text-white text-sm focus:outline-none focus:border-indigo-500 transition-colors w-full"
              />
              {arError && <p className="text-xs text-red-400">{arError}</p>}
            </div>
            <button onClick={() => applyAR(arStr)}
              className="px-3 py-2 bg-slate-700 hover:bg-slate-600 text-slate-200 text-sm rounded-lg transition-colors whitespace-nowrap">
              Apply
            </button>
            {photos.length > 0 && (
              <button onClick={applyFromImages}
                className="px-3 py-2 bg-slate-700 hover:bg-slate-600 text-slate-200 text-sm rounded-lg transition-colors whitespace-nowrap">
                From photos
              </button>
            )}
          </div>
        </div>
      </div>

      {/* ── Grid Layout ── */}
      <div className="flex flex-col gap-3">
        <h3 className="text-sm font-semibold text-slate-300 uppercase tracking-wider">Grid Layout</h3>
        <div className="grid grid-cols-2 gap-3">
          <label className="flex flex-col gap-1">
            <span className="text-xs text-slate-400">Columns</span>
            <input type="number" min={1} max={20} value={colsStr}
              onChange={(e) => setColsStr(e.target.value)}
              onFocus={() => { colsFocused.current = true; }}
              onBlur={() => { colsFocused.current = false; commitCols(); }}
              onKeyDown={(e) => { if (e.key === 'Enter') commitCols(); }}
              className={inputCls} />
          </label>
          <label className="flex flex-col gap-1">
            <span className="text-xs text-slate-400">Rows</span>
            <input type="number" min={1} max={20} value={rowsStr}
              onChange={(e) => setRowsStr(e.target.value)}
              onFocus={() => { rowsFocused.current = true; }}
              onBlur={() => { rowsFocused.current = false; commitRows(); }}
              onKeyDown={(e) => { if (e.key === 'Enter') commitRows(); }}
              className={inputCls} />
          </label>
        </div>
        <label className="flex flex-col gap-1">
          <span className="text-xs text-slate-400">Gap between cells (px)</span>
          <input type="number" min={0} max={200} value={gapStr}
            onChange={(e) => setGapStr(e.target.value)}
            {...cp(commitGap)}
            className={inputCls} />
        </label>
        <div className="flex items-center justify-between text-xs text-slate-500 px-1">
          <span>{config.cols} × {config.rows} = {totalCells} cells</span>
          {photos.length > 0 && (
            <span className={photosPlaced < totalCells ? 'text-amber-400' : 'text-emerald-400'}>
              {photosPlaced}/{totalCells} filled{photosPlaced < totalCells ? ' — some empty' : ''}
            </span>
          )}
        </div>
      </div>

      {/* ── Derived cell info ── */}
      <div className="flex flex-col gap-2 p-3 rounded-lg bg-slate-800/40 border border-slate-700/40">
        <span className="text-xs font-medium text-slate-400 uppercase tracking-wider">Derived Cell Size</span>
        <div className="grid grid-cols-2 gap-3">
          <div className="flex flex-col gap-1">
            <span className="text-xs text-slate-500">Cell Width</span>
            <div className={readonlyCls}>{derivedCellW} px</div>
          </div>
          <div className="flex flex-col gap-1">
            <span className="text-xs text-slate-500">Cell Height</span>
            <div className={readonlyCls}>{derivedCellH} px</div>
          </div>
        </div>
        <p className="text-xs text-slate-600">Cell ratio: {cellRatio} — cell size adjusts automatically to fill output</p>
      </div>

      {/* ── Photo Fitting ── */}
      <div className="flex flex-col gap-3">
        <h3 className="text-sm font-semibold text-slate-300 uppercase tracking-wider">Photo Fitting</h3>
        <div className="flex flex-col gap-2">
          {FIT_MODES.map((mode) => (
            <label key={mode.value}
              className={`flex items-start gap-3 p-3 rounded-lg border cursor-pointer transition-colors ${
                config.fitMode === mode.value
                  ? 'border-indigo-500 bg-indigo-950/40'
                  : 'border-slate-700 bg-slate-800/50 hover:border-slate-600'
              }`}
            >
              <input type="radio" name="fitMode" value={mode.value}
                checked={config.fitMode === mode.value}
                onChange={() => set({ fitMode: mode.value })}
                className="mt-0.5 accent-indigo-500" />
              <div>
                <p className="text-sm font-medium text-slate-200">{mode.label}</p>
                <p className="text-xs text-slate-400">{mode.desc}</p>
              </div>
            </label>
          ))}
        </div>
      </div>

      {/* ── Background ── */}
      <div className="flex flex-col gap-3">
        <h3 className="text-sm font-semibold text-slate-300 uppercase tracking-wider">Background</h3>
        <div className="flex gap-2 items-center">
          <input type="color" value={config.backgroundColor}
            onChange={(e) => set({ backgroundColor: e.target.value })}
            className="h-9 w-12 rounded cursor-pointer bg-transparent border border-slate-700 p-0.5" />
          <input type="text" value={config.backgroundColor}
            onChange={(e) => set({ backgroundColor: e.target.value })}
            className="flex-1 bg-slate-800 border border-slate-700 rounded-lg px-3 py-2 text-white text-sm font-mono focus:outline-none focus:border-indigo-500 transition-colors" />
        </div>
      </div>
    </div>
  );
}
