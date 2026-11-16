import React, { useState } from 'react';
import { X, ZoomIn, ZoomOut, RotateCcw, Maximize2, Image as ImageIcon } from 'lucide-react';

interface ImageLightboxModalProps {
  isOpen: boolean;
  imageUrl: string;
  title?: string;
  caption?: string;
  onClose: () => void;
}

export const ImageLightboxModal: React.FC<ImageLightboxModalProps> = ({
  isOpen,
  imageUrl,
  title,
  caption,
  onClose,
}) => {
  const [scale, setScale] = useState<number>(1);

  if (!isOpen || !imageUrl) return null;

  const handleZoomIn = () => setScale((prev) => Math.min(prev + 0.25, 3));
  const handleZoomOut = () => setScale((prev) => Math.max(prev - 0.25, 0.5));
  const handleResetZoom = () => setScale(1);

  return (
    <div
      className="fixed inset-0 z-50 bg-slate-950/85 backdrop-blur-sm flex flex-col items-center justify-between p-3 sm:p-6 animate-in fade-in duration-200"
      onClick={onClose}
    >
      {/* Top Bar */}
      <div
        className="w-full max-w-4xl flex items-center justify-between text-white pb-3 border-b border-white/10 z-10"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center gap-2 overflow-hidden">
          <ImageIcon className="w-5 h-5 text-blue-400 flex-shrink-0" />
          <h4 className="text-xs sm:text-sm font-extrabold truncate">
            {title || 'Pratinjau Gambar Soal / Pilihan'}
          </h4>
        </div>

        <div className="flex items-center gap-1 sm:gap-2">
          {/* Zoom Controls */}
          <div className="flex items-center bg-white/10 rounded-xl p-0.5 backdrop-blur-xs">
            <button
              type="button"
              onClick={handleZoomOut}
              className="p-1.5 hover:bg-white/20 rounded-lg text-white transition-colors cursor-pointer"
              title="Perkecil (-)"
            >
              <ZoomOut className="w-4 h-4" />
            </button>
            <span className="text-[11px] font-mono px-2 text-blue-200 font-bold min-w-12 text-center">
              {Math.round(scale * 100)}%
            </span>
            <button
              type="button"
              onClick={handleZoomIn}
              className="p-1.5 hover:bg-white/20 rounded-lg text-white transition-colors cursor-pointer"
              title="Perbesar (+)"
            >
              <ZoomIn className="w-4 h-4" />
            </button>
            <button
              type="button"
              onClick={handleResetZoom}
              className="p-1.5 hover:bg-white/20 rounded-lg text-white transition-colors cursor-pointer"
              title="Ukuran Semula (100%)"
            >
              <RotateCcw className="w-4 h-4" />
            </button>
          </div>

          <button
            type="button"
            onClick={onClose}
            className="p-2 bg-white/10 hover:bg-white/20 text-white rounded-xl transition-colors cursor-pointer"
            title="Tutup (Esc)"
          >
            <X className="w-5 h-5" />
          </button>
        </div>
      </div>

      {/* Main Image Viewer Area */}
      <div
        className="flex-1 w-full max-w-5xl flex items-center justify-center overflow-auto p-2 sm:p-4 my-2"
        onClick={(e) => e.stopPropagation()}
      >
        <div
          className="transition-transform duration-150 ease-out max-h-full max-w-full flex items-center justify-center"
          style={{ transform: `scale(${scale})` }}
        >
          <img
            src={imageUrl}
            alt={title || 'Gambar Soal Ujian'}
            className="max-h-[75vh] max-w-[90vw] object-contain rounded-2xl shadow-2xl border border-white/10 bg-black/40 select-none"
            loading="lazy"
          />
        </div>
      </div>

      {/* Caption & Bottom Info */}
      <div
        className="w-full max-w-3xl text-center z-10"
        onClick={(e) => e.stopPropagation()}
      >
        {caption ? (
          <p className="text-xs text-blue-200 bg-white/10 backdrop-blur-xs px-4 py-2 rounded-xl inline-block border border-white/10 shadow-sm max-w-full truncate">
            {caption}
          </p>
        ) : (
          <span className="text-[11px] text-white/50">
            Klik gambar untuk memperbesar &bull; Gunakan kontrol zoom di atas &bull; Aspek rasio asli dipertahankan
          </span>
        )}
      </div>
    </div>
  );
};
