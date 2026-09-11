import React, { useState, useEffect } from 'react';
import { db } from '../services/database';
import { SekolahInfo, Pengumuman, Berita, GaleriItem, Guru, LandingConfig } from '../types';
import {
  GraduationCap,
  Users,
  Building2,
  Calendar,
  ArrowRight,
  Sparkles,
  CheckCircle2,
  ChevronRight,
  Target,
  Compass,
  Award,
  BookOpen,
  MapPin,
  Phone,
  Mail,
  Quote,
  X,
  Clock,
  Eye,
  Megaphone,
  UserPlus,
} from 'lucide-react';

interface LandingPageProps {
  onOpenLogin: () => void;
  onOpenRegister?: () => void;
  activeSection: string;
}

export const LandingPage: React.FC<LandingPageProps> = ({
  onOpenLogin,
  onOpenRegister,
  activeSection,
}) => {
  const [sekolah, setSekolah] = useState<SekolahInfo>(db.getSekolah());
  const [landingConfig, setLandingConfig] = useState<LandingConfig>(db.getLandingConfig());
  const [pengumumanList, setPengumumanList] = useState<Pengumuman[]>(db.getPengumumanList());
  const [beritaList, setBeritaList] = useState<Berita[]>(db.getBeritaList());
  const [galeriList, setGaleriList] = useState<GaleriItem[]>(db.getGaleriList());
  const [guruList, setGuruList] = useState<Guru[]>(db.getGuruList());
  const [siswaCount, setSiswaCount] = useState(db.getSiswaList().length);
  const [kelasCount, setKelasCount] = useState(db.getKelasList().length);

  // Selected modals for news/announcement/gallery
  const [selectedBerita, setSelectedBerita] = useState<Berita | null>(null);
  const [selectedPengumuman, setSelectedPengumuman] = useState<Pengumuman | null>(null);
  const [selectedImage, setSelectedImage] = useState<GaleriItem | null>(null);

  useEffect(() => {
    const refreshData = () => {
      setSekolah(db.getSekolah());
      setLandingConfig(db.getLandingConfig());
      setPengumumanList(db.getPengumumanList());
      setBeritaList(db.getBeritaList());
      setGaleriList(db.getGaleriList());
      setGuruList(db.getGuruList());
      setSiswaCount(db.getSiswaList().length);
      setKelasCount(db.getKelasList().length);
    };

    window.addEventListener('sekolah_updated', refreshData);
    window.addEventListener('school_changed', refreshData);
    window.addEventListener('landing_config_updated', refreshData);
    window.addEventListener('pengumuman_updated', refreshData);
    window.addEventListener('berita_updated', refreshData);
    window.addEventListener('galeri_updated', refreshData);
    window.addEventListener('data_siswa_changed', refreshData);
    window.addEventListener('data_guru_changed', refreshData);

    return () => {
      window.removeEventListener('sekolah_updated', refreshData);
      window.removeEventListener('school_changed', refreshData);
      window.removeEventListener('landing_config_updated', refreshData);
      window.removeEventListener('pengumuman_updated', refreshData);
      window.removeEventListener('berita_updated', refreshData);
      window.removeEventListener('galeri_updated', refreshData);
      window.removeEventListener('data_siswa_changed', refreshData);
      window.removeEventListener('data_guru_changed', refreshData);
    };
  }, []);

  // Scroll to target section when activeSection changes
  useEffect(() => {
    if (activeSection && activeSection !== 'beranda') {
      const element = document.getElementById(activeSection);
      if (element) {
        element.scrollIntoView({ behavior: 'smooth', block: 'start' });
      }
    } else if (activeSection === 'beranda') {
      window.scrollTo({ top: 0, behavior: 'smooth' });
    }
  }, [activeSection]);

  return (
    <div className="w-full bg-white text-slate-800">
      {/* 1. HERO BANNER */}
      <section
        id="beranda"
        className="relative min-h-[580px] lg:min-h-[640px] flex items-center justify-center bg-gradient-to-br from-blue-950 via-blue-900 to-indigo-950 text-white overflow-hidden py-16 px-4 sm:px-6 lg:px-8"
      >
        {/* Background photo with overlay */}
        <div className="absolute inset-0 z-0">
          <img
            src={sekolah.fotoSekolah}
            alt={sekolah.nama}
            className="w-full h-full object-cover opacity-20 filter brightness-75 scale-105"
            referrerPolicy="no-referrer"
          />
          <div className="absolute inset-0 bg-gradient-to-t from-blue-950 via-blue-900/80 to-transparent" />
          <div className="absolute inset-0 bg-[radial-gradient(#38bdf8_1px,transparent_1px)] [background-size:24px_24px] opacity-15" />
        </div>

        <div className="relative z-10 max-w-5xl mx-auto text-center space-y-6 pt-4">
          <div className="inline-flex items-center gap-2 px-3.5 py-1.5 rounded-full bg-white/10 backdrop-blur-md border border-white/20 text-blue-200 text-xs font-semibold tracking-wider uppercase shadow-xs">
            <Sparkles className="w-3.5 h-3.5 text-amber-300" />
            <span>{landingConfig.heroBadge || 'Portal Resmi Sekolah Digital'}</span>
          </div>

          <div className="flex flex-col items-center">
            <div className="w-24 h-24 sm:w-28 sm:h-28 bg-white/95 rounded-2xl p-2.5 shadow-2xl border-2 border-amber-400 mb-4 transform hover:scale-105 transition-transform">
              <img
                src={sekolah.logo}
                alt={sekolah.nama}
                className="w-full h-full object-contain"
                referrerPolicy="no-referrer"
              />
            </div>
            <h1 className="text-3xl sm:text-5xl lg:text-6xl font-extrabold tracking-tight text-white drop-shadow-sm">
              {sekolah.nama}
            </h1>
            {sekolah.alamat && (
              <div className="flex items-center justify-center gap-2 mt-3 text-blue-200 text-sm sm:text-base font-medium">
                <MapPin className="w-4 h-4 text-amber-300 flex-shrink-0" />
                <span>{sekolah.alamat}</span>
              </div>
            )}
            <p className="text-sm sm:text-base text-slate-300 max-w-3xl mx-auto leading-relaxed mt-2">
              {landingConfig.heroDescription ||
                'Menumbuhkan insan beriman, berakhlak mulia, cerdas bernalar kritis, dan unggul dalam prestasi dengan dukungan pembelajaran digital ramah anak berbasis Kurikulum Merdeka.'}
            </p>
          </div>

          <div className="flex flex-wrap items-center justify-center gap-3 pt-2">
            <button
              id="hero-btn-login"
              onClick={onOpenLogin}
              className="px-6 py-3.5 rounded-xl bg-blue-600 hover:bg-blue-500 text-white font-bold text-sm shadow-lg shadow-blue-700/30 flex items-center gap-2.5 transition-all transform hover:-translate-y-0.5 cursor-pointer"
            >
              <span>{landingConfig.heroCtaText || 'Masuk Portal Guru & Admin'}</span>
              <ArrowRight className="w-4 h-4" />
            </button>

            <a
              href="#profil"
              className="px-6 py-3.5 rounded-xl bg-white/10 hover:bg-white/20 text-white border border-white/20 font-semibold text-sm backdrop-blur-sm transition-all"
            >
              {landingConfig.heroSecondaryCtaText || 'Jelajahi Profil Sekolah'}
            </a>
          </div>
        </div>
      </section>

      {/* 2. STATISTIK KARTU SEKOLAH */}
      {landingConfig.showStatistik && (
        <section className="relative -mt-10 z-20 max-w-6xl mx-auto px-4 sm:px-6">
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 sm:gap-6">
          <div className="bg-white rounded-2xl p-5 shadow-xl border border-slate-100 flex items-center gap-4">
            <div className="w-13 h-13 rounded-xl bg-blue-50 text-blue-600 flex items-center justify-center flex-shrink-0">
              <GraduationCap className="w-7 h-7" />
            </div>
            <div>
              <span className="block text-2xl sm:text-3xl font-extrabold text-slate-900 leading-none">
                {siswaCount}
              </span>
              <span className="text-xs sm:text-sm font-semibold text-slate-500 mt-1 block">
                Total Siswa Aktif
              </span>
            </div>
          </div>

          <div className="bg-white rounded-2xl p-5 shadow-xl border border-slate-100 flex items-center gap-4">
            <div className="w-13 h-13 rounded-xl bg-emerald-50 text-emerald-600 flex items-center justify-center flex-shrink-0">
              <Users className="w-7 h-7" />
            </div>
            <div>
              <span className="block text-2xl sm:text-3xl font-extrabold text-slate-900 leading-none">
                {guruList.length}
              </span>
              <span className="text-xs sm:text-sm font-semibold text-slate-500 mt-1 block">
                Dewan Guru & Tendik
              </span>
            </div>
          </div>

          <div className="bg-white rounded-2xl p-5 shadow-xl border border-slate-100 flex items-center gap-4">
            <div className="w-13 h-13 rounded-xl bg-amber-50 text-amber-600 flex items-center justify-center flex-shrink-0">
              <Building2 className="w-7 h-7" />
            </div>
            <div>
              <span className="block text-2xl sm:text-3xl font-extrabold text-slate-900 leading-none">
                {kelasCount}
              </span>
              <span className="text-xs sm:text-sm font-semibold text-slate-500 mt-1 block">
                Rombongan Belajar
              </span>
            </div>
          </div>

          <div className="bg-white rounded-2xl p-5 shadow-xl border border-slate-100 flex items-center gap-4">
            <div className="w-13 h-13 rounded-xl bg-indigo-50 text-indigo-600 flex items-center justify-center flex-shrink-0">
              <Award className="w-7 h-7" />
            </div>
            <div>
              <span className="block text-2xl sm:text-3xl font-extrabold text-slate-900 leading-none">
                A
              </span>
              <span className="text-xs sm:text-sm font-semibold text-slate-500 mt-1 block">
                Akreditasi BAN-S/M
              </span>
            </div>
          </div>
        </div>
      </section>
    )}

      {/* 3. SAMBUTAN KEPALA SEKOLAH */}
      {landingConfig.showSambutan && (
        <section className="py-20 px-4 sm:px-6 lg:px-8 max-w-7xl mx-auto">
        <div className="bg-gradient-to-br from-blue-50/70 to-indigo-50/50 rounded-3xl p-6 sm:p-10 lg:p-12 border border-blue-100 shadow-sm">
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-center">
            <div className="lg:col-span-4 flex flex-col items-center text-center">
              <div className="relative">
                <div className="w-48 h-56 sm:w-56 sm:h-64 rounded-2xl overflow-hidden shadow-lg border-4 border-white bg-slate-200">
                  <img
                    src={sekolah.fotoKepalaSekolah || "https://images.unsplash.com/photo-1544717305-2782549b5136?auto=format&fit=crop&w=400&q=80"}
                    alt={sekolah.namaKepalaSekolah}
                    className="w-full h-full object-cover"
                    referrerPolicy="no-referrer"
                  />
                </div>
                <div className="absolute -bottom-3 -right-3 bg-blue-700 text-white p-2.5 rounded-xl shadow-md">
                  <Quote className="w-5 h-5" />
                </div>
              </div>
              <h3 className="mt-4 text-base sm:text-lg font-bold text-slate-900">
                {sekolah.namaKepalaSekolah}
              </h3>
              <p className="text-xs font-semibold text-blue-700">Kepala Sekolah {sekolah.nama}</p>
              <p className="text-[11px] text-slate-500 mt-0.5">NIP. {sekolah.nipKepalaSekolah}</p>
            </div>

            <div className="lg:col-span-8 space-y-4">
              <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-blue-100 text-blue-800 text-xs font-semibold">
                <BookOpen className="w-3.5 h-3.5" />
                Kata Sambutan
              </div>
              <h2 className="text-2xl sm:text-3xl font-extrabold text-slate-900 tracking-tight">
                Membangun Generasi Cerdas Berkarakter di Era Transformasi Digital
              </h2>
              <div className="text-slate-600 text-sm sm:text-base leading-relaxed space-y-3">
                <p>{sekolah.sambutan}</p>
                <p>
                  Melalui implementasi sistem absensi presisi QR Code dan pengelolaan e-Rapor komprehensif, kami memastikan pelayanan akademik transparan, tepat waktu, dan akuntabel bagi seluruh warga sekolah.
                </p>
              </div>

              <div className="pt-2 flex items-center gap-4">
                <div className="text-xs text-slate-500">
                  <span className="font-semibold text-slate-700">Motto Sekolah:</span> "Cerdas, Berkarakter, Berbudaya, dan Melek Teknologi"
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>
    )}

      {/* 4. PROFIL SEKOLAH, VISI & MISI */}
      {landingConfig.showProfil && (
        <section id="profil" className="py-16 bg-slate-50 border-y border-slate-200">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 space-y-16">
          {/* Header */}
          <div className="text-center max-w-3xl mx-auto space-y-3">
            <span className="text-xs font-bold text-blue-700 uppercase tracking-wider bg-blue-50 px-3 py-1 rounded-full border border-blue-200">
              Profil & Karakter Sekolah
            </span>
            <h2 className="text-3xl sm:text-4xl font-extrabold text-slate-900 tracking-tight">
              Mengenal Lebih Dekat {sekolah.nama}
            </h2>
            <p className="text-slate-600 text-sm sm:text-base leading-relaxed">
              {sekolah.profilSingkat}
            </p>
          </div>

          {/* Visi & Misi Cards */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
            {/* Visi */}
            <div className="bg-white rounded-2xl p-7 sm:p-8 shadow-xs border border-slate-200 flex flex-col justify-between">
              <div className="space-y-4">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-xl bg-blue-100 text-blue-700 flex items-center justify-center flex-shrink-0">
                    <Compass className="w-5 h-5" />
                  </div>
                  <h3 className="text-xl font-bold text-slate-900">Visi Sekolah</h3>
                </div>
                <blockquote className="p-4 bg-blue-50/70 border-l-4 border-blue-600 rounded-r-xl text-slate-700 text-sm sm:text-base font-medium leading-relaxed italic">
                  "{sekolah.visi}"
                </blockquote>
              </div>

              <div className="mt-6 pt-6 border-t border-slate-100 space-y-3">
                <div className="flex items-center gap-2">
                  <Target className="w-4 h-4 text-blue-600" />
                  <span className="text-xs font-bold text-slate-800 uppercase tracking-wider">
                    Tujuan Pokok Pembelajaran
                  </span>
                </div>
                <ul className="space-y-2">
                  {sekolah.tujuan.map((tuj, idx) => (
                    <li key={idx} className="flex items-start gap-2 text-xs sm:text-sm text-slate-600">
                      <CheckCircle2 className="w-4 h-4 text-emerald-600 flex-shrink-0 mt-0.5" />
                      <span>{tuj}</span>
                    </li>
                  ))}
                </ul>
              </div>
            </div>

            {/* Misi */}
            <div className="bg-white rounded-2xl p-7 sm:p-8 shadow-xs border border-slate-200 space-y-4">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-xl bg-indigo-100 text-indigo-700 flex items-center justify-center flex-shrink-0">
                  <Target className="w-5 h-5" />
                </div>
                <h3 className="text-xl font-bold text-slate-900">Misi Sekolah</h3>
              </div>
              <p className="text-xs sm:text-sm text-slate-500">
                Langkah strategis yang kami tempuh dalam mengimplementasikan visi pendidikan berkualitas:
              </p>
              <div className="space-y-3">
                {sekolah.misi.map((item, idx) => (
                  <div
                    key={idx}
                    className="flex items-start gap-3 p-3 rounded-xl bg-slate-50 border border-slate-100"
                  >
                    <span className="w-6 h-6 rounded-full bg-blue-700 text-white text-xs font-bold flex items-center justify-center flex-shrink-0 mt-0.5">
                      {idx + 1}
                    </span>
                    <p className="text-xs sm:text-sm text-slate-700 leading-relaxed font-medium">
                      {item}
                    </p>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      </section>
    )}

      {/* 5. GURU & TENAGA KEPENDIDIKAN */}
      {landingConfig.showGuru && (
        <section id="guru" className="py-20 max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="text-center max-w-2xl mx-auto mb-12 space-y-3">
          <span className="text-xs font-bold text-blue-700 uppercase tracking-wider bg-blue-50 px-3 py-1 rounded-full border border-blue-200">
            Tenaga Pendidik
          </span>
          <h2 className="text-3xl sm:text-4xl font-extrabold text-slate-900 tracking-tight">
            Dewan Guru Berdedikasi
          </h2>
          <p className="text-slate-600 text-sm sm:text-base">
            Pendidik profesional yang senantiasa membimbing, mengayomi, dan menginspirasi siswa-siswi {sekolah.nama}.
          </p>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-6">
          {guruList.map((guru) => (
            <div
              key={guru.id}
              className="bg-white rounded-2xl overflow-hidden border border-slate-200 shadow-xs hover:shadow-md transition-shadow group flex flex-col"
            >
              <div className="h-52 bg-slate-100 overflow-hidden relative">
                <img
                  src={
                    guru.foto ||
                    'https://images.unsplash.com/photo-1544005313-94ddf0286df2?auto=format&fit=crop&w=400&q=80'
                  }
                  alt={guru.nama}
                  className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300"
                  referrerPolicy="no-referrer"
                />
                <div className="absolute top-3 left-3 bg-white/90 backdrop-blur-xs px-2 py-0.5 rounded-md text-[11px] font-bold text-blue-800 shadow-xs">
                  {guru.qrId}
                </div>
              </div>
              <div className="p-4 flex-1 flex flex-col justify-between">
                <div>
                  <h4 className="font-bold text-slate-900 text-sm leading-tight">{guru.nama}</h4>
                  <p className="text-xs font-semibold text-blue-700 mt-1">{guru.jabatan}</p>
                  <p className="text-xs text-slate-500 mt-0.5">{guru.mataPelajaran}</p>
                </div>
                <div className="mt-3 pt-3 border-t border-slate-100 text-[11px] text-slate-400">
                  NIP: {guru.nip || '-'}
                </div>
              </div>
            </div>
          ))}
        </div>
      </section>
      )}

      {/* 6. PENGUMUMAN TERBARU */}
      {landingConfig.showPengumuman && (
        <section id="pengumuman" className="py-16 bg-blue-50/50 border-y border-blue-100">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 space-y-10">
          <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-4">
            <div>
              <span className="text-xs font-bold text-blue-700 uppercase tracking-wider">
                Informasi Resmi
              </span>
              <h2 className="text-3xl font-extrabold text-slate-900 tracking-tight mt-1">
                Pengumuman Sekolah
              </h2>
            </div>
            <p className="text-sm text-slate-500 max-w-md">
              Pemberitahuan resmi terkait kegiatan belajar mengajar, agenda ujian, dan PPDB di {sekolah.nama}.
            </p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            {pengumumanList.map((item) => (
              <div
                key={item.id}
                className="bg-white rounded-2xl overflow-hidden border border-slate-200 shadow-xs hover:shadow-md transition-all flex flex-col"
              >
                {item.gambar && (
                  <div className="h-44 overflow-hidden">
                    <img
                      src={item.gambar}
                      alt={item.judul}
                      className="w-full h-full object-cover hover:scale-105 transition-transform duration-300"
                      referrerPolicy="no-referrer"
                    />
                  </div>
                )}
                <div className="p-5 flex-1 flex flex-col justify-between space-y-4">
                  <div className="space-y-2">
                    <div className="flex items-center gap-2 text-xs text-blue-700 font-semibold">
                      <Calendar className="w-3.5 h-3.5" />
                      <span>{item.tanggal}</span>
                      <span className="text-slate-300">•</span>
                      <span className="text-slate-500 font-normal">{item.penulis}</span>
                    </div>
                    <h3 className="font-bold text-slate-900 text-base leading-snug line-clamp-2">
                      {item.judul}
                    </h3>
                    <p className="text-xs text-slate-600 line-clamp-3 leading-relaxed">
                      {item.isi}
                    </p>
                  </div>

                  <button
                    onClick={() => setSelectedPengumuman(item)}
                    className="inline-flex items-center gap-1.5 text-xs font-bold text-blue-700 hover:text-blue-900 transition-colors pt-2 cursor-pointer"
                  >
                    <span>Baca Selengkapnya</span>
                    <ChevronRight className="w-3.5 h-3.5" />
                  </button>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>
    )}

      {/* 7. BERITA TERBARU */}
      {landingConfig.showBerita && (
        <section id="berita" className="py-20 max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 space-y-10">
        <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-4">
          <div>
            <span className="text-xs font-bold text-blue-700 uppercase tracking-wider">
              Kabar Sekolah
            </span>
            <h2 className="text-3xl font-extrabold text-slate-900 tracking-tight mt-1">
              Berita & Prestasi Terkini
            </h2>
          </div>
          <span className="text-xs font-semibold text-slate-500 bg-slate-100 px-3 py-1.5 rounded-full">
            Update Berkala {new Date().getFullYear()}
          </span>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          {beritaList.map((berita) => (
            <article
              key={berita.id}
              className="bg-white rounded-2xl overflow-hidden border border-slate-200 shadow-xs hover:shadow-lg transition-all flex flex-col group cursor-pointer"
              onClick={() => setSelectedBerita(berita)}
            >
              <div className="h-48 overflow-hidden relative bg-slate-100">
                <img
                  src={
                    berita.gambar ||
                    'https://images.unsplash.com/photo-1577896851231-70ef18881754?auto=format&fit=crop&w=800&q=80'
                  }
                  alt={berita.judul}
                  className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300"
                  referrerPolicy="no-referrer"
                />
                <span className="absolute top-3 left-3 px-2.5 py-1 rounded-full text-[11px] font-bold bg-blue-700 text-white shadow-xs">
                  {berita.kategori}
                </span>
              </div>
              <div className="p-5 flex-1 flex flex-col justify-between space-y-3">
                <div className="space-y-2">
                  <div className="flex items-center gap-2 text-xs text-slate-400">
                    <Calendar className="w-3.5 h-3.5" />
                    <span>{berita.tanggal}</span>
                  </div>
                  <h3 className="font-bold text-slate-900 text-base leading-snug group-hover:text-blue-700 transition-colors">
                    {berita.judul}
                  </h3>
                  <p className="text-xs text-slate-600 line-clamp-2 leading-relaxed">
                    {berita.ringkasan || berita.isi}
                  </p>
                </div>
                <div className="pt-2 flex items-center justify-between border-t border-slate-100 text-xs">
                  <span className="text-slate-400 font-medium">Oleh: {berita.penulis}</span>
                  <span className="text-blue-700 font-bold flex items-center gap-1 group-hover:translate-x-1 transition-transform">
                    Baca <ArrowRight className="w-3 h-3" />
                  </span>
                </div>
              </div>
            </article>
          ))}
        </div>
      </section>
      )}

      {/* 8. GALERI KEGIATAN */}
      {landingConfig.showGaleri && (
        <section id="galeri" className="py-20 bg-slate-900 text-white">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 space-y-10">
          <div className="text-center max-w-2xl mx-auto space-y-2">
            <span className="text-xs font-bold text-blue-400 uppercase tracking-wider">
              Dokumentasi Visual
            </span>
            <h2 className="text-3xl sm:text-4xl font-extrabold text-white tracking-tight">
              Galeri Kegiatan Sekolah
            </h2>
            <p className="text-slate-400 text-sm">
              Momen berharga dan semarak aktivitas peserta didik {sekolah.nama} dalam pembelajaran serta kreasi budaya.
            </p>
          </div>

          <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-3 gap-4 sm:gap-6">
            {galeriList.map((item) => (
              <div
                key={item.id}
                onClick={() => setSelectedImage(item)}
                className="relative group rounded-2xl overflow-hidden aspect-4/3 bg-slate-800 cursor-pointer shadow-md"
              >
                <img
                  src={item.gambar}
                  alt={item.judul}
                  className="w-full h-full object-cover group-hover:scale-110 transition-transform duration-500"
                  referrerPolicy="no-referrer"
                />
                <div className="absolute inset-0 bg-gradient-to-t from-slate-950 via-slate-900/40 to-transparent opacity-0 group-hover:opacity-100 transition-opacity flex flex-col justify-end p-4">
                  <span className="text-[11px] font-semibold text-blue-400 uppercase tracking-wider">
                    {item.kategori}
                  </span>
                  <h4 className="text-sm font-bold text-white leading-snug">{item.judul}</h4>
                  <p className="text-[10px] text-slate-300 mt-0.5">{item.tanggal}</p>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>
    )}

      {/* 9. KONTAK & LOKASI */}
      {landingConfig.showKontak && (
        <section id="kontak" className="py-20 max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="bg-white rounded-3xl border border-slate-200 shadow-md p-6 sm:p-10 lg:p-12">
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-10">
            <div className="space-y-6">
              <div>
                <span className="text-xs font-bold text-blue-700 uppercase tracking-wider">
                  Hubungi Kami
                </span>
                <h2 className="text-3xl font-extrabold text-slate-900 tracking-tight mt-1">
                  Kontak & Lokasi {sekolah.nama}
                </h2>
                <p className="text-slate-600 text-sm mt-2 leading-relaxed">
                  Kami siap melayani kebutuhan informasi akademis, administrasi kesiswaan, kemitraan komite, serta pendaftaran peserta didik baru.
                </p>
              </div>

              <div className="space-y-4">
                <div className="flex items-start gap-3.5 p-3.5 rounded-xl bg-slate-50 border border-slate-100">
                  <MapPin className="w-5 h-5 text-blue-700 flex-shrink-0 mt-0.5" />
                  <div className="text-xs sm:text-sm">
                    <span className="font-bold text-slate-900 block">Alamat Sekolah</span>
                    <span className="text-slate-600">
                      {sekolah.alamat}
                    </span>
                  </div>
                </div>

                <div className="flex items-start gap-3.5 p-3.5 rounded-xl bg-slate-50 border border-slate-100">
                  <Phone className="w-5 h-5 text-blue-700 flex-shrink-0 mt-0.5" />
                  <div className="text-xs sm:text-sm">
                    <span className="font-bold text-slate-900 block">Telepon / Fax</span>
                    <span className="text-slate-600">{sekolah.telepon}</span>
                  </div>
                </div>

                <div className="flex items-start gap-3.5 p-3.5 rounded-xl bg-slate-50 border border-slate-100">
                  <Mail className="w-5 h-5 text-blue-700 flex-shrink-0 mt-0.5" />
                  <div className="text-xs sm:text-sm">
                    <span className="font-bold text-slate-900 block">Email Resmi</span>
                    <span className="text-slate-600">{sekolah.email}</span>
                  </div>
                </div>

                <div className="flex items-start gap-3.5 p-3.5 rounded-xl bg-slate-50 border border-slate-100">
                  <Clock className="w-5 h-5 text-blue-700 flex-shrink-0 mt-0.5" />
                  <div className="text-xs sm:text-sm">
                    <span className="font-bold text-slate-900 block">Jam Operasional Pelayanan</span>
                    <span className="text-slate-600">Senin - Sabtu: 06.45 s.d. 14.00 WIB</span>
                  </div>
                </div>
              </div>
            </div>

            {/* Interactive Map Visual Frame */}
            <div className="rounded-2xl overflow-hidden border border-slate-200 bg-slate-100 flex flex-col relative min-h-[320px]">
              <div className="bg-blue-900 text-white px-4 py-2.5 flex items-center justify-between text-xs">
                <span className="font-semibold flex items-center gap-1.5">
                  <MapPin className="w-3.5 h-3.5 text-blue-300" /> Peta Lokasi {sekolah.kecamatan ? `Kec. ${sekolah.kecamatan}` : 'Sekolah'}
                </span>
                <span className="bg-blue-800 px-2 py-0.5 rounded text-[10px]">Zona Pendidikan</span>
              </div>
              <div className="flex-1 relative flex items-center justify-center p-6 bg-slate-50">
                <div className="text-center space-y-3 max-w-sm">
                  <div className="w-16 h-16 bg-blue-100 text-blue-700 rounded-full flex items-center justify-center mx-auto shadow-inner">
                    <MapPin className="w-8 h-8 animate-bounce" />
                  </div>
                  <h4 className="font-bold text-slate-900 text-base">{sekolah.nama}</h4>
                  <p className="text-xs text-slate-500">
                    {sekolah.alamat}. Berada di lingkungan asri dan mudah diakses oleh peserta didik, orang tua, dan masyarakat.
                  </p>
                  <a
                    href={`https://maps.google.com/?q=${encodeURIComponent(sekolah.nama + ' ' + (sekolah.alamat || ''))}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center gap-1.5 px-4 py-2 bg-blue-700 hover:bg-blue-800 text-white rounded-lg text-xs font-semibold shadow-xs transition-colors"
                  >
                    <span>Buka Petunjuk Arah di Google Maps</span>
                    <ArrowRight className="w-3.5 h-3.5" />
                  </a>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>
    )}

      {/* MODAL BACA PENGUMUMAN */}
      {selectedPengumuman && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/70 backdrop-blur-xs animate-in fade-in">
          <div className="bg-white rounded-2xl max-w-lg w-full overflow-hidden shadow-2xl border border-slate-200">
            {selectedPengumuman.gambar && (
              <div className="h-48 overflow-hidden bg-slate-100">
                <img
                  src={selectedPengumuman.gambar}
                  alt={selectedPengumuman.judul}
                  className="w-full h-full object-cover"
                />
              </div>
            )}
            <div className="p-6 space-y-4">
              <div className="flex justify-between items-start gap-2">
                <div className="text-xs text-blue-700 font-semibold flex items-center gap-2">
                  <Calendar className="w-3.5 h-3.5" />
                  <span>{selectedPengumuman.tanggal}</span>
                  <span className="text-slate-300">•</span>
                  <span className="text-slate-500">{selectedPengumuman.penulis}</span>
                </div>
                <button
                  onClick={() => setSelectedPengumuman(null)}
                  className="text-slate-400 hover:text-slate-700 p-1"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>
              <h3 className="text-lg font-bold text-slate-900 leading-snug">
                {selectedPengumuman.judul}
              </h3>
              <div className="text-sm text-slate-600 leading-relaxed max-h-60 overflow-y-auto pr-1 whitespace-pre-line">
                {selectedPengumuman.isi}
              </div>
              <div className="pt-2 text-right">
                <button
                  onClick={() => setSelectedPengumuman(null)}
                  className="px-4 py-2 rounded-lg bg-blue-700 text-white text-xs font-semibold"
                >
                  Tutup
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* MODAL BACA BERITA */}
      {selectedBerita && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/70 backdrop-blur-xs animate-in fade-in">
          <div className="bg-white rounded-2xl max-w-2xl w-full overflow-hidden shadow-2xl border border-slate-200 flex flex-col max-h-[90vh]">
            <div className="relative h-64 overflow-hidden bg-slate-100 flex-shrink-0">
              <img
                src={selectedBerita.gambar}
                alt={selectedBerita.judul}
                className="w-full h-full object-cover"
              />
              <button
                onClick={() => setSelectedBerita(null)}
                className="absolute top-4 right-4 bg-black/60 text-white hover:bg-black p-2 rounded-full backdrop-blur-xs transition-colors"
              >
                <X className="w-5 h-5" />
              </button>
              <span className="absolute bottom-4 left-4 bg-blue-700 text-white text-xs font-bold px-3 py-1 rounded-full shadow-sm">
                {selectedBerita.kategori}
              </span>
            </div>
            <div className="p-6 overflow-y-auto space-y-4 flex-1">
              <div className="flex items-center gap-3 text-xs text-slate-500">
                <span>Tanggal: {selectedBerita.tanggal}</span>
                <span>•</span>
                <span>Penulis: {selectedBerita.penulis}</span>
              </div>
              <h3 className="text-xl font-bold text-slate-900 leading-tight">
                {selectedBerita.judul}
              </h3>
              <p className="text-sm text-slate-700 leading-relaxed whitespace-pre-line">
                {selectedBerita.isi}
              </p>
            </div>
            <div className="p-4 border-t border-slate-100 bg-slate-50 flex justify-end">
              <button
                onClick={() => setSelectedBerita(null)}
                className="px-5 py-2 rounded-xl bg-blue-700 text-white text-xs font-semibold hover:bg-blue-800"
              >
                Selesai Membaca
              </button>
            </div>
          </div>
        </div>
      )}

      {/* MODAL PREVIEW GAMBAR GALERI */}
      {selectedImage && (
        <div
          onClick={() => setSelectedImage(null)}
          className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/90 backdrop-blur-md animate-in fade-in"
        >
          <div
            onClick={(e) => e.stopPropagation()}
            className="max-w-4xl w-full bg-slate-900 rounded-2xl overflow-hidden border border-slate-800 shadow-2xl flex flex-col"
          >
            <div className="p-3 bg-slate-950 flex justify-between items-center text-white">
              <span className="text-xs font-semibold text-blue-400">
                {selectedImage.kategori} — {selectedImage.tanggal}
              </span>
              <button
                onClick={() => setSelectedImage(null)}
                className="p-1 rounded-lg text-slate-400 hover:text-white"
              >
                <X className="w-5 h-5" />
              </button>
            </div>
            <div className="max-h-[75vh] flex items-center justify-center bg-black">
              <img
                src={selectedImage.gambar}
                alt={selectedImage.judul}
                className="max-h-[70vh] w-auto object-contain"
              />
            </div>
            <div className="p-4 bg-slate-900 text-white">
              <h4 className="font-bold text-sm sm:text-base">{selectedImage.judul}</h4>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
