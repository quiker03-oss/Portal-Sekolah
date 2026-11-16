import React, { useState, useEffect } from 'react';
import {
  X,
  Upload,
  Image as ImageIcon,
  Check,
  Trash2,
  Crop,
  FolderOpen,
  RotateCcw,
} from 'lucide-react';
import {
  uploadExamImage,
  validateImageFile,
  cropImageDataUrl,
} from '../../services/imageStorageService';

export interface AvailableImageOption {
  id: string;
  url: string;
  label: string;
}

interface ExamImageManagerModalProps {
  isOpen: boolean;
  schoolId: string;
  examId: string;
  soalId: string;
  targetType: 'soal' | 'pilihan';
  targetChoiceLetter?: string;
  currentImage?: string;
  currentImageId?: string;
  currentStoragePath?: string;
  currentCaption?: string;
  currentPosisi?: 'atas' | 'tengah' | 'bawah';
  currentUkuran?: 'kecil' | 'sedang' | 'besar' | 'asli';
  availableImages?: AvailableImageOption[];
  createdBy?: string;
  onSave: (data: {
    imageUrl: string;
    imageId?: string;
    storagePath?: string;
    caption?: string;
    posisi?: 'atas' | 'tengah' | 'bawah';
    ukuran?: 'kecil' | 'sedang' | 'besar' | 'asli';
  }) => void;
  onRemove: () => void;
  onClose: () => void;
}

export const ExamImageManagerModal: React.FC<ExamImageManagerModalProps> = ({
  isOpen,
  schoolId,
  examId,
  soalId,
  targetType,
  targetChoiceLetter,
  currentImage,
  currentImageId,
  currentStoragePath,
  currentCaption = '',
  currentPosisi = 'atas',
  currentUkuran = 'sedang',
  availableImages = [],
  createdBy,
  onSave,
  onRemove,
  onClose,
}) => {
  const [activeTab, setActiveTab] = useState<'upload' | 'galeri' | 'crop'>('upload');
  const [previewUrl, setPreviewUrl] = useState<string>(currentImage || '');
  const [imageId, setImageId] = useState<string | undefined>(currentImageId);
  const [storagePath, setStoragePath] = useState<string | undefined>(currentStoragePath);
  const [caption, setCaption] = useState<string>(currentCaption);
  const [posisi, setPosisi] = useState<'atas' | 'tengah' | 'bawah'>(currentPosisi);
  const [ukuran, setUkuran] = useState<'kecil' | 'sedang' | 'besar' | 'asli'>(currentUkuran);
  const [isProcessing, setIsProcessing] = useState<boolean>(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  // Cropper state in percentage (0 - 100)
  const [cropX, setCropX] = useState<number>(5);
  const [cropY, setCropY] = useState<number>(5);
  const [cropW, setCropW] = useState<number>(90);
  const [cropH, setCropH] = useState<number>(90);

  useEffect(() => {
    if (isOpen) {
      setPreviewUrl(currentImage || '');
      setImageId(currentImageId);
      setStoragePath(currentStoragePath);
      setCaption(currentCaption);
      setPosisi(currentPosisi);
      setUkuran(currentUkuran);
      setErrorMsg(null);
      setActiveTab('upload');
      setCropX(5);
      setCropY(5);
      setCropW(90);
      setCropH(90);
    }
  }, [
    isOpen,
    currentImage,
    currentImageId,
    currentStoragePath,
    currentCaption,
    currentPosisi,
    currentUkuran,
  ]);

  if (!isOpen) return null;

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const validation = validateImageFile(file);
    if (!validation.valid) {
      setErrorMsg(validation.error || 'Format berkas tidak valid.');
      return;
    }

    setIsProcessing(true);
    setErrorMsg(null);

    try {
      const result = await uploadExamImage(schoolId, examId, soalId, file, file.name, {
        targetType,
        choiceLetter: targetChoiceLetter,
        caption: caption.trim() || undefined,
        createdBy,
      });
      setPreviewUrl(result.url);
      setImageId(result.imageId);
      setStoragePath(result.storagePath);
    } catch (err: any) {
      setErrorMsg(err?.message || 'Gagal memproses berkas gambar.');
    } finally {
      setIsProcessing(false);
    }
  };

  const handleSelectAvailable = (asset: AvailableImageOption) => {
    setPreviewUrl(asset.url);
    setImageId(undefined);
    setStoragePath(undefined);
    setErrorMsg(null);
  };

  const handleApplyCrop = async () => {
    if (!previewUrl) return;
    setIsProcessing(true);
    setErrorMsg(null);
    try {
      const cropped = await cropImageDataUrl(previewUrl, {
        xPct: cropX,
        yPct: cropY,
        wPct: cropW,
        hPct: cropH,
      });

      const uploaded = await uploadExamImage(
        schoolId,
        examId,
        soalId,
        cropped.dataUrl,
        `cropped_${soalId}`,
        {
          targetType,
          choiceLetter: targetChoiceLetter,
          caption: caption.trim() || undefined,
          createdBy,
        }
      );

      setPreviewUrl(uploaded.url);
      setImageId(uploaded.imageId);
      setStoragePath(uploaded.storagePath);
      setCropX(0);
      setCropY(0);
      setCropW(100);
      setCropH(100);
      setActiveTab('upload');
    } catch (err: any) {
      setErrorMsg(err?.message || 'Gagal memotong gambar.');
    } finally {
      setIsProcessing(false);
    }
  };

  const handleApply = () => {
    if (!previewUrl) {
      setErrorMsg('Pilih atau unggah gambar terlebih dahulu.');
      return;
    }
    onSave({
      imageUrl: previewUrl,
      imageId,
      storagePath,
      caption: caption.trim() || undefined,
      posisi,
      ukuran,
    });
    onClose();
  };

  const titleText =
    targetType === 'soal'
      ? 'Kelola Gambar Soal'
      : `Kelola Gambar Pilihan Jawaban ${targetChoiceLetter}`;

  return (
    <div className="fixed inset-0 z-50 bg-slate-950/70 backdrop-blur-xs flex items-center justify-center p-4 animate-in fade-in duration-150">
      <div className="max-w-2xl w-full bg-white rounded-3xl p-6 sm:p-7 space-y-5 shadow-2xl max-h-[92vh] overflow-y-auto">
        {/* Modal Header */}
        <div className="flex items-center justify-between pb-3 border-b border-slate-100">
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-xl bg-blue-50 text-blue-700 flex items-center justify-center">
              <ImageIcon className="w-4 h-4" />
            </div>
            <div>
              <h3 className="text-sm font-extrabold text-slate-900">{titleText}</h3>
              <p className="text-[11px] text-slate-400">
                Mendukung JPG, JPEG, PNG, WEBP dari galeri HP, komputer, atau gambar dokumen
              </p>
            </div>
          </div>

          <button
            type="button"
            onClick={onClose}
            className="p-1.5 rounded-xl text-slate-400 hover:bg-slate-100 transition-colors cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Mode Tabs */}
        <div className="flex flex-wrap gap-2 bg-slate-100 p-1 rounded-2xl">
          <button
            type="button"
            onClick={() => setActiveTab('upload')}
            className={`flex-1 py-2 px-3 rounded-xl text-xs font-bold flex items-center justify-center gap-1.5 transition-colors cursor-pointer ${
              activeTab === 'upload'
                ? 'bg-white text-blue-700 shadow-xs'
                : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            <Upload className="w-3.5 h-3.5" />
            <span>Unggah Berkas</span>
          </button>

          <button
            type="button"
            onClick={() => setActiveTab('galeri')}
            className={`flex-1 py-2 px-3 rounded-xl text-xs font-bold flex items-center justify-center gap-1.5 transition-colors cursor-pointer ${
              activeTab === 'galeri'
                ? 'bg-white text-blue-700 shadow-xs'
                : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            <FolderOpen className="w-3.5 h-3.5" />
            <span>Gambar Tersedia ({availableImages.length})</span>
          </button>

          <button
            type="button"
            disabled={!previewUrl}
            onClick={() => setActiveTab('crop')}
            className={`flex-1 py-2 px-3 rounded-xl text-xs font-bold flex items-center justify-center gap-1.5 transition-colors cursor-pointer disabled:opacity-40 ${
              activeTab === 'crop'
                ? 'bg-white text-blue-700 shadow-xs'
                : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            <Crop className="w-3.5 h-3.5" />
            <span>Potong (Crop)</span>
          </button>
        </div>

        {/* Error Alert */}
        {errorMsg && (
          <div className="p-3 bg-red-50 border border-red-200 text-red-700 text-xs font-semibold rounded-xl">
            {errorMsg}
          </div>
        )}

        {/* TAB 1: UPLOAD FROM PHONE GALLERY / COMPUTER */}
        {activeTab === 'upload' && (
          <div className="border-2 border-dashed border-slate-300 hover:border-blue-500 rounded-2xl p-4 sm:p-5 text-center transition-all bg-slate-50/50">
            <Upload className="w-7 h-7 text-blue-700 mx-auto mb-2" />
            <label className="inline-block px-4 py-2 bg-blue-700 hover:bg-blue-600 text-white rounded-xl text-xs font-bold shadow-xs transition-all cursor-pointer">
              <span>{isProcessing ? 'Mengoptimasi & Mengunggah...' : 'Pilih dari Galeri HP / Komputer'}</span>
              <input
                type="file"
                accept="image/png,image/jpeg,image/jpg,image/webp,image/gif"
                onChange={handleFileChange}
                disabled={isProcessing}
                className="hidden"
              />
            </label>
            <p className="text-[10px] text-slate-400 mt-2">
              Gambar otomatis dikompres proporsional & disimpan permanen ke Cloud Storage tanpa AI.
            </p>
          </div>
        )}

        {/* TAB 2: PICK FROM EXISTING DOCUMENT / EXAM IMAGES */}
        {activeTab === 'galeri' && (
          <div className="space-y-2">
            {availableImages.length === 0 ? (
              <div className="p-6 text-center bg-slate-50 rounded-2xl border border-slate-200 text-xs text-slate-500">
                Belum ada gambar tersedia dari dokumen yang diunggah atau soal lainnya.
              </div>
            ) : (
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-2.5 max-h-60 overflow-y-auto p-1">
                {availableImages.map((asset) => {
                  const isPicked = previewUrl === asset.url;
                  return (
                    <button
                      key={asset.id}
                      type="button"
                      onClick={() => handleSelectAvailable(asset)}
                      className={`p-2 rounded-xl border text-left transition-all cursor-pointer ${
                        isPicked
                          ? 'border-blue-600 bg-blue-50 ring-2 ring-blue-600/20'
                          : 'border-slate-200 bg-white hover:border-slate-300'
                      }`}
                    >
                      <div className="h-24 bg-slate-100 rounded-lg overflow-hidden flex items-center justify-center mb-1.5">
                        <img src={asset.url} alt={asset.label} className="max-h-full max-w-full object-contain" />
                      </div>
                      <p className="text-[10px] font-bold text-slate-700 truncate">{asset.label}</p>
                    </button>
                  );
                })}
              </div>
            )}
          </div>
        )}

        {/* TAB 3: INTERACTIVE CANVAS CROPPER */}
        {activeTab === 'crop' && previewUrl && (
          <div className="space-y-4 bg-slate-50 p-4 rounded-2xl border border-slate-200">
            <div className="flex items-center justify-between">
              <span className="text-xs font-bold text-slate-800">Sesuaikan Area Potongan (Crop):</span>
              <div className="flex items-center gap-1.5">
                <button
                  type="button"
                  onClick={() => {
                    setCropX(10);
                    setCropY(10);
                    setCropW(80);
                    setCropH(80);
                  }}
                  className="px-2 py-1 bg-white border border-slate-200 rounded-lg text-[10px] font-bold text-slate-600 hover:bg-slate-100 cursor-pointer"
                >
                  Tengah 80%
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setCropX(0);
                    setCropY(0);
                    setCropW(100);
                    setCropH(100);
                  }}
                  className="px-2 py-1 bg-white border border-slate-200 rounded-lg text-[10px] font-bold text-slate-600 hover:bg-slate-100 flex items-center gap-1 cursor-pointer"
                >
                  <RotateCcw className="w-3 h-3" /> Reset
                </button>
              </div>
            </div>

            {/* Visual crop overlay box */}
            <div className="relative mx-auto w-fit max-w-full bg-slate-900 rounded-xl overflow-hidden flex items-center justify-center">
              <img
                src={previewUrl}
                alt="Crop target"
                className="max-h-60 w-auto object-contain select-none opacity-90"
              />
              <div
                style={{
                  left: `${cropX}%`,
                  top: `${cropY}%`,
                  width: `${cropW}%`,
                  height: `${cropH}%`,
                }}
                className="absolute border-2 border-amber-400 bg-amber-300/15 shadow-[0_0_0_9999px_rgba(15,23,42,0.55)] pointer-events-none"
              />
            </div>

            <div className="grid grid-cols-2 gap-3 text-[11px]">
              <label className="space-y-1">
                <span className="font-bold text-slate-700 flex justify-between">
                  <span>Batas Kiri</span>
                  <span>{cropX}%</span>
                </span>
                <input
                  type="range"
                  min={0}
                  max={85}
                  value={cropX}
                  onChange={(e) => {
                    const val = Number(e.target.value);
                    setCropX(val);
                    if (val + cropW > 100) setCropW(Math.max(10, 100 - val));
                  }}
                  className="w-full accent-blue-700"
                />
              </label>

              <label className="space-y-1">
                <span className="font-bold text-slate-700 flex justify-between">
                  <span>Batas Atas</span>
                  <span>{cropY}%</span>
                </span>
                <input
                  type="range"
                  min={0}
                  max={85}
                  value={cropY}
                  onChange={(e) => {
                    const val = Number(e.target.value);
                    setCropY(val);
                    if (val + cropH > 100) setCropH(Math.max(10, 100 - val));
                  }}
                  className="w-full accent-blue-700"
                />
              </label>

              <label className="space-y-1">
                <span className="font-bold text-slate-700 flex justify-between">
                  <span>Lebar Area</span>
                  <span>{cropW}%</span>
                </span>
                <input
                  type="range"
                  min={10}
                  max={100 - cropX}
                  value={cropW}
                  onChange={(e) => setCropW(Number(e.target.value))}
                  className="w-full accent-blue-700"
                />
              </label>

              <label className="space-y-1">
                <span className="font-bold text-slate-700 flex justify-between">
                  <span>Tinggi Area</span>
                  <span>{cropH}%</span>
                </span>
                <input
                  type="range"
                  min={10}
                  max={100 - cropY}
                  value={cropH}
                  onChange={(e) => setCropH(Number(e.target.value))}
                  className="w-full accent-blue-700"
                />
              </label>
            </div>

            <button
              type="button"
              disabled={isProcessing}
              onClick={handleApplyCrop}
              className="w-full py-2.5 bg-amber-500 hover:bg-amber-600 disabled:opacity-50 text-white rounded-xl text-xs font-bold flex items-center justify-center gap-1.5 shadow-xs cursor-pointer"
            >
              <Crop className="w-4 h-4" />
              <span>{isProcessing ? 'Memotong & Menyimpan...' : 'Terapkan Hasil Potongan Gambar'}</span>
            </button>
          </div>
        )}

        {/* Live Preview & Settings Area */}
        {previewUrl && activeTab !== 'crop' ? (
          <div className="space-y-4">
            <div className="space-y-1.5">
              <span className="text-[11px] font-bold text-slate-700 uppercase tracking-wider block">
                Pratinjau Gambar Terpilih:
              </span>
              <div className="relative rounded-2xl border border-slate-200 bg-slate-50 p-3 flex items-center justify-center max-h-56 overflow-hidden">
                <img
                  src={previewUrl}
                  alt="Pratinjau"
                  className="max-h-48 object-contain rounded-xl shadow-xs"
                />
              </div>
            </div>

            {/* Position & Size Configuration (For Question Image) */}
            {targetType === 'soal' && (
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-1">
                <div className="space-y-1">
                  <label className="text-xs font-bold text-slate-700">Posisi Tampilan Gambar:</label>
                  <select
                    value={posisi}
                    onChange={(e) => setPosisi(e.target.value as any)}
                    className="w-full p-2.5 rounded-xl border border-slate-200 text-xs font-semibold bg-white outline-none focus:border-blue-600"
                  >
                    <option value="atas">Sebelum Teks Soal (Atas)</option>
                    <option value="tengah">Di Tengah / Antara Paragraf Soal</option>
                    <option value="bawah">Setelah Teks Soal (Bawah)</option>
                  </select>
                </div>

                <div className="space-y-1">
                  <label className="text-xs font-bold text-slate-700">Ukuran Tampilan:</label>
                  <select
                    value={ukuran}
                    onChange={(e) => setUkuran(e.target.value as any)}
                    className="w-full p-2.5 rounded-xl border border-slate-200 text-xs font-semibold bg-white outline-none focus:border-blue-600"
                  >
                    <option value="kecil">Kecil (Maks. 320px)</option>
                    <option value="sedang">Sedang (Maks. 450px - Rekomendasi)</option>
                    <option value="besar">Besar (Maks. 670px)</option>
                    <option value="asli">Lebar Penuh / Asli</option>
                  </select>
                </div>

                <div className="space-y-1 sm:col-span-2">
                  <label className="text-xs font-bold text-slate-700">Keterangan / Caption Gambar (Opsional):</label>
                  <input
                    type="text"
                    value={caption}
                    onChange={(e) => setCaption(e.target.value)}
                    placeholder="Contoh: Gambar 1. Struktur Organ Pernapasan Manusia"
                    className="w-full p-2.5 rounded-xl border border-slate-200 text-xs font-medium bg-white outline-none focus:border-blue-600"
                  />
                </div>
              </div>
            )}
          </div>
        ) : null}

        {/* Modal Actions */}
        <div className="flex items-center justify-between pt-3 border-t border-slate-100">
          {currentImage ? (
            <button
              type="button"
              onClick={() => {
                onRemove();
                onClose();
              }}
              className="px-3.5 py-2 text-red-600 hover:bg-red-50 rounded-xl text-xs font-bold flex items-center gap-1.5 transition-colors cursor-pointer"
            >
              <Trash2 className="w-4 h-4" />
              <span>Hapus Gambar</span>
            </button>
          ) : (
            <div />
          )}

          <div className="flex gap-2">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-xl text-xs font-bold transition-colors cursor-pointer"
            >
              Batal
            </button>
            <button
              type="button"
              disabled={!previewUrl || isProcessing}
              onClick={handleApply}
              className="px-5 py-2 bg-blue-700 hover:bg-blue-600 disabled:opacity-50 text-white rounded-xl text-xs font-bold shadow-md transition-all cursor-pointer flex items-center gap-1.5"
            >
              <Check className="w-4 h-4" />
              <span>Terapkan Gambar</span>
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
