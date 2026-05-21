import { useRef, useCallback } from 'react';
import type { PhotoItem } from '../types';

interface Props {
  photos: PhotoItem[];
  onChange: (photos: PhotoItem[]) => void;
}

function createPhotoItem(file: File): Promise<PhotoItem> {
  return new Promise((resolve) => {
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => {
      resolve({
        id: `${file.name}-${Date.now()}-${Math.random()}`,
        file,
        url,
        naturalWidth: img.naturalWidth,
        naturalHeight: img.naturalHeight,
        cropX: 0.5,
        cropY: 0.5,
        spanX: 1,
        spanY: 1,
      });
    };
    img.src = url;
  });
}

export default function PhotoUpload({ photos, onChange }: Props) {
  const inputRef = useRef<HTMLInputElement>(null);
  const addFiles = useCallback(
    async (files: FileList | File[]) => {
      const imageFiles = Array.from(files).filter((f) => f.type.startsWith('image/'));
      if (!imageFiles.length) return;
      const newItems = await Promise.all(imageFiles.map(createPhotoItem));
      onChange([...photos, ...newItems]);
    },
    [photos, onChange]
  );

  const handleDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault();
      addFiles(e.dataTransfer.files);
    },
    [addFiles]
  );

  const removePhoto = (id: string) => {
    const item = photos.find((p) => p.id === id);
    if (item) URL.revokeObjectURL(item.url);
    onChange(photos.filter((p) => p.id !== id));
  };

  const movePhoto = (from: number, to: number) => {
    const next = [...photos];
    const [moved] = next.splice(from, 1);
    next.splice(to, 0, moved);
    onChange(next);
  };

  return (
    <div className="flex flex-col gap-4">
      <div
        className="border-2 border-dashed border-slate-600 rounded-xl p-8 text-center cursor-pointer hover:border-indigo-500 hover:bg-indigo-950/20 transition-colors"
        onClick={() => inputRef.current?.click()}
        onDragOver={(e) => e.preventDefault()}
        onDrop={handleDrop}
      >
        <div className="flex flex-col items-center gap-2 text-slate-400">
          <svg className="w-10 h-10 text-slate-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5}
              d="M3 16.5v2.25A2.25 2.25 0 005.25 21h13.5A2.25 2.25 0 0021 18.75V16.5m-13.5-9L12 3m0 0l4.5 4.5M12 3v13.5" />
          </svg>
          <p className="font-medium text-slate-300">Drop images here or click to browse</p>
          <p className="text-sm">Supports JPEG, PNG, WEBP, GIF</p>
        </div>
        <input
          ref={inputRef}
          type="file"
          accept="image/*"
          multiple
          className="hidden"
          onChange={(e) => e.target.files && addFiles(e.target.files)}
        />
      </div>

      {photos.length > 0 && (
        <div className="flex flex-col gap-2">
          <div className="flex justify-between items-center">
            <p className="text-sm text-slate-400">
              {photos.length} photo{photos.length !== 1 ? 's' : ''} — drag to reorder
            </p>
            <button
              onClick={() => {
                photos.forEach((p) => URL.revokeObjectURL(p.url));
                onChange([]);
              }}
              className="text-xs text-red-400 hover:text-red-300 transition-colors"
            >
              Clear all
            </button>
          </div>
          <div className="grid grid-cols-4 sm:grid-cols-6 gap-2 max-h-64 overflow-y-auto pr-1">
            {photos.map((photo, i) => (
              <div
                key={photo.id}
                className="relative group aspect-square rounded-lg overflow-hidden bg-slate-800 cursor-grab active:cursor-grabbing"
                draggable
                onDragStart={(e) => e.dataTransfer.setData('text/plain', String(i))}
                onDragOver={(e) => e.preventDefault()}
                onDrop={(e) => {
                  e.preventDefault();
                  e.stopPropagation();
                  const from = parseInt(e.dataTransfer.getData('text/plain'));
                  if (!isNaN(from) && from !== i) movePhoto(from, i);
                }}
              >
                <img
                  src={photo.url}
                  alt={photo.file.name}
                  className="w-full h-full object-cover pointer-events-none"
                />
                <div className="absolute inset-0 bg-black/50 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center gap-1">
                  <span className="text-white text-xs font-bold">{i + 1}</span>
                </div>
                <button
                  onClick={(e) => { e.stopPropagation(); removePhoto(photo.id); }}
                  className="absolute top-1 right-1 w-5 h-5 bg-red-600 rounded-full flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity hover:bg-red-500"
                >
                  <svg className="w-3 h-3 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M6 18L18 6M6 6l12 12" />
                  </svg>
                </button>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
