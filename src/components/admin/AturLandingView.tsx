import React, { useState, useEffect } from 'react';
import { db } from '../../services/database';
import { LandingConfig, SekolahInfo } from '../../types';
import {
  LayoutTemplate,
  Save,
  RotateCcw,
  CheckCircle2,
  Sparkles,
  Eye,
  Sliders,
  Megaphone,
  Layers,
  GraduationCap,
  Users,
  Building2,
  Newspaper,
  Bell,
  Image as ImageIcon,
  MapPin,
} from 'lucide-react';

interface AturLandingViewProps {
  onViewLandingPage?: () => void;
}

export const AturLandingView: React.FC<AturLandingViewProps> = ({ onViewLandingPage }) => {
  const [config, setConfig] = useState<LandingConfig>(db.getLandingConfig());
  const [sekolah, setSekolah] = useState<SekolahInfo>(db.getSekolah());
  const [savedSuccess, setSavedSuccess] = useState(false);

  useEffect(() => {
    const handleUpdate = () => {
      setConfig(db.getLandingConfig());
      setSekolah(db.getSekolah());
    };
    window.addEventListener('landing_config_updated', handleUpdate);
    window.addEventListener('sekolah_updated', handleUpdate);
    return () => {
      window.removeEventListener('landing_config_updated', handleUpdate);
      window.removeEventListener('sekolah_updated', handleUpdate);
    };
  }, []);

  const handleChange = <K extends keyof LandingConfig>(key: K, value: LandingConfig[K]) => {
    setConfig((prev) => ({
      ...prev,
      [key]: value,
    }));
  };

  const handleSave = (e: React.FormEvent) => {
    e.preventDefault();
    db.saveLandingConfig(config);
    setSavedSuccess(true);
    setTimeout(() => setSavedSuccess(false), 3000);
  };

  const handleResetDefault = () => {
    if (window.confirm('Kembalikan semua pengaturan tampilan landing page ke bawaan awal?')) {
      const defaultConfig: LandingConfig = {
        heroBadge: 'Portal Resmi Sekolah Digital',
        heroTagline: 'Mewujudkan Generasi Cerdas Berkarakter & Unggul Berbasis Teknologi',
        heroDescription:
          'Menumbuhkan insan beriman, berakhlak mulia, cerdas bernalar kritis, dan unggul dalam prestasi dengan dukungan pembelajaran digital ramah anak berbasis Kurikulum Merdeka.',
        heroCtaText: 'Masuk Portal Guru & Admin',
        heroSecondaryCtaText: 'Jelajahi Profil Sekolah',
        showRunningText: true,
        runningText:
          'Selamat Datang di Portal Resmi Sekolah. Sistem Presensi Digital QR Code Presisi & e-Rapor Kurikulum Merdeka Aktif.',
        showStatistik: true,
        showSambutan: true,
        showProfil: true,
        showBerita: true,
        showPengumuman: true,
        showGuru: true,
        showGaleri: true,
        showKontak: true,
      };
      setConfig(defaultConfig);
      db.saveLandingConfig(defaultConfig);
      setSavedSuccess(true);
      setTimeout(() => setSavedSuccess(false), 3000);
    }
  };

  const sectionToggles = [
    {
      key: 'showStatistik' as const,
      label: 'Statistik Singkat Sekolah',
      desc: 'Menampilkan 4 kartu ringkasan total siswa aktif, guru, rombel kelas, dan akreditasi.',
      icon: Layers,
    },
    {
      key: 'showSambutan' as const,
      label: 'Sambutan Kepala Sekolah',
      desc: 'Menampilkan foto dan kata sambutan resmi dari Kepala Sekolah.',
      icon: Users,
    },
    {
      key: 'showProfil' as const,
      label: 'Profil Sekolah, Visi & Misi',
      desc: 'Menampilkan narasi sejarah, visi, misi, dan pilar pendidikan sekolah.',
      icon: Building2,
    },
    {
      key: 'showBerita' as const,
      label: 'Seksi Berita & Kegiatan Terkini',
      desc: 'Menampilkan artikel berita dan informasi aktivitas terbaru sekolah.',
      icon: Newspaper,
    },
    {
      key: 'showPengumuman' as const,
      label: 'Seksi Pengumuman Resmi',
      desc: 'Menampilkan agenda, jadwal ujian, rapat wali murid, dan edaran dinas.',
      icon: Bell,
    },
    {
      key: 'showGuru' as const,
      label: 'Daftar Dewan Guru & Tenaga Pendidik',
      desc: 'Menampilkan profil bapak/ibu guru beserta mata pelajaran dan kelas binaan.',
      icon: GraduationCap,
    },
    {
      key: 'showGaleri' as const,
      label: 'Galeri Dokumentasi Kegiatan Siswa',
      desc: 'Menampilkan foto-foto dokumentasi sarana prasarana, upacara, dan ekstrakurikuler.',
      icon: ImageIcon,
    },
    {
      key: 'showKontak' as const,
      label: 'Informasi Kontak & Lokasi Sekolah',
      desc: 'Menampilkan alamat peta, nomor telepon, email resmi, dan jam operasional.',
      icon: MapPin,
    },
  ];

  return (
    <div className="space-y-6 animate-in fade-in pb-12">
      {/* Page Header */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 bg-white p-6 rounded-2xl border border-slate-200 shadow-xs">
        <div>
          <div className="flex items-center gap-2 text-xs font-bold text-blue-700 uppercase tracking-wider mb-1">
            <LayoutTemplate className="w-4 h-4" />
            <span>Kustomisasi Portal Publik</span>
          </div>
          <h2 className="text-xl font-bold tracking-tight text-slate-900">
            Pengaturan Landing Page (Beranda Depan)
          </h2>
          <p className="text-xs text-slate-500 mt-0.5">
            Atur isi konten banner hero, teks berjalan pengumuman, dan kontrol visibilitas setiap seksi di halaman depan.
          </p>
        </div>

        <div className="flex items-center gap-2">
          {onViewLandingPage && (
            <button
              id="btn-preview-landing"
              onClick={onViewLandingPage}
              className="px-3.5 py-2 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-semibold flex items-center gap-1.5 transition-colors"
            >
              <Eye className="w-3.5 h-3.5" />
              <span>Lihat Tampilan Depan</span>
            </button>
          )}

          <button
            id="btn-reset-landing"
            onClick={handleResetDefault}
            className="px-3.5 py-2 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-semibold flex items-center gap-1.5 transition-colors"
            title="Kembalikan ke default"
          >
            <RotateCcw className="w-3.5 h-3.5" />
            <span>Default</span>
          </button>
        </div>
      </div>

      {savedSuccess && (
        <div className="p-4 bg-emerald-50 border border-emerald-200 text-emerald-800 rounded-2xl flex items-center gap-3 text-xs font-semibold animate-in slide-in-from-top duration-200 shadow-xs">
          <CheckCircle2 className="w-5 h-5 text-emerald-600 flex-shrink-0" />
          <span>Pengaturan tampilan Landing Page berhasil disimpan dan langsung diterapkan ke halaman utama!</span>
        </div>
      )}

      <form onSubmit={handleSave} className="space-y-6">
        {/* Card 1: Pengaturan Banner Hero */}
        <div className="bg-white rounded-2xl border border-slate-200 shadow-xs overflow-hidden">
          <div className="px-6 py-4 bg-slate-50 border-b border-slate-200 flex items-center justify-between">
            <div className="flex items-center gap-2.5">
              <Sparkles className="w-4 h-4 text-blue-600" />
              <h3 className="text-sm font-bold text-slate-900">Konten Banner Utama (Hero Banner)</h3>
            </div>
            <span className="text-[11px] font-semibold text-slate-500">Bagian paling atas beranda</span>
          </div>

          <div className="p-6 space-y-4">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1.5">
                  Badge / Label Mini Di Atas Judul
                </label>
                <input
                  id="input-hero-badge"
                  type="text"
                  value={config.heroBadge}
                  onChange={(e) => handleChange('heroBadge', e.target.value)}
                  placeholder="Contoh: Portal Resmi Sekolah Digital"
                  className="w-full px-3.5 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs font-medium focus:bg-white focus:outline-hidden focus:ring-2 focus:ring-blue-600 focus:border-transparent transition-all"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1.5">
                  Tagline / Kalimat Slogan Utama
                </label>
                <input
                  id="input-hero-tagline"
                  type="text"
                  value={config.heroTagline}
                  onChange={(e) => handleChange('heroTagline', e.target.value)}
                  placeholder="Contoh: Mewujudkan Generasi Cerdas Berkarakter & Unggul"
                  className="w-full px-3.5 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs font-medium focus:bg-white focus:outline-hidden focus:ring-2 focus:ring-blue-600 focus:border-transparent transition-all"
                />
              </div>
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1.5">
                Deskripsi Singkat / Sambutan Hero
              </label>
              <textarea
                id="input-hero-desc"
                rows={3}
                value={config.heroDescription}
                onChange={(e) => handleChange('heroDescription', e.target.value)}
                placeholder="Deskripsi singkat mengenai sekolah yang ditampilkan di bawah slogan utama..."
                className="w-full px-3.5 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs font-medium focus:bg-white focus:outline-hidden focus:ring-2 focus:ring-blue-600 focus:border-transparent transition-all"
              />
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1.5">
                  Teks Tombol Utama (CTA 1)
                </label>
                <input
                  id="input-hero-cta"
                  type="text"
                  value={config.heroCtaText}
                  onChange={(e) => handleChange('heroCtaText', e.target.value)}
                  placeholder="Masuk Portal Guru & Admin"
                  className="w-full px-3.5 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs font-medium focus:bg-white focus:outline-hidden focus:ring-2 focus:ring-blue-600 focus:border-transparent transition-all"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1.5">
                  Teks Tombol Kedua (CTA 2)
                </label>
                <input
                  id="input-hero-cta2"
                  type="text"
                  value={config.heroSecondaryCtaText}
                  onChange={(e) => handleChange('heroSecondaryCtaText', e.target.value)}
                  placeholder="Jelajahi Profil Sekolah"
                  className="w-full px-3.5 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs font-medium focus:bg-white focus:outline-hidden focus:ring-2 focus:ring-blue-600 focus:border-transparent transition-all"
                />
              </div>
            </div>
          </div>
        </div>

        {/* Card 2: Pengaturan Running Text / Marquee */}
        <div className="bg-white rounded-2xl border border-slate-200 shadow-xs overflow-hidden">
          <div className="px-6 py-4 bg-slate-50 border-b border-slate-200 flex items-center justify-between">
            <div className="flex items-center gap-2.5">
              <Megaphone className="w-4 h-4 text-amber-600" />
              <h3 className="text-sm font-bold text-slate-900">Teks Berjalan Pengumuman (Running Text)</h3>
            </div>
            <label className="flex items-center gap-2 cursor-pointer select-none">
              <span className="text-xs font-semibold text-slate-600">Aktifkan Teks Berjalan</span>
              <input
                id="toggle-running-text"
                type="checkbox"
                checked={config.showRunningText}
                onChange={(e) => handleChange('showRunningText', e.target.checked)}
                className="w-4 h-4 text-blue-600 rounded border-slate-300 focus:ring-blue-500"
              />
            </label>
          </div>

          <div className="p-6 space-y-3">
            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1.5">
                Isi Pesan Teks Berjalan
              </label>
              <input
                id="input-running-text"
                type="text"
                value={config.runningText}
                onChange={(e) => handleChange('runningText', e.target.value)}
                placeholder="Ketik pesan informasi berjalan yang akan muncul di halaman beranda..."
                className="w-full px-3.5 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs font-medium focus:bg-white focus:outline-hidden focus:ring-2 focus:ring-blue-600 focus:border-transparent transition-all"
              />
              <p className="text-[11px] text-slate-500 mt-1">
                Teks ini akan bergerak secara kontinu di bawah header sebagai pengumuman cepat bagi wali murid dan guru.
              </p>
            </div>
          </div>
        </div>

        {/* Card 3: Visibilitas Seksi Beranda (Toggle Sections) */}
        <div className="bg-white rounded-2xl border border-slate-200 shadow-xs overflow-hidden">
          <div className="px-6 py-4 bg-slate-50 border-b border-slate-200 flex items-center justify-between">
            <div className="flex items-center gap-2.5">
              <Sliders className="w-4 h-4 text-emerald-600" />
              <h3 className="text-sm font-bold text-slate-900">Tampilkan / Sembunyikan Seksi Halaman Depan</h3>
            </div>
            <span className="text-[11px] font-semibold text-slate-500">Centang untuk menampilkan</span>
          </div>

          <div className="p-6 divide-y divide-slate-100">
            {sectionToggles.map((item) => {
              const Icon = item.icon;
              return (
                <div key={item.key} className="py-3.5 first:pt-0 last:pb-0 flex items-center justify-between gap-4">
                  <div className="flex items-start gap-3">
                    <div className="w-8 h-8 rounded-lg bg-blue-50 text-blue-700 flex items-center justify-center flex-shrink-0 mt-0.5">
                      <Icon className="w-4 h-4" />
                    </div>
                    <div>
                      <h4 className="text-xs font-bold text-slate-900">{item.label}</h4>
                      <p className="text-[11px] text-slate-500">{item.desc}</p>
                    </div>
                  </div>

                  <label className="relative inline-flex items-center cursor-pointer">
                    <input
                      id={`toggle-${item.key}`}
                      type="checkbox"
                      checked={config[item.key]}
                      onChange={(e) => handleChange(item.key, e.target.checked)}
                      className="sr-only peer"
                    />
                    <div className="w-9 h-5 bg-slate-200 peer-focus:outline-hidden rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-slate-300 after:border after:rounded-full after:h-4 after:w-4 after:transition-all peer-checked:bg-blue-600"></div>
                  </label>
                </div>
              );
            })}
          </div>
        </div>

        {/* Action Save Bar */}
        <div className="flex items-center justify-end gap-3 pt-2">
          <button
            id="btn-save-landing-config"
            type="submit"
            className="px-6 py-2.5 rounded-xl bg-blue-700 hover:bg-blue-800 text-white text-xs font-bold flex items-center gap-2 shadow-sm transition-all hover:shadow"
          >
            <Save className="w-4 h-4" />
            <span>Simpan Pengaturan Landing Page</span>
          </button>
        </div>
      </form>
    </div>
  );
};
