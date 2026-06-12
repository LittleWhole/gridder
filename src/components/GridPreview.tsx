import { useEffect, useRef, useState, useCallback, useMemo } from 'react';
import { createPortal } from 'react-dom';
import type { PhotoItem, GridConfig } from '../types';
import { renderGrid, cellSize, computeLayout, drawPhotoInCell } from '../utils/imageUtils';

interface Props {
  photos: PhotoItem[];
  config: GridConfig;
  onRenderReady: (canvas: HTMLCanvasElement | null) => void;
  onCropChange: (photoIndex: number, cropX: number, cropY: number) => void;
  onSpanChange: (photoIndex: number, spanX: number, spanY: number) => void;
}

interface PreviewInfo {
  displayW: number;
  displayH: number;
  scale: number;
}

interface ContextMenuState {
  x: number;
  y: number;
  photoIndex: number;
  currentSpanX: number;
  currentSpanY: number;
}

interface DragState {
  photoIndex: number;
  startMouseX: number;
  startMouseY: number;
  startCropX: number;
  startCropY: number;
  currentCropX: number;
  currentCropY: number;
  cellDisplayW: number;
  cellDisplayH: number;
}

// ── Context Menu ──────────────────────────────────────────────────────────────

function CellContextMenu({
  state,
  onSpanChange,
  onClose,
}: {
  state: ContextMenuState;
  onSpanChange: (spanX: number, spanY: number) => void;
  onClose: () => void;
}) {
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const down = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) onClose();
    };
    const esc = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    document.addEventListener('mousedown', down);
    document.addEventListener('keydown', esc);
    return () => {
      document.removeEventListener('mousedown', down);
      document.removeEventListener('keydown', esc);
    };
  }, [onClose]);

  const Btn = ({ label, active, onClick }: { label: string; active: boolean; onClick: () => void }) => (
    <button
      onClick={() => { onClick(); onClose(); }}
      className={`px-2.5 py-1 text-xs rounded font-medium transition-colors ${
        active ? 'bg-indigo-600 text-white' : 'bg-slate-700 text-slate-300 hover:bg-slate-600'
      }`}
    >
      {label}
    </button>
  );

  return createPortal(
    <div
      ref={ref}
      style={{ position: 'fixed', left: state.x, top: state.y, zIndex: 9999 }}
      className="bg-slate-900 border border-slate-700 rounded-xl shadow-2xl p-3 w-52 flex flex-col gap-3"
      onContextMenu={(e) => e.preventDefault()}
    >
      <p className="text-xs font-semibold text-slate-400 uppercase tracking-wider">
        Photo {state.photoIndex + 1} — Cell Span
      </p>
      <div className="flex flex-col gap-1.5">
        <span className="text-xs text-slate-500">Horizontal (columns)</span>
        <div className="flex gap-1.5 flex-wrap">
          {[1, 2, 3, 4].map((n) => (
            <Btn key={n} label={`${n}×`} active={state.currentSpanX === n}
              onClick={() => onSpanChange(n, state.currentSpanY)} />
          ))}
        </div>
      </div>
      <div className="flex flex-col gap-1.5">
        <span className="text-xs text-slate-500">Vertical (rows)</span>
        <div className="flex gap-1.5 flex-wrap">
          {[1, 2, 3, 4].map((n) => (
            <Btn key={n} label={`${n}↕`} active={state.currentSpanY === n}
              onClick={() => onSpanChange(state.currentSpanX, n)} />
          ))}
        </div>
      </div>
      {(state.currentSpanX > 1 || state.currentSpanY > 1) && (
        <button onClick={() => { onSpanChange(1, 1); onClose(); }}
          className="text-xs text-red-400 hover:text-red-300 text-left transition-colors">
          Reset to 1×1
        </button>
      )}
    </div>,
    document.body
  );
}

// ── Main ──────────────────────────────────────────────────────────────────────

export default function GridPreview({ photos, config, onRenderReady, onCropChange, onSpanChange }: Props) {
  const containerRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [rendering, setRendering] = useState(false);
  const [error, setError] = useState('');
  const [previewInfo, setPreviewInfo] = useState<PreviewInfo | null>(null);
  const [draggingIndex, setDraggingIndex] = useState<number | null>(null);
  const [contextMenu, setContextMenu] = useState<ContextMenuState | null>(null);

  // Stable refs — safe to read inside RAF / event handlers without stale closures
  const configRef = useRef(config);
  const photosRef = useRef(photos);
  const previewInfoRef = useRef<PreviewInfo | null>(null);
  const loadedImagesRef = useRef(new Map<string, HTMLImageElement>());
  const dragRef = useRef<DragState | null>(null);
  const rafRef = useRef<number | null>(null);
  const renderIdRef = useRef(0);

  useEffect(() => { configRef.current = config; }, [config]);
  useEffect(() => { photosRef.current = photos; }, [photos]);

  // Layout is cheap to compute synchronously — always immediately up-to-date
  const layout = useMemo(
    () => computeLayout(photos, config.cols),
    [photos, config.cols]
  );

  // Preload images into a ref-based cache so RAF callbacks can access them synchronously
  useEffect(() => {
    const cache = loadedImagesRef.current;
    const liveIds = new Set(photos.map((p) => p.id));
    cache.forEach((_, id) => { if (!liveIds.has(id)) cache.delete(id); });
    photos.forEach((photo) => {
      if (!cache.has(photo.id)) {
        const img = new Image();
        img.onload = () => cache.set(photo.id, img);
        img.src = photo.url;
      }
    });
  }, [photos]);

  // ── Full canvas render (debounced, only triggers on real changes) ──────────
  const doRender = useCallback(async () => {
    if (photos.length === 0) {
      onRenderReady(null);
      setPreviewInfo(null);
      previewInfoRef.current = null;
      return;
    }
    const renderId = ++renderIdRef.current;
    setRendering(true);
    setError('');
    try {
      const canvas = await renderGrid(photos, config);
      if (renderId !== renderIdRef.current) return;

      const container = containerRef.current;
      if (!container || !canvasRef.current) return;

      const maxW = container.clientWidth;
      const maxH = Math.min(container.clientWidth * 1.5, 600);
      const scale = Math.min(maxW / canvas.width, maxH / canvas.height, 1);
      const displayW = Math.round(canvas.width * scale);
      const displayH = Math.round(canvas.height * scale);

      const pc = canvasRef.current;
      pc.width = displayW;
      pc.height = displayH;
      pc.getContext('2d')!.drawImage(canvas, 0, 0, displayW, displayH);

      const info: PreviewInfo = { displayW, displayH, scale };
      setPreviewInfo(info);
      previewInfoRef.current = info;
      onRenderReady(canvas);
    } catch {
      setError('Failed to render grid. Please check your images.');
      onRenderReady(null);
    } finally {
      setRendering(false);
    }
  }, [photos, config, onRenderReady]);

  useEffect(() => {
    // Don't re-render while user is dragging — the RAF path handles the visual update
    if (dragRef.current) return;
    const t = setTimeout(doRender, 150);
    return () => clearTimeout(t);
  }, [doRender]);

  // ── RAF cell redraw — draws directly on preview canvas, zero React overhead ──
  const redrawCell = useCallback((photoIndex: number, cropX: number, cropY: number) => {
    const canvas = canvasRef.current;
    const pInfo = previewInfoRef.current;
    if (!canvas || !pInfo) return;

    const cfg = configRef.current;
    const currentPhotos = photosRef.current;
    const cell = computeLayout(currentPhotos, cfg.cols).find((c) => c.photoIndex === photoIndex);
    if (!cell) return;

    const img = loadedImagesRef.current.get(currentPhotos[photoIndex].id);
    if (!img) return;

    const ctx = canvas.getContext('2d')!;
    const s = pInfo.scale;
    const { cellWidth, cellHeight } = cellSize(cfg);
    const cw = cellWidth * s;
    const ch = cellHeight * s;
    const gapD = cfg.gap * s;

    const x = cell.col * (cw + gapD);
    const y = cell.row * (ch + gapD);
    const w = cell.spanX * cw + (cell.spanX - 1) * gapD;
    const h = cell.spanY * ch + (cell.spanY - 1) * gapD;

    drawPhotoInCell(ctx, img, x, y, w, h, cfg.fitMode, cfg.backgroundColor, cropX, cropY);
  }, []);

  // ── Drag handlers ─────────────────────────────────────────────────────────
  const handleCellMouseDown = useCallback((
    e: React.MouseEvent,
    photoIndex: number,
    cellDisplayW: number,
    cellDisplayH: number,
  ) => {
    if (configRef.current.fitMode !== 'crop' || e.button !== 0) return;
    e.preventDefault();
    const photo = photosRef.current[photoIndex];
    if (!photo) return;
    dragRef.current = {
      photoIndex,
      startMouseX: e.clientX,
      startMouseY: e.clientY,
      startCropX: photo.cropX,
      startCropY: photo.cropY,
      currentCropX: photo.cropX,
      currentCropY: photo.cropY,
      cellDisplayW,
      cellDisplayH,
    };
    setDraggingIndex(photoIndex);
  }, []);

  useEffect(() => {
    const onMove = (e: MouseEvent) => {
      const d = dragRef.current;
      if (!d) return;

      const dx = e.clientX - d.startMouseX;
      const dy = e.clientY - d.startMouseY;
      d.currentCropX = Math.max(0, Math.min(1, d.startCropX - dx / d.cellDisplayW));
      d.currentCropY = Math.max(0, Math.min(1, d.startCropY - dy / d.cellDisplayH));

      if (rafRef.current !== null) cancelAnimationFrame(rafRef.current);
      rafRef.current = requestAnimationFrame(() => {
        redrawCell(d.photoIndex, d.currentCropX, d.currentCropY);
        rafRef.current = null;
      });
    };

    const onUp = () => {
      const d = dragRef.current;
      if (d) {
        // Commit final crop to parent state (triggers full re-render once)
        onCropChange(d.photoIndex, d.currentCropX, d.currentCropY);
        dragRef.current = null;
      }
      setDraggingIndex(null);
    };

    document.addEventListener('mousemove', onMove);
    document.addEventListener('mouseup', onUp);
    return () => {
      document.removeEventListener('mousemove', onMove);
      document.removeEventListener('mouseup', onUp);
    };
  }, [onCropChange, redrawCell]);

  // ── Render ────────────────────────────────────────────────────────────────
  if (photos.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center h-64 rounded-xl border border-dashed border-slate-700 text-slate-500">
        <svg className="w-12 h-12 mb-2 opacity-40" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1}
            d="M4 5a1 1 0 011-1h14a1 1 0 011 1v2a1 1 0 01-1 1H5a1 1 0 01-1-1V5zM4 13a1 1 0 011-1h6a1 1 0 011 1v6a1 1 0 01-1 1H5a1 1 0 01-1-1v-6zM16 13a1 1 0 011-1h2a1 1 0 011 1v6a1 1 0 01-1 1h-2a1 1 0 01-1-1v-6z" />
        </svg>
        <p className="text-sm">Upload photos to see the grid preview</p>
      </div>
    );
  }

  const { cellWidth, cellHeight } = cellSize(config);
  const canCrop = config.fitMode === 'crop';

  return (
    <div ref={containerRef} className="flex flex-col items-center gap-3">
      <div className="flex items-center gap-4 self-start text-xs text-slate-500">
        {canCrop && (
          <span className="text-indigo-400 flex items-center gap-1">
            <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                d="M7 11.5V14m0-2.5v-6a1.5 1.5 0 113 0m-3 6a1.5 1.5 0 00-3 0v2a7.5 7.5 0 0015 0v-5a1.5 1.5 0 00-3 0m-6-3V11m0-5.5v-1a1.5 1.5 0 013 0v1m0 0V11m0-5.5a1.5 1.5 0 013 0v3m0 0V11" />
            </svg>
            Left-drag to reposition
          </span>
        )}
        <span className="flex items-center gap-1">
          <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
              d="M4 6h16M4 12h16M4 18h7" />
          </svg>
          Right-click to set span
        </span>
      </div>

      <div className="relative">
        {rendering && (
          <div className="absolute inset-0 flex items-center justify-center bg-slate-900/60 rounded-xl z-20">
            <div className="flex items-center gap-2 text-slate-300 text-sm">
              <svg className="w-4 h-4 animate-spin" fill="none" viewBox="0 0 24 24">
                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
              </svg>
              Rendering…
            </div>
          </div>
        )}
        {error && <p className="text-sm text-red-400 mb-2">{error}</p>}

        <canvas ref={canvasRef} className="rounded-lg shadow-2xl block" />

        {previewInfo && layout.length > 0 && (
          <div
            className="absolute top-0 left-0 rounded-lg overflow-hidden pointer-events-none"
            style={{ width: previewInfo.displayW, height: previewInfo.displayH }}
          >
            {layout.map((cell) => {
              if (cell.photoIndex >= photos.length) return null;

              const s = previewInfo.scale;
              const cw = cellWidth * s;
              const ch = cellHeight * s;
              const gapD = config.gap * s;

              const x = cell.col * (cw + gapD);
              const y = cell.row * (ch + gapD);
              const w = cell.spanX * cw + (cell.spanX - 1) * gapD;
              const h = cell.spanY * ch + (cell.spanY - 1) * gapD;

              const isDragging = draggingIndex === cell.photoIndex;
              const photo = photos[cell.photoIndex];
              const hasSpan = photo.spanX > 1 || photo.spanY > 1;

              return (
                <div
                  key={cell.photoIndex}
                  onMouseDown={(e) => handleCellMouseDown(e, cell.photoIndex, w, h)}
                  onContextMenu={(e) => {
                    e.preventDefault();
                    setContextMenu({
                      x: e.clientX,
                      y: e.clientY,
                      photoIndex: cell.photoIndex,
                      currentSpanX: photo.spanX,
                      currentSpanY: photo.spanY,
                    });
                  }}
                  style={{
                    position: 'absolute',
                    left: x, top: y, width: w, height: h,
                    pointerEvents: 'auto',
                    cursor: canCrop ? (isDragging ? 'grabbing' : 'grab') : 'context-menu',
                    boxSizing: 'border-box',
                  }}
                  className={`transition-[box-shadow] group ${
                    isDragging
                      ? 'ring-2 ring-indigo-400 ring-inset'
                      : 'hover:ring-2 hover:ring-white/30 hover:ring-inset'
                  }`}
                >
                  {hasSpan && (
                    <div className="absolute top-1.5 left-1.5 flex gap-1 pointer-events-none">
                      {photo.spanX > 1 && (
                        <span className="text-[10px] font-bold text-white bg-indigo-600/80 rounded px-1 backdrop-blur-sm">
                          {photo.spanX}×
                        </span>
                      )}
                      {photo.spanY > 1 && (
                        <span className="text-[10px] font-bold text-white bg-violet-600/80 rounded px-1 backdrop-blur-sm">
                          ↕{photo.spanY}
                        </span>
                      )}
                    </div>
                  )}
                  {!isDragging && (
                    <div className="absolute inset-0 flex items-end justify-center pb-2 opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none">
                      <span className="text-[10px] text-white bg-black/60 rounded px-1.5 py-0.5 backdrop-blur-sm">
                        {canCrop ? 'drag · right-click' : 'right-click to span'}
                      </span>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>

      <p className="text-xs text-slate-500">
        Output: {config.outputWidth} × {config.outputHeight} px
        {' · '}Cell: {cellWidth.toFixed(0)} × {cellHeight.toFixed(0)} px
      </p>

      {contextMenu && (
        <CellContextMenu
          state={contextMenu}
          onSpanChange={(sx, sy) => onSpanChange(contextMenu.photoIndex, sx, sy)}
          onClose={() => setContextMenu(null)}
        />
      )}
    </div>
  );
}
