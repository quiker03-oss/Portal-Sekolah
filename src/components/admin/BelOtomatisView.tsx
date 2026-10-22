import React, { useState, useEffect } from 'react';
import {
  BellRing,
  Plus,
  Trash2,
  Clock,
  Play,
  CheckCircle2,
  AlertTriangle,
  RotateCcw,
  Volume2,
  Calendar,
  Sparkles,
} from 'lucide-react';
import { db } from '../../services/database';
import { BelJadwal } from '../../types';
import { sound } from '../../services/audio';
import { ConfirmModal } from '../common/ConfirmModal';

const DAYS_OF_WEEK = ['Senin', 'Selasa', 'Rabu', 'Kamis', 'Jumat', 'Sabtu'];

export const BelOtomatisView: React.FC = () => {
  const [jadwalList, setJadwalList] = useState<BelJadwal[]>(() => db.getBelJadwalList());
  const [currentTimeWIB, setCurrentTimeWIB] = useState<string>('');
  const [currentDayWIB, setCurrentDayWIB] = useState<string>('');
  
  // Form fields
  const [editingId, setEditingId] = useState<string | null>(null);
  const [tipeBel, setTipeBel] = useState<string>('masuk');
  const [waktu, setWaktu] = useState<string>('07:00');
  const [keterangan, setKeterangan] = useState<string>('Bel Masuk Kelas & Pembiasaan Pagi');
  const [pesanSuara, setPesanSuara] = useState<string>(
    'Saatnya jam masuk kelas dimulai. Kepada seluruh siswa, harap segera masuk ke kelas masing-masing dengan tertib.'
  );
  const [selectedHari, setSelectedHari] = useState<string[]>([...DAYS_OF_WEEK]);
  
  // UI states
  const [isDeleting, setIsDeleting] = useState<string | null>(null);
  const [isSaving, setIsSaving] = useState<boolean>(false);
  const [successMessage, setSuccessMessage] = useState<string>('');
  const [errorMessage, setErrorMessage] = useState<string>('');
  const [lastSavedTimestamp, setLastSavedTimestamp] = useState<string>('');

  // Sync with database updates (both local & Firestore)
  useEffect(() => {
    const handleSync = () => {
      setJadwalList(db.getBelJadwalList());
    };
    window.addEventListener('bel_jadwal_updated', handleSync);
    window.addEventListener('data_bel_jadwal_changed', handleSync);
    return () => {
      window.removeEventListener('bel_jadwal_updated', handleSync);
      window.removeEventListener('data_bel_jadwal_changed', handleSync);
    };
  }, []);

  // Real-time clock in Asia/Jakarta (WIB)
  useEffect(() => {
    const updateTime = () => {
      const now = new Date();
      const timeStr = new Intl.DateTimeFormat('id-ID', {
        timeZone: 'Asia/Jakarta',
        hour: '2-digit',
        minute: '2-digit',
        second: '2-digit',
        hour12: false,
      }).format(now).replace(/\./g, ':');

      const dayStr = new Intl.DateTimeFormat('id-ID', {
        timeZone: 'Asia/Jakarta',
        weekday: 'long',
      }).format(now);

      setCurrentTimeWIB(timeStr);
      setCurrentDayWIB(dayStr);
    };

    updateTime();
    const interval = setInterval(updateTime, 1000);
    return () => clearInterval(interval);
  }, []);

  const handleTipeChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
    const val = e.target.value;
    setTipeBel(val);
    if (val === 'masuk') {
      setKeterangan('Bel Masuk Kelas');
      setPesanSuara('Saatnya jam masuk kelas dimulai. Kepada seluruh siswa, harap masuk ke kelas masing-masing dengan tertib.');
    } else if (val === 'istirahat') {
      setKeterangan('Bel Istirahat');
      setPesanSuara('Saatnya jam istirahat. Selamat beristirahat dan tetap menjaga kebersihan sekolah.');
    } else if (val === 'pulang') {
      setKeterangan('Bel Pulang Sekolah');
      setPesanSuara('Waktu kegiatan belajar telah selesai. Saatnya pulang, rapikan meja Anda, dan berhati-hati di jalan.');
    } else if (val === 'ganti_jam') {
      setKeterangan('Bel Pergantian Jam Pelajaran');
      setPesanSuara('Saatnya pergantian jam pelajaran. Bapak dan Ibu guru dipersilakan menuju ruang kelas.');
    } else if (val === 'upacara') {
      setKeterangan('Bel Upacara Bendera');
      setPesanSuara('Perhatian kepada seluruh siswa dan dewan guru, upacara bendera akan segera dimulai di lapangan sekolah.');
    }
  };

  const toggleDaySelection = (day: string) => {
    if (selectedHari.includes(day)) {
      if (selectedHari.length > 1) {
        setSelectedHari(selectedHari.filter((d) => d !== day));
      }
    } else {
      setSelectedHari([...selectedHari, day]);
    }
  };

  const handleSelectAllDays = () => {
    setSelectedHari([...DAYS_OF_WEEK]);
  };

  const handleSelectWeekdayOnly = () => {
    setSelectedHari(['Senin', 'Selasa', 'Rabu', 'Kamis', 'Jumat']);
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!waktu || !keterangan.trim()) {
      setErrorMessage('Waktu dan Keterangan bel wajib diisi.');
      return;
    }

    setIsSaving(true);
    setErrorMessage('');

    try {
      const itemToSave: BelJadwal = {
        id: editingId || `bel-${Date.now()}`,
        waktu,
        keterangan: keterangan.trim(),
        pesanSuara: pesanSuara.trim(),
        aktif: true,
        tipeBel,
        hari: selectedHari.length > 0 ? selectedHari : [...DAYS_OF_WEEK],
        updatedAt: new Date().toISOString(),
      };

      db.saveBelJadwal(itemToSave);
      setJadwalList(db.getBelJadwalList());
      setLastSavedTimestamp(
        new Date().toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit', second: '2-digit' }) + ' WIB'
      );
      setSuccessMessage(
        editingId ? `Jadwal "${itemToSave.keterangan}" berhasil diperbarui!` : `Jadwal "${itemToSave.keterangan}" berhasil ditambahkan ke database!`
      );
      
      // Reset form
      setEditingId(null);
      setWaktu('07:00');
      handleTipeChange({ target: { value: 'masuk' } } as any);
      setSelectedHari([...DAYS_OF_WEEK]);

      setTimeout(() => setSuccessMessage(''), 4000);
    } catch (err: any) {
      setErrorMessage(`Gagal menyimpan jadwal: ${err?.message || 'Terjadi kesalahan sistem'}`);
    } finally {
      setIsSaving(false);
    }
  };

  const handleEdit = (item: BelJadwal) => {
    setEditingId(item.id);
    setWaktu(item.waktu);
    setTipeBel(item.tipeBel || 'masuk');
    setKeterangan(item.keterangan);
    setPesanSuara(item.pesanSuara || '');
    setSelectedHari(item.hari && item.hari.length > 0 ? item.hari : [...DAYS_OF_WEEK]);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const handleCancelEdit = () => {
    setEditingId(null);
    setWaktu('07:00');
    handleTipeChange({ target: { value: 'masuk' } } as any);
    setSelectedHari([...DAYS_OF_WEEK]);
  };

  const toggleAktif = (id: string) => {
    const item = jadwalList.find((j) => j.id === id);
    if (!item) return;
    const updated: BelJadwal = { ...item, aktif: !item.aktif };
    db.saveBelJadwal(updated);
    setJadwalList(db.getBelJadwalList());
  };

  const handleDelete = () => {
    if (isDeleting) {
      db.deleteBelJadwal(isDeleting);
      setJadwalList(db.getBelJadwalList());
      setIsDeleting(null);
      setSuccessMessage('Jadwal bel berhasil dihapus dari database.');
      setTimeout(() => setSuccessMessage(''), 3000);
    }
  };

  const handleApplyPresetStandar = () => {
    if (!window.confirm('Terapkan jadwal standar sekolah dasar nasional (Jam Masuk, 2 Sesi Istirahat, dan Jam Pulang)?')) {
      return;
    }
    const presets: BelJadwal[] = [
      {
        id: 'bel-std-1',
        waktu: '07:00',
        keterangan: 'Bel Masuk Kelas & Pembiasaan Pagi',
        pesanSuara: 'Saatnya jam masuk kelas dimulai. Kepada seluruh siswa, harap segera masuk ke kelas masing-masing dengan tertib.',
        aktif: true,
        tipeBel: 'masuk',
        hari: ['Senin', 'Selasa', 'Rabu', 'Kamis', 'Jumat', 'Sabtu'],
      },
      {
        id: 'bel-std-2',
        waktu: '09:30',
        keterangan: 'Bel Istirahat Pertama',
        pesanSuara: 'Saatnya jam istirahat pertama. Selamat beristirahat dan tetap menjaga kebersihan lingkungan sekolah.',
        aktif: true,
        tipeBel: 'istirahat',
        hari: ['Senin', 'Selasa', 'Rabu', 'Kamis', 'Jumat', 'Sabtu'],
      },
      {
        id: 'bel-std-3',
        waktu: '10:00',
        keterangan: 'Bel Masuk Setelah Istirahat Pertama',
        pesanSuara: 'Waktu istirahat pertama telah selesai. Seluruh siswa diharapkan kembali ke ruang kelas.',
        aktif: true,
        tipeBel: 'masuk',
        hari: ['Senin', 'Selasa', 'Rabu', 'Kamis', 'Jumat', 'Sabtu'],
      },
      {
        id: 'bel-std-4',
        waktu: '11:30',
        keterangan: 'Bel Pulang Hari Jumat (Sholat Jumat)',
        pesanSuara: 'Waktu kegiatan belajar hari Jumat telah selesai. Kepada seluruh siswa, selamat berakhir pekan dan hati-hati di jalan.',
        aktif: true,
        tipeBel: 'pulang',
        hari: ['Jumat'],
      },
      {
        id: 'bel-std-5',
        waktu: '12:00',
        keterangan: 'Bel Istirahat Kedua (Dhuhur & Makan Siang)',
        pesanSuara: 'Saatnya jam istirahat kedua dan sholat Dhuhur berjamaah. Selamat beristirahat.',
        aktif: true,
        tipeBel: 'istirahat',
        hari: ['Senin', 'Selasa', 'Rabu', 'Kamis', 'Sabtu'],
      },
      {
        id: 'bel-std-6',
        waktu: '12:30',
        keterangan: 'Bel Masuk Setelah Istirahat Kedua',
        pesanSuara: 'Waktu istirahat kedua telah selesai. Harap seluruh siswa kembali memasuki ruang kelas.',
        aktif: true,
        tipeBel: 'masuk',
        hari: ['Senin', 'Selasa', 'Rabu', 'Kamis', 'Sabtu'],
      },
      {
        id: 'bel-std-7',
        waktu: '14:00',
        keterangan: 'Bel Pulang Sekolah',
        pesanSuara: 'Waktu kegiatan belajar mengajar hari ini telah selesai. Saatnya pulang, rapikan meja Anda, dan berhati-hati di jalan.',
        aktif: true,
        tipeBel: 'pulang',
        hari: ['Senin', 'Selasa', 'Rabu', 'Kamis', 'Sabtu'],
      },
    ];

    db.saveBulkBelJadwal(presets);
    setJadwalList(db.getBelJadwalList());
    setSuccessMessage('Jadwal preset standar sekolah berhasil diterapkan dan disimpan ke database!');
    setTimeout(() => setSuccessMessage(''), 4000);
  };

  const testBell = (tipe: string, pesan?: string) => {
    sound.playBell(tipe || tipeBel);
    sound.speak(pesan || pesanSuara || 'Perhatian. Ini adalah percobaan pesan suara bel sekolah otomatis.');
  };

  return (
    <div className="space-y-6 animate-in fade-in zoom-in-95 duration-300">
      {/* HEADER SECTION */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 bg-white p-5 rounded-2xl border border-slate-200 shadow-xs">
        <div>
          <div className="flex items-center gap-2">
            <h2 className="text-2xl font-black text-slate-900 tracking-tight flex items-center gap-2">
              <BellRing className="w-7 h-7 text-blue-600" />
              Bel Sekolah Otomatis
            </h2>
            <span className="px-2.5 py-0.5 rounded-full text-[10px] font-bold bg-blue-100 text-blue-800">
              WIB (Asia/Jakarta)
            </span>
          </div>
          <p className="text-slate-500 text-xs sm:text-sm mt-1">
            Pengaturan bel sekolah tersimpan permanen di basis data Cloud Firestore sekolah. Bel otomatis berbunyi tepat waktu saat tab admin aktif.
          </p>
        </div>

        {/* Real-time Clock Card */}
        <div className="flex items-center gap-3 bg-blue-50/80 border border-blue-200/80 px-4 py-2.5 rounded-xl self-start sm:self-auto">
          <Clock className="w-5 h-5 text-blue-600 shrink-0" />
          <div>
            <div className="text-[10px] font-bold text-blue-700 uppercase tracking-wider">
              {currentDayWIB || 'Hari Ini'} (WIB)
            </div>
            <div className="text-lg font-mono font-black text-blue-950">
              {currentTimeWIB || '--:--:--'}
            </div>
          </div>
        </div>
      </div>

      {/* FEEDBACK NOTIFICATIONS */}
      {successMessage && (
        <div className="p-4 bg-emerald-50 border border-emerald-200 text-emerald-800 rounded-2xl flex items-center gap-3 text-sm font-semibold animate-in fade-in shadow-xs">
          <CheckCircle2 className="w-5 h-5 text-emerald-600 shrink-0" />
          <div className="flex-1">{successMessage}</div>
          {lastSavedTimestamp && (
            <span className="text-[11px] text-emerald-700 bg-emerald-100/80 px-2 py-0.5 rounded-md font-mono">
              Tersimpan {lastSavedTimestamp}
            </span>
          )}
        </div>
      )}

      {errorMessage && (
        <div className="p-4 bg-rose-50 border border-rose-200 text-rose-800 rounded-2xl flex items-center gap-3 text-sm font-semibold animate-in fade-in shadow-xs">
          <AlertTriangle className="w-5 h-5 text-rose-600 shrink-0" />
          <div className="flex-1">{errorMessage}</div>
        </div>
      )}

      {/* ACTION BAR */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={handleApplyPresetStandar}
            className="px-3 py-1.5 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-xl text-xs font-bold flex items-center gap-1.5 transition-colors cursor-pointer border border-slate-200"
          >
            <Sparkles className="w-3.5 h-3.5 text-amber-500" />
            Terapkan Preset Standar SD (7 Jadwal Lengkap)
          </button>
        </div>

        <button
          type="button"
          onClick={() => testBell(tipeBel, pesanSuara)}
          className="px-3.5 py-1.5 bg-blue-50 hover:bg-blue-100 text-blue-700 border border-blue-200 rounded-xl text-xs font-bold flex items-center gap-2 transition-colors cursor-pointer"
        >
          <Volume2 className="w-4 h-4 text-blue-600" />
          Coba Suara Bel Sekarang
        </button>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* FORM PANEL */}
        <div className="lg:col-span-1">
          <form
            onSubmit={handleSubmit}
            className="bg-white p-5 rounded-2xl shadow-xs border border-slate-200 space-y-4 sticky top-4"
          >
            <div className="flex items-center justify-between border-b border-slate-100 pb-3">
              <h3 className="font-bold text-slate-800 text-sm">
                {editingId ? 'Edit Jadwal Bel' : 'Tambah Jadwal Bel Baru'}
              </h3>
              {editingId && (
                <button
                  type="button"
                  onClick={handleCancelEdit}
                  className="text-xs text-rose-600 hover:underline cursor-pointer font-semibold"
                >
                  Batal Edit
                </button>
              )}
            </div>

            {/* Tipe Bel */}
            <div>
              <label className="block text-xs font-semibold text-slate-600 mb-1">
                Tipe Bel / Kategori
              </label>
              <select
                value={tipeBel}
                onChange={handleTipeChange}
                className="w-full px-3 py-2 rounded-xl border border-slate-300 focus:border-blue-500 focus:ring-4 focus:ring-blue-500/10 transition-all text-xs outline-hidden cursor-pointer bg-white font-medium"
              >
                <option value="masuk">Bel Masuk Kelas / Mulai Pembelajaran</option>
                <option value="istirahat">Bel Istirahat (Sesi 1 / Sesi 2)</option>
                <option value="pulang">Bel Pulang Sekolah</option>
                <option value="ganti_jam">Bel Pergantian Jam Pelajaran</option>
                <option value="upacara">Bel Upacara Bendera</option>
                <option value="custom">Kustom / Lainnya</option>
              </select>
            </div>

            {/* Waktu (HH:MM) */}
            <div>
              <label className="block text-xs font-semibold text-slate-600 mb-1 flex items-center justify-between">
                <span>Waktu Berbunyi (WIB)</span>
                <span className="text-[10px] text-blue-600 font-mono">Format 24 Jam</span>
              </label>
              <input
                type="time"
                value={waktu}
                onChange={(e) => setWaktu(e.target.value)}
                className="w-full px-3 py-2 rounded-xl border border-slate-300 focus:border-blue-500 focus:ring-4 focus:ring-blue-500/10 transition-all font-mono text-sm font-bold outline-hidden bg-slate-50/50"
                required
              />
            </div>

            {/* Keterangan */}
            <div>
              <label className="block text-xs font-semibold text-slate-600 mb-1">
                Keterangan Sesi
              </label>
              <input
                type="text"
                value={keterangan}
                onChange={(e) => setKeterangan(e.target.value)}
                placeholder="Contoh: Bel Masuk Kelas Pagi"
                className="w-full px-3 py-2 rounded-xl border border-slate-300 focus:border-blue-500 focus:ring-4 focus:ring-blue-500/10 transition-all text-xs outline-hidden font-medium"
                required
              />
            </div>

            {/* Hari Berlakunya Jadwal */}
            <div>
              <div className="flex items-center justify-between mb-1.5">
                <label className="text-xs font-semibold text-slate-600">Hari Berlaku</label>
                <div className="flex items-center gap-2 text-[10px]">
                  <button
                    type="button"
                    onClick={handleSelectAllDays}
                    className="text-blue-600 hover:underline cursor-pointer"
                  >
                    Semua
                  </button>
                  <span className="text-slate-300">|</span>
                  <button
                    type="button"
                    onClick={handleSelectWeekdayOnly}
                    className="text-blue-600 hover:underline cursor-pointer"
                  >
                    Senin-Jumat
                  </button>
                </div>
              </div>
              <div className="grid grid-cols-3 gap-1.5">
                {DAYS_OF_WEEK.map((day) => {
                  const isChecked = selectedHari.includes(day);
                  return (
                    <button
                      key={day}
                      type="button"
                      onClick={() => toggleDaySelection(day)}
                      className={`py-1 px-2 rounded-lg text-xs font-bold border transition-colors cursor-pointer ${
                        isChecked
                          ? 'bg-blue-600 text-white border-blue-600'
                          : 'bg-slate-50 text-slate-600 border-slate-200 hover:bg-slate-100'
                      }`}
                    >
                      {day}
                    </button>
                  );
                })}
              </div>
            </div>

            {/* Pesan Suara / TTS */}
            <div>
              <label className="block text-xs font-semibold text-slate-600 mb-1 flex items-center justify-between">
                <span>Pesan Pengumuman Suara (TTS)</span>
                <button
                  type="button"
                  onClick={() => sound.speak(pesanSuara || 'Bel berbunyi')}
                  className="text-[10px] text-blue-600 font-bold hover:underline flex items-center gap-1 cursor-pointer"
                >
                  <Play className="w-2.5 h-2.5" /> Uji Suara
                </button>
              </label>
              <textarea
                value={pesanSuara}
                onChange={(e) => setPesanSuara(e.target.value)}
                rows={3}
                placeholder="Tulis pesan pengumuman suara yang akan dibacakan..."
                className="w-full px-3 py-2 rounded-xl border border-slate-300 focus:border-blue-500 focus:ring-4 focus:ring-blue-500/10 transition-all text-xs outline-hidden"
              />
            </div>

            <button
              type="submit"
              disabled={isSaving}
              className="w-full py-2.5 bg-blue-600 hover:bg-blue-700 disabled:bg-blue-300 text-white rounded-xl text-xs font-bold shadow-xs transition-colors flex items-center justify-center gap-2 cursor-pointer"
            >
              <Plus className="w-4 h-4" />
              {isSaving ? 'Menyimpan ke Database...' : editingId ? 'Perbarui Jadwal' : 'Simpan Jadwal Permanen'}
            </button>
          </form>
        </div>

        {/* LIST TABLE PANEL */}
        <div className="lg:col-span-2">
          <div className="bg-white rounded-2xl shadow-xs border border-slate-200 overflow-hidden">
            <div className="px-5 py-3.5 border-b border-slate-200 bg-slate-50 flex items-center justify-between">
              <span className="text-xs font-bold text-slate-700">
                Daftar Jadwal Bel Tersimpan ({jadwalList.length} Entri)
              </span>
              <span className="text-[11px] text-slate-500 font-mono">
                Sinkron Otomatis ke Firestore
              </span>
            </div>

            <div className="overflow-x-auto">
              <table className="w-full text-xs text-left">
                <thead className="bg-slate-100/70 text-slate-600 font-bold border-b border-slate-200">
                  <tr>
                    <th className="px-4 py-3">Waktu (WIB)</th>
                    <th className="px-4 py-3">Tipe</th>
                    <th className="px-4 py-3">Keterangan</th>
                    <th className="px-4 py-3">Hari</th>
                    <th className="px-3 py-3 text-center">Status</th>
                    <th className="px-4 py-3 text-center">Aksi</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {jadwalList.length === 0 ? (
                    <tr>
                      <td colSpan={6} className="px-6 py-12 text-center text-slate-400">
                        <Clock className="w-8 h-8 mx-auto mb-2 text-slate-300" />
                        <p className="font-semibold">Belum ada jadwal bel yang diatur.</p>
                        <p className="text-xs text-slate-400 mt-1">
                          Klik tombol "Terapkan Preset Standar SD" di atas untuk mengisi otomatis.
                        </p>
                      </td>
                    </tr>
                  ) : (
                    jadwalList.map((j) => (
                      <tr key={j.id} className="hover:bg-slate-50/80 transition-colors">
                        <td className="px-4 py-3 font-mono font-bold text-slate-900">
                          <div className="inline-flex items-center gap-1.5 bg-blue-50 text-blue-900 px-2 py-0.5 rounded-lg border border-blue-200/60">
                            <Clock className="w-3.5 h-3.5 text-blue-600" />
                            {j.waktu}
                          </div>
                        </td>
                        <td className="px-4 py-3 font-semibold text-slate-700 capitalize">
                          <span
                            className={`px-2 py-0.5 rounded-md text-[10px] font-bold ${
                              j.tipeBel === 'istirahat'
                                ? 'bg-amber-100 text-amber-800'
                                : j.tipeBel === 'pulang'
                                ? 'bg-purple-100 text-purple-800'
                                : j.tipeBel === 'upacara'
                                ? 'bg-rose-100 text-rose-800'
                                : 'bg-blue-100 text-blue-800'
                            }`}
                          >
                            {j.tipeBel === 'ganti_jam' ? 'Ganti Jam' : j.tipeBel || 'Masuk'}
                          </span>
                        </td>
                        <td className="px-4 py-3">
                          <div className="font-bold text-slate-800">{j.keterangan}</div>
                          {j.pesanSuara && (
                            <div className="text-[10px] text-slate-400 truncate max-w-[220px] italic">
                              "{j.pesanSuara}"
                            </div>
                          )}
                        </td>
                        <td className="px-4 py-3 text-slate-600">
                          <span className="text-[11px] font-mono">
                            {!j.hari || j.hari.length === 6
                              ? 'Setiap Hari'
                              : j.hari.join(', ')}
                          </span>
                        </td>
                        <td className="px-3 py-3 text-center">
                          <button
                            type="button"
                            onClick={() => toggleAktif(j.id)}
                            className={`px-2.5 py-1 rounded-full text-[10px] font-extrabold cursor-pointer transition-colors ${
                              j.aktif
                                ? 'bg-emerald-100 text-emerald-700 hover:bg-emerald-200'
                                : 'bg-slate-100 text-slate-500 hover:bg-slate-200'
                            }`}
                          >
                            {j.aktif ? 'AKTIF' : 'NONAKTIF'}
                          </button>
                        </td>
                        <td className="px-4 py-3 text-center">
                          <div className="flex items-center justify-center gap-1">
                            <button
                              type="button"
                              onClick={() => testBell(j.tipeBel, j.pesanSuara)}
                              title="Uji Suara"
                              className="p-1.5 rounded-lg text-blue-600 hover:bg-blue-50 transition-colors cursor-pointer"
                            >
                              <Play className="w-3.5 h-3.5" />
                            </button>
                            <button
                              type="button"
                              onClick={() => handleEdit(j)}
                              title="Edit Jadwal"
                              className="p-1.5 rounded-lg text-slate-600 hover:bg-slate-100 transition-colors cursor-pointer text-[10px] font-bold"
                            >
                              Edit
                            </button>
                            <button
                              type="button"
                              onClick={() => setIsDeleting(j.id)}
                              title="Hapus Jadwal"
                              className="p-1.5 rounded-lg text-rose-500 hover:bg-rose-50 transition-colors cursor-pointer"
                            >
                              <Trash2 className="w-3.5 h-3.5" />
                            </button>
                          </div>
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      </div>

      <ConfirmModal
        isOpen={!!isDeleting}
        title="Hapus Jadwal Bel"
        message="Apakah Anda yakin ingin menghapus jadwal bel ini secara permanen dari database sekolah?"
        confirmLabel="Hapus"
        onConfirm={handleDelete}
        onCancel={() => setIsDeleting(null)}
      />
    </div>
  );
};
