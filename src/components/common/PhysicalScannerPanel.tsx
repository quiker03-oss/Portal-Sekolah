import React, { useRef, useEffect, useState } from 'react';
import {
  Scan,
  Zap,
  CheckCircle2,
  Volume2,
  VolumeX,
  Keyboard,
  Settings2,
  HelpCircle,
  Sparkles,
  RefreshCw,
  Usb,
  Wifi,
} from 'lucide-react';
import { sound } from '../../services/audio';

interface PhysicalScannerPanelProps {
  onScan: (code: string) => void;
  lastScannedCode?: string;
  lastScannedAt?: Date | null;
  totalScans?: number;
  placeholderText?: string;
  isTeacher?: boolean;
}

export const PhysicalScannerPanel: React.FC<PhysicalScannerPanelProps> = ({
  onScan,
  lastScannedCode,
  lastScannedAt,
  totalScans = 0,
  placeholderText = 'Tembakkan scanner fisik ke QR Code siswa...',
  isTeacher = false,
}) => {
  const [testInput, setTestInput] = useState('');
  const [soundEnabled, setSoundEnabled] = useState(true);
  const [autoFocusLock, setAutoFocusLock] = useState(true);
  const [isReceivingFlash, setIsReceivingFlash] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  // Auto focus input when active
  useEffect(() => {
    if (autoFocusLock && inputRef.current) {
      inputRef.current.focus();
    }
  }, [autoFocusLock]);

  // Flash animation when a new scan occurs
  useEffect(() => {
    if (lastScannedCode) {
      setIsReceivingFlash(true);
      const timer = setTimeout(() => setIsReceivingFlash(false), 800);
      return () => clearTimeout(timer);
    }
  }, [lastScannedCode, lastScannedAt]);

  const handleFormSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const clean = testInput.trim();
    if (!clean) return;

    if (soundEnabled) {
      sound.playScannerBeep();
    }

    onScan(clean);
    setTestInput('');

    if (autoFocusLock && inputRef.current) {
      inputRef.current.focus();
    }
  };

  const handleBlur = () => {
    if (autoFocusLock) {
      // Re-focus after short delay if focus lock is enabled
      setTimeout(() => {
        if (inputRef.current && document.activeElement !== inputRef.current) {
          inputRef.current.focus();
        }
      }, 200);
    }
  };

  return (
    <div className="space-y-4">
      {/* Main Terminal Card */}
      <div
        className={`relative overflow-hidden rounded-3xl border transition-all duration-300 ${
          isReceivingFlash
            ? 'bg-gradient-to-br from-emerald-900 to-slate-900 border-emerald-400 shadow-xl shadow-emerald-500/20 ring-4 ring-emerald-500/30'
            : 'bg-gradient-to-br from-slate-950 via-slate-900 to-indigo-950 border-slate-800 shadow-lg'
        }`}
      >
        {/* Animated laser scan line effect when scanner is active */}
        <div className="absolute inset-x-0 top-0 h-1 bg-gradient-to-r from-transparent via-cyan-400 to-transparent animate-pulse" />

        <div className="p-6 sm:p-8 space-y-6 text-white">
          {/* Header Status */}
          <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-800/80 pb-4">
            <div className="flex items-center gap-3">
              <div className="relative">
                <div className="w-12 h-12 rounded-2xl bg-cyan-500/20 border border-cyan-400/40 text-cyan-300 flex items-center justify-center">
                  <Scan className="w-6 h-6 animate-pulse" />
                </div>
                {/* Live radar dot */}
                <span className="absolute -top-1 -right-1 flex h-3.5 w-3.5">
                  <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75" />
                  <span className="relative inline-flex rounded-full h-3.5 w-3.5 bg-emerald-500 border-2 border-slate-900" />
                </span>
              </div>

              <div>
                <div className="flex items-center gap-2">
                  <h3 className="text-base sm:text-lg font-black tracking-tight text-white">
                    Mode Scanner Fisik Aktif
                  </h3>
                  <span className="px-2 py-0.5 rounded-full text-[10px] font-extrabold uppercase bg-emerald-500/20 text-emerald-300 border border-emerald-500/40">
                    Standby
                  </span>
                </div>
                <p className="text-xs text-slate-400 flex items-center gap-2 mt-0.5">
                  <span className="inline-flex items-center gap-1 text-cyan-300">
                    <Usb className="w-3 h-3" /> USB
                  </span>
                  <span>•</span>
                  <span className="inline-flex items-center gap-1 text-cyan-300">
                    <Wifi className="w-3 h-3" /> Bluetooth / Wireless Gun
                  </span>
                </p>
              </div>
            </div>

            {/* Quick Controls */}
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => setSoundEnabled(!soundEnabled)}
                title={soundEnabled ? 'Suara Bip Scanner Aktif' : 'Suara Bip Nonaktif'}
                className={`p-2 rounded-xl text-xs font-semibold flex items-center gap-1.5 transition-all cursor-pointer border ${
                  soundEnabled
                    ? 'bg-cyan-500/20 text-cyan-300 border-cyan-500/30 hover:bg-cyan-500/30'
                    : 'bg-slate-800 text-slate-400 border-slate-700 hover:bg-slate-700'
                }`}
              >
                {soundEnabled ? <Volume2 className="w-4 h-4" /> : <VolumeX className="w-4 h-4" />}
                <span className="hidden sm:inline">{soundEnabled ? 'Bip Aktif' : 'Bip Hening'}</span>
              </button>

              <button
                type="button"
                onClick={() => {
                  setAutoFocusLock(!autoFocusLock);
                  if (!autoFocusLock && inputRef.current) {
                    inputRef.current.focus();
                  }
                }}
                className={`p-2 rounded-xl text-xs font-semibold flex items-center gap-1.5 transition-all cursor-pointer border ${
                  autoFocusLock
                    ? 'bg-indigo-500/20 text-indigo-300 border-indigo-500/30 hover:bg-indigo-500/30'
                    : 'bg-slate-800 text-slate-400 border-slate-700 hover:bg-slate-700'
                }`}
              >
                <Keyboard className="w-4 h-4" />
                <span className="hidden sm:inline">
                  {autoFocusLock ? 'Fokus Terkunci' : 'Fokus Bebas'}
                </span>
              </button>
            </div>
          </div>

          {/* Scanner Gun Visual Target Area */}
          <div className="relative rounded-2xl bg-slate-900/80 border border-slate-800 p-6 text-center space-y-3">
            <div className="w-16 h-16 mx-auto rounded-full bg-slate-800/80 border-2 border-cyan-500/40 flex items-center justify-center text-cyan-400 shadow-[0_0_20px_rgba(6,182,212,0.25)]">
              <Zap className="w-8 h-8 animate-bounce" />
            </div>

            <div>
              <h4 className="text-sm sm:text-base font-bold text-slate-200">
                Arahkan Moncong Scanner Fisik ke Kartu {isTeacher ? 'Guru' : 'Siswa'}
              </h4>
              <p className="text-xs text-slate-400 max-w-md mx-auto mt-1 leading-relaxed">
                Tembak barcode / QR Code dengan pemindai fisik. Sistem otomatis menangkap sinyal
                keystroke kecepatan tinggi dan mencatat absensi seketika tanpa perlu menekan tombol apapun.
              </p>
            </div>

            {/* Input Capture Bar */}
            <form onSubmit={handleFormSubmit} className="max-w-md mx-auto pt-2">
              <div className="relative flex items-center">
                <input
                  ref={inputRef}
                  id="physical-scanner-input"
                  type="text"
                  value={testInput}
                  onChange={(e) => setTestInput(e.target.value)}
                  onBlur={handleBlur}
                  placeholder={placeholderText}
                  autoComplete="off"
                  spellCheck={false}
                  className="w-full px-4 py-3 bg-slate-950 text-white placeholder-slate-500 border-2 border-cyan-500/50 rounded-2xl text-xs font-mono tracking-wider focus:outline-hidden focus:border-cyan-400 focus:ring-4 focus:ring-cyan-500/20 shadow-inner"
                />
                <button
                  type="submit"
                  disabled={!testInput.trim()}
                  className="absolute right-2 px-3.5 py-1.5 bg-cyan-600 hover:bg-cyan-500 disabled:opacity-40 text-slate-950 font-black rounded-xl text-xs transition-colors cursor-pointer"
                >
                  Proses
                </button>
              </div>
              <p className="text-[10px] text-slate-400 mt-1.5 flex items-center justify-center gap-1">
                <span>⚡ Siap menerima input langsung dari barcode reader USB / Bluetooth</span>
              </p>
            </form>
          </div>

          {/* Last Scanned Status Bar */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 text-xs">
            <div className="bg-slate-900/60 rounded-xl p-3 border border-slate-800 flex items-center gap-3">
              <div className="w-8 h-8 rounded-lg bg-emerald-500/20 text-emerald-400 flex items-center justify-center">
                <CheckCircle2 className="w-4 h-4" />
              </div>
              <div>
                <span className="text-[10px] text-slate-400 block font-medium">Total Scan Sesi Ini</span>
                <span className="text-sm font-bold text-white">{totalScans} Kali</span>
              </div>
            </div>

            <div className="bg-slate-900/60 rounded-xl p-3 border border-slate-800 flex items-center gap-3 sm:col-span-2">
              <div className="w-8 h-8 rounded-lg bg-cyan-500/20 text-cyan-400 flex items-center justify-center">
                <Sparkles className="w-4 h-4" />
              </div>
              <div className="flex-1 min-w-0">
                <span className="text-[10px] text-slate-400 block font-medium">Kode Terakhir Terdeteksi</span>
                <div className="flex items-center justify-between gap-2">
                  <span className="text-xs font-mono font-bold text-cyan-300 truncate">
                    {lastScannedCode || <span className="text-slate-500 italic">Belum ada scan</span>}
                  </span>
                  {lastScannedAt && (
                    <span className="text-[10px] text-slate-400">
                      {lastScannedAt.toLocaleTimeString('id-ID')}
                    </span>
                  )}
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Hardware Guidance Accordion / Card */}
      <div className="p-4 bg-slate-50 rounded-2xl border border-slate-200/80 space-y-2 text-slate-700">
        <h5 className="text-xs font-bold text-slate-900 flex items-center gap-1.5">
          <HelpCircle className="w-4 h-4 text-blue-600" />
          <span>Petunjuk Penggunaan Alat Scanner Fisik (Barcode / QR Gun):</span>
        </h5>
        <ul className="text-xs text-slate-600 space-y-1 pl-5 list-disc leading-relaxed">
          <li>
            <strong>Plug & Play:</strong> Cukup colokkan kabel USB scanner gun atau hubungkan dongle / Bluetooth ke laptop atau PC kasir/piket sekolah.
          </li>
          <li>
            <strong>Tanpa Klik:</strong> Mode ini otomatis mendeteksi tembakan laser scanner secara instan tanpa perlu mengklik tombol apapun.
          </li>
          <li>
            <strong>Hemat Daya:</strong> Tidak menyalakan kamera webcam laptop, sehingga laptop tidak cepat panas dan baterai jauh lebih hemat.
          </li>
          <li>
            <strong>Kartu Siswa & Guru:</strong> Kompatibel dengan semua kartu NISN, QR ID STU-xxxxx, maupun Barcode fisik.
          </li>
        </ul>
      </div>
    </div>
  );
};
