import { useState, useCallback } from 'react';
import PhotoUpload from './components/PhotoUpload';
import GridConfigPanel from './components/GridConfig';
import GridPreview from './components/GridPreview';
import type { PhotoItem, GridConfig } from './types';

const DEFAULT_CONFIG: GridConfig = {
  cols: 3,
  rows: 2,
  outputWidth: 1200,
  outputHeight: 800,
  fitMode: 'crop',
  gap: 4,
  backgroundColor: '#000000',
};

export default function App() {
  const [photos, setPhotos] = useState<PhotoItem[]>([]);
  const [config, setConfig] = useState<GridConfig>(DEFAULT_CONFIG);
  const [renderedCanvas, setRenderedCanvas] = useState<HTMLCanvasElement | null>(null);
  const [downloading, setDownloading] = useState(false);
  const [activeTab, setActiveTab] = useState<'upload' | 'config'>('upload');

  const handleRenderReady = useCallback((canvas: HTMLCanvasElement | null) => {
    setRenderedCanvas(canvas);
  }, []);

  const handleCropChange = useCallback((photoIndex: number, cropX: number, cropY: number) => {
    setPhotos((prev) =>
      prev.map((p, i) => (i === photoIndex ? { ...p, cropX, cropY } : p))
    );
  }, []);

  const handleSpanChange = useCallback(
    (photoIndex: number, spanX: number, spanY: number) => {
      setPhotos((prev) => {
        const old = prev[photoIndex];
        const deltaX = spanX - old.spanX;
        const deltaY = spanY - old.spanY;

        if (deltaX !== 0 || deltaY !== 0) {
          setConfig((c) => ({
            ...c,
            // Horizontal span (+deltaX) uses extra column-slots → compensate with more ROWS
            // Vertical span (+deltaY) uses extra row-slots → compensate with more COLS
            cols: Math.max(spanX, c.cols + deltaY),
            rows: Math.max(spanY, c.rows + deltaX),
          }));
        }

        return prev.map((p, i) => (i === photoIndex ? { ...p, spanX, spanY } : p));
      });
    },
    []
  );

  const handleDownload = async () => {
    if (!renderedCanvas) return;
    setDownloading(true);
    try {
      const blob = await new Promise<Blob>((resolve, reject) => {
        renderedCanvas.toBlob(
          (b) => (b ? resolve(b) : reject(new Error('blob failed'))),
          'image/png'
        );
      });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `gridder-${config.outputWidth}x${config.outputHeight}.png`;
      a.click();
      URL.revokeObjectURL(url);
    } finally {
      setDownloading(false);
    }
  };

  const canDownload = !!renderedCanvas && photos.length > 0;

  return (
    <div className="min-h-screen bg-slate-950 text-white">
      {/* Header */}
      <header className="border-b border-slate-800 bg-slate-900/80 backdrop-blur sticky top-0 z-20">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 h-14 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-7 h-7 rounded-lg bg-indigo-600 flex items-center justify-center">
              <svg className="w-4 h-4 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                  d="M4 5a1 1 0 011-1h4a1 1 0 011 1v4a1 1 0 01-1 1H5a1 1 0 01-1-1V5zm10 0a1 1 0 011-1h4a1 1 0 011 1v4a1 1 0 01-1 1h-4a1 1 0 01-1-1V5zM4 15a1 1 0 011-1h4a1 1 0 011 1v4a1 1 0 01-1 1H5a1 1 0 01-1-1v-4zm10 0a1 1 0 011-1h4a1 1 0 011 1v4a1 1 0 01-1 1h-4a1 1 0 01-1-1v-4z" />
              </svg>
            </div>
            <span className="font-bold text-lg tracking-tight">Gridder</span>
          </div>
          <button
            onClick={handleDownload}
            disabled={!canDownload || downloading}
            className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-all ${
              canDownload
                ? 'bg-indigo-600 hover:bg-indigo-500 text-white shadow-lg shadow-indigo-900/40'
                : 'bg-slate-800 text-slate-500 cursor-not-allowed'
            }`}
          >
            {downloading ? (
              <svg className="w-4 h-4 animate-spin" fill="none" viewBox="0 0 24 24">
                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
              </svg>
            ) : (
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                  d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
              </svg>
            )}
            {downloading ? 'Exporting…' : 'Export PNG'}
          </button>
        </div>
      </header>

      <main className="max-w-7xl mx-auto px-4 sm:px-6 py-6">
        <div className="grid grid-cols-1 lg:grid-cols-[380px_1fr] gap-6">
          {/* Left panel */}
          <div className="flex flex-col gap-4">
            {/* Mobile tabs */}
            <div className="flex lg:hidden gap-2 p-1 bg-slate-800 rounded-xl">
              {(['upload', 'config'] as const).map((tab) => (
                <button
                  key={tab}
                  onClick={() => setActiveTab(tab)}
                  className={`flex-1 py-2 text-sm font-medium rounded-lg transition-colors capitalize ${
                    activeTab === tab ? 'bg-slate-700 text-white' : 'text-slate-400 hover:text-slate-200'
                  }`}
                >
                  {tab === 'upload' ? `Photos (${photos.length})` : 'Settings'}
                </button>
              ))}
            </div>

            <div className={activeTab !== 'upload' ? 'hidden lg:block' : ''}>
              <section className="bg-slate-900 rounded-xl p-4 border border-slate-800">
                <h2 className="text-sm font-semibold text-slate-300 uppercase tracking-wider mb-3">
                  Photos ({photos.length})
                </h2>
                <PhotoUpload photos={photos} onChange={setPhotos} />
              </section>
            </div>

            <div className={activeTab !== 'config' ? 'hidden lg:block' : ''}>
              <section className="bg-slate-900 rounded-xl p-4 border border-slate-800">
                <h2 className="text-sm font-semibold text-slate-300 uppercase tracking-wider mb-4">
                  Settings
                </h2>
                <GridConfigPanel photos={photos} config={config} onChange={setConfig} />
              </section>
            </div>
          </div>

          {/* Right panel — preview */}
          <div className="flex flex-col gap-4">
            <section className="bg-slate-900 rounded-xl p-4 border border-slate-800 flex-1">
              <div className="flex items-center justify-between mb-4">
                <h2 className="text-sm font-semibold text-slate-300 uppercase tracking-wider">Preview</h2>
                {canDownload && (
                  <button
                    onClick={handleDownload}
                    disabled={downloading}
                    className="text-xs text-indigo-400 hover:text-indigo-300 transition-colors flex items-center gap-1"
                  >
                    <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                        d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
                    </svg>
                    Download
                  </button>
                )}
              </div>
              <GridPreview
                photos={photos}
                config={config}
                onRenderReady={handleRenderReady}
                onCropChange={handleCropChange}
                onSpanChange={handleSpanChange}
              />
            </section>

            {photos.length > 0 && (
              <div className="grid grid-cols-3 gap-3">
                {[
                  { label: 'Photos', value: photos.length },
                  { label: 'Grid', value: `${config.cols}×${config.rows}` },
                  { label: 'Output', value: `${config.outputWidth}×${config.outputHeight}` },
                ].map((stat) => (
                  <div key={stat.label} className="bg-slate-900 rounded-xl p-3 border border-slate-800 text-center">
                    <p className="text-lg font-bold text-white">{stat.value}</p>
                    <p className="text-xs text-slate-400">{stat.label}</p>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </main>
    </div>
  );
}
