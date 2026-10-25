import React, { useState, useEffect, useRef } from 'react';
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
  LkpdData,
  LkpdHalaman,
  LkpdAktivitasItem,
  UjianOnline,
} from '../../types';
import Markdown from 'react-markdown';
import {
  Sparkles,
  BookOpen,
  FileText,
  Gamepad2,
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
  Upload,
  Download,
  Plus,
  Edit3,
  X,
  FileDown,
  Compass,
  ArrowRight,
  Maximize2,
} from 'lucide-react';
import { printElement, openPrintWindow } from '../../utils/exportHelper';
import {
  findSmartVisualForQuestion,
  CURATED_ILLUSTRATIONS,
  findIllustrationByKey,
} from '../../utils/educationalVisuals';
import { renderLkpdPageToPng } from '../../utils/lkpdCanvasRenderer';
import {
  exportSoalToDocx,
  exportSoalToPdf,
  exportModulAjarToDocx,
  exportModulAjarToPdf,
  exportLkpdToDocx,
  exportLkpdToPdf,
} from '../../utils/documentExporter';
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
  const [isExporting, setIsExporting] = useState(false);

  // ==================== STATE 1: PEMBUAT SOAL ULANGAN AI ====================
  const [soalMapel, setSoalMapel] = useState<string>(mapelList[0]?.nama || 'IPAS (IPA & IPS)');
  const [soalJenjang, setSoalJenjang] = useState<'SD' | 'SMP' | 'SMA' | 'SMK'>('SD');
  const [soalKelas, setSoalKelas] = useState<string>(kelasList[0]?.nama || '4');
  const [soalFase, setSoalFase] = useState<string>('Fase B');
  const [soalSemester, setSoalSemester] = useState<'Ganjil' | 'Genap'>((settings.semesterAktif as any) || 'Ganjil');
  const [soalKurikulum, setSoalKurikulum] = useState<'Kurikulum Merdeka' | 'Kurikulum 2013'>('Kurikulum Merdeka');
  const [soalJenis, setSoalJenis] = useState<'Ulangan Harian' | 'Penilaian Tengah Semester (PTS/STS)' | 'Penilaian Akhir Semester (PAS/SAS)' | 'Kuis / Latihan Harian'>('Ulangan Harian');
  const [soalDurasi, setSoalDurasi] = useState<number>(60);
  const [soalTingkat, setSoalTingkat] = useState<'Mudah' | 'Sedang' | 'HOTS (Analisis Tinggi)'>('Sedang');
  const [soalTopik, setSoalTopik] = useState<string>('Siklus Air dan Bagian-Bagian Tumbuhan');
  const [soalTujuanPembelajaran, setSoalTujuanPembelajaran] = useState<string>('Peserta didik mampu mengidentifikasi proses daur air dan fungsi organ tumbuhan.');
  const [soalJumlahPg, setSoalJumlahPg] = useState<number>(5);
  const [soalJumlahEsai, setSoalJumlahEsai] = useState<number>(2);
  const [soalSertakanGambar, setSoalSertakanGambar] = useState<boolean>(true);
  const [soalCatatan, setSoalCatatan] = useState<string>('');
  const [isGeneratingSoal, setIsGeneratingSoal] = useState<boolean>(false);
  const [hasilSoal, setHasilSoal] = useState<NaskahUjianAI | null>(null);
  const [soalViewMode, setSoalViewMode] = useState<'siswa' | 'guru'>('siswa');

  // Single question regeneration & inline editing states
  const [regeneratingIdx, setRegeneratingIdx] = useState<number | null>(null);
  const [editingPgTarget, setEditingPgTarget] = useState<{
    index: number;
    question: SoalPilihanGanda;
  } | null>(null);

  // Modal Image Picker / Uploader for Soal
  const [imageModalTarget, setImageModalTarget] = useState<{
    type: 'pg' | 'esai';
    index: number;
    currentImage?: string;
    currentCaption?: string;
  } | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // ==================== STATE 2: PENYUSUN MODUL AJAR (RPP) AI ====================
  const [modulKurikulum, setModulKurikulum] = useState<'Kurikulum Merdeka' | 'Kurikulum 2013'>('Kurikulum Merdeka');
  const [modulJenisDokumen, setModulJenisDokumen] = useState<string>('Modul Ajar');
  const [modulJenjang, setModulJenjang] = useState<'PAUD' | 'SD' | 'SMP' | 'SMA' | 'SMK'>('SD');
  const [modulMapel, setModulMapel] = useState<string>(mapelList[0]?.nama || 'IPAS');
  const [modulFase, setModulFase] = useState<string>('Fase B (Kelas 4)');
  const [modulTahunAjaran, setModulTahunAjaran] = useState<string>(settings.tahunAjaranAktif || '2025/2026');
  const [modulSemester, setModulSemester] = useState<'Ganjil' | 'Genap'>((settings.semesterAktif as any) || 'Ganjil');
  const [modulWaktu, setModulWaktu] = useState<string>('2 x 35 Menit (1 Pertemuan)');
  const [modulTopik, setModulTopik] = useState<string>('Siklus Air dan Penghematan Air Bersih');
  const [modulCapaian, setModulCapaian] = useState<string>('Peserta didik menyelidiki bagaimana air bersirkulasi di permukaan bumi dan pentingnya menjaga ketersediaan air bersih.');
  const [selectedProfil, setSelectedProfil] = useState<string[]>(['Bernalar Kritis', 'Gotong Royong', 'Mandiri']);
  const [modulModel, setModulModel] = useState<string>('Problem Based Learning (PBL)');
  const [modulMetode, setModulMetode] = useState<string>('Pendekatan Saintifik & Pembelajaran Berdiferensiasi');
  const [modulSarana, setModulSarana] = useState<string>('Buku Siswa, LCD Proyektor, LKPD Bergambar, Benda Konkret');
  const [modulTargetPeserta, setModulTargetPeserta] = useState<string>('Peserta Didik Reguler / Heterogen');
  const [modulCatatan, setModulCatatan] = useState<string>('');
  const [isGeneratingModul, setIsGeneratingModul] = useState<boolean>(false);
  const [hasilModul, setHasilModul] = useState<ModulAjarAI | null>(null);
  const [isEditingModul, setIsEditingModul] = useState<boolean>(false);

  // ==================== STATE 3: BAHAN AJAR & LKPD VISUAL GAMBAR ====================
  const [materiMapel, setMateriMapel] = useState<string>(mapelList[0]?.nama || 'Matematika');
  const [materiKelas, setMateriKelas] = useState<string>('4');
  const [materiTopik, setMateriTopik] = useState<string>('Konsep Pecahan dan Pengukuran Waktu');
  const [materiTipe, setMateriTipe] = useState<'lkpd_gambar' | 'ringkasan' | 'bahan_plus_lkpd' | 'remedial'>('lkpd_gambar');
  const [materiTemaVisual, setMateriTemaVisual] = useState<'ceria' | 'saintifik' | 'alam' | 'minimalis'>('ceria');
  const [materiCatatan, setMateriCatatan] = useState<string>('');
  const [isGeneratingMateri, setIsGeneratingMateri] = useState<boolean>(false);
  const [hasilMateri, setHasilMateri] = useState<BahanAjarAI | null>(null);
  const [activeLkpdPage, setActiveLkpdPage] = useState<number>(1);
  const [isReRenderingLkpd, setIsReRenderingLkpd] = useState<boolean>(false);

  // Modal Image Picker for LKPD Activity
  const [lkpdImageModalTarget, setLkpdImageModalTarget] = useState<{
    halamanIndex: number;
    aktivitasIndex: number;
  } | null>(null);
  const lkpdFileInputRef = useRef<HTMLInputElement>(null);

  // ==================== STATE 4: BANK DATA ====================
  const [savedSoalList, setSavedSoalList] = useState<NaskahUjianAI[]>(db.getNaskahSoalList());
  const [savedModulList, setSavedModulList] = useState<ModulAjarAI[]>(db.getModulAjarList());
  const [savedMateriList, setSavedMateriList] = useState<BahanAjarAI[]>(db.getBahanAjarList());
  const [bankFilter, setBankFilter] = useState<'semua' | 'soal' | 'modul' | 'materi'>('semua');
  const [bankSearch, setBankSearch] = useState<string>('');
  const [deleteConfirm, setDeleteConfirm] = useState<{
    type: 'soal' | 'modul' | 'materi';
    id: string;
    title: string;
  } | null>(null);

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

  const showNotification = (type: 'success' | 'error', text: string) => {
    setStatusMsg({ type, text });
    setTimeout(() => setStatusMsg(null), 5000);
  };

  const copyToClipboard = (text: string) => {
    navigator.clipboard.writeText(text);
    setIsCopied(true);
    showNotification('success', 'Teks berhasil disalin ke clipboard!');
    setTimeout(() => setIsCopied(false), 2000);
  };

  // =========================================================================
  // 1. GENERATE SOAL ULANGAN (AI DENGAN DUKUNGAN GAMBAR NYATA)
  // =========================================================================
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
          fase: soalFase,
          semester: soalSemester,
          kurikulum: soalKurikulum,
          jenisUjian: soalJenis,
          durasiMenit: soalDurasi,
          tingkatKesulitan: soalTingkat,
          topikMateri: soalTopik,
          tujuanPembelajaran: soalTujuanPembelajaran,
          jumlahPg: Number(soalJumlahPg),
          jumlahEsai: Number(soalJumlahEsai),
          sertakanGambar: soalSertakanGambar,
          instruksiTambahan: soalCatatan,
        }),
      });

      let rawPg: SoalPilihanGanda[] = [];
      let rawEsai: SoalEsai[] = [];
      let judulUjian = `Naskah ${soalJenis} ${soalMapel} Kelas ${soalKelas}`;
      let petunjuk = '1. Berdoalah sebelum mengerjakan. 2. Bacalah soal dengan teliti dan pilih jawaban yang paling tepat.';
      let kisiKisiData: any[] | undefined = undefined;
      let rubrikData: string | undefined = undefined;

      if (apiRes.ok && apiRes.data?.success && apiRes.data.data) {
        const json = apiRes.data.data;
        judulUjian = json.judul || judulUjian;
        petunjuk = json.petunjukUmum || petunjuk;
        rawPg = json.pilihanGanda || [];
        rawEsai = json.esai || [];
        kisiKisiData = json.kisiKisi;
        rubrikData = json.rubrikPenilaian;
      } else {
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
        judulUjian = fallback.judul;
        petunjuk = fallback.petunjukUmum;
        rawPg = fallback.pilihanGanda;
        rawEsai = fallback.esai;
      }

      // Automatically attach high quality illustrations if question needs images
      const enrichedPg: SoalPilihanGanda[] = rawPg.map((q, idx) => {
        let finalImage = q.gambar;
        let finalCaption = q.gambarCaption;

        if (soalSertakanGambar && (!finalImage || idx === 0)) {
          const smartImg = findSmartVisualForQuestion(q.pertanyaan, q.gambarCaption, (q as any).gambarKeyword, soalMapel);
          if (smartImg) {
            finalImage = smartImg.dataUri;
            finalCaption = finalCaption || smartImg.title;
          }
        }

        return {
          ...q,
          nomor: idx + 1,
          gambar: finalImage,
          gambarCaption: finalCaption,
        };
      });

      const enrichedEsai: SoalEsai[] = rawEsai.map((q, idx) => {
        let finalImage = q.gambar;
        let finalCaption = q.gambarCaption;

        if (soalSertakanGambar && idx === 0 && !finalImage) {
          const smartImg = findSmartVisualForQuestion(q.pertanyaan, q.gambarCaption, (q as any).gambarKeyword, soalMapel);
          if (smartImg) {
            finalImage = smartImg.dataUri;
            finalCaption = finalCaption || smartImg.title;
          }
        }

        return {
          ...q,
          nomor: idx + 1,
          gambar: finalImage,
          gambarCaption: finalCaption,
        };
      });

      const naskahFinal: NaskahUjianAI = {
        id: `soal-${Date.now()}`,
        guruId: currentUser.id,
        guruName: currentUser.name,
        judul: judulUjian,
        mataPelajaran: soalMapel,
        kelas: soalKelas,
        fase: soalFase,
        semester: soalSemester,
        durasiMenit: soalDurasi,
        kurikulum: soalKurikulum,
        jenisUjian: soalJenis,
        tingkatKesulitan: soalTingkat,
        topikMateri: soalTopik,
        tujuanPembelajaran: soalTujuanPembelajaran,
        petunjukUmum: petunjuk,
        pilihanGanda: enrichedPg,
        esai: enrichedEsai,
        kisiKisi: kisiKisiData,
        rubrikPenilaian: rubrikData,
        createdAt: new Date().toISOString(),
      };

      setHasilSoal(naskahFinal);
      db.saveNaskahSoal(naskahFinal);
      showNotification('success', 'Naskah soal ulangan bergambar berhasil dibuat dan tersimpan permanen!');
    } catch (err: any) {
      console.warn('Error generating soal:', err);
      showNotification('error', 'Gagal memproses soal. Silakan coba kembali.');
    } finally {
      setIsGeneratingSoal(false);
    }
  };

  // Image upload handler for Soal
  const handleUploadImageSoal = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !imageModalTarget || !hasilSoal) return;

    if (file.size > 3 * 1024 * 1024) {
      showNotification('error', 'Ukuran foto maksimal 3MB.');
      return;
    }

    const reader = new FileReader();
    reader.onload = (event) => {
      const dataUri = event.target?.result as string;
      if (dataUri) {
        updateSoalImage(imageModalTarget.type, imageModalTarget.index, dataUri, file.name.replace(/\.[^/.]+$/, ''));
        setImageModalTarget(null);
      }
    };
    reader.readAsDataURL(file);
  };

  const updateSoalImage = (type: 'pg' | 'esai', index: number, imageUri?: string, caption?: string) => {
    if (!hasilSoal) return;

    const updated = { ...hasilSoal };
    if (type === 'pg') {
      const qList = [...updated.pilihanGanda];
      if (qList[index]) {
        qList[index] = {
          ...qList[index],
          gambar: imageUri,
          gambarCaption: caption !== undefined ? caption : qList[index].gambarCaption,
        };
      }
      updated.pilihanGanda = qList;
    } else {
      const eList = [...updated.esai];
      if (eList[index]) {
        eList[index] = {
          ...eList[index],
          gambar: imageUri,
          gambarCaption: caption !== undefined ? caption : eList[index].gambarCaption,
        };
      }
      updated.esai = eList;
    }

    setHasilSoal(updated);
    db.saveNaskahSoal(updated);
    showNotification('success', imageUri ? 'Gambar soal berhasil diperbarui & disimpan!' : 'Gambar soal berhasil dihapus!');
  };

  // Add a new blank question
  const handleAddQuestion = (type: 'pg' | 'esai') => {
    if (!hasilSoal) return;
    const updated = { ...hasilSoal };
    if (type === 'pg') {
      const newNum = updated.pilihanGanda.length + 1;
      updated.pilihanGanda = [
        ...updated.pilihanGanda,
        {
          nomor: newNum,
          pertanyaan: 'Ketikkan butir pertanyaan baru di sini...',
          pilihan: {
            A: 'Pilihan Jawaban A',
            B: 'Pilihan Jawaban B',
            C: 'Pilihan Jawaban C',
            D: 'Pilihan Jawaban D',
          },
          kunciJawaban: 'A',
          pembahasan: 'Penjelasan kunci jawaban...',
        },
      ];
    } else {
      const newNum = updated.esai.length + 1;
      updated.esai = [
        ...updated.esai,
        {
          nomor: newNum,
          pertanyaan: 'Ketikkan butir soal uraian/esai baru di sini...',
          pedomanPenskoran: 'Skor 0 - 5',
          kunciJawaban: 'Uraian jawaban ideal...',
        },
      ];
    }
    setHasilSoal(updated);
    db.saveNaskahSoal(updated);
    showNotification('success', 'Butir soal baru berhasil ditambahkan.');
  };

  const handleDeleteQuestion = (type: 'pg' | 'esai', index: number) => {
    if (!hasilSoal) return;
    const updated = { ...hasilSoal };
    if (type === 'pg') {
      updated.pilihanGanda = updated.pilihanGanda.filter((_, i) => i !== index).map((q, i) => ({ ...q, nomor: i + 1 }));
    } else {
      updated.esai = updated.esai.filter((_, i) => i !== index).map((q, i) => ({ ...q, nomor: i + 1 }));
    }
    setHasilSoal(updated);
    db.saveNaskahSoal(updated);
    showNotification('success', 'Butir soal berhasil dihapus.');
  };

  // Regenerate single question using AI
  const handleRegenerateSinglePg = async (idx: number) => {
    if (!hasilSoal) return;
    const targetPg = hasilSoal.pilihanGanda[idx];
    if (!targetPg) return;

    setRegeneratingIdx(idx);
    try {
      const res = await safeFetchJson<{ success: boolean; data: any }>('/api/ai/regenerasi-soal', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          mataPelajaran: hasilSoal.mataPelajaran,
          kelas: hasilSoal.kelas,
          topikMateri: hasilSoal.topikMateri,
          nomor: targetPg.nomor || idx + 1,
          soalLama: targetPg.pertanyaan,
          soalLainnya: hasilSoal.pilihanGanda.filter((_, i) => i !== idx).map((q) => q.pertanyaan),
        }),
      });

      if (res.ok && res.data?.success && res.data.data) {
        const newPg = res.data.data;
        const updatedList = [...hasilSoal.pilihanGanda];
        updatedList[idx] = {
          ...targetPg,
          pertanyaan: newPg.pertanyaan,
          pilihan: newPg.pilihan || targetPg.pilihan,
          kunciJawaban: newPg.kunciJawaban || targetPg.kunciJawaban,
          pembahasan: newPg.pembahasan || targetPg.pembahasan,
        };
        const updatedNaskah = { ...hasilSoal, pilihanGanda: updatedList };
        setHasilSoal(updatedNaskah);
        db.saveNaskahSoal(updatedNaskah);
        showNotification('success', `Butir soal #${idx + 1} berhasil diregenerasi secara orisinal!`);
      } else {
        showNotification('error', 'Gagal meregenerasi butir soal.');
      }
    } catch {
      showNotification('error', 'Terjadi kendala saat meregenerasi butir soal.');
    } finally {
      setRegeneratingIdx(null);
    }
  };

  // Save manually edited question
  const handleSaveEditedPg = (editedQuestion: SoalPilihanGanda, idx: number) => {
    if (!hasilSoal) return;
    const updatedList = [...hasilSoal.pilihanGanda];
    updatedList[idx] = editedQuestion;
    const updatedNaskah = { ...hasilSoal, pilihanGanda: updatedList };
    setHasilSoal(updatedNaskah);
    db.saveNaskahSoal(updatedNaskah);
    setEditingPgTarget(null);
    showNotification('success', `Perubahan butir soal #${idx + 1} berhasil disimpan.`);
  };

  // Convert AI questions directly into official CBT Exam or Interactive Game Quiz
  const handleCreateExamFromSoal = (mode: 'ujian_resmi' | 'kuis_game') => {
    if (!hasilSoal) return;

    const newUjian: UjianOnline = {
      id: `ujn-${Date.now()}`,
      judul: hasilSoal.judul,
      deskripsi: `Dibuat secara profesional melalui Asisten AI Guru untuk materi ${hasilSoal.topikMateri || hasilSoal.mataPelajaran}`,
      mataPelajaran: hasilSoal.mataPelajaran,
      guruId: currentUser.id,
      guruNama: currentUser.name,
      kelasTarget: [hasilSoal.kelas ? `Kelas ${hasilSoal.kelas}` : 'Semua Siswa'],
      semester: hasilSoal.semester || 'Ganjil',
      tahunAjaran: settings.tahunAjaranAktif || '2025/2026',
      jenisUjian: (hasilSoal.jenisUjian as any) || 'Ulangan Harian',
      status: 'aktif',
      tanggalMulai: new Date().toISOString(),
      tanggalSelesai: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString(),
      durasiMenit: hasilSoal.durasiMenit || 60,
      jumlahPercobaan: 1,
      modeTampilan: 'satu_per_satu',
      kkm: 75,
      acakSoal: mode === 'ujian_resmi',
      acakPilihan: mode === 'ujian_resmi',
      tampilkanNilaiLangsung: true,
      tampilkanPembahasan: 'langsung',
      modeInteraktif: mode,
      gameSettings:
        mode === 'kuis_game'
          ? {
              gameMode: 'petualangan',
              tingkatKesulitan: 'sedang',
              maksimalPercobaan: 2,
              poinPerSoal: 10,
              batasWaktuPerSoalDetik: 0,
              tampilkanPetunjuk: true,
              efekSuaraAktif: true,
              animasiAktif: true,
              izinkanUlangKuis: true,
              tampilkanPapanPeringkat: true,
              simpanSebagaiNilai: 'latihan_saja',
            }
          : undefined,
      pengawasanAktif: mode === 'ujian_resmi',
      wajibFullscreen: mode === 'ujian_resmi',
      maksimalPelanggaran: 3,
      blokirCopyPaste: mode === 'ujian_resmi',
      soalList: [
        ...hasilSoal.pilihanGanda.map((pg, idx) => ({
          id: `soal-${Date.now()}-${idx + 1}`,
          nomor: idx + 1,
          tipe: 'pilihan_ganda' as const,
          pertanyaan: pg.pertanyaan,
          pilihan: pg.pilihan,
          kunciJawaban: pg.kunciJawaban,
          pembahasan: pg.pembahasan,
          penjelasanBenar: pg.pembahasan,
          petunjuk: `Cermati kembali konsep esensial materi ${hasilSoal.topikMateri || hasilSoal.mataPelajaran}.`,
          gambar: pg.gambar,
          gambarCaption: pg.gambarCaption,
          bobot: 1,
        })),
        ...hasilSoal.esai.map((es, idx) => ({
          id: `soal-${Date.now()}-${hasilSoal.pilihanGanda.length + idx + 1}`,
          nomor: hasilSoal.pilihanGanda.length + idx + 1,
          tipe: 'esai' as const,
          pertanyaan: es.pertanyaan,
          kunciJawaban: es.kunciJawaban,
          pembahasan: es.pedomanPenskoran,
          bobot: 2,
        })),
      ],
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };

    db.saveUjianOnline(newUjian);
    showNotification(
      'success',
      mode === 'kuis_game'
        ? 'Soal berhasil diintegrasikan menjadi Kuis Game Interaktif Edukasi! Siswa dapat memainkannya.'
        : 'Soal berhasil dipublikasikan menjadi Ujian Online Resmi CBT!'
    );
  };

  // Export handlers for Soal
  const handleExportSoalDocx = async (withAnswerKey: boolean) => {
    if (!hasilSoal) return;
    setIsExporting(true);
    try {
      await exportSoalToDocx(hasilSoal, withAnswerKey, settings.namaSekolah);
      showNotification('success', 'File Word (.docx) berhasil diunduh dengan gambar!');
    } catch (err: any) {
      showNotification('error', 'Gagal mengekspor ke Word: ' + (err.message || ''));
    } finally {
      setIsExporting(false);
    }
  };

  const handleExportSoalPdf = async (withAnswerKey: boolean) => {
    if (!hasilSoal) return;
    setIsExporting(true);
    try {
      await exportSoalToPdf(hasilSoal, withAnswerKey, settings.namaSekolah);
      showNotification('success', 'File PDF berhasil diunduh!');
    } catch (err: any) {
      showNotification('error', 'Gagal mengekspor ke PDF: ' + (err.message || ''));
    } finally {
      setIsExporting(false);
    }
  };

  // =========================================================================
  // 2. GENERATE MODUL AJAR / RPP AI
  // =========================================================================
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
        showNotification('success', `${modulJenisDokumen} berhasil disusun lengkap dan tersimpan!`);
      } else {
        generatedModul = generateOfficialCurriculumModul({
          ...modulPayload,
          guruName: currentUser.name,
          namaSekolah: settings.namaSekolah,
        });
        showNotification('success', `${modulJenisDokumen} resmi berhasil disusun sesuai acuan regulasi pendidikan!`);
      }

      setHasilModul(generatedModul);
      db.saveModulAjar(generatedModul);
    } catch (err: any) {
      console.warn('Error generating modul:', err);
      showNotification('error', 'Gagal memproses modul ajar.');
    } finally {
      setIsGeneratingModul(false);
    }
  };

  const handleExportModulDocx = async () => {
    if (!hasilModul) return;
    setIsExporting(true);
    try {
      await exportModulAjarToDocx(hasilModul, settings.namaSekolah);
      showNotification('success', 'Modul Ajar berhasil diekspor ke Word (.docx)!');
    } catch (err: any) {
      showNotification('error', 'Gagal mengekspor: ' + (err.message || ''));
    } finally {
      setIsExporting(false);
    }
  };

  const handleExportModulPdf = async () => {
    if (!hasilModul) return;
    setIsExporting(true);
    try {
      await exportModulAjarToPdf(hasilModul, settings.namaSekolah);
      showNotification('success', 'Modul Ajar berhasil diekspor ke PDF!');
    } catch (err: any) {
      showNotification('error', 'Gagal mengekspor: ' + (err.message || ''));
    } finally {
      setIsExporting(false);
    }
  };

  // =========================================================================
  // 3. GENERATE BAHAN AJAR & LKPD VISUAL GAMBAR (WAJIB BERBENTUK GAMBAR A4)
  // =========================================================================
  const handleGenerateMateri = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!materiTopik.trim()) {
      showNotification('error', 'Silakan masukkan topik materi pembelajaran.');
      return;
    }

    setIsGeneratingMateri(true);
    setStatusMsg(null);

    try {
      const apiRes = await safeFetchJson<{
        success: boolean;
        markdown?: string;
        lkpdData?: LkpdData;
        data?: any;
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
          sertakanGambar: true,
        }),
      });

      let rawLkpd: LkpdData | null = null;
      let finalMarkdown = '';

      if (apiRes.ok && apiRes.data?.success) {
        finalMarkdown = apiRes.data.markdown || apiRes.data.data?.markdown || '';
        rawLkpd = apiRes.data.lkpdData || apiRes.data.data?.lkpdData || null;
      }

      // If LKPD data is missing or user requested visual LKPD, construct rich structured activities
      if (!rawLkpd && (materiTipe === 'lkpd_gambar' || materiTipe === 'bahan_plus_lkpd' || (materiTipe as string) === 'lkpd')) {
        const smart1 = findSmartVisualForQuestion(materiTopik, undefined, undefined, materiMapel);
        const smart2 = findIllustrationByKey('bagian_tumbuhan') || findIllustrationByKey('siklus_air') || findIllustrationByKey('pecahan_setengah');

        rawLkpd = {
          judulLkpd: `LEMBAR KERJA PESERTA DIDIK (LKPD) - ${materiTopik}`,
          mataPelajaran: materiMapel,
          kelas: `Kelas ${materiKelas}`,
          topikMateri: materiTopik,
          warnaAksen: materiTemaVisual === 'ceria' ? '#2563EB' : materiTemaVisual === 'alam' ? '#059669' : '#1E3A8A',
          temaVisual: materiTemaVisual,
          tujuanKegiatan: [
            `Memahami konsep ${materiTopik} secara visual dan mendalam`,
            'Mengembangkan kemampuan berpikir analitis, teliti, dan mandiri',
          ],
          petunjukPengerjaan: [
            'Tuliskan nama lengkap dan kelas pada kolom identitas siswa.',
            'Amati gambar ilustrasi dengan cermat sebelum menjawab pertanyaan.',
            'Tuliskan jawabanmu dengan rapi menggunakan pensil atau pulpen.',
          ],
          halamanList: [
            {
              nomorHalaman: 1,
              subJudul: 'Aktivitas 1: Eksplorasi Visual & Tanya Gambar',
              aktivitas: [
                {
                  id: 'act-1',
                  nomor: 1,
                  tipe: 'tanya_gambar',
                  instruksi: 'Amatilah ilustrasi di bawah ini dengan saksama, lalu jawab pertanyaannya!',
                  gambar: smart1?.dataUri || CURATED_ILLUSTRATIONS[0].dataUri,
                  gambarCaption: smart1?.title || 'Pengamatan Konsep Pembelajaran',
                  pertanyaan: `Berdasarkan gambar di atas, analisislah keterkaitan konsep ${materiTopik} dalam kehidupan sehari-hari!`,
                  garisJawaban: 3,
                },
                {
                  id: 'act-2',
                  nomor: 2,
                  tipe: 'cocokkan',
                  instruksi: 'Tariklah garis lurus untuk menghubungkan konsep di sebelah kiri dengan penjelasannya yang tepat di sebelah kanan!',
                  pilihanKiri: ['Konsep A: Dasar', 'Konsep B: Proses', 'Konsep C: Penerapan'],
                  pilihanKanan: ['Hasil akhir kegiatan', 'Pengenalan awal materi', 'Langkah yang sedang berjalan'],
                },
              ],
            },
            {
              nomorHalaman: 2,
              subJudul: 'Aktivitas 2: Analisis & Tabel Pengamatan',
              aktivitas: [
                {
                  id: 'act-3',
                  nomor: 3,
                  tipe: 'tabel_pengamatan',
                  instruksi: 'Lengkapilah tabel pengamatan berikut berdasarkan pemahaman yang kamu peroleh:',
                  kolomTabel: ['No', 'Aspek Pengamatan', 'Hasil / Catatan Siswa', 'Kesimpulan'],
                  barisTabel: [
                    ['1', 'Ciri-Ciri Utama', '', ''],
                    ['2', 'Perubahan yang Terjadi', '', ''],
                    ['3', 'Manfaat bagi Lingkungan', '', ''],
                  ],
                },
                {
                  id: 'act-4',
                  nomor: 4,
                  tipe: 'uraian_kreatif',
                  instruksi: 'Refleksi Diri: Tuliskan satu hal paling berkesan yang kamu pelajari hari ini beserta alasannya!',
                  garisJawaban: 3,
                },
              ],
            },
          ],
        };
      }

      // Render every LKPD page to high-res PNG
      if (rawLkpd && rawLkpd.halamanList) {
        const renderedPages: LkpdHalaman[] = [];
        for (const page of rawLkpd.halamanList) {
          const pngUri = await renderLkpdPageToPng(rawLkpd, page, {
            schoolName: settings.namaSekolah,
            themeColor: rawLkpd.warnaAksen,
          });
          renderedPages.push({
            ...page,
            pngDataUri: pngUri,
          });
        }
        rawLkpd.halamanList = renderedPages;
      }

      const generatedBahan: BahanAjarAI = {
        id: `materi-${Date.now()}`,
        guruId: currentUser.id,
        guruName: currentUser.name,
        judul: `${materiTipe === 'lkpd_gambar' ? 'LKPD Visual Gambar' : materiTipe === 'bahan_plus_lkpd' ? 'Bahan Ajar & LKPD Visual' : 'Bahan Ajar'} ${materiMapel} Kelas ${materiKelas}`,
        mataPelajaran: materiMapel,
        kelas: materiKelas,
        topikMateri: materiTopik,
        tipe: materiTipe,
        isiMarkdown: finalMarkdown || `# ${materiTopik}\n\nMateri ringkasan disusun untuk mendukung Lembar Kerja Peserta Didik (LKPD).`,
        lkpdData: rawLkpd || undefined,
        createdAt: new Date().toISOString(),
      };

      setHasilMateri(generatedBahan);
      db.saveBahanAjar(generatedBahan);
      setActiveLkpdPage(1);
      showNotification('success', 'LKPD Visual berbasis gambar resolusi tinggi berhasil dibuat & siap dicetak A4!');
    } catch (err: any) {
      console.warn('Error generating materi:', err);
      showNotification('error', 'Gagal menyusun lembar kerja visual.');
    } finally {
      setIsGeneratingMateri(false);
    }
  };

  // Re-render LKPD canvas when user modifies an activity
  const reRenderLkpd = async (updatedLkpd: LkpdData) => {
    setIsReRenderingLkpd(true);
    try {
      const renderedPages: LkpdHalaman[] = [];
      for (const page of updatedLkpd.halamanList) {
        const pngUri = await renderLkpdPageToPng(updatedLkpd, page, {
          schoolName: settings.namaSekolah,
          themeColor: updatedLkpd.warnaAksen,
        });
        renderedPages.push({
          ...page,
          pngDataUri: pngUri,
        });
      }
      const newBahan: BahanAjarAI = {
        ...(hasilMateri as BahanAjarAI),
        lkpdData: {
          ...updatedLkpd,
          halamanList: renderedPages,
        },
      };
      setHasilMateri(newBahan);
      db.saveBahanAjar(newBahan);
      showNotification('success', 'Gambar visual LKPD berhasil diperbarui & disimpan!');
    } catch (err) {
      console.error(err);
      showNotification('error', 'Gagal merender ulang LKPD.');
    } finally {
      setIsReRenderingLkpd(false);
    }
  };

  // Upload image to LKPD activity
  const handleUploadImageLkpd = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !lkpdImageModalTarget || !hasilMateri?.lkpdData) return;

    if (file.size > 3 * 1024 * 1024) {
      showNotification('error', 'Ukuran foto maksimal 3MB.');
      return;
    }

    const reader = new FileReader();
    reader.onload = async (event) => {
      const dataUri = event.target?.result as string;
      if (dataUri) {
        const lkpdCopy = JSON.parse(JSON.stringify(hasilMateri.lkpdData)) as LkpdData;
        const page = lkpdCopy.halamanList[lkpdImageModalTarget.halamanIndex];
        if (page && page.aktivitas[lkpdImageModalTarget.aktivitasIndex]) {
          page.aktivitas[lkpdImageModalTarget.aktivitasIndex].gambar = dataUri;
          page.aktivitas[lkpdImageModalTarget.aktivitasIndex].gambarCaption = file.name.replace(/\.[^/.]+$/, '');
          await reRenderLkpd(lkpdCopy);
        }
        setLkpdImageModalTarget(null);
      }
    };
    reader.readAsDataURL(file);
  };

  // Download individual LKPD page image (PNG)
  const handleDownloadLkpdPng = (pageNum: number) => {
    if (!hasilMateri?.lkpdData) return;
    const page = hasilMateri.lkpdData.halamanList.find((p) => p.nomorHalaman === pageNum);
    if (!page?.pngDataUri) {
      showNotification('error', 'Gambar halaman belum selesai dirender.');
      return;
    }
    const link = document.createElement('a');
    link.href = page.pngDataUri;
    link.download = `LKPD-${hasilMateri.mataPelajaran.replace(/\s+/g, '_')}-Halaman-${pageNum}.png`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    showNotification('success', `Gambar LKPD Halaman ${pageNum} berhasil diunduh (PNG Siap Cetak A4)!`);
  };

  // Export LKPD to Word (.docx) with embedded high-res PNG images
  const handleExportLkpdDocx = async () => {
    if (!hasilMateri) return;
    setIsExporting(true);
    try {
      await exportLkpdToDocx(hasilMateri);
      showNotification('success', 'File Word (.docx) dengan LKPD gambar visual berhasil diunduh!');
    } catch (err: any) {
      showNotification('error', 'Gagal mengekspor: ' + (err.message || ''));
    } finally {
      setIsExporting(false);
    }
  };

  // Export LKPD to PDF with embedded high-res PNG images
  const handleExportLkpdPdf = () => {
    if (!hasilMateri) return;
    setIsExporting(true);
    try {
      exportLkpdToPdf(hasilMateri);
      showNotification('success', 'File PDF LKPD gambar visual siap cetak berhasil diunduh!');
    } catch (err: any) {
      showNotification('error', 'Gagal mengekspor: ' + (err.message || ''));
    } finally {
      setIsExporting(false);
    }
  };

  // Direct print LKPD
  const handlePrintLkpd = () => {
    printElement('lkpd-visual-sheet', `LKPD Visual - ${settings.namaSekolah}`);
  };

  // =========================================================================
  // BANK DATA DELETE EXECUTION
  // =========================================================================
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

  return (
    <div className="space-y-6">
      {/* Top Banner - Consistent School Identity */}
      <div className="bg-gradient-to-r from-blue-900 via-indigo-900 to-blue-950 rounded-2xl p-6 text-white shadow-md relative overflow-hidden border border-blue-800">
        <div className="relative z-10 flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
          <div>
            <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-white/10 text-amber-300 text-xs font-semibold backdrop-blur-xs border border-white/10">
              <Sparkles className="w-3.5 h-3.5 text-amber-300 animate-pulse" />
              <span>Asisten Guru AI Resmi • {settings.namaSekolah}</span>
            </div>
            <h2 className="text-xl sm:text-2xl font-black mt-2 tracking-tight">
              Pusat Pengembangan Asesmen, Modul Ajar & LKPD Visual
            </h2>
            <p className="text-xs sm:text-sm text-blue-200 mt-1 max-w-2xl leading-relaxed">
              Dilengkapi pembuatan naskah soal ulangan bergambar nyata (ekspor Word/PDF), penyusun Modul Ajar RPP lengkap,
              serta Lembar Kerja Peserta Didik (LKPD) visual berbasis gambar siap cetak A4.
            </p>
          </div>

          <div className="flex items-center gap-3 bg-white/10 p-3 rounded-xl border border-white/15 text-xs backdrop-blur-xs">
            <GraduationCap className="w-6 h-6 text-blue-300 flex-shrink-0" />
            <div>
              <div className="text-[10px] text-blue-200 uppercase font-semibold">Guru Pengampu</div>
              <div className="font-bold text-white text-sm">{currentUser.name}</div>
              <div className="text-[10px] text-blue-300">NIP: {currentUser.nip || '-'}</div>
            </div>
          </div>
        </div>
      </div>

      {/* Notifications */}
      {statusMsg && (
        <div
          className={`p-4 rounded-2xl text-xs font-semibold flex items-center gap-3 animate-in fade-in transition-all ${
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
          <span className="flex-1">{statusMsg.text}</span>
          <button
            type="button"
            onClick={() => setStatusMsg(null)}
            className="text-slate-400 hover:text-slate-600 cursor-pointer"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
      )}

      {/* Main 4 Tabs */}
      <div className="flex flex-wrap items-center gap-2 bg-white p-2 rounded-2xl border border-slate-200 shadow-xs">
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
          <span>1. Pembuat Soal Ulangan (Bergambar)</span>
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
          <span>2. Penyusun Modul Ajar (RPP)</span>
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
          <ImageIcon className="w-4 h-4" />
          <span>3. Bahan Ajar & LKPD Visual Gambar</span>
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
          <span>Bank Dokumen ({savedSoalList.length + savedModulList.length + savedMateriList.length})</span>
        </button>
      </div>

      {/* ========================================================================= */}
      {/* 1. PEMBUAT SOAL ULANGAN BERGAMBAR */}
      {/* ========================================================================= */}
      {activeSubTab === 'buat-soal' && (
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
          {/* Parameter Form */}
          <div className="lg:col-span-5 space-y-4">
            <div className="bg-white rounded-2xl p-6 border border-slate-200 shadow-xs">
              <div className="flex items-center gap-2 border-b border-slate-100 pb-3 mb-4">
                <Sliders className="w-4 h-4 text-blue-700" />
                <h3 className="text-sm font-bold text-slate-900">Parameter Pembuatan Soal Ulangan</h3>
              </div>

              <form onSubmit={handleGenerateSoal} className="space-y-4">
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-xs font-semibold text-slate-700 mb-1">Mata Pelajaran</label>
                    <input
                      type="text"
                      list="mapel-options-soal"
                      value={soalMapel}
                      onChange={(e) => setSoalMapel(e.target.value)}
                      className="w-full px-3 py-2 bg-slate-50 border border-slate-300 rounded-xl text-xs focus:bg-white"
                      placeholder="Mata pelajaran"
                      required
                    />
                    <datalist id="mapel-options-soal">
                      {mapelList.map((m) => (
                        <option key={m.id} value={m.nama} />
                      ))}
                      <option value="Matematika" />
                      <option value="IPAS (IPA & IPS)" />
                      <option value="Pendidikan Pancasila" />
                      <option value="Bahasa Indonesia" />
                      <option value="Pendidikan Agama & Budi Pekerti" />
                      <option value="Bahasa Inggris" />
                      <option value="Seni Rupa & Prakarya" />
                      <option value="PJOK" />
                    </datalist>
                  </div>

                  <div>
                    <label className="block text-xs font-semibold text-slate-700 mb-1">Jenjang & Tingkat Kelas</label>
                    <div className="grid grid-cols-2 gap-1.5">
                      <select
                        value={soalJenjang}
                        onChange={(e) => setSoalJenjang(e.target.value as any)}
                        className="px-2 py-2 bg-slate-50 border border-slate-300 rounded-xl text-xs"
                      >
                        <option value="SD">SD</option>
                        <option value="SMP">SMP</option>
                        <option value="SMA">SMA</option>
                        <option value="SMK">SMK</option>
                      </select>
                      <select
                        value={soalKelas}
                        onChange={(e) => setSoalKelas(e.target.value)}
                        className="px-2 py-2 bg-slate-50 border border-slate-300 rounded-xl text-xs font-bold text-blue-700"
                      >
                        {kelasList.length > 0 ? (
                          kelasList.map((k) => (
                            <option key={k.id} value={k.nama}>Kelas {k.nama}</option>
                          ))
                        ) : (
                          ['1', '2', '3', '4', '5', '6'].map((c) => (
                            <option key={c} value={c}>Kelas {c}</option>
                          ))
                        )}
                      </select>
                    </div>
                  </div>
                </div>

                <div className="grid grid-cols-3 gap-2">
                  <div>
                    <label className="block text-[11px] font-semibold text-slate-700 mb-1">Fase</label>
                    <select
                      value={soalFase}
                      onChange={(e) => setSoalFase(e.target.value)}
                      className="w-full px-2 py-2 bg-slate-50 border border-slate-300 rounded-xl text-xs"
                    >
                      <option value="Fase A (Kelas 1-2)">Fase A</option>
                      <option value="Fase B (Kelas 3-4)">Fase B</option>
                      <option value="Fase C (Kelas 5-6)">Fase C</option>
                      <option value="Fase D (Kelas 7-9)">Fase D</option>
                      <option value="Fase E (Kelas 10)">Fase E</option>
                      <option value="Fase F (Kelas 11-12)">Fase F</option>
                    </select>
                  </div>

                  <div>
                    <label className="block text-[11px] font-semibold text-slate-700 mb-1">Semester</label>
                    <select
                      value={soalSemester}
                      onChange={(e) => setSoalSemester(e.target.value as any)}
                      className="w-full px-2 py-2 bg-slate-50 border border-slate-300 rounded-xl text-xs"
                    >
                      <option value="Ganjil">Ganjil</option>
                      <option value="Genap">Genap</option>
                    </select>
                  </div>

                  <div>
                    <label className="block text-[11px] font-semibold text-slate-700 mb-1">Kurikulum</label>
                    <select
                      value={soalKurikulum}
                      onChange={(e) => setSoalKurikulum(e.target.value as any)}
                      className="w-full px-2 py-2 bg-slate-50 border border-slate-300 rounded-xl text-xs font-semibold text-slate-800"
                    >
                      <option value="Kurikulum Merdeka">Merdeka</option>
                      <option value="Kurikulum 2013">K13</option>
                    </select>
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-xs font-semibold text-slate-700 mb-1">Jenis Evaluasi</label>
                    <select
                      value={soalJenis}
                      onChange={(e) => setSoalJenis(e.target.value as any)}
                      className="w-full px-3 py-2 bg-slate-50 border border-slate-300 rounded-xl text-xs"
                    >
                      <option value="Ulangan Harian">Ulangan Harian (Formatif)</option>
                      <option value="Penilaian Tengah Semester (PTS/STS)">PTS / STS (Sumatif Tengah)</option>
                      <option value="Penilaian Akhir Semester (PAS/SAS)">PAS / SAS (Sumatif Akhir)</option>
                      <option value="Kuis / Latihan Harian">Kuis / Latihan Harian</option>
                    </select>
                  </div>

                  <div>
                    <label className="block text-xs font-semibold text-slate-700 mb-1">Tingkat Kesulitan & Waktu</label>
                    <div className="grid grid-cols-2 gap-1.5">
                      <select
                        value={soalTingkat}
                        onChange={(e) => setSoalTingkat(e.target.value as any)}
                        className="px-2 py-2 bg-slate-50 border border-slate-300 rounded-xl text-xs"
                      >
                        <option value="Mudah">Mudah</option>
                        <option value="Sedang">Sedang</option>
                        <option value="HOTS (Analisis Tinggi)">HOTS</option>
                      </select>
                      <div className="flex items-center gap-1 bg-slate-50 border border-slate-300 rounded-xl px-2 py-1.5">
                        <input
                          type="number"
                          min={15}
                          max={180}
                          value={soalDurasi}
                          onChange={(e) => setSoalDurasi(Number(e.target.value))}
                          className="w-full bg-transparent text-xs text-center font-bold"
                        />
                        <span className="text-[10px] text-slate-500">Mnt</span>
                      </div>
                    </div>
                  </div>
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">Materi / Bab</label>
                  <input
                    type="text"
                    value={soalTopik}
                    onChange={(e) => setSoalTopik(e.target.value)}
                    placeholder="Contoh: Bab 2 Siklus Air dan Pelestarian Lingkungan"
                    className="w-full px-3 py-2 bg-slate-50 border border-slate-300 rounded-xl text-xs focus:bg-white"
                    required
                  />
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">Tujuan Pembelajaran (TP)</label>
                  <textarea
                    rows={2}
                    value={soalTujuanPembelajaran}
                    onChange={(e) => setSoalTujuanPembelajaran(e.target.value)}
                    placeholder="Contoh: Siswa mampu menganalisis tahapan siklus air dan dampaknya bagi kehidupan"
                    className="w-full px-3 py-2 bg-slate-50 border border-slate-300 rounded-xl text-xs focus:bg-white leading-relaxed"
                  />
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-xs font-semibold text-slate-700 mb-1">Jumlah Pilihan Ganda</label>
                    <input
                      type="number"
                      min={1}
                      max={25}
                      value={soalJumlahPg}
                      onChange={(e) => setSoalJumlahPg(Number(e.target.value))}
                      className="w-full px-3 py-2 bg-slate-50 border border-slate-300 rounded-xl text-xs font-bold text-center"
                    />
                  </div>

                  <div>
                    <label className="block text-xs font-semibold text-slate-700 mb-1">Jumlah Uraian / Esai</label>
                    <input
                      type="number"
                      min={0}
                      max={10}
                      value={soalJumlahEsai}
                      onChange={(e) => setSoalJumlahEsai(Number(e.target.value))}
                      className="w-full px-3 py-2 bg-slate-50 border border-slate-300 rounded-xl text-xs font-bold text-center"
                    />
                  </div>
                </div>

                {/* Image support toggle */}
                <label className="flex items-center gap-2.5 p-2.5 bg-blue-50/80 border border-blue-200 rounded-xl cursor-pointer text-xs font-semibold text-blue-950 hover:bg-blue-50 transition-colors">
                  <input
                    type="checkbox"
                    checked={soalSertakanGambar}
                    onChange={(e) => setSoalSertakanGambar(e.target.checked)}
                    className="w-4 h-4 text-blue-600 rounded border-slate-300 focus:ring-blue-500 cursor-pointer"
                  />
                  <div className="flex items-center gap-1.5">
                    <ImageIcon className="w-4 h-4 text-blue-700" />
                    <span>Sertakan Gambar Edukatif Otomatis pada Soal</span>
                  </div>
                </label>

                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">Instruksi Khusus (Opsional)</label>
                  <input
                    type="text"
                    value={soalCatatan}
                    onChange={(e) => setSoalCatatan(e.target.value)}
                    placeholder="Contoh: Fokus pada soal analisis grafik / gambar organ"
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
                      <span>Gemini AI Sedang Merancang Soal Bergambar...</span>
                    </>
                  ) : (
                    <>
                      <Sparkles className="w-4 h-4 text-amber-300" />
                      <span>Buat Naskah Soal Ulangan Sekarang</span>
                    </>
                  )}
                </button>
              </form>
            </div>
          </div>

          {/* Results & Dual Preview */}
          <div className="lg:col-span-7 space-y-4">
            {hasilSoal ? (
              <div className="bg-white rounded-2xl p-6 border border-slate-200 shadow-xs space-y-5">
                {/* Mode Tabs: Naskah Siswa vs Naskah Guru */}
                <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-200 pb-3">
                  <div className="inline-flex p-1 bg-slate-100 rounded-xl border border-slate-200">
                    <button
                      type="button"
                      onClick={() => setSoalViewMode('siswa')}
                      className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all cursor-pointer ${
                        soalViewMode === 'siswa'
                          ? 'bg-white text-blue-700 shadow-xs'
                          : 'text-slate-600 hover:text-slate-900'
                      }`}
                    >
                      Naskah Siswa (Tanpa Kunci)
                    </button>
                    <button
                      type="button"
                      onClick={() => setSoalViewMode('guru')}
                      className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all cursor-pointer ${
                        soalViewMode === 'guru'
                          ? 'bg-emerald-600 text-white shadow-xs'
                          : 'text-slate-600 hover:text-slate-900'
                      }`}
                    >
                      Naskah Guru (Kunci & Rubrik)
                    </button>
                  </div>

                  {/* Direct Integration & Export Buttons */}
                  <div className="flex flex-wrap items-center gap-2">
                    <button
                      type="button"
                      onClick={() => handleCreateExamFromSoal('kuis_game')}
                      className="px-3 py-1.5 bg-gradient-to-r from-amber-500 to-orange-500 hover:from-amber-600 hover:to-orange-600 text-slate-950 font-black rounded-xl text-xs flex items-center gap-1.5 shadow-xs transition cursor-pointer"
                      title="Publikasikan langsung sebagai Kuis Game Interaktif Siswa"
                    >
                      <Gamepad2 className="w-3.5 h-3.5 text-slate-950" />
                      <span>Jadikan Kuis Game</span>
                    </button>

                    <button
                      type="button"
                      onClick={() => handleCreateExamFromSoal('ujian_resmi')}
                      className="px-3 py-1.5 bg-blue-700 hover:bg-blue-800 text-white font-bold rounded-xl text-xs flex items-center gap-1.5 shadow-xs transition cursor-pointer"
                      title="Daftarkan langsung ke Bank Soal Ujian Online Resmi (CBT)"
                    >
                      <GraduationCap className="w-3.5 h-3.5 text-blue-200" />
                      <span>Jadikan Ujian CBT</span>
                    </button>

                    <button
                      type="button"
                      disabled={isExporting}
                      onClick={() => handleExportSoalDocx(soalViewMode === 'guru')}
                      className="px-3 py-1.5 bg-blue-50 hover:bg-blue-100 text-blue-800 border border-blue-200 rounded-xl text-xs font-bold flex items-center gap-1.5 transition-colors cursor-pointer"
                      title="Unduh dokumen Word (.docx) dengan gambar tersemat"
                    >
                      <FileDown className="w-3.5 h-3.5 text-blue-600" />
                      <span>Word</span>
                    </button>

                    <button
                      type="button"
                      disabled={isExporting}
                      onClick={() => handleExportSoalPdf(soalViewMode === 'guru')}
                      className="px-3 py-1.5 bg-rose-50 hover:bg-rose-100 text-rose-800 border border-rose-200 rounded-xl text-xs font-bold flex items-center gap-1.5 transition-colors cursor-pointer"
                      title="Unduh dokumen PDF dengan gambar tersemat"
                    >
                      <FileDown className="w-3.5 h-3.5 text-rose-600" />
                      <span>PDF</span>
                    </button>

                    <button
                      type="button"
                      onClick={() => printElement('naskah-soal-paper', hasilSoal.judul)}
                      className="px-3 py-1.5 bg-slate-100 hover:bg-slate-200 text-slate-800 rounded-xl text-xs font-bold flex items-center gap-1.5 transition-colors cursor-pointer"
                    >
                      <Printer className="w-3.5 h-3.5 text-slate-600" />
                      <span>Cetak</span>
                    </button>
                  </div>
                </div>

                {/* Printable Paper */}
                <div id="naskah-soal-paper" className="p-6 bg-slate-50/60 rounded-2xl border border-slate-200 space-y-6 text-slate-900">
                  {/* Kop Resmi */}
                  <div className="flex items-center gap-4 border-b-2 border-slate-900 pb-4">
                    <img
                      src={settings.logoUrl || '/logo.svg'}
                      alt="Logo Sekolah"
                      className="w-16 h-16 object-contain flex-shrink-0"
                    />
                    <div className="flex-1 text-center sm:text-left">
                      <h4 className="text-base font-extrabold uppercase tracking-tight text-slate-900">
                        {settings.namaSekolah}
                      </h4>
                      <p className="text-[11px] text-slate-600">
                        {settings.alamat} {settings.kabupaten ? `• ${settings.kabupaten}` : ''} • Telp: {settings.telepon || '-'}
                      </p>
                      <p className="text-[10px] text-slate-500 font-medium">
                        NPSN: {settings.npsn} | Tahun Ajaran: {settings.tahunAjaranAktif || '2025/2026'} ({settings.semesterAktif || 'Ganjil'})
                      </p>
                    </div>
                  </div>

                  {/* Judul Ujian */}
                  <div className="text-center space-y-1">
                    <h3 className="text-sm sm:text-base font-black uppercase tracking-wide text-slate-900">
                      {hasilSoal.judul}
                    </h3>
                    <p className="text-xs text-blue-800 font-semibold">
                      {hasilSoal.kurikulum} • {hasilSoal.jenisUjian}
                    </p>
                  </div>

                  {/* Student Identity Grid */}
                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5 bg-white p-3 rounded-xl border border-slate-200 text-xs">
                    <div>
                      <span className="text-[10px] text-slate-500 block">Mata Pelajaran:</span>
                      <strong className="text-slate-800">{hasilSoal.mataPelajaran}</strong>
                    </div>
                    <div>
                      <span className="text-[10px] text-slate-500 block">Kelas / Alokasi Waktu:</span>
                      <strong className="text-slate-800">{hasilSoal.kelas} / {hasilSoal.durasiMenit || 60} Menit</strong>
                    </div>
                    <div>
                      <span className="text-[10px] text-slate-500 block">Nama Peserta Didik:</span>
                      <span className="text-slate-400 font-mono">...................................</span>
                    </div>
                    <div>
                      <span className="text-[10px] text-slate-500 block">No. Peserta / Nilai:</span>
                      <span className="text-slate-400 font-mono">....... / ........</span>
                    </div>
                  </div>

                  {/* Petunjuk */}
                  <div className="p-3 bg-blue-50/70 rounded-xl border border-blue-200 text-xs text-blue-950 leading-relaxed">
                    <strong>Petunjuk Umum: </strong>
                    <span>{hasilSoal.petunjukUmum}</span>
                  </div>

                  {/* Bagian I: Pilihan Ganda */}
                  {hasilSoal.pilihanGanda && hasilSoal.pilihanGanda.length > 0 && (
                    <div className="space-y-4">
                      <div className="flex items-center justify-between border-b border-slate-300 pb-1.5">
                        <h4 className="text-xs font-black uppercase text-slate-900 tracking-wider">
                          I. Pilihlah salah satu jawaban yang paling tepat!
                        </h4>
                        <span className="text-[10px] font-bold text-slate-500">
                          {hasilSoal.pilihanGanda.length} Butir Soal
                        </span>
                      </div>

                      <div className="space-y-4">
                        {hasilSoal.pilihanGanda.map((pg, idx) => (
                          <div key={idx} className="bg-white p-4 rounded-xl border border-slate-200 shadow-2xs space-y-3">
                            <div className="flex items-start justify-between gap-2">
                              <p className="text-xs font-semibold text-slate-900 leading-relaxed flex-1">
                                <span className="font-bold text-blue-700 mr-1">{pg.nomor || idx + 1}.</span>
                                {pg.pertanyaan}
                              </p>
                              <div className="flex items-center gap-1">
                                <button
                                  type="button"
                                  disabled={regeneratingIdx === idx}
                                  onClick={() => handleRegenerateSinglePg(idx)}
                                  className="px-2 py-1 rounded-lg hover:bg-amber-50 text-slate-600 hover:text-amber-700 text-[11px] font-semibold flex items-center gap-1 transition-colors cursor-pointer border border-slate-200 hover:border-amber-300 disabled:opacity-50"
                                  title="Regenerasi butir soal ini dengan AI agar tidak membosankan"
                                >
                                  <RefreshCw className={`w-3.5 h-3.5 text-amber-600 ${regeneratingIdx === idx ? 'animate-spin' : ''}`} />
                                  <span className="hidden sm:inline">{regeneratingIdx === idx ? 'Memproses...' : 'Ganti Soal'}</span>
                                </button>
                                <button
                                  type="button"
                                  onClick={() => setEditingPgTarget({ index: idx, question: { ...pg } })}
                                  className="px-2 py-1 rounded-lg hover:bg-indigo-50 text-slate-600 hover:text-indigo-700 text-[11px] font-semibold flex items-center gap-1 transition-colors cursor-pointer border border-slate-200 hover:border-indigo-300"
                                  title="Edit pertanyaan, pilihan jawaban, kunci, atau pembahasan"
                                >
                                  <Edit3 className="w-3.5 h-3.5 text-indigo-600" />
                                  <span className="hidden sm:inline">Edit</span>
                                </button>
                                <button
                                  type="button"
                                  onClick={() => setImageModalTarget({ type: 'pg', index: idx, currentImage: pg.gambar, currentCaption: pg.gambarCaption })}
                                  className="p-1 rounded-lg hover:bg-blue-50 text-slate-500 hover:text-blue-700 text-[11px] font-semibold flex items-center gap-1 transition-colors cursor-pointer"
                                  title="Atur / Tambah Gambar Soal"
                                >
                                  <ImageIcon className="w-3.5 h-3.5" />
                                  <span className="hidden sm:inline">{pg.gambar ? 'Ganti Gbr' : '+ Gbr'}</span>
                                </button>
                                <button
                                  type="button"
                                  onClick={() => handleDeleteQuestion('pg', idx)}
                                  className="p-1 rounded-lg hover:bg-rose-50 text-slate-400 hover:text-rose-600 cursor-pointer"
                                  title="Hapus Butir Soal"
                                >
                                  <Trash2 className="w-3.5 h-3.5" />
                                </button>
                              </div>
                            </div>

                            {/* Question Embedded Image */}
                            {pg.gambar && (
                              <div className="p-3 bg-slate-50 rounded-xl border border-slate-200 flex flex-col items-center">
                                <img
                                  src={pg.gambar}
                                  alt={pg.gambarCaption || 'Ilustrasi Soal'}
                                  className="max-h-56 max-w-full object-contain rounded-lg border border-slate-300 shadow-2xs"
                                />
                                {pg.gambarCaption && (
                                  <span className="text-[11px] text-slate-500 italic mt-1.5 font-medium">
                                    Gambar: {pg.gambarCaption}
                                  </span>
                                )}
                              </div>
                            )}

                            {/* Options */}
                            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-xs pt-1">
                              {(['A', 'B', 'C', 'D'] as const).map((opt) => {
                                const isCorrect = soalViewMode === 'guru' && pg.kunciJawaban === opt;
                                return (
                                  <div
                                    key={opt}
                                    className={`p-2.5 rounded-xl border text-xs flex items-start gap-2 ${
                                      isCorrect
                                        ? 'bg-emerald-50 border-emerald-400 text-emerald-950 font-bold'
                                        : 'bg-slate-50 border-slate-200 text-slate-800'
                                    }`}
                                  >
                                    <span className="font-bold flex-shrink-0">{opt}.</span>
                                    <span>{pg.pilihan[opt]}</span>
                                  </div>
                                );
                              })}
                            </div>

                            {/* Mode Guru Info */}
                            {soalViewMode === 'guru' && (
                              <div className="p-2.5 bg-emerald-50 border border-emerald-200 rounded-xl text-[11px] text-emerald-900 leading-relaxed">
                                <span className="font-bold">Kunci Jawaban: {pg.kunciJawaban}</span>
                                {pg.pembahasan && (
                                  <span className="ml-2">| <strong>Pembahasan:</strong> {pg.pembahasan}</span>
                                )}
                              </div>
                            )}
                          </div>
                        ))}
                      </div>

                      <button
                        type="button"
                        onClick={() => handleAddQuestion('pg')}
                        className="py-2 px-3 border border-dashed border-blue-300 text-blue-700 hover:bg-blue-50 rounded-xl text-xs font-bold flex items-center gap-1.5 cursor-pointer transition-colors"
                      >
                        <Plus className="w-3.5 h-3.5" />
                        <span>Tambah Butir Pilihan Ganda</span>
                      </button>
                    </div>
                  )}

                  {/* Bagian II: Uraian / Esai */}
                  {hasilSoal.esai && hasilSoal.esai.length > 0 && (
                    <div className="space-y-4 pt-3">
                      <div className="flex items-center justify-between border-b border-slate-300 pb-1.5">
                        <h4 className="text-xs font-black uppercase text-slate-900 tracking-wider">
                          II. Jawablah pertanyaan uraian berikut dengan lengkap dan tepat!
                        </h4>
                        <span className="text-[10px] font-bold text-slate-500">
                          {hasilSoal.esai.length} Butir Soal
                        </span>
                      </div>

                      <div className="space-y-4">
                        {hasilSoal.esai.map((es, idx) => (
                          <div key={idx} className="bg-white p-4 rounded-xl border border-slate-200 shadow-2xs space-y-3">
                            <div className="flex items-start justify-between gap-2">
                              <p className="text-xs font-semibold text-slate-900 leading-relaxed flex-1">
                                <span className="font-bold text-blue-700 mr-1">{es.nomor || idx + 1}.</span>
                                {es.pertanyaan}
                              </p>
                              <div className="flex items-center gap-1">
                                <button
                                  type="button"
                                  onClick={() => setImageModalTarget({ type: 'esai', index: idx, currentImage: es.gambar, currentCaption: es.gambarCaption })}
                                  className="p-1 rounded-lg hover:bg-blue-50 text-slate-500 hover:text-blue-700 text-[11px] font-semibold flex items-center gap-1 transition-colors cursor-pointer"
                                  title="Atur / Tambah Gambar Soal"
                                >
                                  <ImageIcon className="w-3.5 h-3.5" />
                                  <span>{es.gambar ? 'Ganti Gambar' : '+ Gambar'}</span>
                                </button>
                                <button
                                  type="button"
                                  onClick={() => handleDeleteQuestion('esai', idx)}
                                  className="p-1 rounded-lg hover:bg-rose-50 text-slate-400 hover:text-rose-600 cursor-pointer"
                                >
                                  <Trash2 className="w-3.5 h-3.5" />
                                </button>
                              </div>
                            </div>

                            {es.gambar && (
                              <div className="p-3 bg-slate-50 rounded-xl border border-slate-200 flex flex-col items-center">
                                <img
                                  src={es.gambar}
                                  alt={es.gambarCaption || 'Ilustrasi Soal Esai'}
                                  className="max-h-56 max-w-full object-contain rounded-lg border border-slate-300 shadow-2xs"
                                />
                              </div>
                            )}

                            {soalViewMode === 'siswa' ? (
                              <div className="h-20 border-b border-dashed border-slate-300"></div>
                            ) : (
                              <div className="p-2.5 bg-blue-50/80 border border-blue-200 rounded-xl text-xs space-y-1 text-slate-800">
                                <div className="font-bold text-blue-900">Kunci Jawaban Ideal Guru:</div>
                                <div className="text-[11px] text-slate-700">{es.kunciJawaban}</div>
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

                      <button
                        type="button"
                        onClick={() => handleAddQuestion('esai')}
                        className="py-2 px-3 border border-dashed border-blue-300 text-blue-700 hover:bg-blue-50 rounded-xl text-xs font-bold flex items-center gap-1.5 cursor-pointer transition-colors"
                      >
                        <Plus className="w-3.5 h-3.5" />
                        <span>Tambah Butir Soal Uraian</span>
                      </button>
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
                  Lengkapi parameter di sebelah kiri lalu klik <strong>"Buat Naskah Soal Ulangan Sekarang"</strong>.
                  Sistem AI akan menyusun soal bergambar lengkap dengan kunci dan rubrik evaluasi.
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
                    <label className="block text-xs font-semibold text-slate-700 mb-1">Kurikulum</label>
                    <select
                      value={modulKurikulum}
                      onChange={(e) => {
                        const val = e.target.value as any;
                        setModulKurikulum(val);
                        setModulJenisDokumen(val === 'Kurikulum 2013' ? 'RPP K13' : 'Modul Ajar');
                      }}
                      className="w-full px-3 py-2 bg-slate-50 border border-slate-300 rounded-xl text-xs font-bold"
                    >
                      <option value="Kurikulum Merdeka">Kurikulum Merdeka (Resmi)</option>
                      <option value="Kurikulum 2013">Kurikulum 2013 (K13)</option>
                    </select>
                  </div>

                  <div>
                    <label className="block text-xs font-semibold text-slate-700 mb-1">Jenis Perangkat</label>
                    <select
                      value={modulJenisDokumen}
                      onChange={(e) => setModulJenisDokumen(e.target.value)}
                      className="w-full px-3 py-2 bg-slate-50 border border-slate-300 rounded-xl text-xs"
                    >
                      {modulKurikulum === 'Kurikulum Merdeka' ? (
                        <>
                          <option value="Modul Ajar">Modul Ajar (Lengkap)</option>
                          <option value="RPP Kurikulum Merdeka">RPP Kurikulum Merdeka</option>
                        </>
                      ) : (
                        <>
                          <option value="RPP K13">RPP K13 Lengkap</option>
                          <option value="RPP 1 Lembar">RPP 1 Lembar (Efektif)</option>
                        </>
                      )}
                    </select>
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-xs font-semibold text-slate-700 mb-1">Mata Pelajaran</label>
                    <input
                      type="text"
                      value={modulMapel}
                      onChange={(e) => setModulMapel(e.target.value)}
                      className="w-full px-3 py-2 bg-slate-50 border border-slate-300 rounded-xl text-xs"
                      required
                    />
                  </div>

                  <div>
                    <label className="block text-xs font-semibold text-slate-700 mb-1">Fase / Kelas</label>
                    <input
                      type="text"
                      value={modulFase}
                      onChange={(e) => setModulFase(e.target.value)}
                      className="w-full px-3 py-2 bg-slate-50 border border-slate-300 rounded-xl text-xs font-bold text-blue-700"
                      required
                    />
                  </div>
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">Materi / Topik Pembelajaran</label>
                  <input
                    type="text"
                    value={modulTopik}
                    onChange={(e) => setModulTopik(e.target.value)}
                    placeholder="Contoh: Siklus Air dan Pelestarian Sumber Daya Alam"
                    className="w-full px-3 py-2 bg-slate-50 border border-slate-300 rounded-xl text-xs"
                    required
                  />
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">Capaian Pembelajaran (CP) / KD</label>
                  <textarea
                    rows={2}
                    value={modulCapaian}
                    onChange={(e) => setModulCapaian(e.target.value)}
                    placeholder="Tuliskan elemen CP atau KD acuan..."
                    className="w-full px-3 py-2 bg-slate-50 border border-slate-300 rounded-xl text-xs"
                  />
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">
                    Dimensi Profil Pelajar Pancasila
                  </label>
                  <div className="flex flex-wrap gap-1.5">
                    {[
                      'Bernalar Kritis',
                      'Gotong Royong',
                      'Mandiri',
                      'Kreatif',
                      'Berkebinekaan Global',
                      'Beriman & Bertakwa',
                    ].map((dim) => {
                      const isSel = selectedProfil.includes(dim);
                      return (
                        <button
                          key={dim}
                          type="button"
                          onClick={() => {
                            if (isSel) setSelectedProfil(selectedProfil.filter((p) => p !== dim));
                            else setSelectedProfil([...selectedProfil, dim]);
                          }}
                          className={`px-2.5 py-1 rounded-lg text-[10px] font-bold border transition-all cursor-pointer ${
                            isSel
                              ? 'bg-blue-600 text-white border-blue-600'
                              : 'bg-slate-50 text-slate-600 border-slate-200 hover:bg-slate-100'
                          }`}
                        >
                          {dim}
                        </button>
                      );
                    })}
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-xs font-semibold text-slate-700 mb-1">Model Pembelajaran</label>
                    <select
                      value={modulModel}
                      onChange={(e) => setModulModel(e.target.value)}
                      className="w-full px-3 py-2 bg-slate-50 border border-slate-300 rounded-xl text-xs"
                    >
                      <option value="Problem Based Learning (PBL)">Problem Based Learning (PBL)</option>
                      <option value="Project Based Learning (PjBL)">Project Based Learning (PjBL)</option>
                      <option value="Inquiry Learning">Inquiry Learning</option>
                      <option value="Discovery Learning">Discovery Learning</option>
                      <option value="TaRL (Teaching at the Right Level)">TaRL Berdiferensiasi</option>
                    </select>
                  </div>

                  <div>
                    <label className="block text-xs font-semibold text-slate-700 mb-1">Alokasi Waktu</label>
                    <input
                      type="text"
                      value={modulWaktu}
                      onChange={(e) => setModulWaktu(e.target.value)}
                      className="w-full px-3 py-2 bg-slate-50 border border-slate-300 rounded-xl text-xs"
                    />
                  </div>
                </div>

                <button
                  type="submit"
                  disabled={isGeneratingModul}
                  className="w-full py-3 bg-gradient-to-r from-blue-700 to-indigo-700 hover:from-blue-800 hover:to-indigo-800 disabled:opacity-50 text-white rounded-xl text-xs font-bold shadow-md flex items-center justify-center gap-2 cursor-pointer transition-all"
                >
                  {isGeneratingModul ? (
                    <>
                      <RefreshCw className="w-4 h-4 animate-spin" />
                      <span>Gemini AI Sedang Menyusun Modul Ajar...</span>
                    </>
                  ) : (
                    <>
                      <Sparkles className="w-4 h-4 text-amber-300" />
                      <span>Susun Modul Ajar Resmi Sekarang</span>
                    </>
                  )}
                </button>
              </form>
            </div>
          </div>

          <div className="lg:col-span-7 space-y-4">
            {hasilModul ? (
              <div className="bg-white rounded-2xl p-6 border border-slate-200 shadow-xs space-y-5">
                <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-200 pb-3">
                  <div>
                    <h4 className="font-extrabold text-sm text-slate-900">{hasilModul.judul}</h4>
                    <p className="text-[11px] text-slate-500">{hasilModul.kurikulum} • {hasilModul.faseKelas}</p>
                  </div>

                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      disabled={isExporting}
                      onClick={handleExportModulDocx}
                      className="px-3 py-1.5 bg-blue-50 hover:bg-blue-100 text-blue-800 border border-blue-200 rounded-xl text-xs font-bold flex items-center gap-1.5 transition-colors cursor-pointer"
                    >
                      <FileDown className="w-3.5 h-3.5 text-blue-600" />
                      <span>Word (.docx)</span>
                    </button>

                    <button
                      type="button"
                      disabled={isExporting}
                      onClick={handleExportModulPdf}
                      className="px-3 py-1.5 bg-rose-50 hover:bg-rose-100 text-rose-800 border border-rose-200 rounded-xl text-xs font-bold flex items-center gap-1.5 transition-colors cursor-pointer"
                    >
                      <FileDown className="w-3.5 h-3.5 text-rose-600" />
                      <span>PDF</span>
                    </button>

                    <button
                      type="button"
                      onClick={() => printElement('modul-ajar-print-doc', hasilModul.judul)}
                      className="px-3 py-1.5 bg-slate-100 hover:bg-slate-200 text-slate-800 rounded-xl text-xs font-bold flex items-center gap-1.5 transition-colors cursor-pointer"
                    >
                      <Printer className="w-3.5 h-3.5" />
                      <span>Cetak</span>
                    </button>
                  </div>
                </div>

                {/* Document Sheet */}
                <div id="modul-ajar-print-doc" className="p-6 bg-slate-50/60 rounded-2xl border border-slate-200 space-y-6 text-slate-900 text-xs">
                  <div className="text-center border-b border-slate-200 pb-4">
                    <h3 className="text-base font-black uppercase text-slate-900">{hasilModul.judul}</h3>
                    <p className="text-blue-800 font-bold mt-0.5">{settings.namaSekolah} • {hasilModul.kurikulum}</p>
                  </div>

                  {/* A. Informasi Umum */}
                  <div className="bg-white p-4 rounded-xl border border-slate-200 space-y-2">
                    <h5 className="font-bold text-xs text-blue-900 border-b pb-1">A. INFORMASI UMUM</h5>
                    <div className="grid grid-cols-2 gap-2 text-[11px]">
                      <div>Penyusun: <strong>{hasilModul.guruName || currentUser.name}</strong></div>
                      <div>Satuan Pendidikan: <strong>{settings.namaSekolah}</strong></div>
                      <div>Mata Pelajaran: <strong>{hasilModul.mataPelajaran}</strong></div>
                      <div>Fase / Kelas: <strong>{hasilModul.faseKelas}</strong></div>
                      <div>Alokasi Waktu: <strong>{hasilModul.alokasiWaktu}</strong></div>
                      <div>Model Pembelajaran: <strong>{hasilModul.modelPembelajaran}</strong></div>
                    </div>
                  </div>

                  {/* B. Tujuan Pembelajaran */}
                  <div className="bg-white p-4 rounded-xl border border-slate-200 space-y-2">
                    <h5 className="font-bold text-xs text-blue-900 border-b pb-1">B. TUJUAN PEMBELAJARAN (TP)</h5>
                    <ul className="list-disc list-inside space-y-1 pl-1 text-[11px] text-slate-800">
                      {hasilModul.tujuanPembelajaran.map((tp, i) => (
                        <li key={i}>{tp}</li>
                      ))}
                    </ul>
                  </div>

                  {/* C. Kegiatan Pembelajaran */}
                  <div className="bg-white p-4 rounded-xl border border-slate-200 space-y-3">
                    <h5 className="font-bold text-xs text-blue-900 border-b pb-1">C. LANGKAH-LANGKAH KEGIATAN PEMBELAJARAN</h5>
                    
                    <div>
                      <strong className="text-blue-800 block mb-1">1. Kegiatan Pendahuluan (10 Menit):</strong>
                      <ul className="list-disc list-inside space-y-1 pl-2 text-[11px] text-slate-700">
                        {hasilModul.kegiatanPembelajaran?.pendahuluan?.map((p, i) => (
                          <li key={i}>{p}</li>
                        ))}
                      </ul>
                    </div>

                    <div>
                      <strong className="text-indigo-800 block mb-1">2. Kegiatan Inti ({hasilModul.modelPembelajaran || 'PBL'}):</strong>
                      <ul className="list-disc list-inside space-y-1 pl-2 text-[11px] text-slate-700">
                        {hasilModul.kegiatanPembelajaran?.inti?.map((p, i) => (
                          <li key={i}>{p}</li>
                        ))}
                      </ul>
                    </div>

                    <div>
                      <strong className="text-emerald-800 block mb-1">3. Kegiatan Penutup (10 Menit):</strong>
                      <ul className="list-disc list-inside space-y-1 pl-2 text-[11px] text-slate-700">
                        {hasilModul.kegiatanPembelajaran?.penutup?.map((p, i) => (
                          <li key={i}>{p}</li>
                        ))}
                      </ul>
                    </div>
                  </div>

                  {/* D. Asesmen */}
                  <div className="bg-white p-4 rounded-xl border border-slate-200 space-y-2 text-[11px]">
                    <h5 className="font-bold text-xs text-blue-900 border-b pb-1">D. ASESMEN PEMBELAJARAN & KKTP</h5>
                    <p>• <strong>Diagnostik:</strong> {hasilModul.asesmen?.diagnostik || '-'}</p>
                    <p>• <strong>Formatif:</strong> {hasilModul.asesmen?.formatif || '-'}</p>
                    <p>• <strong>Sumatif:</strong> {hasilModul.asesmen?.sumatif || '-'}</p>
                    {hasilModul.asesmen?.rubrik && (
                      <p className="pt-1 border-t text-slate-600"><strong>Rubrik Penskoran:</strong> {hasilModul.asesmen.rubrik}</p>
                    )}
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
                  Isi formulir parameter kurikulum di sebelah kiri lalu klik <strong>"Susun Modul Ajar Resmi Sekarang"</strong>.
                </p>
              </div>
            )}
          </div>
        </div>
      )}

      {/* ========================================================================= */}
      {/* 3. BAHAN AJAR & LKPD VISUAL GAMBAR (WAJIB GAMBAR A4) */}
      {/* ========================================================================= */}
      {activeSubTab === 'buat-materi' && (
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
          <div className="lg:col-span-5 space-y-4">
            <div className="bg-white rounded-2xl p-6 border border-slate-200 shadow-xs">
              <div className="flex items-center gap-2 border-b border-slate-100 pb-3 mb-4">
                <ImageIcon className="w-4 h-4 text-blue-700" />
                <h3 className="text-sm font-bold text-slate-900">Parameter Bahan Ajar & LKPD Visual</h3>
              </div>

              <form onSubmit={handleGenerateMateri} className="space-y-4">
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">
                    Jenis Format yang Diinginkan
                  </label>
                  <div className="grid grid-cols-2 gap-2">
                    {[
                      { id: 'lkpd_gambar', label: '⭐ LKPD Visual Gambar (A4)', desc: 'Wajib Gambar Siap Cetak' },
                      { id: 'bahan_plus_lkpd', label: 'Bahan Ajar + LKPD Gambar', desc: 'Rangkuman & Lembar Kerja' },
                      { id: 'ringkasan', label: 'Ringkasan Materi Guru', desc: 'Pedoman Konsep Pengajaran' },
                      { id: 'remedial', label: 'Materi Remedial / Pengayaan', desc: 'Pendampingan Siswa' },
                    ].map((item) => (
                      <button
                        key={item.id}
                        type="button"
                        onClick={() => setMateriTipe(item.id as any)}
                        className={`p-2.5 rounded-xl text-left border transition-all cursor-pointer ${
                          materiTipe === item.id
                            ? 'bg-blue-50 border-blue-600 text-blue-800 shadow-xs'
                            : 'bg-slate-50 border-slate-200 text-slate-600 hover:bg-slate-100'
                        }`}
                      >
                        <div className="text-xs font-bold">{item.label}</div>
                        <div className="text-[10px] text-slate-500 mt-0.5">{item.desc}</div>
                      </button>
                    ))}
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-xs font-semibold text-slate-700 mb-1">Mata Pelajaran</label>
                    <input
                      type="text"
                      value={materiMapel}
                      onChange={(e) => setMateriMapel(e.target.value)}
                      className="w-full px-3 py-2 bg-slate-50 border border-slate-300 rounded-xl text-xs"
                      required
                    />
                  </div>

                  <div>
                    <label className="block text-xs font-semibold text-slate-700 mb-1">Tingkat Kelas</label>
                    <input
                      type="text"
                      value={materiKelas}
                      onChange={(e) => setMateriKelas(e.target.value)}
                      className="w-full px-3 py-2 bg-slate-50 border border-slate-300 rounded-xl text-xs font-bold text-blue-700"
                      required
                    />
                  </div>
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">Materi / Topik Lembar Kerja</label>
                  <textarea
                    rows={2}
                    value={materiTopik}
                    onChange={(e) => setMateriTopik(e.target.value)}
                    placeholder="Contoh: Menghitung Keliling dan Luas Bangun Datar, Bagian-Bagian Tumbuhan"
                    className="w-full px-3 py-2 bg-slate-50 border border-slate-300 rounded-xl text-xs"
                    required
                  />
                  <div className="flex flex-wrap items-center gap-1.5 mt-1.5">
                    <span className="text-[10px] text-slate-400">Pilihan cepat:</span>
                    {['Pecahan & Jam', 'Siklus Air & Hujan', 'Bagian Tubuh Tumbuhan', 'Sila Pancasila & Gotong Royong'].map((t) => (
                      <button
                        key={t}
                        type="button"
                        onClick={() => setMateriTopik(t)}
                        className="px-2 py-0.5 bg-slate-100 hover:bg-blue-50 text-[10px] text-slate-600 rounded-md cursor-pointer"
                      >
                        {t}
                      </button>
                    ))}
                  </div>
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">Tema Desain Visual LKPD</label>
                  <div className="grid grid-cols-4 gap-1.5 text-center">
                    {[
                      { id: 'ceria', label: 'Ceria', color: 'bg-blue-600' },
                      { id: 'saintifik', label: 'Sains', color: 'bg-indigo-700' },
                      { id: 'alam', label: 'Alam', color: 'bg-emerald-600' },
                      { id: 'minimalis', label: 'Formal', color: 'bg-slate-700' },
                    ].map((tm) => (
                      <button
                        key={tm.id}
                        type="button"
                        onClick={() => setMateriTemaVisual(tm.id as any)}
                        className={`p-2 rounded-xl border text-[11px] font-bold cursor-pointer transition-all ${
                          materiTemaVisual === tm.id
                            ? 'bg-blue-50 border-blue-600 text-blue-800 shadow-xs'
                            : 'bg-slate-50 border-slate-200 text-slate-600'
                        }`}
                      >
                        <span className={`w-2.5 h-2.5 rounded-full inline-block mr-1 ${tm.color}`}></span>
                        {tm.label}
                      </button>
                    ))}
                  </div>
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">Instruksi Khusus Guru</label>
                  <input
                    type="text"
                    value={materiCatatan}
                    onChange={(e) => setMateriCatatan(e.target.value)}
                    placeholder="Contoh: Sertakan aktivitas tarik garis dan menghitung objek"
                    className="w-full px-3 py-2 bg-slate-50 border border-slate-300 rounded-xl text-xs"
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
                      <span>Merender Lembar Kerja Visual A4 Beresolusi Tinggi...</span>
                    </>
                  ) : (
                    <>
                      <Sparkles className="w-4 h-4 text-amber-300" />
                      <span>Buat LKPD Gambar Visual Sekarang</span>
                    </>
                  )}
                </button>
              </form>
            </div>
          </div>

          {/* Results: Visual LKPD Image Preview */}
          <div className="lg:col-span-7 space-y-4">
            {hasilMateri ? (
              <div className="bg-white rounded-2xl p-6 border border-slate-200 shadow-xs space-y-5">
                <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-200 pb-3">
                  <div>
                    <div className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full bg-blue-100 text-blue-800 text-[10px] font-bold uppercase tracking-wider">
                      <ImageIcon className="w-3 h-3" />
                      <span>Format Visual Gambar Siap Cetak A4</span>
                    </div>
                    <h4 className="font-extrabold text-sm text-slate-900 mt-1">{hasilMateri.judul}</h4>
                  </div>

                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      disabled={isExporting}
                      onClick={handleExportLkpdDocx}
                      className="px-3 py-1.5 bg-blue-50 hover:bg-blue-100 text-blue-800 border border-blue-200 rounded-xl text-xs font-bold flex items-center gap-1.5 cursor-pointer transition-colors"
                      title="Unduh dokumen Word (.docx) dengan LKPD gambar tertanam"
                    >
                      <FileDown className="w-3.5 h-3.5 text-blue-600" />
                      <span>Word (.docx)</span>
                    </button>

                    <button
                      type="button"
                      disabled={isExporting}
                      onClick={handleExportLkpdPdf}
                      className="px-3 py-1.5 bg-rose-50 hover:bg-rose-100 text-rose-800 border border-rose-200 rounded-xl text-xs font-bold flex items-center gap-1.5 cursor-pointer transition-colors"
                      title="Unduh PDF gabungan halaman"
                    >
                      <FileDown className="w-3.5 h-3.5 text-rose-600" />
                      <span>PDF</span>
                    </button>

                    <button
                      type="button"
                      onClick={handlePrintLkpd}
                      className="px-3 py-1.5 bg-slate-100 hover:bg-slate-200 text-slate-800 rounded-xl text-xs font-bold flex items-center gap-1.5 cursor-pointer transition-colors"
                    >
                      <Printer className="w-3.5 h-3.5" />
                      <span>Cetak A4</span>
                    </button>
                  </div>
                </div>

                {/* Multi-page switcher & download per page */}
                {hasilMateri.lkpdData && (
                  <div className="flex items-center justify-between bg-slate-50 p-3 rounded-xl border border-slate-200">
                    <div className="flex items-center gap-2">
                      <span className="text-xs font-bold text-slate-700">Pilih Halaman:</span>
                      {hasilMateri.lkpdData.halamanList.map((hal) => (
                        <button
                          key={hal.nomorHalaman}
                          type="button"
                          onClick={() => setActiveLkpdPage(hal.nomorHalaman)}
                          className={`px-3 py-1 rounded-lg text-xs font-bold cursor-pointer transition-all ${
                            activeLkpdPage === hal.nomorHalaman
                              ? 'bg-blue-700 text-white shadow-xs'
                              : 'bg-white text-slate-700 border border-slate-200 hover:bg-slate-100'
                          }`}
                        >
                          Halaman {hal.nomorHalaman}
                        </button>
                      ))}
                    </div>

                    <button
                      type="button"
                      onClick={() => handleDownloadLkpdPng(activeLkpdPage)}
                      className="px-3 py-1.5 bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg text-xs font-bold flex items-center gap-1.5 shadow-xs cursor-pointer transition-colors"
                    >
                      <Download className="w-3.5 h-3.5" />
                      <span>Unduh Gambar PNG (Hal {activeLkpdPage})</span>
                    </button>
                  </div>
                )}

                {/* Visual Image Render Display */}
                {hasilMateri.lkpdData && (
                  <div id="lkpd-visual-sheet" className="space-y-4">
                    {hasilMateri.lkpdData.halamanList
                      .filter((h) => h.nomorHalaman === activeLkpdPage)
                      .map((halaman) => (
                        <div key={halaman.nomorHalaman} className="space-y-4">
                          {/* Real Crisp A4 PNG Image Preview */}
                          <div className="bg-slate-900/5 p-4 rounded-2xl border border-slate-200/80 flex flex-col items-center shadow-inner">
                            {halaman.pngDataUri ? (
                              <div className="relative group max-w-full">
                                <img
                                  src={halaman.pngDataUri}
                                  alt={`LKPD Halaman ${halaman.nomorHalaman}`}
                                  className="w-full max-w-[620px] rounded-lg shadow-xl border border-slate-300 bg-white"
                                />
                                <div className="absolute top-3 right-3 opacity-0 group-hover:opacity-100 transition-opacity">
                                  <button
                                    type="button"
                                    onClick={() => handleDownloadLkpdPng(halaman.nomorHalaman)}
                                    className="p-2 bg-slate-900/80 hover:bg-slate-900 text-white rounded-xl shadow-lg text-xs font-bold flex items-center gap-1 cursor-pointer"
                                  >
                                    <Download className="w-4 h-4" />
                                    <span>Simpan PNG</span>
                                  </button>
                                </div>
                              </div>
                            ) : (
                              <div className="p-8 text-center text-xs text-slate-500">
                                Gambar sedang dirender...
                              </div>
                            )}
                          </div>

                          {/* Editable Activities Controller for this page */}
                          <div className="p-4 bg-blue-50/50 rounded-xl border border-blue-200/70 space-y-3">
                            <div className="flex items-center justify-between">
                              <h5 className="font-bold text-xs text-blue-950 flex items-center gap-1.5">
                                <Edit3 className="w-3.5 h-3.5 text-blue-700" />
                                <span>Sesuaikan Konten & Ilustrasi Lembar Kerja Halaman {halaman.nomorHalaman}</span>
                              </h5>
                              {isReRenderingLkpd && (
                                <span className="text-[10px] text-blue-700 font-bold flex items-center gap-1 animate-pulse">
                                  <RefreshCw className="w-3 h-3 animate-spin" /> Merender ulang...
                                </span>
                              )}
                            </div>

                            <div className="space-y-3">
                              {halaman.aktivitas.map((act, actIdx) => (
                                <div key={act.id || actIdx} className="bg-white p-3 rounded-lg border border-slate-200 space-y-2 text-xs">
                                  <div className="flex items-center justify-between">
                                    <span className="font-bold text-blue-700">Aktivitas #{act.nomor} ({act.tipe})</span>
                                    <button
                                      type="button"
                                      onClick={() => setLkpdImageModalTarget({ halamanIndex: halaman.nomorHalaman - 1, aktivitasIndex: actIdx })}
                                      className="text-[11px] font-semibold text-blue-700 hover:text-blue-900 flex items-center gap-1 cursor-pointer"
                                    >
                                      <ImageIcon className="w-3 h-3" />
                                      <span>{act.gambar ? 'Ganti Ilustrasi' : '+ Tambah Ilustrasi'}</span>
                                    </button>
                                  </div>

                                  <input
                                    type="text"
                                    value={act.instruksi}
                                    onChange={(e) => {
                                      const lkpdCopy = JSON.parse(JSON.stringify(hasilMateri.lkpdData)) as LkpdData;
                                      lkpdCopy.halamanList[halaman.nomorHalaman - 1].aktivitas[actIdx].instruksi = e.target.value;
                                      reRenderLkpd(lkpdCopy);
                                    }}
                                    className="w-full px-2 py-1 bg-slate-50 border rounded-lg text-xs"
                                    placeholder="Instruksi pengerjaan aktivitas..."
                                  />
                                </div>
                              ))}
                            </div>
                          </div>
                        </div>
                      ))}
                  </div>
                )}

                {/* Formatted Markdown Content if type is bahan_plus_lkpd or ringkasan */}
                {hasilMateri.isiMarkdown && (
                  <div className="p-4 bg-slate-50 rounded-xl border border-slate-200 space-y-2">
                    <h5 className="font-bold text-xs text-slate-800 border-b pb-1">Naskah Ringkasan & Panduan Konsep</h5>
                    <div className="prose prose-xs max-w-none text-slate-700">
                      <Markdown>{hasilMateri.isiMarkdown}</Markdown>
                    </div>
                  </div>
                )}
              </div>
            ) : (
              <div className="bg-white rounded-2xl p-12 border border-slate-200 text-center shadow-xs">
                <div className="w-16 h-16 bg-blue-50 text-blue-700 rounded-2xl flex items-center justify-center mx-auto mb-4 border border-blue-100">
                  <ImageIcon className="w-8 h-8 text-blue-600" />
                </div>
                <h4 className="text-base font-bold text-slate-900">LKPD Visual Belum Dibuat</h4>
                <p className="text-xs text-slate-500 max-w-md mx-auto mt-1 leading-relaxed">
                  Tentukan topik materi pembelajaran lalu klik <strong>"Buat LKPD Gambar Visual Sekarang"</strong>.
                  Sistem akan menghasilkan lembar kerja interaktif berbasis gambar beresolusi tinggi ukuran A4 yang siap diunduh dan dicetak.
                </p>
              </div>
            )}
          </div>
        </div>
      )}

      {/* ========================================================================= */}
      {/* 4. BANK DOKUMEN TERSIMPAN */}
      {/* ========================================================================= */}
      {activeSubTab === 'bank-tersimpan' && (
        <div className="bg-white rounded-2xl p-6 border border-slate-200 shadow-xs space-y-6">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-slate-200 pb-4">
            <div>
              <h3 className="text-base font-bold text-slate-900">Bank Naskah Soal & Dokumen Tersimpan</h3>
              <p className="text-xs text-slate-500">
                Semua dokumen tersimpan permanen di basis data sekolah dan dapat dipanggil kembali sewaktu-waktu.
              </p>
            </div>

            <div className="flex items-center gap-2">
              <div className="relative">
                <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
                <input
                  type="text"
                  value={bankSearch}
                  onChange={(e) => setBankSearch(e.target.value)}
                  placeholder="Cari dokumen..."
                  className="pl-9 pr-3 py-1.5 bg-slate-50 border border-slate-300 rounded-xl text-xs focus:bg-white w-48 sm:w-64"
                />
              </div>

              <select
                value={bankFilter}
                onChange={(e) => setBankFilter(e.target.value as any)}
                className="px-3 py-1.5 bg-slate-50 border border-slate-300 rounded-xl text-xs font-semibold"
              >
                <option value="semua">Semua Dokumen</option>
                <option value="soal">Naskah Soal</option>
                <option value="modul">Modul Ajar</option>
                <option value="materi">Bahan Ajar / LKPD</option>
              </select>
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {/* Soal List */}
            {(bankFilter === 'semua' || bankFilter === 'soal') &&
              savedSoalList
                .filter((s) => !bankSearch || s.judul.toLowerCase().includes(bankSearch.toLowerCase()) || s.mataPelajaran.toLowerCase().includes(bankSearch.toLowerCase()))
                .map((soal) => (
                  <div key={soal.id} className="p-4 rounded-xl border border-slate-200 hover:border-blue-400 bg-white transition-all shadow-2xs space-y-3 flex flex-col justify-between">
                    <div>
                      <div className="flex items-center justify-between gap-2">
                        <span className="px-2 py-0.5 bg-blue-100 text-blue-800 rounded-md text-[10px] font-bold uppercase">
                          Soal Ulangan
                        </span>
                        <span className="text-[10px] text-slate-400">
                          {new Date(soal.createdAt).toLocaleDateString('id-ID')}
                        </span>
                      </div>
                      <h5 className="font-bold text-xs text-slate-900 mt-2 line-clamp-2">{soal.judul}</h5>
                      <p className="text-[11px] text-slate-500 mt-1">
                        {soal.mataPelajaran} • Kelas {soal.kelas} • {soal.pilihanGanda.length} PG & {soal.esai.length} Esai
                      </p>
                    </div>

                    <div className="flex items-center justify-between pt-2 border-t border-slate-100">
                      <button
                        type="button"
                        onClick={() => {
                          setHasilSoal(soal);
                          setActiveSubTab('buat-soal');
                        }}
                        className="text-xs font-bold text-blue-700 hover:text-blue-900 flex items-center gap-1 cursor-pointer"
                      >
                        <Eye className="w-3.5 h-3.5" />
                        <span>Buka Soal</span>
                      </button>

                      <button
                        type="button"
                        onClick={() => setDeleteConfirm({ type: 'soal', id: soal.id, title: soal.judul })}
                        className="p-1 text-slate-400 hover:text-rose-600 rounded-md cursor-pointer"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </div>
                  </div>
                ))}

            {/* Modul List */}
            {(bankFilter === 'semua' || bankFilter === 'modul') &&
              savedModulList
                .filter((m) => !bankSearch || m.judul.toLowerCase().includes(bankSearch.toLowerCase()) || m.mataPelajaran.toLowerCase().includes(bankSearch.toLowerCase()))
                .map((modul) => (
                  <div key={modul.id} className="p-4 rounded-xl border border-slate-200 hover:border-indigo-400 bg-white transition-all shadow-2xs space-y-3 flex flex-col justify-between">
                    <div>
                      <div className="flex items-center justify-between gap-2">
                        <span className="px-2 py-0.5 bg-indigo-100 text-indigo-800 rounded-md text-[10px] font-bold uppercase">
                          Modul Ajar
                        </span>
                        <span className="text-[10px] text-slate-400">
                          {new Date(modul.createdAt).toLocaleDateString('id-ID')}
                        </span>
                      </div>
                      <h5 className="font-bold text-xs text-slate-900 mt-2 line-clamp-2">{modul.judul}</h5>
                      <p className="text-[11px] text-slate-500 mt-1">
                        {modul.mataPelajaran} • {modul.faseKelas}
                      </p>
                    </div>

                    <div className="flex items-center justify-between pt-2 border-t border-slate-100">
                      <button
                        type="button"
                        onClick={() => {
                          setHasilModul(modul);
                          setActiveSubTab('buat-modul');
                        }}
                        className="text-xs font-bold text-indigo-700 hover:text-indigo-900 flex items-center gap-1 cursor-pointer"
                      >
                        <Eye className="w-3.5 h-3.5" />
                        <span>Buka Modul</span>
                      </button>

                      <button
                        type="button"
                        onClick={() => setDeleteConfirm({ type: 'modul', id: modul.id, title: modul.judul })}
                        className="p-1 text-slate-400 hover:text-rose-600 rounded-md cursor-pointer"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </div>
                  </div>
                ))}

            {/* Materi & LKPD List */}
            {(bankFilter === 'semua' || bankFilter === 'materi') &&
              savedMateriList
                .filter((mat) => !bankSearch || mat.judul.toLowerCase().includes(bankSearch.toLowerCase()) || mat.topikMateri.toLowerCase().includes(bankSearch.toLowerCase()))
                .map((materi) => (
                  <div key={materi.id} className="p-4 rounded-xl border border-slate-200 hover:border-emerald-400 bg-white transition-all shadow-2xs space-y-3 flex flex-col justify-between">
                    <div>
                      <div className="flex items-center justify-between gap-2">
                        <span className="px-2 py-0.5 bg-emerald-100 text-emerald-800 rounded-md text-[10px] font-bold uppercase">
                          {materi.tipe === 'lkpd_gambar' ? 'LKPD Visual' : materi.tipe}
                        </span>
                        <span className="text-[10px] text-slate-400">
                          {new Date(materi.createdAt).toLocaleDateString('id-ID')}
                        </span>
                      </div>
                      <h5 className="font-bold text-xs text-slate-900 mt-2 line-clamp-2">{materi.judul}</h5>
                      <p className="text-[11px] text-slate-500 mt-1">
                        {materi.mataPelajaran} • Kelas {materi.kelas}
                      </p>
                    </div>

                    <div className="flex items-center justify-between pt-2 border-t border-slate-100">
                      <button
                        type="button"
                        onClick={() => {
                          setHasilMateri(materi);
                          setActiveSubTab('buat-materi');
                        }}
                        className="text-xs font-bold text-emerald-700 hover:text-emerald-900 flex items-center gap-1 cursor-pointer"
                      >
                        <Eye className="w-3.5 h-3.5" />
                        <span>Buka LKPD</span>
                      </button>

                      <button
                        type="button"
                        onClick={() => setDeleteConfirm({ type: 'materi', id: materi.id, title: materi.judul })}
                        className="p-1 text-slate-400 hover:text-rose-600 rounded-md cursor-pointer"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </div>
                  </div>
                ))}
          </div>
        </div>
      )}

      {/* ========================================================================= */}
      {/* MODAL 0: EDIT MANUAL BUTIR SOAL PILIHAN GANDA */}
      {/* ========================================================================= */}
      {editingPgTarget && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-xs animate-in fade-in">
          <div className="bg-white rounded-2xl max-w-2xl w-full p-6 shadow-2xl border border-slate-200 space-y-4 max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between border-b pb-3">
              <h4 className="font-bold text-sm text-slate-900 flex items-center gap-2">
                <Edit3 className="w-4 h-4 text-indigo-700" />
                <span>Edit Butir Soal #{editingPgTarget.index + 1}</span>
              </h4>
              <button
                type="button"
                onClick={() => setEditingPgTarget(null)}
                className="text-slate-400 hover:text-slate-600 cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="space-y-3">
              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">Teks Pertanyaan</label>
                <textarea
                  rows={3}
                  value={editingPgTarget.question.pertanyaan}
                  onChange={(e) =>
                    setEditingPgTarget({
                      ...editingPgTarget,
                      question: { ...editingPgTarget.question, pertanyaan: e.target.value },
                    })
                  }
                  className="w-full px-3 py-2 bg-slate-50 border border-slate-300 rounded-xl text-xs focus:bg-white leading-relaxed"
                />
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                {(['A', 'B', 'C', 'D'] as const).map((opt) => (
                  <div key={opt}>
                    <label className="block text-[11px] font-bold text-slate-600 mb-1">Pilihan {opt}</label>
                    <input
                      type="text"
                      value={editingPgTarget.question.pilihan[opt] || ''}
                      onChange={(e) =>
                        setEditingPgTarget({
                          ...editingPgTarget,
                          question: {
                            ...editingPgTarget.question,
                            pilihan: {
                              ...editingPgTarget.question.pilihan,
                              [opt]: e.target.value,
                            },
                          },
                        })
                      }
                      className="w-full px-3 py-1.5 bg-slate-50 border border-slate-300 rounded-xl text-xs focus:bg-white"
                    />
                  </div>
                ))}
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">Kunci Jawaban</label>
                  <select
                    value={editingPgTarget.question.kunciJawaban}
                    onChange={(e) =>
                      setEditingPgTarget({
                        ...editingPgTarget,
                        question: { ...editingPgTarget.question, kunciJawaban: e.target.value },
                      })
                    }
                    className="w-full px-3 py-2 bg-slate-50 border border-slate-300 rounded-xl text-xs font-bold focus:bg-white"
                  >
                    <option value="A">A</option>
                    <option value="B">B</option>
                    <option value="C">C</option>
                    <option value="D">D</option>
                  </select>
                </div>
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">Pembahasan / Penjelasan</label>
                <textarea
                  rows={2}
                  value={editingPgTarget.question.pembahasan || ''}
                  onChange={(e) =>
                    setEditingPgTarget({
                      ...editingPgTarget,
                      question: { ...editingPgTarget.question, pembahasan: e.target.value },
                    })
                  }
                  className="w-full px-3 py-2 bg-slate-50 border border-slate-300 rounded-xl text-xs focus:bg-white leading-relaxed"
                />
              </div>
            </div>

            <div className="flex items-center justify-end gap-2.5 pt-3 border-t">
              <button
                type="button"
                onClick={() => setEditingPgTarget(null)}
                className="px-4 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-bold rounded-xl transition cursor-pointer"
              >
                Batal
              </button>
              <button
                type="button"
                onClick={() => handleSaveEditedPg(editingPgTarget.question, editingPgTarget.index)}
                className="px-5 py-2 bg-indigo-700 hover:bg-indigo-800 text-white text-xs font-bold rounded-xl shadow-xs transition cursor-pointer flex items-center gap-1.5"
              >
                <Check className="w-4 h-4" />
                <span>Simpan Perubahan</span>
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ========================================================================= */}
      {/* MODAL 1: GANTI / UNGGAH GAMBAR PADA SOAL ULANGAN */}
      {/* ========================================================================= */}
      {imageModalTarget && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-xs animate-in fade-in">
          <div className="bg-white rounded-2xl max-w-xl w-full p-6 shadow-2xl border border-slate-200 space-y-4 max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between border-b pb-3">
              <h4 className="font-bold text-sm text-slate-900 flex items-center gap-2">
                <ImageIcon className="w-4 h-4 text-blue-700" />
                <span>Pengaturan Gambar Soal #{imageModalTarget.index + 1}</span>
              </h4>
              <button
                type="button"
                onClick={() => setImageModalTarget(null)}
                className="text-slate-400 hover:text-slate-600 cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Unggah File Sendiri */}
            <div className="p-4 bg-blue-50/60 rounded-xl border border-blue-200/80 space-y-2">
              <h5 className="font-bold text-xs text-blue-900">Unggah Gambar / Diagram dari Komputer / HP</h5>
              <p className="text-[11px] text-slate-600">
                Pilih foto diagram, bangun, atau dokumen nyata dari perangkat Anda (PNG, JPG, SVG).
              </p>
              <input
                ref={fileInputRef}
                type="file"
                accept="image/*"
                onChange={handleUploadImageSoal}
                className="hidden"
              />
              <button
                type="button"
                onClick={() => fileInputRef.current?.click()}
                className="px-4 py-2 bg-blue-700 hover:bg-blue-800 text-white rounded-xl text-xs font-bold flex items-center gap-2 cursor-pointer transition-colors shadow-xs"
              >
                <Upload className="w-4 h-4" />
                <span>Pilih Berkas Gambar</span>
              </button>
            </div>

            {/* Pilihan Koleksi Ilustrasi Edukatif Terintegrasi */}
            <div className="space-y-2">
              <h5 className="font-bold text-xs text-slate-900">Atau Pilih dari Koleksi Gambar Edukatif:</h5>
              <div className="grid grid-cols-3 gap-2.5 max-h-56 overflow-y-auto p-1">
                {CURATED_ILLUSTRATIONS.map((ill) => (
                  <button
                    key={ill.id}
                    type="button"
                    onClick={() => {
                      updateSoalImage(imageModalTarget.type, imageModalTarget.index, ill.dataUri, ill.title);
                      setImageModalTarget(null);
                    }}
                    className="p-2 rounded-xl border border-slate-200 hover:border-blue-600 hover:bg-blue-50 transition-all text-left flex flex-col items-center gap-1.5 cursor-pointer bg-white"
                  >
                    <img src={ill.dataUri} alt={ill.title} className="h-16 w-full object-contain" />
                    <span className="text-[10px] font-bold text-slate-800 text-center line-clamp-1">{ill.title}</span>
                  </button>
                ))}
              </div>
            </div>

            {/* Hapus Gambar */}
            {imageModalTarget.currentImage && (
              <div className="pt-2 border-t flex justify-end">
                <button
                  type="button"
                  onClick={() => {
                    updateSoalImage(imageModalTarget.type, imageModalTarget.index, undefined);
                    setImageModalTarget(null);
                  }}
                  className="px-3 py-1.5 bg-rose-50 hover:bg-rose-100 text-rose-700 rounded-xl text-xs font-bold flex items-center gap-1.5 cursor-pointer"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                  <span>Hapus Gambar dari Soal Ini</span>
                </button>
              </div>
            )}
          </div>
        </div>
      )}

      {/* ========================================================================= */}
      {/* MODAL 2: GANTI / UNGGAH ILUSTRASI PADA LKPD */}
      {/* ========================================================================= */}
      {lkpdImageModalTarget && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-xs animate-in fade-in">
          <div className="bg-white rounded-2xl max-w-xl w-full p-6 shadow-2xl border border-slate-200 space-y-4 max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between border-b pb-3">
              <h4 className="font-bold text-sm text-slate-900 flex items-center gap-2">
                <ImageIcon className="w-4 h-4 text-blue-700" />
                <span>Ubah Ilustrasi Aktivitas LKPD</span>
              </h4>
              <button
                type="button"
                onClick={() => setLkpdImageModalTarget(null)}
                className="text-slate-400 hover:text-slate-600 cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="p-4 bg-blue-50/60 rounded-xl border border-blue-200/80 space-y-2">
              <h5 className="font-bold text-xs text-blue-900">Unggah Ilustrasi Baru dari HP / Laptop</h5>
              <input
                ref={lkpdFileInputRef}
                type="file"
                accept="image/*"
                onChange={handleUploadImageLkpd}
                className="hidden"
              />
              <button
                type="button"
                onClick={() => lkpdFileInputRef.current?.click()}
                className="px-4 py-2 bg-blue-700 hover:bg-blue-800 text-white rounded-xl text-xs font-bold flex items-center gap-2 cursor-pointer transition-colors shadow-xs"
              >
                <Upload className="w-4 h-4" />
                <span>Pilih Foto dari Perangkat</span>
              </button>
            </div>

            <div className="space-y-2">
              <h5 className="font-bold text-xs text-slate-900">Pilih dari Koleksi Grafis Edukatif Siap Pakai:</h5>
              <div className="grid grid-cols-3 gap-2.5 max-h-56 overflow-y-auto p-1">
                {CURATED_ILLUSTRATIONS.map((ill) => (
                  <button
                    key={ill.id}
                    type="button"
                    onClick={async () => {
                      if (!hasilMateri?.lkpdData) return;
                      const lkpdCopy = JSON.parse(JSON.stringify(hasilMateri.lkpdData)) as LkpdData;
                      const page = lkpdCopy.halamanList[lkpdImageModalTarget.halamanIndex];
                      if (page && page.aktivitas[lkpdImageModalTarget.aktivitasIndex]) {
                        page.aktivitas[lkpdImageModalTarget.aktivitasIndex].gambar = ill.dataUri;
                        page.aktivitas[lkpdImageModalTarget.aktivitasIndex].gambarCaption = ill.title;
                        await reRenderLkpd(lkpdCopy);
                      }
                      setLkpdImageModalTarget(null);
                    }}
                    className="p-2 rounded-xl border border-slate-200 hover:border-blue-600 hover:bg-blue-50 transition-all text-left flex flex-col items-center gap-1.5 cursor-pointer bg-white"
                  >
                    <img src={ill.dataUri} alt={ill.title} className="h-16 w-full object-contain" />
                    <span className="text-[10px] font-bold text-slate-800 text-center line-clamp-1">{ill.title}</span>
                  </button>
                ))}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Modal Dialog Konfirmasi Hapus Dokumen */}
      {deleteConfirm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-xs animate-in fade-in">
          <div className="bg-white rounded-2xl max-w-md w-full p-6 shadow-2xl border border-slate-200 space-y-4">
            <div className="w-12 h-12 rounded-2xl bg-rose-100 text-rose-600 flex items-center justify-center mx-auto">
              <Trash2 className="w-6 h-6" />
            </div>
            <div className="text-center space-y-1.5">
              <h4 className="text-base font-bold text-slate-900">Konfirmasi Hapus Dokumen</h4>
              <p className="text-xs text-slate-600 leading-relaxed">
                Apakah Anda yakin ingin menghapus <strong>"{deleteConfirm.title}"</strong> dari Bank Data?
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
                Ya, Hapus
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
