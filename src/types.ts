export interface PhotoItem {
  id: string;
  file: File;
  url: string;
  naturalWidth: number;
  naturalHeight: number;
  cropX: number; // 0–1, 0 = left/top edge, 0.5 = center, 1 = right/bottom edge
  cropY: number;
  spanX: number; // columns this cell spans (default 1)
  spanY: number; // rows this cell spans (default 1)
}

export type FitMode = 'crop' | 'fit' | 'stretch';

export interface GridConfig {
  cols: number;
  rows: number;
  /** Total canvas output size — the supreme constraint */
  outputWidth: number;
  outputHeight: number;
  fitMode: FitMode;
  gap: number;
  backgroundColor: string;
}
