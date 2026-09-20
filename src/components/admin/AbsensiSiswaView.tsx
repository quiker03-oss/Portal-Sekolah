import React, { useState, useEffect, useRef } from 'react';
import jsQR from 'jsqr';
import confetti from 'canvas-confetti';
import { db } from '../../services/database';
import { sound } from '../../services/audio';
import { Siswa, Kelas, AbsensiSiswa, StatusAbsensi } from '../../types';
import { exportToExcel } from '../../utils/exportHelper';
import { PrintRekapModal } from './PrintRekapModal';
import { ConfirmModal } from '../common/ConfirmModal';
import {
  Camera,
  CameraOff,
  CheckCircle,
  AlertCircle,
  X,
  Search,
  Filter,
  Printer,
  FileSpreadsheet,
  QrCode,
  Calendar,
  Clock,
  UserCheck,
  Sparkles,
  Trash2,
  FileImage,
  Scan,
} from 'lucide-react';
import { usePhysicalScanner } from '../../hooks/usePhysicalScanner';
import { PhysicalScannerPanel } from '../common/PhysicalScannerPanel';

export const AbsensiSiswaView: React.FC = () => {
  const [activeTab, setActiveTab] = useState<'scan' | 'rekap'>('scan');
  const [scannerMode, setScannerMode] = useState<'physical' | 'camera'>('physical');
  const [kelasList] = useState<Kelas[]>(db.getKelasList());
  const [absensiList, setAbsensiList] = useState<AbsensiSiswa[]>(db.getAbsensiSiswaList());

  // Scanner state
  const [isCameraActive, setIsCameraActive] = useState(false);
  const [cameraError, setCameraError] = useState('');
  const [manualInputId, setManualInputId] = useState('');
  const [selectedStatus, setSelectedStatus] = useState<StatusAbsensi>('Hadir');

  // Successful scan notification banner
  const [scanResult, setScanResult] = useState<{
    success: boolean;
    message: string;
    data?: AbsensiSiswa;
  } | null>(null);

  // Video and canvas refs
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const animFrameRef = useRef<number | null>(null);
  const isScanningRef = useRef<boolean>(false);
  const lastScanTimeRef = useRef<number>(0);

  // Rekap filters
  const [rekapPeriod, setRekapPeriod] = useState<'harian' | 'bulanan' | 'semester'>('harian');
  const [filterTanggal, setFilterTanggal] = useState(new Date().toISOString().split('T')[0]);
  const [filterBulan, setFilterBulan] = useState(new Date().toISOString().slice(0, 7));
  const [filterKelas, setFilterKelas] = useState('');
  const [filterStatus, setFilterStatus] = useState('');
  const [searchRekap, setSearchRekap] = useState('');
  const [showPrintModal, setShowPrintModal] = useState(false);

  const [isConfirmOpen, setIsConfirmOpen] = useState(false);
  const [deletingId, setDeletingId] = useState<string | null>(null);

  const refreshData = () => {
    setAbsensiList(db.getAbsensiSiswaList());
  };

  useEffect(() => {
    window.addEventListener('absensi_siswa_updated', refreshData);
    return () => window.removeEventListener('absensi_siswa_updated', refreshData);
  }, []);

  // CAMERA SCANNER CONTROLS
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
      setCameraError('Gagal mengakses kamera. Mohon pastikan izin kamera diaktifkan atau gunakan input ID / unggah foto QR di bawah.');
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
    // Throttle QR decoding to ~120ms to drastically reduce CPU usage and eliminate lag
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
          processQrCode(code.data);
          // Pause momentarily to prevent multi-triggering
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
            processQrCode(code.data);
          } else {
            alert('Tidak dapat membaca QR Code pada gambar ini. Pastikan gambar jelas dan tidak buram.');
          }
        }
      };
      img.src = evt.target?.result as string;
    };
    reader.readAsDataURL(file);
  };

  const processQrCode = (qrData: string) => {
    const cleanId = qrData.trim();
    const siswa = db.getSiswaById(cleanId);

    if (!siswa) {
      sound.playError();
      setScanResult({
        success: false,
        message: `ID Siswa "${cleanId}" tidak ditemukan dalam basis data kesiswaan!`,
      });
      return;
    }

    const today = new Date().toISOString().split('T')[0];
    const nowTime = new Date().toLocaleTimeString('id-ID', { hour12: false });

    // Determine status: if scanned past 07:15, mark Terlambat if default is Hadir
    let finalStatus = selectedStatus;
    if (finalStatus === 'Hadir' && nowTime > '07:15:00') {
      finalStatus = 'Terlambat';
    }

    const res = db.recordAbsensiSiswa({
      siswaId: siswa.id,
      qrId: siswa.qrId,
      namaSiswa: siswa.namaLengkap,
      kelas: siswa.kelas,
      tanggal: today,
      jam: nowTime,
      status: finalStatus,
    });

    if (res.success) {
      sound.playSuccess();
      try {
        confetti({
          particleCount: 50,
          spread: 60,
          origin: { y: 0.7 },
        });
      } catch {
        // Ignore
      }

      setScanResult({
        success: true,
        message: 'ABSENSI BERHASIL',
        data: res.data,
      });
    } else {
      sound.playError();
      setScanResult({
        success: false,
        message: res.message,
        data: res.data,
      });
    }
  };

  const handleManualSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!manualInputId.trim()) return;
    processQrCode(manualInputId.trim());
    setManualInputId('');
  };

  // Dedicated Hardware Barcode / QR Scanner Listener
  const {
    lastScannedCode,
    lastScannedAt,
    totalPhysicalScans,
  } = usePhysicalScanner({
    onScan: (code) => {
      processQrCode(code);
    },
    enabled: activeTab === 'scan',
  });

  // REKAP FILTERING
  const filteredRekap = absensiList.filter((item) => {
    // 1. Period filter
    let matchPeriod = true;
    if (rekapPeriod === 'harian') {
      matchPeriod = item.tanggal === filterTanggal;
    } else if (rekapPeriod === 'bulanan') {
      matchPeriod = item.tanggal.startsWith(filterBulan);
    } // semester matches all in current semester term

    // 2. Class filter
    const matchKelas = filterKelas ? item.kelas === filterKelas : true;

    // 3. Status filter
    const matchStatus = filterStatus ? item.status === filterStatus : true;

    // 4. Search
    const matchSearch =
      item.namaSiswa.toLowerCase().includes(searchRekap.toLowerCase()) ||
      item.qrId.toLowerCase().includes(searchRekap.toLowerCase());

    return matchPeriod && matchKelas && matchStatus && matchSearch;
  });

  const handleExportExcel = () => {
    const data = filteredRekap.map((a, idx) => ({
      No: idx + 1,
      Tanggal: a.tanggal,
      Jam: a.jam,
      'ID QR': a.qrId,
      'Nama Siswa': a.namaSiswa,
      Kelas: a.kelas,
      Status: a.status,
      Keterangan: a.keterangan || '-',
    }));
    exportToExcel(
      data,
      `Rekap_Absensi_Siswa_Sekolah_${rekapPeriod}_${new Date().toISOString().split('T')[0]}`
    );
  };

  const handleDeleteAbsensi = (id: string) => {
    setDeletingId(id);
    setIsConfirmOpen(true);
  };

  const confirmDelete = () => {
    if (deletingId) {
      db.deleteAbsensiSiswa(deletingId);
      setIsConfirmOpen(false);
      setDeletingId(null);
    }
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h2 className="text-xl font-bold text-slate-900 tracking-tight">
            Presensi & Absensi Siswa
          </h2>
          <p className="text-xs text-slate-500 mt-0.5">
            Pindai QR Code siswa menggunakan kamera perangkat, catat kehadiran otomatis, dan pantau rekapitulasi.
          </p>
        </div>

        {/* Tab switcher */}
        <div className="flex items-center bg-slate-100 p-1 rounded-xl border border-slate-200">
          <button
            id="tab-scan-siswa"
            onClick={() => setActiveTab('scan')}
            className={`px-4 py-1.5 rounded-lg text-xs font-semibold flex items-center gap-1.5 transition-all ${
              activeTab === 'scan'
                ? 'bg-white text-blue-700 shadow-xs'
                : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            <Camera className="w-3.5 h-3.5" />
            <span>SCAN ABSENSI SISWA</span>
          </button>
          <button
            id="tab-rekap-siswa"
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
            <span>Rekap Kehadiran</span>
          </button>
        </div>
      </div>

      {/* VIEW 1: SCANNER TAB */}
      {activeTab === 'scan' && (
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
          {/* Left: Camera & Scanner View */}
          <div className="lg:col-span-7 space-y-4">
            {/* Mode Pemindai Switcher */}
            <div className="flex bg-slate-100 p-1.5 rounded-2xl border border-slate-200">
              <button
                type="button"
                onClick={() => {
                  setScannerMode('physical');
                  stopCamera();
                }}
                className={`flex-1 py-2.5 px-3 rounded-xl text-xs font-bold flex items-center justify-center gap-2 transition-all cursor-pointer ${
                  scannerMode === 'physical'
                    ? 'bg-gradient-to-r from-blue-700 to-indigo-700 text-white shadow-md shadow-blue-500/20'
                    : 'text-slate-600 hover:text-slate-900 hover:bg-white/60'
                }`}
              >
                <Scan className="w-4 h-4" />
                <span>Scanner Fisik (Barcode Gun / USB)</span>
                <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
              </button>

              <button
                type="button"
                onClick={() => setScannerMode('camera')}
                className={`flex-1 py-2.5 px-3 rounded-xl text-xs font-bold flex items-center justify-center gap-2 transition-all cursor-pointer ${
                  scannerMode === 'camera'
                    ? 'bg-white text-blue-800 shadow-xs border border-slate-200'
                    : 'text-slate-600 hover:text-slate-900 hover:bg-white/60'
                }`}
              >
                <Camera className="w-4 h-4" />
                <span>Kamera Web / HP</span>
              </button>
            </div>

            {/* Status Kehadiran Selector */}
            <div className="flex items-center justify-between px-4 py-3 bg-white rounded-2xl border border-slate-200 shadow-xs">
              <span className="text-xs font-semibold text-slate-700">Status Absen Otomatis:</span>
              <div className="flex items-center gap-2">
                <select
                  value={selectedStatus}
                  onChange={(e) => setSelectedStatus(e.target.value as StatusAbsensi)}
                  className="py-1 px-3 bg-slate-50 border border-slate-300 rounded-lg text-xs font-bold text-slate-800 cursor-pointer"
                >
                  <option value="Hadir">Hadir</option>
                  <option value="Izin">Izin</option>
                  <option value="Sakit">Sakit</option>
                  <option value="Alpa">Alpa</option>
                  <option value="Terlambat">Terlambat</option>
                </select>
              </div>
            </div>

            {/* MODE 1: PHYSICAL SCANNER (GUN / USB) */}
            {scannerMode === 'physical' && (
              <PhysicalScannerPanel
                onScan={processQrCode}
                lastScannedCode={lastScannedCode}
                lastScannedAt={lastScannedAt}
                totalScans={totalPhysicalScans}
                placeholderText="Tembakkan scanner fisik ke QR Code siswa (misal: STU-00001)..."
              />
            )}

            {/* MODE 2: WEBCAM SCANNER */}
            {scannerMode === 'camera' && (
              <div className="bg-white rounded-3xl p-6 border border-slate-200 shadow-sm space-y-5">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <div className="w-8 h-8 rounded-lg bg-blue-100 text-blue-700 flex items-center justify-center">
                      <QrCode className="w-4 h-4" />
                    </div>
                    <div>
                      <h3 className="text-sm font-bold text-slate-900">Pemindai QR Code Kamera</h3>
                      <p className="text-[11px] text-slate-500">Arahkan kamera ke kartu QR siswa</p>
                    </div>
                  </div>
                </div>

                {/* Viewfinder Frame */}
                <div className="relative aspect-4/3 w-full bg-slate-950 rounded-2xl overflow-hidden flex items-center justify-center border-4 border-slate-800 shadow-inner">
                  <video
                    ref={videoRef}
                    className={`w-full h-full object-cover ${isCameraActive ? 'block' : 'hidden'}`}
                  />
                  <canvas ref={canvasRef} className="hidden" />

                  {/* Laser scan animation overlay */}
                  {isCameraActive && (
                    <div className="absolute inset-0 pointer-events-none flex flex-col items-center justify-center p-8">
                      <div className="w-56 h-56 sm:w-64 sm:h-64 border-2 border-blue-400 rounded-2xl relative shadow-[0_0_15px_rgba(59,130,246,0.5)]">
                        <div className="absolute top-0 left-0 w-6 h-6 border-t-4 border-l-4 border-amber-400 rounded-tl" />
                        <div className="absolute top-0 right-0 w-6 h-6 border-t-4 border-r-4 border-amber-400 rounded-tr" />
                        <div className="absolute bottom-0 left-0 w-6 h-6 border-b-4 border-l-4 border-amber-400 rounded-bl" />
                        <div className="absolute bottom-0 right-0 w-6 h-6 border-b-4 border-r-4 border-amber-400 rounded-br" />
                        <div className="w-full h-0.5 bg-gradient-to-r from-transparent via-red-500 to-transparent absolute top-1/2 -translate-y-1/2 animate-pulse" />
                      </div>
                      <span className="text-[11px] text-white/80 bg-black/50 px-3 py-1 rounded-full mt-4 backdrop-blur-xs">
                        Mendeteksi QR Code Siswa...
                      </span>
                    </div>
                  )}

                  {/* Inactive overlay */}
                  {!isCameraActive && (
                    <div className="text-center p-6 space-y-3 text-slate-400">
                      <CameraOff className="w-12 h-12 mx-auto text-slate-500" />
                      <p className="text-xs max-w-xs mx-auto">
                        Kamera sedang tidak aktif. Tekan tombol di bawah untuk mengaktifkan kamera laptop / HP.
                      </p>
                      <button
                        id="btn-aktifkan-kamera"
                        onClick={startCamera}
                        className="px-5 py-2.5 bg-blue-700 hover:bg-blue-800 text-white rounded-xl text-xs font-semibold shadow-xs flex items-center gap-2 mx-auto transition-colors cursor-pointer"
                      >
                        <Camera className="w-4 h-4" />
                        <span>Aktifkan Kamera Sekarang</span>
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

                {/* Camera Controls & Alternatives */}
                <div className="flex flex-wrap items-center justify-between gap-3 pt-1">
                  {isCameraActive ? (
                    <button
                      onClick={stopCamera}
                      className="px-4 py-2 bg-rose-50 text-rose-700 hover:bg-rose-100 rounded-xl text-xs font-semibold flex items-center gap-1.5 transition-colors cursor-pointer"
                    >
                      <CameraOff className="w-4 h-4" />
                      Matikan Kamera
                    </button>
                  ) : (
                    <button
                      onClick={startCamera}
                      className="px-4 py-2 bg-blue-700 text-white hover:bg-blue-800 rounded-xl text-xs font-semibold flex items-center gap-1.5 transition-colors cursor-pointer"
                    >
                      <Camera className="w-4 h-4" />
                      Aktifkan Kamera
                    </button>
                  )}

                  <div className="flex items-center gap-2">
                    <input
                      type="file"
                      id="input-qr-image"
                      accept="image/*"
                      onChange={handleUploadQrImage}
                      className="hidden"
                    />
                    <label
                      htmlFor="input-qr-image"
                      className="px-3 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-xl text-xs font-semibold flex items-center gap-1.5 cursor-pointer transition-colors"
                    >
                      <FileImage className="w-3.5 h-3.5 text-blue-700" />
                      Unggah Gambar QR
                    </label>
                  </div>
                </div>

                {/* Manual Input Alternative */}
                <div className="pt-4 border-t border-slate-100 space-y-2">
                  <span className="block text-[11px] font-semibold text-slate-500 uppercase tracking-wider">
                    Atau Input Manual ID Siswa (Contoh: STU-00001):
                  </span>
                  <form onSubmit={handleManualSubmit} className="flex gap-2">
                    <input
                      id="input-manual-id"
                      type="text"
                      placeholder="Ketik ID Siswa (misal: STU-00001)..."
                      value={manualInputId}
                      onChange={(e) => setManualInputId(e.target.value)}
                      className="flex-1 px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs focus:bg-white focus:outline-hidden focus:ring-2 focus:ring-blue-600"
                    />
                    <button
                      type="submit"
                      className="px-4 py-2 bg-blue-700 hover:bg-blue-800 text-white rounded-xl text-xs font-semibold shadow-xs cursor-pointer"
                    >
                      Proses
                    </button>
                  </form>
                </div>
              </div>
            )}
          </div>

          {/* Right: Scan Feedback Result Card & Quick Logs */}
          <div className="lg:col-span-5 space-y-4">
            {/* Exactly as requested:
                ✓ ABSENSI BERHASIL
                Nama siswa
                Kelas
                Tanggal
                Jam
                Status HADIR
            */}
            {scanResult && scanResult.success && scanResult.data && (
              <div className="bg-gradient-to-br from-emerald-600 to-teal-700 text-white rounded-3xl p-6 shadow-xl space-y-4 animate-in zoom-in-95 duration-200 relative overflow-hidden">
                <div className="absolute -right-6 -bottom-6 w-32 h-32 bg-white/10 rounded-full blur-xl pointer-events-none" />

                <div className="flex items-center gap-3">
                  <div className="w-12 h-12 rounded-2xl bg-white text-emerald-600 flex items-center justify-center shadow-md">
                    <CheckCircle className="w-7 h-7" />
                  </div>
                  <div>
                    <h3 className="text-xl font-extrabold tracking-tight">
                      ✓ ABSENSI BERHASIL
                    </h3>
                    <span className="text-xs text-emerald-100">Presensi Presisi Sekolah</span>
                  </div>
                </div>

                <div className="bg-white/10 backdrop-blur-md rounded-2xl p-4 space-y-2 border border-white/20 text-xs">
                  <div className="flex justify-between items-center pb-2 border-b border-white/10">
                    <span className="text-emerald-100">Nama Siswa</span>
                    <span className="font-extrabold text-sm text-white">
                      {scanResult.data.namaSiswa}
                    </span>
                  </div>
                  <div className="flex justify-between items-center pb-2 border-b border-white/10">
                    <span className="text-emerald-100">Kelas</span>
                    <span className="font-bold text-white">{scanResult.data.kelas}</span>
                  </div>
                  <div className="flex justify-between items-center pb-2 border-b border-white/10">
                    <span className="text-emerald-100">Tanggal</span>
                    <span className="font-medium text-white">{scanResult.data.tanggal}</span>
                  </div>
                  <div className="flex justify-between items-center pb-2 border-b border-white/10">
                    <span className="text-emerald-100">Jam</span>
                    <span className="font-mono font-bold text-white">{scanResult.data.jam} WIB</span>
                  </div>
                  <div className="flex justify-between items-center pt-1">
                    <span className="text-emerald-100">Status Kehadiran</span>
                    <span className="px-3 py-1 rounded-full bg-white text-emerald-800 font-extrabold text-xs shadow-xs">
                      {scanResult.data.status.toUpperCase()}
                    </span>
                  </div>
                </div>

                <button
                  onClick={() => setScanResult(null)}
                  className="w-full py-2 rounded-xl bg-white/20 hover:bg-white/30 text-white text-xs font-semibold text-center transition-colors"
                >
                  Tutup Tampilan
                </button>
              </div>
            )}

            {scanResult && !scanResult.success && (
              <div className="bg-rose-50 border-2 border-rose-300 rounded-3xl p-6 text-rose-900 shadow-sm space-y-3 animate-in shake">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-xl bg-rose-100 text-rose-700 flex items-center justify-center flex-shrink-0">
                    <AlertCircle className="w-6 h-6" />
                  </div>
                  <div>
                    <h3 className="font-bold text-sm">Peringatan Presensi</h3>
                    <p className="text-xs text-rose-700 mt-0.5">{scanResult.message}</p>
                  </div>
                </div>
                {scanResult.data && (
                  <div className="bg-white/80 p-3 rounded-xl border border-rose-200 text-xs space-y-1">
                    <p>
                      <strong>Nama:</strong> {scanResult.data.namaSiswa}
                    </p>
                    <p>
                      <strong>Sudah Absen:</strong> {scanResult.data.status} pada jam{' '}
                      {scanResult.data.jam}
                    </p>
                  </div>
                )}
              </div>
            )}

            {/* Today's log stream */}
            <div className="bg-white rounded-3xl p-6 border border-slate-200 shadow-xs space-y-3">
              <div className="flex items-center justify-between pb-2 border-b border-slate-100">
                <h4 className="font-bold text-xs text-slate-800 uppercase tracking-wider">
                  Absensi Hari Ini ({new Date().toISOString().split('T')[0]})
                </h4>
                <span className="text-[11px] font-semibold text-blue-700 bg-blue-50 px-2 py-0.5 rounded">
                  {absensiList.filter((a) => a.tanggal === new Date().toISOString().split('T')[0]).length} Masuk
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
                      <div className="space-y-0.5">
                        <span className="font-bold text-slate-900 block truncate max-w-[150px]">
                          {item.namaSiswa}
                        </span>
                        <span className="text-slate-500 text-[11px]">
                          {item.kelas} • {item.jam}
                        </span>
                      </div>
                      <span
                        className={`px-2 py-0.5 rounded-full text-[10px] font-bold ${
                          item.status === 'Hadir'
                            ? 'bg-emerald-100 text-emerald-800'
                            : item.status === 'Terlambat'
                            ? 'bg-amber-100 text-amber-800'
                            : 'bg-rose-100 text-rose-800'
                        }`}
                      >
                        {item.status}
                      </span>
                    </div>
                  ))}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* VIEW 2: REKAPITULASI TAB */}
      {activeTab === 'rekap' && (
        <div className="space-y-4 animate-in fade-in">
          {/* Filter Bar */}
          <div className="bg-white rounded-2xl p-5 border border-slate-200 shadow-xs space-y-4">
            <div className="flex flex-wrap items-center justify-between gap-3 pb-3 border-b border-slate-100">
              {/* Period selection */}
              <div className="flex items-center gap-2">
                <span className="text-xs font-bold text-slate-700 uppercase">Periode Rekap:</span>
                <div className="flex bg-slate-100 p-1 rounded-xl">
                  <button
                    onClick={() => setRekapPeriod('harian')}
                    className={`px-3 py-1 rounded-lg text-xs font-semibold ${
                      rekapPeriod === 'harian' ? 'bg-white text-blue-700 shadow-xs' : 'text-slate-600'
                    }`}
                  >
                    Harian
                  </button>
                  <button
                    onClick={() => setRekapPeriod('bulanan')}
                    className={`px-3 py-1 rounded-lg text-xs font-semibold ${
                      rekapPeriod === 'bulanan' ? 'bg-white text-blue-700 shadow-xs' : 'text-slate-600'
                    }`}
                  >
                    Bulanan
                  </button>
                  <button
                    onClick={() => setRekapPeriod('semester')}
                    className={`px-3 py-1 rounded-lg text-xs font-semibold ${
                      rekapPeriod === 'semester' ? 'bg-white text-blue-700 shadow-xs' : 'text-slate-600'
                    }`}
                  >
                    Semester Ini
                  </button>
                </div>
              </div>

              {/* Action buttons: Print & Excel */}
              <div className="flex items-center gap-2">
                <button
                  id="btn-open-print-rekap-siswa"
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

            {/* Inputs & Dropdowns */}
            <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-3">
              {rekapPeriod === 'harian' && (
                <div>
                  <label className="block text-[11px] font-semibold text-slate-500 mb-1">
                    Pilih Tanggal
                  </label>
                  <input
                    type="date"
                    value={filterTanggal}
                    onChange={(e) => setFilterTanggal(e.target.value)}
                    className="w-full px-3 py-1.5 bg-slate-50 border border-slate-200 rounded-xl text-xs font-medium focus:bg-white focus:outline-hidden focus:ring-2 focus:ring-blue-600"
                  />
                </div>
              )}

              {rekapPeriod === 'bulanan' && (
                <div>
                  <label className="block text-[11px] font-semibold text-slate-500 mb-1">
                    Pilih Bulan
                  </label>
                  <input
                    type="month"
                    value={filterBulan}
                    onChange={(e) => setFilterBulan(e.target.value)}
                    className="w-full px-3 py-1.5 bg-slate-50 border border-slate-200 rounded-xl text-xs font-medium focus:bg-white focus:outline-hidden focus:ring-2 focus:ring-blue-600"
                  />
                </div>
              )}

              {kelasList.length > 1 && (
                <div>
                  <label className="block text-[11px] font-semibold text-slate-500 mb-1">
                    Filter Kelas
                  </label>
                  <select
                    value={filterKelas}
                    onChange={(e) => setFilterKelas(e.target.value)}
                    className="w-full px-3 py-1.5 bg-slate-50 border border-slate-200 rounded-xl text-xs font-medium focus:bg-white focus:outline-hidden focus:ring-2 focus:ring-blue-600"
                  >
                    <option value="">Semua Kelas</option>
                    {kelasList.map((k) => (
                      <option key={k.id} value={k.nama}>
                        {k.nama}
                      </option>
                    ))}
                  </select>
                </div>
              )}

              <div>
                <label className="block text-[11px] font-semibold text-slate-500 mb-1">
                  Filter Status
                </label>
                <select
                  value={filterStatus}
                  onChange={(e) => setFilterStatus(e.target.value)}
                  className="w-full px-3 py-1.5 bg-slate-50 border border-slate-200 rounded-xl text-xs font-medium focus:bg-white focus:outline-hidden focus:ring-2 focus:ring-blue-600"
                >
                  <option value="">Semua Status</option>
                  <option value="Hadir">Hadir</option>
                  <option value="Terlambat">Terlambat</option>
                  <option value="Izin">Izin</option>
                  <option value="Sakit">Sakit</option>
                  <option value="Alpa">Alpa</option>
                </select>
              </div>

              <div>
                <label className="block text-[11px] font-semibold text-slate-500 mb-1">
                  Cari Nama Siswa / ID
                </label>
                <div className="relative">
                  <Search className="w-3.5 h-3.5 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
                  <input
                    type="text"
                    placeholder="Ketik nama..."
                    value={searchRekap}
                    onChange={(e) => setSearchRekap(e.target.value)}
                    className="w-full pl-8 pr-3 py-1.5 bg-slate-50 border border-slate-200 rounded-xl text-xs focus:bg-white focus:outline-hidden focus:ring-2 focus:ring-blue-600"
                  />
                </div>
              </div>
            </div>
          </div>

          {/* Rekap Table */}
          <div className="bg-white rounded-2xl border border-slate-200 shadow-xs overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs">
                <thead className="bg-slate-50 border-b border-slate-200 text-slate-600 uppercase font-semibold text-[11px]">
                  <tr>
                    <th className="px-4 py-3 text-center w-12">No</th>
                    <th className="px-4 py-3">Tanggal & Jam</th>
                    <th className="px-4 py-3">ID Siswa</th>
                    <th className="px-4 py-3">Nama Siswa</th>
                    <th className="px-4 py-3">Kelas</th>
                    <th className="px-4 py-3">Status</th>
                    <th className="px-4 py-3">Keterangan</th>
                    <th className="px-4 py-3 text-center w-20">Hapus</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 text-slate-700">
                  {filteredRekap.map((item, idx) => (
                    <tr key={item.id} className="hover:bg-blue-50/40 transition-colors">
                      <td className="px-4 py-3 text-center text-slate-400 font-medium">{idx + 1}</td>
                      <td className="px-4 py-3">
                        <span className="font-semibold text-slate-900 block">{item.tanggal}</span>
                        <span className="text-[11px] text-slate-400 font-mono">{item.jam} WIB</span>
                      </td>
                      <td className="px-4 py-3">
                        <span className="font-mono text-blue-700 bg-blue-50 px-1.5 py-0.5 rounded border border-blue-200 text-[11px]">
                          {item.qrId}
                        </span>
                      </td>
                      <td className="px-4 py-3 font-bold text-slate-900">{item.namaSiswa}</td>
                      <td className="px-4 py-3">{item.kelas}</td>
                      <td className="px-4 py-3">
                        <span
                          className={`px-2.5 py-0.5 rounded-full font-bold text-[10px] ${
                            item.status === 'Hadir'
                              ? 'bg-emerald-100 text-emerald-800'
                              : item.status === 'Terlambat'
                              ? 'bg-amber-100 text-amber-800'
                              : item.status === 'Izin'
                              ? 'bg-blue-100 text-blue-800'
                              : item.status === 'Sakit'
                              ? 'bg-indigo-100 text-indigo-800'
                              : 'bg-rose-100 text-rose-800'
                          }`}
                        >
                          {item.status}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-slate-500">{item.keterangan || '-'}</td>
                      <td className="px-4 py-3 text-center">
                        <button
                          onClick={() => handleDeleteAbsensi(item.id)}
                          className="p-1 rounded-lg text-rose-600 hover:bg-rose-50"
                          title="Hapus baris absensi"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </td>
                    </tr>
                  ))}

                  {filteredRekap.length === 0 && (
                    <tr>
                      <td colSpan={8} className="text-center py-12 text-slate-400">
                        Tidak ada rekaman data absensi untuk kriteria filter ini.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* Official Print Rekap Modal */}
      <PrintRekapModal
        isOpen={showPrintModal}
        onClose={() => setShowPrintModal(false)}
        title="LAPORAN REKAPITULASI PRESENSI KEHADIRAN SISWA"
        subtitle={
          rekapPeriod === 'harian'
            ? `Tanggal Pelaksanaan: ${filterTanggal}`
            : rekapPeriod === 'bulanan'
            ? `Bulan: ${filterBulan}`
            : 'Semester Aktif Tahun Ajaran'
        }
        metadata={[
          {
            label: 'Periode Laporan',
            value:
              rekapPeriod === 'harian'
                ? `Harian (${filterTanggal})`
                : rekapPeriod === 'bulanan'
                ? `Bulanan (${filterBulan})`
                : 'Semester Aktif',
          },
          { label: 'Kelas / Rombel', value: filterKelas || 'Semua Rombongan Belajar' },
          { label: 'Filter Status', value: filterStatus || 'Semua Status Kehadiran' },
          { label: 'Total Rekaman', value: `${filteredRekap.length} data siswa` },
        ]}
        summaryItems={[
          { label: 'Hadir', count: filteredRekap.filter((i) => i.status === 'Hadir').length },
          { label: 'Terlambat', count: filteredRekap.filter((i) => i.status === 'Terlambat').length },
          { label: 'Izin', count: filteredRekap.filter((i) => i.status === 'Izin').length },
          { label: 'Sakit', count: filteredRekap.filter((i) => i.status === 'Sakit').length },
          { label: 'Alpa', count: filteredRekap.filter((i) => i.status === 'Alpa').length },
        ]}
        columns={[
          {
            header: 'No',
            render: (_, idx) => idx + 1,
            width: '35px',
            align: 'center',
          },
          { header: 'Tanggal', key: 'tanggal', width: '85px' },
          { header: 'Jam', key: 'jam', width: '65px', align: 'center' },
          { header: 'NIS / ID', key: 'qrId', width: '90px' },
          { header: 'Nama Lengkap Siswa', key: 'namaSiswa' },
          { header: 'Kelas', key: 'kelas', width: '65px', align: 'center' },
          {
            header: 'Status',
            render: (item) => (
              <span
                className={`font-bold ${
                  item.status === 'Hadir'
                    ? 'text-emerald-800'
                    : item.status === 'Terlambat'
                    ? 'text-amber-800'
                    : item.status === 'Izin'
                    ? 'text-blue-800'
                    : item.status === 'Sakit'
                    ? 'text-purple-800'
                    : 'text-rose-800'
                }`}
              >
                {item.status.toUpperCase()}
              </span>
            ),
            width: '85px',
            align: 'center',
          },
          { header: 'Keterangan', render: (item) => item.keterangan || '-' },
        ]}
        data={filteredRekap}
        signRole2="Wali Kelas / Petugas Presensi"
      />

      {/* Delete Confirmation Modal */}
      <ConfirmModal
        isOpen={isConfirmOpen}
        title="Hapus Data Absensi"
        message="Apakah Anda yakin ingin menghapus rekaman absensi ini? Data yang dihapus tidak dapat dikembalikan."
        confirmText="Hapus"
        cancelText="Batal"
        onConfirm={confirmDelete}
        onCancel={() => {
          setIsConfirmOpen(false);
          setDeletingId(null);
        }}
      />
    </div>
  );
};
