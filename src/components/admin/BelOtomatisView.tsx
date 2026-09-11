import React, { useState, useEffect } from 'react';
import { BellRing, Plus, Trash2, Clock, Play } from 'lucide-react';
import { sound } from '../../services/audio';
import { ConfirmModal } from '../common/ConfirmModal';

interface BelJadwal {
  id: string;
  waktu: string; // HH:MM
  keterangan: string;
  pesanSuara: string;
  aktif: boolean;
  tipeBel?: string;
}

export const BelOtomatisView: React.FC = () => {
  const [jadwalList, setJadwalList] = useState<BelJadwal[]>(() => {
    try {
      return JSON.parse(localStorage.getItem('bel_otomatis') || '[]');
    } catch {
      return [];
    }
  });
  
  const [tipeBel, setTipeBel] = useState('masuk');
  const [waktu, setWaktu] = useState('');
  const [keterangan, setKeterangan] = useState('Bel Masuk Kelas');
  const [pesanSuara, setPesanSuara] = useState('Saatnya jam masuk kelas dimulai. Kepada seluruh siswa, harap masuk ke kelas masing-masing.');
  const [isDeleting, setIsDeleting] = useState<string | null>(null);

  const handleTipeChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
    const val = e.target.value;
    setTipeBel(val);
    if (val === 'masuk') {
      setKeterangan('Bel Masuk Kelas');
      setPesanSuara('Saatnya jam masuk kelas dimulai. Kepada seluruh siswa, harap masuk ke kelas masing-masing.');
    } else if (val === 'istirahat') {
      setKeterangan('Bel Istirahat');
      setPesanSuara('Saatnya jam istirahat dimulai. Selamat beristirahat.');
    } else if (val === 'pulang') {
      setKeterangan('Bel Pulang');
      setPesanSuara('Waktu pelajaran telah selesai. Saatnya pulang. Hati-hati di jalan.');
    } else if (val === 'ganti_jam') {
      setKeterangan('Bel Ganti Jam');
      setPesanSuara('Saatnya pergantian jam pelajaran.');
    } else {
      setKeterangan('');
      setPesanSuara('');
    }
  };

  useEffect(() => {
    localStorage.setItem('bel_otomatis', JSON.stringify(jadwalList));
  }, [jadwalList]);

  const handleAdd = (e: React.FormEvent) => {
    e.preventDefault();
    if (!waktu || !keterangan) return;
    
    const newJadwal: BelJadwal = {
      id: Date.now().toString(),
      waktu,
      keterangan,
      pesanSuara,
      aktif: true,
      tipeBel,
    };
    
    setJadwalList([...jadwalList, newJadwal].sort((a, b) => a.waktu.localeCompare(b.waktu)));
    setWaktu('');
    // reset defaults based on current tipeBel
    handleTipeChange({ target: { value: tipeBel } } as any);
  };

  const toggleAktif = (id: string) => {
    setJadwalList(jadwalList.map(j => j.id === id ? { ...j, aktif: !j.aktif } : j));
  };

  const handleDelete = () => {
    if (isDeleting) {
      setJadwalList(jadwalList.filter(j => j.id !== isDeleting));
      setIsDeleting(null);
    }
  };

  const testBell = () => {
    sound.playBell(tipeBel);
    sound.speak(pesanSuara || "Perhatian. Ini adalah percobaan pesan suara bel sekolah otomatis.");
  };

  return (
    <div className="space-y-6 animate-in fade-in zoom-in-95 duration-300">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-black text-slate-900 tracking-tight flex items-center gap-2">
            <BellRing className="w-7 h-7 text-blue-600" />
            Bel Sekolah Otomatis
          </h2>
          <p className="text-slate-500 text-sm mt-1">
            Atur jadwal bel berbunyi secara otomatis. Pastikan halaman admin ini tetap terbuka agar sistem dapat membunyikan bel sesuai jadwal.
          </p>
        </div>
        <button
          onClick={testBell}
          className="px-4 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-xl text-sm font-bold flex items-center gap-2 transition-colors cursor-pointer"
        >
          <Play className="w-4 h-4" />
          Test Suara Bel
        </button>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="lg:col-span-1">
          <form onSubmit={handleAdd} className="bg-white p-5 rounded-2xl shadow-sm border border-slate-200 space-y-4">
            <h3 className="font-bold text-slate-800 border-b border-slate-100 pb-2">Tambah Jadwal Baru</h3>
            <div>
              <label className="block text-xs font-semibold text-slate-600 mb-1">Tipe Bel / Nada</label>
              <select
                value={tipeBel}
                onChange={handleTipeChange}
                className="w-full px-4 py-2.5 rounded-xl border border-slate-300 focus:border-blue-500 focus:ring-4 focus:ring-blue-500/10 transition-all text-sm outline-hidden cursor-pointer bg-white"
              >
                <option value="masuk">Bel Masuk Kelas</option>
                <option value="istirahat">Bel Istirahat</option>
                <option value="pulang">Bel Pulang</option>
                <option value="ganti_jam">Bel Ganti Jam</option>
                <option value="custom">Kustom (Lainnya)</option>
              </select>
            </div>
            <div>
              <label className="block text-xs font-semibold text-slate-600 mb-1">Waktu (HH:MM)</label>
              <input
                type="time"
                value={waktu}
                onChange={(e) => setWaktu(e.target.value)}
                className="w-full px-4 py-2.5 rounded-xl border border-slate-300 focus:border-blue-500 focus:ring-4 focus:ring-blue-500/10 transition-all font-mono text-sm outline-hidden"
                required
              />
            </div>
            <div>
              <label className="block text-xs font-semibold text-slate-600 mb-1">Keterangan / Sesi</label>
              <input
                type="text"
                value={keterangan}
                onChange={(e) => setKeterangan(e.target.value)}
                placeholder="Contoh: Bel Masuk Kelas"
                className="w-full px-4 py-2.5 rounded-xl border border-slate-300 focus:border-blue-500 focus:ring-4 focus:ring-blue-500/10 transition-all text-sm outline-hidden"
                required
              />
            </div>
            <button
              type="submit"
              className="w-full py-2.5 bg-blue-600 hover:bg-blue-700 text-white rounded-xl text-sm font-bold shadow-xs transition-colors flex items-center justify-center gap-2 cursor-pointer"
            >
              <Plus className="w-4 h-4" />
              Simpan Jadwal
            </button>
          </form>
        </div>

        <div className="lg:col-span-2">
          <div className="bg-white rounded-2xl shadow-sm border border-slate-200 overflow-hidden">
            <table className="w-full text-sm text-left">
              <thead className="bg-slate-50 text-slate-600 font-bold border-b border-slate-200">
                <tr>
                  <th className="px-6 py-4">Waktu</th>
                  <th className="px-6 py-4">Tipe</th>
                  <th className="px-6 py-4">Keterangan</th>
                  <th className="px-6 py-4">Pesan Suara</th>
                  <th className="px-6 py-4 text-center">Status</th>
                  <th className="px-6 py-4 text-center">Aksi</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {jadwalList.length === 0 ? (
                  <tr>
                    <td colSpan={6} className="px-6 py-8 text-center text-slate-400">
                      Belum ada jadwal bel yang diatur.
                    </td>
                  </tr>
                ) : (
                  jadwalList.map((j) => (
                    <tr key={j.id} className="hover:bg-slate-50">
                      <td className="px-6 py-4 font-mono font-bold text-slate-900 flex items-center gap-2">
                        <Clock className="w-4 h-4 text-slate-400" />
                        {j.waktu}
                      </td>
                      <td className="px-6 py-4 font-semibold text-slate-700 capitalize">
                        {j.tipeBel === 'ganti_jam' ? 'Ganti Jam' : j.tipeBel || 'Masuk'}
                      </td>
                      <td className="px-6 py-4 font-semibold text-slate-700">{j.keterangan}</td>
                      <td className="px-6 py-4 text-slate-500 italic">{j.pesanSuara || "-"}</td>
                      <td className="px-6 py-4 text-center">
                        <button
                          onClick={() => toggleAktif(j.id)}
                          className={`px-3 py-1 rounded-full text-[10px] font-extrabold cursor-pointer transition-colors ${
                            j.aktif ? 'bg-emerald-100 text-emerald-700 hover:bg-emerald-200' : 'bg-slate-100 text-slate-500 hover:bg-slate-200'
                          }`}
                        >
                          {j.aktif ? 'AKTIF' : 'NONAKTIF'}
                        </button>
                      </td>
                      <td className="px-6 py-4 text-center">
                        <button
                          onClick={() => setIsDeleting(j.id)}
                          className="p-2 rounded-lg text-rose-500 hover:bg-rose-50 transition-colors cursor-pointer inline-flex"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>
      </div>

      <ConfirmModal
        isOpen={!!isDeleting}
        title="Hapus Jadwal Bel"
        message="Apakah Anda yakin ingin menghapus jadwal ini?"
        confirmLabel="Hapus"
        onConfirm={handleDelete}
        onCancel={() => setIsDeleting(null)}
      />
    </div>
  );
};
