import React, { useState, useEffect } from 'react';
import { db } from '../../services/database';
import { Guru } from '../../types';
import { generateQrDataUrl } from '../../utils/qrHelper';
import { printElement } from '../../utils/exportHelper';
import { QrCode, Printer, Download, Search, CheckCircle } from 'lucide-react';

interface QrCodeGuruViewProps {
  initialGuruId?: string;
}

export const QrCodeGuruView: React.FC<QrCodeGuruViewProps> = ({ initialGuruId }) => {
  const [guruList, setGuruList] = useState<Guru[]>(db.getGuruList());
  const [search, setSearch] = useState('');
  const [qrCache, setQrCache] = useState<Record<string, string>>({});
  const [selectedGuru, setSelectedGuru] = useState<Guru | null>(null);

  useEffect(() => {
    const list = db.getGuruList();
    setGuruList(list);

    if (initialGuruId) {
      const found = list.find((g) => g.id === initialGuruId || g.qrId === initialGuruId);
      if (found) setSelectedGuru(found);
    } else if (list.length > 0 && !selectedGuru) {
      setSelectedGuru(list[0]);
    }
  }, [initialGuruId]);

  useEffect(() => {
    let isMounted = true;
    const loadQrs = async () => {
      const cache: Record<string, string> = {};
      for (const g of guruList) {
        // QR Code only stores the Teacher ID: TCH-xxxxx
        const dataUrl = await generateQrDataUrl(g.qrId, 240);
        cache[g.id] = dataUrl;
      }
      if (isMounted) setQrCache(cache);
    };
    loadQrs();
    return () => {
      isMounted = false;
    };
  }, [guruList]);

  const filtered = guruList.filter(
    (g) =>
      g.nama.toLowerCase().includes(search.toLowerCase()) ||
      g.qrId.toLowerCase().includes(search.toLowerCase())
  );

  const handleDownloadSingle = (guru: Guru) => {
    const dataUrl = qrCache[guru.id];
    if (!dataUrl) return;

    const canvas = document.createElement("canvas");
    canvas.width = 480;
    canvas.height = 540;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    ctx.fillStyle = "#ffffff";
    ctx.fillRect(0, 0, 480, 540);
    
    const img = new Image();
    img.crossOrigin = "anonymous";
    img.src = dataUrl;
    img.onload = () => {
      const qrBoxSize = 360;
      const qrBoxX = (480 - qrBoxSize) / 2;
      const qrBoxY = 40;
      ctx.drawImage(img, qrBoxX, qrBoxY, qrBoxSize, qrBoxSize);

      ctx.fillStyle = "#0f172a";
      let fontSize = 24;
      ctx.font = `bold ${fontSize}px sans-serif`;
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";

      const displayName = guru.nama.toUpperCase();
      while (ctx.measureText(displayName).width > 440 && fontSize > 14) {
        fontSize -= 1.5;
        ctx.font = `bold ${fontSize}px sans-serif`;
      }
      ctx.fillText(displayName, 240, 465);
      
      const link = document.createElement("a");
      link.href = canvas.toDataURL("image/png");
      const cleanName = guru.nama.replace(/[^a-zA-Z0-9]/g, '_');
      link.download = `QR_${cleanName}.png`;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
    };
  };

  const handlePrintCards = () => {
    printElement('printable-teacher-qr-sheet', 'Cetak_Kartu_QR_Guru_Sekolah');
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h2 className="text-xl font-bold text-slate-900 tracking-tight">
            Kartu & QR Code Guru
          </h2>
          <p className="text-xs text-slate-500 mt-0.5">
            QR Code khusus presensi kehadiran mandiri Guru. Gambar hasil unduhan hanya memuat kode QR dan Nama Guru.
          </p>
        </div>

        <button
          onClick={handlePrintCards}
          className="px-4 py-2 bg-blue-700 hover:bg-blue-800 text-white rounded-xl text-xs font-semibold shadow-xs flex items-center gap-2 transition-colors cursor-pointer"
        >
          <Printer className="w-4 h-4" />
          <span>Cetak Semua Kartu Guru ({filtered.length})</span>
        </button>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        {/* Selected Card preview */}
        <div className="lg:col-span-5 space-y-4">
          <h3 className="text-sm font-bold text-slate-800 flex items-center gap-2">
            <QrCode className="w-4 h-4 text-blue-700" />
            <span>Pratinjau Unduh QR Guru</span>
          </h3>

          {selectedGuru && (
            <div className="bg-white rounded-3xl p-6 border border-slate-200 shadow-sm space-y-5 flex flex-col items-center text-center relative overflow-hidden">
              {/* Clean QR code box */}
              <div className="p-3 bg-white border border-slate-200 rounded-2xl shadow-xs">
                {qrCache[selectedGuru.id] ? (
                  <img
                    src={qrCache[selectedGuru.id]}
                    alt={`QR Code ${selectedGuru.nama}`}
                    className="w-48 h-48 sm:w-56 sm:h-56 object-contain"
                  />
                ) : (
                  <div className="w-48 h-48 flex items-center justify-center bg-slate-100 text-slate-400 text-xs">
                    Membuat QR...
                  </div>
                )}
              </div>

              {/* STRICTLY TEACHER NAME */}
              <div className="w-full px-2">
                <h4 className="text-lg sm:text-xl font-extrabold text-slate-900 tracking-tight uppercase leading-snug">
                  {selectedGuru.nama}
                </h4>
              </div>

              <div className="w-full pt-4 border-t border-slate-100 flex gap-2">
                <button
                  onClick={() => handleDownloadSingle(selectedGuru)}
                  className="flex-1 py-2 rounded-xl bg-blue-600 hover:bg-blue-700 text-white text-xs font-semibold flex items-center justify-center gap-1.5 transition-colors cursor-pointer shadow-xs"
                >
                  <Download className="w-3.5 h-3.5" />
                  <span>Unduh PNG (Hanya Nama)</span>
                </button>
                <button
                  onClick={handlePrintCards}
                  className="flex-1 py-2 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-semibold flex items-center justify-center gap-1.5 transition-colors cursor-pointer"
                >
                  <Printer className="w-3.5 h-3.5" />
                  <span>Cetak Kartu</span>
                </button>
              </div>
            </div>
          )}

          <div className="p-4 bg-blue-50/70 rounded-2xl border border-blue-200 text-xs text-blue-900 space-y-1">
            <span className="font-bold flex items-center gap-1.5">
              <CheckCircle className="w-3.5 h-3.5 text-blue-700" />
              Ketentuan Absensi Guru
            </span>
            <p className="text-blue-800 text-[11px] leading-relaxed">
              Guru cukup memindai kartu QR ini di meja piket atau laptop sekolah. Scan pertama pada hari tersebut otomatis tercatat sebagai <strong>Absen Masuk</strong>, dan scan berikutnya tercatat sebagai <strong>Absen Pulang</strong>.
            </p>
          </div>
        </div>

        {/* Right List */}
        <div className="lg:col-span-7 space-y-3">
          <div className="bg-white rounded-2xl p-4 border border-slate-200 shadow-xs flex items-center justify-between">
            <div className="relative w-full sm:w-72">
              <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
              <input
                type="text"
                placeholder="Cari guru atau ID..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="w-full pl-9 pr-4 py-1.5 bg-slate-50 border border-slate-200 rounded-xl text-xs focus:bg-white focus:outline-hidden focus:ring-2 focus:ring-blue-600"
              />
            </div>
            <span className="text-xs text-slate-500 font-medium">
              {filtered.length} Kartu Guru
            </span>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 max-h-[620px] overflow-y-auto pr-1">
            {filtered.map((guru) => (
              <div
                key={guru.id}
                onClick={() => setSelectedGuru(guru)}
                className={`p-3.5 rounded-2xl border transition-all cursor-pointer flex items-center gap-3.5 ${
                  selectedGuru?.id === guru.id
                    ? 'border-blue-600 bg-blue-50/50 shadow-xs'
                    : 'border-slate-200 bg-white hover:border-slate-300'
                }`}
              >
                <div className="w-16 h-16 bg-white p-1 rounded-xl border border-slate-200 flex-shrink-0 flex items-center justify-center shadow-xs">
                  {qrCache[guru.id] ? (
                    <img
                      src={qrCache[guru.id]}
                      alt={guru.nama}
                      className="w-full h-full object-contain"
                    />
                  ) : (
                    <QrCode className="w-6 h-6 text-slate-300" />
                  )}
                </div>

                <div className="flex-1 min-w-0">
                  <span className="font-mono text-[10px] font-bold text-blue-700 bg-blue-50 px-1.5 py-0.2 rounded border border-blue-200">
                    {guru.qrId}
                  </span>
                  <h4 className="font-bold text-slate-900 text-xs truncate mt-1">
                    {guru.nama}
                  </h4>
                  <p className="text-[11px] text-slate-400 truncate">{guru.jabatan}</p>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* HIDDEN PRINTABLE SHEET GURU */}
      <div id="printable-teacher-qr-sheet" className="hidden">
        <div style={{ padding: '20px', fontFamily: 'sans-serif' }}>
          <div style={{ textAlign: 'center', marginBottom: '20px' }}>
            <h2 style={{ fontSize: '18px', fontWeight: 'bold', margin: '0' }}>SATUAN PENDIDIKAN</h2>
            <p style={{ fontSize: '12px', color: '#666', margin: '4px 0 0 0' }}>
              KARTU PRESENSI QR CODE GURU & TENAGA KEPENDIDIKAN
            </p>
          </div>

          <div
            style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(3, 1fr)',
              gap: '16px',
            }}
          >
            {filtered.map((guru) => (
              <div
                key={guru.id}
                style={{
                  border: '1.5px solid #cbd5e1',
                  borderRadius: '12px',
                  padding: '14px',
                  textAlign: 'center',
                  background: '#ffffff',
                  pageBreakInside: 'avoid',
                }}
              >
                <div
                  style={{
                    display: 'flex',
                    justifyContent: 'center',
                    marginBottom: '10px',
                  }}
                >
                  <img
                    src={qrCache[guru.id]}
                    alt={guru.nama}
                    style={{ width: '130px', height: '130px' }}
                  />
                </div>

                {/* Strictly [ QR CODE ] NAMA GURU */}
                <div
                  style={{
                    fontSize: '11px',
                    fontWeight: 'bold',
                    color: '#0f172a',
                    textTransform: 'uppercase',
                  }}
                >
                  {guru.nama}
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
};
