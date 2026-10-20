import React, { useState, useEffect, useMemo, useRef } from 'react';
import QRCode from 'qrcode';
import * as XLSX from 'xlsx';
import { db } from '../../services/database';
import {
  safeFetchJson,
  extractDocxInBrowser,
  parseQuestionsWithRegex,
} from '../../utils/apiHelper';
import {
  User,
  UjianOnline,
  SoalUjian,
  JawabanSiswaUjian,
  Siswa,
  Kelas,
  MataPelajaran,
  JenisSoal,
  StatusUjian,
  LogPelanggaranUjian,
} from '../../types';
import {
  FileText,
  Plus,
  Upload,
  Calendar,
  Clock,
  CheckCircle2,
  AlertCircle,
  Copy,
  QrCode,
  Download,
  Printer,
  Trash2,
  Edit,
  Eye,
  FileSpreadsheet,
  Search,
  Filter,
  Check,
  ChevronDown,
  X,
  HelpCircle,
  Sparkles,
  Shuffle,
  ShieldCheck,
  FileQuestion,
  Users,
  Award,
  Layers,
  ArrowUpDown,
  History,
  Image as ImageIcon,
  Save,
  RefreshCw,
  ExternalLink,
  ShieldAlert,
  Unlock,
  Lock,
  AlertTriangle,
  Radio,
  UserX,
} from 'lucide-react';
import { PrintRekapModal } from './PrintRekapModal';

interface UjianOnlineAdminProps {
  currentUser: User;
}

export const UjianOnlineAdmin: React.FC<UjianOnlineAdminProps> = ({ currentUser }) => {
  // Main view navigation: 'list' | 'form' | 'rekap' | 'pengawasan'
  const [view, setView] = useState<'list' | 'form' | 'rekap' | 'pengawasan'>('list');

  // Exam list data & filter
  const [ujianList, setUjianList] = useState<UjianOnline[]>([]);
  const [selectedFilterStatus, setSelectedFilterStatus] = useState<string>('semua');
  const [showPrintRekapModal, setShowPrintRekapModal] = useState<boolean>(false);
  const [selectedFilterKelas, setSelectedFilterKelas] = useState<string>('semua');
  const [searchExamQuery, setSearchExamQuery] = useState<string>('');

  // Active exam being edited or inspected
  const [activeUjian, setActiveUjian] = useState<UjianOnline | null>(null);

  // Available school data (classes, subjects, students)
  const [allKelas, setAllKelas] = useState<Kelas[]>([]);
  const [allMapel, setAllMapel] = useState<MataPelajaran[]>([]);
  const [allSiswa, setAllSiswa] = useState<Siswa[]>([]);

  // Modals state
  const [showShareModal, setShowShareModal] = useState<boolean>(false);
  const [shareUjianTarget, setShareUjianTarget] = useState<UjianOnline | null>(null);
  const [copyFeedback, setCopyFeedback] = useState<boolean>(false);
  const qrCanvasRef = useRef<HTMLCanvasElement | null>(null);

  // Import Word / PDF modal
  const [showImportModal, setShowImportModal] = useState<boolean>(false);
  const [importFile, setImportFile] = useState<File | null>(null);
  const [importLoading, setImportLoading] = useState<boolean>(false);
  const [importStep, setImportStep] = useState<'upload' | 'preview'>('upload');
  const [importResult, setImportResult] = useState<{
    judul?: string;
    mataPelajaran?: string;
    kelas?: string;
    soalList: SoalUjian[];
    totalSoal: number;
    rawText?: string;
    fileBase64?: string;
    fileName?: string;
  } | null>(null);
  const [importError, setImportError] = useState<string | null>(null);

  // Manual Question editor modal
  const [showQuestionModal, setShowQuestionModal] = useState<boolean>(false);
  const [editingQuestion, setEditingQuestion] = useState<SoalUjian | null>(null);

  // Rekap Nilai view state
  const [rekapUjianTarget, setRekapUjianTarget] = useState<UjianOnline | null>(null);
  const [jawabanList, setJawabanList] = useState<JawabanSiswaUjian[]>([]);
  const [rekapSearch, setRekapSearch] = useState<string>('');
  const [rekapFilterStatus, setRekapFilterStatus] = useState<string>('semua');
  const [selectedJawabanSiswa, setSelectedJawabanSiswa] = useState<JawabanSiswaUjian | null>(null);
  const [showReviewJawabanModal, setShowReviewJawabanModal] = useState<boolean>(false);

  // Proctoring / Pengawasan state
  const [pengawasanUjianTarget, setPengawasanUjianTarget] = useState<UjianOnline | null>(null);
  const [proctoringSearch, setProctoringSearch] = useState<string>('');
  const [proctoringFilterStatus, setProctoringFilterStatus] = useState<string>('semua');
  const [selectedViolationStudent, setSelectedViolationStudent] = useState<{
    siswa: Siswa;
    jawaban: JawabanSiswaUjian;
  } | null>(null);
  const [showViolationLogModal, setShowViolationLogModal] = useState<boolean>(false);

  // Key correction audit modal
  const [showKeyCorrectionModal, setShowKeyCorrectionModal] = useState<boolean>(false);
  const [targetCorrectionSoal, setTargetCorrectionSoal] = useState<SoalUjian | null>(null);
  const [newKeyInput, setNewKeyInput] = useState<string>('');
  const [correctionReason, setCorrectionReason] = useState<string>('');

  // Initial load
  useEffect(() => {
    loadAllData();

    const handleDataUpdate = () => {
      loadAllData();
      if (rekapUjianTarget) {
        setJawabanList(db.getJawabanUjianList(rekapUjianTarget.id));
      }
      if (pengawasanUjianTarget) {
        setJawabanList(db.getJawabanUjianList(pengawasanUjianTarget.id));
      }
    };

    window.addEventListener('ujian_online_updated', handleDataUpdate);
    window.addEventListener('data_ujian_online_changed', handleDataUpdate);
    window.addEventListener('jawaban_ujian_updated', handleDataUpdate);
    window.addEventListener('data_jawaban_ujian_changed', handleDataUpdate);

    // Auto-polling for proctoring monitoring
    const proctorInterval = setInterval(() => {
      if (view === 'pengawasan' && pengawasanUjianTarget) {
        setJawabanList(db.getJawabanUjianList(pengawasanUjianTarget.id));
      }
    }, 4000);

    return () => {
      window.removeEventListener('ujian_online_updated', handleDataUpdate);
      window.removeEventListener('data_ujian_online_changed', handleDataUpdate);
      window.removeEventListener('jawaban_ujian_updated', handleDataUpdate);
      window.removeEventListener('data_jawaban_ujian_changed', handleDataUpdate);
      clearInterval(proctorInterval);
    };
  }, [rekapUjianTarget, pengawasanUjianTarget, view]);

  const loadAllData = () => {
    const list = db.getUjianOnlineList();
    setUjianList(list);
    setAllKelas(db.getKelas());
    setAllMapel(db.getMataPelajaran());
    setAllSiswa(db.getSiswa());

    // Default target for proctoring or rekap if none selected
    if (!pengawasanUjianTarget && list.length > 0) {
      const activeOne = list.find((u) => u.status === 'aktif') || list[0];
      setPengawasanUjianTarget(activeOne);
    }
    if (!rekapUjianTarget && list.length > 0) {
      setRekapUjianTarget(list[0]);
    }
  };

  // Render QR Code in modal whenever target changes
  useEffect(() => {
    if (showShareModal && shareUjianTarget && qrCanvasRef.current) {
      const schoolId = shareUjianTarget.schoolId || db.getActiveSchoolId();
      const examUrl = `${window.location.origin}/#ujian/${shareUjianTarget.id}?school=${schoolId}`;
      QRCode.toCanvas(qrCanvasRef.current, examUrl, {
        width: 220,
        margin: 2,
        color: {
          dark: '#0f172a',
          light: '#ffffff',
        },
      });
    }
  }, [showShareModal, shareUjianTarget]);

  // Exam Filtering
  const filteredExams = useMemo(() => {
    return ujianList.filter((exam) => {
      // Status filter
      if (selectedFilterStatus !== 'semua' && exam.status !== selectedFilterStatus) {
        return false;
      }

      // Class filter
      if (selectedFilterKelas !== 'semua') {
        const matchesClass = exam.kelasTarget.some(
          (k) => k.toLowerCase() === selectedFilterKelas.toLowerCase() || k === 'Semua Siswa'
        );
        if (!matchesClass) return false;
      }

      // Search filter
      if (searchExamQuery.trim()) {
        const q = searchExamQuery.toLowerCase();
        return (
          exam.judul.toLowerCase().includes(q) ||
          exam.mataPelajaran.toLowerCase().includes(q) ||
          exam.guruNama.toLowerCase().includes(q) ||
          (exam.kodeUjian && exam.kodeUjian.toLowerCase().includes(q))
        );
      }

      return true;
    });
  }, [ujianList, selectedFilterStatus, selectedFilterKelas, searchExamQuery]);

  // Handle open create exam
  const handleOpenCreateExam = () => {
    const now = new Date();
    const startTime = now.toISOString().slice(0, 16);
    const endTime = new Date(now.getTime() + 48 * 60 * 60 * 1000).toISOString().slice(0, 16);

    const newExam: UjianOnline = {
      id: `cbt-${Date.now()}`,
      schoolId: db.getActiveSchoolId(),
      judul: '',
      deskripsi: '',
      mataPelajaran: allMapel.length > 0 ? allMapel[0].nama : 'Tematik Umum',
      guruId: currentUser.guruId || currentUser.id,
      guruNama: currentUser.name,
      kelasTarget: allKelas.length > 0 ? [allKelas[0].nama] : ['Kelas 1A'],
      semester: 'Genap',
      tahunAjaran: '2024/2025',
      jenisUjian: 'Penilaian Tengah Semester (PTS/STS)',
      status: 'draf',
      tanggalMulai: startTime,
      tanggalSelesai: endTime,
      durasiMenit: 60,
      jumlahPercobaan: 1,
      acakSoal: true,
      acakPilihan: true,
      tampilkanNilaiLangsung: true,
      tampilkanPembahasan: 'setelah_ujian',
      kkm: 75,
      modeTampilan: 'terstruktur',
      soalList: [],
      // Proctoring Defaults
      pengawasanAktif: true,
      wajibFullscreen: true,
      maksimalPelanggaran: 3,
      blokirCopyPaste: true,
      createdAt: now.toISOString(),
      updatedAt: now.toISOString(),
    };

    setActiveUjian(newExam);
    setView('form');
  };

  // Handle open edit exam
  const handleOpenEditExam = (exam: UjianOnline) => {
    setActiveUjian({
      ...exam,
      pengawasanAktif: exam.pengawasanAktif !== undefined ? exam.pengawasanAktif : true,
      wajibFullscreen: exam.wajibFullscreen !== undefined ? exam.wajibFullscreen : true,
      maksimalPelanggaran: exam.maksimalPelanggaran || 3,
      blokirCopyPaste: exam.blokirCopyPaste !== undefined ? exam.blokirCopyPaste : true,
    });
    setView('form');
  };

  // Handle save exam
  const handleSaveExam = async (statusToSave?: StatusUjian) => {
    if (!activeUjian) return;
    if (!activeUjian.judul.trim()) {
      alert('Judul ujian tidak boleh kosong.');
      return;
    }
    if (activeUjian.kelasTarget.length === 0) {
      alert('Pilih minimal satu kelas target peserta ujian.');
      return;
    }
    if (activeUjian.soalList.length === 0) {
      alert('Naskah ujian harus memiliki minimal 1 butir soal sebelum disimpan.');
      return;
    }

    const schoolId = activeUjian.schoolId || db.getActiveSchoolId();
    const examToSave: UjianOnline = {
      ...activeUjian,
      schoolId,
      status: statusToSave || activeUjian.status || 'aktif',
    };

    await db.saveUjianOnline(examToSave);
    loadAllData();
    setView('list');
    setActiveUjian(null);
  };

  // Handle duplicate exam
  const handleDuplicateExam = async (id: string) => {
    if (confirm('Duplikasi naskah ujian ini sebagai draf baru?')) {
      await db.duplicateUjianOnline(id);
      loadAllData();
    }
  };

  // Handle archive exam
  const handleArchiveExam = async (id: string, isArchived: boolean) => {
    await db.archiveUjianOnline(id, isArchived);
    loadAllData();
  };

  // Handle delete exam
  const handleDeleteExam = async (id: string, judul: string) => {
    if (
      confirm(
        `Apakah Anda yakin ingin menghapus ujian "${judul}"? Seluruh data hasil ujian siswa terkait juga akan terhapus.`
      )
    ) {
      await db.deleteUjianOnline(id);
      loadAllData();
    }
  };

  // Open Share & QR modal
  const handleOpenShare = (exam: UjianOnline) => {
    setShareUjianTarget(exam);
    setShowShareModal(true);
    setCopyFeedback(false);
  };

  // Copy link
  const handleCopyLink = () => {
    if (!shareUjianTarget) return;
    const schoolId = shareUjianTarget.schoolId || db.getActiveSchoolId();
    const url = `${window.location.origin}/#ujian/${shareUjianTarget.id}?school=${schoolId}`;
    navigator.clipboard.writeText(url);
    setCopyFeedback(true);
    setTimeout(() => setCopyFeedback(false), 2000);
  };

  // Download QR Code PNG
  const handleDownloadQrPng = () => {
    if (!qrCanvasRef.current || !shareUjianTarget) return;
    const url = qrCanvasRef.current.toDataURL('image/png');
    const a = document.createElement('a');
    a.href = url;
    a.download = `QR-Ujian-${shareUjianTarget.judul.replace(/\s+/g, '_')}.png`;
    a.click();
  };

  // Print QR Card
  const handlePrintQrCard = () => {
    window.print();
  };

  // Open Rekap Nilai view
  const handleOpenRekap = (exam: UjianOnline) => {
    setRekapUjianTarget(exam);
    const answers = db.getJawabanUjianList(exam.id);
    setJawabanList(answers);
    setView('rekap');
  };

  // Open Proctoring view
  const handleOpenPengawasan = (exam: UjianOnline) => {
    setPengawasanUjianTarget(exam);
    const answers = db.getJawabanUjianList(exam.id);
    setJawabanList(answers);
    setView('pengawasan');
  };

  // Proctoring Action: Unlock student session
  const handleUnlockSession = (ujianId: string, siswaId: string) => {
    db.bukaKunciSesiSiswa(ujianId, siswaId);
    setJawabanList(db.getJawabanUjianList(ujianId));
    alert('Sesi ujian siswa berhasil dibuka kembali. Layar siswa akan langsung aktif otomatis.');
  };

  // Proctoring Action: Reset student session
  const handleResetSession = (ujianId: string, siswaId: string, namaSiswa: string) => {
    if (
      confirm(
        `PERINGATAN: Apakah Anda yakin ingin mereset sesi ujian untuk ${namaSiswa}? Riwayat jawaban dan status saat ini akan dihapus agar siswa dapat memulai ulang dari awal.`
      )
    ) {
      db.resetSesiSiswa(ujianId, siswaId);
      setJawabanList(db.getJawabanUjianList(ujianId));
    }
  };

  // Proctoring Action: Force Submit
  const handleForceSubmit = (ujianId: string, siswaId: string) => {
    const session = db.getJawabanSiswaByUjian(ujianId, siswaId);
    if (!session || !pengawasanUjianTarget) return;
    if (confirm(`Paksa kumpulkan lembar ujian siswa ${session.namaSiswa}?`)) {
      const grading = db.gradeJawabanSiswa(pengawasanUjianTarget, session.jawaban);
      const updated: JawabanSiswaUjian = {
        ...session,
        status: 'selesai',
        nilaiAkhir: grading.nilaiAkhir,
        jumlahBenar: grading.jumlahBenar,
        jumlahSalah: grading.jumlahSalah,
        jumlahKosong: grading.jumlahKosong,
        lulusKkm: grading.lulusKkm,
        waktuSelesai: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      };
      db.saveJawabanSiswaUjian(updated);
      setJawabanList(db.getJawabanUjianList(ujianId));
    }
  };

  // File Upload and AI Parser for Word / PDF
  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setImportFile(file);
    setImportError(null);
    setImportLoading(true);

    try {
      const isDocx = file.name.endsWith('.docx');
      const isPdf = file.name.endsWith('.pdf');

      if (!isDocx && !isPdf) {
        throw new Error('Hanya mendukung berkas Microsoft Word (.docx) atau Dokumen PDF (.pdf).');
      }

      // Check file size warning for Vercel
      const maxVercelBytes = 4.5 * 1024 * 1024; // 4.5 MB Vercel Serverless limit
      if (file.size > maxVercelBytes && isPdf) {
        throw new Error(
          `Ukuran berkas PDF Anda (${(file.size / (1024 * 1024)).toFixed(1)} MB) melebihi batas unggah Vercel (4.5 MB). Silakan kompres berkas PDF atau bagi dokumen menjadi beberapa lembar.`
        );
      }

      // Pre-extract docx in browser for maximum resilience
      let docxBrowserData: { text: string; mediaImages: Record<string, string> } | null = null;
      if (isDocx) {
        try {
          docxBrowserData = await extractDocxInBrowser(file);
        } catch (docxErr: any) {
          console.warn('[DOCX Browser Pre-Extract Warn]:', docxErr);
        }
      }

      // Convert file to Base64
      const reader = new FileReader();
      const base64Promise = new Promise<string>((resolve, reject) => {
        reader.onload = () => resolve(reader.result as string);
        reader.onerror = () => reject(new Error('Gagal membaca berkas dari perangkat Anda.'));
      });
      reader.readAsDataURL(file);
      const base64Data = await base64Promise;

      const endpoint = isDocx ? '/api/ujian/parse-docx' : '/api/ujian/parse-pdf';
      const apiRes = await safeFetchJson<{
        success: boolean;
        judul?: string;
        mataPelajaran?: string;
        kelas?: string;
        soalList: SoalUjian[];
        totalSoal: number;
        rawText?: string;
        error?: string;
      }>(endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          fileBase64: base64Data,
          fileName: file.name,
        }),
      });

      if (apiRes.ok && apiRes.data?.success && apiRes.data.soalList?.length) {
        const result = apiRes.data;
        setImportResult({
          judul: result.judul,
          mataPelajaran: result.mataPelajaran,
          kelas: result.kelas,
          soalList: result.soalList,
          totalSoal: result.totalSoal || result.soalList.length,
          rawText: result.rawText,
          fileBase64: base64Data,
          fileName: file.name,
        });
        setImportStep('preview');
        return;
      }

      // If docx failed on server (e.g. 413 payload too large or 404 endpoint or timeout),
      // attempt fallback: send pure extracted text to /api/ujian/parse-text-soal
      if (isDocx && docxBrowserData && docxBrowserData.text) {
        console.info('[DOCX Fallback] Attempting text-based parser fallback...');
        const textFallbackRes = await safeFetchJson<{
          success: boolean;
          soalList: SoalUjian[];
        }>('/api/ujian/parse-text-soal', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ text: docxBrowserData.text }),
        });

        if (textFallbackRes.ok && textFallbackRes.data?.soalList?.length) {
          const list = textFallbackRes.data.soalList;
          setImportResult({
            judul: file.name.replace(/\.[^/.]+$/, ''),
            soalList: list,
            totalSoal: list.length,
            rawText: docxBrowserData.text,
            fileBase64: base64Data,
            fileName: file.name,
          });
          setImportStep('preview');
          return;
        }

        // Emergency local rule-based regex fallback (works 100% offline without any server)
        const localQuestions = parseQuestionsWithRegex(docxBrowserData.text);
        if (localQuestions.length > 0) {
          setImportResult({
            judul: file.name.replace(/\.[^/.]+$/, ''),
            soalList: localQuestions,
            totalSoal: localQuestions.length,
            rawText: docxBrowserData.text,
            fileBase64: base64Data,
            fileName: file.name,
          });
          setImportStep('preview');
          return;
        }
      }

      // If we reach here, show the specific diagnostic error
      throw new Error(
        apiRes.error ||
          'Gagal mengekstrak soal dari dokumen. Pastikan dokumen memiliki teks butir soal yang jelas.'
      );
    } catch (err: any) {
      console.error('[Import Error Handler]:', err);
      setImportError(err?.message || 'Terjadi kesalahan saat memproses dokumen.');
    } finally {
      setImportLoading(false);
      // Reset input value so user can re-select the same file if needed
      if (e.target) {
        e.target.value = '';
      }
    }
  };

  // Delete a question from import preview before applying
  const handleDeleteImportQuestion = (idxToDelete: number) => {
    if (!importResult) return;
    const filtered = importResult.soalList.filter((_, idx) => idx !== idxToDelete);
    const reindexed = filtered.map((q, idx) => ({ ...q, nomor: idx + 1 }));
    setImportResult({
      ...importResult,
      soalList: reindexed,
      totalSoal: reindexed.length,
    });
  };

  // Change answer key directly from preview
  const handleChangeImportKey = (idx: number, newKey: string) => {
    if (!importResult) return;
    const updated = [...importResult.soalList];
    const item = { ...updated[idx], kunciJawaban: newKey, perluVerifikasi: false };
    delete item.catatanVerifikasi;
    updated[idx] = item;
    setImportResult({ ...importResult, soalList: updated });
  };

  // Apply imported questions to active exam
  const handleApplyImportResult = () => {
    if (!importResult || !activeUjian) return;

    const mergedQuestions = [...activeUjian.soalList, ...importResult.soalList].map((q, idx) => ({
      ...q,
      nomor: idx + 1,
    }));

    // Avoid storing massive base64 in the exam document which causes Firestore setDoc to exceed 1MB
    const isBase64Huge = importResult.fileBase64 && importResult.fileBase64.length > 250000;
    const safeDocUrl = isBase64Huge ? undefined : importResult.fileBase64;

    setActiveUjian({
      ...activeUjian,
      judul: activeUjian.judul || importResult.judul || activeUjian.judul,
      mataPelajaran: activeUjian.mataPelajaran || importResult.mataPelajaran || activeUjian.mataPelajaran,
      soalList: mergedQuestions,
      dokumenAsliNama: importResult.fileName,
      dokumenAsliUrl: safeDocUrl,
    });

    setShowImportModal(false);
    setImportResult(null);
    setImportStep('upload');
  };

  // Manual Question Save
  const handleSaveQuestion = () => {
    if (!editingQuestion || !activeUjian) return;
    if (!editingQuestion.pertanyaan.trim()) {
      alert('Teks pertanyaan tidak boleh kosong.');
      return;
    }

    const updatedList = [...activeUjian.soalList];
    const existingIdx = updatedList.findIndex((q) => q.id === editingQuestion.id);

    if (existingIdx >= 0) {
      updatedList[existingIdx] = editingQuestion;
    } else {
      updatedList.push({
        ...editingQuestion,
        nomor: updatedList.length + 1,
      });
    }

    // Re-index question numbers sequentially
    const sequential = updatedList.map((q, idx) => ({
      ...q,
      nomor: idx + 1,
    }));

    setActiveUjian({
      ...activeUjian,
      soalList: sequential,
    });

    setShowQuestionModal(false);
    setEditingQuestion(null);
  };

  // Delete question
  const handleDeleteQuestion = (id: string) => {
    if (!activeUjian) return;
    const filtered = activeUjian.soalList.filter((q) => q.id !== id);
    const reindexed = filtered.map((q, idx) => ({ ...q, nomor: idx + 1 }));
    setActiveUjian({
      ...activeUjian,
      soalList: reindexed,
    });
  };

  // Image upload inside question modal
  const handleQuestionImageUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !editingQuestion) return;

    const reader = new FileReader();
    reader.onload = () => {
      setEditingQuestion({
        ...editingQuestion,
        gambar: reader.result as string,
      });
    };
    reader.readAsDataURL(file);
  };

  // Export Rekap to Excel (.xlsx)
  const handleExportExcel = () => {
    if (!rekapUjianTarget) return;

    const exportRows = rekapData.map((row, idx) => ({
      No: idx + 1,
      'Nama Siswa': row.siswa.namaLengkap || (row.siswa as any).nama,
      'NIS/NISN': row.siswa.nisn || row.siswa.nomorInduk || (row.siswa as any).nis || '-',
      Kelas: row.siswa.kelas,
      'Nilai Akhir (0-100)': row.jawaban?.nilaiAkhir !== undefined ? row.jawaban.nilaiAkhir : 'Belum Ujian',
      'Status Ketuntasan': row.jawaban
        ? row.jawaban.lulusKkm
          ? 'Tuntas (KKM ' + (rekapUjianTarget.kkm || 75) + ')'
          : 'Belum Tuntas'
        : 'Belum Mengerjakan',
      'Benar': row.jawaban?.jumlahBenar ?? '-',
      'Salah': row.jawaban?.jumlahSalah ?? '-',
      'Kosong': row.jawaban?.jumlahKosong ?? '-',
      'Jumlah Pelanggaran': row.jawaban?.jumlahPelanggaran || 0,
      'Waktu Selesai': row.jawaban?.waktuSelesai
        ? new Date(row.jawaban.waktuSelesai).toLocaleString('id-ID')
        : '-',
    }));

    const wb = XLSX.utils.book_new();
    const ws = XLSX.utils.json_to_sheet(exportRows);
    XLSX.utils.book_append_sheet(wb, ws, 'Rekap Hasil CBT');
    XLSX.writeFile(wb, `Rekap_Nilai_${rekapUjianTarget.judul.replace(/[^a-zA-Z0-9]/g, '_')}.xlsx`);
  };

  // Submit revised key with recalculation & audit log
  const handleExecuteKeyCorrection = () => {
    if (!rekapUjianTarget || !targetCorrectionSoal || !newKeyInput.trim()) return;

    db.updateKunciJawabanUjian(
      rekapUjianTarget.id,
      targetCorrectionSoal.nomor,
      newKeyInput.trim(),
      currentUser.name,
      correctionReason.trim() || 'Koreksi kunci jawaban setelah ujian berlangsung'
    );

    const updatedExam = db.getUjianOnlineById(rekapUjianTarget.id);
    if (updatedExam) {
      setRekapUjianTarget(updatedExam);
    }
    setJawabanList(db.getJawabanUjianList(rekapUjianTarget.id));
    setShowKeyCorrectionModal(false);
    alert('Kunci jawaban berhasil diperbarui! Seluruh nilai siswa telah dikalkulasi ulang secara otomatis.');
  };

  // Manual essay grading save
  const handleSaveEssayScore = (soalId: string, score: number, comment?: string) => {
    if (!selectedJawabanSiswa || !rekapUjianTarget) return;

    const currentJawabanDetail = { ...selectedJawabanSiswa.jawaban };
    currentJawabanDetail[soalId] = {
      ...currentJawabanDetail[soalId],
      nilaiEsai: score,
      catatanGuruEsai: comment,
      dinilaiOlehGuru: true,
      skorDidapat: score,
    };

    const regraded = db.gradeJawabanSiswa(rekapUjianTarget, currentJawabanDetail);
    const updatedRecord: JawabanSiswaUjian = {
      ...selectedJawabanSiswa,
      jawaban: regraded.detailWithScores,
      nilaiAkhir: regraded.nilaiAkhir,
      jumlahBenar: regraded.jumlahBenar,
      jumlahSalah: regraded.jumlahSalah,
      jumlahKosong: regraded.jumlahKosong,
      lulusKkm: regraded.lulusKkm,
      adaEsaiBelumDinilai: regraded.adaEsaiBelumDinilai,
    };

    db.saveJawabanSiswaUjian(updatedRecord);
    setSelectedJawabanSiswa(updatedRecord);
    setJawabanList(db.getJawabanUjianList(rekapUjianTarget.id));
  };

  // Rekap Data Computation
  const targetStudents = useMemo(() => {
    if (!rekapUjianTarget) return [];
    const targets = rekapUjianTarget.kelasTarget || [];
    if (targets.length === 0 || targets.includes('Semua Siswa')) {
      return allSiswa;
    }
    return allSiswa.filter((s) =>
      targets.some((t) => s.kelas.toLowerCase().includes(t.toLowerCase()) || t.toLowerCase().includes(s.kelas.toLowerCase()))
    );
  }, [rekapUjianTarget, allSiswa]);

  const rekapData = useMemo(() => {
    return targetStudents
      .map((siswa) => {
        const jawaban = jawabanList.find((j) => j.siswaId === siswa.id);
        return { siswa, jawaban };
      })
      .filter((item) => {
        if (rekapSearch.trim()) {
          const q = rekapSearch.toLowerCase();
          const match =
            (item.siswa.namaLengkap || (item.siswa as any).nama || '').toLowerCase().includes(q) ||
            (item.siswa.nisn && item.siswa.nisn.includes(q)) ||
            (item.siswa.nomorInduk && item.siswa.nomorInduk.includes(q));
          if (!match) return false;
        }

        if (rekapFilterStatus === 'selesai' && (!item.jawaban || item.jawaban.status !== 'selesai')) {
          return false;
        }
        if (rekapFilterStatus === 'belum' && item.jawaban) {
          return false;
        }
        if (rekapFilterStatus === 'tuntas' && (!item.jawaban || !item.jawaban.lulusKkm)) {
          return false;
        }
        if (rekapFilterStatus === 'belum_tuntas' && (!item.jawaban || item.jawaban.lulusKkm)) {
          return false;
        }

        return true;
      });
  }, [targetStudents, jawabanList, rekapSearch, rekapFilterStatus]);

  // Rekap summary statistics
  const stats = useMemo(() => {
    const totalTerdaftar = targetStudents.length;
    const sudahSelesai = jawabanList.filter((j) => j.status === 'selesai' || j.status === 'waktu_habis');
    const totalSudah = sudahSelesai.length;
    const totalBelum = Math.max(0, totalTerdaftar - totalSudah);

    let nilaiTertinggi = 0;
    let nilaiTerendah = 100;
    let sumNilai = 0;
    let countTuntas = 0;

    if (totalSudah > 0) {
      sudahSelesai.forEach((j) => {
        const val = j.nilaiAkhir ?? 0;
        if (val > nilaiTertinggi) nilaiTertinggi = val;
        if (val < nilaiTerendah) nilaiTerendah = val;
        sumNilai += val;
        if (j.lulusKkm) countTuntas++;
      });
    } else {
      nilaiTerendah = 0;
    }

    const rataRata = totalSudah > 0 ? Math.round(sumNilai / totalSudah) : 0;
    const persenTuntas = totalSudah > 0 ? Math.round((countTuntas / totalSudah) * 100) : 0;

    return {
      totalTerdaftar,
      totalSudah,
      totalBelum,
      nilaiTertinggi,
      nilaiTerendah,
      rataRata,
      countTuntas,
      persenTuntas,
    };
  }, [targetStudents, jawabanList]);

  // Proctoring Students List & Metrics
  const proctoringStudents = useMemo(() => {
    if (!pengawasanUjianTarget) return [];
    const targets = pengawasanUjianTarget.kelasTarget || [];
    const examStudents =
      targets.length === 0 || targets.includes('Semua Siswa')
        ? allSiswa
        : allSiswa.filter((s) =>
            targets.some((t) => s.kelas.toLowerCase().includes(t.toLowerCase()) || t.toLowerCase().includes(s.kelas.toLowerCase()))
          );

    return examStudents
      .map((siswa) => {
        const jawaban = jawabanList.find((j) => j.siswaId === siswa.id);
        return { siswa, jawaban };
      })
      .filter((item) => {
        if (proctoringSearch.trim()) {
          const q = proctoringSearch.toLowerCase();
          const match =
            (item.siswa.namaLengkap || (item.siswa as any).nama || '').toLowerCase().includes(q) ||
            (item.siswa.nisn && item.siswa.nisn.includes(q)) ||
            (item.siswa.nomorInduk && item.siswa.nomorInduk.includes(q));
          if (!match) return false;
        }

        if (proctoringFilterStatus === 'terkunci') {
          return item.jawaban?.status === 'terkunci';
        }
        if (proctoringFilterStatus === 'aktif') {
          return item.jawaban?.status === 'sedang_mengerjakan';
        }
        if (proctoringFilterStatus === 'melanggar') {
          return (item.jawaban?.jumlahPelanggaran || 0) > 0;
        }
        if (proctoringFilterStatus === 'selesai') {
          return item.jawaban?.status === 'selesai' || item.jawaban?.status === 'waktu_habis';
        }
        if (proctoringFilterStatus === 'belum') {
          return !item.jawaban;
        }

        return true;
      });
  }, [pengawasanUjianTarget, allSiswa, jawabanList, proctoringSearch, proctoringFilterStatus]);

  // Proctoring Summary Stats
  const proctoringStats = useMemo(() => {
    const list = db.getJawabanUjianList(pengawasanUjianTarget?.id);
    const aktif = list.filter((j) => j.status === 'sedang_mengerjakan').length;
    const terkunci = list.filter((j) => j.status === 'terkunci').length;
    const melanggar = list.filter((j) => (j.jumlahPelanggaran || 0) > 0 && j.status !== 'terkunci').length;
    const selesai = list.filter((j) => j.status === 'selesai' || j.status === 'waktu_habis').length;
    return { aktif, terkunci, melanggar, selesai, totalLogged: list.length };
  }, [pengawasanUjianTarget, jawabanList]);

  // Aggregate recent violation feed for ticker
  const recentViolationFeed = useMemo(() => {
    if (!pengawasanUjianTarget) return [];
    const list = db.getJawabanUjianList(pengawasanUjianTarget.id);
    const events: Array<{
      id: string;
      namaSiswa: string;
      kelas: string;
      waktu: string;
      jenis: string;
      deskripsi: string;
      durasi?: number;
      isLockEvent?: boolean;
    }> = [];

    list.forEach((j) => {
      (j.logPelanggaran || []).forEach((log) => {
        events.push({
          id: log.id,
          namaSiswa: j.namaSiswa,
          kelas: j.kelas,
          waktu: log.waktu,
          jenis: log.jenis,
          deskripsi: log.deskripsi,
          durasi: log.durasiKeluarDetik,
        });
      });
      if (j.status === 'terkunci') {
        events.push({
          id: `lock-${j.id}`,
          namaSiswa: j.namaSiswa,
          kelas: j.kelas,
          waktu: j.waktuTerkunci || j.updatedAt,
          jenis: 'terkunci',
          deskripsi: `Sesi ujian otomatis DIKUNCI oleh sistem karena batas pelanggaran tercapai!`,
          isLockEvent: true,
        });
      }
    });

    return events.sort((a, b) => new Date(b.waktu).getTime() - new Date(a.waktu).getTime()).slice(0, 10);
  }, [pengawasanUjianTarget, jawabanList]);

  return (
    <div className="space-y-6">
      {/* Top View Switcher Navigation Bar */}
      <div className="bg-white p-3 rounded-2xl border border-slate-200 shadow-xs flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <button
            onClick={() => setView('list')}
            className={`px-4 py-2 rounded-xl text-xs sm:text-sm font-bold transition flex items-center gap-2 cursor-pointer ${
              view === 'list'
                ? 'bg-blue-600 text-white shadow-sm'
                : 'text-slate-600 hover:bg-slate-100 hover:text-slate-900'
            }`}
          >
            <Layers className="w-4 h-4" />
            <span>Daftar Ujian</span>
          </button>

          <button
            onClick={() => {
              if (ujianList.length > 0 && !pengawasanUjianTarget) {
                setPengawasanUjianTarget(ujianList.find((u) => u.status === 'aktif') || ujianList[0]);
              }
              setView('pengawasan');
            }}
            className={`px-4 py-2 rounded-xl text-xs sm:text-sm font-bold transition flex items-center gap-2 cursor-pointer relative ${
              view === 'pengawasan'
                ? 'bg-amber-500 text-slate-950 shadow-sm'
                : 'text-slate-600 hover:bg-slate-100 hover:text-slate-900'
            }`}
          >
            <ShieldAlert className="w-4 h-4 text-amber-500" />
            <span>Live Pengawasan</span>
            {proctoringStats.terkunci > 0 && (
              <span className="w-2.5 h-2.5 rounded-full bg-red-500 animate-ping absolute -top-1 -right-1" />
            )}
          </button>

          <button
            onClick={() => {
              if (ujianList.length > 0 && !rekapUjianTarget) {
                setRekapUjianTarget(ujianList[0]);
              }
              setView('rekap');
            }}
            className={`px-4 py-2 rounded-xl text-xs sm:text-sm font-bold transition flex items-center gap-2 cursor-pointer ${
              view === 'rekap'
                ? 'bg-emerald-600 text-white shadow-sm'
                : 'text-slate-600 hover:bg-slate-100 hover:text-slate-900'
            }`}
          >
            <FileSpreadsheet className="w-4 h-4" />
            <span>Rekap Nilai Otomatis</span>
          </button>
        </div>

        <button
          onClick={handleOpenCreateExam}
          className="bg-blue-600 hover:bg-blue-500 text-white font-bold px-4 py-2 rounded-xl text-xs sm:text-sm transition shadow-sm flex items-center gap-1.5 cursor-pointer ml-auto"
        >
          <Plus className="w-4 h-4" />
          <span>Buat Ujian Baru</span>
        </button>
      </div>

      {/* ======================================================== */}
      {/* 1. LIST VIEW OF ALL EXAMS */}
      {/* ======================================================== */}
      {view === 'list' && (
        <div className="space-y-6">
          {/* Top Banner and Actions */}
          <div className="bg-gradient-to-r from-blue-900 via-indigo-900 to-slate-900 rounded-3xl p-6 sm:p-8 text-white shadow-xl flex flex-col md:flex-row md:items-center justify-between gap-6">
            <div>
              <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-blue-500/20 border border-blue-400/30 text-blue-300 text-xs font-semibold mb-3">
                <FileQuestion className="w-3.5 h-3.5" />
                <span>Portal CBT Satuan Pendidikan</span>
              </div>
              <h1 className="text-2xl sm:text-3xl font-extrabold tracking-tight">Pusat Ujian Online (CBT)</h1>
              <p className="text-slate-300 text-xs sm:text-sm mt-1 max-w-2xl leading-relaxed">
                Kelola naskah ujian, ulangan harian, PTS, PAS, asesmen sumatif, impor naskah Word/PDF dengan ekstraksi
                gambar dan kunci otomatis, bagikan link & QR Code, sistem pengawasan anti-curang, serta rekap nilai otomatis.
              </p>
            </div>
            <div className="flex flex-wrap items-center gap-3">
              <button
                onClick={handleOpenCreateExam}
                className="bg-blue-600 hover:bg-blue-500 text-white font-bold px-5 py-3 rounded-2xl transition shadow-lg shadow-blue-600/30 flex items-center gap-2 cursor-pointer text-sm"
              >
                <Plus className="w-4 h-4" />
                <span>Buat Ujian Baru</span>
              </button>
            </div>
          </div>

          {/* Quick Metrics Bar */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
            <div className="bg-white p-4 rounded-2xl border border-slate-200 shadow-xs">
              <span className="text-xs text-slate-500 font-medium">Total Ujian Dibuat</span>
              <div className="text-2xl font-bold text-slate-800 mt-1">{ujianList.length}</div>
            </div>
            <div className="bg-white p-4 rounded-2xl border border-slate-200 shadow-xs">
              <span className="text-xs text-slate-500 font-medium">Ujian Aktif Saat Ini</span>
              <div className="text-2xl font-bold text-emerald-600 mt-1">
                {ujianList.filter((u) => u.status === 'aktif').length}
              </div>
            </div>
            <div className="bg-white p-4 rounded-2xl border border-slate-200 shadow-xs">
              <span className="text-xs text-slate-500 font-medium">Terjadwal Mendatang</span>
              <div className="text-2xl font-bold text-blue-600 mt-1">
                {ujianList.filter((u) => u.status === 'terjadwal').length}
              </div>
            </div>
            <div className="bg-white p-4 rounded-2xl border border-slate-200 shadow-xs">
              <span className="text-xs text-slate-500 font-medium">Draf & Arsip</span>
              <div className="text-2xl font-bold text-slate-600 mt-1">
                {ujianList.filter((u) => u.status === 'draf' || u.status === 'diarsipkan').length}
              </div>
            </div>
          </div>

          {/* Filters & Search */}
          <div className="bg-white p-4 rounded-2xl border border-slate-200 shadow-xs flex flex-col md:flex-row gap-4 items-center justify-between">
            {/* Status tabs */}
            <div className="flex flex-wrap items-center gap-1.5 w-full md:w-auto">
              {[
                { id: 'semua', label: 'Semua Status' },
                { id: 'aktif', label: 'Aktif' },
                { id: 'terjadwal', label: 'Terjadwal' },
                { id: 'selesai', label: 'Selesai' },
                { id: 'draf', label: 'Draf' },
                { id: 'diarsipkan', label: 'Arsip' },
              ].map((tab) => (
                <button
                  key={tab.id}
                  onClick={() => setSelectedFilterStatus(tab.id)}
                  className={`px-3 py-1.5 rounded-xl text-xs font-semibold transition cursor-pointer ${
                    selectedFilterStatus === tab.id
                      ? 'bg-blue-600 text-white shadow-xs'
                      : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                  }`}
                >
                  {tab.label}
                </button>
              ))}
            </div>

            {/* Class filter dropdown & search input */}
            <div className="flex items-center gap-2.5 w-full md:w-auto">
              <select
                value={selectedFilterKelas}
                onChange={(e) => setSelectedFilterKelas(e.target.value)}
                className="bg-slate-50 border border-slate-200 text-slate-700 text-xs py-2 px-3 rounded-xl focus:ring-2 focus:ring-blue-500 focus:outline-hidden cursor-pointer"
              >
                <option value="semua">Semua Kelas</option>
                {allKelas.map((k) => (
                  <option key={k.id} value={k.nama}>
                    {k.nama}
                  </option>
                ))}
              </select>

              <div className="relative flex-1 md:w-60">
                <Search className="w-4 h-4 absolute left-3 top-2.5 text-slate-400" />
                <input
                  type="text"
                  value={searchExamQuery}
                  onChange={(e) => setSearchExamQuery(e.target.value)}
                  placeholder="Cari judul atau mapel..."
                  className="w-full bg-slate-50 border border-slate-200 text-slate-800 pl-9 pr-3 py-2 rounded-xl text-xs focus:ring-2 focus:ring-blue-500 focus:outline-hidden"
                />
              </div>
            </div>
          </div>

          {/* Exam Grid */}
          {filteredExams.length === 0 ? (
            <div className="bg-white rounded-3xl border border-slate-200 p-12 text-center max-w-lg mx-auto shadow-xs">
              <div className="w-16 h-16 bg-blue-50 text-blue-600 rounded-2xl flex items-center justify-center mx-auto mb-4">
                <FileQuestion className="w-8 h-8" />
              </div>
              <h3 className="text-lg font-bold text-slate-900 mb-1">Belum Ada Naskah Ujian</h3>
              <p className="text-slate-500 text-xs sm:text-sm mb-6 leading-relaxed">
                Buat naskah ujian baru atau impor secara otomatis dari dokumen Word (.docx) atau PDF untuk memulai.
              </p>
              <button
                onClick={handleOpenCreateExam}
                className="bg-blue-600 hover:bg-blue-500 text-white font-bold px-5 py-2.5 rounded-xl text-xs sm:text-sm transition cursor-pointer shadow-md shadow-blue-600/20"
              >
                + Buat Ujian Pertama
              </button>
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
              {filteredExams.map((exam) => {
                const countSelesai = db
                  .getJawabanUjianList(exam.id)
                  .filter((j) => j.status === 'selesai' || j.status === 'waktu_habis').length;
                const countTerkunci = db
                  .getJawabanUjianList(exam.id)
                  .filter((j) => j.status === 'terkunci').length;

                return (
                  <div
                    key={exam.id}
                    className="bg-white rounded-3xl border border-slate-200 shadow-xs hover:shadow-md transition flex flex-col justify-between overflow-hidden group"
                  >
                    <div className="p-5">
                      {/* Status Badges */}
                      <div className="flex items-center justify-between mb-3">
                        <span
                          className={`px-2.5 py-1 rounded-full text-[11px] font-bold ${
                            exam.status === 'aktif'
                              ? 'bg-emerald-100 text-emerald-800'
                              : exam.status === 'terjadwal'
                              ? 'bg-blue-100 text-blue-800'
                              : exam.status === 'selesai'
                              ? 'bg-slate-100 text-slate-700'
                              : exam.status === 'diarsipkan'
                              ? 'bg-amber-100 text-amber-800'
                              : 'bg-purple-100 text-purple-800'
                          }`}
                        >
                          {exam.status.toUpperCase()}
                        </span>

                        <span className="text-[11px] font-semibold text-slate-400">{exam.jenisUjian}</span>
                      </div>

                      {/* Title & Subject */}
                      <h3 className="font-bold text-slate-900 text-base mb-1.5 group-hover:text-blue-600 transition line-clamp-2">
                        {exam.judul}
                      </h3>

                      <div className="space-y-1.5 text-xs text-slate-500 mb-4">
                        <div className="flex items-center gap-1.5">
                          <Layers className="w-3.5 h-3.5 text-blue-500 shrink-0" />
                          <span className="font-semibold text-slate-700">{exam.mataPelajaran}</span>
                        </div>
                        <div className="flex items-center gap-1.5">
                          <Users className="w-3.5 h-3.5 text-indigo-500 shrink-0" />
                          <span>Kelas: {exam.kelasTarget.join(', ')}</span>
                        </div>
                        <div className="flex items-center gap-1.5">
                          <Clock className="w-3.5 h-3.5 text-amber-500 shrink-0" />
                          <span>
                            Durasi: <strong>{exam.durasiMenit} Menit</strong> &bull; {exam.soalList.length} Butir Soal
                          </span>
                        </div>
                        {exam.kodeUjian && (
                          <div className="text-[11px] text-amber-600 font-mono font-bold bg-amber-50 px-2 py-0.5 rounded-md inline-block">
                            Token: {exam.kodeUjian}
                          </div>
                        )}
                      </div>

                      {/* Submission Progress & Lock Alert */}
                      <div className="bg-slate-50 p-2.5 rounded-xl border border-slate-100 text-xs flex items-center justify-between mb-2">
                        <span className="text-slate-500">Hasil Pengerjaan:</span>
                        <span className="font-bold text-slate-800">{countSelesai} Siswa Selesai</span>
                      </div>
                      {countTerkunci > 0 && (
                        <div className="bg-red-50 text-red-700 p-2 rounded-xl border border-red-200 text-xs flex items-center gap-1.5 font-bold animate-pulse">
                          <AlertTriangle className="w-3.5 h-3.5 text-red-600 shrink-0" />
                          <span>{countTerkunci} Siswa Sesi Terkunci!</span>
                        </div>
                      )}
                    </div>

                    {/* Bottom Action Footer */}
                    <div className="p-3 bg-slate-50 border-t border-slate-100 flex flex-wrap items-center justify-between gap-1.5">
                      <div className="flex items-center gap-1">
                        <button
                          onClick={() => handleOpenShare(exam)}
                          title="Bagikan Link & QR Code"
                          className="p-1.5 sm:p-2 rounded-xl text-blue-600 hover:bg-blue-50 transition cursor-pointer font-semibold text-xs flex items-center gap-1"
                        >
                          <QrCode className="w-4 h-4" />
                          <span className="hidden sm:inline">QR</span>
                        </button>
                        <button
                          onClick={() => handleOpenPengawasan(exam)}
                          title="Live Pengawasan & Anti-Curang"
                          className="p-1.5 sm:p-2 rounded-xl text-amber-700 hover:bg-amber-100 transition cursor-pointer font-semibold text-xs flex items-center gap-1"
                        >
                          <ShieldAlert className="w-4 h-4 text-amber-600" />
                          <span className="hidden sm:inline">Pengawasan</span>
                        </button>
                        <button
                          onClick={() => handleOpenRekap(exam)}
                          title="Rekap Nilai Siswa"
                          className="p-1.5 sm:p-2 rounded-xl text-emerald-600 hover:bg-emerald-50 transition cursor-pointer font-semibold text-xs flex items-center gap-1"
                        >
                          <FileSpreadsheet className="w-4 h-4" />
                          <span className="hidden sm:inline">Rekap</span>
                        </button>
                      </div>

                      <div className="flex items-center gap-1">
                        <button
                          onClick={() => handleOpenEditExam(exam)}
                          title="Edit Naskah Ujian"
                          className="p-1.5 sm:p-2 rounded-xl text-slate-600 hover:bg-slate-200 transition cursor-pointer"
                        >
                          <Edit className="w-4 h-4" />
                        </button>
                        <button
                          onClick={() => handleDuplicateExam(exam.id)}
                          title="Duplikasi Ujian"
                          className="p-1.5 sm:p-2 rounded-xl text-slate-600 hover:bg-slate-200 transition cursor-pointer"
                        >
                          <Copy className="w-4 h-4" />
                        </button>
                        <button
                          onClick={() => handleDeleteExam(exam.id, exam.judul)}
                          title="Hapus Ujian"
                          className="p-1.5 sm:p-2 rounded-xl text-red-500 hover:bg-red-50 transition cursor-pointer"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}

      {/* ======================================================== */}
      {/* 2. FORM VIEW: CREATE / EDIT EXAM */}
      {/* ======================================================== */}
      {view === 'form' && activeUjian && (
        <div className="space-y-6">
          {/* Header Controls */}
          <div className="bg-white p-4 sm:p-6 rounded-2xl border border-slate-200 shadow-xs flex items-center justify-between gap-4">
            <div className="flex items-center gap-3">
              <button
                onClick={() => setView('list')}
                className="p-2 rounded-xl text-slate-500 hover:bg-slate-100 transition cursor-pointer"
              >
                <ChevronDown className="w-5 h-5 rotate-90" />
              </button>
              <div>
                <h2 className="text-base sm:text-lg font-bold text-slate-900">
                  {activeUjian.id.startsWith('cbt-') ? 'Kelola Naskah Ujian' : 'Edit Ujian Online'}
                </h2>
                <p className="text-xs text-slate-500">
                  Pengaturan jadwal, target kelas, durasi, pengawasan, dan butir soal CBT sekolah.
                </p>
              </div>
            </div>

            <div className="flex items-center gap-2">
              <button
                onClick={() => handleSaveExam('draf')}
                className="bg-slate-100 hover:bg-slate-200 text-slate-700 font-semibold px-4 py-2 rounded-xl text-xs transition cursor-pointer"
              >
                Simpan Draf
              </button>
              <button
                onClick={() => handleSaveExam('aktif')}
                className="bg-blue-600 hover:bg-blue-500 text-white font-bold px-5 py-2 rounded-xl text-xs transition shadow-md shadow-blue-600/20 flex items-center gap-1.5 cursor-pointer"
              >
                <Save className="w-4 h-4" />
                <span>Terbitkan Ujian</span>
              </button>
            </div>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            {/* Left 2 Cols: Exam Details & Question List */}
            <div className="lg:col-span-2 space-y-6">
              {/* Card 1: Exam Identity */}
              <div className="bg-white p-6 rounded-2xl border border-slate-200 shadow-xs space-y-4">
                <h3 className="font-bold text-slate-900 text-sm flex items-center gap-2">
                  <FileText className="w-4 h-4 text-blue-600" />
                  <span>1. Identitas & Informasi Ujian</span>
                </h3>

                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">Judul Naskah Ujian *</label>
                  <input
                    type="text"
                    value={activeUjian.judul}
                    onChange={(e) => setActiveUjian({ ...activeUjian, judul: e.target.value })}
                    placeholder="Contoh: Penilaian Akhir Semester (PAS) - IPAS Kelas 5"
                    className="w-full bg-slate-50 border border-slate-200 text-slate-800 px-3.5 py-2.5 rounded-xl text-sm focus:ring-2 focus:ring-blue-500 focus:outline-hidden font-medium"
                  />
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div>
                    <label className="block text-xs font-bold text-slate-700 mb-1">Mata Pelajaran *</label>
                    <input
                      type="text"
                      list="mapel-options"
                      value={activeUjian.mataPelajaran}
                      onChange={(e) => setActiveUjian({ ...activeUjian, mataPelajaran: e.target.value })}
                      placeholder="Pilih atau ketik mapel..."
                      className="w-full bg-slate-50 border border-slate-200 text-slate-800 px-3.5 py-2.5 rounded-xl text-xs focus:ring-2 focus:ring-blue-500 focus:outline-hidden"
                    />
                    <datalist id="mapel-options">
                      {allMapel.map((m) => (
                        <option key={m.id} value={m.nama} />
                      ))}
                    </datalist>
                  </div>

                  <div>
                    <label className="block text-xs font-bold text-slate-700 mb-1">Jenis Asesmen / Ujian</label>
                    <select
                      value={activeUjian.jenisUjian}
                      onChange={(e) => setActiveUjian({ ...activeUjian, jenisUjian: e.target.value as any })}
                      className="w-full bg-slate-50 border border-slate-200 text-slate-800 px-3.5 py-2.5 rounded-xl text-xs focus:ring-2 focus:ring-blue-500 focus:outline-hidden cursor-pointer"
                    >
                      <option value="Ulangan Harian">Ulangan Harian</option>
                      <option value="Penilaian Tengah Semester (PTS/STS)">Penilaian Tengah Semester (PTS/STS)</option>
                      <option value="Penilaian Akhir Semester (PAS/SAS)">Penilaian Akhir Semester (PAS/SAS)</option>
                      <option value="Ujian Sekolah">Ujian Sekolah</option>
                      <option value="Try Out">Try Out</option>
                      <option value="Kuis / Latihan Harian">Kuis / Latihan Harian</option>
                    </select>
                  </div>
                </div>

                {/* Target Classes Selection (Multiple) */}
                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1.5 flex items-center justify-between">
                    <span>Kelas Target Peserta Ujian (Dari Database Sekolah) *</span>
                    <span className="text-[11px] text-blue-600 font-normal">Pilih satu atau beberapa kelas</span>
                  </label>
                  <div className="flex flex-wrap gap-2 p-3 bg-slate-50 rounded-xl border border-slate-200">
                    {allKelas.map((k) => {
                      const isChecked = activeUjian.kelasTarget.includes(k.nama);
                      return (
                        <button
                          key={k.id}
                          type="button"
                          onClick={() => {
                            if (isChecked) {
                              setActiveUjian({
                                ...activeUjian,
                                kelasTarget: activeUjian.kelasTarget.filter((c) => c !== k.nama),
                              });
                            } else {
                              setActiveUjian({
                                ...activeUjian,
                                kelasTarget: [...activeUjian.kelasTarget, k.nama],
                              });
                            }
                          }}
                          className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition cursor-pointer border ${
                            isChecked
                              ? 'bg-blue-600 text-white border-blue-600 shadow-xs'
                              : 'bg-white text-slate-700 border-slate-200 hover:bg-slate-100'
                          }`}
                        >
                          {k.nama}
                        </button>
                      );
                    })}
                  </div>
                </div>

                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">Petunjuk / Deskripsi Ujian</label>
                  <textarea
                    rows={2}
                    value={activeUjian.deskripsi || ''}
                    onChange={(e) => setActiveUjian({ ...activeUjian, deskripsi: e.target.value })}
                    placeholder="Instruksi khusus kepada siswa sebelum memulai pengerjaan..."
                    className="w-full bg-slate-50 border border-slate-200 text-slate-800 p-3 rounded-xl text-xs focus:ring-2 focus:ring-blue-500 focus:outline-hidden resize-none"
                  />
                </div>
              </div>

              {/* Card 2: Question Management */}
              <div className="bg-white p-6 rounded-2xl border border-slate-200 shadow-xs space-y-4">
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-3 border-b border-slate-100">
                  <div>
                    <h3 className="font-bold text-slate-900 text-sm flex items-center gap-2">
                      <FileQuestion className="w-4 h-4 text-emerald-600" />
                      <span>2. Daftar Butir Soal ({activeUjian.soalList.length} Butir)</span>
                    </h3>
                    <p className="text-[11px] text-slate-500">
                      Anda dapat mengunggah naskah Word/PDF atau menambahkan soal satu per satu secara manual.
                    </p>
                  </div>

                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      onClick={() => setShowImportModal(true)}
                      className="bg-emerald-600 hover:bg-emerald-500 text-white font-bold px-3.5 py-2 rounded-xl text-xs transition shadow-md shadow-emerald-600/20 flex items-center gap-1.5 cursor-pointer"
                    >
                      <Upload className="w-3.5 h-3.5" />
                      <span>Upload Word / PDF</span>
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        setEditingQuestion({
                          id: `soal-${Date.now()}`,
                          nomor: activeUjian.soalList.length + 1,
                          tipe: 'pilihan_ganda',
                          pertanyaan: '',
                          pilihan: { A: '', B: '', C: '', D: '' },
                          kunciJawaban: 'A',
                          bobot: 1,
                        });
                        setShowQuestionModal(true);
                      }}
                      className="bg-slate-100 hover:bg-slate-200 text-slate-800 font-bold px-3.5 py-2 rounded-xl text-xs transition flex items-center gap-1.5 cursor-pointer"
                    >
                      <Plus className="w-3.5 h-3.5" />
                      <span>Tambah Manual</span>
                    </button>
                  </div>
                </div>

                {activeUjian.soalList.length === 0 ? (
                  <div className="p-8 text-center border-2 border-dashed border-slate-200 rounded-2xl">
                    <FileQuestion className="w-10 h-10 text-slate-300 mx-auto mb-2" />
                    <p className="text-xs text-slate-500 font-medium">Belum ada butir soal dalam naskah ini.</p>
                  </div>
                ) : (
                  <div className="space-y-3 max-h-[500px] overflow-y-auto pr-1">
                    {activeUjian.soalList.map((soal) => (
                      <div
                        key={soal.id}
                        className="p-3.5 bg-slate-50 rounded-2xl border border-slate-200 flex items-start justify-between gap-3 text-xs"
                      >
                        <div className="flex items-start gap-2.5 flex-1 min-w-0">
                          <span className="w-6 h-6 rounded-lg bg-blue-600 text-white font-bold flex items-center justify-center shrink-0 text-xs">
                            {soal.nomor}
                          </span>
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-2 mb-1">
                              <span className="font-bold text-slate-700 capitalize">{soal.tipe.replace('_', ' ')}</span>
                              <span className="text-[11px] text-slate-400">&bull; Bobot: {soal.bobot || 1} Poin</span>
                              <span className="text-[11px] font-semibold text-emerald-600">
                                Kunci: {soal.kunciJawaban || '-'}
                              </span>
                            </div>
                            <p className="text-slate-800 line-clamp-2 leading-relaxed">{soal.pertanyaan}</p>
                            {soal.gambar && (
                              <div className="mt-1.5 flex items-center gap-1 text-[11px] text-blue-600 font-medium">
                                <ImageIcon className="w-3.5 h-3.5" />
                                <span>Terdapat Gambar Tersemat</span>
                              </div>
                            )}
                          </div>
                        </div>

                        <div className="flex items-center gap-1 shrink-0">
                          <button
                            type="button"
                            onClick={() => {
                              setEditingQuestion({ ...soal });
                              setShowQuestionModal(true);
                            }}
                            title="Edit Soal"
                            className="p-1.5 rounded-lg text-slate-600 hover:bg-slate-200 cursor-pointer"
                          >
                            <Edit className="w-4 h-4" />
                          </button>
                          <button
                            type="button"
                            onClick={() => handleDeleteQuestion(soal.id)}
                            title="Hapus Soal"
                            className="p-1.5 rounded-lg text-red-500 hover:bg-red-50 cursor-pointer"
                          >
                            <Trash2 className="w-4 h-4" />
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>

            {/* Right Column: Exam Rules & Proctoring Config */}
            <div className="space-y-6">
              {/* Card 3: Schedules & Timer */}
              <div className="bg-white p-6 rounded-2xl border border-slate-200 shadow-xs space-y-4">
                <h3 className="font-bold text-slate-900 text-sm flex items-center gap-2">
                  <Calendar className="w-4 h-4 text-blue-600" />
                  <span>3. Jadwal & Waktu Pengerjaan</span>
                </h3>

                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">Tanggal & Jam Mulai</label>
                  <input
                    type="datetime-local"
                    value={activeUjian.tanggalMulai}
                    onChange={(e) => setActiveUjian({ ...activeUjian, tanggalMulai: e.target.value })}
                    className="w-full bg-slate-50 border border-slate-200 text-slate-800 px-3 py-2 rounded-xl text-xs focus:ring-2 focus:ring-blue-500 focus:outline-hidden"
                  />
                </div>

                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">Tanggal & Jam Berakhir</label>
                  <input
                    type="datetime-local"
                    value={activeUjian.tanggalSelesai}
                    onChange={(e) => setActiveUjian({ ...activeUjian, tanggalSelesai: e.target.value })}
                    className="w-full bg-slate-50 border border-slate-200 text-slate-800 px-3 py-2 rounded-xl text-xs focus:ring-2 focus:ring-blue-500 focus:outline-hidden"
                  />
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-xs font-bold text-slate-700 mb-1">Durasi (Menit)</label>
                    <input
                      type="number"
                      min={10}
                      max={360}
                      value={activeUjian.durasiMenit}
                      onChange={(e) => setActiveUjian({ ...activeUjian, durasiMenit: Number(e.target.value) })}
                      className="w-full bg-slate-50 border border-slate-200 text-slate-800 px-3 py-2 rounded-xl text-xs focus:ring-2 focus:ring-blue-500 focus:outline-hidden"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-bold text-slate-700 mb-1">Batas KKM</label>
                    <input
                      type="number"
                      min={0}
                      max={100}
                      value={activeUjian.kkm}
                      onChange={(e) => setActiveUjian({ ...activeUjian, kkm: Number(e.target.value) })}
                      className="w-full bg-slate-50 border border-slate-200 text-slate-800 px-3 py-2 rounded-xl text-xs focus:ring-2 focus:ring-blue-500 focus:outline-hidden"
                    />
                  </div>
                </div>

                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">Token PIN Ujian (Opsional)</label>
                  <input
                    type="text"
                    value={activeUjian.kodeUjian || ''}
                    onChange={(e) => setActiveUjian({ ...activeUjian, kodeUjian: e.target.value.toUpperCase() })}
                    placeholder="Contoh: PAS5"
                    className="w-full bg-slate-50 border border-slate-200 text-slate-800 px-3 py-2 rounded-xl text-xs font-mono font-bold tracking-wider uppercase focus:ring-2 focus:ring-blue-500 focus:outline-hidden"
                  />
                  <p className="text-[11px] text-slate-400 mt-1">Kosongkan jika siswa boleh masuk tanpa PIN pengawas.</p>
                </div>
              </div>

              {/* Card 4: CBT Anti-Cheat & Proctoring Settings */}
              <div className="bg-white p-6 rounded-2xl border border-slate-200 shadow-xs space-y-4">
                <h3 className="font-bold text-slate-900 text-sm flex items-center gap-2">
                  <ShieldAlert className="w-4 h-4 text-amber-500" />
                  <span>4. Pengawasan Ujian & Anti-Curang</span>
                </h3>

                <div className="space-y-3 text-xs">
                  <label className="flex items-center justify-between p-2.5 rounded-xl bg-slate-50 border border-slate-200 cursor-pointer">
                    <div>
                      <span className="font-bold text-slate-800 block">Aktifkan Pengawasan (Proctoring)</span>
                      <span className="text-[11px] text-slate-500">Deteksi pindah tab, jendela blur & kunci otomatis</span>
                    </div>
                    <input
                      type="checkbox"
                      checked={activeUjian.pengawasanAktif !== false}
                      onChange={(e) => setActiveUjian({ ...activeUjian, pengawasanAktif: e.target.checked })}
                      className="w-4 h-4 text-blue-600 rounded cursor-pointer"
                    />
                  </label>

                  <label className="flex items-center justify-between p-2.5 rounded-xl bg-slate-50 border border-slate-200 cursor-pointer">
                    <div>
                      <span className="font-bold text-slate-800 block">Wajib Layar Penuh (Fullscreen)</span>
                      <span className="text-[11px] text-slate-500">Catat pelanggaran jika keluar fullscreen</span>
                    </div>
                    <input
                      type="checkbox"
                      checked={activeUjian.wajibFullscreen !== false}
                      onChange={(e) => setActiveUjian({ ...activeUjian, wajibFullscreen: e.target.checked })}
                      className="w-4 h-4 text-blue-600 rounded cursor-pointer"
                    />
                  </label>

                  <label className="flex items-center justify-between p-2.5 rounded-xl bg-slate-50 border border-slate-200 cursor-pointer">
                    <div>
                      <span className="font-bold text-slate-800 block">Blokir Copy-Paste & Klik Kanan</span>
                      <span className="text-[11px] text-slate-500">Mencegah siswa menyalin soal ujian</span>
                    </div>
                    <input
                      type="checkbox"
                      checked={activeUjian.blokirCopyPaste !== false}
                      onChange={(e) => setActiveUjian({ ...activeUjian, blokirCopyPaste: e.target.checked })}
                      className="w-4 h-4 text-blue-600 rounded cursor-pointer"
                    />
                  </label>

                  <div>
                    <label className="block text-xs font-bold text-slate-700 mb-1">
                      Batas Maksimal Pelanggaran Sebelum Terkunci
                    </label>
                    <input
                      type="number"
                      min={1}
                      max={10}
                      value={activeUjian.maksimalPelanggaran || 3}
                      onChange={(e) =>
                        setActiveUjian({ ...activeUjian, maksimalPelanggaran: Number(e.target.value) })
                      }
                      className="w-full bg-slate-50 border border-slate-200 text-slate-800 px-3 py-2 rounded-xl text-xs font-bold focus:ring-2 focus:ring-blue-500 focus:outline-hidden"
                    />
                    <p className="text-[11px] text-slate-400 mt-1">
                      Jika siswa berpindah tab sebanyak angka ini, ujian langsung dikunci dan harus dibuka oleh guru.
                    </p>
                  </div>
                </div>
              </div>

              {/* Card 5: Randomization & Score Policy */}
              <div className="bg-white p-6 rounded-2xl border border-slate-200 shadow-xs space-y-4">
                <h3 className="font-bold text-slate-900 text-sm flex items-center gap-2">
                  <Shuffle className="w-4 h-4 text-indigo-600" />
                  <span>5. Aturan Pengacakan & Penilaian</span>
                </h3>

                <div className="space-y-3 text-xs">
                  <label className="flex items-center justify-between p-2.5 rounded-xl bg-slate-50 border border-slate-200 cursor-pointer">
                    <div>
                      <span className="font-bold text-slate-800 block">Acak Urutan Soal</span>
                      <span className="text-[11px] text-slate-500">Urutan nomor berbeda untuk tiap siswa</span>
                    </div>
                    <input
                      type="checkbox"
                      checked={activeUjian.acakSoal}
                      onChange={(e) => setActiveUjian({ ...activeUjian, acakSoal: e.target.checked })}
                      className="w-4 h-4 text-blue-600 rounded cursor-pointer"
                    />
                  </label>

                  <label className="flex items-center justify-between p-2.5 rounded-xl bg-slate-50 border border-slate-200 cursor-pointer">
                    <div>
                      <span className="font-bold text-slate-800 block">Acak Pilihan Jawaban</span>
                      <span className="text-[11px] text-slate-500">Opsi A/B/C/D diacak otomatis</span>
                    </div>
                    <input
                      type="checkbox"
                      checked={activeUjian.acakPilihan}
                      onChange={(e) => setActiveUjian({ ...activeUjian, acakPilihan: e.target.checked })}
                      className="w-4 h-4 text-blue-600 rounded cursor-pointer"
                    />
                  </label>

                  <label className="flex items-center justify-between p-2.5 rounded-xl bg-slate-50 border border-slate-200 cursor-pointer">
                    <div>
                      <span className="font-bold text-slate-800 block">Tampilkan Nilai Langsung</span>
                      <span className="text-[11px] text-slate-500">Siswa dapat melihat skor akhir setelah selesai</span>
                    </div>
                    <input
                      type="checkbox"
                      checked={activeUjian.tampilkanNilaiLangsung}
                      onChange={(e) => setActiveUjian({ ...activeUjian, tampilkanNilaiLangsung: e.target.checked })}
                      className="w-4 h-4 text-blue-600 rounded cursor-pointer"
                    />
                  </label>

                  <div>
                    <label className="block text-xs font-bold text-slate-700 mb-1">Tampilkan Pembahasan Kunci</label>
                    <select
                      value={activeUjian.tampilkanPembahasan}
                      onChange={(e) => setActiveUjian({ ...activeUjian, tampilkanPembahasan: e.target.value as any })}
                      className="w-full bg-slate-50 border border-slate-200 text-slate-800 px-3 py-2 rounded-xl text-xs focus:ring-2 focus:ring-blue-500 focus:outline-hidden cursor-pointer"
                    >
                      <option value="tidak">Sembunyikan Pembahasan</option>
                      <option value="setelah_ujian">Tampilkan Segera Setelah Ujian Selesai</option>
                      <option value="setelah_jadwal_selesai">Tampilkan Hanya Setelah Batas Waktu Jadwal Berakhir</option>
                    </select>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ======================================================== */}
      {/* 3. LIVE PENGAWASAN & PROCTORING VIEW */}
      {/* ======================================================== */}
      {view === 'pengawasan' && pengawasanUjianTarget && (
        <div className="space-y-6">
          {/* Header & Exam Selector */}
          <div className="bg-white p-5 sm:p-6 rounded-2xl border border-slate-200 shadow-xs flex flex-col md:flex-row md:items-center justify-between gap-4">
            <div>
              <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-amber-500/10 border border-amber-500/30 text-amber-600 text-xs font-bold mb-2">
                <Radio className="w-3.5 h-3.5 animate-pulse text-amber-600" />
                <span>Monitoring Real-Time Satuan Pendidikan</span>
              </div>
              <h2 className="text-xl sm:text-2xl font-black text-slate-900 tracking-tight">
                Pengawasan Ujian & Deteksi Kecurangan
              </h2>
              <p className="text-xs text-slate-500 mt-0.5">
                Memantau perpindahan tab, jendela blur, pelanggaran integritas, dan mengendalikan sesi peserta didik secara langsung.
              </p>
            </div>

            <div className="flex items-center gap-3">
              <label className="text-xs text-slate-500 font-semibold hidden sm:inline">Pilih Ujian:</label>
              <select
                value={pengawasanUjianTarget.id}
                onChange={(e) => {
                  const target = ujianList.find((u) => u.id === e.target.value);
                  if (target) {
                    setPengawasanUjianTarget(target);
                    setJawabanList(db.getJawabanUjianList(target.id));
                  }
                }}
                className="bg-slate-50 border border-slate-200 text-slate-800 text-xs sm:text-sm font-bold py-2.5 px-3.5 rounded-xl focus:ring-2 focus:ring-amber-500 focus:outline-hidden cursor-pointer"
              >
                {ujianList.map((u) => (
                  <option key={u.id} value={u.id}>
                    {u.judul} ({u.status})
                  </option>
                ))}
              </select>
            </div>
          </div>

          {/* Real-time Status Metric Cards */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3.5">
            <div className="bg-white p-4 rounded-2xl border border-slate-200 shadow-xs flex items-center gap-3">
              <div className="w-12 h-12 rounded-xl bg-emerald-50 text-emerald-600 flex items-center justify-center font-bold shrink-0">
                <Clock className="w-6 h-6 animate-pulse" />
              </div>
              <div>
                <span className="text-[11px] text-slate-400 font-medium block">Aktif Mengerjakan</span>
                <span className="text-2xl font-black text-emerald-600">{proctoringStats.aktif}</span>
              </div>
            </div>

            <div className="bg-white p-4 rounded-2xl border border-slate-200 shadow-xs flex items-center gap-3">
              <div className="w-12 h-12 rounded-xl bg-amber-50 text-amber-600 flex items-center justify-center font-bold shrink-0">
                <AlertTriangle className="w-6 h-6" />
              </div>
              <div>
                <span className="text-[11px] text-slate-400 font-medium block">Pernah Pindah Tab</span>
                <span className="text-2xl font-black text-amber-600">{proctoringStats.melanggar}</span>
              </div>
            </div>

            <div className="bg-white p-4 rounded-2xl border border-slate-200 shadow-xs flex items-center gap-3">
              <div className="w-12 h-12 rounded-xl bg-red-50 text-red-600 flex items-center justify-center font-bold shrink-0">
                <Lock className="w-6 h-6" />
              </div>
              <div>
                <span className="text-[11px] text-slate-400 font-medium block">Sesi Terkunci</span>
                <span className="text-2xl font-black text-red-600">{proctoringStats.terkunci}</span>
              </div>
            </div>

            <div className="bg-white p-4 rounded-2xl border border-slate-200 shadow-xs flex items-center gap-3">
              <div className="w-12 h-12 rounded-xl bg-blue-50 text-blue-600 flex items-center justify-center font-bold shrink-0">
                <CheckCircle2 className="w-6 h-6" />
              </div>
              <div>
                <span className="text-[11px] text-slate-400 font-medium block">Selesai Mengerjakan</span>
                <span className="text-2xl font-black text-blue-600">{proctoringStats.selesai}</span>
              </div>
            </div>
          </div>

          {/* Live Violation Feed Banner */}
          {recentViolationFeed.length > 0 && (
            <div className="bg-amber-950/20 border border-amber-500/30 rounded-2xl p-4">
              <div className="flex items-center justify-between mb-2">
                <div className="font-bold text-amber-800 text-xs flex items-center gap-1.5">
                  <ShieldAlert className="w-4 h-4 text-amber-600" />
                  <span>Aktivitas Pelanggaran Terbaru (Live Feed):</span>
                </div>
                <span className="text-[10px] text-amber-600 font-medium">Sinkronisasi otomatis</span>
              </div>
              <div className="space-y-1.5 max-h-32 overflow-y-auto pr-1">
                {recentViolationFeed.map((event) => (
                  <div
                    key={event.id}
                    className={`p-2 rounded-xl text-xs flex items-center justify-between gap-3 ${
                      event.isLockEvent
                        ? 'bg-red-50 border border-red-200 text-red-800 font-bold'
                        : 'bg-white/80 border border-amber-200 text-slate-700'
                    }`}
                  >
                    <div className="flex items-center gap-2 truncate">
                      <span className="text-slate-400 font-mono text-[10px]">
                        {new Date(event.waktu).toLocaleTimeString('id-ID')}
                      </span>
                      <strong className="text-slate-900">{event.namaSiswa}</strong>
                      <span className="text-[11px] text-slate-500">({event.kelas})</span>
                      <span className="text-slate-600 truncate">&bull; {event.deskripsi}</span>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Proctoring Students Table */}
          <div className="bg-white rounded-2xl border border-slate-200 shadow-xs overflow-hidden">
            <div className="p-4 border-b border-slate-100 flex flex-col sm:flex-row items-center justify-between gap-3">
              <div className="flex flex-wrap items-center gap-1.5 w-full sm:w-auto">
                {[
                  { id: 'semua', label: 'Semua Peserta' },
                  { id: 'terkunci', label: 'Terkunci 🔴' },
                  { id: 'aktif', label: 'Aktif 🟢' },
                  { id: 'melanggar', label: 'Melanggar 🟡' },
                  { id: 'selesai', label: 'Selesai 🔵' },
                  { id: 'belum', label: 'Belum Masuk' },
                ].map((tab) => (
                  <button
                    key={tab.id}
                    onClick={() => setProctoringFilterStatus(tab.id)}
                    className={`px-3 py-1.5 rounded-xl text-xs font-semibold transition cursor-pointer ${
                      proctoringFilterStatus === tab.id
                        ? 'bg-amber-500 text-slate-950 font-bold shadow-xs'
                        : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                    }`}
                  >
                    {tab.label}
                  </button>
                ))}
              </div>

              <div className="relative w-full sm:w-64">
                <Search className="w-4 h-4 absolute left-3 top-2.5 text-slate-400" />
                <input
                  type="text"
                  value={proctoringSearch}
                  onChange={(e) => setProctoringSearch(e.target.value)}
                  placeholder="Cari siswa atau NISN..."
                  className="w-full bg-slate-50 border border-slate-200 text-slate-800 pl-9 pr-3 py-2 rounded-xl text-xs focus:ring-2 focus:ring-amber-500 focus:outline-hidden"
                />
              </div>
            </div>

            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse text-xs">
                <thead>
                  <tr className="bg-slate-50 border-b border-slate-200 text-slate-600 font-bold">
                    <th className="py-3 px-4 w-12 text-center">No</th>
                    <th className="py-3 px-4">Nama Peserta Didik</th>
                    <th className="py-3 px-4">NIS / NISN</th>
                    <th className="py-3 px-4">Kelas</th>
                    <th className="py-3 px-4 text-center">Status Sesi</th>
                    <th className="py-3 px-4 text-center">Jumlah Pelanggaran</th>
                    <th className="py-3 px-4">Terakhir Aktif</th>
                    <th className="py-3 px-4 text-center">Tindakan Pengawas</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {proctoringStudents.length === 0 ? (
                    <tr>
                      <td colSpan={8} className="py-8 text-center text-slate-400">
                        Tidak ada peserta yang cocok dengan filter pengawasan ini.
                      </td>
                    </tr>
                  ) : (
                    proctoringStudents.map((item, idx) => {
                      const ans = item.jawaban;
                      const isLocked = ans?.status === 'terkunci';
                      const isActive = ans?.status === 'sedang_mengerjakan';
                      const isFinished = ans?.status === 'selesai' || ans?.status === 'waktu_habis';
                      const violationCount = ans?.jumlahPelanggaran || 0;

                      return (
                        <tr
                          key={item.siswa.id}
                          className={`hover:bg-slate-50 transition ${isLocked ? 'bg-red-50/40' : ''}`}
                        >
                          <td className="py-3 px-4 text-center font-semibold text-slate-500">{idx + 1}</td>
                          <td className="py-3 px-4 font-bold text-slate-900">
                            {item.siswa.namaLengkap || (item.siswa as any).nama}
                          </td>
                          <td className="py-3 px-4 text-slate-600">{item.siswa.nisn || item.siswa.nomorInduk || '-'}</td>
                          <td className="py-3 px-4 text-slate-600">{item.siswa.kelas}</td>
                          <td className="py-3 px-4 text-center">
                            {isLocked ? (
                              <span className="px-2.5 py-1 rounded-full text-[11px] font-black bg-red-600 text-white shadow-xs inline-flex items-center gap-1 animate-pulse">
                                <Lock className="w-3 h-3" />
                                <span>TERKUNCI</span>
                              </span>
                            ) : isActive ? (
                              <span className="px-2.5 py-1 rounded-full text-[11px] font-bold bg-emerald-100 text-emerald-800 inline-flex items-center gap-1">
                                <span className="w-2 h-2 rounded-full bg-emerald-500 animate-ping" />
                                <span>Mengerjakan</span>
                              </span>
                            ) : isFinished ? (
                              <span className="px-2.5 py-1 rounded-full text-[11px] font-bold bg-blue-100 text-blue-800">
                                Selesai (Nilai {ans.nilaiAkhir ?? 0})
                              </span>
                            ) : (
                              <span className="px-2.5 py-0.5 rounded-full text-[10px] bg-slate-100 text-slate-500">
                                Belum Masuk
                              </span>
                            )}
                          </td>
                          <td className="py-3 px-4 text-center">
                            {violationCount > 0 ? (
                              <span
                                className={`px-2.5 py-0.5 rounded-full text-xs font-bold ${
                                  violationCount >= (pengawasanUjianTarget.maksimalPelanggaran || 3)
                                    ? 'bg-red-100 text-red-800'
                                    : 'bg-amber-100 text-amber-800'
                                }`}
                              >
                                {violationCount} Kali
                              </span>
                            ) : (
                              <span className="text-slate-400">0</span>
                            )}
                          </td>
                          <td className="py-3 px-4 text-slate-500 text-[11px]">
                            {ans?.terakhirAktif ? new Date(ans.terakhirAktif).toLocaleTimeString('id-ID') : '-'}
                          </td>
                          <td className="py-3 px-4 text-center">
                            <div className="flex items-center justify-center gap-1.5">
                              {isLocked && (
                                <button
                                  onClick={() => handleUnlockSession(pengawasanUjianTarget.id, item.siswa.id)}
                                  className="bg-emerald-600 hover:bg-emerald-500 text-white font-bold px-2.5 py-1 rounded-lg text-xs transition flex items-center gap-1 shadow-xs cursor-pointer"
                                >
                                  <Unlock className="w-3.5 h-3.5" />
                                  <span>Buka Kunci</span>
                                </button>
                              )}

                              {ans && (ans.logPelanggaran || []).length > 0 && (
                                <button
                                  onClick={() => {
                                    setSelectedViolationStudent(item as any);
                                    setShowViolationLogModal(true);
                                  }}
                                  className="bg-amber-50 text-amber-800 hover:bg-amber-100 font-semibold px-2 py-1 rounded-lg text-xs transition flex items-center gap-1 cursor-pointer border border-amber-200"
                                >
                                  <ShieldAlert className="w-3.5 h-3.5 text-amber-600" />
                                  <span>Log ({violationCount})</span>
                                </button>
                              )}

                              {ans && (
                                <button
                                  onClick={() =>
                                    handleResetSession(
                                      pengawasanUjianTarget.id,
                                      item.siswa.id,
                                      item.siswa.namaLengkap || (item.siswa as any).nama
                                    )
                                  }
                                  title="Reset Sesi Siswa"
                                  className="p-1 rounded-lg text-slate-400 hover:text-slate-700 hover:bg-slate-100 transition cursor-pointer"
                                >
                                  <RefreshCw className="w-3.5 h-3.5" />
                                </button>
                              )}

                              {isActive && (
                                <button
                                  onClick={() => handleForceSubmit(pengawasanUjianTarget.id, item.siswa.id)}
                                  title="Paksa Kumpulkan"
                                  className="p-1 rounded-lg text-red-500 hover:bg-red-50 transition cursor-pointer"
                                >
                                  <UserX className="w-3.5 h-3.5" />
                                </button>
                              )}
                            </div>
                          </td>
                        </tr>
                      );
                    })
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* ======================================================== */}
      {/* 4. REKAP NILAI & ANALISIS PER KELAS VIEW */}
      {/* ======================================================== */}
      {view === 'rekap' && rekapUjianTarget && (
        <div className="space-y-6">
          {/* Header Controls */}
          <div className="bg-white p-6 rounded-2xl border border-slate-200 shadow-xs flex flex-col md:flex-row md:items-center justify-between gap-4">
            <div className="flex items-center gap-3">
              <button
                onClick={() => setView('list')}
                className="p-2 rounded-xl text-slate-500 hover:bg-slate-100 transition cursor-pointer"
              >
                <ChevronDown className="w-5 h-5 rotate-90" />
              </button>
              <div>
                <span className="text-xs uppercase font-bold text-emerald-600 tracking-wider">Rekapitulasi Kelas</span>
                <h2 className="text-xl font-bold text-slate-900">{rekapUjianTarget.judul}</h2>
                <div className="text-xs text-slate-500 flex items-center gap-2 mt-0.5">
                  <span>{rekapUjianTarget.mataPelajaran}</span>
                  <span>&bull;</span>
                  <span>Kelas: {rekapUjianTarget.kelasTarget.join(', ')}</span>
                  <span>&bull;</span>
                  <span>KKM: {rekapUjianTarget.kkm || 75}</span>
                </div>
              </div>
            </div>

            <div className="flex items-center gap-2">
              <button
                onClick={handleExportExcel}
                className="bg-emerald-600 hover:bg-emerald-500 text-white font-bold px-4 py-2 rounded-xl text-xs transition shadow-md shadow-emerald-600/20 flex items-center gap-1.5 cursor-pointer"
              >
                <Download className="w-4 h-4" />
                <span>Ekspor Excel (.xlsx)</span>
              </button>
              <button
                onClick={() => setShowPrintRekapModal(true)}
                className="bg-blue-600 hover:bg-blue-700 text-white font-bold px-4 py-2 rounded-xl text-xs transition shadow-md shadow-blue-600/20 flex items-center gap-1.5 cursor-pointer"
              >
                <Printer className="w-4 h-4" />
                <span>Cetak Rekap Resmi</span>
              </button>
            </div>
          </div>

          {/* Statistical Highlights */}
          <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-6 gap-3">
            <div className="bg-white p-3.5 rounded-2xl border border-slate-200 shadow-xs">
              <span className="text-[11px] text-slate-500 block">Siswa Terdaftar</span>
              <span className="text-xl font-bold text-slate-900 mt-1 block">{stats.totalTerdaftar} Siswa</span>
            </div>
            <div className="bg-white p-3.5 rounded-2xl border border-slate-200 shadow-xs">
              <span className="text-[11px] text-slate-500 block">Sudah Selesai</span>
              <span className="text-xl font-bold text-emerald-600 mt-1 block">{stats.totalSudah} Siswa</span>
            </div>
            <div className="bg-white p-3.5 rounded-2xl border border-slate-200 shadow-xs">
              <span className="text-[11px] text-slate-500 block">Belum Mengerjakan</span>
              <span className="text-xl font-bold text-slate-500 mt-1 block">{stats.totalBelum} Siswa</span>
            </div>
            <div className="bg-white p-3.5 rounded-2xl border border-slate-200 shadow-xs">
              <span className="text-[11px] text-slate-500 block">Rata-rata Kelas</span>
              <span className="text-xl font-bold text-blue-600 mt-1 block">{stats.rataRata}</span>
            </div>
            <div className="bg-white p-3.5 rounded-2xl border border-slate-200 shadow-xs">
              <span className="text-[11px] text-slate-500 block">Nilai Tertinggi / Terendah</span>
              <span className="text-xl font-bold text-indigo-600 mt-1 block">
                {stats.nilaiTertinggi} / {stats.nilaiTerendah}
              </span>
            </div>
            <div className="bg-white p-3.5 rounded-2xl border border-slate-200 shadow-xs">
              <span className="text-[11px] text-slate-500 block">Ketuntasan (KKM {rekapUjianTarget.kkm})</span>
              <span className="text-xl font-bold text-emerald-600 mt-1 block">
                {stats.countTuntas} ({stats.persenTuntas}%)
              </span>
            </div>
          </div>

          {/* Audit trail indicator if answer keys were revised */}
          {rekapUjianTarget.riwayatPerubahanKunci && rekapUjianTarget.riwayatPerubahanKunci.length > 0 && (
            <div className="bg-amber-50 border border-amber-200 rounded-2xl p-4 text-xs text-amber-900 flex items-start gap-3">
              <History className="w-5 h-5 text-amber-600 shrink-0 mt-0.5" />
              <div>
                <span className="font-bold">Riwayat Audit Perubahan Kunci Jawaban:</span>
                <div className="mt-1 space-y-1">
                  {rekapUjianTarget.riwayatPerubahanKunci.map((log) => (
                    <div key={log.id} className="text-[11px] text-amber-800">
                      &bull; Soal #{log.nomorSoal}: Kunci diubah dari '{log.kunciLama}' ke '{log.kunciBaru}' oleh{' '}
                      <strong>{log.diubahOleh}</strong> pada {new Date(log.tanggal).toLocaleString('id-ID')} ({log.keterangan}). Nilai siswa telah dikalkulasi ulang secara transparan.
                    </div>
                  ))}
                </div>
              </div>
            </div>
          )}

          {/* Table Filters */}
          <div className="bg-white p-4 rounded-2xl border border-slate-200 shadow-xs flex flex-col sm:flex-row items-center justify-between gap-3">
            <div className="flex items-center gap-1.5 w-full sm:w-auto">
              {[
                { id: 'semua', label: 'Semua Siswa' },
                { id: 'selesai', label: 'Sudah Selesai' },
                { id: 'belum', label: 'Belum Ujian' },
                { id: 'tuntas', label: 'Tuntas' },
                { id: 'belum_tuntas', label: 'Belum Tuntas' },
              ].map((tab) => (
                <button
                  key={tab.id}
                  onClick={() => setRekapFilterStatus(tab.id)}
                  className={`px-3 py-1.5 rounded-xl text-xs font-semibold transition cursor-pointer ${
                    rekapFilterStatus === tab.id
                      ? 'bg-blue-600 text-white shadow-xs'
                      : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                  }`}
                >
                  {tab.label}
                </button>
              ))}
            </div>

            <div className="relative w-full sm:w-64">
              <Search className="w-4 h-4 absolute left-3 top-2.5 text-slate-400" />
              <input
                type="text"
                value={rekapSearch}
                onChange={(e) => setRekapSearch(e.target.value)}
                placeholder="Cari nama siswa atau NISN..."
                className="w-full bg-slate-50 border border-slate-200 text-slate-800 pl-9 pr-3 py-2 rounded-xl text-xs focus:ring-2 focus:ring-blue-500 focus:outline-hidden"
              />
            </div>
          </div>

          {/* Results Table */}
          <div className="bg-white rounded-2xl border border-slate-200 shadow-xs overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse text-xs">
                <thead>
                  <tr className="bg-slate-50 border-b border-slate-200 text-slate-600 font-bold">
                    <th className="py-3 px-4 w-12 text-center">No</th>
                    <th className="py-3 px-4">Nama Peserta Didik</th>
                    <th className="py-3 px-4">NIS / NISN</th>
                    <th className="py-3 px-4">Kelas</th>
                    <th className="py-3 px-4 text-center">Nilai Akhir</th>
                    <th className="py-3 px-4 text-center">Status Ketuntasan</th>
                    <th className="py-3 px-4 text-center">Benar / Salah</th>
                    <th className="py-3 px-4 text-center">Pelanggaran</th>
                    <th className="py-3 px-4">Waktu Selesai</th>
                    <th className="py-3 px-4 text-center">Aksi</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {rekapData.length === 0 ? (
                    <tr>
                      <td colSpan={10} className="py-8 text-center text-slate-400">
                        Tidak ada siswa yang sesuai dengan filter.
                      </td>
                    </tr>
                  ) : (
                    rekapData.map((item, idx) => {
                      const ans = item.jawaban;
                      const hasSubmitted = ans && (ans.status === 'selesai' || ans.status === 'waktu_habis');

                      return (
                        <tr key={item.siswa.id} className="hover:bg-slate-50 transition">
                          <td className="py-3 px-4 text-center font-semibold text-slate-500">{idx + 1}</td>
                          <td className="py-3 px-4 font-bold text-slate-900">
                            {item.siswa.namaLengkap || (item.siswa as any).nama}
                          </td>
                          <td className="py-3 px-4 text-slate-600">{item.siswa.nisn || item.siswa.nomorInduk || '-'}</td>
                          <td className="py-3 px-4 text-slate-600">{item.siswa.kelas}</td>
                          <td className="py-3 px-4 text-center">
                            {hasSubmitted ? (
                              <span
                                className={`text-base font-extrabold ${
                                  ans.lulusKkm ? 'text-emerald-600' : 'text-red-500'
                                }`}
                              >
                                {ans.nilaiAkhir ?? 0}
                              </span>
                            ) : (
                              <span className="text-slate-400 font-medium italic">Belum Ujian</span>
                            )}
                          </td>
                          <td className="py-3 px-4 text-center">
                            {hasSubmitted ? (
                              <span
                                className={`px-2.5 py-0.5 rounded-full text-[10px] font-bold ${
                                  ans.lulusKkm ? 'bg-emerald-100 text-emerald-800' : 'bg-red-100 text-red-800'
                                }`}
                              >
                                {ans.lulusKkm ? 'Tuntas' : 'Belum Tuntas'}
                              </span>
                            ) : (
                              <span className="bg-slate-100 text-slate-500 px-2 py-0.5 rounded-full text-[10px]">
                                Belum Mengerjakan
                              </span>
                            )}
                          </td>
                          <td className="py-3 px-4 text-center text-slate-600">
                            {hasSubmitted ? (
                              <span>
                                <strong className="text-emerald-600">{ans.jumlahBenar || 0}</strong> /{' '}
                                <strong className="text-red-500">{ans.jumlahSalah || 0}</strong>
                              </span>
                            ) : (
                              '-'
                            )}
                          </td>
                          <td className="py-3 px-4 text-center">
                            {ans && (ans.jumlahPelanggaran || 0) > 0 ? (
                              <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-amber-100 text-amber-800">
                                {ans.jumlahPelanggaran}x
                              </span>
                            ) : (
                              <span className="text-slate-400">0</span>
                            )}
                          </td>
                          <td className="py-3 px-4 text-slate-500 text-[11px]">
                            {ans?.waktuSelesai ? new Date(ans.waktuSelesai).toLocaleString('id-ID') : '-'}
                          </td>
                          <td className="py-3 px-4 text-center">
                            {hasSubmitted && (
                              <button
                                onClick={() => {
                                  setSelectedJawabanSiswa(ans);
                                  setShowReviewJawabanModal(true);
                                }}
                                className="bg-blue-50 text-blue-600 hover:bg-blue-100 font-semibold px-2.5 py-1 rounded-lg text-[11px] transition cursor-pointer"
                              >
                                Lembar Jawaban
                              </button>
                            )}
                          </td>
                        </tr>
                      );
                    })
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* ======================================================== */}
      {/* 5. MODAL: SHARE & PRINT QR CODE */}
      {/* ======================================================== */}
      {showShareModal && shareUjianTarget && (
        <div className="fixed inset-0 z-50 bg-black/70 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white rounded-3xl max-w-md w-full p-6 shadow-2xl relative text-center">
            <button
              onClick={() => setShowShareModal(false)}
              className="absolute top-4 right-4 p-2 rounded-xl text-slate-400 hover:text-slate-700 hover:bg-slate-100 cursor-pointer"
            >
              <X className="w-5 h-5" />
            </button>

            <div className="w-12 h-12 bg-blue-100 text-blue-600 rounded-2xl flex items-center justify-center mx-auto mb-3">
              <QrCode className="w-6 h-6" />
            </div>

            <h3 className="text-lg font-bold text-slate-900 mb-1">Bagikan Ujian ke Siswa</h3>
            <p className="text-xs text-slate-500 mb-4">{shareUjianTarget.judul}</p>

            {/* Canvas QR Code */}
            <div className="bg-slate-50 p-4 rounded-2xl border border-slate-200 inline-block mb-4">
              <canvas ref={qrCanvasRef} className="mx-auto rounded-xl shadow-xs" />
              <p className="text-[11px] text-slate-400 mt-2 font-medium">
                Pindai menggunakan kamera ponsel peserta didik
              </p>
            </div>

            {/* Exam Unique Link */}
            <div className="mb-5 text-left">
              <label className="block text-xs font-bold text-slate-700 mb-1">Tautan / Link Ujian Langsung:</label>
              <div className="flex items-center gap-1.5 bg-slate-50 border border-slate-200 rounded-xl p-1.5">
                <input
                  type="text"
                  readOnly
                  value={`${window.location.origin}/#ujian/${shareUjianTarget.id}?school=${shareUjianTarget.schoolId || db.getActiveSchoolId()}`}
                  className="bg-transparent text-xs text-slate-700 px-2 py-1 flex-1 font-mono focus:outline-hidden"
                />
                <button
                  onClick={handleCopyLink}
                  className="bg-blue-600 hover:bg-blue-500 text-white font-bold text-xs px-3 py-1.5 rounded-lg transition flex items-center gap-1 cursor-pointer"
                >
                  {copyFeedback ? <Check className="w-3.5 h-3.5" /> : <Copy className="w-3.5 h-3.5" />}
                  <span>{copyFeedback ? 'Tersalin!' : 'Salin'}</span>
                </button>
              </div>
            </div>

            {/* Token display if exists */}
            {shareUjianTarget.kodeUjian && (
              <div className="p-3 bg-amber-50 border border-amber-200 rounded-xl text-xs text-amber-900 mb-5 flex items-center justify-between">
                <span>Token Akses Siswa:</span>
                <span className="font-mono font-bold text-base text-amber-800 tracking-wider">
                  {shareUjianTarget.kodeUjian}
                </span>
              </div>
            )}

            {/* Action buttons */}
            <div className="grid grid-cols-2 gap-3">
              <button
                onClick={handleDownloadQrPng}
                className="bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold py-2.5 px-4 rounded-xl text-xs transition flex items-center justify-center gap-1.5 cursor-pointer"
              >
                <Download className="w-4 h-4" />
                <span>Unduh PNG</span>
              </button>
              <button
                onClick={handlePrintQrCard}
                className="bg-blue-600 hover:bg-blue-500 text-white font-bold py-2.5 px-4 rounded-xl text-xs transition flex items-center justify-center gap-1.5 shadow-md shadow-blue-600/20 cursor-pointer"
              >
                <Printer className="w-4 h-4" />
                <span>Cetak Kartu</span>
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ======================================================== */}
      {/* 6. MODAL: IMPORT SOAL DARI WORD / PDF OTOMATIS */}
      {/* ======================================================== */}
      {showImportModal && (
        <div className="fixed inset-0 z-50 bg-black/70 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white rounded-3xl max-w-3xl w-full p-6 sm:p-8 shadow-2xl relative max-h-[90vh] flex flex-col">
            <button
              onClick={() => setShowImportModal(false)}
              className="absolute top-4 right-4 p-2 rounded-xl text-slate-400 hover:text-slate-700 hover:bg-slate-100 cursor-pointer"
            >
              <X className="w-5 h-5" />
            </button>

            <div className="flex items-center gap-3 mb-4">
              <div className="w-10 h-10 rounded-xl bg-emerald-100 text-emerald-600 flex items-center justify-center font-bold">
                <Upload className="w-5 h-5" />
              </div>
              <div>
                <h3 className="text-base font-bold text-slate-900">Import Soal Otomatis dari Word & PDF</h3>
                <p className="text-xs text-slate-500">
                  Mengekstrak butir soal, pilihan A-E, kunci jawaban, dan gambar soal secara akurat.
                </p>
              </div>
            </div>

            {/* Upload Step */}
            {importStep === 'upload' && (
              <div className="space-y-4 my-auto">
                <div className="border-2 border-dashed border-emerald-300 bg-emerald-50/40 rounded-3xl p-8 text-center space-y-3">
                  <FileText className="w-12 h-12 text-emerald-600 mx-auto" />
                  <div className="text-sm font-bold text-slate-800">Pilih Berkas Naskah Ujian</div>
                  <p className="text-xs text-slate-500 max-w-md mx-auto">
                    Mendukung berkas <strong>Microsoft Word (.docx)</strong> dan <strong>Dokumen PDF (.pdf)</strong>. Gambar dan diagram yang tersemat pada soal akan diekstrak langsung.
                  </p>

                  <label className="inline-block bg-emerald-600 hover:bg-emerald-500 text-white font-bold text-xs py-3 px-6 rounded-xl transition cursor-pointer shadow-md shadow-emerald-600/20">
                    <span>Pilih Berkas dari Perangkat</span>
                    <input type="file" accept=".docx,.pdf" onChange={handleFileUpload} className="hidden" />
                  </label>
                </div>

                {importLoading && (
                  <div className="bg-slate-50 border border-slate-200 rounded-2xl p-4 text-center space-y-2">
                    <div className="w-8 h-8 border-4 border-emerald-500 border-t-transparent rounded-full animate-spin mx-auto" />
                    <div className="text-xs font-bold text-slate-800">Sedang Menganalisis Dokumen...</div>
                    <p className="text-[11px] text-slate-500">
                      Membaca isi naskah, mengekstrak gambar pendukung, dan mendeteksi kunci jawaban...
                    </p>
                  </div>
                )}

                {importError && (
                  <div className="p-4 bg-red-50 border border-red-200 text-red-800 rounded-2xl text-xs space-y-2">
                    <div className="flex items-start gap-2.5">
                      <AlertCircle className="w-5 h-5 text-red-600 shrink-0 mt-0.5" />
                      <div className="space-y-1 flex-1">
                        <strong className="font-bold text-red-900 block">Gagal Memproses Dokumen:</strong>
                        <p className="leading-relaxed text-red-700">{importError}</p>
                      </div>
                    </div>
                    <div className="pt-2 border-t border-red-100 flex items-center justify-between">
                      <span className="text-[11px] text-red-500">
                        Pastikan berkas tidak rusak dan berformat .docx atau .pdf
                      </span>
                      <button
                        type="button"
                        onClick={() => setImportError(null)}
                        className="px-3 py-1 bg-white border border-red-200 text-red-700 hover:bg-red-50 rounded-lg text-xs font-semibold cursor-pointer"
                      >
                        Tutup Pesan
                      </button>
                    </div>
                  </div>
                )}
              </div>
            )}

            {/* Preview Step */}
            {importStep === 'preview' && importResult && (
              <div className="flex-1 flex flex-col min-h-0 space-y-4">
                <div className="bg-slate-50 p-3.5 rounded-xl border border-slate-200 text-xs flex flex-wrap items-center justify-between gap-2">
                  <div>
                    <span className="text-slate-500">Hasil Analisis Berkas:</span>
                    <strong className="text-slate-800 ml-1.5">{importResult.fileName}</strong>
                  </div>
                  <span className="bg-emerald-100 text-emerald-800 font-bold px-2.5 py-0.5 rounded-md">
                    {importResult.totalSoal} Butir Soal Teridentifikasi
                  </span>
                </div>

                {/* Question Preview List */}
                <div className="flex-1 overflow-y-auto space-y-3 pr-1">
                  {importResult.soalList.map((soal, idx) => (
                    <div
                      key={soal.id || idx}
                      className={`p-3.5 rounded-xl border text-xs space-y-2 ${
                        soal.perluVerifikasi ? 'bg-amber-50/70 border-amber-300' : 'bg-white border-slate-200'
                      }`}
                    >
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-2">
                          <span className="w-6 h-6 rounded-lg bg-slate-800 text-white font-bold text-xs flex items-center justify-center">
                            {soal.nomor || idx + 1}
                          </span>
                          <span className="font-semibold text-slate-700 uppercase text-[11px]">
                            {soal.tipe.replace('_', ' ')}
                          </span>
                        </div>

                        <div className="flex items-center gap-2">
                          {/* Quick Key Selection */}
                          <div className="flex items-center gap-1.5 bg-emerald-50 border border-emerald-200 px-2 py-0.5 rounded-lg">
                            <span className="text-[11px] font-bold text-emerald-800">Kunci:</span>
                            {soal.tipe === 'pilihan_ganda' ? (
                              <select
                                value={soal.kunciJawaban || ''}
                                onChange={(e) => handleChangeImportKey(idx, e.target.value)}
                                className="bg-transparent font-bold text-emerald-700 text-xs focus:outline-hidden cursor-pointer"
                              >
                                <option value="">Pilih</option>
                                <option value="A">A</option>
                                <option value="B">B</option>
                                <option value="C">C</option>
                                <option value="D">D</option>
                                <option value="E">E</option>
                              </select>
                            ) : (
                              <span className="font-bold text-emerald-700">{soal.kunciJawaban || 'Belum diisi'}</span>
                            )}
                          </div>

                          {/* Delete question from preview */}
                          <button
                            type="button"
                            title="Hapus butir soal ini dari hasil impor"
                            onClick={() => handleDeleteImportQuestion(idx)}
                            className="p-1 text-slate-400 hover:text-red-600 rounded hover:bg-slate-100 transition cursor-pointer"
                          >
                            <Trash2 className="w-4 h-4" />
                          </button>
                        </div>
                      </div>

                      <p className="text-slate-800 leading-relaxed font-medium">{soal.pertanyaan}</p>

                      {soal.gambar && (
                        <div className="my-2">
                          <img src={soal.gambar} alt="Soal" className="max-h-36 rounded-lg border border-slate-200" />
                        </div>
                      )}

                      {soal.pilihan && (
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-1.5 text-slate-700 bg-slate-50 p-2.5 rounded-lg border border-slate-100">
                          {Object.entries(soal.pilihan).map(([k, v]) => (
                            <div
                              key={k}
                              className={`p-1 rounded ${
                                soal.kunciJawaban === k ? 'bg-emerald-100/70 font-semibold text-emerald-900' : ''
                              }`}
                            >
                              <strong className="mr-1">{k}.</strong> {v}
                            </div>
                          ))}
                        </div>
                      )}

                      {soal.catatanVerifikasi && (
                        <p className="text-amber-700 italic text-[11px] bg-amber-100/50 p-1.5 rounded">
                          * {soal.catatanVerifikasi}
                        </p>
                      )}
                    </div>
                  ))}
                </div>

                <div className="pt-3 border-t border-slate-200 flex items-center justify-end gap-2">
                  <button
                    type="button"
                    onClick={() => {
                      setImportStep('upload');
                      setImportResult(null);
                    }}
                    className="bg-slate-100 hover:bg-slate-200 text-slate-700 font-semibold px-4 py-2 rounded-xl text-xs transition cursor-pointer"
                  >
                    Batal / Unggah Ulang
                  </button>
                  <button
                    type="button"
                    onClick={handleApplyImportResult}
                    className="bg-emerald-600 hover:bg-emerald-500 text-white font-bold px-5 py-2 rounded-xl text-xs transition shadow-md shadow-emerald-600/20 cursor-pointer"
                  >
                    Terapkan {importResult.totalSoal} Soal ke Ujian Ini
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {/* ======================================================== */}
      {/* 7. MODAL: TAMBAH / EDIT SOAL MANUAL */}
      {/* ======================================================== */}
      {showQuestionModal && editingQuestion && (
        <div className="fixed inset-0 z-50 bg-black/70 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white rounded-3xl max-w-2xl w-full p-6 sm:p-7 shadow-2xl relative max-h-[90vh] overflow-y-auto space-y-4">
            <button
              onClick={() => setShowQuestionModal(false)}
              className="absolute top-4 right-4 p-2 rounded-xl text-slate-400 hover:text-slate-700 hover:bg-slate-100 cursor-pointer"
            >
              <X className="w-5 h-5" />
            </button>

            <h3 className="text-base font-bold text-slate-900">
              {editingQuestion.pertanyaan ? `Edit Butir Soal #${editingQuestion.nomor}` : 'Tambah Butir Soal Baru'}
            </h3>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">Jenis Soal</label>
                <select
                  value={editingQuestion.tipe}
                  onChange={(e) => {
                    const newType = e.target.value as JenisSoal;
                    setEditingQuestion({
                      ...editingQuestion,
                      tipe: newType,
                      pilihan:
                        newType === 'pilihan_ganda'
                          ? { A: '', B: '', C: '', D: '' }
                          : newType === 'benar_salah'
                          ? { Benar: 'Benar', Salah: 'Salah' }
                          : undefined,
                      kunciJawaban: newType === 'benar_salah' ? 'Benar' : editingQuestion.kunciJawaban || 'A',
                    });
                  }}
                  className="w-full bg-slate-50 border border-slate-200 text-slate-800 px-3 py-2 rounded-xl text-xs focus:ring-2 focus:ring-blue-500 focus:outline-hidden cursor-pointer"
                >
                  <option value="pilihan_ganda">Pilihan Ganda (A, B, C, D)</option>
                  <option value="benar_salah">Benar / Salah</option>
                  <option value="isian">Isian Singkat</option>
                  <option value="esai">Esai / Uraian</option>
                </select>
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">Bobot Nilai (Poin)</label>
                <input
                  type="number"
                  min={1}
                  max={50}
                  value={editingQuestion.bobot || 1}
                  onChange={(e) => setEditingQuestion({ ...editingQuestion, bobot: Number(e.target.value) })}
                  className="w-full bg-slate-50 border border-slate-200 text-slate-800 px-3 py-2 rounded-xl text-xs focus:ring-2 focus:ring-blue-500 focus:outline-hidden"
                />
              </div>
            </div>

            {/* Question Text */}
            <div>
              <label className="block text-xs font-bold text-slate-700 mb-1">Teks Pertanyaan *</label>
              <textarea
                rows={4}
                value={editingQuestion.pertanyaan}
                onChange={(e) => setEditingQuestion({ ...editingQuestion, pertanyaan: e.target.value })}
                placeholder="Tuliskan butir soal atau stimulus bacaan di sini..."
                className="w-full bg-slate-50 border border-slate-200 text-slate-800 p-3 rounded-xl text-xs focus:ring-2 focus:ring-blue-500 focus:outline-hidden leading-relaxed"
              />
            </div>

            {/* Embedded Image Upload */}
            <div>
              <label className="block text-xs font-bold text-slate-700 mb-1">Gambar Soal (Opsional)</label>
              <div className="flex items-center gap-3">
                <input
                  type="file"
                  accept="image/*"
                  onChange={handleQuestionImageUpload}
                  className="text-xs text-slate-500 file:mr-2 file:py-1.5 file:px-3 file:rounded-lg file:border-0 file:text-xs file:font-semibold file:bg-blue-50 file:text-blue-700 hover:file:bg-blue-100 cursor-pointer"
                />
                {editingQuestion.gambar && (
                  <button
                    type="button"
                    onClick={() => setEditingQuestion({ ...editingQuestion, gambar: undefined })}
                    className="text-xs text-red-500 hover:underline cursor-pointer"
                  >
                    Hapus Gambar
                  </button>
                )}
              </div>
              {editingQuestion.gambar && (
                <div className="mt-2">
                  <img src={editingQuestion.gambar} alt="Pratinjau" className="max-h-36 rounded-xl border border-slate-200" />
                </div>
              )}
            </div>

            {/* Options for Multiple Choice */}
            {editingQuestion.tipe === 'pilihan_ganda' && editingQuestion.pilihan && (
              <div className="space-y-2">
                <label className="block text-xs font-bold text-slate-700">Pilihan Jawaban (A, B, C, D):</label>
                {['A', 'B', 'C', 'D'].map((key) => (
                  <div key={key} className="flex items-center gap-2">
                    <span className="w-7 h-7 rounded-lg bg-slate-100 font-bold text-xs flex items-center justify-center text-slate-700 shrink-0">
                      {key}
                    </span>
                    <input
                      type="text"
                      value={editingQuestion.pilihan?.[key] || ''}
                      onChange={(e) =>
                        setEditingQuestion({
                          ...editingQuestion,
                          pilihan: {
                            ...editingQuestion.pilihan,
                            [key]: e.target.value,
                          },
                        })
                      }
                      placeholder={`Teks pilihan opsi ${key}...`}
                      className="w-full bg-slate-50 border border-slate-200 text-slate-800 px-3 py-1.5 rounded-xl text-xs focus:ring-2 focus:ring-blue-500 focus:outline-hidden"
                    />
                  </div>
                ))}
              </div>
            )}

            {/* Answer Key Input */}
            <div>
              <label className="block text-xs font-bold text-slate-700 mb-1">Kunci Jawaban Benar *</label>
              {editingQuestion.tipe === 'pilihan_ganda' ? (
                <select
                  value={editingQuestion.kunciJawaban}
                  onChange={(e) => setEditingQuestion({ ...editingQuestion, kunciJawaban: e.target.value })}
                  className="w-full bg-slate-50 border border-slate-200 text-slate-800 px-3 py-2 rounded-xl text-xs font-bold focus:ring-2 focus:ring-blue-500 focus:outline-hidden cursor-pointer"
                >
                  <option value="A">A</option>
                  <option value="B">B</option>
                  <option value="C">C</option>
                  <option value="D">D</option>
                </select>
              ) : editingQuestion.tipe === 'benar_salah' ? (
                <select
                  value={editingQuestion.kunciJawaban}
                  onChange={(e) => setEditingQuestion({ ...editingQuestion, kunciJawaban: e.target.value })}
                  className="w-full bg-slate-50 border border-slate-200 text-slate-800 px-3 py-2 rounded-xl text-xs font-bold focus:ring-2 focus:ring-blue-500 focus:outline-hidden cursor-pointer"
                >
                  <option value="Benar">Benar</option>
                  <option value="Salah">Salah</option>
                </select>
              ) : (
                <input
                  type="text"
                  value={editingQuestion.kunciJawaban}
                  onChange={(e) => setEditingQuestion({ ...editingQuestion, kunciJawaban: e.target.value })}
                  placeholder="Ketik kata kunci atau teks jawaban acuan..."
                  className="w-full bg-slate-50 border border-slate-200 text-slate-800 px-3 py-2 rounded-xl text-xs focus:ring-2 focus:ring-blue-500 focus:outline-hidden"
                />
              )}
            </div>

            {/* Explanation / Pembahasan */}
            <div>
              <label className="block text-xs font-bold text-slate-700 mb-1">
                Penjelasan / Pembahasan Soal (Opsional)
              </label>
              <textarea
                rows={2}
                value={editingQuestion.pembahasan || ''}
                onChange={(e) => setEditingQuestion({ ...editingQuestion, pembahasan: e.target.value })}
                placeholder="Penjelasan kenapa opsi ini benar untuk umpan balik siswa..."
                className="w-full bg-slate-50 border border-slate-200 text-slate-800 p-2.5 rounded-xl text-xs focus:ring-2 focus:ring-blue-500 focus:outline-hidden resize-none"
              />
            </div>

            <div className="pt-3 border-t border-slate-200 flex items-center justify-end gap-2">
              <button
                type="button"
                onClick={() => setShowQuestionModal(false)}
                className="bg-slate-100 hover:bg-slate-200 text-slate-700 font-semibold px-4 py-2 rounded-xl text-xs transition cursor-pointer"
              >
                Batal
              </button>
              <button
                type="button"
                onClick={handleSaveQuestion}
                className="bg-blue-600 hover:bg-blue-500 text-white font-bold px-5 py-2 rounded-xl text-xs transition shadow-md shadow-blue-600/20 cursor-pointer"
              >
                Simpan Soal
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ======================================================== */}
      {/* 8. MODAL: LIHAT LOG DETAIL PELANGGARAN SISWA */}
      {/* ======================================================== */}
      {showViolationLogModal && selectedViolationStudent && (
        <div className="fixed inset-0 z-50 bg-black/70 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white rounded-3xl max-w-xl w-full p-6 shadow-2xl relative">
            <button
              onClick={() => setShowViolationLogModal(false)}
              className="absolute top-4 right-4 p-2 rounded-xl text-slate-400 hover:text-slate-700 hover:bg-slate-100 cursor-pointer"
            >
              <X className="w-5 h-5" />
            </button>

            <div className="flex items-center gap-3 mb-4">
              <div className="w-12 h-12 bg-amber-100 text-amber-700 rounded-2xl flex items-center justify-center font-bold">
                <ShieldAlert className="w-6 h-6" />
              </div>
              <div>
                <h3 className="text-base font-bold text-slate-900">
                  Riwayat Pelanggaran: {selectedViolationStudent.siswa.namaLengkap || (selectedViolationStudent.siswa as any).nama}
                </h3>
                <p className="text-xs text-slate-500">
                  Kelas {selectedViolationStudent.siswa.kelas} &bull; NISN:{' '}
                  {selectedViolationStudent.siswa.nisn || '-'}
                </p>
              </div>
            </div>

            <div className="bg-slate-50 p-3 rounded-2xl border border-slate-200 text-xs mb-4 flex items-center justify-between">
              <span>Status Sesi Saat Ini:</span>
              <span
                className={`font-bold px-2.5 py-0.5 rounded-full text-[11px] ${
                  selectedViolationStudent.jawaban.status === 'terkunci'
                    ? 'bg-red-100 text-red-800'
                    : selectedViolationStudent.jawaban.status === 'sedang_mengerjakan'
                    ? 'bg-emerald-100 text-emerald-800'
                    : 'bg-blue-100 text-blue-800'
                }`}
              >
                {selectedViolationStudent.jawaban.status.toUpperCase()}
              </span>
            </div>

            {/* List of violations */}
            <div className="max-h-64 overflow-y-auto space-y-2 pr-1 mb-4">
              {(selectedViolationStudent.jawaban.logPelanggaran || []).length === 0 ? (
                <div className="p-6 text-center text-xs text-slate-400">Tidak ada riwayat pelanggaran tercatat.</div>
              ) : (
                (selectedViolationStudent.jawaban.logPelanggaran || []).map((log, i) => (
                  <div key={log.id || i} className="p-3 bg-slate-50 border border-slate-200 rounded-xl text-xs space-y-1">
                    <div className="flex items-center justify-between text-[11px]">
                      <span className="font-bold text-slate-700 capitalize">
                        #{i + 1} {log.jenis.replace('_', ' ')}
                      </span>
                      <span className="text-slate-400 font-mono">
                        {new Date(log.waktu).toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit', second: '2-digit' })}
                      </span>
                    </div>
                    <p className="text-slate-800">{log.deskripsi}</p>
                    {log.durasiKeluarDetik && log.durasiKeluarDetik > 0 ? (
                      <span className="text-[10px] text-amber-600 font-semibold block">
                        Durasi di luar jendela: {log.durasiKeluarDetik} detik
                      </span>
                    ) : null}
                  </div>
                ))
              )}
            </div>

            <div className="pt-3 border-t border-slate-100 flex items-center justify-between">
              {selectedViolationStudent.jawaban.status === 'terkunci' ? (
                <button
                  onClick={() => {
                    handleUnlockSession(
                      selectedViolationStudent.jawaban.ujianId,
                      selectedViolationStudent.siswa.id
                    );
                    setShowViolationLogModal(false);
                  }}
                  className="bg-emerald-600 hover:bg-emerald-500 text-white font-bold px-4 py-2 rounded-xl text-xs transition flex items-center gap-1.5 cursor-pointer"
                >
                  <Unlock className="w-4 h-4" />
                  <span>Buka Kunci Sesi Siswa</span>
                </button>
              ) : (
                <div />
              )}
              <button
                onClick={() => setShowViolationLogModal(false)}
                className="bg-slate-800 text-white font-bold text-xs py-2 px-5 rounded-xl cursor-pointer"
              >
                Tutup
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ======================================================== */}
      {/* 9. MODAL: LIHAT LEMBAR JAWABAN SISWA & KOREKSI ESAI */}
      {/* ======================================================== */}
      {showReviewJawabanModal && selectedJawabanSiswa && rekapUjianTarget && (
        <div className="fixed inset-0 z-50 bg-black/70 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white rounded-3xl max-w-2xl w-full p-6 shadow-2xl relative max-h-[90vh] flex flex-col">
            <button
              onClick={() => setShowReviewJawabanModal(false)}
              className="absolute top-4 right-4 p-2 rounded-xl text-slate-400 hover:text-slate-700 hover:bg-slate-100 cursor-pointer"
            >
              <X className="w-5 h-5" />
            </button>

            <div className="pb-3 border-b border-slate-100 mb-4">
              <span className="text-xs font-bold text-blue-600 uppercase">Lembar Jawaban Peserta Didik</span>
              <h3 className="text-lg font-bold text-slate-900">{selectedJawabanSiswa.namaSiswa}</h3>
              <div className="text-xs text-slate-500 flex items-center gap-2 mt-0.5">
                <span>Kelas: {selectedJawabanSiswa.kelas}</span>
                <span>&bull;</span>
                <span>
                  Nilai Akhir:{' '}
                  <strong
                    className={`text-sm ${
                      selectedJawabanSiswa.lulusKkm ? 'text-emerald-600' : 'text-red-500'
                    }`}
                  >
                    {selectedJawabanSiswa.nilaiAkhir ?? 0}
                  </strong>
                </span>
                <span>&bull;</span>
                <span>
                  Benar: {selectedJawabanSiswa.jumlahBenar} / Salah: {selectedJawabanSiswa.jumlahSalah}
                </span>
              </div>
            </div>

            {/* Answer List Review */}
            <div className="flex-1 overflow-y-auto space-y-4 pr-1">
              {rekapUjianTarget.soalList.map((soal) => {
                const ans = selectedJawabanSiswa.jawaban[soal.id];
                const isBenar = ans?.isBenar;

                return (
                  <div key={soal.id} className="p-4 bg-slate-50 rounded-2xl border border-slate-200 text-xs space-y-2">
                    <div className="flex items-center justify-between">
                      <span className="font-bold text-slate-800">
                        Soal #{soal.nomor} ({soal.tipe})
                      </span>
                      {soal.tipe === 'esai' ? (
                        <span className="bg-purple-100 text-purple-800 font-bold px-2 py-0.5 rounded text-[10px]">
                          Soal Esai
                        </span>
                      ) : (
                        <span
                          className={`font-bold px-2 py-0.5 rounded text-[10px] ${
                            isBenar ? 'bg-emerald-100 text-emerald-800' : 'bg-red-100 text-red-800'
                          }`}
                        >
                          {isBenar ? 'Benar' : 'Salah'}
                        </span>
                      )}
                    </div>

                    <p className="text-slate-800 font-medium">{soal.pertanyaan}</p>

                    <div className="bg-white p-3 rounded-xl border border-slate-200 space-y-1">
                      <div>
                        Jawaban Siswa:{' '}
                        <strong className="text-slate-900">{ans?.jawabanDipilih || '(Kosong / Tidak dijawab)'}</strong>
                      </div>
                      <div className="text-slate-500">
                        Kunci Jawaban: <strong className="text-emerald-600">{soal.kunciJawaban}</strong>
                      </div>
                    </div>

                    {/* Manual essay scoring input */}
                    {soal.tipe === 'esai' && (
                      <div className="bg-purple-50 p-3 rounded-xl border border-purple-200 space-y-2">
                        <span className="font-bold text-purple-900 block">Penilaian Esai oleh Guru:</span>
                        <div className="flex items-center gap-2">
                          <label className="text-slate-600">Skor Diperoleh (Maks {soal.bobot || 2}):</label>
                          <input
                            type="number"
                            min={0}
                            max={soal.bobot || 10}
                            defaultValue={ans?.skorDidapat ?? 0}
                            onBlur={(e) => handleSaveEssayScore(soal.id, Number(e.target.value))}
                            className="w-16 bg-white border border-purple-300 text-purple-900 font-bold px-2 py-1 rounded text-center"
                          />
                        </div>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>

            <div className="pt-3 border-t border-slate-200 flex justify-end">
              <button
                onClick={() => setShowReviewJawabanModal(false)}
                className="bg-slate-800 text-white font-bold text-xs py-2 px-5 rounded-xl cursor-pointer"
              >
                Tutup
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Official Print Rekap Modal for CBT Exam */}
      {rekapUjianTarget && (
        <PrintRekapModal
          isOpen={showPrintRekapModal}
          onClose={() => setShowPrintRekapModal(false)}
          title="DAFTAR REKAPITULASI NILAI UJIAN BERBASIS KOMPUTER (CBT)"
          subtitle={`${rekapUjianTarget.judul} (${rekapUjianTarget.mataPelajaran})`}
          metadata={[
            { label: 'Mata Pelajaran', value: rekapUjianTarget.mataPelajaran || '-' },
            { label: 'Kelas Target', value: rekapUjianTarget.kelasTarget.join(', ') || '-' },
            {
              label: 'Waktu Pelaksanaan',
              value: new Date(rekapUjianTarget.tanggalMulai || rekapUjianTarget.createdAt).toLocaleDateString(
                'id-ID',
                { dateStyle: 'full' }
              ),
            },
            { label: 'Nilai KKM', value: String(rekapUjianTarget.kkm || 75) },
            {
              label: 'Guru Pengampu',
              value: rekapUjianTarget.guruNama || currentUser.name || 'Guru Mata Pelajaran',
            },
            { label: 'Rata-rata Nilai', value: String(stats.rataRata) },
          ]}
          summaryItems={[
            { label: 'Terdaftar', count: stats.totalTerdaftar },
            { label: 'Selesai Ujian', count: stats.totalSudah, colorClass: 'text-emerald-700 bg-emerald-50' },
            { label: 'Belum Ujian', count: stats.totalBelum, colorClass: 'text-slate-700 bg-slate-50' },
            { label: 'Tuntas KKM', count: stats.countTuntas, colorClass: 'text-blue-700 bg-blue-50' },
            {
              label: 'Belum Tuntas',
              count: Math.max(0, stats.totalSudah - stats.countTuntas),
              colorClass: 'text-amber-700 bg-amber-50',
            },
          ]}
          columns={[
            {
              header: 'No',
              render: (_, idx) => idx + 1,
              width: '35px',
              align: 'center',
            },
            {
              header: 'NIS / NISN',
              render: (row) => row.siswa.nisn || row.siswa.nomorInduk || (row.siswa as any).nis || '-',
              width: '90px',
            },
            {
              header: 'Nama Lengkap Siswa',
              render: (row) => row.siswa.namaLengkap || (row.siswa as any).nama || '-',
              width: '200px',
            },
            {
              header: 'Kelas',
              render: (row) => row.siswa.kelas || '-',
              width: '65px',
              align: 'center',
            },
            {
              header: 'B / S / K',
              render: (row) =>
                row.jawaban
                  ? `${row.jawaban.jumlahBenar ?? 0} / ${row.jawaban.jumlahSalah ?? 0} / ${
                      row.jawaban.jumlahKosong ?? 0
                    }`
                  : '-',
              width: '75px',
              align: 'center',
            },
            {
              header: 'Nilai Akhir',
              render: (row) => (row.jawaban?.nilaiAkhir !== undefined ? row.jawaban.nilaiAkhir : '-'),
              width: '75px',
              align: 'center',
            },
            {
              header: 'Status Ketuntasan',
              render: (row) =>
                row.jawaban ? (row.jawaban.lulusKkm ? 'TUNTAS' : 'BELUM TUNTAS') : 'BELUM MENGERJAKAN',
              width: '120px',
              align: 'center',
            },
            {
              header: 'Waktu Pengumpulan',
              render: (row) =>
                row.jawaban?.waktuSelesai
                  ? new Date(row.jawaban.waktuSelesai).toLocaleTimeString('id-ID', {
                      hour: '2-digit',
                      minute: '2-digit',
                    })
                  : '-',
              width: '80px',
              align: 'center',
            },
          ]}
          data={rekapData}
          signRole2="Guru Mata Pelajaran / Penguji"
          signName2={rekapUjianTarget.guruNama || currentUser.name || 'Guru Mata Pelajaran'}
          footerNote={`* Rekapitulasi nilai ini sah dan dihasilkan secara otomatis melalui Sistem CBT Ujian Online ${db.getSekolah().nama} pada tanggal ${new Intl.DateTimeFormat('id-ID', { dateStyle: 'full' }).format(new Date())}.`}
        />
      )}
    </div>
  );
};
