import React from 'react';
import { db } from '../../services/database';
import { SekolahInfo } from '../../types';
import { printElement, openPrintWindow } from '../../utils/exportHelper';
import { Printer, X, ExternalLink } from 'lucide-react';

interface PrintRekapModalProps {
  isOpen: boolean;
  onClose: () => void;
  title: string;
  subtitle: string;
  metadata: { label: string; value: string }[];
  summaryItems?: { label: string; count: number; colorClass?: string }[];
  columns: { header: string; key?: string; render?: (item: any, index: number) => React.ReactNode; width?: string; align?: 'left' | 'center' | 'right' }[];
  data: any[];
  signRole2?: string;
  signName2?: string;
  signNip2?: string;
}

export const PrintRekapModal: React.FC<PrintRekapModalProps> = ({
  isOpen,
  onClose,
  title,
  subtitle,
  metadata,
  summaryItems,
  columns,
  data,
  signRole2 = 'Wali Kelas / Petugas Presensi',
  signName2,
  signNip2,
}) => {
  if (!isOpen) return null;

  const sekolah: SekolahInfo = db.getSekolah();
  const todayFormatted = new Intl.DateTimeFormat('id-ID', {
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  }).format(new Date());

  const printDocumentId = 'print-rekap-official-doc';

  const handlePrint = () => {
    printElement(printDocumentId, `${title} - ${sekolah.nama}`);
  };

  const handleOpenNewTab = () => {
    openPrintWindow(printDocumentId, `${title} - ${sekolah.nama}`);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-6 bg-slate-900/70 backdrop-blur-xs overflow-y-auto animate-in fade-in duration-200">
      <div className="bg-white w-full max-w-4xl rounded-2xl shadow-2xl border border-slate-200 overflow-hidden flex flex-col max-h-[92vh]">
        {/* Modal Toolbar (hidden during print) */}
        <div className="bg-slate-900 text-white px-5 py-3.5 flex flex-wrap items-center justify-between gap-3 no-print shrink-0">
          <div>
            <h3 className="text-sm font-bold tracking-tight text-white flex items-center gap-2">
              <Printer className="w-4 h-4 text-blue-400" />
              Pratinjau Cetak Dokumen Resmi
            </h3>
            <p className="text-[11px] text-slate-400">
              Dokumen siap cetak dengan format Kop Surat & Tanda Tangan Resmi
            </p>
          </div>

          <div className="flex items-center gap-2">
            <button
              id="btn-confirm-print"
              onClick={handlePrint}
              className="px-3.5 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-xl text-xs font-semibold flex items-center gap-1.5 shadow-sm transition-all hover:shadow cursor-pointer"
              title="Cetak langsung melalui dialog print browser"
            >
              <Printer className="w-3.5 h-3.5" />
              <span>Cetak Sekarang (Print / PDF)</span>
            </button>

            <button
              id="btn-open-new-tab-print"
              onClick={handleOpenNewTab}
              className="px-3 py-2 bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-700 rounded-xl text-xs font-semibold flex items-center gap-1.5 transition-colors cursor-pointer"
              title="Buka di tab baru (direkomendasikan untuk HP Android / unduh PDF)"
            >
              <ExternalLink className="w-3.5 h-3.5" />
              <span className="hidden sm:inline">Buka di Tab Baru</span>
              <span className="sm:hidden">Tab Baru</span>
            </button>

            <button
              onClick={onClose}
              className="p-2 rounded-xl text-slate-400 hover:text-white hover:bg-slate-800 transition-colors cursor-pointer"
              title="Tutup"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* Scrollable Document Container */}
        <div className="flex-1 overflow-y-auto p-4 sm:p-8 bg-slate-100 flex justify-center">
          {/* Paper Sheet (A4 ratio preview) */}
          <div
            id={printDocumentId}
            className="bg-white w-full max-w-3xl p-8 sm:p-10 shadow-md border border-slate-200 text-black leading-normal"
            style={{ minHeight: '800px' }}
          >
            {/* 1. KOP SURAT RESMI SEKOLAH */}
            <div className="border-b-2 border-black pb-2 mb-1">
              <div className="flex items-center justify-between gap-4">
                <div className="w-20 h-20 flex-shrink-0 flex items-center justify-center">
                  <img
                    src={sekolah.logo}
                    alt="Logo"
                    className="max-h-20 max-w-20 object-contain"
                    onError={(e) => {
                      (e.target as HTMLElement).style.display = 'none';
                    }}
                  />
                </div>
                <div className="flex-1 text-center font-serif text-black">
                  <h4 className="text-xs uppercase font-bold tracking-widest leading-tight">
                    PEMERINTAH DAERAH {sekolah.kabupaten?.toUpperCase().startsWith('KABUPATEN') ? sekolah.kabupaten.toUpperCase() : `KABUPATEN ${sekolah.kabupaten?.toUpperCase() || ''}`}
                  </h4>
                  <h4 className="text-xs uppercase font-bold tracking-widest leading-tight">
                    DINAS PENDIDIKAN DAN KEBUDAYAAN
                  </h4>
                  <h2 className="text-lg font-extrabold uppercase tracking-wider my-0.5">
                    {sekolah.nama}
                  </h2>
                  <p className="text-[10px] leading-tight text-slate-700">
                    {sekolah.alamat}
                    {sekolah.kecamatan && !sekolah.alamat.toLowerCase().includes(sekolah.kecamatan.toLowerCase()) ? ` • Kec. ${sekolah.kecamatan}` : ''}
                    {sekolah.kabupaten && !sekolah.alamat.toLowerCase().includes(sekolah.kabupaten.toLowerCase()) ? `, Kab. ${sekolah.kabupaten}` : ''}
                    {` • NPSN: ${sekolah.npsn}`}
                  </p>
                  <p className="text-[10px] leading-tight text-slate-700">
                    Telepon: {sekolah.telepon} • Email: {sekolah.email}
                  </p>
                </div>
              </div>
            </div>
            {/* Garis ganda Kop Surat */}
            <div className="border-b border-black mb-6"></div>

            {/* 2. JUDUL DOKUMEN & PERIODE */}
            <div className="text-center mb-6">
              <h1 className="text-base font-bold uppercase tracking-wide text-black underline underline-offset-4 decoration-1">
                {title}
              </h1>
              <p className="text-xs font-semibold text-slate-700 mt-1 uppercase">
                {subtitle}
              </p>
            </div>

            {/* 3. METADATA DETAIL */}
            <div className="grid grid-cols-2 gap-x-6 gap-y-1 mb-4 text-xs">
              {metadata.map((m, idx) => (
                <div key={idx} className="flex">
                  <span className="w-28 font-semibold text-slate-700">{m.label}</span>
                  <span className="mr-2">:</span>
                  <span className="font-bold text-slate-900">{m.value}</span>
                </div>
              ))}
            </div>

            {/* 4. STATISTIK RINGKASAN (Jika Ada) */}
            {summaryItems && summaryItems.length > 0 && (
              <div className="flex flex-wrap gap-2 mb-4 p-2.5 bg-slate-50 border border-slate-200 rounded text-xs">
                <span className="font-bold mr-2 text-slate-800">Ringkasan:</span>
                {summaryItems.map((s, idx) => (
                  <span key={idx} className="px-2 py-0.5 rounded bg-white border border-slate-300 font-medium">
                    {s.label}: <strong className="text-slate-900">{s.count}</strong>
                  </span>
                ))}
              </div>
            )}

            {/* 5. TABEL DATA PRESENSI */}
            <div className="mb-6">
              <table className="w-full border-collapse text-xs border border-black">
                <thead>
                  <tr className="bg-slate-100 text-black font-bold">
                    {columns.map((col, idx) => (
                      <th
                        key={idx}
                        style={{ width: col.width }}
                        className={`border border-black px-2 py-1.5 text-black ${
                          col.align === 'center' ? 'text-center' : col.align === 'right' ? 'text-right' : 'text-left'
                        }`}
                      >
                        {col.header}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {data.length > 0 ? (
                    data.map((item, rowIdx) => (
                      <tr key={rowIdx} className="odd:bg-white even:bg-slate-50">
                        {columns.map((col, colIdx) => (
                          <td
                            key={colIdx}
                            className={`border border-black px-2 py-1.5 text-black ${
                              col.align === 'center' ? 'text-center' : col.align === 'right' ? 'text-right' : 'text-left'
                            }`}
                          >
                            {col.render ? col.render(item, rowIdx) : (col.key ? item[col.key] : '')}
                          </td>
                        ))}
                      </tr>
                    ))
                  ) : (
                    <tr>
                      <td colSpan={columns.length} className="border border-black px-4 py-6 text-center text-slate-500 italic">
                        Tidak ada catatan rekaman presensi pada periode/kriteria ini.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>

            {/* 6. CATATAN KETERANGAN */}
            <div className="text-[10px] text-slate-600 mb-8 italic">
              * Laporan ini dicetak secara otomatis melalui Sistem Presensi Digital Terpadu {sekolah.nama} pada tanggal {todayFormatted}.
            </div>

            {/* 7. TANDA TANGAN RESMI */}
            <div className="grid grid-cols-2 gap-8 text-xs text-black pt-4 break-inside-avoid">
              <div className="text-center">
                <p className="font-medium text-slate-600 mb-1">&nbsp;</p>
                <p className="font-bold">{signRole2}</p>
                <div className="h-20 flex items-center justify-center">
                  <span className="text-[10px] text-slate-400 italic">(Tanda Tangan)</span>
                </div>
                <p className="font-bold underline uppercase">{signName2 || 'Petugas Operator Presensi'}</p>
                <p className="text-[11px] text-slate-700">{signNip2 ? `NIP. ${signNip2}` : 'NIP. -'}</p>
              </div>

              <div className="text-center">
                <p className="font-medium text-slate-700 mb-1">{sekolah.kecamatan}, {todayFormatted}</p>
                <p className="font-bold">Kepala Sekolah,</p>
                <div className="h-20 flex items-center justify-center">
                  <span className="text-[10px] text-slate-400 italic">(Tanda Tangan & Cap Sekolah)</span>
                </div>
                <p className="font-bold underline uppercase">{sekolah.namaKepalaSekolah}</p>
                <p className="text-[11px] text-slate-700">NIP. {sekolah.nipKepalaSekolah || '-'}</p>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
