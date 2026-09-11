import React, { useState, useEffect } from 'react';
import JSZip from 'jszip';
import { db } from '../../services/database';
import { Siswa, Kelas } from '../../types';
import { generateQrDataUrl } from '../../utils/qrHelper';
import {
  QrCode,
  Download,
  Search,
  Filter,
  CheckCircle,
  Archive,
  Loader2,
  Sparkles,
  Info,
  GraduationCap,
} from 'lucide-react';

interface QrCodeSiswaViewProps {
  initialSiswaId?: string;
}

// Helper to render high-resolution QR card with student's name on canvas
export const renderStudentQrCanvas = (
  siswa: Siswa,
  qrDataUrl: string,
  schoolName: string = 'SATUAN PENDIDIKAN',
  tahunAjaran: string = ''
): Promise<Blob> => {
  return new Promise((resolve, reject) => {
    const width = 600;
    const height = 760;
    const canvas = document.createElement('canvas');
    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext('2d');
    if (!ctx) {
      reject(new Error('Canvas context not supported'));
      return;
    }

    // 1. Background clean white
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, width, height);

    // 2. Outer primary frame
    ctx.strokeStyle = '#2563eb'; // blue-600
    ctx.lineWidth = 6;
    ctx.strokeRect(16, 16, width - 32, height - 32);

    // 3. Inner border
    ctx.strokeStyle = '#e2e8f0';
    ctx.lineWidth = 1.5;
    ctx.strokeRect(26, 26, width - 52, height - 52);

    // 4. Header banner
    ctx.fillStyle = '#f8fafc';
    ctx.fillRect(28, 28, width - 56, 80);
    ctx.fillStyle = '#2563eb';
    ctx.fillRect(28, 106, width - 56, 3);

    // 5. School name & header text
    ctx.fillStyle = '#1e3a8a';
    ctx.font = 'bold 22px sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText((schoolName || 'SATUAN PENDIDIKAN').toUpperCase(), width / 2, 58);

    ctx.fillStyle = '#64748b';
    ctx.font = 'bold 13px sans-serif';
    const subText = tahunAjaran ? `KARTU PRESENSI QR • T.A. ${tahunAjaran}` : 'KARTU PRESENSI QR SISWA';
    ctx.fillText(subText, width / 2, 86);

    // 6. Draw QR Code
    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.onload = () => {
      const qrBoxSize = 380;
      const qrBoxX = (width - qrBoxSize) / 2;
      const qrBoxY = 125;

      ctx.fillStyle = '#ffffff';
      ctx.strokeStyle = '#cbd5e1';
      ctx.lineWidth = 1.5;
      ctx.strokeRect(qrBoxX, qrBoxY, qrBoxSize, qrBoxSize);
      ctx.drawImage(img, qrBoxX + 15, qrBoxY + 15, qrBoxSize - 30, qrBoxSize - 30);

      // 7. Student Name (Nama Siswa)
      const nameBoxY = 538;
      ctx.fillStyle = '#0f172a';
      let fontSize = 26;
      ctx.font = `bold ${fontSize}px sans-serif`;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';

      const displayName = siswa.namaLengkap.toUpperCase();
      while (ctx.measureText(displayName).width > width - 70 && fontSize > 16) {
        fontSize -= 2;
        ctx.font = `bold ${fontSize}px sans-serif`;
      }
      ctx.fillText(displayName, width / 2, nameBoxY);

      // 8. Kelas & NISN
      ctx.fillStyle = '#2563eb';
      ctx.font = 'bold 18px sans-serif';
      const detailText = siswa.nisn
        ? `${siswa.kelas}  •  NISN: ${siswa.nisn}`
        : `${siswa.kelas}  •  NI: ${siswa.nomorInduk || '-'}`;
      ctx.fillText(detailText, width / 2, nameBoxY + 36);

      // 9. QR ID Badge
      ctx.fillStyle = '#f1f5f9';
      const pillW = 160;
      const pillH = 30;
      const pillX = (width - pillW) / 2;
      const pillY = nameBoxY + 62;

      ctx.beginPath();
      if (typeof ctx.roundRect === 'function') {
        ctx.roundRect(pillX, pillY, pillW, pillH, 15);
      } else {
        ctx.rect(pillX, pillY, pillW, pillH);
      }
      ctx.fill();

      ctx.fillStyle = '#334155';
      ctx.font = 'bold 13px monospace';
      ctx.fillText(`ID: ${siswa.qrId}`, width / 2, pillY + 15);

      // 10. Footer note
      ctx.fillStyle = '#94a3b8';
      ctx.font = 'italic 11px sans-serif';
      ctx.fillText(
        'Pindai kode QR ini pada kamera scanner untuk absensi kehadiran.',
        width / 2,
        height - 42
      );

      canvas.toBlob((blob) => {
        if (blob) {
          resolve(blob);
        } else {
          reject(new Error('Canvas toBlob failed'));
        }
      }, 'image/png');
    };

    img.onerror = () => {
      reject(new Error('Failed to load QR image on canvas'));
    };

    img.src = qrDataUrl;
  });
};

export const QrCodeSiswaView: React.FC<QrCodeSiswaViewProps> = ({ initialSiswaId }) => {
  const [siswaList, setSiswaList] = useState<Siswa[]>(db.getSiswaList());
  const [kelasList] = useState<Kelas[]>(db.getKelasList());
  const [filterKelas, setFilterKelas] = useState('');
  const [search, setSearch] = useState('');
  const [qrCache, setQrCache] = useState<Record<string, string>>({});
  const [selectedSiswa, setSelectedSiswa] = useState<Siswa | null>(null);

  // Download states
  const [isDownloadingAll, setIsDownloadingAll] = useState(false);
  const [downloadProgress, setDownloadProgress] = useState({ current: 0, total: 0 });
  const [singleDownloadingId, setSingleDownloadingId] = useState<string | null>(null);
  const [successMsg, setSuccessMsg] = useState('');
  const [errorMsg, setErrorMsg] = useState('');

  useEffect(() => {
    const list = db.getSiswaList();
    setSiswaList(list);

    if (initialSiswaId) {
      const found = list.find((s) => s.id === initialSiswaId || s.qrId === initialSiswaId);
      if (found) setSelectedSiswa(found);
    } else if (list.length > 0 && !selectedSiswa) {
      setSelectedSiswa(list[0]);
    }
  }, [initialSiswaId]);

  // Generate QR images cache
  useEffect(() => {
    let isMounted = true;
    const loadQrs = async () => {
      const cache: Record<string, string> = {};
      for (const s of siswaList) {
        const dataUrl = await generateQrDataUrl(s.qrId, 320);
        cache[s.id] = dataUrl;
      }
      if (isMounted) {
        setQrCache(cache);
      }
    };
    loadQrs();
    return () => {
      isMounted = false;
    };
  }, [siswaList]);

  const filtered = siswaList.filter((s) => {
    const matchSearch =
      s.namaLengkap.toLowerCase().includes(search.toLowerCase()) ||
      s.qrId.toLowerCase().includes(search.toLowerCase()) ||
      (s.nisn && s.nisn.includes(search));
    const matchKelas = filterKelas ? s.kelas === filterKelas : true;
    return matchSearch && matchKelas;
  });

  // Download single QR code image with student name
  const handleDownloadSingleQr = async (siswa: Siswa) => {
    try {
      setSingleDownloadingId(siswa.id);
      let dataUrl = qrCache[siswa.id];
      if (!dataUrl) {
        dataUrl = await generateQrDataUrl(siswa.qrId, 320);
      }

      const settings = db.getSettings();
      const blob = await renderStudentQrCanvas(
        siswa,
        dataUrl,
        settings.namaSekolah,
        settings.tahunAjaranAktif
      );

      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      const cleanName = siswa.namaLengkap.replace(/[^a-zA-Z0-9]/g, '_');
      const cleanKelas = siswa.kelas.replace(/[^a-zA-Z0-9]/g, '_');
      link.download = `QR_${cleanName}_${cleanKelas}.png`;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      URL.revokeObjectURL(url);

      setSuccessMsg(`QR Siswa "${siswa.namaLengkap}" berhasil diunduh dengan nama lengkap!`);
      setTimeout(() => setSuccessMsg(''), 3500);
    } catch (err) {
      console.error('Error downloading QR:', err);
      setErrorMsg('Gagal mengunduh gambar QR siswa.');
      setTimeout(() => setErrorMsg(''), 3500);
    } finally {
      setSingleDownloadingId(null);
    }
  };

  // Download ALL QR codes as a ZIP package
  const handleDownloadAllQrZip = async () => {
    if (filtered.length === 0) return;

    setIsDownloadingAll(true);
    setDownloadProgress({ current: 0, total: filtered.length });
    setErrorMsg('');

    try {
      const zip = new JSZip();
      const settings = db.getSettings();

      for (let i = 0; i < filtered.length; i++) {
        const siswa = filtered[i];
        setDownloadProgress({ current: i + 1, total: filtered.length });

        let dataUrl = qrCache[siswa.id];
        if (!dataUrl) {
          dataUrl = await generateQrDataUrl(siswa.qrId, 320);
        }

        const blob = await renderStudentQrCanvas(
          siswa,
          dataUrl,
          settings.namaSekolah,
          settings.tahunAjaranAktif
        );

        const padNum = String(i + 1).padStart(2, '0');
        const cleanName = siswa.namaLengkap.replace(/[^a-zA-Z0-9]/g, '_');
        const cleanKelas = siswa.kelas.replace(/[^a-zA-Z0-9]/g, '_');
        const fileName = `${padNum}_${cleanName}_${cleanKelas}.png`;

        zip.file(fileName, blob);
      }

      const zipBlob = await zip.generateAsync({
        type: 'blob',
        compression: 'DEFLATE',
        compressionOptions: { level: 6 },
      });

      const url = URL.createObjectURL(zipBlob);
      const link = document.createElement('a');
      link.href = url;
      const cleanSekolah = (settings.namaSekolah || 'Sekolah').replace(/[^a-zA-Z0-9]/g, '_');
      const kelasLabel = filterKelas ? `_Kelas_${filterKelas.replace(/[^a-zA-Z0-9]/g, '_')}` : '';
      link.download = `Semua_QR_Siswa_${cleanSekolah}${kelasLabel}.zip`;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      URL.revokeObjectURL(url);

      setSuccessMsg(
        `Berhasil mengunduh ${filtered.length} gambar QR siswa lengkap dengan nama ke dalam file ZIP!`
      );
      setTimeout(() => setSuccessMsg(''), 4500);
    } catch (err) {
      console.error('Error downloading all QR:', err);
      setErrorMsg('Terjadi kesalahan saat memproses unduhan semua QR.');
      setTimeout(() => setErrorMsg(''), 4000);
    } finally {
      setIsDownloadingAll(false);
    }
  };

  const settings = db.getSettings();

  return (
    <div className="space-y-6 animate-in fade-in zoom-in-95 duration-200">
      {/* Header */}
      <div className="bg-white rounded-2xl p-5 sm:p-6 border border-slate-200 shadow-xs flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2.5">
            <div className="w-10 h-10 rounded-xl bg-blue-600 text-white flex items-center justify-center shadow-xs">
              <QrCode className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-lg sm:text-xl font-bold text-slate-900 tracking-tight">
                Unduh QR Code Siswa
              </h2>
              <p className="text-xs text-slate-500 mt-0.5">
                Setiap gambar QR yang diunduh otomatis memuat <strong>Nama Lengkap Siswa</strong>, Kelas, NISN, dan Nama Sekolah.
              </p>
            </div>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2.5">
          <button
            onClick={handleDownloadAllQrZip}
            disabled={isDownloadingAll || filtered.length === 0}
            className={`px-4 py-2.5 rounded-xl text-xs font-bold shadow-xs flex items-center gap-2 transition-all cursor-pointer ${
              isDownloadingAll
                ? 'bg-slate-200 text-slate-500 cursor-not-allowed'
                : 'bg-emerald-600 hover:bg-emerald-700 text-white shadow-emerald-600/20'
            }`}
          >
            {isDownloadingAll ? (
              <>
                <Loader2 className="w-4 h-4 animate-spin" />
                <span>
                  Mengunduh... ({downloadProgress.current}/{downloadProgress.total})
                </span>
              </>
            ) : (
              <>
                <Archive className="w-4 h-4" />
                <span>Unduh Semua QR Siswa ({filtered.length} Siswa - ZIP)</span>
              </>
            )}
          </button>
        </div>
      </div>

      {/* Progress Notification when downloading batch */}
      {isDownloadingAll && (
        <div className="p-4 bg-emerald-50 border border-emerald-200 rounded-2xl space-y-2 animate-in fade-in">
          <div className="flex items-center justify-between text-xs font-bold text-emerald-900">
            <span className="flex items-center gap-2">
              <Loader2 className="w-4 h-4 text-emerald-600 animate-spin" />
              Menyiapkan gambar QR dengan nama siswa ({downloadProgress.current} dari {downloadProgress.total})...
            </span>
            <span>{Math.round((downloadProgress.current / downloadProgress.total) * 100)}%</span>
          </div>
          <div className="w-full h-2 bg-emerald-100 rounded-full overflow-hidden">
            <div
              className="h-full bg-emerald-600 transition-all duration-150"
              style={{
                width: `${(downloadProgress.current / downloadProgress.total) * 100}%`,
              }}
            />
          </div>
        </div>
      )}

      {/* Alerts */}
      {successMsg && (
        <div className="p-4 bg-emerald-50 border border-emerald-200 text-emerald-800 rounded-2xl text-xs font-semibold flex items-center gap-3 animate-in fade-in">
          <CheckCircle className="w-5 h-5 text-emerald-600 flex-shrink-0" />
          <span>{successMsg}</span>
        </div>
      )}

      {errorMsg && (
        <div className="p-4 bg-rose-50 border border-rose-200 text-rose-800 rounded-2xl text-xs font-semibold flex items-center gap-3 animate-in fade-in">
          <Info className="w-5 h-5 text-rose-600 flex-shrink-0" />
          <span>{errorMsg}</span>
        </div>
      )}

      {/* Filter and Selection bar */}
      <div className="bg-white rounded-2xl p-4 border border-slate-200 shadow-xs flex flex-col sm:flex-row gap-3 items-center justify-between">
        <div className="relative w-full sm:w-80">
          <Search className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2" />
          <input
            type="text"
            placeholder="Cari nama, NISN, atau ID Siswa..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full pl-9.5 pr-4 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs focus:bg-white focus:outline-hidden focus:ring-2 focus:ring-blue-600 font-medium"
          />
        </div>

        <div className="flex items-center gap-3 w-full sm:w-auto">
          <div className="flex items-center gap-2 text-xs text-slate-600">
            <Filter className="w-3.5 h-3.5 text-slate-400" />
            <span className="font-semibold text-xs whitespace-nowrap">Filter Kelas:</span>
            <select
              value={filterKelas}
              onChange={(e) => setFilterKelas(e.target.value)}
              className="py-1.5 px-3 bg-slate-50 border border-slate-200 rounded-xl text-xs font-semibold text-slate-700 focus:bg-white focus:outline-hidden focus:ring-2 focus:ring-blue-600 cursor-pointer"
            >
              <option value="">Semua Kelas ({siswaList.length})</option>
              {kelasList.map((k) => (
                <option key={k.id} value={k.nama}>
                  {k.nama}
                </option>
              ))}
            </select>
          </div>
        </div>
      </div>

      {/* Main Content: Left Preview + Right Grid */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        {/* Left Col: Detail & Visual Preview of Downloaded Card */}
        <div className="lg:col-span-5 space-y-4">
          <div className="flex items-center justify-between">
            <h3 className="text-sm font-bold text-slate-800 flex items-center gap-2">
              <Sparkles className="w-4 h-4 text-blue-600" />
              <span>Pratinjau Hasil Unduh Gambar QR</span>
            </h3>
            <span className="text-[11px] font-semibold text-slate-400">Format PNG (600×760px)</span>
          </div>

          {selectedSiswa ? (
            <div className="bg-white rounded-3xl p-6 border-2 border-blue-600 shadow-md space-y-4 flex flex-col items-center text-center relative overflow-hidden">
              {/* Header inside card preview */}
              <div className="w-full pb-3 border-b border-slate-100 text-center">
                <span className="text-xs font-extrabold text-blue-900 uppercase tracking-wide block">
                  {settings.namaSekolah || 'SATUAN PENDIDIKAN'}
                </span>
                <span className="text-[10px] font-semibold text-slate-400 mt-0.5 block">
                  KARTU PRESENSI QR • T.A. {settings.tahunAjaranAktif}
                </span>
              </div>

              {/* QR Image */}
              <div className="p-3 bg-white border border-slate-200 rounded-2xl shadow-xs">
                {qrCache[selectedSiswa.id] ? (
                  <img
                    src={qrCache[selectedSiswa.id]}
                    alt={`QR Code ${selectedSiswa.namaLengkap}`}
                    className="w-48 h-48 sm:w-56 sm:h-56 object-contain"
                  />
                ) : (
                  <div className="w-48 h-48 flex items-center justify-center bg-slate-100 text-slate-400 text-xs">
                    Membuat QR...
                  </div>
                )}
              </div>

              {/* Student Name prominently displayed */}
              <div className="space-y-1">
                <h4 className="text-lg sm:text-xl font-black text-slate-900 tracking-tight uppercase leading-snug">
                  {selectedSiswa.namaLengkap}
                </h4>
                <p className="text-xs text-blue-700 font-bold">
                  {selectedSiswa.kelas} {selectedSiswa.nisn ? `• NISN: ${selectedSiswa.nisn}` : ''}
                </p>
                <div className="inline-block mt-1">
                  <span className="font-mono bg-slate-100 px-3 py-1 rounded-full text-slate-700 font-bold text-[11px]">
                    ID: {selectedSiswa.qrId}
                  </span>
                </div>
              </div>

              {/* Single Download Button */}
              <div className="w-full pt-3 border-t border-slate-100">
                <button
                  onClick={() => handleDownloadSingleQr(selectedSiswa)}
                  disabled={singleDownloadingId === selectedSiswa.id}
                  className="w-full py-2.5 rounded-xl bg-blue-600 hover:bg-blue-700 text-white text-xs font-bold flex items-center justify-center gap-2 shadow-xs transition-colors cursor-pointer"
                >
                  {singleDownloadingId === selectedSiswa.id ? (
                    <>
                      <Loader2 className="w-4 h-4 animate-spin" />
                      <span>Sedang Mengunduh...</span>
                    </>
                  ) : (
                    <>
                      <Download className="w-4 h-4" />
                      <span>Unduh Gambar QR Siswa Ini (PNG)</span>
                    </>
                  )}
                </button>
              </div>
            </div>
          ) : (
            <div className="bg-white rounded-3xl p-8 border border-slate-200 text-center text-slate-400 text-xs">
              Pilih salah satu siswa dari daftar di sebelah kanan untuk melihat pratinjau.
            </div>
          )}

          {/* Quick Info Box */}
          <div className="p-4 bg-blue-50/70 rounded-2xl border border-blue-100 text-xs text-blue-900 space-y-1.5">
            <span className="font-bold flex items-center gap-1.5">
              <CheckCircle className="w-4 h-4 text-blue-600" />
              Keunggulan File Unduhan:
            </span>
            <ul className="text-blue-800 text-[11px] leading-relaxed list-disc list-inside space-y-0.5">
              <li>
                <strong>Nama Siswa:</strong> Tercetak jelas di bawah QR code agar mudah dibedakan saat dibagikan ke orang tua/siswa.
              </li>
              <li>
                <strong>Unduh Sekaligus:</strong> Tombol <em>Unduh Semua QR Siswa</em> akan mengemas seluruh QR siswa ke dalam satu file ZIP.
              </li>
              <li>
                <strong>Resolusi Tajam:</strong> Gambar beresolusi tinggi (PNG) siap disimpan, dicetak mandiri, atau dikirim lewat WhatsApp.
              </li>
            </ul>
          </div>
        </div>

        {/* Right Col: Grid of All Students with Direct Download Button */}
        <div className="lg:col-span-7 space-y-3">
          <div className="flex items-center justify-between">
            <h3 className="text-sm font-bold text-slate-800">
              Daftar Siswa ({filtered.length})
            </h3>
            <span className="text-xs text-slate-400">Klik baris untuk pratinjau atau klik ikon unduh</span>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 max-h-[640px] overflow-y-auto pr-1">
            {filtered.map((siswa) => {
              const isSelected = selectedSiswa?.id === siswa.id;
              const isDownloading = singleDownloadingId === siswa.id;

              return (
                <div
                  key={siswa.id}
                  onClick={() => setSelectedSiswa(siswa)}
                  className={`p-3.5 rounded-2xl border transition-all cursor-pointer flex items-center justify-between gap-2.5 ${
                    isSelected
                      ? 'border-blue-600 bg-blue-50/60 shadow-xs'
                      : 'border-slate-200 bg-white hover:border-slate-300'
                  }`}
                >
                  <div className="flex items-center gap-3 min-w-0">
                    <div className="w-14 h-14 bg-white p-1 rounded-xl border border-slate-200 flex-shrink-0 flex items-center justify-center shadow-xs">
                      {qrCache[siswa.id] ? (
                        <img
                          src={qrCache[siswa.id]}
                          alt={siswa.namaLengkap}
                          className="w-full h-full object-contain"
                        />
                      ) : (
                        <QrCode className="w-6 h-6 text-slate-300" />
                      )}
                    </div>

                    <div className="min-w-0">
                      <div className="flex items-center gap-1.5">
                        <span className="font-mono text-[10px] font-bold text-blue-700 bg-blue-50 px-1.5 py-0.2 rounded border border-blue-200">
                          {siswa.qrId}
                        </span>
                        <span className="text-[10px] font-semibold text-slate-500 truncate">
                          {siswa.kelas}
                        </span>
                      </div>
                      <h4 className="font-bold text-slate-900 text-xs truncate mt-0.5" title={siswa.namaLengkap}>
                        {siswa.namaLengkap}
                      </h4>
                      <p className="text-[11px] text-slate-400 truncate">
                        {siswa.nisn ? `NISN: ${siswa.nisn}` : `NI: ${siswa.nomorInduk || '-'}`}
                      </p>
                    </div>
                  </div>

                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      handleDownloadSingleQr(siswa);
                    }}
                    disabled={isDownloading}
                    className="p-2 rounded-xl bg-slate-100 hover:bg-blue-50 text-slate-600 hover:text-blue-600 transition-colors flex-shrink-0 cursor-pointer"
                    title={`Unduh QR ${siswa.namaLengkap}`}
                  >
                    {isDownloading ? (
                      <Loader2 className="w-4 h-4 text-blue-600 animate-spin" />
                    ) : (
                      <Download className="w-4 h-4" />
                    )}
                  </button>
                </div>
              );
            })}

            {filtered.length === 0 && (
              <div className="col-span-2 py-12 text-center text-slate-400 text-xs bg-white rounded-2xl border border-slate-200">
                Tidak ada data siswa yang cocok dengan pencarian atau filter kelas.
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};
