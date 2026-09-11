import React, { useState, useEffect, useRef } from 'react';
import jsQR from 'jsqr';
import confetti from 'canvas-confetti';
import { db } from '../../services/database';
import { sound } from '../../services/audio';
import { Guru, AbsensiGuru } from '../../types';
import { exportToExcel } from '../../utils/exportHelper';
import { PrintRekapModal } from './PrintRekapModal';
import {
  Camera,
  CameraOff,
  CheckCircle,
  AlertCircle,
  UserCheck,
  Search,
  Printer,
  FileSpreadsheet,
  Clock,
  Calendar,
  LogOut,
  LogIn,
  FileImage,
  Sparkles,
} from 'lucide-react';

export const AbsensiGuruView: React.FC = () => {
  const [activeTab, setActiveTab] = useState<'scan' | 'rekap'>('scan');
  const [absensiList, setAbsensiList] = useState<AbsensiGuru[]>(db.getAbsensiGuruList());
  const [guruList] = useState<Guru[]>(db.getGuruList());

  // Scanner State
  const [isCameraActive, setIsCameraActive] = useState(false);
  const [cameraError, setCameraError] = useState('');
  const [manualInputId, setManualInputId] = useState('');

  // Scan feedback result
  const [scanResult, setScanResult] = useState<{
    action: 'MASUK' | 'PULANG';
    guru: Guru;
    absensi: AbsensiGuru;
  } | null>(null);

  const videoRef = useRef<HTMLVideoElement | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const animFrameRef = useRef<number | null>(null);
  const isScanningRef = useRef<boolean>(false);
  const lastScanTimeRef = useRef<number>(0);

  // Rekap filters
  const [filterTanggal, setFilterTanggal] = useState(new Date().toISOString().split('T')[0]);
  const [searchRekap, setSearchRekap] = useState('');
  const [showPrintModal, setShowPrintModal] = useState(false);

  const refreshData = () => {
    setAbsensiList(db.getAbsensiGuruList());
  };

  useEffect(() => {
    window.addEventListener('absensi_guru_updated', refreshData);
    return () => window.removeEventListener('absensi_guru_updated', refreshData);
  }, []);

  const startCamera = async () => {
    setCameraError('');
    setScanResult(null);

    try {
      if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
        throw new Error('Kamera tidak didukung pada peramban ini.');
      }

      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: 'environment', width: { ideal: 640 }, height: { ideal: 480 } },
      });

      streamRef.current = stream;
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        videoRef.current.setAttribute('playsinline', 'true');
        await videoRef.current.play();
      }

      setIsCameraActive(true);
      isScanningRef.current = true;
      scanFrame();
    } catch (err) {
      console.error('Camera error:', err);
      setCameraError('Gagal mengakses kamera. Silakan periksa izin kamera atau gunakan input manual / upload gambar.');
      setIsCameraActive(false);
    }
  };

  const stopCamera = () => {
    if (animFrameRef.current) {
      cancelAnimationFrame(animFrameRef.current);
      animFrameRef.current = null;
    }
    if (streamRef.current) {
      streamRef.current.getTracks().forEach((track) => track.stop());
      streamRef.current = null;
    }
    isScanningRef.current = false;
    setIsCameraActive(false);
  };

  useEffect(() => {
    return () => {
      stopCamera();
    };
  }, []);

  const scanFrame = () => {
    if (!isScanningRef.current || !videoRef.current || !canvasRef.current) return;

    const now = performance.now();
    // Throttle QR decoding to ~120ms to prevent CPU lag
    if (now - lastScanTimeRef.current >= 120) {
      lastScanTimeRef.current = now;
      const video = videoRef.current;
      const canvas = canvasRef.current;
      const ctx = canvas.getContext('2d', { willReadFrequently: true });

      if (video.readyState === video.HAVE_ENOUGH_DATA && ctx) {
        canvas.height = video.videoHeight;
        canvas.width = video.videoWidth;
        ctx.drawImage(video, 0, 0, canvas.width, canvas.height);

        const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
        const code = jsQR(imageData.data, imageData.width, imageData.height, {
          inversionAttempts: 'dontInvert',
        });

        if (code && code.data) {
          processTeacherQr(code.data);
          setTimeout(() => {
            if (isScanningRef.current) {
              animFrameRef.current = requestAnimationFrame(scanFrame);
            }
          }, 2000);
          return;
        }
      }
    }

    animFrameRef.current = requestAnimationFrame(scanFrame);
  };

  const processTeacherQr = (qrData: string) => {
    const cleanId = qrData.trim();
    const guru = db.getGuruById(cleanId);

    if (!guru) {
      sound.playError();
      alert(`ID Guru "${cleanId}" tidak terdaftar di database guru.`);
      return;
    }

    const today = new Date().toISOString().split('T')[0];
    const nowTime = new Date().toLocaleTimeString('id-ID', { hour12: false });

    // Check existing record today:
    // If not exists -> Scan 1: MASUK
    // If exists and jamPulang is empty -> Scan 2: PULANG
    const existing = db.getAbsensiGuruList().find(
      (a) => a.guruId === guru.id && a.tanggal === today
    );

    if (!existing) {
      // Scan 1: MASUK
      const newRec: AbsensiGuru = {
        id: `abs-guru-${Date.now()}`,
        guruId: guru.id,
        qrId: guru.qrId,
        namaGuru: guru.nama,
        tanggal: today,
        jamMasuk: nowTime,
        status: nowTime > '07:15:00' ? 'Terlambat' : 'Hadir',
      };
      db.saveAbsensiGuru(newRec);
      sound.playSuccess();
      try {
        confetti({ particleCount: 40, spread: 50 });
      } catch {}

      setScanResult({
        action: 'MASUK',
        guru,
        absensi: newRec,
      });
    } else {
      // Scan 2: PULANG
      const updated: AbsensiGuru = {
        ...existing,
        jamPulang: nowTime,
      };
      db.saveAbsensiGuru(updated);
      sound.playSuccess();

      setScanResult({
        action: 'PULANG',
        guru,
        absensi: updated,
      });
    }
  };

  const handleManualSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!manualInputId.trim()) return;
    processTeacherQr(manualInputId.trim());
    setManualInputId('');
  };

  const handleUploadQrImage = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (evt) => {
      const img = new Image();
      img.onload = () => {
        const canvas = document.createElement('canvas');
        canvas.width = img.width;
        canvas.height = img.height;
        const ctx = canvas.getContext('2d');
        if (ctx) {
          ctx.drawImage(img, 0, 0);
          const imgData = ctx.getImageData(0, 0, canvas.width, canvas.height);
          const code = jsQR(imgData.data, imgData.width, imgData.height);
          if (code && code.data) {
            processTeacherQr(code.data);
          } else {
            alert('Tidak dapat mendeteksi QR Code guru.');
          }
        }
      };
      img.src = evt.target?.result as string;
    };
    reader.readAsDataURL(file);
  };

  // Filtered Rekap
  const filteredRekap = absensiList.filter((item) => {
    const matchTanggal = filterTanggal ? item.tanggal === filterTanggal : true;
    const matchSearch = item.namaGuru.toLowerCase().includes(searchRekap.toLowerCase());
    return matchTanggal && matchSearch;
  });

  const handleExportExcel = () => {
    const data = filteredRekap.map((a, idx) => ({
      No: idx + 1,
      Tanggal: a.tanggal,
      'Nama Guru': a.namaGuru,
      'Jam Masuk': a.jamMasuk,
      'Jam Pulang': a.jamPulang || 'Belum Pulang',
      Status: a.status,
      Keterangan: a.keterangan || '-',
    }));
    exportToExcel(
      data,
      `Rekap_Absensi_Guru_Sekolah_${filterTanggal || 'Semua'}`
    );
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h2 className="text-xl font-bold text-slate-900 tracking-tight">
            Presensi Mandiri Guru & Tendik
          </h2>
          <p className="text-xs text-slate-500 mt-0.5">
            Sistem 2-Scan: Scan pertama mencatat <strong>MASUK</strong>, scan kedua mencatat <strong>PULANG</strong>.
          </p>
        </div>

        <div className="flex items-center bg-slate-100 p-1 rounded-xl border border-slate-200">
          <button
            onClick={() => setActiveTab('scan')}
            className={`px-4 py-1.5 rounded-lg text-xs font-semibold flex items-center gap-1.5 transition-all ${
              activeTab === 'scan'
                ? 'bg-white text-blue-700 shadow-xs'
                : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            <Camera className="w-3.5 h-3.5" />
            <span>SCAN ABSENSI GURU</span>
          </button>
          <button
            onClick={() => {
              stopCamera();
              setActiveTab('rekap');
            }}
            className={`px-4 py-1.5 rounded-lg text-xs font-semibold flex items-center gap-1.5 transition-all ${
              activeTab === 'rekap'
                ? 'bg-white text-blue-700 shadow-xs'
                : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            <Calendar className="w-3.5 h-3.5" />
            <span>Rekap Kehadiran Guru</span>
          </button>
        </div>
      </div>

      {activeTab === 'scan' && (
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
          {/* Left: Camera view */}
          <div className="lg:col-span-7 space-y-4">
            <div className="bg-white rounded-3xl p-6 border border-slate-200 shadow-sm space-y-5">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <div className="w-8 h-8 rounded-lg bg-emerald-100 text-emerald-700 flex items-center justify-center">
                    <UserCheck className="w-4 h-4" />
                  </div>
                  <div>
                    <h3 className="text-sm font-bold text-slate-900">Kamera Presensi Guru</h3>
                    <p className="text-[11px] text-slate-500">Scan QR Code guru pada meja presensi</p>
                  </div>
                </div>

                <span className="text-[11px] font-semibold text-emerald-700 bg-emerald-50 px-2.5 py-1 rounded-full border border-emerald-200">
                  Sistem Masuk / Pulang Otomatis
                </span>
              </div>

              {/* Viewfinder */}
              <div className="relative aspect-4/3 w-full bg-slate-950 rounded-2xl overflow-hidden flex items-center justify-center border-4 border-slate-800 shadow-inner">
                <video
                  ref={videoRef}
                  className={`w-full h-full object-cover ${isCameraActive ? 'block' : 'hidden'}`}
                />
                <canvas ref={canvasRef} className="hidden" />

                {isCameraActive && (
                  <div className="absolute inset-0 pointer-events-none flex flex-col items-center justify-center p-8">
                    <div className="w-56 h-56 sm:w-64 sm:h-64 border-2 border-emerald-400 rounded-2xl relative shadow-[0_0_15px_rgba(16,185,129,0.5)]">
                      <div className="absolute top-0 left-0 w-6 h-6 border-t-4 border-l-4 border-emerald-400 rounded-tl" />
                      <div className="absolute top-0 right-0 w-6 h-6 border-t-4 border-r-4 border-emerald-400 rounded-tr" />
                      <div className="absolute bottom-0 left-0 w-6 h-6 border-b-4 border-l-4 border-emerald-400 rounded-bl" />
                      <div className="absolute bottom-0 right-0 w-6 h-6 border-b-4 border-r-4 border-emerald-400 rounded-br" />
                      <div className="w-full h-0.5 bg-gradient-to-r from-transparent via-emerald-400 to-transparent absolute top-1/2 -translate-y-1/2 animate-pulse" />
                    </div>
                    <span className="text-[11px] text-white/80 bg-black/50 px-3 py-1 rounded-full mt-4 backdrop-blur-xs">
                      Mendeteksi QR Code Guru...
                    </span>
                  </div>
                )}

                {!isCameraActive && (
                  <div className="text-center p-6 space-y-3 text-slate-400">
                    <CameraOff className="w-12 h-12 mx-auto text-slate-500" />
                    <p className="text-xs max-w-xs mx-auto">
                      Kamera sedang tidak aktif. Tekan tombol di bawah untuk mengaktifkan pemindai.
                    </p>
                    <button
                      onClick={startCamera}
                      className="px-5 py-2.5 bg-emerald-700 hover:bg-emerald-800 text-white rounded-xl text-xs font-semibold shadow-xs flex items-center gap-2 mx-auto transition-colors cursor-pointer"
                    >
                      <Camera className="w-4 h-4" />
                      <span>Aktifkan Kamera Guru</span>
                    </button>
                  </div>
                )}
              </div>

              {cameraError && (
                <div className="p-3 bg-amber-50 border border-amber-200 text-amber-800 rounded-xl text-xs flex items-start gap-2">
                  <AlertCircle className="w-4 h-4 text-amber-600 flex-shrink-0 mt-0.5" />
                  <span>{cameraError}</span>
                </div>
              )}

              {/* Controls */}
              <div className="flex flex-wrap items-center justify-between gap-3 pt-1">
                {isCameraActive ? (
                  <button
                    onClick={stopCamera}
                    className="px-4 py-2 bg-rose-50 text-rose-700 hover:bg-rose-100 rounded-xl text-xs font-semibold flex items-center gap-1.5 transition-colors"
                  >
                    <CameraOff className="w-4 h-4" />
                    Matikan Kamera
                  </button>
                ) : (
                  <button
                    onClick={startCamera}
                    className="px-4 py-2 bg-emerald-700 text-white hover:bg-emerald-800 rounded-xl text-xs font-semibold flex items-center gap-1.5 transition-colors"
                  >
                    <Camera className="w-4 h-4" />
                    Aktifkan Kamera
                  </button>
                )}

                <div className="flex items-center gap-2">
                  <input
                    type="file"
                    id="input-qr-guru-file"
                    accept="image/*"
                    onChange={handleUploadQrImage}
                    className="hidden"
                  />
                  <label
                    htmlFor="input-qr-guru-file"
                    className="px-3 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-xl text-xs font-semibold flex items-center gap-1.5 cursor-pointer transition-colors"
                  >
                    <FileImage className="w-3.5 h-3.5 text-emerald-700" />
                    Unggah Gambar QR
                  </label>
                </div>
              </div>

              {/* Manual Input Guru ID */}
              <div className="pt-4 border-t border-slate-100 space-y-2">
                <span className="block text-[11px] font-semibold text-slate-500 uppercase tracking-wider">
                  Atau Input Manual ID Guru (Contoh: TCH-00001):
                </span>
                <form onSubmit={handleManualSubmit} className="flex gap-2">
                  <input
                    type="text"
                    placeholder="Ketik ID Guru (misal: TCH-00001)..."
                    value={manualInputId}
                    onChange={(e) => setManualInputId(e.target.value)}
                    className="flex-1 px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs focus:bg-white focus:outline-hidden focus:ring-2 focus:ring-emerald-600"
                  />
                  <button
                    type="submit"
                    className="px-4 py-2 bg-emerald-700 hover:bg-emerald-800 text-white rounded-xl text-xs font-semibold shadow-xs"
                  >
                    Proses
                  </button>
                </form>
              </div>
            </div>
          </div>

          {/* Right: Feedback & Today's logs */}
          <div className="lg:col-span-5 space-y-4">
            {scanResult && (
              <div
                className={`rounded-3xl p-6 text-white shadow-xl space-y-4 animate-in zoom-in-95 duration-200 relative overflow-hidden ${
                  scanResult.action === 'MASUK'
                    ? 'bg-gradient-to-br from-emerald-600 to-teal-700'
                    : 'bg-gradient-to-br from-blue-700 to-indigo-800'
                }`}
              >
                <div className="flex items-center gap-3">
                  <div className="w-12 h-12 rounded-2xl bg-white text-slate-900 flex items-center justify-center shadow-md">
                    {scanResult.action === 'MASUK' ? (
                      <LogIn className="w-6 h-6 text-emerald-600" />
                    ) : (
                      <LogOut className="w-6 h-6 text-blue-600" />
                    )}
                  </div>
                  <div>
                    <h3 className="text-xl font-extrabold tracking-tight">
                      {scanResult.action === 'MASUK' ? '✓ ABSEN MASUK BERHASIL' : '✓ ABSEN PULANG TERCATAT'}
                    </h3>
                    <span className="text-xs text-white/80">Presensi Guru Satuan Pendidikan</span>
                  </div>
                </div>

                <div className="bg-white/10 backdrop-blur-md rounded-2xl p-4 space-y-2 border border-white/20 text-xs">
                  <div className="flex justify-between items-center pb-2 border-b border-white/10">
                    <span className="text-white/80">Nama Guru</span>
                    <span className="font-extrabold text-sm text-white">
                      {scanResult.guru.nama}
                    </span>
                  </div>
                  <div className="flex justify-between items-center pb-2 border-b border-white/10">
                    <span className="text-white/80">Jabatan / Mapel</span>
                    <span className="font-semibold text-white">
                      {scanResult.guru.jabatan} - {scanResult.guru.mataPelajaran}
                    </span>
                  </div>
                  <div className="flex justify-between items-center pb-2 border-b border-white/10">
                    <span className="text-white/80">Jam Masuk</span>
                    <span className="font-mono font-bold text-white">
                      {scanResult.absensi.jamMasuk} WIB
                    </span>
                  </div>
                  <div className="flex justify-between items-center pb-2 border-b border-white/10">
                    <span className="text-white/80">Jam Pulang</span>
                    <span className="font-mono font-bold text-white">
                      {scanResult.absensi.jamPulang ? `${scanResult.absensi.jamPulang} WIB` : 'Belum absen pulang'}
                    </span>
                  </div>
                  <div className="flex justify-between items-center pt-1">
                    <span className="text-white/80">Status Kehadiran</span>
                    <span className="px-3 py-1 rounded-full bg-white text-slate-900 font-extrabold text-xs shadow-xs">
                      {scanResult.absensi.status.toUpperCase()}
                    </span>
                  </div>
                </div>

                <button
                  onClick={() => setScanResult(null)}
                  className="w-full py-2 rounded-xl bg-white/20 hover:bg-white/30 text-white text-xs font-semibold text-center transition-colors"
                >
                  Tutup
                </button>
              </div>
            )}

            {/* Today's log stream */}
            <div className="bg-white rounded-3xl p-6 border border-slate-200 shadow-xs space-y-3">
              <div className="flex items-center justify-between pb-2 border-b border-slate-100">
                <h4 className="font-bold text-xs text-slate-800 uppercase tracking-wider">
                  Presensi Guru Hari Ini ({new Date().toISOString().split('T')[0]})
                </h4>
                <span className="text-[11px] font-semibold text-emerald-700 bg-emerald-50 px-2 py-0.5 rounded">
                  {absensiList.filter((a) => a.tanggal === new Date().toISOString().split('T')[0]).length} Guru Hadir
                </span>
              </div>

              <div className="space-y-2 max-h-72 overflow-y-auto pr-1">
                {absensiList
                  .filter((a) => a.tanggal === new Date().toISOString().split('T')[0])
                  .map((item) => (
                    <div
                      key={item.id}
                      className="p-3 rounded-xl bg-slate-50 border border-slate-100 flex items-center justify-between text-xs"
                    >
                      <div>
                        <span className="font-bold text-slate-900 block">{item.namaGuru}</span>
                        <div className="flex items-center gap-2 text-[11px] text-slate-500 mt-0.5">
                          <span className="text-emerald-700 font-semibold">
                            Masuk: {item.jamMasuk}
                          </span>
                          <span>•</span>
                          <span className={item.jamPulang ? 'text-blue-700 font-semibold' : 'text-slate-400'}>
                            Pulang: {item.jamPulang || '-'}
                          </span>
                        </div>
                      </div>
                      <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-emerald-100 text-emerald-800">
                        {item.status}
                      </span>
                    </div>
                  ))}

                {absensiList.filter((a) => a.tanggal === new Date().toISOString().split('T')[0]).length === 0 && (
                  <div className="text-center py-8 text-slate-400 text-xs">
                    Belum ada guru yang melakukan scan presensi hari ini.
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* VIEW 2: REKAPITULASI GURU */}
      {activeTab === 'rekap' && (
        <div className="space-y-4 animate-in fade-in">
          <div className="bg-white rounded-2xl p-5 border border-slate-200 shadow-xs flex flex-col sm:flex-row gap-4 items-center justify-between">
            <div className="flex flex-wrap items-center gap-3 w-full sm:w-auto">
              <div>
                <label className="block text-[11px] font-semibold text-slate-500 mb-1">
                  Filter Tanggal
                </label>
                <input
                  type="date"
                  value={filterTanggal}
                  onChange={(e) => setFilterTanggal(e.target.value)}
                  className="px-3 py-1.5 bg-slate-50 border border-slate-200 rounded-xl text-xs font-medium focus:bg-white focus:outline-hidden focus:ring-2 focus:ring-blue-600"
                />
              </div>

              <div>
                <label className="block text-[11px] font-semibold text-slate-500 mb-1">
                  Cari Guru
                </label>
                <div className="relative">
                  <Search className="w-3.5 h-3.5 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
                  <input
                    type="text"
                    placeholder="Nama guru..."
                    value={searchRekap}
                    onChange={(e) => setSearchRekap(e.target.value)}
                    className="pl-8 pr-3 py-1.5 bg-slate-50 border border-slate-200 rounded-xl text-xs focus:bg-white focus:outline-hidden focus:ring-2 focus:ring-blue-600"
                  />
                </div>
              </div>
            </div>

            <div className="flex items-center gap-2">
              <button
                id="btn-open-print-rekap-guru"
                onClick={() => setShowPrintModal(true)}
                className="px-3.5 py-1.5 rounded-xl bg-blue-700 hover:bg-blue-800 text-white text-xs font-semibold flex items-center gap-1.5 transition-colors shadow-xs"
              >
                <Printer className="w-3.5 h-3.5" />
                <span>Cetak Rekap</span>
              </button>
              <button
                onClick={handleExportExcel}
                className="px-3.5 py-1.5 rounded-xl bg-emerald-700 hover:bg-emerald-800 text-white text-xs font-semibold flex items-center gap-1.5 transition-colors shadow-xs"
              >
                <FileSpreadsheet className="w-3.5 h-3.5" />
                <span>Export Excel</span>
              </button>
            </div>
          </div>

          <div className="bg-white rounded-2xl border border-slate-200 shadow-xs overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs">
                <thead className="bg-slate-50 border-b border-slate-200 text-slate-600 uppercase font-semibold text-[11px]">
                  <tr>
                    <th className="px-4 py-3 text-center w-12">No</th>
                    <th className="px-4 py-3">Tanggal</th>
                    <th className="px-4 py-3">Nama Guru</th>
                    <th className="px-4 py-3">Jam Masuk (Scan 1)</th>
                    <th className="px-4 py-3">Jam Pulang (Scan 2)</th>
                    <th className="px-4 py-3">Status</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 text-slate-700">
                  {filteredRekap.map((item, idx) => (
                    <tr key={item.id} className="hover:bg-blue-50/40 transition-colors">
                      <td className="px-4 py-3 text-center text-slate-400 font-medium">{idx + 1}</td>
                      <td className="px-4 py-3 font-semibold text-slate-900">{item.tanggal}</td>
                      <td className="px-4 py-3 font-bold text-slate-900">{item.namaGuru}</td>
                      <td className="px-4 py-3 font-mono text-emerald-700 font-bold">
                        {item.jamMasuk} WIB
                      </td>
                      <td className="px-4 py-3 font-mono">
                        {item.jamPulang ? (
                          <span className="text-blue-700 font-bold">{item.jamPulang} WIB</span>
                        ) : (
                          <span className="text-slate-400 italic">Belum Pulang</span>
                        )}
                      </td>
                      <td className="px-4 py-3">
                        <span className="px-2.5 py-0.5 rounded-full font-bold text-[10px] bg-emerald-100 text-emerald-800">
                          {item.status}
                        </span>
                      </td>
                    </tr>
                  ))}

                  {filteredRekap.length === 0 && (
                    <tr>
                      <td colSpan={6} className="text-center py-12 text-slate-400">
                        Tidak ada rekaman data presensi guru untuk tanggal yang dipilih.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* Official Teacher Attendance Print Modal */}
      <PrintRekapModal
        isOpen={showPrintModal}
        onClose={() => setShowPrintModal(false)}
        title="LAPORAN REKAPITULASI PRESENSI DEWAN GURU & TENDIK"
        subtitle={`Tanggal Pelaksanaan: ${filterTanggal}`}
        metadata={[
          { label: 'Tanggal Presensi', value: filterTanggal },
          { label: 'Filter Guru', value: searchRekap ? `Pencarian "${searchRekap}"` : 'Semua Guru & Tendik' },
          { label: 'Total Kehadiran', value: `${filteredRekap.length} Guru / Tendik` },
        ]}
        summaryItems={[
          { label: 'Total Hadir', count: filteredRekap.length },
          {
            label: 'Lengkap (Masuk & Pulang)',
            count: filteredRekap.filter((i) => i.jamPulang && i.jamPulang.length > 0).length,
          },
        ]}
        columns={[
          {
            header: 'No',
            render: (_, idx) => idx + 1,
            width: '40px',
            align: 'center',
          },
          { header: 'Tanggal', key: 'tanggal', width: '90px' },
          { header: 'Nama Guru / Tenaga Pendidik', key: 'namaGuru' },
          {
            header: 'Jam Masuk (Scan 1)',
            render: (item) => `${item.jamMasuk} WIB`,
            width: '130px',
            align: 'center',
          },
          {
            header: 'Jam Pulang (Scan 2)',
            render: (item) => (item.jamPulang ? `${item.jamPulang} WIB` : '-'),
            width: '130px',
            align: 'center',
          },
          {
            header: 'Status',
            render: (item) => (
              <span className="font-bold text-emerald-800 uppercase">{item.status}</span>
            ),
            width: '90px',
            align: 'center',
          },
        ]}
        data={filteredRekap}
        signRole2="Koordinator Kepegawaian / Operator"
      />
    </div>
  );
};
