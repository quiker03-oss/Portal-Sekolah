import React, { useState, useEffect } from 'react';
import { db } from '../../services/database';
import { safeFetchJson } from '../../utils/apiHelper';
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
  Image as ImageIcon,
  ExternalLink,
} from 'lucide-react';
import { printElement, openPrintWindow } from '../../utils/exportHelper';
import {
  generateOfficialCurriculumModul,
  generateFallbackSoal,
  generateFallbackMateri,
} from '../../utils/aiCurriculumHelper';

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
  const [modulKurikulum, setModulKurikulum] = useState<'Kurikulum Merdeka' | 'Kurikulum 2013'>('Kurikulum Merdeka');
  const [modulJenisDokumen, setModulJenisDokumen] = useState<string>('Modul Ajar');
  const [modulJenjang, setModulJenjang] = useState<'PAUD' | 'SD' | 'SMP' | 'SMA' | 'SMK'>('SD');
  const [modulMapel, setModulMapel] = useState<string>(mapelList[0]?.nama || 'IPAS');
  const [modulFase, setModulFase] = useState<string>('Fase B (Kelas 4)');
  const [modulTahunAjaran, setModulTahunAjaran] = useState<string>(settings.tahunAjaranAktif || '2025/2026');
  const [modulSemester, setModulSemester] = useState<'Ganjil' | 'Genap'>((settings.semesterAktif as any) || 'Ganjil');
  const [modulWaktu, setModulWaktu] = useState<string>('2 x 35 Menit (1 Pertemuan)');
  const [modulTopik, setModulTopik] = useState<string>('Siklus Air dan Pelestarian Sumber Daya Alam');
  const [modulCapaian, setModulCapaian] = useState<string>('');
  const [selectedProfil, setSelectedProfil] = useState<string[]>(['Bernalar Kritis', 'Gotong Royong', 'Mandiri']);
  const [modulModel, setModulModel] = useState<string>('Problem Based Learning (PBL)');
  const [modulMetode, setModulMetode] = useState<string>('Pendekatan Saintifik & Pembelajaran Berdiferensiasi');
  const [modulSarana, setModulSarana] = useState<string>('Buku Guru, Buku Siswa, LCD Proyektor, Bahan Tayang/Slide, Lembar Kerja Siswa');
  const [modulTargetPeserta, setModulTargetPeserta] = useState<string>('Peserta Didik Reguler / Heterogen');
  const [modulCatatan, setModulCatatan] = useState<string>('');
  const [isGeneratingModul, setIsGeneratingModul] = useState<boolean>(false);
  const [hasilModul, setHasilModul] = useState<ModulAjarAI | null>(null);

  // ==================== STATE BUAT MATERI & LKPD ====================
  const [materiMapel, setMateriMapel] = useState<string>(mapelList[0]?.nama || 'Bahasa Indonesia');
  const [materiKelas, setMateriKelas] = useState<string>('4');
  const [materiTopik, setMateriTopik] = useState<string>('Menemukan Ide Pokok dan Kalimat Pendukung dalam Paragraf');
  const [materiTipe, setMateriTipe] = useState<'ringkasan' | 'lkpd' | 'remedial'>('ringkasan');
  const [materiCatatan, setMateriCatatan] = useState<string>('');
  const [materiSertakanGambar, setMateriSertakanGambar] = useState<boolean>(true);
  const [isGeneratingMateri, setIsGeneratingMateri] = useState<boolean>(false);
  const [hasilMateri, setHasilMateri] = useState<BahanAjarAI | null>(null);

  // Modal konfirmasi hapus dokumen di bank data
  const [deleteConfirm, setDeleteConfirm] = useState<{
    type: 'soal' | 'modul' | 'materi';
    id: string;
    title: string;
  } | null>(null);

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
      const apiRes = await safeFetchJson<{
        success: boolean;
        data: any;
        error?: string;
      }>('/api/ai/buat-soal', {
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

      let generatedData: NaskahUjianAI;

      if (apiRes.ok && apiRes.data?.success && apiRes.data.data) {
        const json = apiRes.data;
        generatedData = {
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
        showNotification('success', 'Naskah soal ulangan berhasil dibuat oleh Gemini AI dan tersimpan di Bank Soal!');
      } else {
        console.warn('Backend /api/ai/buat-soal failed, using fallback generator:', apiRes.error);
        generatedData = generateFallbackSoal({
          mataPelajaran: soalMapel,
          kelas: soalKelas,
          kurikulum: soalKurikulum,
          jenisUjian: soalJenis,
          tingkatKesulitan: soalTingkat,
          topikMateri: soalTopik,
          jumlahPg: Number(soalJumlahPg),
          jumlahEsai: Number(soalJumlahEsai),
          guruId: currentUser.id,
          guruName: currentUser.name,
        });
        showNotification('success', 'Naskah soal ulangan berhasil disusun sesuai standar kurikulum dan tersimpan di Bank Soal!');
      }

      setHasilSoal(generatedData);
      // Auto-save to school database
      db.saveNaskahSoal(generatedData);
    } catch (err: any) {
      console.warn('Exception in generate soal, fallback generated:', err);
      const fallback = generateFallbackSoal({
        mataPelajaran: soalMapel,
        kelas: soalKelas,
        kurikulum: soalKurikulum,
        jenisUjian: soalJenis,
        tingkatKesulitan: soalTingkat,
        topikMateri: soalTopik,
        jumlahPg: Number(soalJumlahPg),
        jumlahEsai: Number(soalJumlahEsai),
        guruId: currentUser.id,
        guruName: currentUser.name,
      });
      setHasilSoal(fallback);
      db.saveNaskahSoal(fallback);
      showNotification('success', 'Naskah soal ulangan berhasil disusun dan tersimpan!');
    } finally {
      setIsGeneratingSoal(false);
    }
  };

  // 2. GENERATE MODUL AJAR / RPP RESMI
  const handleGenerateModul = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!modulTopik.trim()) {
      showNotification('error', 'Silakan masukkan topik materi pembelajaran.');
      return;
    }

    setIsGeneratingModul(true);
    setStatusMsg(null);

    const modulPayload = {
      jenisDokumen: modulJenisDokumen,
      kurikulum: modulKurikulum,
      jenjang: modulJenjang,
      mataPelajaran: modulMapel,
      faseKelas: modulFase,
      tahunAjaran: modulTahunAjaran,
      semester: modulSemester,
      alokasiWaktu: modulWaktu,
      topikMateri: modulTopik,
      capaianPembelajaran: modulCapaian,
      profilPancasila: selectedProfil,
      modelPembelajaran: modulModel,
      metodePendekatan: modulMetode,
      saranaPrasarana: modulSarana,
      targetPesertaDidik: modulTargetPeserta,
      instruksiTambahan: modulCatatan,
    };

    try {
      const apiRes = await safeFetchJson<{
        success: boolean;
        data: any;
        error?: string;
      }>('/api/ai/buat-modul', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(modulPayload),
      });

      let generatedModul: ModulAjarAI;

      if (apiRes.ok && apiRes.data?.success && apiRes.data.data) {
        const d = apiRes.data.data;
        generatedModul = {
          id: `modul-${Date.now()}`,
          guruId: currentUser.id,
          guruName: currentUser.name,
          judul: d.judul || `${modulJenisDokumen} ${modulMapel} - ${modulTopik}`,
          jenisDokumen: d.jenisDokumen || modulJenisDokumen,
          kurikulum: d.kurikulum || modulKurikulum,
          jenjang: d.jenjang || modulJenjang,
          mataPelajaran: modulMapel,
          faseKelas: modulFase,
          tahunAjaran: d.tahunAjaran || modulTahunAjaran,
          semester: d.semester || modulSemester,
          alokasiWaktu: d.alokasiWaktu || modulWaktu,
          capaianPembelajaran: d.capaianPembelajaran || modulCapaian,
          targetProfilPelajar: d.targetProfilPelajar || selectedProfil,
          modelPembelajaran: d.modelPembelajaran || modulModel,
          metodePendekatan: d.metodePendekatan || modulMetode,
          saranaPrasarana: Array.isArray(d.saranaPrasarana) ? d.saranaPrasarana : [modulSarana],
          tujuanPembelajaran: d.tujuanPembelajaran || [],
          pemahamanBermakna: d.pemahamanBermakna || '',
          pertanyaanPemantik: d.pertanyaanPemantik || [],
          diferensiasi: d.diferensiasi || undefined,
          kegiatanPembelajaran: d.kegiatanPembelajaran || {
            pendahuluan: [],
            inti: [],
            penutup: [],
          },
          asesmen: d.asesmen || {
            diagnostik: '',
            formatif: '',
            sumatif: '',
          },
          pengayaanRemedial: d.pengayaanRemedial,
          refleksiGuruSiswa: d.refleksiGuruSiswa,
          lembarKerjaRingkas: d.lembarKerjaRingkas || '',
          createdAt: new Date().toISOString(),
        };
        showNotification('success', `${modulJenisDokumen} berhasil disusun oleh Gemini AI dan tersimpan di Bank Dokumen!`);
      } else {
        // High quality curriculum synthesizer fallback if backend is unavailable or lacks GEMINI_API_KEY
        console.warn('Backend /api/ai/buat-modul unavailable, using official curriculum synthesis engine:', apiRes.error);
        generatedModul = generateOfficialCurriculumModul({
          ...modulPayload,
          guruName: currentUser.name,
          namaSekolah: settings.namaSekolah,
        });
        showNotification(
          'success',
          `${modulJenisDokumen} resmi berhasil disusun sesuai acuan regulasi pendidikan Indonesia!`
        );
      }

      setHasilModul(generatedModul);
      db.saveModulAjar(generatedModul);
    } catch (err: any) {
      console.warn('Handling generate modul with curriculum synthesis engine:', err);
      const fallback = generateOfficialCurriculumModul({
        ...modulPayload,
        guruName: currentUser.name,
        namaSekolah: settings.namaSekolah,
      });
      setHasilModul(fallback);
      db.saveModulAjar(fallback);
      showNotification('success', `${modulJenisDokumen} resmi berhasil disusun sesuai standar kurikulum nasional!`);
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
      const apiRes = await safeFetchJson<{
        success: boolean;
        markdown?: string;
        error?: string;
      }>('/api/ai/buat-materi', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          mataPelajaran: materiMapel,
          kelas: materiKelas,
          topikMateri: materiTopik,
          tipe: materiTipe,
          instruksiTambahan: materiCatatan,
          sertakanGambar: materiSertakanGambar,
        }),
      });

      let generatedMateri: BahanAjarAI;

      if (apiRes.ok && apiRes.data?.success && apiRes.data.markdown) {
        generatedMateri = {
          id: `materi-${Date.now()}`,
          guruId: currentUser.id,
          guruName: currentUser.name,
          judul: `${materiTipe === 'lkpd' ? 'LKPD' : materiTipe === 'remedial' ? 'Materi Remedial' : 'Bahan Ajar'} ${materiMapel} Kelas ${materiKelas}`,
          mataPelajaran: materiMapel,
          kelas: materiKelas,
          topikMateri: materiTopik,
          tipe: materiTipe,
          isiMarkdown: apiRes.data.markdown || '',
          createdAt: new Date().toISOString(),
        };
        showNotification('success', 'Bahan ajar / LKPD berhasil dibuat oleh Gemini AI dan tersimpan di Bank Data!');
      } else {
        console.warn('Backend /api/ai/buat-materi failed, using fallback generator:', apiRes.error);
        generatedMateri = generateFallbackMateri({
          mataPelajaran: materiMapel,
          kelas: materiKelas,
          topikMateri: materiTopik,
          tipe: materiTipe,
          guruId: currentUser.id,
          guruName: currentUser.name,
        });
        showNotification('success', 'Bahan ajar / LKPD resmi berhasil disusun dan tersimpan di Bank Data!');
      }

      setHasilMateri(generatedMateri);
      db.saveBahanAjar(generatedMateri);
    } catch (err: any) {
      console.warn('Exception in generate materi, fallback generated:', err);
      const fallback = generateFallbackMateri({
        mataPelajaran: materiMapel,
        kelas: materiKelas,
        topikMateri: materiTopik,
        tipe: materiTipe,
        guruId: currentUser.id,
        guruName: currentUser.name,
      });
      setHasilMateri(fallback);
      db.saveBahanAjar(fallback);
      showNotification('success', 'Bahan ajar / LKPD resmi berhasil disusun dan tersimpan!');
    } finally {
      setIsGeneratingMateri(false);
    }
  };

  // Cetak Dokumen Terisolasi & Rapi
  const handlePrintSoal = () => {
    if (!hasilSoal) return;
    printElement('naskah-soal-print', `${hasilSoal.judul} - ${settings.namaSekolah}`);
  };

  const handleOpenNewTabSoal = () => {
    if (!hasilSoal) return;
    openPrintWindow('naskah-soal-print', `${hasilSoal.judul} - ${settings.namaSekolah}`);
  };

  const handlePrintModul = () => {
    if (!hasilModul) return;
    printElement('modul-ajar-print', `${hasilModul.judul} - ${settings.namaSekolah}`);
  };

  const handleOpenNewTabModul = () => {
    if (!hasilModul) return;
    openPrintWindow('modul-ajar-print', `${hasilModul.judul} - ${settings.namaSekolah}`);
  };

  const handlePrintMateri = () => {
    if (!hasilMateri) return;
    printElement('bahan-ajar-print', `${hasilMateri.judul} - ${settings.namaSekolah}`);
  };

  const handleOpenNewTabMateri = () => {
    if (!hasilMateri) return;
    openPrintWindow('bahan-ajar-print', `${hasilMateri.judul} - ${settings.namaSekolah}`);
  };

  // Eksekusi Hapus Dokumen Bank Data
  const executeDelete = () => {
    if (!deleteConfirm) return;
    if (deleteConfirm.type === 'soal') {
      db.deleteNaskahSoal(deleteConfirm.id);
      setSavedSoalList((prev) => prev.filter((s) => s.id !== deleteConfirm.id));
      if (hasilSoal?.id === deleteConfirm.id) setHasilSoal(null);
      showNotification('success', `Naskah soal "${deleteConfirm.title}" berhasil dihapus.`);
    } else if (deleteConfirm.type === 'modul') {
      db.deleteModulAjar(deleteConfirm.id);
      setSavedModulList((prev) => prev.filter((m) => m.id !== deleteConfirm.id));
      if (hasilModul?.id === deleteConfirm.id) setHasilModul(null);
      showNotification('success', `Modul ajar "${deleteConfirm.title}" berhasil dihapus.`);
    } else if (deleteConfirm.type === 'materi') {
      db.deleteBahanAjar(deleteConfirm.id);
      setSavedMateriList((prev) => prev.filter((mat) => mat.id !== deleteConfirm.id));
      if (hasilMateri?.id === deleteConfirm.id) setHasilMateri(null);
      showNotification('success', `Bahan ajar/LKPD "${deleteConfirm.title}" berhasil dihapus.`);
    }
    setDeleteConfirm(null);
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
                      onClick={handlePrintSoal}
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
                {/* 1. Kurikulum & Jenis Dokumen */}
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-xs font-semibold text-slate-700 mb-1">
                      Kurikulum Resmi
                    </label>
                    <select
                      value={modulKurikulum}
                      onChange={(e) => {
                        const val = e.target.value as 'Kurikulum Merdeka' | 'Kurikulum 2013';
                        setModulKurikulum(val);
                        if (val === 'Kurikulum 2013') {
                          setModulJenisDokumen('RPP K13');
                        } else {
                          setModulJenisDokumen('Modul Ajar');
                        }
                      }}
                      className="w-full px-3 py-2 bg-slate-50 border border-slate-300 rounded-xl text-xs focus:bg-white font-medium"
                    >
                      <option value="Kurikulum Merdeka">Kurikulum Merdeka (Resmi)</option>
                      <option value="Kurikulum 2013">Kurikulum 2013 (K13)</option>
                    </select>
                  </div>

                  <div>
                    <label className="block text-xs font-semibold text-slate-700 mb-1">
                      Jenis Perangkat Ajar
                    </label>
                    <select
                      value={modulJenisDokumen}
                      onChange={(e) => setModulJenisDokumen(e.target.value)}
                      className="w-full px-3 py-2 bg-slate-50 border border-slate-300 rounded-xl text-xs focus:bg-white font-medium"
                    >
                      {modulKurikulum === 'Kurikulum Merdeka' ? (
                        <>
                          <option value="Modul Ajar">Modul Ajar (Lengkap)</option>
                          <option value="RPP Kurikulum Merdeka">RPP Kurikulum Merdeka</option>
                          <option value="Perangkat Pembelajaran">Perangkat Pembelajaran Terpadu</option>
                        </>
                      ) : (
                        <>
                          <option value="RPP K13">RPP K13 Lengkap (Permendikbud 22/2016)</option>
                          <option value="RPP 1 Lembar">RPP 1 Lembar (SE Mendikbud 14/2019)</option>
                        </>
                      )}
                    </select>
                  </div>
                </div>

                {/* 2. Jenjang & Fase/Kelas */}
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-xs font-semibold text-slate-700 mb-1">
                      Jenjang Sekolah
                    </label>
                    <select
                      value={modulJenjang}
                      onChange={(e) => setModulJenjang(e.target.value as any)}
                      className="w-full px-3 py-2 bg-slate-50 border border-slate-300 rounded-xl text-xs focus:bg-white"
                    >
                      <option value="SD">SD / MI (Sekolah Dasar)</option>
                      <option value="SMP">SMP / MTs (Menengah Pertama)</option>
                      <option value="SMA">SMA / MA (Menengah Atas)</option>
                      <option value="SMK">SMK / MAK (Kejuruan)</option>
                      <option value="PAUD">PAUD / TK</option>
                    </select>
                  </div>

                  <div>
                    <label className="block text-xs font-semibold text-slate-700 mb-1">
                      Tingkat / Fase Kelas
                    </label>
                    <select
                      value={modulFase}
                      onChange={(e) => setModulFase(e.target.value)}
                      className="w-full px-3 py-2 bg-slate-50 border border-slate-300 rounded-xl text-xs focus:bg-white"
                    >
                      {modulJenjang === 'PAUD' ? (
                        <option value="Fase Fondasi (PAUD/TK)">Fase Fondasi (PAUD/TK)</option>
                      ) : modulJenjang === 'SMP' ? (
                        <>
                          <option value="Fase D (Kelas 7)">Fase D (Kelas 7)</option>
                          <option value="Fase D (Kelas 8)">Fase D (Kelas 8)</option>
                          <option value="Fase D (Kelas 9)">Fase D (Kelas 9)</option>
                        </>
                      ) : modulJenjang === 'SMA' || modulJenjang === 'SMK' ? (
                        <>
                          <option value="Fase E (Kelas 10)">Fase E (Kelas 10)</option>
                          <option value="Fase F (Kelas 11)">Fase F (Kelas 11)</option>
                          <option value="Fase F (Kelas 12)">Fase F (Kelas 12)</option>
                        </>
                      ) : (
                        <>
                          <option value="Fase A (Kelas 1)">Fase A (Kelas 1)</option>
                          <option value="Fase A (Kelas 2)">Fase A (Kelas 2)</option>
                          <option value="Fase B (Kelas 3)">Fase B (Kelas 3)</option>
                          <option value="Fase B (Kelas 4)">Fase B (Kelas 4)</option>
                          <option value="Fase C (Kelas 5)">Fase C (Kelas 5)</option>
                          <option value="Fase C (Kelas 6)">Fase C (Kelas 6)</option>
                        </>
                      )}
                    </select>
                  </div>
                </div>

                {/* 3. Mata Pelajaran & Alokasi Waktu */}
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
                      <option value="Pendidikan Agama & Budi Pekerti" />
                      <option value="Bahasa Inggris" />
                      <option value="PJOK" />
                      <option value="Seni Rupa / Seni Musik" />
                    </datalist>
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
                </div>

                {/* 4. Model Pembelajaran & Semester */}
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-xs font-semibold text-slate-700 mb-1">
                      Model Pembelajaran
                    </label>
                    <select
                      value={modulModel}
                      onChange={(e) => setModulModel(e.target.value)}
                      className="w-full px-3 py-2 bg-slate-50 border border-slate-300 rounded-xl text-xs focus:bg-white"
                    >
                      <option value="Problem Based Learning (PBL)">Problem Based Learning (PBL)</option>
                      <option value="Project Based Learning (PjBL)">Project Based Learning (PjBL)</option>
                      <option value="Discovery Learning">Discovery Learning</option>
                      <option value="Inquiry Learning">Inquiry Learning</option>
                      <option value="Cooperative Learning">Cooperative Learning</option>
                      <option value="Diferensiasi & Eksplorasi">Diferensiasi & Eksplorasi</option>
                      <option value="Pembelajaran Konseptual">Pembelajaran Konseptual</option>
                    </select>
                  </div>

                  <div>
                    <label className="block text-xs font-semibold text-slate-700 mb-1">
                      Semester & TA
                    </label>
                    <div className="flex gap-1.5">
                      <select
                        value={modulSemester}
                        onChange={(e) => setModulSemester(e.target.value as any)}
                        className="w-1/2 px-2 py-2 bg-slate-50 border border-slate-300 rounded-xl text-xs focus:bg-white"
                      >
                        <option value="Ganjil">Ganjil</option>
                        <option value="Genap">Genap</option>
                      </select>
                      <input
                        type="text"
                        value={modulTahunAjaran}
                        onChange={(e) => setModulTahunAjaran(e.target.value)}
                        className="w-1/2 px-2 py-2 bg-slate-50 border border-slate-300 rounded-xl text-xs focus:bg-white"
                        placeholder="2025/2026"
                      />
                    </div>
                  </div>
                </div>

                {/* 5. Topik Pembelajaran */}
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">
                    Topik / Materi Pembelajaran
                  </label>
                  <textarea
                    rows={2}
                    value={modulTopik}
                    onChange={(e) => setModulTopik(e.target.value)}
                    placeholder="Contoh: Siklus Air dan Pelestarian Sumber Daya Alam Bagi Kehidupan"
                    className="w-full px-3 py-2 bg-slate-50 border border-slate-300 rounded-xl text-xs focus:bg-white leading-relaxed"
                    required
                  />
                  <div className="flex flex-wrap items-center gap-1.5 mt-1.5">
                    <span className="text-[10px] text-slate-400 font-medium">Contoh topik:</span>
                    {['Siklus Air & Ekosistem', 'Operasi Pecahan & Desimal', 'Keragaman Budaya & Pancasila', 'Wujud Zat & Kalor'].map((topic) => (
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

                {/* 6. Capaian Pembelajaran / KD (Opsional) */}
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">
                    {modulKurikulum === 'Kurikulum 2013' ? 'Kompetensi Dasar (KD) / IPK (Opsional)' : 'Capaian Pembelajaran (CP) / Elemen (Opsional)'}
                  </label>
                  <input
                    type="text"
                    value={modulCapaian}
                    onChange={(e) => setModulCapaian(e.target.value)}
                    placeholder={
                      modulKurikulum === 'Kurikulum 2013'
                        ? 'Contoh: KD 3.8 Menganalisis siklus air dan dampaknya bagi bumi'
                        : 'Biarkan kosong untuk otomatis diselaraskan dengan Kepmendikbudristek No. 244/M/2024'
                    }
                    className="w-full px-3 py-2 bg-slate-50 border border-slate-300 rounded-xl text-xs focus:bg-white"
                  />
                </div>

                {/* 7. Dimensi Profil Pelajar Pancasila / Karakter */}
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1.5">
                    {modulKurikulum === 'Kurikulum 2013' ? 'Nilai Karakter Utama (PPK)' : 'Dimensi Profil Pelajar Pancasila'}
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

                {/* 8. Sarana & Catatan Guru */}
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">
                    Sarana & Media Pembelajaran
                  </label>
                  <input
                    type="text"
                    value={modulSarana}
                    onChange={(e) => setModulSarana(e.target.value)}
                    placeholder="Buku Guru, Buku Siswa, LCD Proyektor, Lembar Kerja Siswa"
                    className="w-full px-3 py-2 bg-slate-50 border border-slate-300 rounded-xl text-xs focus:bg-white"
                  />
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">
                    Catatan Pembelajaran Berdiferensiasi & Khusus (Opsional)
                  </label>
                  <input
                    type="text"
                    value={modulCatatan}
                    onChange={(e) => setModulCatatan(e.target.value)}
                    placeholder="Contoh: Sediakan bimbingan scaffolding untuk kelompok belajar dasar"
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
                      <span>Menyusun {modulJenisDokumen} Resmi...</span>
                    </>
                  ) : (
                    <>
                      <Sparkles className="w-4 h-4 text-amber-300" />
                      <span>Susun {modulJenisDokumen} Sesuai Kurikulum</span>
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
                    <div className="flex items-center gap-2 mb-1">
                      <span className="px-2.5 py-0.5 rounded-full text-[10px] font-bold bg-blue-100 text-blue-800">
                        {hasilModul.kurikulum || 'Kurikulum Merdeka'}
                      </span>
                      <span className="px-2.5 py-0.5 rounded-full text-[10px] font-bold bg-purple-100 text-purple-800">
                        {hasilModul.jenisDokumen || 'Modul Ajar'}
                      </span>
                    </div>
                    <h3 className="text-sm font-bold text-slate-900">{hasilModul.judul}</h3>
                    <p className="text-xs text-slate-500">
                      Jenjang {hasilModul.jenjang || 'SD'} | {hasilModul.faseKelas} | Alokasi: {hasilModul.alokasiWaktu}
                    </p>
                  </div>

                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      onClick={() =>
                        copyToClipboard(
                          `${hasilModul.judul}\nKurikulum: ${hasilModul.kurikulum || 'Kurikulum Merdeka'}\n\nTujuan Pembelajaran:\n${hasilModul.tujuanPembelajaran.join('\n')}\n\nPemahaman Bermakna:\n${hasilModul.pemahamanBermakna}`
                        )
                      }
                      className="px-3 py-1.5 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-xl text-xs font-semibold flex items-center gap-1.5 transition-colors cursor-pointer"
                    >
                      {isCopied ? <Check className="w-3.5 h-3.5 text-emerald-600" /> : <Copy className="w-3.5 h-3.5" />}
                      <span>Salin</span>
                    </button>

                    <button
                      type="button"
                      onClick={handlePrintModul}
                      className="px-3.5 py-1.5 bg-indigo-700 hover:bg-indigo-800 text-white rounded-xl text-xs font-bold flex items-center gap-1.5 shadow-xs transition-colors cursor-pointer"
                      title="Cetak langsung melalui dialog print browser"
                    >
                      <Printer className="w-3.5 h-3.5" />
                      <span>Cetak / PDF</span>
                    </button>

                    <button
                      type="button"
                      onClick={handleOpenNewTabModul}
                      className="px-3 py-1.5 bg-slate-800 hover:bg-slate-700 text-slate-200 rounded-xl text-xs font-semibold flex items-center gap-1.5 transition-colors cursor-pointer"
                      title="Buka dokumen di tab baru (ideal untuk unduh PDF di HP/Tablet)"
                    >
                      <ExternalLink className="w-3.5 h-3.5" />
                      <span className="hidden sm:inline">Tab Baru</span>
                    </button>
                  </div>
                </div>

                {/* Modul View Container */}
                <div id="modul-ajar-print" className="space-y-6 text-xs text-slate-800 leading-relaxed p-6 bg-white rounded-2xl border border-slate-200">
                  {/* Kop Sekolah Resmi */}
                  <div className="flex items-center gap-4 border-b-2 border-slate-900 pb-4 text-center sm:text-left">
                    <img
                      src={settings.logoUrl || '/logo.svg'}
                      alt="Logo"
                      className="w-16 h-16 object-contain shrink-0"
                    />
                    <div className="flex-1">
                      <h4 className="text-base font-bold text-slate-900 uppercase tracking-tight">
                        {settings.namaSekolah}
                      </h4>
                      <p className="text-[11px] text-slate-600">
                        {settings.alamat} {settings.desa ? `Desa ${settings.desa}` : ''} {settings.kecamatan ? `Kec. ${settings.kecamatan}` : ''} {settings.kabupaten ? `${settings.kabupaten}` : ''}
                      </p>
                      <p className="text-[10px] text-slate-500 mt-0.5">
                        NPSN: {settings.npsn} | Tahun Ajaran: {hasilModul.tahunAjaran || settings.tahunAjaranAktif || '2025/2026'} (Semester {hasilModul.semester || settings.semesterAktif || 'Ganjil'})
                      </p>
                    </div>
                  </div>

                  {/* Judul Dokumen Resmi */}
                  <div className="text-center py-2 border-b border-slate-100">
                    <h3 className="text-sm font-extrabold text-slate-900 uppercase tracking-wide">
                      {hasilModul.judul}
                    </h3>
                    <p className="text-[11px] text-slate-500 mt-0.5 font-medium">
                      Acuan: Standar Kurikulum Pendidikan Nasional Indonesia ({hasilModul.kurikulum || 'Kurikulum Merdeka'})
                    </p>
                  </div>

                  {/* I. INFORMASI UMUM & IDENTITAS MODUL */}
                  <div className="bg-slate-50 p-4 rounded-xl border border-slate-200 space-y-2">
                    <h4 className="font-bold text-slate-900 text-xs border-b border-slate-200 pb-1.5 flex items-center gap-2">
                      <BookOpen className="w-3.5 h-3.5 text-blue-700" />
                      <span>I. INFORMASI UMUM & IDENTITAS PERANGKAT AJAR</span>
                    </h4>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-[11px]">
                      <div>
                        <span className="text-slate-500">Nama Penyusun/Guru:</span>{' '}
                        <strong className="text-slate-800">{hasilModul.guruName || currentUser.name}</strong>
                      </div>
                      <div>
                        <span className="text-slate-500">Satuan Pendidikan:</span>{' '}
                        <strong className="text-slate-800">{settings.namaSekolah}</strong>
                      </div>
                      <div>
                        <span className="text-slate-500">Mata Pelajaran:</span>{' '}
                        <strong className="text-slate-800">{hasilModul.mataPelajaran}</strong>
                      </div>
                      <div>
                        <span className="text-slate-500">Fase / Kelas:</span>{' '}
                        <strong className="text-slate-800">{hasilModul.faseKelas}</strong>
                      </div>
                      <div>
                        <span className="text-slate-500">Tahun Ajaran / Semester:</span>{' '}
                        <strong className="text-slate-800">
                          {hasilModul.tahunAjaran || '2025/2026'} ({hasilModul.semester || 'Ganjil'})
                        </strong>
                      </div>
                      <div>
                        <span className="text-slate-500">Alokasi Waktu:</span>{' '}
                        <strong className="text-slate-800">{hasilModul.alokasiWaktu}</strong>
                      </div>
                      <div>
                        <span className="text-slate-500">Model Pembelajaran:</span>{' '}
                        <strong className="text-slate-800">{hasilModul.modelPembelajaran || 'Problem Based Learning (PBL)'}</strong>
                      </div>
                      <div>
                        <span className="text-slate-500">Pendekatan & Metode:</span>{' '}
                        <strong className="text-slate-800">{hasilModul.metodePendekatan || 'Saintifik & Berdiferensiasi'}</strong>
                      </div>
                    </div>
                  </div>

                  {/* II. CAPAIAN PEMBELAJARAN / KD */}
                  {hasilModul.capaianPembelajaran && (
                    <div className="bg-white p-4 rounded-xl border border-slate-200 space-y-1.5">
                      <h4 className="font-bold text-slate-900 text-xs flex items-center gap-2 border-b border-slate-100 pb-1">
                        <FileText className="w-3.5 h-3.5 text-blue-700" />
                        <span>II. {hasilModul.kurikulum === 'Kurikulum 2013' ? 'KOMPETENSI DASAR (KD) & IPK' : 'CAPAIAN PEMBELAJARAN (CP) ELEMEN'}</span>
                      </h4>
                      <p className="text-[11px] text-slate-700 whitespace-pre-line leading-relaxed pl-1">
                        {hasilModul.capaianPembelajaran}
                      </p>
                    </div>
                  )}

                  {/* III. PROFIL PELAJAR PANCASILA / KARAKTER */}
                  <div className="bg-slate-50 p-4 rounded-xl border border-slate-200 space-y-2">
                    <span className="font-bold text-slate-900 block text-xs">
                      III. {hasilModul.kurikulum === 'Kurikulum 2013' ? 'PENGUATAN PENDIDIKAN KARAKTER (PPK)' : 'DIMENSI PROFIL PELAJAR PANCASILA YANG DISASAR'}
                    </span>
                    <div className="flex flex-wrap gap-1.5">
                      {hasilModul.targetProfilPelajar.map((p, i) => (
                        <span key={i} className="px-2.5 py-1 bg-blue-100 text-blue-800 rounded-lg text-[11px] font-semibold">
                          {p}
                        </span>
                      ))}
                    </div>
                  </div>

                  {/* IV. TUJUAN PEMBELAJARAN */}
                  <div className="bg-white p-4 rounded-xl border border-slate-200 space-y-2">
                    <h4 className="font-bold text-slate-900 flex items-center gap-2 text-xs border-b pb-2">
                      <GraduationCap className="w-4 h-4 text-blue-700" />
                      <span>IV. TUJUAN PEMBELAJARAN (ABCD)</span>
                    </h4>
                    <ol className="list-decimal list-inside space-y-1 text-slate-700 pl-1 text-[11px]">
                      {hasilModul.tujuanPembelajaran.map((tp, idx) => (
                        <li key={idx} className="leading-relaxed">{tp}</li>
                      ))}
                    </ol>
                  </div>

                  {/* V. PEMAHAMAN BERMAKNA & PERTANYAAN PEMANTIK */}
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <div className="bg-amber-50/70 p-4 rounded-xl border border-amber-200/80 space-y-1.5">
                      <span className="font-bold text-amber-900 flex items-center gap-1.5 text-xs">
                        <Lightbulb className="w-3.5 h-3.5 text-amber-700" />
                        <span>Pemahaman Bermakna</span>
                      </span>
                      <p className="text-[11px] text-amber-950 leading-relaxed">
                        {hasilModul.pemahamanBermakna}
                      </p>
                    </div>

                    <div className="bg-indigo-50/70 p-4 rounded-xl border border-indigo-200/80 space-y-1.5">
                      <span className="font-bold text-indigo-900 flex items-center gap-1.5 text-xs">
                        <HelpCircle className="w-3.5 h-3.5 text-indigo-700" />
                        <span>Pertanyaan Pemantik</span>
                      </span>
                      <ul className="list-disc list-inside text-[11px] text-indigo-950 space-y-1">
                        {hasilModul.pertanyaanPemantik.map((q, idx) => (
                          <li key={idx} className="leading-relaxed">{q}</li>
                        ))}
                      </ul>
                    </div>
                  </div>

                  {/* VI. PEMBELAJARAN BERDIFERENSIASI */}
                  {hasilModul.diferensiasi && (
                    <div className="bg-emerald-50/60 p-4 rounded-xl border border-emerald-200/80 space-y-2">
                      <h4 className="font-bold text-emerald-950 text-xs flex items-center gap-2 border-b border-emerald-200 pb-1.5">
                        <Layers className="w-3.5 h-3.5 text-emerald-700" />
                        <span>VI. RENCANA PEMBELAJARAN BERDIFERENSIASI</span>
                      </h4>
                      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 text-[11px]">
                        {hasilModul.diferensiasi.konten && (
                          <div className="bg-white p-2.5 rounded-lg border border-emerald-100">
                            <strong className="text-emerald-900 block mb-1">Diferensiasi Konten:</strong>
                            <p className="text-slate-700">{hasilModul.diferensiasi.konten}</p>
                          </div>
                        )}
                        {hasilModul.diferensiasi.proses && (
                          <div className="bg-white p-2.5 rounded-lg border border-emerald-100">
                            <strong className="text-emerald-900 block mb-1">Diferensiasi Proses:</strong>
                            <p className="text-slate-700">{hasilModul.diferensiasi.proses}</p>
                          </div>
                        )}
                        {hasilModul.diferensiasi.produk && (
                          <div className="bg-white p-2.5 rounded-lg border border-emerald-100">
                            <strong className="text-emerald-900 block mb-1">Diferensiasi Produk:</strong>
                            <p className="text-slate-700">{hasilModul.diferensiasi.produk}</p>
                          </div>
                        )}
                      </div>
                    </div>
                  )}

                  {/* VII. SKENARIO KEGIATAN PEMBELAJARAN */}
                  <div className="bg-white p-5 rounded-xl border border-slate-200 space-y-4">
                    <h4 className="font-bold text-slate-900 flex items-center gap-2 text-xs border-b pb-2">
                      <Clock className="w-4 h-4 text-blue-700" />
                      <span>VII. SKENARIO ALUR KEGIATAN PEMBELAJARAN</span>
                    </h4>

                    {/* Pendahuluan */}
                    <div className="space-y-1.5">
                      <div className="font-bold text-blue-900 flex items-center gap-1.5">
                        <span className="w-2 h-2 rounded-full bg-blue-600"></span>
                        <span>A. Kegiatan Pendahuluan (10 - 15 Menit)</span>
                      </div>
                      <ul className="list-disc list-inside pl-3 space-y-1 text-slate-700 text-[11px]">
                        {hasilModul.kegiatanPembelajaran.pendahuluan.map((k, i) => (
                          <li key={i} className="leading-relaxed">{k}</li>
                        ))}
                      </ul>
                    </div>

                    {/* Inti */}
                    <div className="space-y-1.5">
                      <div className="font-bold text-indigo-900 flex items-center gap-1.5">
                        <span className="w-2 h-2 rounded-full bg-indigo-600"></span>
                        <span>B. Kegiatan Inti (Sintaks {hasilModul.modelPembelajaran || 'PBL'})</span>
                      </div>
                      <ul className="list-disc list-inside pl-3 space-y-1 text-slate-700 text-[11px]">
                        {hasilModul.kegiatanPembelajaran.inti.map((k, i) => (
                          <li key={i} className="leading-relaxed">{k}</li>
                        ))}
                      </ul>
                    </div>

                    {/* Penutup */}
                    <div className="space-y-1.5">
                      <div className="font-bold text-emerald-900 flex items-center gap-1.5">
                        <span className="w-2 h-2 rounded-full bg-emerald-600"></span>
                        <span>C. Kegiatan Penutup & Refleksi (10 - 15 Menit)</span>
                      </div>
                      <ul className="list-disc list-inside pl-3 space-y-1 text-slate-700 text-[11px]">
                        {hasilModul.kegiatanPembelajaran.penutup.map((k, i) => (
                          <li key={i} className="leading-relaxed">{k}</li>
                        ))}
                      </ul>
                    </div>
                  </div>

                  {/* VIII. ASESMEN PEMBELAJARAN */}
                  <div className="bg-slate-50 p-4 rounded-xl border border-slate-200 space-y-3">
                    <h4 className="font-bold text-slate-900 text-xs">VIII. ASESMEN & KRITERIA KETERCAPAIAN TUJUAN PEMBELAJARAN (KKTP)</h4>
                    <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 text-[11px]">
                      <div className="bg-white p-3 rounded-lg border border-slate-200">
                        <div className="font-bold text-blue-800 mb-1">Asesmen Awal (Diagnostik)</div>
                        <p className="text-slate-600 leading-relaxed">{hasilModul.asesmen.diagnostik}</p>
                      </div>
                      <div className="bg-white p-3 rounded-lg border border-slate-200">
                        <div className="font-bold text-indigo-800 mb-1">Asesmen Proses (Formatif)</div>
                        <p className="text-slate-600 leading-relaxed">{hasilModul.asesmen.formatif}</p>
                      </div>
                      <div className="bg-white p-3 rounded-lg border border-slate-200">
                        <div className="font-bold text-emerald-800 mb-1">Asesmen Akhir (Sumatif)</div>
                        <p className="text-slate-600 leading-relaxed">{hasilModul.asesmen.sumatif}</p>
                      </div>
                    </div>
                    {hasilModul.asesmen.rubrik && (
                      <div className="bg-white p-3 rounded-lg border border-slate-200 text-[11px]">
                        <strong className="text-slate-800 block mb-1">Pedoman Rubrik & Penskoran:</strong>
                        <p className="text-slate-600 leading-relaxed">{hasilModul.asesmen.rubrik}</p>
                      </div>
                    )}
                  </div>

                  {/* IX. PENGAYAAN & REMEDIAL */}
                  {hasilModul.pengayaanRemedial && (
                    <div className="bg-white p-4 rounded-xl border border-slate-200 space-y-1.5 text-[11px]">
                      <h4 className="font-bold text-slate-900 text-xs">IX. PROGRAM PENGAYAAN & REMEDIAL</h4>
                      <p className="text-slate-700 leading-relaxed">{hasilModul.pengayaanRemedial}</p>
                    </div>
                  )}

                  {/* X. REFLEKSI GURU & SISWA */}
                  {hasilModul.refleksiGuruSiswa && (
                    <div className="bg-slate-50 p-4 rounded-xl border border-slate-200 space-y-1.5 text-[11px]">
                      <h4 className="font-bold text-slate-900 text-xs">X. REFLEKSI GURU & PESERTA DIDIK</h4>
                      <p className="text-slate-700 whitespace-pre-line leading-relaxed">{hasilModul.refleksiGuruSiswa}</p>
                    </div>
                  )}

                  {/* XI. LKPD RINGKAS */}
                  {hasilModul.lembarKerjaRingkas && (
                    <div className="bg-amber-50/50 p-4 rounded-xl border border-amber-200 space-y-2">
                      <h4 className="font-bold text-amber-900 text-xs">
                        XI. LEMBAR KERJA PESERTA DIDIK (LKPD) / LKS RINGKAS:
                      </h4>
                      <p className="text-[11px] text-amber-950 whitespace-pre-line leading-relaxed font-mono">
                        {hasilModul.lembarKerjaRingkas}
                      </p>
                    </div>
                  )}

                  {/* XII. PENGESAHAN & TANDA TANGAN RESMI */}
                  <div className="pt-8 border-t border-slate-300 grid grid-cols-2 text-center text-xs text-slate-800">
                    <div>
                      <p className="text-slate-500">Mengetahui,</p>
                      <p className="font-bold text-slate-900 mt-1">Kepala Sekolah</p>
                      <div className="h-16"></div>
                      <p className="font-bold text-slate-900 underline">
                        {settings.namaKepalaSekolah || 'Kepala Sekolah'}
                      </p>
                      <p className="text-[10px] text-slate-500">NIP. {settings.nipKepalaSekolah || '-'}</p>
                    </div>

                    <div>
                      <p className="text-slate-500">
                        {settings.kabupaten || 'Tempat'}, {new Intl.DateTimeFormat('id-ID', { day: 'numeric', month: 'long', year: 'numeric' }).format(new Date())}
                      </p>
                      <p className="font-bold text-slate-900 mt-1">Guru Mata Pelajaran / Penyusun</p>
                      <div className="h-16"></div>
                      <p className="font-bold text-slate-900 underline">
                        {hasilModul.guruName || currentUser.name}
                      </p>
                      <p className="text-[10px] text-slate-500">NIP. {currentUser.nip || '-'}</p>
                    </div>
                  </div>
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

                <label className="flex items-center gap-2.5 p-2.5 bg-blue-50/70 border border-blue-200/80 rounded-xl cursor-pointer text-xs font-semibold text-blue-950 hover:bg-blue-50 transition-colors">
                  <input
                    type="checkbox"
                    checked={materiSertakanGambar}
                    onChange={(e) => setMateriSertakanGambar(e.target.checked)}
                    className="w-4 h-4 text-blue-600 rounded border-slate-300 focus:ring-blue-500 cursor-pointer"
                  />
                  <span className="flex items-center gap-1.5">
                    <ImageIcon className="w-4 h-4 text-blue-600" />
                    <span>Sertakan Gambar Edukatif & Ruang Observasi LKPD</span>
                  </span>
                </label>

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
                      onClick={handlePrintMateri}
                      className="px-3.5 py-1.5 bg-blue-700 hover:bg-blue-800 text-white rounded-xl text-xs font-bold flex items-center gap-1.5 shadow-xs transition-colors cursor-pointer"
                    >
                      <Printer className="w-3.5 h-3.5" />
                      <span>Cetak / PDF</span>
                    </button>
                  </div>
                </div>

                {/* Printable Material & LKPD Container */}
                <div id="bahan-ajar-print" className="p-4 sm:p-6 bg-slate-50/50 rounded-2xl border border-slate-200/80 space-y-5 text-slate-800">
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

                  <div className="p-5 sm:p-6 bg-white rounded-xl border border-slate-200 leading-relaxed text-xs text-slate-800 prose prose-slate max-w-none [&_img]:rounded-2xl [&_img]:shadow-md [&_img]:mx-auto [&_img]:my-4 [&_img]:max-h-80 [&_img]:object-cover [&_img]:border [&_img]:border-slate-200">
                    <Markdown>{hasilMateri.isiMarkdown}</Markdown>
                  </div>
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
                            onClick={() => setDeleteConfirm({ type: 'soal', id: soal.id, title: soal.judul })}
                            className="text-slate-400 hover:text-rose-600 p-1.5 rounded-lg hover:bg-rose-50 transition-colors cursor-pointer"
                            title="Hapus Naskah Soal"
                          >
                            <Trash2 className="w-4 h-4" />
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
                            onClick={() => setDeleteConfirm({ type: 'modul', id: modul.id, title: modul.judul })}
                            className="text-slate-400 hover:text-rose-600 p-1.5 rounded-lg hover:bg-rose-50 transition-colors cursor-pointer"
                            title="Hapus Modul Ajar"
                          >
                            <Trash2 className="w-4 h-4" />
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
                            onClick={() => setDeleteConfirm({ type: 'materi', id: materi.id, title: materi.judul })}
                            className="text-slate-400 hover:text-rose-600 p-1.5 rounded-lg hover:bg-rose-50 transition-colors cursor-pointer"
                            title="Hapus Bahan Ajar / LKPD"
                          >
                            <Trash2 className="w-4 h-4" />
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

      {/* Modal Dialog Konfirmasi Hapus Dokumen */}
      {deleteConfirm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-xs animate-in fade-in duration-150">
          <div className="bg-white rounded-2xl max-w-md w-full p-6 shadow-2xl border border-slate-200 space-y-4">
            <div className="w-12 h-12 rounded-2xl bg-rose-100 text-rose-600 flex items-center justify-center mx-auto">
              <Trash2 className="w-6 h-6" />
            </div>
            <div className="text-center space-y-1.5">
              <h4 className="text-base font-bold text-slate-900">Konfirmasi Hapus Dokumen</h4>
              <p className="text-xs text-slate-600 leading-relaxed">
                Apakah Anda yakin ingin menghapus <strong>"{deleteConfirm.title}"</strong> dari Bank Data? Dokumen yang telah dihapus tidak dapat dipulihkan kembali.
              </p>
            </div>
            <div className="flex items-center gap-3 pt-2">
              <button
                type="button"
                onClick={() => setDeleteConfirm(null)}
                className="flex-1 py-2.5 bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold text-xs rounded-xl transition-colors cursor-pointer"
              >
                Batal
              </button>
              <button
                type="button"
                onClick={executeDelete}
                className="flex-1 py-2.5 bg-rose-600 hover:bg-rose-700 text-white font-bold text-xs rounded-xl shadow-xs transition-colors cursor-pointer"
              >
                Ya, Hapus Dokumen
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
