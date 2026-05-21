import type { PhotoItem, GridConfig } from '../types';

export function loadImage(url: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = reject;
    img.src = url;
  });
}

export function gcd(a: number, b: number): number {
  return b === 0 ? a : gcd(b, a % b);
}

export function parseAspectRatio(str: string): { w: number; h: number } | null {
  const parts = str.split(':').map((s) => parseFloat(s.trim()));
  if (parts.length === 2 && parts.every((n) => !isNaN(n) && n > 0)) {
    return { w: parts[0], h: parts[1] };
  }
  return null;
}

export function dimensionsFromAspectRatio(
  arW: number,
  arH: number,
  baseSize = 800
): { w: number; h: number } {
  if (arW >= arH) {
    return { w: baseSize, h: Math.round((baseSize * arH) / arW) };
  } else {
    return { h: baseSize, w: Math.round((baseSize * arW) / arH) };
  }
}

export function getAverageAspectRatio(photos: PhotoItem[]): { w: number; h: number } {
  if (photos.length === 0) return { w: 1, h: 1 };
  const avgRatio =
    photos.reduce((sum, p) => sum + p.naturalWidth / p.naturalHeight, 0) / photos.length;
  const h = 100;
  const w = Math.round(avgRatio * h);
  const d = gcd(w, h);
  return { w: w / d, h: h / d };
}

/** Derived cell unit size from the supreme output dimensions */
export function cellSize(config: GridConfig): { cellWidth: number; cellHeight: number } {
  const cellWidth = (config.outputWidth - config.gap * (config.cols - 1)) / config.cols;
  const cellHeight = (config.outputHeight - config.gap * (config.rows - 1)) / config.rows;
  return { cellWidth, cellHeight };
}

// ── Layout algorithm ──────────────────────────────────────────────────────────

export interface CellLayout {
  photoIndex: number;
  row: number;
  col: number;
  spanX: number;
  spanY: number;
}

/**
 * CSS-grid-style placement: scan left-to-right, top-to-bottom,
 * find the first slot where a spanX×spanY block fits.
 */
export function computeLayout(photos: PhotoItem[], cols: number): CellLayout[] {
  // Use a Set of "row,col" strings as occupied map
  const occupied = new Set<string>();
  const layout: CellLayout[] = [];

  const key = (r: number, c: number) => `${r},${c}`;
  const isOcc = (r: number, c: number) => occupied.has(key(r, c));

  const markOcc = (r: number, c: number, sx: number, sy: number) => {
    for (let dr = 0; dr < sy; dr++)
      for (let dc = 0; dc < sx; dc++)
        occupied.add(key(r + dr, c + dc));
  };

  for (let i = 0; i < photos.length; i++) {
    const photo = photos[i];
    const sx = Math.max(1, photo.spanX);
    const sy = Math.max(1, photo.spanY);
    // A photo can't span more columns than the grid has
    const effectiveSx = Math.min(sx, Math.max(cols, sx));

    let placed = false;
    for (let row = 0; !placed && row < 500; row++) {
      for (let col = 0; col <= cols - effectiveSx; col++) {
        let fits = true;
        outer: for (let dr = 0; dr < sy; dr++) {
          for (let dc = 0; dc < effectiveSx; dc++) {
            if (isOcc(row + dr, col + dc)) { fits = false; break outer; }
          }
        }
        if (fits) {
          layout.push({ photoIndex: i, row, col, spanX: effectiveSx, spanY: sy });
          markOcc(row, col, effectiveSx, sy);
          placed = true;
          break;
        }
      }
    }
    // If not placed (safety), push at end — won't be visible but won't crash
    if (!placed) layout.push({ photoIndex: i, row: 9999, col: 0, spanX: effectiveSx, spanY: sy });
  }

  return layout;
}

// ── Drawing ───────────────────────────────────────────────────────────────────

export function drawPhotoInCell(
  ctx: CanvasRenderingContext2D,
  img: HTMLImageElement,
  cellX: number,
  cellY: number,
  cellW: number,
  cellH: number,
  fitMode: GridConfig['fitMode'],
  bgColor: string,
  cropX = 0.5,
  cropY = 0.5
) {
  ctx.fillStyle = bgColor;
  ctx.fillRect(cellX, cellY, cellW, cellH);

  const imgW = img.naturalWidth;
  const imgH = img.naturalHeight;

  if (fitMode === 'stretch') {
    ctx.drawImage(img, cellX, cellY, cellW, cellH);
    return;
  }

  const cellRatio = cellW / cellH;
  const imgRatio = imgW / imgH;

  let srcX = 0, srcY = 0, srcW = imgW, srcH = imgH;
  let dstX = cellX, dstY = cellY, dstW = cellW, dstH = cellH;

  if (fitMode === 'crop') {
    if (imgRatio > cellRatio) {
      srcH = imgH;
      srcW = imgH * cellRatio;
      srcX = (imgW - srcW) * cropX;
    } else {
      srcW = imgW;
      srcH = imgW / cellRatio;
      srcY = (imgH - srcH) * cropY;
    }
  } else {
    // fit / letterbox
    if (imgRatio > cellRatio) {
      dstW = cellW;
      dstH = cellW / imgRatio;
      dstX = cellX;
      dstY = cellY + (cellH - dstH) / 2;
    } else {
      dstH = cellH;
      dstW = cellH * imgRatio;
      dstX = cellX + (cellW - dstW) / 2;
      dstY = cellY;
    }
  }

  ctx.drawImage(img, srcX, srcY, srcW, srcH, dstX, dstY, dstW, dstH);
}

export async function renderGrid(
  photos: PhotoItem[],
  config: GridConfig
): Promise<HTMLCanvasElement> {
  const { cols, rows, outputWidth, outputHeight, fitMode, gap, backgroundColor } = config;
  const { cellWidth, cellHeight } = cellSize(config);

  const layout = computeLayout(photos, cols);

  // Determine actual rows used (may exceed config.rows if spans push beyond)
  const usedRows = layout.reduce((max, l) => Math.max(max, l.row + l.spanY), rows);

  // If layout overflows configured rows, recompute cellHeight based on actual rows
  const actualRows = usedRows;
  const actualCellH = actualRows > rows
    ? (outputHeight - gap * (actualRows - 1)) / actualRows
    : cellHeight;

  const canvas = document.createElement('canvas');
  canvas.width = outputWidth;
  canvas.height = actualRows > rows
    ? actualRows * actualCellH + (actualRows - 1) * gap
    : outputHeight;

  const ctx = canvas.getContext('2d')!;
  ctx.fillStyle = backgroundColor;
  ctx.fillRect(0, 0, canvas.width, canvas.height);

  const images = await Promise.all(photos.map((p) => loadImage(p.url)));

  for (const cell of layout) {
    const photo = photos[cell.photoIndex];
    const img = images[cell.photoIndex];

    const cellX = cell.col * (cellWidth + gap);
    const cellY = cell.row * (actualCellH + gap);
    const cellW = cell.spanX * cellWidth + (cell.spanX - 1) * gap;
    const cellH = cell.spanY * actualCellH + (cell.spanY - 1) * gap;

    drawPhotoInCell(
      ctx, img,
      cellX, cellY, cellW, cellH,
      fitMode, backgroundColor,
      photo.cropX, photo.cropY
    );
  }

  return canvas;
}
