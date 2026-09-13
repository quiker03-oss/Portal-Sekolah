import React, { useState, useEffect } from 'react';
import { db } from '../../services/database';
import {
  User,
  NaskahUjianAI,
  ModulAjarAI,
  BahanAjarAI,
  SoalPilihanGanda,
  SoalEsai,
  Settings,
} from '../../types';
import Markdown from 'react-markdown';
import {
  Sparkles,
  BookOpen,
  FileText,
  Printer,
  Copy,
  Check,
  Trash2,
  Save,
  GraduationCap,
  Clock,
  HelpCircle,
  Lightbulb,
  FileCheck,
  RefreshCw,
  Sliders,
  CheckCircle,
  AlertCircle,
  Eye,
  EyeOff,
  FolderKanban,
  Layers,
  Search,
} from 'lucide-react';

interface AsistenAiGuruViewProps {
  currentUser: User;
}

export const AsistenAiGuruView: React.FC<AsistenAiGuruViewProps> = ({ currentUser }) => {
  const [activeSubTab, setActiveSubTab] = useState<'buat-soal' | 'buat-modul' | 'buat-materi' | 'bank-tersimpan'>('buat-soal');
  const [settings, setSettings] = useState<Settings>(db.getSettings());
  const kelasList = db.getKelasList();
  const mapelList = db.getMapelList();

  // Notification state
  const [statusMsg, setStatusMsg] = useState<{ type: 'success' | 'error'; text: string } | null>(null);
  const [isCopied, setIsCopied] = useState(false);

  // ==================== STATE BUAT SOAL ====================
  const [soalMapel, setSoalMapel] = useState<string>(mapelList[0]?.nama || 'Pendidikan Pancasila');
  const [soalKelas, setSoalKelas] = useState<string>(kelasList[0]?.nama || '4');
  const [soalKurikulum, setSoalKurikulum] = useState<'Kurikulum Merdeka' | 'Kurikulum 2013'>('Kurikulum Merdeka');
  const [soalJenis, setSoalJenis] = useState<'Ulangan Harian' | 'Penilaian Tengah Semester (PTS/STS)' | 'Penilaian Akhir Semester (PAS/SAS)' | 'Kuis / Latihan Harian'>('Ulangan Harian');
  const [soalTingkat, setSoalTingkat] = useState<'Mudah' | 'Sedang' | 'HOTS (Analisis Tinggi)'>('Sedang');
  const [soalTopik, setSoalTopik] = useState<string>('Keragaman Budaya dan Nilai Gotong Royong');
  const [soalJumlahPg, setSoalJumlahPg] = useState<number>(5);
  const [soalJumlahEsai, setSoalJumlahEsai] = useState<number>(2);
  const [soalCatatan, setSoalCatatan] = useState<string>('');
  const [isGeneratingSoal, setIsGeneratingSoal] = useState<boolean>(false);
  const [hasilSoal, setHasilSoal] = useState<NaskahUjianAI | null>(null);
  const [showKunciJawaban, setShowKunciJawaban] = useState<boolean>(true);

  // ==================== STATE BUAT MODUL (RPP) ====================
  const [modulMapel, setModulMapel] = useState<string>(mapelList[0]?.nama || 'IPAS');
  const [modulFase, setModulFase] = useState<string>('Fase B (Kelas 4)');
  const [modulWaktu, setModulWaktu] = useState<string>('2 x 35 Menit (1 Pertemuan)');
  const [modulTopik, setModulTopik] = useState<string>('Siklus Air dan Pelestarian Sumber Daya Alam');
  const [selectedProfil, setSelectedProfil] = useState<string[]>(['Bernalar Kritis', 'Gotong Royong']);
  const [modulCatatan, setModulCatatan] = useState<string>('');
  const [isGeneratingModul, setIsGeneratingModul] = useState<boolean>(false);
  const [hasilModul, setHasilModul] = useState<ModulAjarAI | null>(null);

  // ==================== STATE BUAT MATERI & LKPD ====================
  const [materiMapel, setMateriMapel] = useState<string>(mapelList[0]?.nama || 'Bahasa Indonesia');
  const [materiKelas, setMateriKelas] = useState<string>('4');
  const [materiTopik, setMateriTopik] = useState<string>('Menemukan Ide Pokok dan Kalimat Pendukung dalam Paragraf');
  const [materiTipe, setMateriTipe] = useState<'ringkasan' | 'lkpd' | 'remedial'>('ringkasan');
  const [materiCatatan, setMateriCatatan] = useState<string>('');
  const [isGeneratingMateri, setIsGeneratingMateri] = useState<boolean>(false);
  const [hasilMateri, setHasilMateri] = useState<BahanAjarAI | null>(null);

  // ==================== BANK DATA ====================
  const [savedSoalList, setSavedSoalList] = useState<NaskahUjianAI[]>(db.getNaskahSoalList());
  const [savedModulList, setSavedModulList] = useState<ModulAjarAI[]>(db.getModulAjarList());
  const [savedMateriList, setSavedMateriList] = useState<BahanAjarAI[]>(db.getBahanAjarList());
  const [bankFilter, setBankFilter] = useState<'semua' | 'soal' | 'modul' | 'materi'>('semua');
  const [bankSearch, setBankSearch] = useState<string>('');

  useEffect(() => {
    const handleUpdate = () => {
      setSavedSoalList(db.getNaskahSoalList());
      setSavedModulList(db.getModulAjarList());
      setSavedMateriList(db.getBahanAjarList());
      setSettings(db.getSettings());
    };
    window.addEventListener('ai_soal_updated', handleUpdate);
    window.addEventListener('ai_modul_updated', handleUpdate);
    window.addEventListener('ai_materi_updated', handleUpdate);
    window.addEventListener('sekolah_updated', handleUpdate);
    window.addEventListener('settings_updated', handleUpdate);
    return () => {
      window.removeEventListener('ai_soal_updated', handleUpdate);
      window.removeEventListener('ai_modul_updated', handleUpdate);
      window.removeEventListener('ai_materi_updated', handleUpdate);
      window.removeEventListener('sekolah_updated', handleUpdate);
      window.removeEventListener('settings_updated', handleUpdate);
    };
  }, []);

  const formatAiErrorMessage = (rawMsg: string): string => {
    if (!rawMsg) return 'Terjadi kendala saat memproses permintaan AI. Silakan coba kembali.';
    if (
      rawMsg.includes('503') ||
      rawMsg.includes('UNAVAILABLE') ||
      rawMsg.includes('high demand') ||
      rawMsg.includes('antrean')
    ) {
      return 'Layanan server AI sedang mengalami antrean trafik tinggi. Silakan klik coba lagi dalam beberapa saat.';
    }
    if (rawMsg.includes('429') || rawMsg.includes('RESOURCE_EXHAUSTED')) {
      return 'Batas frekuensi permintaan AI sedang padat. Mohon jeda beberapa detik lalu coba lagi.';
    }
    if (rawMsg.startsWith('{') && rawMsg.includes('"message"')) {
      try {
        const parsed = JSON.parse(rawMsg);
        if (parsed.error?.message) {
          return formatAiErrorMessage(parsed.error.message);
        }
      } catch {
        // ignore
      }
    }
    return rawMsg;
  };

  const showNotification = (type: 'success' | 'error', text: string) => {
    const displayText = type === 'error' ? formatAiErrorMessage(text) : text;
    setStatusMsg({ type, text: displayText });
    setTimeout(
      () => {
        setStatusMsg(null);
      },
      type === 'error' ? 7000 : 4000
    );
  };

  const copyToClipboard = (text: string) => {
    navigator.clipboard.writeText(text);
    setIsCopied(true);
    showNotification('success', 'Teks berhasil disalin ke clipboard!');
    setTimeout(() => setIsCopied(false), 2000);
  };

  // 1. GENERATE SOAL
  const handleGenerateSoal = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!soalTopik.trim()) {
      showNotification('error', 'Silakan masukkan topik materi soal terlebih dahulu.');
      return;
    }

    setIsGeneratingSoal(true);
    setStatusMsg(null);

    try {
      const res = await fetch('/api/ai/buat-soal', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          mataPelajaran: soalMapel,
          kelas: soalKelas,
          kurikulum: soalKurikulum,
          jenisUjian: soalJenis,
          tingkatKesulitan: soalTingkat,
          topikMateri: soalTopik,
          jumlahPg: Number(soalJumlahPg),
          jumlahEsai: Number(soalJumlahEsai),
          instruksiTambahan: soalCatatan,
        }),
      });

      const json = await res.json();
      if (!res.ok || !json.success) {
        throw new Error(json.error || 'Gagal menghasilkan soal. Periksa koneksi atau API Key server.');
      }

      const generatedData: NaskahUjianAI = {
        id: `soal-${Date.now()}`,
        guruId: currentUser.id,
        guruName: currentUser.name,
        judul: json.data.judul || `Naskah ${soalJenis} ${soalMapel} Kelas ${soalKelas}`,
        mataPelajaran: soalMapel,
        kelas: soalKelas,
        kurikulum: soalKurikulum,
        jenisUjian: soalJenis,
        tingkatKesulitan: soalTingkat,
        topikMateri: soalTopik,
        petunjukUmum:
          json.data.petunjukUmum ||
          'Berdoalah sebelum mengerjakan soal. Bacalah setiap butir soal dengan cermat dan teliti sebelum memilih atau menulis jawaban.',
        pilihanGanda: json.data.pilihanGanda || [],
        esai: json.data.esai || [],
        createdAt: new Date().toISOString(),
      };

      setHasilSoal(generatedData);
      // Auto-save to school database
      db.saveNaskahSoal(generatedData);
      showNotification('success', 'Naskah soal ulangan berhasil dibuat oleh Gemini AI dan tersimpan di Bank Soal!');
    } catch (err: any) {
      console.error('Error generate soal:', err);
      showNotification('error', err.message || 'Terjadi kesalahan saat memproses soal.');
    } finally {
      setIsGeneratingSoal(false);
    }
  };

  // 2. GENERATE MODUL AJAR (RPP)
  const handleGenerateModul = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!modulTopik.trim()) {
      showNotification('error', 'Silakan masukkan topik pembelajaran modul ajar.');
      return;
    }

    setIsGeneratingModul(true);
    setStatusMsg(null);

    try {
      const res = await fetch('/api/ai/buat-modul', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          mataPelajaran: modulMapel,
          faseKelas: modulFase,
          alokasiWaktu: modulWaktu,
          topikMateri: modulTopik,
          profilPancasila: selectedProfil,
          instruksiTambahan: modulCatatan,
        }),
      });

      const json = await res.json();
      if (!res.ok || !json.success) {
        throw new Error(json.error || 'Gagal menyusun modul ajar. Periksa koneksi atau API Key server.');
      }

      const generatedModul: ModulAjarAI = {
        id: `modul-${Date.now()}`,
        guruId: currentUser.id,
        guruName: currentUser.name,
        judul: json.data.judul || `Modul Ajar ${modulMapel} - ${modulTopik}`,
        mataPelajaran: modulMapel,
        faseKelas: modulFase,
        alokasiWaktu: modulWaktu,
        targetProfilPelajar: json.data.targetProfilPelajar || selectedProfil,
        tujuanPembelajaran: json.data.tujuanPembelajaran || [],
        pemahamanBermakna: json.data.pemahamanBermakna || '',
        pertanyaanPemantik: json.data.pertanyaanPemantik || [],
        kegiatanPembelajaran: json.data.kegiatanPembelajaran || {
          pendahuluan: [],
          inti: [],
          penutup: [],
        },
        asesmen: json.data.asesmen || {
          diagnostik: '',
          formatif: '',
          sumatif: '',
        },
        lembarKerjaRingkas: json.data.lembarKerjaRingkas || '',
        createdAt: new Date().toISOString(),
      };

      setHasilModul(generatedModul);
      db.saveModulAjar(generatedModul);
      showNotification('success', 'Modul Ajar Kurikulum Merdeka berhasil disusun dan disimpan di Bank Modul!');
    } catch (err: any) {
      console.error('Error generate modul:', err);
      showNotification('error', err.message || 'Terjadi kesalahan saat membuat modul.');
    } finally {
      setIsGeneratingModul(false);
    }
  };

  // 3. GENERATE BAHAN AJAR / LKPD
  const handleGenerateMateri = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!materiTopik.trim()) {
      showNotification('error', 'Silakan masukkan materi pembelajaran.');
      return;
    }

    setIsGeneratingMateri(true);
    setStatusMsg(null);

    try {
      const res = await fetch('/api/ai/buat-materi', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          mataPelajaran: materiMapel,
          kelas: materiKelas,
          topikMateri: materiTopik,
          tipe: materiTipe,
          instruksiTambahan: materiCatatan,
        }),
      });

      const json = await res.json();
      if (!res.ok || !json.success) {
        throw new Error(json.error || 'Gagal membuat bahan ajar. Periksa koneksi atau API Key server.');
      }

      const generatedMateri: BahanAjarAI = {
        id: `materi-${Date.now()}`,
        guruId: currentUser.id,
        guruName: currentUser.name,
        judul: `${materiTipe === 'lkpd' ? 'LKPD' : materiTipe === 'remedial' ? 'Materi Remedial' : 'Bahan Ajar'} ${materiMapel} Kelas ${materiKelas}`,
        mataPelajaran: materiMapel,
        kelas: materiKelas,
        topikMateri: materiTopik,
        tipe: materiTipe,
        isiMarkdown: json.markdown || '',
        createdAt: new Date().toISOString(),
      };

      setHasilMateri(generatedMateri);
      db.saveBahanAjar(generatedMateri);
      showNotification('success', 'Bahan ajar / LKPD berhasil dibuat oleh Gemini AI!');
    } catch (err: any) {
      console.error('Error generate materi:', err);
      showNotification('error', err.message || 'Terjadi kesalahan saat memproses materi.');
    } finally {
      setIsGeneratingMateri(false);
    }
  };

  const handlePrint = () => {
    window.print();
  };

  const toggleProfil = (dim: string) => {
    if (selectedProfil.includes(dim)) {
      setSelectedProfil(selectedProfil.filter((d) => d !== dim));
    } else {
      setSelectedProfil([...selectedProfil, dim]);
    }
  };

  // Convert Soal to text for easy copying
  const generateSoalRawText = (soal: NaskahUjianAI, withAnswer: boolean) => {
    let out = `${settings.namaSekolah}\n${soal.judul}\n`;
    out += `Mata Pelajaran: ${soal.mataPelajaran} | Kelas: ${soal.kelas} | Kurikulum: ${soal.kurikulum}\n`;
    out += `Petunjuk: ${soal.petunjukUmum}\n\n`;
    out += `--- BAGIAN I: PILIHAN GANDA ---\n`;
    soal.pilihanGanda.forEach((pg) => {
      out += `${pg.nomor}. ${pg.pertanyaan}\n`;
      out += `   A. ${pg.pilihan.A}\n   B. ${pg.pilihan.B}\n   C. ${pg.pilihan.C}\n   D. ${pg.pilihan.D}\n`;
      if (withAnswer) {
        out += `   [Kunci: ${pg.kunciJawaban}] Pembahasan: ${pg.pembahasan}\n`;
      }
      out += `\n`;
    });

    if (soal.esai && soal.esai.length > 0) {
      out += `--- BAGIAN II: ESAI / URAIAN ---\n`;
      soal.esai.forEach((es) => {
        out += `${es.nomor}. ${es.pertanyaan}\n`;
        if (withAnswer) {
          out += `   Pedoman Penskoran: ${es.pedomanPenskoran}\n`;
          out += `   Kunci Jawaban Ideal: ${es.kunciJawaban}\n`;
        }
        out += `\n`;
      });
    }
    return out;
  };

  return (
    <div className="space-y-6">
      {/* Top Banner */}
      <div className="bg-gradient-to-r from-blue-900 via-indigo-900 to-blue-950 rounded-2xl p-6 text-white shadow-md relative overflow-hidden">
        <div className="relative z-10 flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
          <div>
            <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-white/10 text-amber-300 text-xs font-semibold backdrop-blur-xs border border-white/10">
              <Sparkles className="w-3.5 h-3.5" />
              <span>Asisten Guru Berbasis AI (Google Gemini)</span>
            </div>
            <h2 className="text-xl sm:text-2xl font-bold mt-2 tracking-tight">
              Pembuat Soal Ulangan & Modul Pembelajaran Digital
            </h2>
            <p className="text-xs sm:text-sm text-blue-200 mt-1 max-w-2xl leading-relaxed">
              Memudahkan Bapak/Ibu Guru membuat soal ulangan (Pilihan Ganda & Esai lengkap dengan kunci jawaban),
              menyusun Modul Ajar (RPP Plus Kurikulum Merdeka), dan Lembar Kerja Peserta Didik (LKPD) secara cepat dan tepat.
            </p>
          </div>

          <div className="flex items-center gap-2 bg-white/10 p-2.5 rounded-xl border border-white/15 text-xs">
            <GraduationCap className="w-5 h-5 text-blue-300" />
            <div>
              <div className="text-[10px] text-blue-200 uppercase font-semibold">Login Sebagai Guru</div>
              <div className="font-bold text-white">{currentUser.name}</div>
            </div>
          </div>
        </div>
      </div>

      {/* Notifications */}
      {statusMsg && (
        <div
          className={`p-4 rounded-2xl text-xs font-semibold flex items-center gap-3 animate-in fade-in ${
            statusMsg.type === 'success'
              ? 'bg-emerald-50 border border-emerald-200 text-emerald-900'
              : 'bg-rose-50 border border-rose-200 text-rose-900'
          }`}
        >
          {statusMsg.type === 'success' ? (
            <CheckCircle className="w-5 h-5 text-emerald-600 flex-shrink-0" />
          ) : (
            <AlertCircle className="w-5 h-5 text-rose-600 flex-shrink-0" />
          )}
          <span>{statusMsg.text}</span>
        </div>
      )}

      {/* Sub-Navigation Tabs */}
      <div className="flex flex-wrap items-center gap-2 bg-white p-1.5 rounded-2xl border border-slate-200 shadow-xs">
        <button
          type="button"
          onClick={() => setActiveSubTab('buat-soal')}
          className={`px-4 py-2.5 rounded-xl text-xs font-bold transition-all flex items-center gap-2 cursor-pointer ${
            activeSubTab === 'buat-soal'
              ? 'bg-blue-700 text-white shadow-xs'
              : 'text-slate-600 hover:bg-slate-100'
          }`}
        >
          <FileCheck className="w-4 h-4" />
          <span>Pembuat Soal Ulangan</span>
        </button>

        <button
          type="button"
          onClick={() => setActiveSubTab('buat-modul')}
          className={`px-4 py-2.5 rounded-xl text-xs font-bold transition-all flex items-center gap-2 cursor-pointer ${
            activeSubTab === 'buat-modul'
              ? 'bg-blue-700 text-white shadow-xs'
              : 'text-slate-600 hover:bg-slate-100'
          }`}
        >
          <BookOpen className="w-4 h-4" />
          <span>Penyusun Modul Ajar (RPP)</span>
        </button>

        <button
          type="button"
          onClick={() => setActiveSubTab('buat-materi')}
          className={`px-4 py-2.5 rounded-xl text-xs font-bold transition-all flex items-center gap-2 cursor-pointer ${
            activeSubTab === 'buat-materi'
              ? 'bg-blue-700 text-white shadow-xs'
              : 'text-slate-600 hover:bg-slate-100'
          }`}
        >
          <Lightbulb className="w-4 h-4" />
          <span>Bahan Ajar & LKPD</span>
        </button>

        <button
          type="button"
          onClick={() => setActiveSubTab('bank-tersimpan')}
          className={`px-4 py-2.5 rounded-xl text-xs font-bold transition-all flex items-center gap-2 cursor-pointer ml-auto ${
            activeSubTab === 'bank-tersimpan'
              ? 'bg-indigo-700 text-white shadow-xs'
              : 'text-slate-600 hover:bg-slate-100'
          }`}
        >
          <FolderKanban className="w-4 h-4" />
          <span>Bank Soal & Dokumen Tersimpan ({savedSoalList.length + savedModulList.length + savedMateriList.length})</span>
        </button>
      </div>

      {/* ========================================================================= */}
      {/* 1. PEMBUAT SOAL ULANGAN */}
      {/* ========================================================================= */}
      {activeSubTab === 'buat-soal' && (
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
          {/* Form Generator */}
          <div className="lg:col-span-5 space-y-4">
            <div className="bg-white rounded-2xl p-6 border border-slate-200 shadow-xs">
              <div className="flex items-center gap-2 border-b border-slate-100 pb-3 mb-4">
                <Sliders className="w-4 h-4 text-blue-700" />
                <h3 className="text-sm font-bold text-slate-900">Parameter Naskah Soal</h3>
              </div>

              <form onSubmit={handleGenerateSoal} className="space-y-4">
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-xs font-semibold text-slate-700 mb-1">
                      Mata Pelajaran
                    </label>
                    <input
                      type="text"
                      list="mapel-options"
                      value={soalMapel}
                      onChange={(e) => setSoalMapel(e.target.value)}
                      className="w-full px-3 py-2 bg-slate-50 border border-slate-300 rounded-xl text-xs focus:bg-white"
                      placeholder="Pilih / ketik mapel"
                      required
                    />
                    <datalist id="mapel-options">
                      {mapelList.map((m) => (
                        <option key={m.id} value={m.nama} />
                      ))}
                      <option value="Pendidikan Pancasila" />
                      <option value="Bahasa Indonesia" />
                      <option value="Matematika" />
                      <option value="IPAS (IPA & IPS)" />
                      <option value="Pendidikan Agama & Budi Pekerti" />
                      <option value="PJOK" />
                      <option value="Seni Budaya & Prakarya" />
                      <option value="Bahasa Sunda" />
                      <option value="Bahasa Inggris" />
                    </datalist>
                  </div>

                  <div>
                    <label className="block text-xs font-semibold text-slate-700 mb-1">
                      Tingkat Kelas
                    </label>
                    <select
                      value={soalKelas}
                      onChange={(e) => setSoalKelas(e.target.value)}
                      className="w-full px-3 py-2 bg-slate-50 border border-slate-300 rounded-xl text-xs focus:bg-white"
                    >
                      {kelasList.length > 0 ? (
                        kelasList.map((k) => (
                          <option key={k.id} value={k.nama}>
                            Kelas {k.nama}
                          </option>
                        ))
                      ) : (
                        <>
                          <option value="1">Kelas 1</option>
                          <option value="2">Kelas 2</option>
                          <option value="3">Kelas 3</option>
                          <option value="4">Kelas 4</option>
                          <option value="5">Kelas 5</option>
                          <option value="6">Kelas 6</option>
                        </>
                      )}
                    </select>
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-xs font-semibold text-slate-700 mb-1">
                      Kurikulum
                    </label>
                    <select
                      value={soalKurikulum}
                      onChange={(e) => setSoalKurikulum(e.target.value as any)}
                      className="w-full px-3 py-2 bg-slate-50 border border-slate-300 rounded-xl text-xs focus:bg-white font-medium"
                    >
                      <option value="Kurikulum Merdeka">Kurikulum Merdeka</option>
                      <option value="Kurikulum 2013">Kurikulum 2013</option>
                    </select>
                  </div>

                  <div>
                    <label className="block text-xs font-semibold text-slate-700 mb-1">
                      Jenis Asesmen / Ujian
                    </label>
                    <select
                      value={soalJenis}
                      onChange={(e) => setSoalJenis(e.target.value as any)}
                      className="w-full px-3 py-2 bg-slate-50 border border-slate-300 rounded-xl text-xs focus:bg-white"
                    >
                      <option value="Ulangan Harian">Ulangan Harian</option>
                      <option value="Penilaian Tengah Semester (PTS/STS)">PTS / STS (Tengah Semester)</option>
                      <option value="Penilaian Akhir Semester (PAS/SAS)">PAS / SAS (Akhir Semester)</option>
                      <option value="Kuis / Latihan Harian">Kuis / Latihan Harian</option>
                    </select>
                  </div>
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">
                    Tingkat Kesulitan / Karakteristik Soal
                  </label>
                  <div className="grid grid-cols-3 gap-2">
                    {(['Mudah', 'Sedang', 'HOTS (Analisis Tinggi)'] as const).map((lvl) => (
                      <button
                        key={lvl}
                        type="button"
                        onClick={() => setSoalTingkat(lvl)}
                        className={`py-2 px-2 rounded-xl text-[11px] font-bold border transition-all cursor-pointer ${
                          soalTingkat === lvl
                            ? 'bg-blue-50 border-blue-600 text-blue-700 shadow-xs'
                            : 'bg-slate-50 border-slate-200 text-slate-600 hover:bg-slate-100'
                        }`}
                      >
                        {lvl.split(' ')[0]}
                      </button>
                    ))}
                  </div>
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">
                    Topik / Bab Materi yang Diujikan
                  </label>
                  <textarea
                    rows={2}
                    value={soalTopik}
                    onChange={(e) => setSoalTopik(e.target.value)}
                    placeholder="Contoh: Ekosistem, Rantai Makanan, dan Keseimbangan Alam"
                    className="w-full px-3 py-2 bg-slate-50 border border-slate-300 rounded-xl text-xs focus:bg-white leading-relaxed"
                    required
                  />
                  <div className="flex flex-wrap items-center gap-1.5 mt-1.5">
                    <span className="text-[10px] text-slate-400 font-medium">Contoh topik:</span>
                    {['Siklus Air & Cuaca', 'Pecahan & Desimal', 'Hak & Kewajiban Warga Negara', 'Gaya & Gerak Benda'].map((topic) => (
                      <button
                        key={topic}
                        type="button"
                        onClick={() => setSoalTopik(topic)}
                        className="px-2 py-0.5 rounded-lg bg-slate-100 hover:bg-blue-50 hover:text-blue-700 text-[10px] text-slate-600 transition-colors cursor-pointer"
                      >
                        {topic}
                      </button>
                    ))}
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-xs font-semibold text-slate-700 mb-1">
                      Jumlah Pilihan Ganda (PG)
                    </label>
                    <select
                      value={soalJumlahPg}
                      onChange={(e) => setSoalJumlahPg(Number(e.target.value))}
                      className="w-full px-3 py-2 bg-slate-50 border border-slate-300 rounded-xl text-xs focus:bg-white font-mono"
                    >
                      <option value={3}>3 Butir (Cepat)</option>
                      <option value={5}>5 Butir (Standar)</option>
                      <option value={10}>10 Butir</option>
                      <option value={15}>15 Butir</option>
                      <option value={20}>20 Butir</option>
                    </select>
                  </div>

                  <div>
                    <label className="block text-xs font-semibold text-slate-700 mb-1">
                      Jumlah Soal Esai / Uraian
                    </label>
                    <select
                      value={soalJumlahEsai}
                      onChange={(e) => setSoalJumlahEsai(Number(e.target.value))}
                      className="w-full px-3 py-2 bg-slate-50 border border-slate-300 rounded-xl text-xs focus:bg-white font-mono"
                    >
                      <option value={0}>0 (Hanya PG)</option>
                      <option value={2}>2 Butir</option>
                      <option value={3}>3 Butir</option>
                      <option value={5}>5 Butir</option>
                    </select>
                  </div>
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">
                    Catatan / Instruksi Khusus (Opsional)
                  </label>
                  <input
                    type="text"
                    value={soalCatatan}
                    onChange={(e) => setSoalCatatan(e.target.value)}
                    placeholder="Contoh: Sertakan teks cerita pendek sebelum soal 1-3"
                    className="w-full px-3 py-2 bg-slate-50 border border-slate-300 rounded-xl text-xs focus:bg-white"
                  />
                </div>

                <button
                  type="submit"
                  disabled={isGeneratingSoal}
                  className="w-full py-3 bg-gradient-to-r from-blue-700 to-indigo-700 hover:from-blue-800 hover:to-indigo-800 disabled:opacity-50 text-white rounded-xl text-xs font-bold shadow-md flex items-center justify-center gap-2 cursor-pointer transition-all"
                >
                  {isGeneratingSoal ? (
                    <>
                      <RefreshCw className="w-4 h-4 animate-spin" />
                      <span>Gemini AI Sedang Merancang Soal...</span>
                    </>
                  ) : (
                    <>
                      <Sparkles className="w-4 h-4 text-amber-300" />
                      <span>Buat Naskah Soal Sekarang</span>
                    </>
                  )}
                </button>
              </form>
            </div>
          </div>

          {/* Preview Hasil Soal */}
          <div className="lg:col-span-7 space-y-4">
            {hasilSoal ? (
              <div className="bg-white rounded-2xl p-6 border border-slate-200 shadow-xs space-y-6">
                {/* Control toolbar */}
                <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-200 pb-4">
                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      onClick={() => setShowKunciJawaban(!showKunciJawaban)}
                      className={`px-3 py-1.5 rounded-xl text-xs font-semibold flex items-center gap-1.5 transition-colors ${
                        showKunciJawaban
                          ? 'bg-amber-100 text-amber-900 border border-amber-300'
                          : 'bg-slate-100 text-slate-700'
                      }`}
                    >
                      {showKunciJawaban ? <Eye className="w-3.5 h-3.5 text-amber-700" /> : <EyeOff className="w-3.5 h-3.5" />}
                      <span>{showKunciJawaban ? 'Mode Guru (Ada Kunci & Pembahasan)' : 'Mode Siswa (Lembar Soal Saja)'}</span>
                    </button>
                  </div>

                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      onClick={() => copyToClipboard(generateSoalRawText(hasilSoal, showKunciJawaban))}
                      className="px-3 py-1.5 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-xl text-xs font-semibold flex items-center gap-1.5 transition-colors cursor-pointer"
                    >
                      {isCopied ? <Check className="w-3.5 h-3.5 text-emerald-600" /> : <Copy className="w-3.5 h-3.5" />}
                      <span>Salin Naskah</span>
                    </button>

                    <button
                      type="button"
                      onClick={handlePrint}
                      className="px-3.5 py-1.5 bg-blue-700 hover:bg-blue-800 text-white rounded-xl text-xs font-bold flex items-center gap-1.5 shadow-xs transition-colors cursor-pointer"
                    >
                      <Printer className="w-3.5 h-3.5" />
                      <span>Cetak / PDF</span>
                    </button>
                  </div>
                </div>

                {/* Printable Exam Paper */}
                <div id="naskah-soal-print" className="p-4 sm:p-6 bg-slate-50/50 rounded-2xl border border-slate-200/80 space-y-5 text-slate-800">
                  {/* Kop Sekolah */}
                  <div className="flex items-center gap-4 border-b-2 border-slate-800 pb-4 text-center sm:text-left">
                    <img
                      src={settings.logoUrl || '/logo.svg'}
                      alt="Logo"
                      className="w-16 h-16 object-contain flex-shrink-0"
                    />
                    <div className="flex-1">
                      <h4 className="text-sm sm:text-base font-bold text-slate-900 uppercase tracking-tight">
                        {settings.namaSekolah}
                      </h4>
                      <p className="text-[11px] text-slate-600">
                        {settings.alamat} {settings.desa ? `Desa ${settings.desa}` : ''} {settings.kecamatan ? `Kec. ${settings.kecamatan}` : ''} {settings.kabupaten ? `${settings.kabupaten}` : ''}
                      </p>
                      <p className="text-[10px] text-slate-500 mt-0.5">
                        NPSN: {settings.npsn} | Tahun Ajaran: {settings.tahunAjaranAktif || '2025/2026'} ({settings.semesterAktif || 'Ganjil'})
                      </p>
                    </div>
                  </div>

                  {/* Identitas Ujian & Lembar Isian Siswa */}
                  <div className="text-center py-1">
                    <h3 className="text-sm sm:text-base font-bold text-slate-900 uppercase tracking-wide">
                      {hasilSoal.judul}
                    </h3>
                    <p className="text-xs text-slate-600 mt-0.5">
                      {hasilSoal.kurikulum} | Tingkat Kesulitan: <span className="font-semibold text-blue-700">{hasilSoal.tingkatKesulitan}</span>
                    </p>
                  </div>

                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 bg-white p-3 rounded-xl border border-slate-200 text-xs">
                    <div>
                      <span className="text-slate-500 text-[10px] block">Mata Pelajaran</span>
                      <span className="font-bold text-slate-800">{hasilSoal.mataPelajaran}</span>
                    </div>
                    <div>
                      <span className="text-slate-500 text-[10px] block">Kelas / Semester</span>
                      <span className="font-bold text-slate-800">Kelas {hasilSoal.kelas} / {settings.semesterAktif}</span>
                    </div>
                    <div>
                      <span className="text-slate-500 text-[10px] block">Nama Peserta Didik</span>
                      <span className="font-semibold text-slate-400">....................................</span>
                    </div>
                    <div>
                      <span className="text-slate-500 text-[10px] block">Nomor Absen / Nilai</span>
                      <span className="font-semibold text-slate-400">.... / ..........</span>
                    </div>
                  </div>

                  {/* Petunjuk */}
                  <div className="bg-blue-50/70 p-3 rounded-xl border border-blue-200/60 text-xs text-blue-900 leading-relaxed">
                    <span className="font-bold">Petunjuk Pengerjaan: </span>
                    <span>{hasilSoal.petunjukUmum}</span>
                  </div>

                  {/* Bagian I: Pilihan Ganda */}
                  {hasilSoal.pilihanGanda && hasilSoal.pilihanGanda.length > 0 && (
                    <div className="space-y-4">
                      <div className="border-b border-slate-300 pb-1">
                        <h4 className="text-xs font-bold uppercase text-slate-900 tracking-wider">
                          I. Pilihlah salah satu jawaban yang paling tepat (A, B, C, atau D)!
                        </h4>
                      </div>

                      <div className="space-y-5">
                        {hasilSoal.pilihanGanda.map((pg, idx) => (
                          <div key={idx} className="bg-white p-4 rounded-xl border border-slate-200/70 shadow-2xs space-y-2">
                            <p className="text-xs font-semibold text-slate-900 leading-relaxed">
                              {pg.nomor || idx + 1}. {pg.pertanyaan}
                            </p>

                            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 pt-1 text-xs">
                              {(['A', 'B', 'C', 'D'] as const).map((opt) => {
                                const isCorrect = showKunciJawaban && pg.kunciJawaban === opt;
                                return (
                                  <div
                                    key={opt}
                                    className={`p-2 rounded-lg border text-xs flex items-start gap-2 ${
                                      isCorrect
                                        ? 'bg-emerald-50 border-emerald-400 text-emerald-950 font-bold'
                                        : 'bg-slate-50 border-slate-200 text-slate-700'
                                    }`}
                                  >
                                    <span className="font-bold flex-shrink-0">{opt}.</span>
                                    <span>{pg.pilihan[opt]}</span>
                                  </div>
                                );
                              })}
                            </div>

                            {/* Pembahasan Guru */}
                            {showKunciJawaban && pg.pembahasan && (
                              <div className="mt-2.5 p-2.5 bg-emerald-50/70 border border-emerald-200 rounded-lg text-[11px] text-emerald-900 leading-relaxed">
                                <span className="font-bold text-emerald-800">Kunci: {pg.kunciJawaban}</span> | <strong>Pembahasan:</strong> {pg.pembahasan}
                              </div>
                            )}
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                  {/* Bagian II: Esai */}
                  {hasilSoal.esai && hasilSoal.esai.length > 0 && (
                    <div className="space-y-4 pt-2">
                      <div className="border-b border-slate-300 pb-1">
                        <h4 className="text-xs font-bold uppercase text-slate-900 tracking-wider">
                          II. Jawablah pertanyaan-pertanyaan uraian di bawah ini dengan jelas dan lengkap!
                        </h4>
                      </div>

                      <div className="space-y-4">
                        {hasilSoal.esai.map((es, idx) => (
                          <div key={idx} className="bg-white p-4 rounded-xl border border-slate-200/70 shadow-2xs space-y-2">
                            <p className="text-xs font-semibold text-slate-900 leading-relaxed">
                              {es.nomor || idx + 1}. {es.pertanyaan}
                            </p>

                            {!showKunciJawaban && (
                              <div className="h-16 border-b border-dashed border-slate-300"></div>
                            )}

                            {showKunciJawaban && (
                              <div className="mt-2 p-3 bg-blue-50/70 border border-blue-200 rounded-lg text-xs space-y-1 text-slate-800">
                                <div className="font-bold text-blue-900">
                                  Kunci Jawaban Guru:
                                </div>
                                <div className="text-[11px] leading-relaxed text-slate-700">
                                  {es.kunciJawaban}
                                </div>
                                {es.pedomanPenskoran && (
                                  <div className="text-[10px] text-slate-500 italic pt-1 border-t border-blue-100">
                                    Rubrik Penskoran: {es.pedomanPenskoran}
                                  </div>
                                )}
                              </div>
                            )}
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              </div>
            ) : (
              <div className="bg-white rounded-2xl p-12 border border-slate-200 text-center shadow-xs">
                <div className="w-16 h-16 bg-blue-50 text-blue-700 rounded-2xl flex items-center justify-center mx-auto mb-4 border border-blue-100">
                  <Sparkles className="w-8 h-8 text-amber-500" />
                </div>
                <h4 className="text-base font-bold text-slate-900">Naskah Soal Belum Digenerate</h4>
                <p className="text-xs text-slate-500 max-w-md mx-auto mt-1 leading-relaxed">
                  Isi parameter mata pelajaran, kelas, kurikulum, dan topik materi di formulir sebelah kiri, lalu klik{' '}
                  <strong>"Buat Naskah Soal Sekarang"</strong> untuk menghasilkan instrumen evaluasi otomatis lengkap dengan kunci jawaban.
                </p>
              </div>
            )}
          </div>
        </div>
      )}

      {/* ========================================================================= */}
      {/* 2. PENYUSUN MODUL AJAR (RPP) */}
      {/* ========================================================================= */}
      {activeSubTab === 'buat-modul' && (
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
          <div className="lg:col-span-5 space-y-4">
            <div className="bg-white rounded-2xl p-6 border border-slate-200 shadow-xs">
              <div className="flex items-center gap-2 border-b border-slate-100 pb-3 mb-4">
                <BookOpen className="w-4 h-4 text-blue-700" />
                <h3 className="text-sm font-bold text-slate-900">Parameter Modul Ajar (RPP Plus)</h3>
              </div>

              <form onSubmit={handleGenerateModul} className="space-y-4">
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-xs font-semibold text-slate-700 mb-1">
                      Mata Pelajaran
                    </label>
                    <input
                      type="text"
                      list="mapel-options-modul"
                      value={modulMapel}
                      onChange={(e) => setModulMapel(e.target.value)}
                      className="w-full px-3 py-2 bg-slate-50 border border-slate-300 rounded-xl text-xs focus:bg-white"
                      placeholder="Pilih / ketik mapel"
                      required
                    />
                    <datalist id="mapel-options-modul">
                      {mapelList.map((m) => (
                        <option key={m.id} value={m.nama} />
                      ))}
                      <option value="IPAS (IPA & IPS)" />
                      <option value="Bahasa Indonesia" />
                      <option value="Matematika" />
                      <option value="Pendidikan Pancasila" />
                      <option value="Pendidikan Agama" />
                      <option value="Seni Rupa / Seni Musik" />
                    </datalist>
                  </div>

                  <div>
                    <label className="block text-xs font-semibold text-slate-700 mb-1">
                      Fase & Kelas
                    </label>
                    <select
                      value={modulFase}
                      onChange={(e) => setModulFase(e.target.value)}
                      className="w-full px-3 py-2 bg-slate-50 border border-slate-300 rounded-xl text-xs focus:bg-white"
                    >
                      <option value="Fase A (Kelas 1)">Fase A (Kelas 1)</option>
                      <option value="Fase A (Kelas 2)">Fase A (Kelas 2)</option>
                      <option value="Fase B (Kelas 3)">Fase B (Kelas 3)</option>
                      <option value="Fase B (Kelas 4)">Fase B (Kelas 4)</option>
                      <option value="Fase C (Kelas 5)">Fase C (Kelas 5)</option>
                      <option value="Fase C (Kelas 6)">Fase C (Kelas 6)</option>
                    </select>
                  </div>
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">
                    Alokasi Waktu
                  </label>
                  <input
                    type="text"
                    value={modulWaktu}
                    onChange={(e) => setModulWaktu(e.target.value)}
                    placeholder="Contoh: 2 x 35 Menit (1 Pertemuan)"
                    className="w-full px-3 py-2 bg-slate-50 border border-slate-300 rounded-xl text-xs focus:bg-white"
                  />
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">
                    Topik Pembelajaran
                  </label>
                  <textarea
                    rows={2}
                    value={modulTopik}
                    onChange={(e) => setModulTopik(e.target.value)}
                    placeholder="Contoh: Mengenal Bagian Tumbuhan dan Fungsinya Bagi Kehidupan Manusia"
                    className="w-full px-3 py-2 bg-slate-50 border border-slate-300 rounded-xl text-xs focus:bg-white leading-relaxed"
                    required
                  />
                  <div className="flex flex-wrap items-center gap-1.5 mt-1.5">
                    <span className="text-[10px] text-slate-400 font-medium">Contoh topik:</span>
                    {['Bagian Tubuh Tumbuhan', 'Operasi Hitung Pecahan', 'Kearifan Lokal Budaya', 'Wujud Zat & Perubahannya'].map((topic) => (
                      <button
                        key={topic}
                        type="button"
                        onClick={() => setModulTopik(topic)}
                        className="px-2 py-0.5 rounded-lg bg-slate-100 hover:bg-blue-50 hover:text-blue-700 text-[10px] text-slate-600 transition-colors cursor-pointer"
                      >
                        {topic}
                      </button>
                    ))}
                  </div>
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1.5">
                    Dimensi Profil Pelajar Pancasila
                  </label>
                  <div className="grid grid-cols-2 gap-2">
                    {[
                      'Bernalar Kritis',
                      'Gotong Royong',
                      'Mandiri',
                      'Kreatif',
                      'Beriman & Bertakwa',
                      'Berkebinekaan Global',
                    ].map((dim) => {
                      const isChecked = selectedProfil.includes(dim);
                      return (
                        <button
                          key={dim}
                          type="button"
                          onClick={() => toggleProfil(dim)}
                          className={`p-2 rounded-xl text-[11px] font-semibold border text-left flex items-center gap-2 cursor-pointer transition-colors ${
                            isChecked
                              ? 'bg-blue-50 border-blue-500 text-blue-800'
                              : 'bg-slate-50 border-slate-200 text-slate-600'
                          }`}
                        >
                          <div
                            className={`w-3.5 h-3.5 rounded-md flex items-center justify-center border ${
                              isChecked ? 'bg-blue-600 border-blue-600 text-white' : 'border-slate-300'
                            }`}
                          >
                            {isChecked && <Check className="w-2.5 h-2.5" />}
                          </div>
                          <span>{dim}</span>
                        </button>
                      );
                    })}
                  </div>
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">
                    Catatan Tambahan Guru (Opsional)
                  </label>
                  <input
                    type="text"
                    value={modulCatatan}
                    onChange={(e) => setModulCatatan(e.target.value)}
                    placeholder="Contoh: Pembelajaran dengan praktik mengamati tanaman di halaman sekolah"
                    className="w-full px-3 py-2 bg-slate-50 border border-slate-300 rounded-xl text-xs focus:bg-white"
                  />
                </div>

                <button
                  type="submit"
                  disabled={isGeneratingModul}
                  className="w-full py-3 bg-gradient-to-r from-blue-700 to-indigo-700 hover:from-blue-800 hover:to-indigo-800 disabled:opacity-50 text-white rounded-xl text-xs font-bold shadow-md flex items-center justify-center gap-2 cursor-pointer transition-all"
                >
                  {isGeneratingModul ? (
                    <>
                      <RefreshCw className="w-4 h-4 animate-spin" />
                      <span>Gemini AI Menyusun Modul Ajar...</span>
                    </>
                  ) : (
                    <>
                      <Sparkles className="w-4 h-4 text-amber-300" />
                      <span>Susun Modul Ajar Kurikulum Merdeka</span>
                    </>
                  )}
                </button>
              </form>
            </div>
          </div>

          <div className="lg:col-span-7 space-y-4">
            {hasilModul ? (
              <div className="bg-white rounded-2xl p-6 border border-slate-200 shadow-xs space-y-6">
                <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-200 pb-4">
                  <div>
                    <h3 className="text-sm font-bold text-slate-900">{hasilModul.judul}</h3>
                    <p className="text-xs text-slate-500">
                      Fase/Kelas: {hasilModul.faseKelas} | Alokasi: {hasilModul.alokasiWaktu}
                    </p>
                  </div>

                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      onClick={() =>
                        copyToClipboard(
                          `${hasilModul.judul}\n\nTujuan Pembelajaran:\n${hasilModul.tujuanPembelajaran.join('\n')}\n\nPemahaman Bermakna:\n${hasilModul.pemahamanBermakna}`
                        )
                      }
                      className="px-3 py-1.5 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-xl text-xs font-semibold flex items-center gap-1.5 transition-colors cursor-pointer"
                    >
                      {isCopied ? <Check className="w-3.5 h-3.5 text-emerald-600" /> : <Copy className="w-3.5 h-3.5" />}
                      <span>Salin</span>
                    </button>

                    <button
                      type="button"
                      onClick={handlePrint}
                      className="px-3.5 py-1.5 bg-blue-700 hover:bg-blue-800 text-white rounded-xl text-xs font-bold flex items-center gap-1.5 shadow-xs transition-colors cursor-pointer"
                    >
                      <Printer className="w-3.5 h-3.5" />
                      <span>Cetak / PDF</span>
                    </button>
                  </div>
                </div>

                {/* Modul View Container */}
                <div id="modul-ajar-print" className="space-y-6 text-xs text-slate-800 leading-relaxed">
                  {/* Profil Pancasila Badge */}
                  <div className="bg-slate-50 p-4 rounded-xl border border-slate-200 space-y-2">
                    <span className="font-bold text-slate-900 block">Profil Pelajar Pancasila yang Dituju:</span>
                    <div className="flex flex-wrap gap-1.5">
                      {hasilModul.targetProfilPelajar.map((p, i) => (
                        <span key={i} className="px-2.5 py-1 bg-blue-100 text-blue-800 rounded-lg text-[11px] font-semibold">
                          {p}
                        </span>
                      ))}
                    </div>
                  </div>

                  {/* Tujuan Pembelajaran */}
                  <div className="bg-white p-4 rounded-xl border border-slate-200 space-y-2">
                    <h4 className="font-bold text-slate-900 flex items-center gap-2 text-xs border-b pb-2">
                      <GraduationCap className="w-4 h-4 text-blue-700" />
                      <span>Tujuan Pembelajaran (Learning Objectives)</span>
                    </h4>
                    <ul className="list-disc list-inside space-y-1 text-slate-700 pl-1">
                      {hasilModul.tujuanPembelajaran.map((tp, idx) => (
                        <li key={idx}>{tp}</li>
                      ))}
                    </ul>
                  </div>

                  {/* Pemahaman Bermakna & Pertanyaan Pemantik */}
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <div className="bg-amber-50/70 p-4 rounded-xl border border-amber-200/80 space-y-1.5">
                      <span className="font-bold text-amber-900 flex items-center gap-1.5">
                        <Lightbulb className="w-4 h-4 text-amber-700" />
                        <span>Pemahaman Bermakna</span>
                      </span>
                      <p className="text-[11px] text-amber-950 leading-relaxed">
                        {hasilModul.pemahamanBermakna}
                      </p>
                    </div>

                    <div className="bg-indigo-50/70 p-4 rounded-xl border border-indigo-200/80 space-y-1.5">
                      <span className="font-bold text-indigo-900 flex items-center gap-1.5">
                        <HelpCircle className="w-4 h-4 text-indigo-700" />
                        <span>Pertanyaan Pemantik</span>
                      </span>
                      <ul className="list-disc list-inside text-[11px] text-indigo-950 space-y-1">
                        {hasilModul.pertanyaanPemantik.map((q, idx) => (
                          <li key={idx}>{q}</li>
                        ))}
                      </ul>
                    </div>
                  </div>

                  {/* Alur Kegiatan Pembelajaran */}
                  <div className="bg-white p-5 rounded-xl border border-slate-200 space-y-4">
                    <h4 className="font-bold text-slate-900 flex items-center gap-2 text-xs border-b pb-2">
                      <Clock className="w-4 h-4 text-blue-700" />
                      <span>Skenario / Kegiatan Pembelajaran</span>
                    </h4>

                    {/* Pendahuluan */}
                    <div className="space-y-1.5">
                      <div className="font-bold text-blue-900 flex items-center gap-1.5">
                        <span className="w-2 h-2 rounded-full bg-blue-600"></span>
                        <span>A. Kegiatan Pendahuluan (10-15 Menit)</span>
                      </div>
                      <ul className="list-disc list-inside pl-3 space-y-1 text-slate-700 text-[11px]">
                        {hasilModul.kegiatanPembelajaran.pendahuluan.map((k, i) => (
                          <li key={i}>{k}</li>
                        ))}
                      </ul>
                    </div>

                    {/* Inti */}
                    <div className="space-y-1.5">
                      <div className="font-bold text-indigo-900 flex items-center gap-1.5">
                        <span className="w-2 h-2 rounded-full bg-indigo-600"></span>
                        <span>B. Kegiatan Inti (Eksplorasi & Kolaborasi Aktif)</span>
                      </div>
                      <ul className="list-disc list-inside pl-3 space-y-1 text-slate-700 text-[11px]">
                        {hasilModul.kegiatanPembelajaran.inti.map((k, i) => (
                          <li key={i}>{k}</li>
                        ))}
                      </ul>
                    </div>

                    {/* Penutup */}
                    <div className="space-y-1.5">
                      <div className="font-bold text-emerald-900 flex items-center gap-1.5">
                        <span className="w-2 h-2 rounded-full bg-emerald-600"></span>
                        <span>C. Kegiatan Penutup & Refleksi (10 Menit)</span>
                      </div>
                      <ul className="list-disc list-inside pl-3 space-y-1 text-slate-700 text-[11px]">
                        {hasilModul.kegiatanPembelajaran.penutup.map((k, i) => (
                          <li key={i}>{k}</li>
                        ))}
                      </ul>
                    </div>
                  </div>

                  {/* Asesmen */}
                  <div className="bg-slate-50 p-4 rounded-xl border border-slate-200 space-y-3">
                    <h4 className="font-bold text-slate-900 text-xs">Bentuk Asesmen / Penilaian</h4>
                    <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 text-[11px]">
                      <div className="bg-white p-3 rounded-lg border border-slate-200">
                        <div className="font-bold text-blue-800 mb-1">Diagnostik</div>
                        <p className="text-slate-600">{hasilModul.asesmen.diagnostik}</p>
                      </div>
                      <div className="bg-white p-3 rounded-lg border border-slate-200">
                        <div className="font-bold text-indigo-800 mb-1">Formatif</div>
                        <p className="text-slate-600">{hasilModul.asesmen.formatif}</p>
                      </div>
                      <div className="bg-white p-3 rounded-lg border border-slate-200">
                        <div className="font-bold text-emerald-800 mb-1">Sumatif</div>
                        <p className="text-slate-600">{hasilModul.asesmen.sumatif}</p>
                      </div>
                    </div>
                  </div>

                  {/* LKPD Ringkas */}
                  {hasilModul.lembarKerjaRingkas && (
                    <div className="bg-amber-50/50 p-4 rounded-xl border border-amber-200 space-y-2">
                      <h4 className="font-bold text-amber-900 text-xs">
                        Lembar Kerja Peserta Didik (LKPD) Ringkas:
                      </h4>
                      <p className="text-[11px] text-amber-950 whitespace-pre-line leading-relaxed">
                        {hasilModul.lembarKerjaRingkas}
                      </p>
                    </div>
                  )}
                </div>
              </div>
            ) : (
              <div className="bg-white rounded-2xl p-12 border border-slate-200 text-center shadow-xs">
                <div className="w-16 h-16 bg-blue-50 text-blue-700 rounded-2xl flex items-center justify-center mx-auto mb-4 border border-blue-100">
                  <BookOpen className="w-8 h-8 text-blue-600" />
                </div>
                <h4 className="text-base font-bold text-slate-900">Modul Ajar Belum Disusun</h4>
                <p className="text-xs text-slate-500 max-w-md mx-auto mt-1 leading-relaxed">
                  Tentukan mata pelajaran, fase/kelas, topik, dan profil pelajar yang dituju di sebelah kiri, lalu klik{' '}
                  <strong>"Susun Modul Ajar"</strong> untuk menghasilkan rencana pembelajaran lengkap.
                </p>
              </div>
            )}
          </div>
        </div>
      )}

      {/* ========================================================================= */}
      {/* 3. BAHAN AJAR, RINGKASAN & LKPD */}
      {/* ========================================================================= */}
      {activeSubTab === 'buat-materi' && (
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
          <div className="lg:col-span-5 space-y-4">
            <div className="bg-white rounded-2xl p-6 border border-slate-200 shadow-xs">
              <div className="flex items-center gap-2 border-b border-slate-100 pb-3 mb-4">
                <Lightbulb className="w-4 h-4 text-blue-700" />
                <h3 className="text-sm font-bold text-slate-900">Parameter Bahan Ajar & LKPD</h3>
              </div>

              <form onSubmit={handleGenerateMateri} className="space-y-4">
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">
                    Jenis Bahan yang Ingin Dibuat
                  </label>
                  <div className="grid grid-cols-3 gap-2">
                    {[
                      { id: 'ringkasan', label: 'Ringkasan Materi' },
                      { id: 'lkpd', label: 'Lembar Kerja (LKPD)' },
                      { id: 'remedial', label: 'Remedial & Pengayaan' },
                    ].map((item) => (
                      <button
                        key={item.id}
                        type="button"
                        onClick={() => setMateriTipe(item.id as any)}
                        className={`py-2 px-2 rounded-xl text-[11px] font-bold border transition-all cursor-pointer text-center ${
                          materiTipe === item.id
                            ? 'bg-blue-50 border-blue-600 text-blue-700 shadow-xs'
                            : 'bg-slate-50 border-slate-200 text-slate-600 hover:bg-slate-100'
                        }`}
                      >
                        {item.label}
                      </button>
                    ))}
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-xs font-semibold text-slate-700 mb-1">
                      Mata Pelajaran
                    </label>
                    <input
                      type="text"
                      value={materiMapel}
                      onChange={(e) => setMateriMapel(e.target.value)}
                      className="w-full px-3 py-2 bg-slate-50 border border-slate-300 rounded-xl text-xs focus:bg-white"
                      required
                    />
                  </div>

                  <div>
                    <label className="block text-xs font-semibold text-slate-700 mb-1">
                      Tingkat Kelas
                    </label>
                    <input
                      type="text"
                      value={materiKelas}
                      onChange={(e) => setMateriKelas(e.target.value)}
                      className="w-full px-3 py-2 bg-slate-50 border border-slate-300 rounded-xl text-xs focus:bg-white"
                      placeholder="Contoh: 4 atau 5"
                      required
                    />
                  </div>
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">
                    Topik Pembelajaran
                  </label>
                  <textarea
                    rows={2}
                    value={materiTopik}
                    onChange={(e) => setMateriTopik(e.target.value)}
                    placeholder="Contoh: Menghitung Keliling dan Luas Persegi & Persegi Panjang"
                    className="w-full px-3 py-2 bg-slate-50 border border-slate-300 rounded-xl text-xs focus:bg-white leading-relaxed"
                    required
                  />
                  <div className="flex flex-wrap items-center gap-1.5 mt-1.5">
                    <span className="text-[10px] text-slate-400 font-medium">Contoh topik:</span>
                    {['Pecahan Campuran & Penjumlahan', 'Rantai Makanan Ekosistem', 'Panca Indra Manusia', 'Nilai-Nilai Sila Pancasila'].map((topic) => (
                      <button
                        key={topic}
                        type="button"
                        onClick={() => setMateriTopik(topic)}
                        className="px-2 py-0.5 rounded-lg bg-slate-100 hover:bg-blue-50 hover:text-blue-700 text-[10px] text-slate-600 transition-colors cursor-pointer"
                      >
                        {topic}
                      </button>
                    ))}
                  </div>
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">
                    Catatan Guru (Opsional)
                  </label>
                  <input
                    type="text"
                    value={materiCatatan}
                    onChange={(e) => setMateriCatatan(e.target.value)}
                    placeholder="Contoh: Sertakan contoh gambar konseptual dan soal latihan aplikatif"
                    className="w-full px-3 py-2 bg-slate-50 border border-slate-300 rounded-xl text-xs focus:bg-white"
                  />
                </div>

                <button
                  type="submit"
                  disabled={isGeneratingMateri}
                  className="w-full py-3 bg-gradient-to-r from-blue-700 to-indigo-700 hover:from-blue-800 hover:to-indigo-800 disabled:opacity-50 text-white rounded-xl text-xs font-bold shadow-md flex items-center justify-center gap-2 cursor-pointer transition-all"
                >
                  {isGeneratingMateri ? (
                    <>
                      <RefreshCw className="w-4 h-4 animate-spin" />
                      <span>Gemini AI Sedang Menulis Bahan Ajar...</span>
                    </>
                  ) : (
                    <>
                      <Sparkles className="w-4 h-4 text-amber-300" />
                      <span>Buat Materi Pembelajaran</span>
                    </>
                  )}
                </button>
              </form>
            </div>
          </div>

          <div className="lg:col-span-7 space-y-4">
            {hasilMateri ? (
              <div className="bg-white rounded-2xl p-6 border border-slate-200 shadow-xs space-y-4">
                <div className="flex items-center justify-between border-b border-slate-200 pb-3">
                  <div>
                    <h3 className="text-sm font-bold text-slate-900">{hasilMateri.judul}</h3>
                    <p className="text-xs text-slate-500">
                      Topik: {hasilMateri.topikMateri} | Dibuat: {new Date(hasilMateri.createdAt).toLocaleDateString('id-ID')}
                    </p>
                  </div>

                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      onClick={() => copyToClipboard(hasilMateri.isiMarkdown)}
                      className="px-3 py-1.5 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-xl text-xs font-semibold flex items-center gap-1.5 transition-colors cursor-pointer"
                    >
                      {isCopied ? <Check className="w-3.5 h-3.5 text-emerald-600" /> : <Copy className="w-3.5 h-3.5" />}
                      <span>Salin Markdown</span>
                    </button>

                    <button
                      type="button"
                      onClick={handlePrint}
                      className="px-3.5 py-1.5 bg-blue-700 hover:bg-blue-800 text-white rounded-xl text-xs font-bold flex items-center gap-1.5 shadow-xs transition-colors cursor-pointer"
                    >
                      <Printer className="w-3.5 h-3.5" />
                      <span>Cetak</span>
                    </button>
                  </div>
                </div>

                <div className="p-6 bg-slate-50/60 rounded-2xl border border-slate-200 leading-relaxed text-xs text-slate-800 prose prose-slate max-w-none">
                  <Markdown>{hasilMateri.isiMarkdown}</Markdown>
                </div>
              </div>
            ) : (
              <div className="bg-white rounded-2xl p-12 border border-slate-200 text-center shadow-xs">
                <div className="w-16 h-16 bg-blue-50 text-blue-700 rounded-2xl flex items-center justify-center mx-auto mb-4 border border-blue-100">
                  <FileText className="w-8 h-8 text-blue-600" />
                </div>
                <h4 className="text-base font-bold text-slate-900">Bahan Belajar Belum Dibuat</h4>
                <p className="text-xs text-slate-500 max-w-md mx-auto mt-1 leading-relaxed">
                  Pilih tipe ringkasan materi, LKPD latihan, atau panduan remedial, lalu klik{' '}
                  <strong>"Buat Materi Pembelajaran"</strong>.
                </p>
              </div>
            )}
          </div>
        </div>
      )}

      {/* ========================================================================= */}
      {/* 4. BANK SOAL & MODUL TERSIMPAN */}
      {/* ========================================================================= */}
      {activeSubTab === 'bank-tersimpan' && (
        <div className="bg-white rounded-2xl p-6 border border-slate-200 shadow-xs space-y-6">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-slate-100 pb-4">
            <div>
              <h3 className="text-base font-bold text-slate-900">Bank Dokumen Pembelajaran AI</h3>
              <p className="text-xs text-slate-500 mt-0.5">
                Koleksi naskah soal ulangan, modul ajar, dan LKPD yang telah dibuat dan disimpan di sistem sekolah.
              </p>
            </div>

            <div className="flex flex-wrap items-center gap-2">
              <div className="relative">
                <Search className="w-4 h-4 absolute left-3 top-2.5 text-slate-400" />
                <input
                  type="text"
                  value={bankSearch}
                  onChange={(e) => setBankSearch(e.target.value)}
                  placeholder="Cari naskah / mapel..."
                  className="pl-9 pr-3 py-1.5 bg-slate-50 border border-slate-300 rounded-xl text-xs focus:bg-white"
                />
              </div>

              <select
                value={bankFilter}
                onChange={(e) => setBankFilter(e.target.value as any)}
                className="px-3 py-1.5 bg-slate-50 border border-slate-300 rounded-xl text-xs"
              >
                <option value="semua">Semua Dokumen</option>
                <option value="soal">Naskah Soal ({savedSoalList.length})</option>
                <option value="modul">Modul Ajar ({savedModulList.length})</option>
                <option value="materi">Bahan / LKPD ({savedMateriList.length})</option>
              </select>
            </div>
          </div>

          {/* List Soal */}
          {(bankFilter === 'semua' || bankFilter === 'soal') && (
            <div className="space-y-3">
              <h4 className="text-xs font-bold uppercase text-slate-500 tracking-wider flex items-center gap-2">
                <FileCheck className="w-4 h-4 text-blue-600" />
                <span>Naskah Soal Ulangan ({savedSoalList.length})</span>
              </h4>

              {savedSoalList.length === 0 ? (
                <div className="p-6 bg-slate-50 rounded-xl text-center text-xs text-slate-400">
                  Belum ada naskah soal yang tersimpan. Buat soal baru di tab "Pembuat Soal Ulangan".
                </div>
              ) : (
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  {savedSoalList
                    .filter(
                      (s) =>
                        !bankSearch ||
                        s.judul.toLowerCase().includes(bankSearch.toLowerCase()) ||
                        s.mataPelajaran.toLowerCase().includes(bankSearch.toLowerCase())
                    )
                    .map((soal) => (
                      <div
                        key={soal.id}
                        className="p-4 rounded-xl border border-slate-200 hover:border-blue-400 transition-all bg-slate-50/50 hover:bg-white flex flex-col justify-between space-y-3"
                      >
                        <div>
                          <div className="flex items-start justify-between gap-2">
                            <span className="px-2 py-0.5 bg-blue-100 text-blue-800 rounded-md text-[10px] font-bold">
                              {soal.jenisUjian}
                            </span>
                            <span className="text-[10px] text-slate-400">
                              {new Date(soal.createdAt).toLocaleDateString('id-ID')}
                            </span>
                          </div>
                          <h5 className="font-bold text-xs text-slate-900 mt-2">{soal.judul}</h5>
                          <p className="text-[11px] text-slate-500 mt-0.5">
                            {soal.mataPelajaran} | Kelas {soal.kelas} | {soal.pilihanGanda.length} PG, {soal.esai.length} Esai
                          </p>
                        </div>

                        <div className="flex items-center justify-between pt-2 border-t border-slate-200/70">
                          <button
                            type="button"
                            onClick={() => {
                              setHasilSoal(soal);
                              setActiveSubTab('buat-soal');
                            }}
                            className="text-xs font-bold text-blue-700 hover:text-blue-900 flex items-center gap-1 cursor-pointer"
                          >
                            <Eye className="w-3.5 h-3.5" />
                            <span>Buka & Cetak</span>
                          </button>

                          <button
                            type="button"
                            onClick={() => {
                              if (confirm(`Hapus naskah soal "${soal.judul}"?`)) {
                                db.deleteNaskahSoal(soal.id);
                                showNotification('success', 'Naskah soal dihapus.');
                              }
                            }}
                            className="text-slate-400 hover:text-rose-600 p-1 rounded-lg transition-colors cursor-pointer"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      </div>
                    ))}
                </div>
              )}
            </div>
          )}

          {/* List Modul */}
          {(bankFilter === 'semua' || bankFilter === 'modul') && (
            <div className="space-y-3 pt-4">
              <h4 className="text-xs font-bold uppercase text-slate-500 tracking-wider flex items-center gap-2">
                <BookOpen className="w-4 h-4 text-indigo-600" />
                <span>Modul Ajar Kurikulum Merdeka ({savedModulList.length})</span>
              </h4>

              {savedModulList.length === 0 ? (
                <div className="p-6 bg-slate-50 rounded-xl text-center text-xs text-slate-400">
                  Belum ada modul ajar yang tersimpan. Buat modul baru di tab "Penyusun Modul Ajar".
                </div>
              ) : (
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  {savedModulList
                    .filter(
                      (m) =>
                        !bankSearch ||
                        m.judul.toLowerCase().includes(bankSearch.toLowerCase()) ||
                        m.mataPelajaran.toLowerCase().includes(bankSearch.toLowerCase())
                    )
                    .map((modul) => (
                      <div
                        key={modul.id}
                        className="p-4 rounded-xl border border-slate-200 hover:border-indigo-400 transition-all bg-slate-50/50 hover:bg-white flex flex-col justify-between space-y-3"
                      >
                        <div>
                          <div className="flex items-start justify-between gap-2">
                            <span className="px-2 py-0.5 bg-indigo-100 text-indigo-800 rounded-md text-[10px] font-bold">
                              {modul.faseKelas}
                            </span>
                            <span className="text-[10px] text-slate-400">
                              {new Date(modul.createdAt).toLocaleDateString('id-ID')}
                            </span>
                          </div>
                          <h5 className="font-bold text-xs text-slate-900 mt-2">{modul.judul}</h5>
                          <p className="text-[11px] text-slate-500 mt-0.5">
                            {modul.mataPelajaran} | Waktu: {modul.alokasiWaktu}
                          </p>
                        </div>

                        <div className="flex items-center justify-between pt-2 border-t border-slate-200/70">
                          <button
                            type="button"
                            onClick={() => {
                              setHasilModul(modul);
                              setActiveSubTab('buat-modul');
                            }}
                            className="text-xs font-bold text-indigo-700 hover:text-indigo-900 flex items-center gap-1 cursor-pointer"
                          >
                            <Eye className="w-3.5 h-3.5" />
                            <span>Buka & Cetak Modul</span>
                          </button>

                          <button
                            type="button"
                            onClick={() => {
                              if (confirm(`Hapus modul ajar "${modul.judul}"?`)) {
                                db.deleteModulAjar(modul.id);
                                showNotification('success', 'Modul ajar dihapus.');
                              }
                            }}
                            className="text-slate-400 hover:text-rose-600 p-1 rounded-lg transition-colors cursor-pointer"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      </div>
                    ))}
                </div>
              )}
            </div>
          )}

          {/* List Materi / LKPD */}
          {(bankFilter === 'semua' || bankFilter === 'materi') && (
            <div className="space-y-3 pt-4">
              <h4 className="text-xs font-bold uppercase text-slate-500 tracking-wider flex items-center gap-2">
                <Lightbulb className="w-4 h-4 text-amber-600" />
                <span>Bahan Ajar & LKPD ({savedMateriList.length})</span>
              </h4>

              {savedMateriList.length === 0 ? (
                <div className="p-6 bg-slate-50 rounded-xl text-center text-xs text-slate-400">
                  Belum ada bahan ajar / LKPD yang tersimpan.
                </div>
              ) : (
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  {savedMateriList
                    .filter(
                      (mat) =>
                        !bankSearch ||
                        mat.judul.toLowerCase().includes(bankSearch.toLowerCase()) ||
                        mat.topikMateri.toLowerCase().includes(bankSearch.toLowerCase())
                    )
                    .map((materi) => (
                      <div
                        key={materi.id}
                        className="p-4 rounded-xl border border-slate-200 hover:border-amber-400 transition-all bg-slate-50/50 hover:bg-white flex flex-col justify-between space-y-3"
                      >
                        <div>
                          <div className="flex items-start justify-between gap-2">
                            <span className="px-2 py-0.5 bg-amber-100 text-amber-900 rounded-md text-[10px] font-bold uppercase">
                              {materi.tipe}
                            </span>
                            <span className="text-[10px] text-slate-400">
                              {new Date(materi.createdAt).toLocaleDateString('id-ID')}
                            </span>
                          </div>
                          <h5 className="font-bold text-xs text-slate-900 mt-2">{materi.judul}</h5>
                          <p className="text-[11px] text-slate-500 mt-0.5 line-clamp-1">
                            {materi.topikMateri}
                          </p>
                        </div>

                        <div className="flex items-center justify-between pt-2 border-t border-slate-200/70">
                          <button
                            type="button"
                            onClick={() => {
                              setHasilMateri(materi);
                              setActiveSubTab('buat-materi');
                            }}
                            className="text-xs font-bold text-amber-800 hover:text-amber-950 flex items-center gap-1 cursor-pointer"
                          >
                            <Eye className="w-3.5 h-3.5" />
                            <span>Lihat Bahan</span>
                          </button>

                          <button
                            type="button"
                            onClick={() => {
                              if (confirm(`Hapus bahan ajar "${materi.judul}"?`)) {
                                db.deleteBahanAjar(materi.id);
                                showNotification('success', 'Bahan ajar dihapus.');
                              }
                            }}
                            className="text-slate-400 hover:text-rose-600 p-1 rounded-lg transition-colors cursor-pointer"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      </div>
                    ))}
                </div>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
};
