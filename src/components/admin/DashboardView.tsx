import React, { useState, useEffect } from 'react';
import { db } from '../../services/database';
import { User, Siswa, Guru, AbsensiSiswa, AbsensiGuru, Pengumuman } from '../../types';
import {
  GraduationCap,
  Users,
  Building2,
  FileSpreadsheet,
  CheckCircle,
  Clock,
  AlertCircle,
  Calendar,
  ArrowUpRight,
  UserCheck,
  TrendingUp,
  Sparkles,
} from 'lucide-react';

interface DashboardViewProps {
  currentUser: User;
  onNavigate: (tabId: string) => void;
}

export const DashboardView: React.FC<DashboardViewProps> = ({ currentUser, onNavigate }) => {
  const [siswaList, setSiswaList] = useState<Siswa[]>(db.getSiswaList());
  const [guruList, setGuruList] = useState<Guru[]>(db.getGuruList());
  const [kelasList, setKelasList] = useState(db.getKelasList());
  const [absensiSiswa, setAbsensiSiswa] = useState<AbsensiSiswa[]>(db.getAbsensiSiswaList());
  const [absensiGuru, setAbsensiGuru] = useState<AbsensiGuru[]>(db.getAbsensiGuruList());

  const todayStr = new Date().toISOString().split('T')[0];

  useEffect(() => {
    const handleUpdate = () => {
      setSiswaList(db.getSiswaList());
      setGuruList(db.getGuruList());
      setKelasList(db.getKelasList());
      setAbsensiSiswa(db.getAbsensiSiswaList());
      setAbsensiGuru(db.getAbsensiGuruList());
    };
    window.addEventListener('absensi_siswa_updated', handleUpdate);
    window.addEventListener('absensi_guru_updated', handleUpdate);
    window.addEventListener('data_siswa_changed', handleUpdate);
    window.addEventListener('data_guru_changed', handleUpdate);
    window.addEventListener('data_kelas_changed', handleUpdate);
    return () => {
      window.removeEventListener('absensi_siswa_updated', handleUpdate);
      window.removeEventListener('absensi_guru_updated', handleUpdate);
      window.removeEventListener('data_siswa_changed', handleUpdate);
      window.removeEventListener('data_guru_changed', handleUpdate);
      window.removeEventListener('data_kelas_changed', handleUpdate);
    };
  }, []);

  // Filter today's attendance
  const todaySiswaAbsensi = absensiSiswa.filter((a) => a.tanggal === todayStr);
  const siswaHadirCount = todaySiswaAbsensi.filter((a) => a.status === 'Hadir').length;
  const siswaTerlambatCount = todaySiswaAbsensi.filter((a) => a.status === 'Terlambat').length;
  const siswaSakitCount = todaySiswaAbsensi.filter((a) => a.status === 'Sakit').length;
  const siswaIzinCount = todaySiswaAbsensi.filter((a) => a.status === 'Izin').length;

  const todayGuruAbsensi = absensiGuru.filter((a) => a.tanggal === todayStr);
  const guruHadirCount = todayGuruAbsensi.length;

  // Rate
  const totalSiswa = siswaList.length || 1;
  const kehadiranPercent = Math.min(100, Math.round(((siswaHadirCount + siswaTerlambatCount) / totalSiswa) * 100));

  // Breakdown by class
  const classBreakdown = kelasList.map((k) => {
    const countInClass = siswaList.filter((s) => s.kelas === k.nama).length;
    const presentInClass = todaySiswaAbsensi.filter((a) => a.kelas === k.nama && (a.status === 'Hadir' || a.status === 'Terlambat')).length;
    return {
      nama: k.nama,
      total: countInClass,
      present: presentInClass,
      rate: countInClass > 0 ? Math.round((presentInClass / countInClass) * 100) : 0,
    };
  });

  return (
    <div className="space-y-6">
      {/* Welcome Banner */}
      <div className="bg-gradient-to-r from-blue-900 via-blue-800 to-indigo-900 rounded-2xl p-6 text-white shadow-md relative overflow-hidden">
        <div className="relative z-10 flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
          <div>
            <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-white/10 text-blue-200 text-xs font-semibold backdrop-blur-xs">
              <Sparkles className="w-3 h-3 text-amber-300" />
              Sistem Informasi Sekolah Digital
            </span>
            <h2 className="text-xl sm:text-2xl font-bold mt-2 tracking-tight">
              Selamat Datang, {currentUser.name}
            </h2>
            <p className="text-xs sm:text-sm text-blue-200 mt-0.5">
              Role:{' '}
              <span className="font-semibold text-white uppercase tracking-wider">
                {currentUser.role === 'admin' ? 'Admin Sekolah' : 'Dewan Guru'}
              </span>{' '}
              | Tanggal Hari Ini:{' '}
              {new Date().toLocaleDateString('id-ID', {
                weekday: 'long',
                year: 'numeric',
                month: 'long',
                day: 'numeric',
              })}
            </p>
          </div>

          <div className="flex flex-wrap gap-2.5">
            <button
              onClick={() => onNavigate('asisten-ai-guru')}
              className="px-4 py-2 bg-gradient-to-r from-amber-500 to-amber-600 hover:from-amber-600 hover:to-amber-700 text-white rounded-xl text-xs font-bold shadow-xs flex items-center gap-2 transition-colors cursor-pointer"
            >
              <Sparkles className="w-4 h-4 text-white" />
              Asisten AI Guru (Soal & RPP)
            </button>
            <button
              onClick={() => onNavigate('nilai-harian')}
              className="px-4 py-2 bg-blue-600 hover:bg-blue-500 text-white rounded-xl text-xs font-semibold shadow-xs flex items-center gap-2 transition-colors cursor-pointer"
            >
              <FileSpreadsheet className="w-4 h-4" />
              Kelola Nilai Harian
            </button>
            <button
              onClick={() => onNavigate('absensi-siswa')}
              className="px-4 py-2 bg-white/10 hover:bg-white/20 border border-white/20 text-white rounded-xl text-xs font-semibold transition-colors cursor-pointer flex items-center gap-2"
            >
              <CheckCircle className="w-4 h-4" />
              Presensi Siswa
            </button>
          </div>
        </div>
      </div>

      {/* Stats Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {/* Total Siswa */}
        <div className="bg-white rounded-2xl p-5 border border-slate-200 shadow-xs flex items-center justify-between">
          <div>
            <span className="text-xs font-semibold text-slate-500 uppercase tracking-wider">
              Total Siswa
            </span>
            <h3 className="text-2xl font-extrabold text-slate-900 mt-1">{siswaList.length}</h3>
            <span className="text-[11px] text-blue-600 font-medium">
              Terdaftar di {kelasList.length} Rombel
            </span>
          </div>
          <div className="w-12 h-12 rounded-xl bg-blue-50 text-blue-700 flex items-center justify-center">
            <GraduationCap className="w-6 h-6" />
          </div>
        </div>

        {/* Total Guru */}
        <div className="bg-white rounded-2xl p-5 border border-slate-200 shadow-xs flex items-center justify-between">
          <div>
            <span className="text-xs font-semibold text-slate-500 uppercase tracking-wider">
              Total Guru & Tendik
            </span>
            <h3 className="text-2xl font-extrabold text-slate-900 mt-1">{guruList.length}</h3>
            <span className="text-[11px] text-emerald-600 font-medium">Pendidik Aktif</span>
          </div>
          <div className="w-12 h-12 rounded-xl bg-emerald-50 text-emerald-700 flex items-center justify-center">
            <Users className="w-6 h-6" />
          </div>
        </div>

        {/* Kehadiran Siswa Hari Ini */}
        <div className="bg-white rounded-2xl p-5 border border-slate-200 shadow-xs flex items-center justify-between">
          <div>
            <span className="text-xs font-semibold text-slate-500 uppercase tracking-wider">
              Hadir Hari Ini
            </span>
            <div className="flex items-baseline gap-2 mt-1">
              <h3 className="text-2xl font-extrabold text-slate-900">{siswaHadirCount + siswaTerlambatCount}</h3>
              <span className="text-xs font-bold text-emerald-600 bg-emerald-50 px-1.5 py-0.5 rounded">
                {kehadiranPercent}%
              </span>
            </div>
            <span className="text-[11px] text-slate-500">
              {siswaSakitCount} Sakit, {siswaIzinCount} Izin
            </span>
          </div>
          <div className="w-12 h-12 rounded-xl bg-indigo-50 text-indigo-700 flex items-center justify-center">
            <TrendingUp className="w-6 h-6" />
          </div>
        </div>

        {/* Kehadiran Guru Hari Ini */}
        <div className="bg-white rounded-2xl p-5 border border-slate-200 shadow-xs flex items-center justify-between">
          <div>
            <span className="text-xs font-semibold text-slate-500 uppercase tracking-wider">
              Guru Hadir
            </span>
            <div className="flex items-baseline gap-2 mt-1">
              <h3 className="text-2xl font-extrabold text-slate-900">
                {guruHadirCount} <span className="text-sm font-normal text-slate-400">/ {guruList.length}</span>
              </h3>
            </div>
            <span className="text-[11px] text-emerald-600 font-medium">Scan Masuk Tercatat</span>
          </div>
          <div className="w-12 h-12 rounded-xl bg-amber-50 text-amber-700 flex items-center justify-center">
            <UserCheck className="w-6 h-6" />
          </div>
        </div>
      </div>

      {/* Grid: Attendance Breakdown & Recent Logs */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Left 2 Cols: Grafik Distribusi Kelas */}
        <div className="lg:col-span-2 bg-white rounded-2xl p-6 border border-slate-200 shadow-xs space-y-5">
          <div className="flex items-center justify-between">
            <div>
              <h3 className="text-base font-bold text-slate-900">
                Statistik Kehadiran Siswa per Kelas Hari Ini
              </h3>
              <p className="text-xs text-slate-500 mt-0.5">
                Pemantauan kehadiran real-time berdasarkan scan QR Code
              </p>
            </div>
            <button
              onClick={() => onNavigate('absensi-siswa')}
              className="text-xs font-bold text-blue-700 hover:text-blue-900 flex items-center gap-1"
            >
              Lihat Rekap <ArrowUpRight className="w-3.5 h-3.5" />
            </button>
          </div>

          <div className="space-y-3.5">
            {classBreakdown.length === 0 ? (
              <div className="text-center py-8 text-xs text-slate-400 bg-slate-50 rounded-xl border border-dashed border-slate-200">
                Belum ada rombel kelas yang ditambahkan.
              </div>
            ) : (
              classBreakdown.map((item) => (
                <div key={item.nama} className="space-y-1.5">
                  <div className="flex justify-between text-xs">
                    <span className="font-semibold text-slate-800">{item.nama}</span>
                    <span className="text-slate-500">
                      <strong className="text-slate-800">{item.present}</strong> / {item.total} Siswa ({item.rate}%)
                    </span>
                  </div>
                  <div className="w-full h-2.5 bg-slate-100 rounded-full overflow-hidden">
                    <div
                      className={`h-full rounded-full transition-all duration-500 ${
                        item.rate >= 80 ? 'bg-emerald-500' : item.rate >= 50 ? 'bg-blue-600' : 'bg-amber-500'
                      }`}
                      style={{ width: `${Math.max(item.rate, 4)}%` }}
                    />
                  </div>
                </div>
              ))
            )}
          </div>

          <div className="pt-3 border-t border-slate-100 flex items-center justify-between text-xs text-slate-500">
            <div className="flex items-center gap-4">
              <span className="flex items-center gap-1.5">
                <span className="w-2.5 h-2.5 rounded-full bg-emerald-500" /> Hadir &gt;80%
              </span>
              <span className="flex items-center gap-1.5">
                <span className="w-2.5 h-2.5 rounded-full bg-blue-600" /> 50% - 80%
              </span>
              <span className="flex items-center gap-1.5">
                <span className="w-2.5 h-2.5 rounded-full bg-amber-500" /> &lt;50%
              </span>
            </div>
          </div>
        </div>

        {/* Right 1 Col: Log Aktivitas Terbaru */}
        <div className="bg-white rounded-2xl p-6 border border-slate-200 shadow-xs space-y-4 flex flex-col justify-between">
          <div>
            <div className="flex items-center justify-between pb-3 border-b border-slate-100">
              <h3 className="text-base font-bold text-slate-900">Aktivitas Scan Terakhir</h3>
              <span className="text-[11px] font-semibold text-blue-700 bg-blue-50 px-2 py-0.5 rounded">
                Live
              </span>
            </div>

            <div className="mt-3 space-y-3">
              {todaySiswaAbsensi.slice(0, 5).map((log) => (
                <div
                  key={log.id}
                  className="flex items-center justify-between p-2.5 rounded-xl bg-slate-50 border border-slate-100 text-xs"
                >
                  <div className="space-y-0.5">
                    <span className="font-bold text-slate-800 block truncate max-w-[140px]">
                      {log.namaSiswa}
                    </span>
                    <span className="text-slate-500 text-[11px]">
                      {log.kelas} • {log.jam}
                    </span>
                  </div>
                  <span
                    className={`px-2 py-0.5 rounded-full font-semibold text-[10px] ${
                      log.status === 'Hadir'
                        ? 'bg-emerald-100 text-emerald-700'
                        : log.status === 'Terlambat'
                        ? 'bg-amber-100 text-amber-700'
                        : 'bg-red-100 text-red-700'
                    }`}
                  >
                    {log.status}
                  </span>
                </div>
              ))}

              {todaySiswaAbsensi.length === 0 && (
                <div className="text-center py-8 text-slate-400 text-xs">
                  Belum ada rekaman scan absensi hari ini.
                </div>
              )}
            </div>
          </div>

          <div className="pt-3 border-t border-slate-100">
            <button
              onClick={() => onNavigate('absensi-siswa')}
              className="w-full py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-xl text-xs font-semibold transition-colors text-center block"
            >
              Buka Scanner Absensi Siswa
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
