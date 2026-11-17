import React, { useState, useEffect, useRef } from 'react';
import jsQR from 'jsqr';
import confetti from 'canvas-confetti';
import { db } from '../../services/database';
import { sound } from '../../services/audio';
import { Guru, AbsensiGuru } from '../../types';
import { exportToExcel } from '../../utils/exportHelper';
import { getWibDateStr, getWibTimeStr } from '../../utils/dateHelper';
import { toast } from '../../utils/toast';
import { PrintRekapModal } from './PrintRekapModal';
import {
  Camera,
  CameraOff,
  AlertCircle,
  UserCheck,
  Search,
  Printer,
  FileSpreadsheet,
  Calendar,
  LogOut,
  LogIn,
  FileImage,
  Scan,
  Trash2,
  X,
} from 'lucide-react';
import { usePhysicalScanner } from '../../hooks/usePhysicalScanner';
import { PhysicalScannerPanel } from '../common/PhysicalScannerPanel';
import { ConfirmModal } from '../common/ConfirmModal';

const GURU_STATUS_OPTIONS: AbsensiGuru['status'][] = [
  'Hadir',
  'Terlambat',
  'Izin',
  'Sakit',
  'Alpa',
  'Dinas Luar',
];

const getGuruStatusBadgeClass = (status: AbsensiGuru['status']): string => {
  switch (status) {
    case 'Hadir':
      return 'bg-emerald-100 text-emerald-800';
    case 'Terlambat':
      return 'bg-amber-100 text-amber-800';
    case 'Izin':
      return 'bg-blue-100 text-blue-800';
    case 'Sakit':
      return 'bg-indigo-100 text-indigo-800';
    case 'Alpa':
      return 'bg-rose-100 text-rose-800';
    case 'Dinas Luar':
      return 'bg-teal-100 text-teal-800';
    default:
      return 'bg-slate-100 text-slate-800';
  }
};

export const AbsensiGuruView: React.FC = () => {
  const [activeTab, setActiveTab] = useState<'scan' | 'rekap'>('scan');
  const [scannerMode, setScannerMode] = useState<'physical' | 'camera'>('physical');
  const [absensiList, setAbsensiList] = useState<AbsensiGuru[]>(db.getAbsensiGuruList());
  const [guruList, setGuruList] = useState<Guru[]>(db.getGuruList());

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

  // Rekap filters & modes
  const [rekapPeriod, setRekapPeriod] = useState<'harian' | 'bulanan' | 'semester'>('harian');
  const [rekapViewMode, setRekapViewMode] = useState<'per_guru' | 'detail'>('per_guru');
  const [filterTanggal, setFilterTanggal] = useState(getWibDateStr());
  const [filterBulan, setFilterBulan] = useState(getWibDateStr().slice(0, 7));
  const [filterStatus, setFilterStatus] = useState('');
  const [searchRekap, setSearchRekap] = useState('');
  const [showPrintModal, setShowPrintModal] = useState(false);
  const [deleteTargetAbsensi, setDeleteTargetAbsensi] = useState<AbsensiGuru | null>(null);

  // Quick manual Izin / Sakit / Alpa / Dinas Luar modal
  const [showManualAbsenModal, setShowManualAbsenModal] = useState(false);
  const [manualGuruId, setManualGuruId] = useState('');
  const [manualTanggal, setManualTanggal] = useState(getWibDateStr());
  const [manualStatus, setManualStatus] = useState<AbsensiGuru['status']>('Izin');
  const [manualKeterangan, setManualKeterangan] = useState('');

  const refreshData = () => {
    setAbsensiList(db.getAbsensiGuruList());
    setGuruList(db.getGuruList());
  };

  const confirmDeleteAbsensi = () => {
    if (!deleteTargetAbsensi) return;
    db.deleteAbsensiGuru(deleteTargetAbsensi.id);
    setDeleteTargetAbsensi(null);
    refreshData();
  };

  useEffect(() => {
    window.addEventListener('absensi_guru_updated', refreshData);
    window.addEventListener('data_guru_changed', refreshData);
    return () => {
      window.removeEventListener('absensi_guru_updated', refreshData);
      window.removeEventListener('data_guru_changed', refreshData);
    };
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
      toast.error(`ID Guru "${cleanId}" tidak terdaftar di database guru.`);
      return;
    }

    const today = getWibDateStr();
    const nowTime = getWibTimeStr();

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

  // Dedicated Hardware Barcode / QR Scanner Listener for Teachers
  const {
    lastScannedCode,
    lastScannedAt,
    totalPhysicalScans,
  } = usePhysicalScanner({
    onScan: (code) => {
      processTeacherQr(code);
    },
    enabled: activeTab === 'scan',
  });

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
            toast.error('Tidak dapat mendeteksi QR Code guru.');
          }
        }
      };
      img.src = evt.target?.result as string;
    };
    reader.readAsDataURL(file);
    e.target.value = '';
  };

  // Rekap Filtering (without status filter so summary counters stay accurate)
  const baseRekapWithoutStatus = absensiList.filter((item) => {
    let matchPeriod = true;
    if (rekapPeriod === 'harian') {
      matchPeriod = filterTanggal ? item.tanggal === filterTanggal : true;
    } else if (rekapPeriod === 'bulanan') {
      matchPeriod = filterBulan ? item.tanggal.startsWith(filterBulan) : true;
    }

    const q = searchRekap.toLowerCase();
    const matchSearch =
      item.namaGuru.toLowerCase().includes(q) || (item.qrId || '').toLowerCase().includes(q);
    return matchPeriod && matchSearch;
  });

  const filteredRekap = baseRekapWithoutStatus.filter((item) =>
    filterStatus ? item.status === filterStatus : true
  );

  // Overall status summary counters (Hadir, Terlambat, Izin, Sakit, Alpa, Dinas Luar)
  const statusSummaryCounts = {
    total: baseRekapWithoutStatus.length,
    hadir: baseRekapWithoutStatus.filter((i) => i.status === 'Hadir').length,
    terlambat: baseRekapWithoutStatus.filter((i) => i.status === 'Terlambat').length,
    izin: baseRekapWithoutStatus.filter((i) => i.status === 'Izin').length,
    sakit: baseRekapWithoutStatus.filter((i) => i.status === 'Sakit').length,
    alpa: baseRekapWithoutStatus.filter((i) => i.status === 'Alpa').length,
    dinasLuar: baseRekapWithoutStatus.filter((i) => i.status === 'Dinas Luar').length,
  };

  // Per-teacher aggregated summary
  const perGuruRekap = React.useMemo(() => {
    const q = searchRekap.toLowerCase();
    const filteredTeachers = guruList.filter(
      (g) =>
        g.nama.toLowerCase().includes(q) ||
        (g.qrId || '').toLowerCase().includes(q) ||
        (g.nip || '').toLowerCase().includes(q)
    );

    const rows = filteredTeachers.map((g) => {
      const recs = baseRekapWithoutStatus.filter((a) => a.guruId === g.id || a.qrId === g.qrId);
      const hadir = recs.filter((r) => r.status === 'Hadir').length;
      const terlambat = recs.filter((r) => r.status === 'Terlambat').length;
      const izin = recs.filter((r) => r.status === 'Izin').length;
      const sakit = recs.filter((r) => r.status === 'Sakit').length;
      const alpa = recs.filter((r) => r.status === 'Alpa').length;
      const dinasLuar = recs.filter((r) => r.status === 'Dinas Luar').length;
      return {
        guruId: g.id,
        qrId: g.qrId,
        namaGuru: g.nama,
        jabatan: g.jabatan || '-',
        hadir,
        terlambat,
        izin,
        sakit,
        alpa,
        dinasLuar,
        total: recs.length,
      };
    });

    if (!filterStatus) return rows;
    return rows.filter((r) => {
      if (filterStatus === 'Hadir') return r.hadir > 0;
      if (filterStatus === 'Terlambat') return r.terlambat > 0;
      if (filterStatus === 'Izin') return r.izin > 0;
      if (filterStatus === 'Sakit') return r.sakit > 0;
      if (filterStatus === 'Alpa') return r.alpa > 0;
      if (filterStatus === 'Dinas Luar') return r.dinasLuar > 0;
      return true;
    });
  }, [guruList, baseRekapWithoutStatus, searchRekap, filterStatus]);

  const handleSaveManualStatus = (e: React.FormEvent) => {
    e.preventDefault();
    const guru = guruList.find((g) => g.id === manualGuruId);
    if (!guru) {
      toast.warning('Silakan pilih guru terlebih dahulu.');
      return;
    }

    const targetDate = manualTanggal || getWibDateStr();
    const existing = absensiList.find((a) => a.guruId === guru.id && a.tanggal === targetDate);
    const isPresentStatus = manualStatus === 'Hadir' || manualStatus === 'Terlambat';

    const record: AbsensiGuru = {
      id: existing ? existing.id : `abs-guru-${Date.now()}`,
      guruId: guru.id,
      qrId: guru.qrId,
      namaGuru: guru.nama,
      tanggal: targetDate,
      jamMasuk: existing?.jamMasuk && existing.jamMasuk !== '-' ? existing.jamMasuk : isPresentStatus ? getWibTimeStr() : '-',
      jamPulang: existing?.jamPulang,
      status: manualStatus,
      keterangan: manualKeterangan.trim() || undefined,
    };

    db.saveAbsensiGuru(record);
    toast.success(
      `${existing ? 'Status presensi diperbarui' : 'Presensi dicatat'}: ${guru.nama} (${manualStatus})`
    );
    setShowManualAbsenModal(false);
    setManualKeterangan('');
    refreshData();
  };

  const handleQuickChangeStatus = (item: AbsensiGuru, nextStatus: AbsensiGuru['status']) => {
    const updated: AbsensiGuru = {
      ...item,
      status: nextStatus,
    };
    db.saveAbsensiGuru(updated);
    toast.success(`Status ${item.namaGuru} diubah menjadi ${nextStatus}.`);
    refreshData();
  };

  const handleExportExcel = () => {
    if (rekapViewMode === 'per_guru') {
      const data = perGuruRekap.map((r, idx) => ({
        No: idx + 1,
        'ID QR': r.qrId,
        'Nama Guru': r.namaGuru,
        Jabatan: r.jabatan,
        Hadir: r.hadir,
        Terlambat: r.terlambat,
        Izin: r.izin,
        Sakit: r.sakit,
        'Alpa / Alfa': r.alpa,
        'Dinas Luar': r.dinasLuar,
        'Total Tercatat': r.total,
      }));
      exportToExcel(
        data,
        `Rekap_Jumlah_Absensi_Guru_${rekapPeriod}_${new Date().toISOString().split('T')[0]}`
      );
      return;
    }

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
      `Rekap_Absensi_Guru_Sekolah_${rekapPeriod}_${filterTanggal || 'Semua'}`
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
                    ? 'bg-gradient-to-r from-emerald-700 to-teal-700 text-white shadow-md shadow-emerald-500/20'
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
                    ? 'bg-white text-emerald-800 shadow-xs border border-slate-200'
                    : 'text-slate-600 hover:text-slate-900 hover:bg-white/60'
                }`}
              >
                <Camera className="w-4 h-4" />
                <span>Kamera Web / HP</span>
              </button>
            </div>

            {/* MODE 1: PHYSICAL SCANNER */}
            {scannerMode === 'physical' && (
              <PhysicalScannerPanel
                onScan={processTeacherQr}
                lastScannedCode={lastScannedCode}
                lastScannedAt={lastScannedAt}
                totalScans={totalPhysicalScans}
                placeholderText="Tembakkan scanner fisik ke QR Code guru (misal: TCH-00001)..."
                isTeacher={true}
              />
            )}

            {/* MODE 2: WEBCAM SCANNER */}
            {scannerMode === 'camera' && (
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
                      className="px-4 py-2 bg-rose-50 text-rose-700 hover:bg-rose-100 rounded-xl text-xs font-semibold flex items-center gap-1.5 transition-colors cursor-pointer"
                    >
                      <CameraOff className="w-4 h-4" />
                      Matikan Kamera
                    </button>
                  ) : (
                    <button
                      onClick={startCamera}
                      className="px-4 py-2 bg-emerald-700 text-white hover:bg-emerald-800 rounded-xl text-xs font-semibold flex items-center gap-1.5 transition-colors cursor-pointer"
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
                      className="px-4 py-2 bg-emerald-700 hover:bg-emerald-800 text-white rounded-xl text-xs font-semibold shadow-xs cursor-pointer"
                    >
                      Proses
                    </button>
                  </form>
                </div>
              </div>
            )}
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
                  Presensi Guru Hari Ini ({getWibDateStr()})
                </h4>
                <span className="text-[11px] font-semibold text-emerald-700 bg-emerald-50 px-2 py-0.5 rounded">
                  {absensiList.filter((a) => a.tanggal === getWibDateStr()).length} Guru Hadir
                </span>
              </div>

              <div className="space-y-2 max-h-72 overflow-y-auto pr-1">
                {absensiList
                  .filter((a) => a.tanggal === getWibDateStr())
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
                      <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold ${getGuruStatusBadgeClass(item.status)}`}>
                        {item.status}
                      </span>
                    </div>
                  ))}

                {absensiList.filter((a) => a.tanggal === getWibDateStr()).length === 0 && (
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
          {/* Filter Bar */}
          <div className="bg-white rounded-2xl p-5 border border-slate-200 shadow-xs space-y-4">
            <div className="flex flex-wrap items-center justify-between gap-3 pb-3 border-b border-slate-100">
              <div className="flex items-center gap-2">
                <span className="text-xs font-bold text-slate-700 uppercase">Periode Rekap:</span>
                <div className="flex bg-slate-100 p-1 rounded-xl">
                  <button
                    type="button"
                    onClick={() => setRekapPeriod('harian')}
                    className={`px-3 py-1 rounded-lg text-xs font-semibold cursor-pointer ${
                      rekapPeriod === 'harian' ? 'bg-white text-blue-700 shadow-xs' : 'text-slate-600'
                    }`}
                  >
                    Harian
                  </button>
                  <button
                    type="button"
                    onClick={() => setRekapPeriod('bulanan')}
                    className={`px-3 py-1 rounded-lg text-xs font-semibold cursor-pointer ${
                      rekapPeriod === 'bulanan' ? 'bg-white text-blue-700 shadow-xs' : 'text-slate-600'
                    }`}
                  >
                    Bulanan
                  </button>
                  <button
                    type="button"
                    onClick={() => setRekapPeriod('semester')}
                    className={`px-3 py-1 rounded-lg text-xs font-semibold cursor-pointer ${
                      rekapPeriod === 'semester' ? 'bg-white text-blue-700 shadow-xs' : 'text-slate-600'
                    }`}
                  >
                    Semester Ini
                  </button>
                </div>
              </div>

              <div className="flex flex-wrap items-center gap-2">
                <button
                  type="button"
                  onClick={() => {
                    setManualGuruId(guruList[0]?.id || '');
                    setManualTanggal(rekapPeriod === 'harian' ? filterTanggal : getWibDateStr());
                    setManualStatus('Izin');
                    setManualKeterangan('');
                    setShowManualAbsenModal(true);
                  }}
                  className="px-3.5 py-1.5 rounded-xl bg-amber-500 hover:bg-amber-600 text-white text-xs font-semibold flex items-center gap-1.5 transition-colors shadow-xs cursor-pointer"
                >
                  <UserCheck className="w-3.5 h-3.5" />
                  <span>+ Catat Izin / Sakit / Alpa</span>
                </button>
                <button
                  id="btn-open-print-rekap-guru"
                  onClick={() => setShowPrintModal(true)}
                  className="px-3.5 py-1.5 rounded-xl bg-blue-700 hover:bg-blue-800 text-white text-xs font-semibold flex items-center gap-1.5 transition-colors shadow-xs cursor-pointer"
                >
                  <Printer className="w-3.5 h-3.5" />
                  <span>Cetak Rekap</span>
                </button>
                <button
                  onClick={handleExportExcel}
                  className="px-3.5 py-1.5 rounded-xl bg-emerald-700 hover:bg-emerald-800 text-white text-xs font-semibold flex items-center gap-1.5 transition-colors shadow-xs cursor-pointer"
                >
                  <FileSpreadsheet className="w-3.5 h-3.5" />
                  <span>Export Excel</span>
                </button>
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              {rekapPeriod === 'harian' && (
                <div>
                  <label className="block text-[11px] font-semibold text-slate-500 mb-1">
                    Filter Tanggal
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
                  <option value="Alpa">Alpa / Alfa</option>
                  <option value="Dinas Luar">Dinas Luar</option>
                </select>
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
                    className="w-full pl-8 pr-3 py-1.5 bg-slate-50 border border-slate-200 rounded-xl text-xs focus:bg-white focus:outline-hidden focus:ring-2 focus:ring-blue-600"
                  />
                </div>
              </div>
            </div>
          </div>

          {/* Summary Stat Strip: Total, Hadir, Terlambat, Izin, Sakit, Alpa, Dinas Luar */}
          <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-7 gap-3">
            <button
              type="button"
              onClick={() => setFilterStatus('')}
              className={`p-3.5 rounded-2xl border text-left transition-all cursor-pointer ${
                filterStatus === ''
                  ? 'bg-slate-900 text-white border-slate-900 shadow-sm'
                  : 'bg-white border-slate-200 hover:border-slate-300'
              }`}
            >
              <span className={`text-[11px] font-bold uppercase tracking-wider block ${filterStatus === '' ? 'text-slate-300' : 'text-slate-500'}`}>
                Total Tercatat
              </span>
              <span className="text-xl font-extrabold mt-0.5 block">{statusSummaryCounts.total}</span>
            </button>

            <button
              type="button"
              onClick={() => setFilterStatus(filterStatus === 'Hadir' ? '' : 'Hadir')}
              className={`p-3.5 rounded-2xl border text-left transition-all cursor-pointer ${
                filterStatus === 'Hadir'
                  ? 'bg-emerald-600 text-white border-emerald-600 shadow-sm'
                  : 'bg-emerald-50/70 border-emerald-200 text-emerald-900 hover:bg-emerald-100/70'
              }`}
            >
              <span className={`text-[11px] font-bold uppercase tracking-wider block ${filterStatus === 'Hadir' ? 'text-emerald-100' : 'text-emerald-700'}`}>
                Hadir
              </span>
              <span className="text-xl font-extrabold mt-0.5 block">{statusSummaryCounts.hadir}</span>
            </button>

            <button
              type="button"
              onClick={() => setFilterStatus(filterStatus === 'Terlambat' ? '' : 'Terlambat')}
              className={`p-3.5 rounded-2xl border text-left transition-all cursor-pointer ${
                filterStatus === 'Terlambat'
                  ? 'bg-amber-600 text-white border-amber-600 shadow-sm'
                  : 'bg-amber-50/70 border-amber-200 text-amber-900 hover:bg-amber-100/70'
              }`}
            >
              <span className={`text-[11px] font-bold uppercase tracking-wider block ${filterStatus === 'Terlambat' ? 'text-amber-100' : 'text-amber-700'}`}>
                Terlambat
              </span>
              <span className="text-xl font-extrabold mt-0.5 block">{statusSummaryCounts.terlambat}</span>
            </button>

            <button
              type="button"
              onClick={() => setFilterStatus(filterStatus === 'Izin' ? '' : 'Izin')}
              className={`p-3.5 rounded-2xl border text-left transition-all cursor-pointer ${
                filterStatus === 'Izin'
                  ? 'bg-blue-600 text-white border-blue-600 shadow-sm'
                  : 'bg-blue-50/70 border-blue-200 text-blue-900 hover:bg-blue-100/70'
              }`}
            >
              <span className={`text-[11px] font-bold uppercase tracking-wider block ${filterStatus === 'Izin' ? 'text-blue-100' : 'text-blue-700'}`}>
                Izin
              </span>
              <span className="text-xl font-extrabold mt-0.5 block">{statusSummaryCounts.izin}</span>
            </button>

            <button
              type="button"
              onClick={() => setFilterStatus(filterStatus === 'Sakit' ? '' : 'Sakit')}
              className={`p-3.5 rounded-2xl border text-left transition-all cursor-pointer ${
                filterStatus === 'Sakit'
                  ? 'bg-indigo-600 text-white border-indigo-600 shadow-sm'
                  : 'bg-indigo-50/70 border-indigo-200 text-indigo-900 hover:bg-indigo-100/70'
              }`}
            >
              <span className={`text-[11px] font-bold uppercase tracking-wider block ${filterStatus === 'Sakit' ? 'text-indigo-100' : 'text-indigo-700'}`}>
                Sakit
              </span>
              <span className="text-xl font-extrabold mt-0.5 block">{statusSummaryCounts.sakit}</span>
            </button>

            <button
              type="button"
              onClick={() => setFilterStatus(filterStatus === 'Alpa' ? '' : 'Alpa')}
              className={`p-3.5 rounded-2xl border text-left transition-all cursor-pointer ${
                filterStatus === 'Alpa'
                  ? 'bg-rose-600 text-white border-rose-600 shadow-sm'
                  : 'bg-rose-50/70 border-rose-200 text-rose-900 hover:bg-rose-100/70'
              }`}
            >
              <span className={`text-[11px] font-bold uppercase tracking-wider block ${filterStatus === 'Alpa' ? 'text-rose-100' : 'text-rose-700'}`}>
                Alpa / Alfa
              </span>
              <span className="text-xl font-extrabold mt-0.5 block">{statusSummaryCounts.alpa}</span>
            </button>

            <button
              type="button"
              onClick={() => setFilterStatus(filterStatus === 'Dinas Luar' ? '' : 'Dinas Luar')}
              className={`p-3.5 rounded-2xl border text-left transition-all cursor-pointer ${
                filterStatus === 'Dinas Luar'
                  ? 'bg-teal-600 text-white border-teal-600 shadow-sm'
                  : 'bg-teal-50/70 border-teal-200 text-teal-900 hover:bg-teal-100/70'
              }`}
            >
              <span className={`text-[11px] font-bold uppercase tracking-wider block ${filterStatus === 'Dinas Luar' ? 'text-teal-100' : 'text-teal-700'}`}>
                Dinas Luar
              </span>
              <span className="text-xl font-extrabold mt-0.5 block">{statusSummaryCounts.dinasLuar}</span>
            </button>
          </div>

          {/* View Mode Toggle: Ringkasan Per Guru vs Log Detail Harian */}
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="flex bg-slate-100 p-1 rounded-xl border border-slate-200">
              <button
                type="button"
                onClick={() => setRekapViewMode('per_guru')}
                className={`px-3.5 py-1.5 rounded-lg text-xs font-bold transition-all cursor-pointer ${
                  rekapViewMode === 'per_guru'
                    ? 'bg-white text-blue-700 shadow-xs'
                    : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                Rekap Jumlah Per Guru (H / T / I / S / A)
              </button>
              <button
                type="button"
                onClick={() => setRekapViewMode('detail')}
                className={`px-3.5 py-1.5 rounded-lg text-xs font-bold transition-all cursor-pointer ${
                  rekapViewMode === 'detail'
                    ? 'bg-white text-blue-700 shadow-xs'
                    : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                Log Riwayat Harian ({filteredRekap.length})
              </button>
            </div>
            <span className="text-[11px] text-slate-500">
              Klik kartu status di atas untuk memfilter cepat berdasarkan Hadir, Izin, Sakit, atau Alpa.
            </span>
          </div>

          {/* Table 1: Rekap Jumlah Per Guru */}
          {rekapViewMode === 'per_guru' && (
            <div className="bg-white rounded-2xl border border-slate-200 shadow-xs overflow-hidden">
              <div className="overflow-x-auto">
                <table className="w-full text-left text-xs">
                  <thead className="bg-slate-50 border-b border-slate-200 text-slate-600 uppercase font-semibold text-[11px]">
                    <tr>
                      <th className="px-4 py-3 text-center w-12">No</th>
                      <th className="px-4 py-3">ID QR</th>
                      <th className="px-4 py-3">Nama Guru / Tendik</th>
                      <th className="px-4 py-3">Jabatan</th>
                      <th className="px-3 py-3 text-center text-emerald-700">Hadir</th>
                      <th className="px-3 py-3 text-center text-amber-700">Terlambat</th>
                      <th className="px-3 py-3 text-center text-blue-700">Izin</th>
                      <th className="px-3 py-3 text-center text-indigo-700">Sakit</th>
                      <th className="px-3 py-3 text-center text-rose-700">Alpa</th>
                      <th className="px-3 py-3 text-center text-teal-700">Dinas Luar</th>
                      <th className="px-3 py-3 text-center">Total</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100 text-slate-700">
                    {perGuruRekap.map((row, idx) => (
                      <tr key={row.guruId} className="hover:bg-blue-50/40 transition-colors">
                        <td className="px-4 py-3 text-center text-slate-400 font-medium">{idx + 1}</td>
                        <td className="px-4 py-3">
                          <span className="font-mono text-emerald-700 bg-emerald-50 px-1.5 py-0.5 rounded border border-emerald-200 text-[11px]">
                            {row.qrId}
                          </span>
                        </td>
                        <td className="px-4 py-3 font-bold text-slate-900">{row.namaGuru}</td>
                        <td className="px-4 py-3 text-slate-600">{row.jabatan}</td>
                        <td className="px-3 py-3 text-center">
                          <span className={`inline-block min-w-7 px-2 py-0.5 rounded-full font-bold text-[11px] ${row.hadir > 0 ? 'bg-emerald-100 text-emerald-800' : 'text-slate-400'}`}>
                            {row.hadir}
                          </span>
                        </td>
                        <td className="px-3 py-3 text-center">
                          <span className={`inline-block min-w-7 px-2 py-0.5 rounded-full font-bold text-[11px] ${row.terlambat > 0 ? 'bg-amber-100 text-amber-800' : 'text-slate-400'}`}>
                            {row.terlambat}
                          </span>
                        </td>
                        <td className="px-3 py-3 text-center">
                          <span className={`inline-block min-w-7 px-2 py-0.5 rounded-full font-bold text-[11px] ${row.izin > 0 ? 'bg-blue-100 text-blue-800' : 'text-slate-400'}`}>
                            {row.izin}
                          </span>
                        </td>
                        <td className="px-3 py-3 text-center">
                          <span className={`inline-block min-w-7 px-2 py-0.5 rounded-full font-bold text-[11px] ${row.sakit > 0 ? 'bg-indigo-100 text-indigo-800' : 'text-slate-400'}`}>
                            {row.sakit}
                          </span>
                        </td>
                        <td className="px-3 py-3 text-center">
                          <span className={`inline-block min-w-7 px-2 py-0.5 rounded-full font-bold text-[11px] ${row.alpa > 0 ? 'bg-rose-100 text-rose-800' : 'text-slate-400'}`}>
                            {row.alpa}
                          </span>
                        </td>
                        <td className="px-3 py-3 text-center">
                          <span className={`inline-block min-w-7 px-2 py-0.5 rounded-full font-bold text-[11px] ${row.dinasLuar > 0 ? 'bg-teal-100 text-teal-800' : 'text-slate-400'}`}>
                            {row.dinasLuar}
                          </span>
                        </td>
                        <td className="px-3 py-3 text-center font-bold text-slate-900">{row.total}</td>
                      </tr>
                    ))}

                    {perGuruRekap.length === 0 && (
                      <tr>
                        <td colSpan={11} className="text-center py-12 text-slate-400">
                          Tidak ada data guru yang cocok dengan filter ini.
                        </td>
                      </tr>
                    )}
                  </tbody>
                  {perGuruRekap.length > 0 && (
                    <tfoot className="bg-slate-50 border-t-2 border-slate-200 font-extrabold text-xs text-slate-900">
                      <tr>
                        <td colSpan={4} className="px-4 py-3 text-right uppercase tracking-wider text-slate-600">
                          Jumlah Total Periode Ini:
                        </td>
                        <td className="px-3 py-3 text-center text-emerald-700">{statusSummaryCounts.hadir}</td>
                        <td className="px-3 py-3 text-center text-amber-700">{statusSummaryCounts.terlambat}</td>
                        <td className="px-3 py-3 text-center text-blue-700">{statusSummaryCounts.izin}</td>
                        <td className="px-3 py-3 text-center text-indigo-700">{statusSummaryCounts.sakit}</td>
                        <td className="px-3 py-3 text-center text-rose-700">{statusSummaryCounts.alpa}</td>
                        <td className="px-3 py-3 text-center text-teal-700">{statusSummaryCounts.dinasLuar}</td>
                        <td className="px-3 py-3 text-center text-slate-900">{statusSummaryCounts.total}</td>
                      </tr>
                    </tfoot>
                  )}
                </table>
              </div>
            </div>
          )}

          {/* Table 2: Log Detail Harian */}
          {rekapViewMode === 'detail' && (
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
                      <th className="px-4 py-3">Keterangan</th>
                      <th className="px-4 py-3 text-center w-20">Aksi</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100 text-slate-700">
                    {filteredRekap.map((item, idx) => (
                      <tr key={item.id} className="hover:bg-blue-50/40 transition-colors">
                        <td className="px-4 py-3 text-center text-slate-400 font-medium">{idx + 1}</td>
                        <td className="px-4 py-3 font-semibold text-slate-900">{item.tanggal}</td>
                        <td className="px-4 py-3 font-bold text-slate-900">{item.namaGuru}</td>
                        <td className="px-4 py-3 font-mono text-emerald-700 font-bold">
                          {item.jamMasuk && item.jamMasuk !== '-' ? `${item.jamMasuk} WIB` : '-'}
                        </td>
                        <td className="px-4 py-3 font-mono">
                          {item.jamPulang ? (
                            <span className="text-blue-700 font-bold">{item.jamPulang} WIB</span>
                          ) : (
                            <span className="text-slate-400 italic">Belum Pulang</span>
                          )}
                        </td>
                        <td className="px-4 py-3">
                          <select
                            value={item.status}
                            onChange={(e) =>
                              handleQuickChangeStatus(item, e.target.value as AbsensiGuru['status'])
                            }
                            className={`px-2.5 py-1 rounded-full font-bold text-[10px] border-0 cursor-pointer focus:ring-2 focus:ring-blue-500 ${getGuruStatusBadgeClass(item.status)}`}
                            title="Ubah status kehadiran guru"
                          >
                            {GURU_STATUS_OPTIONS.map((opt) => (
                              <option key={opt} value={opt}>
                                {opt}
                              </option>
                            ))}
                          </select>
                        </td>
                        <td className="px-4 py-3 text-slate-500">{item.keterangan || '-'}</td>
                        <td className="px-4 py-3 text-center">
                          <button
                            type="button"
                            onClick={() => setDeleteTargetAbsensi(item)}
                            title="Hapus Rekaman Presensi"
                            className="p-1.5 rounded-lg text-rose-500 hover:bg-rose-50 transition-colors cursor-pointer"
                          >
                            <Trash2 className="w-4 h-4" />
                          </button>
                        </td>
                      </tr>
                    ))}

                    {filteredRekap.length === 0 && (
                      <tr>
                        <td colSpan={8} className="text-center py-12 text-slate-400">
                          Tidak ada rekaman data presensi guru untuk kriteria filter yang dipilih.
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </div>
      )}

      {/* Modal Input Cepat Izin / Sakit / Alpa Guru */}
      {showManualAbsenModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-xs">
          <form
            onSubmit={handleSaveManualStatus}
            className="bg-white w-full max-w-md rounded-3xl p-6 shadow-2xl border border-slate-200 space-y-4 animate-in zoom-in-95"
          >
            <div className="flex items-center justify-between border-b border-slate-100 pb-3">
              <div>
                <h3 className="text-base font-extrabold text-slate-900">Catat Status Kehadiran Guru</h3>
                <p className="text-[11px] text-slate-500">
                  Input cepat Izin, Sakit, Alpa, atau Dinas Luar tanpa memindai QR
                </p>
              </div>
              <button
                type="button"
                onClick={() => setShowManualAbsenModal(false)}
                className="p-1.5 rounded-lg text-slate-400 hover:text-slate-700 hover:bg-slate-100 cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="space-y-3 text-xs">
              <div>
                <label className="block font-bold text-slate-700 mb-1">Pilih Guru / Tendik</label>
                <select
                  value={manualGuruId}
                  onChange={(e) => setManualGuruId(e.target.value)}
                  className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl font-medium focus:bg-white focus:outline-hidden focus:ring-2 focus:ring-blue-600"
                  required
                >
                  <option value="">-- Pilih Guru / Tendik --</option>
                  {guruList.map((g) => (
                    <option key={g.id} value={g.id}>
                      {g.nama} ({g.jabatan || 'Guru'})
                    </option>
                  ))}
                </select>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block font-bold text-slate-700 mb-1">Tanggal</label>
                  <input
                    type="date"
                    value={manualTanggal}
                    onChange={(e) => setManualTanggal(e.target.value)}
                    className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl font-medium"
                    required
                  />
                </div>
                <div>
                  <label className="block font-bold text-slate-700 mb-1">Status</label>
                  <select
                    value={manualStatus}
                    onChange={(e) => setManualStatus(e.target.value as AbsensiGuru['status'])}
                    className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl font-bold"
                  >
                    <option value="Izin">Izin</option>
                    <option value="Sakit">Sakit</option>
                    <option value="Alpa">Alpa / Alfa</option>
                    <option value="Dinas Luar">Dinas Luar</option>
                    <option value="Hadir">Hadir</option>
                    <option value="Terlambat">Terlambat</option>
                  </select>
                </div>
              </div>

              <div>
                <label className="block font-bold text-slate-700 mb-1">Keterangan (Opsional)</label>
                <input
                  type="text"
                  value={manualKeterangan}
                  onChange={(e) => setManualKeterangan(e.target.value)}
                  placeholder="Misal: Surat dokter, rapat dinas, izin keluarga..."
                  className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl"
                />
              </div>
            </div>

            <div className="flex justify-end gap-2 pt-2 border-t border-slate-100">
              <button
                type="button"
                onClick={() => setShowManualAbsenModal(false)}
                className="px-4 py-2 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-bold cursor-pointer"
              >
                Batal
              </button>
              <button
                type="submit"
                className="px-4 py-2 rounded-xl bg-blue-700 hover:bg-blue-800 text-white text-xs font-bold shadow-xs cursor-pointer"
              >
                Simpan Status
              </button>
            </div>
          </form>
        </div>
      )}

      {/* Modal Konfirmasi Hapus Presensi Guru */}
      <ConfirmModal
        isOpen={Boolean(deleteTargetAbsensi)}
        title="Konfirmasi Hapus Presensi Guru"
        message={
          deleteTargetAbsensi
            ? `Apakah Anda yakin ingin menghapus data presensi ${deleteTargetAbsensi.namaGuru} pada tanggal ${deleteTargetAbsensi.tanggal} (Jam Masuk: ${deleteTargetAbsensi.jamMasuk})? Data akan dihapus secara permanen dari server.`
            : 'Apakah Anda yakin ingin menghapus data presensi ini?'
        }
        confirmText="Hapus Presensi"
        cancelText="Batal"
        isDestructive={true}
        onConfirm={confirmDeleteAbsensi}
        onCancel={() => setDeleteTargetAbsensi(null)}
      />

      {/* Official Teacher Attendance Print Modal */}
      <PrintRekapModal
        isOpen={showPrintModal}
        onClose={() => setShowPrintModal(false)}
        title={
          rekapViewMode === 'per_guru'
            ? 'REKAPITULASI JUMLAH KEHADIRAN GURU (HADIR, IZIN, SAKIT, ALPA)'
            : 'LAPORAN REKAPITULASI PRESENSI DEWAN GURU & TENDIK'
        }
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
                ? `Bulan (${filterBulan})`
                : 'Semester Aktif',
          },
          { label: 'Filter Guru', value: searchRekap ? `Pencarian "${searchRekap}"` : 'Semua Guru & Tendik' },
          { label: 'Filter Status', value: filterStatus || 'Semua Status Kehadiran' },
          {
            label: 'Total Data',
            value:
              rekapViewMode === 'per_guru'
                ? `${perGuruRekap.length} guru (${statusSummaryCounts.total} rekaman)`
                : `${filteredRekap.length} rekaman presensi`,
          },
        ]}
        summaryItems={[
          { label: 'Hadir', count: statusSummaryCounts.hadir },
          { label: 'Terlambat', count: statusSummaryCounts.terlambat },
          { label: 'Izin', count: statusSummaryCounts.izin },
          { label: 'Sakit', count: statusSummaryCounts.sakit },
          { label: 'Alpa', count: statusSummaryCounts.alpa },
          { label: 'Dinas Luar', count: statusSummaryCounts.dinasLuar },
        ]}
        columns={
          rekapViewMode === 'per_guru'
            ? [
                { header: 'No', render: (_, idx) => idx + 1, width: '35px', align: 'center' },
                { header: 'ID QR', key: 'qrId', width: '80px' },
                { header: 'Nama Guru / Tendik', key: 'namaGuru' },
                { header: 'Jabatan', key: 'jabatan', width: '100px' },
                { header: 'Hadir', key: 'hadir', width: '48px', align: 'center' },
                { header: 'Terlambat', key: 'terlambat', width: '60px', align: 'center' },
                { header: 'Izin', key: 'izin', width: '42px', align: 'center' },
                { header: 'Sakit', key: 'sakit', width: '42px', align: 'center' },
                { header: 'Alpa', key: 'alpa', width: '42px', align: 'center' },
                { header: 'Dinas', key: 'dinasLuar', width: '46px', align: 'center' },
                { header: 'Total', key: 'total', width: '48px', align: 'center' },
              ]
            : [
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
                  render: (item) => (item.jamMasuk && item.jamMasuk !== '-' ? `${item.jamMasuk} WIB` : '-'),
                  width: '115px',
                  align: 'center',
                },
                {
                  header: 'Jam Pulang (Scan 2)',
                  render: (item) => (item.jamPulang ? `${item.jamPulang} WIB` : '-'),
                  width: '115px',
                  align: 'center',
                },
                {
                  header: 'Status',
                  render: (item) => (
                    <span
                      className={`font-bold uppercase ${
                        item.status === 'Hadir'
                          ? 'text-emerald-800'
                          : item.status === 'Terlambat'
                          ? 'text-amber-800'
                          : item.status === 'Izin'
                          ? 'text-blue-800'
                          : item.status === 'Sakit'
                          ? 'text-indigo-800'
                          : item.status === 'Dinas Luar'
                          ? 'text-teal-800'
                          : 'text-rose-800'
                      }`}
                    >
                      {item.status}
                    </span>
                  ),
                  width: '85px',
                  align: 'center',
                },
                { header: 'Keterangan', render: (item) => item.keterangan || '-' },
              ]
        }
        data={rekapViewMode === 'per_guru' ? perGuruRekap : filteredRekap}
        signRole2="Koordinator Kepegawaian / Operator"
      />
    </div>
  );
};
