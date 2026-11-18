import React, { useState, useEffect, useRef } from 'react';
import jsQR from 'jsqr';
import * as XLSX from 'xlsx';
import jsPDF from 'jspdf';
import { db } from '../../services/database';
import { sound } from '../../services/audio';
import { toast } from '../../utils/toast';
import { generateQrDataUrl } from '../../utils/qrHelper';
import {
  parseExamDocument,
  ParseDocumentResult,
  applyAnswerKeysFromText,
  ExtractedImageAsset,
} from '../../services/examDocumentParser';
import { uploadExamQuestionsImages, deleteExamImage } from '../../services/imageStorageService';
import { runExamLoadSimulation, LoadTestResult } from '../../services/examLoadTester';
import {
  UjianOnline,
  SesiUjianSiswa,
  SoalUjian,
  Siswa,
  User,
  StatusUjian,
  Settings,
  ModePengacakanUjian,
  BankSoalItem,
  TingkatKesulitanSoal,
  TipeSoalUjian,
} from '../../types';
import {
  FileText,
  Plus,
  QrCode,
  Upload,
  Clock,
  CheckCircle,
  AlertTriangle,
  Users,
  Search,
  Filter,
  Trash2,
  Edit,
  Eye,
  FileSpreadsheet,
  Download,
  Camera,
  CameraOff,
  Sparkles,
  Shield,
  KeyRound,
  ExternalLink,
  Save,
  CheckCircle2,
  RefreshCw,
  BookOpen,
  Send,
  HelpCircle,
  Copy,
  ChevronRight,
  X,
  Share2,
  MessageSquare,
  Lock,
  Unlock,
  Printer,
  Activity,
  Check,
  AlertCircle,
  Cpu,
  Zap,
  BarChart2,
  Image as ImageIcon,
  ZoomIn,
  Sliders,
  ImagePlus,
  Smartphone,
  Monitor,
  ShieldAlert,
  ArrowUp,
  ArrowDown,
  ClipboardPaste,
  Database,
  Layers,
  Calendar,
} from 'lucide-react';
import confetti from 'canvas-confetti';
import { ExamImageManagerModal, AvailableImageOption } from '../ujian/ExamImageManagerModal';
import { ImageLightboxModal } from '../ujian/ImageLightboxModal';
import { ExamRichContent, renderMathAndTextInline } from '../ujian/ExamRichContent';
import { ExamPasteEditor } from '../ujian/ExamPasteEditor';
import { PasteParseExamResult } from '../../utils/examPasteParser';
import {
  buildDisplayedChoicesForQuestion,
  computeExamAnalytics,
  doesStudentMatchTargetClasses,
} from '../../utils/examShuffleAndScore';
import { ConfirmModal } from '../common/ConfirmModal';

interface UjianOnlineViewProps {
  currentUser: User;
}

export const UjianOnlineView: React.FC<UjianOnlineViewProps> = ({ currentUser }) => {
  const effectiveRole = currentUser?.role;
  const isAuthorizedStaff =
    effectiveRole === 'admin' || effectiveRole === 'guru' || effectiveRole === 'superadmin';

  const [settings, setSettings] = useState<Settings>(() => db.getSettings());
  const [activeSubTab, setActiveSubTab] = useState<'daftar' | 'buat' | 'bank' | 'pengawasan' | 'penilaian' | 'simulasi'>('daftar');
  const [creationMethod, setCreationMethod] = useState<'upload' | 'paste' | 'manual'>('upload');

  // Exam List & Selected Exam
  const [ujianList, setUjianList] = useState<UjianOnline[]>(() => db.getUjianList());
  const [selectedUjianId, setSelectedUjianId] = useState<string>('');
  const [editingUjian, setEditingUjian] = useState<UjianOnline | null>(null);

  // Bank Soal State
  const [bankSoalList, setBankSoalList] = useState<BankSoalItem[]>(() => db.getBankSoalList());
  const [bankSearch, setBankSearch] = useState('');
  const [bankFilterMapel, setBankFilterMapel] = useState('');
  const [bankFilterKelas, setBankFilterKelas] = useState('');
  const [bankFilterKesulitan, setBankFilterKesulitan] = useState<string>('');
  const [selectedBankIds, setSelectedBankIds] = useState<string[]>([]);
  const [showBankPickerModal, setShowBankPickerModal] = useState(false);
  const [bankPickerSelectedIds, setBankPickerSelectedIds] = useState<string[]>([]);
  const [bankSaveModal, setBankSaveModal] = useState<{
    mode: 'single' | 'bulk';
    soal?: SoalUjian;
  } | null>(null);
  const [bankMetaForm, setBankMetaForm] = useState<{
    mataPelajaran: string;
    kelas: string;
    materi: string;
    tingkatKesulitan: TingkatKesulitanSoal;
  }>({
    mataPelajaran: '',
    kelas: '',
    materi: '',
    tingkatKesulitan: 'sedang',
  });
  const [bankManualModalOpen, setBankManualModalOpen] = useState(false);
  const [bankEditingItem, setBankEditingItem] = useState<BankSoalItem | null>(null);
  const [bankItemForm, setBankItemForm] = useState<{
    mataPelajaran: string;
    kelas: string;
    materi: string;
    tingkatKesulitan: TingkatKesulitanSoal;
    tipe: TipeSoalUjian;
    pertanyaan: string;
    pilihanA: string;
    pilihanB: string;
    pilihanC: string;
    pilihanD: string;
    pilihanE: string;
    kunciJawaban: string;
    bobot: number;
    pembahasan: string;
    pedomanPenilaian: string;
  }>({
    mataPelajaran: '',
    kelas: '',
    materi: '',
    tingkatKesulitan: 'sedang',
    tipe: 'pilihan_ganda',
    pertanyaan: '',
    pilihanA: '',
    pilihanB: '',
    pilihanC: '',
    pilihanD: '',
    pilihanE: '',
    kunciJawaban: 'A',
    bobot: 1,
    pembahasan: '',
    pedomanPenilaian: '',
  });
  const [showUnparticipatedList, setShowUnparticipatedList] = useState(false);

  // Link & Share Modal
  const [shareExamModal, setShareExamModal] = useState<UjianOnline | null>(null);
  const [qrExamModal, setQrExamModal] = useState<{ exam: UjianOnline; qrDataUrl: string } | null>(null);
  const [copiedLink, setCopiedLink] = useState(false);

  // Form State for Exam Creation
  const [formJudul, setFormJudul] = useState('');
  const [formMapel, setFormMapel] = useState('');
  const [formKelasTarget, setFormKelasTarget] = useState<string[]>([]);
  const [formDurasi, setFormDurasi] = useState<number>(60);
  const [formJumlahPercobaan, setFormJumlahPercobaan] = useState<number>(1);
  const [formKkm, setFormKkm] = useState<number>(75);
  const [formBatasPelanggaran, setFormBatasPelanggaran] = useState<number>(3);
  const [formTanggalMulai, setFormTanggalMulai] = useState('');
  const [formTanggalSelesai, setFormTanggalSelesai] = useState('');
  const [formJumlahSoalTampil, setFormJumlahSoalTampil] = useState<number>(0);
  const [formModeAcakSoal, setFormModeAcakSoal] = useState<ModePengacakanUjian>('per_siswa');
  const [formModeAcakPilihan, setFormModeAcakPilihan] = useState<ModePengacakanUjian>('per_siswa');
  const [formModeFullscreen, setFormModeFullscreen] = useState<boolean>(true);
  const [formTampilkanNilai, setFormTampilkanNilai] = useState(true);
  const [formTampilkanPembahasan, setFormTampilkanPembahasan] = useState(false);
  const [formPetunjuk, setFormPetunjuk] = useState('Jawablah setiap butir soal dengan jujur, teliti, dan mandiri.');

  // Document Upload & Review State
  const [parsedSoalList, setParsedSoalList] = useState<SoalUjian[]>([]);
  const [isParsingDoc, setIsParsingDoc] = useState(false);
  const [parseError, setParseError] = useState<string | null>(null);
  const [uploadedFileName, setUploadedFileName] = useState<string>('');

  // Student Viewport Simulator, Publish Validation Guard & Violation Inspector
  const [showStudentPreviewModal, setShowStudentPreviewModal] = useState(false);
  const [studentPreviewViewport, setStudentPreviewViewport] = useState<'desktop' | 'mobile'>('desktop');
  const [studentPreviewIndex, setStudentPreviewIndex] = useState(0);
  const [previewImageErrors, setPreviewImageErrors] = useState<Record<string, boolean>>({});
  const [previewImageRetryNonce, setPreviewImageRetryNonce] = useState(0);
  const [publishConfirmModal, setPublishConfirmModal] = useState<{
    targetStatus: StatusUjian;
    warnings: string[];
    missingKeys: number;
    failedImgs: number;
  } | null>(null);
  const [violationDetailSession, setViolationDetailSession] = useState<SesiUjianSiswa | null>(null);

  // Separate Answer Key Modal State
  const [showSeparateKeyModal, setShowSeparateKeyModal] = useState(false);
  const [separateKeyText, setSeparateKeyText] = useState('');
  const [separateKeyFeedback, setSeparateKeyFeedback] = useState<{ success: boolean; message: string } | null>(null);

  // Load Testing State (Simulasi Beban Server)
  const [simConcurrency, setSimConcurrency] = useState<number>(100);
  const [isRunningSim, setIsRunningSim] = useState(false);
  const [simResult, setSimResult] = useState<LoadTestResult | null>(null);
  const [simError, setSimError] = useState<string | null>(null);

  // Extracted Document Images & Status Diagnostics
  const [extractedDocImages, setExtractedDocImages] = useState<ExtractedImageAsset[]>([]);
  const [docImageStats, setDocImageStats] = useState<{
    extractedCount: number;
    failedCount: number;
    warnings: string[];
  }>({ extractedCount: 0, failedCount: 0, warnings: [] });
  const [isSavingExam, setIsSavingExam] = useState<boolean>(false);
  const [savingStatusText, setSavingStatusText] = useState<string>('');

  // Manual Image Management & Lightbox State (Fitur Gambar Lengkap)
  const [activeImageModal, setActiveImageModal] = useState<{
    isOpen: boolean;
    soalIndex: number;
    targetType: 'soal' | 'pilihan';
    targetChoiceLetter?: string;
    currentImage?: string;
    currentImageId?: string;
    currentStoragePath?: string;
    currentCaption?: string;
    currentPosisi?: 'atas' | 'tengah' | 'bawah';
    currentUkuran?: 'kecil' | 'sedang' | 'besar' | 'asli';
  } | null>(null);

  const [adminLightbox, setAdminLightbox] = useState<{
    isOpen: boolean;
    imageUrl: string;
    title?: string;
    caption?: string;
  }>({ isOpen: false, imageUrl: '' });

  const handleOpenQuestionImageModal = (idx: number) => {
    const q = parsedSoalList[idx];
    setActiveImageModal({
      isOpen: true,
      soalIndex: idx,
      targetType: 'soal',
      currentImage: q.gambar,
      currentImageId: q.gambarId,
      currentStoragePath: q.gambarStoragePath,
      currentCaption: q.gambarCaption,
      currentPosisi: q.gambarPosisi || 'atas',
      currentUkuran: q.gambarUkuran || 'sedang',
    });
  };

  const handleOpenChoiceImageModal = (idx: number, letter: string) => {
    const q = parsedSoalList[idx];
    setActiveImageModal({
      isOpen: true,
      soalIndex: idx,
      targetType: 'pilihan',
      targetChoiceLetter: letter,
      currentImage: q.pilihanGambar?.[letter],
      currentImageId: q.pilihanGambarMeta?.[letter]?.imageId,
      currentStoragePath: q.pilihanGambarMeta?.[letter]?.storagePath,
    });
  };

  const handleSaveImageFromModal = (data: {
    imageUrl: string;
    imageId?: string;
    storagePath?: string;
    caption?: string;
    posisi?: 'atas' | 'tengah' | 'bawah';
    ukuran?: 'kecil' | 'sedang' | 'besar' | 'asli';
  }) => {
    if (!activeImageModal) return;
    const { soalIndex, targetType, targetChoiceLetter } = activeImageModal;
    const updated = [...parsedSoalList];
    const q = { ...updated[soalIndex] };

    if (targetType === 'soal') {
      q.gambar = data.imageUrl;
      if (data.imageId) q.gambarId = data.imageId;
      if (data.storagePath) q.gambarStoragePath = data.storagePath;
      q.gambarCaption = data.caption;
      q.gambarPosisi = data.posisi;
      q.gambarUkuran = data.ukuran;
      q.gambarStatus = 'ok';
      delete q.gambarWarning;
    } else if (targetType === 'pilihan' && targetChoiceLetter) {
      q.pilihanGambar = {
        ...(q.pilihanGambar || {}),
        [targetChoiceLetter]: data.imageUrl,
      };
      if (data.imageId || data.storagePath) {
        q.pilihanGambarMeta = {
          ...(q.pilihanGambarMeta || {}),
          [targetChoiceLetter]: {
            imageId: data.imageId,
            storagePath: data.storagePath,
          },
        };
      }
      if (!q.pilihan?.[targetChoiceLetter] || q.pilihan[targetChoiceLetter].trim() === '') {
        q.pilihan = {
          ...(q.pilihan || {}),
          [targetChoiceLetter]: `(Gambar Pilihan ${targetChoiceLetter})`,
        };
      }
    }
    updated[soalIndex] = q;
    setParsedSoalList(updated);
    setActiveImageModal(null);
  };

  const handleRemoveImageFromModal = () => {
    if (!activeImageModal) return;
    const { soalIndex, targetType, targetChoiceLetter } = activeImageModal;
    const updated = [...parsedSoalList];
    const q = { ...updated[soalIndex] };

    if (targetType === 'soal') {
      if (q.gambarStoragePath || q.gambarId) {
        deleteExamImage(q.gambarStoragePath, db.getActiveSchoolId(), q.gambarId).catch(() => {});
      }
      delete q.gambar;
      delete q.gambarId;
      delete q.gambarStoragePath;
      delete q.gambarCaption;
      delete q.gambarPosisi;
      delete q.gambarUkuran;
      delete q.gambarStatus;
      delete q.gambarWarning;
    } else if (targetType === 'pilihan' && targetChoiceLetter) {
      const meta = q.pilihanGambarMeta?.[targetChoiceLetter];
      if (meta?.storagePath || meta?.imageId) {
        deleteExamImage(meta.storagePath, db.getActiveSchoolId(), meta.imageId).catch(() => {});
      }
      if (q.pilihanGambar) {
        const pg = { ...q.pilihanGambar };
        delete pg[targetChoiceLetter];
        q.pilihanGambar = Object.keys(pg).length > 0 ? pg : undefined;
      }
      if (q.pilihanGambarMeta) {
        const pm = { ...q.pilihanGambarMeta };
        delete pm[targetChoiceLetter];
        q.pilihanGambarMeta = Object.keys(pm).length > 0 ? pm : undefined;
      }
    }
    updated[soalIndex] = q;
    setParsedSoalList(updated);
    setActiveImageModal(null);
  };

  const handleReassignQuestionImage = (fromIdx: number, toIdx: number) => {
    if (fromIdx === toIdx || toIdx < 0 || toIdx >= parsedSoalList.length) return;
    const updated = [...parsedSoalList];
    const sourceQ = { ...updated[fromIdx] };
    const targetQ = { ...updated[toIdx] };

    // Move or swap image properties between sourceQ and targetQ
    const prevTarget = {
      gambar: targetQ.gambar,
      gambarId: targetQ.gambarId,
      gambarStoragePath: targetQ.gambarStoragePath,
      gambarCaption: targetQ.gambarCaption,
      gambarPosisi: targetQ.gambarPosisi,
      gambarUkuran: targetQ.gambarUkuran,
    };

    targetQ.gambar = sourceQ.gambar;
    targetQ.gambarId = sourceQ.gambarId;
    targetQ.gambarStoragePath = sourceQ.gambarStoragePath;
    targetQ.gambarCaption = sourceQ.gambarCaption;
    targetQ.gambarPosisi = sourceQ.gambarPosisi || 'atas';
    targetQ.gambarUkuran = sourceQ.gambarUkuran || 'sedang';
    targetQ.gambarStatus = 'ok';
    delete targetQ.gambarWarning;

    if (prevTarget.gambar) {
      sourceQ.gambar = prevTarget.gambar;
      sourceQ.gambarId = prevTarget.gambarId;
      sourceQ.gambarStoragePath = prevTarget.gambarStoragePath;
      sourceQ.gambarCaption = prevTarget.gambarCaption;
      sourceQ.gambarPosisi = prevTarget.gambarPosisi;
      sourceQ.gambarUkuran = prevTarget.gambarUkuran;
    } else {
      delete sourceQ.gambar;
      delete sourceQ.gambarId;
      delete sourceQ.gambarStoragePath;
      delete sourceQ.gambarCaption;
      delete sourceQ.gambarPosisi;
      delete sourceQ.gambarUkuran;
      delete sourceQ.gambarStatus;
      delete sourceQ.gambarWarning;
    }

    updated[fromIdx] = sourceQ;
    updated[toIdx] = targetQ;
    setParsedSoalList(updated);
  };

  const availableImagesForPicker: AvailableImageOption[] = React.useMemo(() => {
    const map = new Map<string, AvailableImageOption>();
    extractedDocImages.forEach((asset) => {
      if (asset.url && !map.has(asset.url)) {
        map.set(asset.url, { id: asset.id, url: asset.url, label: asset.label });
      }
    });
    parsedSoalList.forEach((q, idx) => {
      if (q.gambar && !map.has(q.gambar)) {
        map.set(q.gambar, {
          id: q.gambarId || `q_${idx}_img`,
          url: q.gambar,
          label: `Gambar Soal No. ${idx + 1}`,
        });
      }
      if (q.pilihanGambar) {
        Object.entries(q.pilihanGambar).forEach(([letter, url]) => {
          if (url && !map.has(url)) {
            map.set(url, {
              id: `q_${idx}_${letter}_img`,
              url,
              label: `Pilihan ${letter} (Soal ${idx + 1})`,
            });
          }
        });
      }
    });
    return Array.from(map.values());
  }, [extractedDocImages, parsedSoalList]);

  // QR Scanner & Verification State (Meja Guru Pengawas)
  const [isCameraActive, setIsCameraActive] = useState(false);
  const [verifiedSessionModal, setVerifiedSessionModal] = useState<{
    session: SesiUjianSiswa;
    siswa: Siswa;
    qrDataUrl: string;
  } | null>(null);
  const [sessionList, setSessionList] = useState<SesiUjianSiswa[]>([]);

  // Manual Essay Grading Modal & Delete Confirm
  const [gradingModalSession, setGradingModalSession] = useState<SesiUjianSiswa | null>(null);
  const [essayScores, setEssayScores] = useState<{ [soalId: string]: number }>({});
  const [essayNotes, setEssayNotes] = useState<{ [soalId: string]: string }>({});
  const [isSavingGrades, setIsSavingGrades] = useState(false);
  const [deleteConfirmExam, setDeleteConfirmExam] = useState<UjianOnline | null>(null);

  const videoRef = useRef<HTMLVideoElement | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const isScanningRef = useRef<boolean>(false);
  const lastScanTimeRef = useRef<number>(0);
  const animFrameIdRef = useRef<number | null>(null);

  const availableKelas = db.getKelasList();
  const availableMapel = db.getMapelList();
  const activeExam = ujianList.find((u) => u.id === selectedUjianId) || ujianList[0];

  useEffect(() => {
    setSettings(db.getSettings());
    const handleUpdate = () => {
      setUjianList(db.getUjianList());
      setBankSoalList(db.getBankSoalList());
      setSettings(db.getSettings());
      if (selectedUjianId) {
        setSessionList(db.getSesiUjianList(selectedUjianId));
      }
    };

    window.addEventListener('ujian_online_updated', handleUpdate);
    window.addEventListener('sesi_ujian_updated', handleUpdate);
    window.addEventListener('bank_soal_updated', handleUpdate);
    return () => {
      window.removeEventListener('ujian_online_updated', handleUpdate);
      window.removeEventListener('sesi_ujian_updated', handleUpdate);
      window.removeEventListener('bank_soal_updated', handleUpdate);
    };
  }, [selectedUjianId]);

  useEffect(() => {
    if (selectedUjianId) {
      setSessionList(db.getSesiUjianList(selectedUjianId));
    }
  }, [selectedUjianId]);

  useEffect(() => {
    if (ujianList.length > 0 && !selectedUjianId) {
      setSelectedUjianId(ujianList[0].id);
    }
  }, [ujianList]);

  useEffect(() => {
    const now = new Date();
    const startStr = now.toISOString().slice(0, 16);
    const endStr = new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000).toISOString().slice(0, 16);
    setFormTanggalMulai(startStr);
    setFormTanggalSelesai(endStr);
  }, []);

  // --------------------------------------------------------------------------
  // LINK & SHARE GENERATOR (Tahap 1)
  // --------------------------------------------------------------------------
  const getExamLink = (examId: string, schoolId?: string) => {
    if (typeof window === 'undefined') return '';
    const sid = schoolId || ujianList.find((u) => u.id === examId)?.schoolId || db.getActiveSchoolId();
    return `${window.location.origin}${window.location.pathname}#ujian?id=${encodeURIComponent(examId)}&school=${encodeURIComponent(sid)}`;
  };

  const buildWhatsAppSharePayload = (exam: UjianOnline) => {
    const link = getExamLink(exam.id, exam.schoolId);
    const message =
      `*UJIAN ONLINE (CBT) - ${settings.namaSekolah}*\n\n` +
      `Mata Pelajaran: *${exam.mataPelajaran}*\n` +
      `Kelas: *${exam.kelasTarget.join(', ')}*\n` +
      `Judul Ujian: *${exam.judul}*\n` +
      `Durasi: *${exam.durasiMenit} Menit*\n` +
      `KKM: *${exam.kkm}*\n\n` +
      `Silakan buka tautan ujian berikut di HP atau komputer Anda:\n` +
      `${link}\n\n` +
      `*Petunjuk Siswa:*\n` +
      `1. Buka tautan di atas.\n` +
      `2. Siapkan Kartu QR Absensi Siswa Anda untuk verifikasi identitas masuk ujian.\n` +
      `3. Kerjakan soal dengan teliti, jujur, dan mandiri.\n\n` +
      `Semoga berhasil!`;
    const waUrl = `https://api.whatsapp.com/send?text=${encodeURIComponent(message)}`;
    return { link, message, waUrl };
  };

  const handleCopyExamLink = async (exam: UjianOnline) => {
    const link = getExamLink(exam.id, exam.schoolId);
    try {
      await navigator.clipboard.writeText(link);
      setCopiedLink(true);
      toast.success('Link ujian berhasil disalin ke clipboard.');
      setTimeout(() => setCopiedLink(false), 2500);
    } catch {
      toast.warning('Gagal menyalin otomatis. Silakan salin link dari kotak teks yang tersedia.');
    }
  };

  const handleShareToWhatsApp = (exam: UjianOnline) => {
    setShareExamModal(exam);
  };

  const handleOpenExamQrModal = async (exam: UjianOnline) => {
    const link = getExamLink(exam.id, exam.schoolId);
    const qrDataUrl = await generateQrDataUrl(link, 350);
    setQrExamModal({ exam, qrDataUrl });
  };

  // --------------------------------------------------------------------------
  // CAMERA SCANNER FOR TEACHER DESK PAIRING (Meja Pengawas)
  // --------------------------------------------------------------------------
  const startCamera = async () => {
    try {
      if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
        throw new Error('Kamera tidak didukung pada browser perangkat ini.');
      }
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: 'environment', width: { ideal: 640 }, height: { ideal: 480 } },
      });
      streamRef.current = stream;
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        videoRef.current.setAttribute('playsinline', 'true');
        await videoRef.current.play();
      }
      isScanningRef.current = true;
      setIsCameraActive(true);
      scanQrCodeLoop();
    } catch (err: any) {
      console.warn('Gagal mengakses kamera meja pengawas:', err);
      isScanningRef.current = false;
      setIsCameraActive(false);
      toast.error('Tidak dapat mengakses kamera. Pastikan izin kamera aktif pada browser.');
    }
  };

  const stopCamera = () => {
    if (animFrameIdRef.current) {
      cancelAnimationFrame(animFrameIdRef.current);
      animFrameIdRef.current = null;
    }
    if (streamRef.current) {
      streamRef.current.getTracks().forEach((track) => track.stop());
      streamRef.current = null;
    }
    if (videoRef.current) {
      videoRef.current.srcObject = null;
    }
    isScanningRef.current = false;
    setIsCameraActive(false);
  };

  useEffect(() => {
    return () => {
      stopCamera();
    };
  }, []);

  const scanQrCodeLoop = () => {
    if (!isScanningRef.current || !videoRef.current || !canvasRef.current) return;

    const now = performance.now();
    if (now - lastScanTimeRef.current >= 120) {
      lastScanTimeRef.current = now;
      const video = videoRef.current;
      const canvas = canvasRef.current;
      const ctx = canvas.getContext('2d', { willReadFrequently: true });

      if (video.readyState === video.HAVE_ENOUGH_DATA && ctx) {
        canvas.width = video.videoWidth;
        canvas.height = video.videoHeight;
        ctx.drawImage(video, 0, 0, canvas.width, canvas.height);

        const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
        const code = jsQR(imageData.data, imageData.width, imageData.height, {
          inversionAttempts: 'dontInvert',
        });

        if (code && code.data) {
          handleProcessScannedQr(code.data);
          return;
        }
      }
    }

    animFrameIdRef.current = requestAnimationFrame(scanQrCodeLoop);
  };

  const handleProcessScannedQr = async (qrData: string) => {
    if (!activeExam) {
      toast.warning('Pilih naskah ujian yang aktif terlebih dahulu sebelum memindai QR siswa.');
      return;
    }

    const cleanId = qrData.trim();
    const siswa = await db.resolveSiswaForVerification(cleanId, activeExam.schoolId || db.getActiveSchoolId());

    if (!siswa) {
      try {
        sound.playError();
      } catch {}
      toast.error(`Kartu QR tidak dikenali: "${cleanId}". Pastikan menggunakan QR Absensi Siswa yang terdaftar.`);
      setTimeout(() => {
        if (isScanningRef.current) animFrameIdRef.current = requestAnimationFrame(scanQrCodeLoop);
      }, 1500);
      return;
    }

    // Verify class match (supports "Semua Kelas" and normalized formats like "Kelas 1A" / "1A")
    if (
      activeExam.kelasTarget &&
      activeExam.kelasTarget.length > 0 &&
      !doesStudentMatchTargetClasses(siswa.kelas, activeExam.kelasTarget)
    ) {
      try {
        sound.playError();
      } catch {}
      toast.warning(
        `Siswa ${siswa.namaLengkap} terdaftar di "${siswa.kelas}", namun ujian ini untuk: ${activeExam.kelasTarget.join(', ')}.`
      );
      setTimeout(() => {
        if (isScanningRef.current) animFrameIdRef.current = requestAnimationFrame(scanQrCodeLoop);
      }, 1500);
      return;
    }

    try {
      try {
        sound.playSuccess();
      } catch {}
      stopCamera();

      const session = await db.createOrGetSesiUjian(activeExam.id, siswa);
      const sid = activeExam.schoolId || db.getActiveSchoolId();
      const sessionUrl = `${window.location.origin}${window.location.pathname}#ujian?session=${encodeURIComponent(session.sessionToken)}&school=${encodeURIComponent(sid)}`;
      const qrDataUrl = await generateQrDataUrl(sessionUrl, 300);

      setVerifiedSessionModal({
        session,
        siswa,
        qrDataUrl,
      });

      try {
        confetti({
          particleCount: 50,
          spread: 60,
          origin: { y: 0.6 },
        });
      } catch {}
    } catch (err: any) {
      toast.error(`Gagal membuat sesi ujian: ${err?.message || 'Kesalahan sistem'}`);
    }
  };

  // --------------------------------------------------------------------------
  // DOCUMENT UPLOAD & SIDE-BY-SIDE REVIEW (Masalah B)
  // --------------------------------------------------------------------------
  const handleUploadDocument = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setIsParsingDoc(true);
    setParseError(null);
    setUploadedFileName(file.name);
    // Clear previous document results so an upload strictly reflects the newly uploaded file
    setParsedSoalList([]);
    setExtractedDocImages([]);
    setDocImageStats({ extractedCount: 0, failedCount: 0, warnings: [] });

    try {
      const result: ParseDocumentResult = await parseExamDocument(file);
      setExtractedDocImages(result.extractedImages || []);
      setDocImageStats({
        extractedCount: result.extractedImagesCount || 0,
        failedCount: result.failedImagesCount || 0,
        warnings: result.imageWarnings || [],
      });

      if (!editingUjian) {
        if (result.judul) setFormJudul(result.judul);
        if (result.mataPelajaran) setFormMapel(result.mataPelajaran);
        if (result.kelas) setFormKelasTarget([result.kelas]);
        if (result.petunjukUmum) setFormPetunjuk(result.petunjukUmum);
      } else {
        if (result.judul && !formJudul) setFormJudul(result.judul);
        if (result.mataPelajaran && !formMapel) setFormMapel(result.mataPelajaran);
        if (result.kelas && formKelasTarget.length === 0) setFormKelasTarget([result.kelas]);
      }

      if (result.success && result.soalList.length > 0) {
        setParsedSoalList(result.soalList);
        if (result.warning) {
          setParseError(result.warning);
        }

        try {
          sound.playSuccess();
        } catch {}
      } else {
        setParseError(result.error || 'Gagal mengekstrak butir soal dari dokumen.');
      }
    } catch (err: any) {
      setParseError(err?.message || 'Terjadi kesalahan saat memproses berkas.');
    } finally {
      setIsParsingDoc(false);
      e.target.value = '';
    }
  };

  const handleAddQuestion = (presetType: TipeSoalUjian = 'pilihan_ganda') => {
    const baseNum = parsedSoalList.length + 1;
    const newQ: SoalUjian = {
      id: `soal-manual-${Date.now()}-${baseNum}`,
      nomor: baseNum,
      tipe: presetType,
      pertanyaan: '',
      pilihan:
        presetType === 'pilihan_ganda'
          ? { A: '', B: '', C: '', D: '' }
          : presetType === 'benar_salah'
          ? { A: 'Benar', B: 'Salah' }
          : undefined,
      kunciJawaban: presetType === 'benar_salah' ? 'BENAR' : '',
      bobot: presetType === 'uraian' ? 2 : 1,
      perluVerifikasi: presetType !== 'uraian',
      catatanVerifikasi:
        presetType === 'uraian'
          ? undefined
          : 'Soal baru. Silakan lengkapi pertanyaan dan kunci jawaban.',
    };
    setParsedSoalList([...parsedSoalList, newQ]);
  };

  const handleMoveQuestion = (index: number, direction: 'up' | 'down') => {
    const targetIdx = direction === 'up' ? index - 1 : index + 1;
    if (targetIdx < 0 || targetIdx >= parsedSoalList.length) return;
    const updated = [...parsedSoalList];
    const [moved] = updated.splice(index, 1);
    updated.splice(targetIdx, 0, moved);
    setParsedSoalList(updated.map((item, i) => ({ ...item, nomor: i + 1 })));
  };

  const handlePasteParsed = (result: PasteParseExamResult) => {
    setExtractedDocImages(result.extractedImages || []);
    setDocImageStats({
      extractedCount: result.extractedImagesCount || 0,
      failedCount: result.failedImagesCount || 0,
      warnings: result.imageWarnings || [],
    });
    setUploadedFileName('Hasil Copy-Paste Editor');
    setParseError(result.warning || null);

    if (!editingUjian) {
      if (result.judul && !formJudul) setFormJudul(result.judul);
      if (result.mataPelajaran && !formMapel) setFormMapel(result.mataPelajaran);
      if (result.kelas && formKelasTarget.length === 0) setFormKelasTarget([result.kelas]);
    }

    setParsedSoalList(result.soalList);
    try {
      sound.playSuccess();
    } catch {}
    toast.success(`Berhasil membaca ${result.soalList.length} butir soal dari hasil tempelan.`);
  };

  const handleImportFromBankSelection = (idsToImport: string[], switchToBuat = false) => {
    const chosen = bankSoalList.filter((b) => idsToImport.includes(b.id));
    if (chosen.length === 0) {
      toast.warning('Pilih minimal satu butir soal dari Bank Soal.');
      return;
    }
    const baseOffset = switchToBuat ? 0 : parsedSoalList.length;
    const converted: SoalUjian[] = chosen.map((b, i) => ({
      id: `soal-bank-${Date.now()}-${i + 1}`,
      nomor: baseOffset + i + 1,
      tipe: b.tipe,
      pertanyaan: b.pertanyaan,
      kontenElemen: b.kontenElemen,
      pilihan: b.pilihan ? { ...b.pilihan } : undefined,
      pilihanGambar: b.pilihanGambar ? { ...b.pilihanGambar } : undefined,
      kunciJawaban: b.kunciJawaban,
      bobot: b.bobot || (b.tipe === 'uraian' ? 2 : 1),
      pembahasan: b.pembahasan,
      pedomanPenilaian: b.pedomanPenilaian,
      gambar: b.gambar,
      gambarCaption: b.gambarCaption,
      gambarTambahan: b.gambarTambahan,
      gambarPosisi: b.gambarPosisi,
      gambarUkuran: b.gambarUkuran,
      gambarStatus: b.gambar ? 'ok' : undefined,
      perluVerifikasi:
        (b.tipe === 'pilihan_ganda' || b.tipe === 'benar_salah' || b.tipe === 'isian_singkat') &&
        !b.kunciJawaban?.trim(),
    }));

    if (switchToBuat) {
      setEditingUjian(null);
      if (!formMapel && chosen[0]?.mataPelajaran) setFormMapel(chosen[0].mataPelajaran);
      if (formKelasTarget.length === 0 && chosen[0]?.kelas && chosen[0].kelas !== 'Semua Kelas') {
        setFormKelasTarget([chosen[0].kelas]);
      }
      setParsedSoalList(converted);
      setCreationMethod('manual');
      setSelectedBankIds([]);
      setActiveSubTab('buat');
      toast.success(`${converted.length} soal dari Bank Soal dimuat ke lembar naskah ujian baru.`);
    } else {
      setParsedSoalList((prev) =>
        [...prev, ...converted].map((s, idx) => ({ ...s, nomor: idx + 1 }))
      );
      setShowBankPickerModal(false);
      setBankPickerSelectedIds([]);
      toast.success(`${converted.length} soal ditambahkan dari Bank Soal.`);
    }
  };

  // Save or Publish Exam (uploads any inline Data URI images permanently to Firebase Storage & exam_images metadata)
  const handleSaveExam = async (status: StatusUjian, forcePublish: boolean = false) => {
    if (!formJudul.trim()) {
      toast.warning('Judul ujian tidak boleh kosong.');
      return;
    }
    if (!formMapel.trim()) {
      toast.warning('Mata pelajaran harus dipilih.');
      return;
    }
    if (formKelasTarget.length === 0) {
      toast.warning('Pilih minimal satu kelas target.');
      return;
    }
    if (parsedSoalList.length === 0) {
      toast.warning('Naskah ujian harus memiliki minimal 1 butir soal.');
      return;
    }
    if (status === 'terjadwal' && !formTanggalMulai) {
      toast.warning('Tentukan Jadwal Mulai Ujian terlebih dahulu untuk menjadwalkan ujian.');
      return;
    }

    if (formTanggalMulai && formTanggalSelesai) {
      const startTs = new Date(formTanggalMulai).getTime();
      const endTs = new Date(formTanggalSelesai).getTime();
      if (Number.isFinite(startTs) && Number.isFinite(endTs) && endTs <= startTs) {
        toast.warning('Jadwal selesai ujian harus lebih lambat daripada jadwal mulai.');
        return;
      }
    }

    const objQuestions = parsedSoalList.filter(
      (s) => s.tipe === 'pilihan_ganda' || s.tipe === 'benar_salah' || s.tipe === 'isian_singkat'
    );
    const missingKeys = objQuestions.filter((s) => !s.kunciJawaban || !s.kunciJawaban.trim()).length;
    const errorImgs = parsedSoalList.filter((s) => s.gambarStatus === 'error').length;
    const failedImgs = docImageStats.failedCount + errorImgs;

    if (
      (status === 'aktif' || status === 'terbit' || status === 'terjadwal') &&
      !forcePublish &&
      (missingKeys > 0 || failedImgs > 0)
    ) {
      const warnings: string[] = [];
      if (missingKeys > 0) {
        warnings.push(`${missingKeys} soal objektif (PG/Benar-Salah/Isian Singkat) belum memiliki kunci jawaban.`);
      }
      if (failedImgs > 0) {
        warnings.push(`${failedImgs} gambar terdeteksi gagal/perlu pemeriksaan ulang pada dokumen.`);
      }
      setPublishConfirmModal({ targetStatus: status, warnings, missingKeys, failedImgs });
      return;
    }

    setPublishConfirmModal(null);
    setIsSavingExam(true);
    setSavingStatusText('Mempersiapkan naskah & gambar soal...');
    try {
      const schoolId = db.getActiveSchoolId();
      const examId = editingUjian?.id || `cbt-${Date.now()}`;
      const renumberedList = parsedSoalList.map((s, idx) => ({ ...s, nomor: idx + 1 }));

      // Upload all embedded / cropped Data URI images to Firebase Storage with bounded fallback timeout
      let syncedSoalList = renumberedList;
      try {
        syncedSoalList = await Promise.race([
          uploadExamQuestionsImages(
            schoolId,
            examId,
            renumberedList,
            currentUser.id,
            (msg) => setSavingStatusText(msg)
          ),
          new Promise<SoalUjian[]>((resolve) =>
            setTimeout(() => {
              console.warn('[UjianOnlineView] Image upload timeout guard triggered; continuing with local Data URIs.');
              resolve(renumberedList);
            }, 15000)
          ),
        ]);
      } catch (imgErr) {
        console.warn('[UjianOnlineView] Image optimization/upload warning, continuing save:', imgErr);
      }

      setSavingStatusText(
        status === 'aktif' || status === 'terbit'
          ? 'Menerbitkan ujian ke server...'
          : status === 'terjadwal'
          ? 'Menyimpan jadwal ujian...'
          : 'Menyimpan draf ujian...'
      );

      const examData: UjianOnline = {
        id: examId,
        schoolId,
        guruId: currentUser.id,
        guruNama: currentUser.name,
        judul: formJudul,
        mataPelajaran: formMapel,
        kelasTarget: formKelasTarget,
        tanggalMulai: formTanggalMulai,
        tanggalSelesai: formTanggalSelesai,
        durasiMenit: Number(formDurasi) || 60,
        jumlahPercobaan: Math.max(1, Math.min(10, Number(formJumlahPercobaan) || 1)),
        kkm: Number(formKkm) || 75,
        batasPelanggaran: Number(formBatasPelanggaran) || 3,
        status,
        soalList: syncedSoalList,
        jumlahSoalTampil: Math.max(0, Number(formJumlahSoalTampil) || 0),
        acakSoal: formModeAcakSoal !== 'off',
        acakPilihan: formModeAcakPilihan !== 'off',
        modeAcakSoal: formModeAcakSoal,
        modeAcakPilihan: formModeAcakPilihan,
        modeFullscreen: formModeFullscreen,
        tampilkanNilaiLangsung: formTampilkanNilai,
        tampilkanPembahasan: formTampilkanPembahasan,
        petunjukPengerjaan: formPetunjuk,
        dokumenAsliNama: uploadedFileName || editingUjian?.dokumenAsliNama || undefined,
        createdAt: editingUjian?.createdAt || new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      };

      await db.saveUjian(examData);
      setUjianList(db.getUjianList());

      try {
        sound.playSuccess();
      } catch {}
      const statusMsg =
        status === 'aktif' || status === 'terbit'
          ? 'diterbitkan & aktif'
          : status === 'terjadwal'
          ? 'dijadwalkan'
          : 'disimpan sebagai draf';
      toast.success(`Ujian "${formJudul}" berhasil ${statusMsg}!`);

      setEditingUjian(null);
      setUploadedFileName('');
      setParsedSoalList([]);
      setExtractedDocImages([]);
      setDocImageStats({ extractedCount: 0, failedCount: 0, warnings: [] });
      setActiveSubTab('daftar');
      setSelectedUjianId(examId);
    } catch (err: any) {
      toast.error(`Gagal menyimpan ujian: ${err?.message || 'Terjadi kesalahan sistem'}`);
    } finally {
      setIsSavingExam(false);
      setSavingStatusText('');
    }
  };

  const handleEditExam = (exam: UjianOnline) => {
    setEditingUjian(exam);
    setFormJudul(exam.judul);
    setFormMapel(exam.mataPelajaran);
    setFormKelasTarget(exam.kelasTarget || []);
    setFormDurasi(exam.durasiMenit || 60);
    setFormJumlahPercobaan(Math.max(1, Number(exam.jumlahPercobaan) || 1));
    setFormKkm(exam.kkm || 75);
    setFormBatasPelanggaran(exam.batasPelanggaran ?? 3);
    setFormTanggalMulai(exam.tanggalMulai || '');
    setFormTanggalSelesai(exam.tanggalSelesai || '');
    setFormJumlahSoalTampil(exam.jumlahSoalTampil ?? 0);
    setFormModeAcakSoal(exam.modeAcakSoal || (exam.acakSoal ? 'per_siswa' : 'off'));
    setFormModeAcakPilihan(exam.modeAcakPilihan || (exam.acakPilihan ? 'per_siswa' : 'off'));
    setFormModeFullscreen(exam.modeFullscreen ?? true);
    setFormTampilkanNilai(exam.tampilkanNilaiLangsung ?? true);
    setFormTampilkanPembahasan(exam.tampilkanPembahasan ?? false);
    setFormPetunjuk(exam.petunjukPengerjaan || '');
    setUploadedFileName(exam.dokumenAsliNama || '');
    setParsedSoalList(exam.soalList || []);
    setCreationMethod('manual');
    setActiveSubTab('buat');
  };

  const handleApplySeparateKey = () => {
    if (!separateKeyText.trim()) {
      setSeparateKeyFeedback({
        success: false,
        message: 'Teks kunci jawaban belum dimasukkan.',
      });
      return;
    }
    const { updatedSoalList, appliedCount } = applyAnswerKeysFromText(parsedSoalList, separateKeyText);
    setParsedSoalList(updatedSoalList);
    setSeparateKeyFeedback({
      success: appliedCount > 0,
      message:
        appliedCount > 0
          ? `Berhasil mencocokkan & menerapkan kunci jawaban pada ${appliedCount} butir soal.`
          : 'Tidak ada nomor soal yang cocok dengan kunci yang dimasukkan. Pastikan format nomor seperti "1. A, 2. B..." atau tabel.',
    });
    if (appliedCount > 0) {
      setTimeout(() => {
        setShowSeparateKeyModal(false);
        setSeparateKeyFeedback(null);
        setSeparateKeyText('');
      }, 1500);
    }
  };

  const handleOpenGradingModal = (sesi: SesiUjianSiswa) => {
    if (!activeExam) return;
    const initScores: { [soalId: string]: number } = {};
    const initNotes: { [soalId: string]: string } = {};
    activeExam.soalList
      .filter((q) => q.tipe === 'uraian')
      .forEach((q) => {
        const ans = sesi.jawaban?.[q.id];
        initScores[q.id] = typeof ans?.nilaiManual === 'number' ? ans.nilaiManual : 0;
        initNotes[q.id] = ans?.catatanGuru || '';
      });
    setEssayScores(initScores);
    setEssayNotes(initNotes);
    setGradingModalSession(sesi);
  };

  const handleSaveEssayGrades = async () => {
    if (!gradingModalSession || !activeExam) return;
    setIsSavingGrades(true);
    try {
      const uraianQuestions = activeExam.soalList.filter((q) => q.tipe === 'uraian');
      for (const q of uraianQuestions) {
        const rawScore = Number(essayScores[q.id] ?? 0);
        const maxBobot = Number(q.bobot) || 1;
        const clampedScore = Math.max(0, Math.min(maxBobot, rawScore));
        await db.koreksiNilaiUraian(
          gradingModalSession.id,
          q.id,
          clampedScore,
          essayNotes[q.id] || ''
        );
      }
      setSessionList(db.getSesiUjianList(activeExam.id));
      toast.success(`Nilai uraian siswa ${gradingModalSession.namaSiswa} berhasil disimpan.`);
      setGradingModalSession(null);
    } catch (err: any) {
      toast.error(`Gagal menyimpan koreksi uraian: ${err?.message || 'Kesalahan sistem'}`);
    } finally {
      setIsSavingGrades(false);
    }
  };

  const handleRunLoadTest = async () => {
    const targetExamId = selectedUjianId || (ujianList.length > 0 ? ujianList[0].id : '');
    if (!targetExamId) {
      toast.warning('Pilih atau buat naskah ujian terlebih dahulu sebagai target uji beban.');
      return;
    }
    setIsRunningSim(true);
    setSimError(null);
    setSimResult(null);
    try {
      const result = await runExamLoadSimulation(targetExamId, simConcurrency);
      setSimResult(result);
    } catch (err: any) {
      setSimError(err?.message || 'Terjadi kegagalan saat menjalankan simulasi beban.');
    } finally {
      setIsRunningSim(false);
    }
  };

  // Export Results & Item Analysis to Excel
  const handleExportExcel = () => {
    if (!activeExam) return;
    const sessions = db.getSesiUjianList(activeExam.id);
    const analytics = computeExamAnalytics(activeExam, sessions, db.getSiswaList());

    const rows = sessions.map((s, idx) => ({
      'No.': idx + 1,
      'Nama Siswa': s.namaSiswa,
      NISN: s.nisn || '-',
      Kelas: s.kelas,
      'Percobaan Ke': s.attemptNumber || 1,
      Benar: s.jumlahBenar ?? '-',
      Salah: s.jumlahSalah ?? '-',
      Kosong: s.jumlahKosong ?? '-',
      'Nilai Objektif': s.nilaiPg,
      'Nilai Uraian': s.nilaiUraian,
      'Nilai Akhir': s.nilaiAkhir,
      Status: s.lulusKkm ? 'Lulus KKM' : 'Remedial',
      'Sumber Penilaian': s.gradedBy === 'backend' ? 'Server' : s.gradedBy === 'local' ? 'Lokal' : '-',
      'Waktu Mulai': s.waktuMulai ? new Date(s.waktuMulai).toLocaleTimeString('id-ID') : '-',
      'Waktu Selesai': s.waktuSelesai ? new Date(s.waktuSelesai).toLocaleTimeString('id-ID') : '-',
      Pelanggaran: s.jumlahPelanggaran || 0,
      'Detail Pelanggaran':
        (s.logPelanggaran || [])
          .map((l) => `[${new Date(l.waktu).toLocaleTimeString('id-ID')}] ${l.jenis}: ${l.keterangan}`)
          .join(' | ') || '-',
    }));

    const itemRows = analytics.analisisButir.map((item) => ({
      'No. Soal': item.nomor,
      Tipe: item.tipe.replace('_', ' ').toUpperCase(),
      'Ringkasan Pertanyaan': item.pertanyaanSingkat,
      'Jumlah Dijawab': item.totalPeserta,
      Benar: item.benarCount,
      Salah: item.salahCount,
      Kosong: item.kosongCount,
      'Tingkat Benar (%)': `${item.persentaseBenar}%`,
      'Kategori Kesulitan': item.tingkatKesulitan,
    }));

    const wb = XLSX.utils.book_new();
    const wsNilai = XLSX.utils.json_to_sheet(rows);
    const wsButir = XLSX.utils.json_to_sheet(itemRows);
    XLSX.utils.book_append_sheet(wb, wsNilai, 'Rekap Nilai');
    XLSX.utils.book_append_sheet(wb, wsButir, 'Analisis Butir Soal');
    XLSX.writeFile(wb, `Rekap_Nilai_${activeExam.judul.replace(/[^a-zA-Z0-9]/g, '_')}.xlsx`);
  };

  if (!isAuthorizedStaff) {
    return (
      <div className="bg-white rounded-3xl p-8 border border-red-200 text-center space-y-3 shadow-xs">
        <Shield className="w-12 h-12 text-red-500 mx-auto" />
        <h3 className="text-lg font-extrabold text-slate-900">Akses Dibatasi</h3>
        <p className="text-xs text-slate-600 max-w-md mx-auto leading-relaxed">
          Halaman Manajemen Ujian Online hanya dapat diakses oleh Guru, Operator, atau Administrator Sekolah yang berwenang.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Top Banner */}
      <div className="bg-gradient-to-r from-blue-900 via-blue-800 to-indigo-900 rounded-3xl p-6 sm:p-8 text-white shadow-md flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <div>
          <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-white/10 text-blue-200 text-xs font-bold uppercase tracking-wider backdrop-blur-xs">
            <Sparkles className="w-3.5 h-3.5 text-amber-300" /> Sistem Ujian Online Terintegrasi QR
          </span>
          <h2 className="text-xl sm:text-2xl font-extrabold tracking-tight mt-2">
            Manajemen Ujian Online (CBT)
          </h2>
          <p className="text-xs sm:text-sm text-blue-200 mt-1 max-w-xl">
            Alur Terstruktur: Guru Buat Ujian & Bagikan Link &rarr; Siswa Buka Link &rarr; Siswa Scan QR Absensi &rarr; Identitas Terverifikasi &rarr; Ujian Terbuka.
          </p>
        </div>

        <button
          onClick={() => {
            setEditingUjian(null);
            setFormJudul('');
            setFormMapel('');
            setFormKelasTarget([]);
            setFormDurasi(60);
            setFormJumlahPercobaan(1);
            setFormKkm(75);
            setFormBatasPelanggaran(3);
            setFormTanggalMulai('');
            setFormTanggalSelesai('');
            setFormJumlahSoalTampil(0);
            setFormModeAcakSoal('per_siswa');
            setFormModeAcakPilihan('per_siswa');
            setFormModeFullscreen(true);
            setFormTampilkanNilai(true);
            setFormTampilkanPembahasan(false);
            setFormPetunjuk('Jawablah setiap butir soal dengan jujur, teliti, dan mandiri.');
            setUploadedFileName('');
            setParsedSoalList([]);
            setExtractedDocImages([]);
            setDocImageStats({ extractedCount: 0, failedCount: 0, warnings: [] });
            setCreationMethod('upload');
            setActiveSubTab('buat');
          }}
          className="px-4 py-2.5 bg-blue-600 hover:bg-blue-500 text-white rounded-xl text-xs font-bold shadow-md flex items-center gap-2 transition-all cursor-pointer flex-shrink-0"
        >
          <Plus className="w-4 h-4" />
          <span>Buat Ujian Baru</span>
        </button>
      </div>

      {/* Sub Tabs Navigation */}
      <div className="flex border-b border-slate-200 gap-2 sm:gap-4 overflow-x-auto pb-px">
        {[
          { id: 'daftar', label: 'Daftar & Bagikan Link Ujian', icon: BookOpen },
          { id: 'buat', label: editingUjian ? 'Edit Ujian' : 'Buat & Upload Soal', icon: Plus },
          { id: 'bank', label: `Bank Soal (${bankSoalList.length})`, icon: Database },
          { id: 'pengawasan', label: 'Pengawasan Meja Guru', icon: QrCode },
          { id: 'penilaian', label: 'Penilaian & Analitik Ujian', icon: BarChart2 },
          { id: 'simulasi', label: 'Uji Beban & Simulasi Server', icon: Zap },
        ].map((tab) => {
          const Icon = tab.icon;
          const isActive = activeSubTab === tab.id;
          return (
            <button
              key={tab.id}
              onClick={() => setActiveSubTab(tab.id as any)}
              className={`px-4 py-3 text-xs sm:text-sm font-bold flex items-center gap-2 border-b-2 transition-all whitespace-nowrap cursor-pointer ${
                isActive
                  ? 'border-blue-700 text-blue-700'
                  : 'border-transparent text-slate-500 hover:text-slate-800 hover:border-slate-300'
              }`}
            >
              <Icon className="w-4 h-4" />
              <span>{tab.label}</span>
            </button>
          );
        })}
      </div>

      {/* -------------------------------------------------------------------- */}
      {/* SUBTAB 1: DAFTAR UJIAN & BAGIKAN LINK (Tahap 1)                      */}
      {/* -------------------------------------------------------------------- */}
      {activeSubTab === 'daftar' && (
        <div className="space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
            {ujianList.map((exam) => {
              const sessions = db.getSesiUjianList(exam.id);
              const completedCount = sessions.filter((s) => s.status === 'selesai' || s.status === 'waktu_habis').length;
              const link = getExamLink(exam.id, exam.schoolId);

              return (
                <div
                  key={exam.id}
                  className="bg-white rounded-3xl p-6 border border-slate-200 shadow-xs hover:shadow-md transition-all flex flex-col justify-between space-y-4"
                >
                  <div className="space-y-3">
                    <div className="flex items-start justify-between gap-2">
                      <span
                        className={`px-2.5 py-0.5 rounded-full text-[10px] font-extrabold uppercase tracking-wider ${
                          exam.status === 'aktif' || exam.status === 'terbit'
                            ? 'bg-emerald-100 text-emerald-800'
                            : exam.status === 'terjadwal'
                            ? 'bg-blue-100 text-blue-800'
                            : exam.status === 'draf'
                            ? 'bg-amber-100 text-amber-800'
                            : 'bg-slate-100 text-slate-700'
                        }`}
                      >
                        {exam.status === 'aktif' || exam.status === 'terbit'
                          ? 'Aktif / Terbit'
                          : exam.status === 'terjadwal'
                          ? 'Terjadwal'
                          : exam.status === 'draf'
                          ? 'Draf'
                          : 'Ditutup'}
                      </span>
                      <span className="text-[11px] text-slate-400 font-medium">
                        {exam.durasiMenit} Menit
                        {(exam.jumlahPercobaan || 1) > 1 ? ` • ${exam.jumlahPercobaan}x Percobaan` : ''}
                      </span>
                    </div>

                    <div>
                      <h3 className="text-base font-extrabold text-slate-900 leading-snug line-clamp-2">
                        {exam.judul}
                      </h3>
                      <p className="text-xs font-semibold text-blue-700 mt-1">
                        {exam.mataPelajaran} &bull; {exam.kelasTarget.join(', ')}
                      </p>
                    </div>

                    <div className="p-3 bg-slate-50 rounded-2xl text-xs space-y-1.5 text-slate-600">
                      <div className="flex justify-between">
                        <span>Jumlah Butir Soal:</span>
                        <strong className="text-slate-800">{exam.soalList.length} Soal</strong>
                      </div>
                      <div className="flex justify-between">
                        <span>KKM Kelulusan:</span>
                        <strong className="text-slate-800">{exam.kkm}</strong>
                      </div>
                      <div className="flex justify-between">
                        <span>Siswa Mengerjakan:</span>
                        <strong className="text-slate-800">
                          {completedCount} / {sessions.length} Selesai
                        </strong>
                      </div>
                    </div>

                    {/* Shared Link Box */}
                    <div className="pt-2">
                      <div className="text-[11px] font-bold text-slate-700 mb-1 flex items-center justify-between">
                        <span>Link Ujian Siswa:</span>
                        <button
                          onClick={() => handleCopyExamLink(exam)}
                          className="text-blue-700 hover:text-blue-900 font-semibold flex items-center gap-1 cursor-pointer"
                        >
                          <Copy className="w-3 h-3" />
                          <span>Salin Link</span>
                        </button>
                      </div>
                      <div className="p-2 bg-slate-100 rounded-xl text-[11px] text-slate-600 font-mono truncate select-all">
                        {link}
                      </div>
                    </div>
                  </div>

                  {/* Actions Bar */}
                  <div className="pt-3 border-t border-slate-100 space-y-2">
                    <div className="flex gap-2">
                      <button
                        onClick={() => handleShareToWhatsApp(exam)}
                        className="flex-1 py-2 bg-emerald-600 hover:bg-emerald-500 text-white rounded-xl text-xs font-bold shadow-xs flex items-center justify-center gap-1.5 transition-colors cursor-pointer"
                        title="Bagikan ke Grup WhatsApp Siswa / Orang Tua"
                      >
                        <Share2 className="w-3.5 h-3.5" />
                        <span>Bagikan ke WA</span>
                      </button>

                      <button
                        onClick={() => handleOpenExamQrModal(exam)}
                        className="p-2 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-xl transition-colors cursor-pointer"
                        title="Tampilkan QR Code Ujian di Layar Proyektor"
                      >
                        <QrCode className="w-4 h-4 text-slate-700" />
                      </button>

                      <button
                        onClick={() => {
                          setSelectedUjianId(exam.id);
                          setActiveSubTab('pengawasan');
                        }}
                        className="p-2 bg-blue-50 hover:bg-blue-100 text-blue-700 rounded-xl transition-colors cursor-pointer"
                        title="Buka Meja Pengawasan"
                      >
                        <Shield className="w-4 h-4" />
                      </button>

                      <button
                        onClick={() => handleEditExam(exam)}
                        className="p-2 bg-slate-50 hover:bg-slate-100 text-slate-700 rounded-xl transition-colors cursor-pointer"
                        title="Edit Naskah Ujian & Kunci Jawaban"
                      >
                        <Edit className="w-4 h-4 text-slate-600" />
                      </button>

                      <button
                        onClick={() => setDeleteConfirmExam(exam)}
                        className="p-2 text-slate-400 hover:text-red-600 hover:bg-red-50 rounded-xl transition-colors cursor-pointer"
                        title="Hapus Ujian"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </div>
                  </div>
                </div>
              );
            })}

            {ujianList.length === 0 && (
              <div className="col-span-full py-16 text-center bg-white rounded-3xl border border-dashed border-slate-300 p-8 space-y-3">
                <BookOpen className="w-12 h-12 text-slate-300 mx-auto" />
                <h3 className="text-base font-bold text-slate-700">Belum Ada Naskah Ujian</h3>
                <p className="text-xs text-slate-500 max-w-sm mx-auto">
                  Silakan buat ujian baru dengan mengunggah naskah DOCX/PDF atau menyusun soal secara manual.
                </p>
                <button
                  onClick={() => setActiveSubTab('buat')}
                  className="px-4 py-2 bg-blue-700 text-white rounded-xl text-xs font-bold inline-flex items-center gap-2 cursor-pointer shadow-xs"
                >
                  <Plus className="w-4 h-4" /> Buat Ujian Sekarang
                </button>
              </div>
            )}
          </div>
        </div>
      )}

      {/* -------------------------------------------------------------------- */}
      {/* SUBTAB 2: BUAT UJIAN & SIDE-BY-SIDE REVIEW (Masalah B)              */}
      {/* -------------------------------------------------------------------- */}
      {activeSubTab === 'buat' && (
        <div className="space-y-6">
          {/* Step 1: 3 Metode Pembuatan Soal */}
          <div className="bg-white rounded-3xl p-6 sm:p-8 border border-slate-200 shadow-xs space-y-5">
            <div>
              <span className="text-[10px] font-extrabold uppercase tracking-wider text-blue-700 bg-blue-50 px-2.5 py-1 rounded-full">
                Langkah 1: Pilih Metode Pembuatan Soal
              </span>
              <h3 className="text-lg font-extrabold text-slate-900 mt-2">
                Buat Soal Ujian Online dengan Cara Paling Nyaman
              </h3>
              <p className="text-xs text-slate-500 mt-0.5">
                Upload dokumen Word/PDF/Excel, copy-paste langsung soal + gambar sekaligus, atau susun manual &amp; ambil dari Bank Soal sekolah.
              </p>
            </div>

            {/* 3 Method Selector */}
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              <button
                type="button"
                onClick={() => setCreationMethod('upload')}
                className={`p-4 rounded-2xl border-2 text-left transition-all cursor-pointer flex items-start gap-3 ${
                  creationMethod === 'upload'
                    ? 'border-blue-600 bg-blue-50/70 shadow-xs'
                    : 'border-slate-200 bg-white hover:border-slate-300'
                }`}
              >
                <div className={`w-9 h-9 rounded-xl flex items-center justify-center shrink-0 ${
                  creationMethod === 'upload' ? 'bg-blue-700 text-white' : 'bg-slate-100 text-slate-600'
                }`}>
                  <Upload className="w-4 h-4" />
                </div>
                <div>
                  <span className="block text-xs font-extrabold text-slate-900">Cara 1: Upload Dokumen</span>
                  <span className="block text-[11px] text-slate-500 mt-0.5">Word (.docx), PDF, Excel (.xlsx), TXT, atau Foto Soal</span>
                </div>
              </button>

              <button
                type="button"
                onClick={() => setCreationMethod('paste')}
                className={`p-4 rounded-2xl border-2 text-left transition-all cursor-pointer flex items-start gap-3 ${
                  creationMethod === 'paste'
                    ? 'border-indigo-600 bg-indigo-50/70 shadow-xs'
                    : 'border-slate-200 bg-white hover:border-slate-300'
                }`}
              >
                <div className={`w-9 h-9 rounded-xl flex items-center justify-center shrink-0 ${
                  creationMethod === 'paste' ? 'bg-indigo-600 text-white' : 'bg-slate-100 text-slate-600'
                }`}>
                  <ClipboardPaste className="w-4 h-4" />
                </div>
                <div>
                  <span className="block text-xs font-extrabold text-slate-900">Cara 2: Copy-Paste + Gambar</span>
                  <span className="block text-[11px] text-slate-500 mt-0.5">Salin &amp; tempel naskah soal beserta gambar sekaligus</span>
                </div>
              </button>

              <button
                type="button"
                onClick={() => setCreationMethod('manual')}
                className={`p-4 rounded-2xl border-2 text-left transition-all cursor-pointer flex items-start gap-3 ${
                  creationMethod === 'manual'
                    ? 'border-emerald-600 bg-emerald-50/70 shadow-xs'
                    : 'border-slate-200 bg-white hover:border-slate-300'
                }`}
              >
                <div className={`w-9 h-9 rounded-xl flex items-center justify-center shrink-0 ${
                  creationMethod === 'manual' ? 'bg-emerald-600 text-white' : 'bg-slate-100 text-slate-600'
                }`}>
                  <Layers className="w-4 h-4" />
                </div>
                <div>
                  <span className="block text-xs font-extrabold text-slate-900">Cara 3: Manual / Bank Soal</span>
                  <span className="block text-[11px] text-slate-500 mt-0.5">Ketik butir baru atau ambil dari Bank Soal sekolah</span>
                </div>
              </button>
            </div>

            {creationMethod === 'upload' && (
              <>
                <div className="border-2 border-dashed border-slate-300 hover:border-blue-500 rounded-2xl p-6 sm:p-8 text-center transition-all bg-slate-50/50">
                  <Upload className="w-10 h-10 text-blue-700 mx-auto mb-2" />
                  <label className="inline-block px-5 py-2.5 bg-blue-700 hover:bg-blue-600 text-white rounded-xl text-xs font-bold shadow-md transition-all cursor-pointer">
                    <span>Pilih Berkas DOCX / PDF / XLSX / TXT / Foto Soal</span>
                    <input
                      type="file"
                      accept=".docx,.doc,.pdf,.xlsx,.xls,.txt,.csv,.jpg,.jpeg,.png,.webp"
                      onChange={handleUploadDocument}
                      className="hidden"
                    />
                  </label>
                  <p className="text-[11px] text-slate-400 mt-2">
                    Mendukung Microsoft Word (.docx), PDF (teks digital, gambar tersemat &amp; scan), Excel (.xlsx/.xls), TXT, maupun foto lembar soal (JPG/PNG/WEBP).
                  </p>
                  {uploadedFileName && (
                    <div className="mt-3 flex flex-wrap items-center justify-center gap-2">
                      <span className="text-xs font-semibold text-blue-800 bg-blue-50 py-1.5 px-3 rounded-lg inline-block">
                        Berkas Terunggah: {uploadedFileName}
                      </span>
                      {docImageStats.extractedCount > 0 && (
                        <span className="text-xs font-semibold text-emerald-800 bg-emerald-50 py-1.5 px-3 rounded-lg inline-block">
                          {docImageStats.extractedCount} Gambar Terekstrak
                        </span>
                      )}
                      {docImageStats.failedCount > 0 && (
                        <span className="text-xs font-semibold text-amber-800 bg-amber-50 py-1.5 px-3 rounded-lg inline-block">
                          {docImageStats.failedCount} Gambar Perlu Periksa
                        </span>
                      )}
                    </div>
                  )}
                </div>

                {isParsingDoc && (
                  <div className="p-4 bg-blue-50 rounded-2xl flex items-center gap-3 text-xs text-blue-800 font-semibold animate-pulse">
                    <RefreshCw className="w-4 h-4 animate-spin text-blue-700" />
                    <span>Sedang membaca dokumen asli dan mengekstrak butir soal, rumus, tabel, serta gambar...</span>
                  </div>
                )}

                {parseError && (
                  <div className="p-4 bg-red-50 border border-red-200 rounded-2xl text-xs text-red-700 font-medium flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                    <div className="flex items-start gap-2.5">
                      <AlertTriangle className="w-4 h-4 text-red-600 flex-shrink-0 mt-0.5" />
                      <span>{parseError}</span>
                    </div>
                    {parsedSoalList.length === 0 && (
                      <button
                        type="button"
                        onClick={() => handleAddQuestion('pilihan_ganda')}
                        className="px-3 py-1.5 bg-white hover:bg-red-100 text-red-800 border border-red-300 rounded-xl text-[11px] font-bold shrink-0 cursor-pointer transition-colors"
                      >
                        + Tambah Soal Manual
                      </button>
                    )}
                  </div>
                )}
              </>
            )}

            {creationMethod === 'paste' && (
              <ExamPasteEditor onParsed={handlePasteParsed} isProcessingExternal={isParsingDoc} />
            )}

            {creationMethod === 'manual' && (
              <div className="p-5 rounded-2xl border border-emerald-200 bg-emerald-50/40 space-y-4">
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                  <div>
                    <h4 className="text-sm font-extrabold text-slate-900">Susun Manual atau Ambil dari Bank Soal</h4>
                    <p className="text-xs text-slate-600">
                      Tambahkan soal Pilihan Ganda, Benar/Salah, Isian Singkat, atau Esai langsung pada Langkah 3, atau impor dari Bank Soal.
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={() => {
                      setBankPickerSelectedIds([]);
                      setShowBankPickerModal(true);
                    }}
                    className="px-4 py-2.5 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl text-xs font-bold shadow-xs flex items-center gap-2 shrink-0 cursor-pointer"
                  >
                    <Database className="w-4 h-4" />
                    <span>Pilih dari Bank Soal ({bankSoalList.length})</span>
                  </button>
                </div>

                <div className="flex flex-wrap gap-2">
                  {(
                    [
                      { tipe: 'pilihan_ganda', label: '+ Pilihan Ganda (A–E)' },
                      { tipe: 'benar_salah', label: '+ Benar / Salah' },
                      { tipe: 'isian_singkat', label: '+ Isian Singkat' },
                      { tipe: 'uraian', label: '+ Esai / Uraian' },
                    ] as const
                  ).map((item) => (
                    <button
                      key={item.tipe}
                      type="button"
                      onClick={() => handleAddQuestion(item.tipe)}
                      className="px-3.5 py-2 rounded-xl bg-white border border-slate-300 hover:border-emerald-500 hover:bg-emerald-50 text-xs font-bold text-slate-800 transition-colors cursor-pointer"
                    >
                      {item.label}
                    </button>
                  ))}
                </div>
              </div>
            )}
          </div>

          {/* Step 2: Metadata */}
          <div className="bg-white rounded-3xl p-6 sm:p-8 border border-slate-200 shadow-xs space-y-6">
            <h3 className="text-base font-extrabold text-slate-900 border-b border-slate-100 pb-3">
              Langkah 2: Informasi & Pengaturan Ujian
            </h3>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="space-y-1.5 md:col-span-2">
                <label className="text-xs font-bold text-slate-700">Judul Ujian</label>
                <input
                  type="text"
                  value={formJudul}
                  onChange={(e) => setFormJudul(e.target.value)}
                  placeholder="Contoh: Asesmen Sumatif Akhir Semester - IPA Kelas 5"
                  className="w-full p-3 rounded-xl border border-slate-200 focus:border-blue-600 focus:ring-4 focus:ring-blue-100 outline-none text-xs font-semibold"
                />
              </div>

              <div className="space-y-1.5">
                <label className="text-xs font-bold text-slate-700">Mata Pelajaran</label>
                <input
                  type="text"
                  list="mapel-suggestions-cbt"
                  value={formMapel}
                  onChange={(e) => setFormMapel(e.target.value)}
                  placeholder="Contoh: IPA, Matematika, Bahasa Indonesia"
                  className="w-full p-3 rounded-xl border border-slate-200 focus:border-blue-600 outline-none text-xs font-semibold"
                />
                <datalist id="mapel-suggestions-cbt">
                  {availableMapel.map((m) => (
                    <option key={m.id} value={m.nama} />
                  ))}
                </datalist>
              </div>

              <div className="space-y-1.5">
                <label className="text-xs font-bold text-slate-700">Durasi Pengerjaan (Menit)</label>
                <input
                  type="number"
                  min={5}
                  value={formDurasi}
                  onChange={(e) => setFormDurasi(Math.max(1, Number(e.target.value) || 60))}
                  className="w-full p-3 rounded-xl border border-slate-200 focus:border-blue-600 outline-none text-xs font-semibold"
                />
              </div>

              <div className="space-y-1.5">
                <label className="text-xs font-bold text-slate-700">Jadwal Mulai Ujian</label>
                <input
                  type="datetime-local"
                  value={formTanggalMulai}
                  onChange={(e) => setFormTanggalMulai(e.target.value)}
                  className="w-full p-3 rounded-xl border border-slate-200 focus:border-blue-600 outline-none text-xs font-semibold"
                />
              </div>

              <div className="space-y-1.5">
                <label className="text-xs font-bold text-slate-700">Jadwal Selesai Ujian</label>
                <input
                  type="datetime-local"
                  value={formTanggalSelesai}
                  onChange={(e) => setFormTanggalSelesai(e.target.value)}
                  className="w-full p-3 rounded-xl border border-slate-200 focus:border-blue-600 outline-none text-xs font-semibold"
                />
              </div>

              <div className="space-y-1.5">
                <label className="text-xs font-bold text-slate-700">KKM Kelulusan</label>
                <input
                  type="number"
                  min={0}
                  max={100}
                  value={formKkm}
                  onChange={(e) => setFormKkm(Math.max(0, Math.min(100, Number(e.target.value) || 0)))}
                  className="w-full p-3 rounded-xl border border-slate-200 focus:border-blue-600 outline-none text-xs font-semibold"
                />
              </div>

              <div className="space-y-1.5">
                <label className="text-xs font-bold text-slate-700">Jumlah Soal Ditampilkan ke Siswa</label>
                <div className="flex items-center gap-2">
                  <input
                    type="number"
                    min={0}
                    max={Math.max(500, parsedSoalList.length)}
                    value={formJumlahSoalTampil}
                    onChange={(e) => setFormJumlahSoalTampil(Math.max(0, Number(e.target.value) || 0))}
                    className="w-28 p-3 rounded-xl border border-slate-200 focus:border-blue-600 outline-none text-xs font-semibold"
                  />
                  <span className="text-[11px] text-slate-500">
                    Isi <strong>0</strong> untuk menampilkan seluruh bank soal ({parsedSoalList.length} soal)
                  </span>
                </div>
              </div>

              <div className="space-y-1.5">
                <label className="text-xs font-bold text-slate-700">Pengacakan Urutan Soal</label>
                <select
                  value={formModeAcakSoal}
                  onChange={(e) => setFormModeAcakSoal(e.target.value as ModePengacakanUjian)}
                  className="w-full p-3 rounded-xl border border-slate-200 focus:border-blue-600 outline-none text-xs font-semibold bg-white"
                >
                  <option value="per_siswa">Acak Berbeda per Siswa (Direkomendasikan)</option>
                  <option value="sama">Acak Sekali (Urutan Sama untuk Semua Siswa)</option>
                  <option value="off">Urutan Asli Dokumen (Tidak Diacak)</option>
                </select>
              </div>

              <div className="space-y-1.5">
                <label className="text-xs font-bold text-slate-700">Pengacakan Pilihan Jawaban (A-E)</label>
                <select
                  value={formModeAcakPilihan}
                  onChange={(e) => setFormModeAcakPilihan(e.target.value as ModePengacakanUjian)}
                  className="w-full p-3 rounded-xl border border-slate-200 focus:border-blue-600 outline-none text-xs font-semibold bg-white"
                >
                  <option value="per_siswa">Acak Pilihan per Siswa (Kunci Tetap Akurat)</option>
                  <option value="sama">Acak Sekali (Pola Sama Semua Siswa)</option>
                  <option value="off">Sesuai Dokumen Asli (Tidak Diacak)</option>
                </select>
              </div>

              <div className="space-y-1.5">
                <label className="text-xs font-bold text-slate-700">Maksimal Kesempatan Mengerjakan</label>
                <div className="flex items-center gap-2">
                  <input
                    type="number"
                    min={1}
                    max={10}
                    value={formJumlahPercobaan}
                    onChange={(e) => setFormJumlahPercobaan(Math.max(1, Math.min(10, Number(e.target.value) || 1)))}
                    className="w-24 p-3 rounded-xl border border-slate-200 focus:border-blue-600 outline-none text-xs font-semibold"
                  />
                  <span className="text-[11px] text-slate-500">
                    kali percobaan (isi <strong>1</strong> untuk sekali ujian saja)
                  </span>
                </div>
              </div>

              <div className="space-y-1.5">
                <label className="text-xs font-bold text-slate-700">Batas Toleransi Anti-Kecurangan</label>
                <div className="flex items-center gap-2">
                  <input
                    type="number"
                    min={1}
                    max={10}
                    value={formBatasPelanggaran}
                    onChange={(e) => setFormBatasPelanggaran(Math.max(1, Math.min(10, Number(e.target.value) || 3)))}
                    className="w-24 p-3 rounded-xl border border-slate-200 focus:border-blue-600 outline-none text-xs font-semibold"
                  />
                  <span className="text-[11px] text-slate-500">
                    kali pelanggaran sebelum sesi terkunci
                  </span>
                </div>
              </div>

              <div className="md:col-span-2 grid grid-cols-1 sm:grid-cols-3 gap-3 pt-1">
                <label className="flex items-start gap-2.5 p-3.5 rounded-2xl border border-slate-200 bg-slate-50/70 cursor-pointer hover:border-blue-300 transition-colors">
                  <input
                    type="checkbox"
                    checked={formModeFullscreen}
                    onChange={(e) => setFormModeFullscreen(e.target.checked)}
                    className="mt-0.5 rounded border-slate-300 text-blue-700 focus:ring-blue-500"
                  />
                  <div className="text-xs">
                    <span className="font-bold text-slate-800 block">Wajib Layar Penuh</span>
                    <span className="text-[11px] text-slate-500">Aktifkan fullscreen &amp; deteksi keluar layar penuh saat siswa mengerjakan</span>
                  </div>
                </label>

                <label className="flex items-start gap-2.5 p-3.5 rounded-2xl border border-slate-200 bg-slate-50/70 cursor-pointer hover:border-blue-300 transition-colors">
                  <input
                    type="checkbox"
                    checked={formTampilkanNilai}
                    onChange={(e) => setFormTampilkanNilai(e.target.checked)}
                    className="mt-0.5 rounded border-slate-300 text-blue-700 focus:ring-blue-500"
                  />
                  <div className="text-xs">
                    <span className="font-bold text-slate-800 block">Tampilkan Nilai Langsung</span>
                    <span className="text-[11px] text-slate-500">Siswa melihat skor PG &amp; status KKM segera setelah ujian dikumpulkan</span>
                  </div>
                </label>

                <label className="flex items-start gap-2.5 p-3.5 rounded-2xl border border-slate-200 bg-slate-50/70 cursor-pointer hover:border-blue-300 transition-colors">
                  <input
                    type="checkbox"
                    checked={formTampilkanPembahasan}
                    onChange={(e) => setFormTampilkanPembahasan(e.target.checked)}
                    className="mt-0.5 rounded border-slate-300 text-blue-700 focus:ring-blue-500"
                  />
                  <div className="text-xs">
                    <span className="font-bold text-slate-800 block">Tampilkan Kunci Setelah Selesai</span>
                    <span className="text-[11px] text-slate-500">Ringkasan kunci &amp; koreksi dikirim server hanya setelah siswa selesai</span>
                  </div>
                </label>
              </div>

              <div className="space-y-1.5 md:col-span-2">
                <label className="text-xs font-bold text-slate-700">Petunjuk Pengerjaan Ujian</label>
                <textarea
                  rows={2}
                  value={formPetunjuk}
                  onChange={(e) => setFormPetunjuk(e.target.value)}
                  placeholder="Tuliskan tata tertib dan petunjuk pengerjaan untuk siswa..."
                  className="w-full p-3 rounded-xl border border-slate-200 focus:border-blue-600 outline-none text-xs leading-relaxed"
                />
              </div>

              <div className="space-y-1.5 md:col-span-2">
                <label className="text-xs font-bold text-slate-700">Pilih Kelas Sasaran</label>
                <div className="flex flex-wrap gap-2 pt-1">
                  {availableKelas.map((k) => {
                    const isChecked = formKelasTarget.includes(k.nama);
                    return (
                      <button
                        key={k.id}
                        type="button"
                        onClick={() => {
                          if (isChecked) {
                            setFormKelasTarget(formKelasTarget.filter((c) => c !== k.nama));
                          } else {
                            setFormKelasTarget([...formKelasTarget, k.nama]);
                          }
                        }}
                        className={`px-3 py-1.5 rounded-xl text-xs font-bold border transition-colors cursor-pointer ${
                          isChecked
                            ? 'bg-blue-700 text-white border-blue-700 shadow-xs'
                            : 'bg-slate-50 text-slate-700 border-slate-200 hover:bg-slate-100'
                        }`}
                      >
                        {k.nama}
                      </button>
                    );
                  })}
                </div>
              </div>
            </div>
          </div>

          {/* Step 3: Side-by-Side Review & Editing (Masalah B) */}
          <div className="bg-white rounded-3xl p-6 sm:p-8 border border-slate-200 shadow-xs space-y-6">
            {/* Document Readiness & Key Inspection Banner */}
            {(() => {
              const pgQuestions = parsedSoalList.filter((s) => s.tipe === 'pilihan_ganda');
              const bsQuestions = parsedSoalList.filter((s) => s.tipe === 'benar_salah');
              const isianQuestions = parsedSoalList.filter((s) => s.tipe === 'isian_singkat');
              const uraianQuestions = parsedSoalList.filter((s) => s.tipe === 'uraian');
              const objQuestions = [...pgQuestions, ...bsQuestions, ...isianQuestions];
              const kunciFoundCount = objQuestions.filter((s) => Boolean(s.kunciJawaban?.trim())).length;
              const kunciMissingCount = objQuestions.length - kunciFoundCount;
              const attachedImagesCount = parsedSoalList.reduce(
                (acc, q) =>
                  acc +
                  (q.gambar ? 1 : 0) +
                  (q.gambarTambahan ? q.gambarTambahan.length : 0) +
                  (q.pilihanGambar ? Object.keys(q.pilihanGambar).length : 0),
                0
              );
              const isReady = parsedSoalList.length > 0 && kunciMissingCount === 0 && docImageStats.failedCount === 0;

              return (
                <div className="bg-slate-50 rounded-2xl border border-slate-200 p-4 space-y-3">
                  <div className="flex flex-col sm:flex-row justify-between sm:items-center gap-3">
                    <div className="flex items-center gap-2">
                      <span className="text-xs font-bold text-slate-800 uppercase tracking-wider flex items-center gap-1.5">
                        <CheckCircle2 className="w-4 h-4 text-blue-700" />
                        Pemeriksaan Kesiapan Dokumen &amp; Kunci
                      </span>
                      <span
                        className={`px-2.5 py-0.5 rounded-full text-[10px] font-extrabold uppercase tracking-wider ${
                          parsedSoalList.length === 0
                            ? 'bg-slate-200 text-slate-600'
                            : isReady
                            ? 'bg-emerald-100 text-emerald-800'
                            : 'bg-amber-100 text-amber-800'
                        }`}
                      >
                        {parsedSoalList.length === 0
                          ? 'Belum Ada Soal'
                          : isReady
                          ? 'Siap Diterbitkan'
                          : kunciMissingCount > 0
                          ? `Perlu Kunci Jawaban (${kunciMissingCount} Soal)`
                          : `Periksa Gambar (${docImageStats.failedCount} Gagal)`}
                      </span>
                    </div>

                    <div className="flex flex-wrap items-center gap-2">
                      {parsedSoalList.length > 0 && (
                        <>
                          <button
                            type="button"
                            onClick={() => {
                              setStudentPreviewIndex(0);
                              setShowStudentPreviewModal(true);
                            }}
                            className="px-3 py-1.5 bg-blue-700 hover:bg-blue-600 text-white rounded-xl text-xs font-bold flex items-center gap-1.5 shadow-xs transition-colors cursor-pointer"
                          >
                            <Eye className="w-3.5 h-3.5" />
                            <span>Pratinjau Siswa</span>
                          </button>
                          <button
                            type="button"
                            onClick={() => {
                              setBankMetaForm({
                                mataPelajaran: formMapel || 'Umum',
                                kelas: formKelasTarget[0] || 'Semua Kelas',
                                materi: '',
                                tingkatKesulitan: 'sedang',
                              });
                              setBankSaveModal({ mode: 'bulk' });
                            }}
                            className="px-3 py-1.5 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl text-xs font-bold flex items-center gap-1.5 shadow-xs transition-colors cursor-pointer"
                          >
                            <Database className="w-3.5 h-3.5" />
                            <span>Simpan Semua ke Bank</span>
                          </button>
                        </>
                      )}
                      <button
                        type="button"
                        onClick={() => {
                          setShowSeparateKeyModal(true);
                          setSeparateKeyFeedback(null);
                        }}
                        className="px-3 py-1.5 bg-amber-500 hover:bg-amber-600 text-white rounded-xl text-xs font-bold flex items-center gap-1.5 shadow-xs transition-colors cursor-pointer"
                        title="Terapkan teks kunci jawaban dari tabel atau dokumen terpisah"
                      >
                        <KeyRound className="w-3.5 h-3.5" />
                        <span>Terapkan Kunci Terpisah</span>
                      </button>
                    </div>
                  </div>

                  <div className="grid grid-cols-2 sm:grid-cols-5 gap-3">
                    <div className="bg-white p-3 rounded-xl border border-slate-200">
                      <div className="text-[11px] text-slate-500 font-medium">Total Soal Terbaca</div>
                      <div className="text-lg font-extrabold text-slate-900">{parsedSoalList.length} Butir</div>
                    </div>
                    <div className="bg-white p-3 rounded-xl border border-slate-200">
                      <div className="text-[11px] text-slate-500 font-medium">Komposisi Objektif</div>
                      <div className="text-sm font-extrabold text-blue-700">
                        {pgQuestions.length} PG &bull; {bsQuestions.length} B/S &bull; {isianQuestions.length} Isian
                      </div>
                    </div>
                    <div className="bg-white p-3 rounded-xl border border-slate-200">
                      <div className="text-[11px] text-slate-500 font-medium">Kunci Objektif Lengkap</div>
                      <div className="text-lg font-extrabold text-emerald-600">
                        {kunciFoundCount} <span className="text-xs text-slate-400">/ {objQuestions.length}</span>
                      </div>
                      {kunciMissingCount > 0 && (
                        <div className="text-[10px] font-bold text-amber-700">{kunciMissingCount} Belum Ada Kunci</div>
                      )}
                    </div>
                    <div className="bg-white p-3 rounded-xl border border-slate-200">
                      <div className="text-[11px] text-slate-500 font-medium">Soal Uraian / Esai</div>
                      <div className="text-lg font-extrabold text-purple-700">{uraianQuestions.length} Butir</div>
                    </div>
                    <div className="bg-white p-3 rounded-xl border border-slate-200">
                      <div className="text-[11px] text-slate-500 font-medium">Status Gambar</div>
                      <div className="text-lg font-extrabold text-indigo-700">
                        {attachedImagesCount}{' '}
                        <span className="text-xs text-slate-400 font-semibold">Terpasang</span>
                      </div>
                      <div className="text-[10px] text-slate-500">
                        {docImageStats.extractedCount} Terekstrak
                        {docImageStats.failedCount > 0 ? ` • ${docImageStats.failedCount} Gagal` : ''}
                      </div>
                    </div>
                  </div>

                  {(docImageStats.failedCount > 0 || docImageStats.warnings.length > 0) && (
                    <div className="p-3 bg-amber-50 border border-amber-200 rounded-xl space-y-1">
                      <div className="flex items-center gap-1.5 text-xs font-bold text-amber-800">
                        <AlertTriangle className="w-4 h-4 text-amber-600 flex-shrink-0" />
                        <span>
                          Catatan Pemeriksaan Dokumen &amp; Gambar ({docImageStats.extractedCount} gambar terbaca
                          {docImageStats.failedCount > 0 ? `, ${docImageStats.failedCount} gagal/perlu pemeriksaan` : ''}):
                        </span>
                      </div>
                      <ul className="list-disc pl-5 text-[11px] text-amber-800 space-y-0.5">
                        {docImageStats.warnings.map((w, wIdx) => (
                          <li key={wIdx}>{w}</li>
                        ))}
                      </ul>
                    </div>
                  )}
                </div>
              );
            })()}

            <div className="flex flex-col sm:flex-row justify-between sm:items-center gap-3 border-b border-slate-100 pb-4">
              <div>
                <span className="text-[10px] font-extrabold uppercase tracking-wider text-blue-700 bg-blue-50 px-2.5 py-1 rounded-full">
                  Langkah 3: Pemeriksaan, Urutan &amp; Kunci Jawaban
                </span>
                <h3 className="text-base font-extrabold text-slate-900 mt-1">
                  Editor Butir Soal ({parsedSoalList.length} Soal)
                </h3>
                <p className="text-xs text-slate-500">
                  Periksa keakuratan teks, tipe soal (PG, Benar/Salah, Isian Singkat, Esai), kunci jawaban, dan urutan soal.
                </p>
              </div>

              <div className="flex flex-wrap items-center gap-2">
                <button
                  type="button"
                  onClick={() => {
                    setBankPickerSelectedIds([]);
                    setShowBankPickerModal(true);
                  }}
                  className="px-3.5 py-2 bg-emerald-50 hover:bg-emerald-100 text-emerald-700 rounded-xl text-xs font-bold flex items-center gap-1.5 transition-colors cursor-pointer"
                >
                  <Database className="w-3.5 h-3.5" />
                  <span>Ambil Bank Soal</span>
                </button>

                <button
                  type="button"
                  onClick={() => handleAddQuestion('pilihan_ganda')}
                  className="px-3.5 py-2 bg-blue-50 hover:bg-blue-100 text-blue-700 rounded-xl text-xs font-bold flex items-center gap-1.5 transition-colors cursor-pointer"
                >
                  <Plus className="w-4 h-4" />
                  <span>Tambah Soal</span>
                </button>
              </div>
            </div>

            {/* Extracted Questions Editor */}
            <div className="space-y-4">
                {parsedSoalList.map((q, idx) => (
                  <div
                    key={q.id || idx}
                    className="p-5 rounded-2xl border border-slate-200 bg-slate-50/70 space-y-3 hover:border-slate-300 transition-all"
                  >
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <div className="flex items-center gap-2">
                        <span className="w-7 h-7 rounded-lg bg-blue-700 text-white text-xs font-bold flex items-center justify-center">
                          {idx + 1}
                        </span>
                        <select
                          value={q.tipe}
                          onChange={(e) => {
                            const newType = e.target.value as TipeSoalUjian;
                            const updated = [...parsedSoalList];
                            const cur = { ...updated[idx], tipe: newType };
                            if (newType === 'benar_salah') {
                              cur.pilihan = { A: 'Benar', B: 'Salah' };
                              cur.kunciJawaban =
                                cur.kunciJawaban === 'BENAR' || cur.kunciJawaban === 'SALAH'
                                  ? cur.kunciJawaban
                                  : 'BENAR';
                            } else if (newType === 'pilihan_ganda') {
                              cur.pilihan = cur.pilihan && Object.keys(cur.pilihan).length >= 2
                                ? cur.pilihan
                                : { A: '', B: '', C: '', D: '' };
                            } else {
                              cur.pilihan = undefined;
                            }
                            updated[idx] = cur;
                            setParsedSoalList(updated);
                          }}
                          className="p-1.5 rounded-lg border border-slate-200 text-xs font-semibold bg-white"
                        >
                          <option value="pilihan_ganda">Pilihan Ganda (A–E)</option>
                          <option value="benar_salah">Benar / Salah</option>
                          <option value="isian_singkat">Isian Singkat</option>
                          <option value="uraian">Uraian / Esai</option>
                        </select>
                      </div>

                      <div className="flex flex-wrap items-center gap-1.5">
                        <div className="flex items-center gap-1 text-xs mr-1">
                          <span>Bobot:</span>
                          <input
                            type="number"
                            min={1}
                            value={q.bobot || 1}
                            onChange={(e) => {
                              const updated = [...parsedSoalList];
                              updated[idx].bobot = Math.max(1, Number(e.target.value) || 1);
                              setParsedSoalList(updated);
                            }}
                            className="w-12 p-1 rounded-lg border border-slate-200 text-center text-xs font-bold bg-white"
                          />
                        </div>

                        <button
                          type="button"
                          disabled={idx === 0}
                          onClick={() => handleMoveQuestion(idx, 'up')}
                          className="p-1.5 rounded-lg border border-slate-200 bg-white text-slate-600 hover:bg-slate-100 disabled:opacity-30 cursor-pointer"
                          title="Geser Soal ke Atas"
                        >
                          <ArrowUp className="w-3.5 h-3.5" />
                        </button>
                        <button
                          type="button"
                          disabled={idx === parsedSoalList.length - 1}
                          onClick={() => handleMoveQuestion(idx, 'down')}
                          className="p-1.5 rounded-lg border border-slate-200 bg-white text-slate-600 hover:bg-slate-100 disabled:opacity-30 cursor-pointer"
                          title="Geser Soal ke Bawah"
                        >
                          <ArrowDown className="w-3.5 h-3.5" />
                        </button>
                        <button
                          type="button"
                          onClick={() => {
                            setBankMetaForm({
                              mataPelajaran: formMapel || 'Umum',
                              kelas: formKelasTarget[0] || 'Semua Kelas',
                              materi: '',
                              tingkatKesulitan: 'sedang',
                            });
                            setBankSaveModal({ mode: 'single', soal: q });
                          }}
                          className="p-1.5 rounded-lg border border-indigo-200 bg-indigo-50 text-indigo-700 hover:bg-indigo-100 cursor-pointer"
                          title="Simpan Butir Soal Ini ke Bank Soal"
                        >
                          <Database className="w-3.5 h-3.5" />
                        </button>
                        <button
                          type="button"
                          onClick={() => {
                            setParsedSoalList(
                              parsedSoalList.filter((_, i) => i !== idx).map((item, i) => ({ ...item, nomor: i + 1 }))
                            );
                          }}
                          className="p-1.5 text-slate-400 hover:text-red-600 rounded-lg cursor-pointer"
                          title="Hapus Soal Ini"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </div>
                    </div>

                    {/* Question image if attached */}
                    {q.gambar ? (
                      <div className="rounded-xl border border-slate-200 bg-white p-3 space-y-2">
                        <div className="flex flex-wrap items-center justify-between gap-2">
                          <div className="flex flex-wrap items-center gap-2">
                            <span className="text-[11px] font-bold text-blue-700 bg-blue-50 px-2 py-0.5 rounded-lg flex items-center gap-1">
                              <ImageIcon className="w-3 h-3" />
                              Gambar Soal
                            </span>
                            <span
                              className={`text-[10px] font-bold px-2 py-0.5 rounded-lg ${
                                q.gambarStatus === 'warning' || q.gambarStatus === 'error'
                                  ? 'bg-amber-100 text-amber-800'
                                  : 'bg-emerald-100 text-emerald-800'
                              }`}
                            >
                              {q.gambarStatus === 'warning' || q.gambarStatus === 'error'
                                ? 'Perlu Diperiksa'
                                : 'Berhasil Diproses'}
                            </span>
                            <span className="text-[10px] text-slate-500 font-medium">
                              Posisi: <strong>{q.gambarPosisi || 'atas'}</strong> &bull; Ukuran: <strong>{q.gambarUkuran || 'sedang'}</strong>
                            </span>
                          </div>

                          <div className="flex flex-wrap items-center gap-1.5">
                            {parsedSoalList.length > 1 && (
                              <select
                                value=""
                                onChange={(e) => {
                                  if (e.target.value !== '') {
                                    handleReassignQuestionImage(idx, Number(e.target.value));
                                  }
                                }}
                                className="px-2 py-1 rounded-lg border border-slate-200 text-[11px] font-semibold bg-slate-50 text-slate-700 cursor-pointer"
                                title="Pindahkan / tukar gambar ini ke nomor soal lain"
                              >
                                <option value="">Pindah ke Soal...</option>
                                {parsedSoalList.map((_, targetIdx) =>
                                  targetIdx !== idx ? (
                                    <option key={targetIdx} value={targetIdx}>
                                      Pindah ke Soal No. {targetIdx + 1}
                                    </option>
                                  ) : null
                                )}
                              </select>
                            )}
                            <button
                              type="button"
                              onClick={() =>
                                setAdminLightbox({
                                  isOpen: true,
                                  imageUrl: q.gambar!,
                                  title: `Gambar Soal Nomor ${idx + 1}`,
                                  caption: q.gambarCaption,
                                })
                              }
                              className="px-2 py-1 text-slate-600 hover:text-blue-700 hover:bg-slate-100 rounded-lg text-xs font-semibold flex items-center gap-1 cursor-pointer"
                              title="Perbesar Pratinjau"
                            >
                              <ZoomIn className="w-3.5 h-3.5" />
                              <span>Lihat</span>
                            </button>
                            <button
                              type="button"
                              onClick={() => handleOpenQuestionImageModal(idx)}
                              className="px-2 py-1 text-blue-700 hover:bg-blue-50 rounded-lg text-xs font-semibold flex items-center gap-1 cursor-pointer"
                              title="Ubah / Potong / Atur Posisi & Ukuran Gambar"
                            >
                              <Sliders className="w-3.5 h-3.5" />
                              <span>Atur / Crop</span>
                            </button>
                            <button
                              type="button"
                              onClick={() => {
                                const updated = [...parsedSoalList];
                                if (updated[idx].gambarStoragePath || updated[idx].gambarId) {
                                  deleteExamImage(
                                    updated[idx].gambarStoragePath,
                                    db.getActiveSchoolId(),
                                    updated[idx].gambarId
                                  ).catch(() => {});
                                }
                                delete updated[idx].gambar;
                                delete updated[idx].gambarId;
                                delete updated[idx].gambarStoragePath;
                                delete updated[idx].gambarCaption;
                                delete updated[idx].gambarPosisi;
                                delete updated[idx].gambarUkuran;
                                delete updated[idx].gambarStatus;
                                delete updated[idx].gambarWarning;
                                setParsedSoalList(updated);
                              }}
                              className="p-1 text-slate-400 hover:text-red-600 hover:bg-red-50 rounded-lg"
                              title="Hapus Gambar"
                            >
                              <Trash2 className="w-3.5 h-3.5" />
                            </button>
                          </div>
                        </div>

                        {q.gambarWarning && (
                          <div className="p-2 bg-amber-50 border border-amber-200 rounded-lg text-[11px] text-amber-800 font-medium">
                            {q.gambarWarning}
                          </div>
                        )}

                        <div className="max-h-48 overflow-hidden flex items-center justify-center bg-slate-50 rounded-xl p-2 border border-slate-100">
                          <img
                            src={q.gambar}
                            alt="Gambar Soal"
                            onError={(e) => {
                              e.currentTarget.alt = 'Gambar tidak dapat dimuat';
                              e.currentTarget.classList.add('opacity-50');
                            }}
                            className="max-h-44 object-contain rounded-lg"
                          />
                        </div>

                        {q.gambarCaption && (
                          <p className="text-[10px] text-slate-500 italic text-center">
                            Caption: {q.gambarCaption}
                          </p>
                        )}
                      </div>
                    ) : (
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        {q.gambarWarning ? (
                          <span className="text-[11px] text-amber-700 bg-amber-50 px-2.5 py-1 rounded-lg border border-amber-200 font-medium">
                            {q.gambarWarning}
                          </span>
                        ) : (
                          <span />
                        )}
                        <button
                          type="button"
                          onClick={() => handleOpenQuestionImageModal(idx)}
                          className="px-3 py-1.5 bg-blue-50 hover:bg-blue-100 text-blue-700 rounded-xl text-xs font-bold flex items-center gap-1.5 transition-colors cursor-pointer border border-blue-200"
                        >
                          <ImagePlus className="w-3.5 h-3.5" />
                          <span>+ Tambah Gambar Soal</span>
                        </button>
                      </div>
                    )}

                    {/* Question Text */}
                    <textarea
                      rows={3}
                      value={q.pertanyaan}
                      onChange={(e) => {
                        const updated = [...parsedSoalList];
                        updated[idx].pertanyaan = e.target.value;
                        setParsedSoalList(updated);
                      }}
                      placeholder="Tulis teks pertanyaan persis sesuai naskah asli..."
                      className="w-full p-3 rounded-xl border border-slate-200 bg-white text-xs leading-relaxed focus:border-blue-600 outline-none"
                    />

                    {/* Ordered Visual / Table / Formula Preview Box */}
                    {(Boolean(q.kontenElemen?.length) ||
                      Boolean(q.gambarTambahan?.length) ||
                      q.pertanyaan.includes('|') ||
                      /[\^_]/.test(q.pertanyaan)) && (
                      <div className="rounded-xl border border-indigo-100 bg-white p-3 space-y-2">
                        <div className="text-[10px] font-extrabold uppercase tracking-wider text-indigo-700 flex items-center justify-between">
                          <span>Pratinjau Tata Letak Berurutan (Teks, Rumus, Tabel &amp; Multi-Gambar)</span>
                          {q.gambarTambahan && q.gambarTambahan.length > 0 && (
                            <span className="bg-indigo-50 px-2 py-0.5 rounded text-[10px]">
                              +{q.gambarTambahan.length} Gambar Tambahan
                            </span>
                          )}
                        </div>
                        <ExamRichContent
                          soal={q}
                          displayNumber={idx + 1}
                          imageLoadErrors={previewImageErrors}
                          imageRetryNonce={previewImageRetryNonce}
                          compact={true}
                          onImageError={(key) =>
                            setPreviewImageErrors((prev) => ({ ...prev, [key]: true }))
                          }
                          onRetryImage={(key) => {
                            setPreviewImageErrors((prev) => {
                              const next = { ...prev };
                              delete next[key];
                              return next;
                            });
                            setPreviewImageRetryNonce((n) => n + 1);
                          }}
                          onOpenLightbox={(payload) =>
                            setAdminLightbox({
                              isOpen: true,
                              imageUrl: payload.imageUrl,
                              title: payload.title,
                              caption: payload.caption,
                            })
                          }
                        />
                      </div>
                    )}

                    {/* Benar / Salah Options */}
                    {q.tipe === 'benar_salah' && (
                      <div className="space-y-2 pt-1">
                        <div className="text-[11px] font-bold text-slate-600">
                          Kunci Jawaban Pernyataan (Klik salah satu):
                        </div>
                        <div className="grid grid-cols-2 gap-2.5">
                          {(['BENAR', 'SALAH'] as const).map((tf) => {
                            const active = (q.kunciJawaban || '').toUpperCase() === tf;
                            return (
                              <button
                                key={tf}
                                type="button"
                                onClick={() => {
                                  const updated = [...parsedSoalList];
                                  updated[idx].kunciJawaban = tf;
                                  updated[idx].perluVerifikasi = false;
                                  setParsedSoalList(updated);
                                }}
                                className={`py-2.5 px-3 rounded-xl border text-xs font-extrabold flex items-center justify-center gap-2 cursor-pointer transition-all ${
                                  active
                                    ? tf === 'BENAR'
                                      ? 'bg-emerald-600 border-emerald-600 text-white shadow-xs'
                                      : 'bg-rose-600 border-rose-600 text-white shadow-xs'
                                    : 'bg-white border-slate-200 text-slate-700 hover:bg-slate-50'
                                }`}
                              >
                                {active && <Check className="w-3.5 h-3.5" />}
                                <span>{tf}</span>
                              </button>
                            );
                          })}
                        </div>
                      </div>
                    )}

                    {/* Isian Singkat Key Input */}
                    {q.tipe === 'isian_singkat' && (
                      <div className="space-y-1.5 pt-1">
                        <label className="text-[11px] font-bold text-slate-600 block">
                          Kunci Jawaban Singkat (Pisahkan variasi jawaban benar dengan tanda <code className="bg-slate-200 px-1 rounded">;</code>):
                        </label>
                        <input
                          type="text"
                          value={q.kunciJawaban || ''}
                          onChange={(e) => {
                            const updated = [...parsedSoalList];
                            updated[idx].kunciJawaban = e.target.value;
                            updated[idx].perluVerifikasi = !e.target.value.trim();
                            setParsedSoalList(updated);
                          }}
                          placeholder="Contoh: Soekarno; Ir. Soekarno"
                          className="w-full p-2.5 rounded-xl border border-slate-200 bg-white text-xs font-semibold focus:border-blue-600 outline-none"
                        />
                      </div>
                    )}

                    {/* Pedoman Penilaian untuk Uraian */}
                    {q.tipe === 'uraian' && (
                      <div className="space-y-1">
                        <label className="text-[11px] font-bold text-slate-600">
                          Pedoman / Kunci Penilaian Uraian (Opsional):
                        </label>
                        <input
                          type="text"
                          value={q.pedomanPenilaian || ''}
                          onChange={(e) => {
                            const updated = [...parsedSoalList];
                            updated[idx].pedomanPenilaian = e.target.value;
                            setParsedSoalList(updated);
                          }}
                          placeholder="Contoh: Jawaban memuat pengertian fotosintesis dan 2 contoh zat hasil..."
                          className="w-full p-2.5 rounded-xl border border-slate-200 bg-white text-xs focus:border-blue-600 outline-none"
                        />
                      </div>
                    )}

                    {/* Multiple Choice Options */}
                    {q.tipe === 'pilihan_ganda' && (
                      <div className="space-y-2.5 pt-1">
                        <div className="text-[11px] font-bold text-slate-600 flex items-center justify-between">
                          <span>Pilihan Jawaban (Klik huruf untuk kunci):</span>
                          {q.perluVerifikasi && !q.kunciJawaban && (
                            <span className="text-[10px] text-amber-700 bg-amber-50 px-2 py-0.5 rounded font-bold">
                              Wajib Pilih Kunci
                            </span>
                          )}
                        </div>
                        {['A', 'B', 'C', 'D', 'E'].map((letter) => {
                          const isKunci = (q.kunciJawaban || '').toUpperCase() === letter;
                          const optionText = q.pilihan?.[letter] || '';
                          const choiceImg = q.pilihanGambar?.[letter];

                          // If doc had only A-D, don't show empty E unless teacher types it or has image
                          if (letter === 'E' && !optionText && !isKunci && !choiceImg) {
                            return null;
                          }

                          return (
                            <div key={letter} className="space-y-1 bg-white p-2.5 rounded-xl border border-slate-200">
                              <div className="flex items-center gap-2">
                                <button
                                  type="button"
                                  onClick={() => {
                                    const updated = [...parsedSoalList];
                                    updated[idx].kunciJawaban = letter;
                                    updated[idx].perluVerifikasi = false;
                                    setParsedSoalList(updated);
                                  }}
                                  className={`w-7 h-7 rounded-lg text-xs font-extrabold flex items-center justify-center cursor-pointer transition-colors flex-shrink-0 ${
                                    isKunci
                                      ? 'bg-emerald-600 text-white shadow-xs'
                                      : 'bg-white border border-slate-200 text-slate-600 hover:bg-slate-100'
                                  }`}
                                  title={isKunci ? 'Kunci Jawaban Terpilih' : 'Klik untuk jadikan kunci'}
                                >
                                  {letter}
                                </button>
                                <input
                                  type="text"
                                  value={optionText}
                                  onChange={(e) => {
                                    const updated = [...parsedSoalList];
                                    updated[idx].pilihan = {
                                      ...(updated[idx].pilihan || {}),
                                      [letter]: e.target.value,
                                    };
                                    setParsedSoalList(updated);
                                  }}
                                  placeholder={`Teks Pilihan ${letter} (opsional jika menggunakan gambar)`}
                                  className="flex-1 p-2 rounded-lg border border-slate-200 bg-white text-xs outline-none focus:border-blue-600 font-medium"
                                />

                                {/* Choice Image Trigger Button */}
                                {!choiceImg ? (
                                  <button
                                    type="button"
                                    onClick={() => handleOpenChoiceImageModal(idx, letter)}
                                    className="px-2.5 py-1.5 bg-slate-50 hover:bg-blue-50 text-slate-600 hover:text-blue-700 border border-slate-200 rounded-lg text-xs font-semibold flex items-center gap-1 transition-colors cursor-pointer"
                                    title={`Tambah gambar untuk pilihan ${letter}`}
                                  >
                                    <ImagePlus className="w-3.5 h-3.5" />
                                    <span className="hidden sm:inline">+ Gambar</span>
                                  </button>
                                ) : (
                                  <div className="flex items-center gap-1">
                                    <button
                                      type="button"
                                      onClick={() => handleOpenChoiceImageModal(idx, letter)}
                                      className="p-1.5 text-blue-600 hover:bg-blue-50 rounded-lg"
                                      title="Ubah Gambar Pilihan"
                                    >
                                      <Sliders className="w-3.5 h-3.5" />
                                    </button>
                                    <button
                                      type="button"
                                      onClick={() => {
                                        const updated = [...parsedSoalList];
                                        if (updated[idx].pilihanGambar) {
                                          const pg = { ...updated[idx].pilihanGambar };
                                          delete pg[letter];
                                          updated[idx].pilihanGambar = Object.keys(pg).length > 0 ? pg : undefined;
                                          setParsedSoalList(updated);
                                        }
                                      }}
                                      className="p-1.5 text-slate-400 hover:text-red-600 rounded-lg"
                                      title="Hapus Gambar Pilihan"
                                    >
                                      <Trash2 className="w-3.5 h-3.5" />
                                    </button>
                                  </div>
                                )}
                              </div>

                              {/* Choice Image Thumbnail Preview */}
                              {choiceImg && (
                                <div className="ml-9 mt-1 flex items-center gap-3 bg-slate-50 p-2 rounded-lg border border-slate-100">
                                  <img
                                    src={choiceImg}
                                    alt={`Pilihan ${letter}`}
                                    onError={(e) => {
                                      e.currentTarget.alt = `Gambar pilihan ${letter} gagal dimuat`;
                                      e.currentTarget.classList.add('opacity-50');
                                    }}
                                    className="w-16 h-14 object-contain rounded-md bg-white border border-slate-200 cursor-zoom-in"
                                    onClick={() =>
                                      setAdminLightbox({
                                        isOpen: true,
                                        imageUrl: choiceImg,
                                        title: `Pilihan ${letter} - Soal Nomor ${idx + 1}`,
                                      })
                                    }
                                  />
                                  <div className="text-[11px] text-slate-500">
                                    <span className="font-bold text-slate-700 block">Gambar Terpasang pada Pilihan {letter}</span>
                                    <span>Klik thumbnail untuk memperbesar</span>
                                  </div>
                                </div>
                              )}
                            </div>
                          );
                        })}
                      </div>
                    )}
                  </div>
                ))}
            </div>

            {/* Approval & Publish Buttons */}
            <div className="pt-6 border-t border-slate-100 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
              <span className="text-xs text-slate-500 font-medium flex items-center gap-2">
                {isSavingExam && <RefreshCw className="w-3.5 h-3.5 animate-spin text-blue-600" />}
                <span>
                  {isSavingExam
                    ? savingStatusText || 'Mengunggah gambar soal & menyimpan naskah ujian...'
                    : 'Pastikan seluruh butir soal, gambar, dan kunci telah diperiksa dengan seksama.'}
                </span>
              </span>

              <div className="flex flex-wrap gap-2">
                <button
                  type="button"
                  disabled={isSavingExam}
                  onClick={() => handleSaveExam('draf')}
                  className="px-4 py-2.5 bg-slate-100 hover:bg-slate-200 disabled:opacity-50 text-slate-700 rounded-xl text-xs font-bold transition-colors cursor-pointer"
                >
                  {isSavingExam ? 'Menyimpan...' : 'Simpan sebagai Draf'}
                </button>
                <button
                  type="button"
                  disabled={isSavingExam}
                  onClick={() => handleSaveExam('terjadwal')}
                  className="px-4 py-2.5 bg-indigo-600 hover:bg-indigo-700 disabled:opacity-50 text-white rounded-xl text-xs font-bold shadow-xs transition-colors cursor-pointer flex items-center gap-1.5"
                >
                  <Calendar className="w-3.5 h-3.5" />
                  <span>Jadwalkan Ujian</span>
                </button>
                <button
                  type="button"
                  disabled={isSavingExam}
                  onClick={() => handleSaveExam('aktif')}
                  className="px-6 py-2.5 bg-blue-700 hover:bg-blue-600 disabled:opacity-50 text-white rounded-xl text-xs font-bold shadow-md transition-all cursor-pointer flex items-center gap-2"
                >
                  <Send className="w-4 h-4" />
                  <span>{isSavingExam ? 'Mengunggah & Menerbitkan...' : 'Setujui & Terbitkan Aktif'}</span>
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* -------------------------------------------------------------------- */}
      {/* SUBTAB BARU: BANK SOAL SEKOLAH                                       */}
      {/* -------------------------------------------------------------------- */}
      {activeSubTab === 'bank' && (() => {
        const filteredBank = bankSoalList.filter((item) => {
          if (bankFilterMapel && !item.mataPelajaran.toLowerCase().includes(bankFilterMapel.toLowerCase())) {
            return false;
          }
          if (bankFilterKelas && !item.kelas.toLowerCase().includes(bankFilterKelas.toLowerCase())) {
            return false;
          }
          if (bankFilterKesulitan && item.tingkatKesulitan !== bankFilterKesulitan) {
            return false;
          }
          if (bankSearch.trim()) {
            const qLower = bankSearch.toLowerCase();
            if (
              !item.pertanyaan.toLowerCase().includes(qLower) &&
              !(item.materi || '').toLowerCase().includes(qLower) &&
              !item.mataPelajaran.toLowerCase().includes(qLower)
            ) {
              return false;
            }
          }
          return true;
        });

        const uniqueMapel = Array.from(new Set(bankSoalList.map((b) => b.mataPelajaran).filter(Boolean)));
        const uniqueKelas = Array.from(new Set(bankSoalList.map((b) => b.kelas).filter(Boolean)));

        return (
          <div className="space-y-5">
            <div className="bg-white rounded-3xl p-6 sm:p-8 border border-slate-200 shadow-xs space-y-5">
              <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 border-b border-slate-100 pb-4">
                <div>
                  <span className="text-[10px] font-extrabold uppercase tracking-wider text-indigo-700 bg-indigo-50 px-2.5 py-1 rounded-full">
                    Gudang Soal Sekolah Terstruktur
                  </span>
                  <h3 className="text-lg font-extrabold text-slate-900 mt-1.5">
                    Bank Soal ({bankSoalList.length} Butir Tersimpan)
                  </h3>
                  <p className="text-xs text-slate-500">
                    Kelola, filter berdasarkan mapel/kelas/kesulitan, dan gunakan ulang soal terbaik ke berbagai ujian baru.
                  </p>
                </div>

                <div className="flex flex-wrap gap-2">
                  {selectedBankIds.length > 0 && (
                    <button
                      type="button"
                      onClick={() => handleImportFromBankSelection(selectedBankIds, true)}
                      className="px-4 py-2.5 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl text-xs font-bold shadow-sm flex items-center gap-1.5 cursor-pointer"
                    >
                      <CheckCircle2 className="w-4 h-4" />
                      <span>Buat Ujian dari {selectedBankIds.length} Soal</span>
                    </button>
                  )}
                  <button
                    type="button"
                    onClick={() => {
                      setBankEditingItem(null);
                      setBankItemForm({
                        mataPelajaran: availableMapel[0]?.nama || '',
                        kelas: availableKelas[0]?.nama || 'Semua Kelas',
                        materi: '',
                        tingkatKesulitan: 'sedang',
                        tipe: 'pilihan_ganda',
                        pertanyaan: '',
                        pilihanA: '',
                        pilihanB: '',
                        pilihanC: '',
                        pilihanD: '',
                        pilihanE: '',
                        kunciJawaban: 'A',
                        bobot: 1,
                        pembahasan: '',
                        pedomanPenilaian: '',
                      });
                      setBankManualModalOpen(true);
                    }}
                    className="px-4 py-2.5 bg-blue-700 hover:bg-blue-600 text-white rounded-xl text-xs font-bold shadow-sm flex items-center gap-1.5 cursor-pointer"
                  >
                    <Plus className="w-4 h-4" />
                    <span>+ Tambah ke Bank Soal</span>
                  </button>
                </div>
              </div>

              {/* Filter Bar */}
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 bg-slate-50 p-4 rounded-2xl border border-slate-200">
                <div className="relative">
                  <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
                  <input
                    type="text"
                    value={bankSearch}
                    onChange={(e) => setBankSearch(e.target.value)}
                    placeholder="Cari teks soal / materi..."
                    className="w-full pl-9 pr-3 py-2 rounded-xl border border-slate-200 bg-white text-xs font-medium"
                  />
                </div>
                <select
                  value={bankFilterMapel}
                  onChange={(e) => setBankFilterMapel(e.target.value)}
                  className="p-2 rounded-xl border border-slate-200 bg-white text-xs font-semibold"
                >
                  <option value="">Semua Mata Pelajaran</option>
                  {uniqueMapel.map((m) => (
                    <option key={m} value={m}>{m}</option>
                  ))}
                </select>
                <select
                  value={bankFilterKelas}
                  onChange={(e) => setBankFilterKelas(e.target.value)}
                  className="p-2 rounded-xl border border-slate-200 bg-white text-xs font-semibold"
                >
                  <option value="">Semua Kelas</option>
                  {uniqueKelas.map((k) => (
                    <option key={k} value={k}>{k}</option>
                  ))}
                </select>
                <select
                  value={bankFilterKesulitan}
                  onChange={(e) => setBankFilterKesulitan(e.target.value)}
                  className="p-2 rounded-xl border border-slate-200 bg-white text-xs font-semibold"
                >
                  <option value="">Semua Tingkat Kesulitan</option>
                  <option value="mudah">Mudah</option>
                  <option value="sedang">Sedang</option>
                  <option value="sulit">Sulit</option>
                </select>
              </div>

              {/* Bank Soal List */}
              {filteredBank.length > 0 ? (
                <div className="space-y-3">
                  {filteredBank.map((item) => {
                    const isSelected = selectedBankIds.includes(item.id);
                    return (
                      <div
                        key={item.id}
                        className={`p-4 rounded-2xl border transition-all flex items-start gap-3 ${
                          isSelected ? 'border-emerald-500 bg-emerald-50/40' : 'border-slate-200 bg-white hover:border-slate-300'
                        }`}
                      >
                        <input
                          type="checkbox"
                          checked={isSelected}
                          onChange={() => {
                            setSelectedBankIds((prev) =>
                              prev.includes(item.id)
                                ? prev.filter((id) => id !== item.id)
                                : [...prev, item.id]
                            );
                          }}
                          className="mt-1 w-4 h-4 rounded border-slate-300 text-emerald-600 cursor-pointer"
                        />
                        <div className="flex-1 min-w-0 space-y-2">
                          <div className="flex flex-wrap items-center gap-1.5">
                            <span className="px-2 py-0.5 rounded-md bg-blue-50 text-blue-700 text-[10px] font-extrabold uppercase">
                              {item.tipe.replace('_', ' ')}
                            </span>
                            <span className="px-2 py-0.5 rounded-md bg-slate-100 text-slate-700 text-[10px] font-bold">
                              {item.mataPelajaran}
                            </span>
                            <span className="px-2 py-0.5 rounded-md bg-slate-100 text-slate-600 text-[10px] font-semibold">
                              {item.kelas}
                            </span>
                            {item.materi && (
                              <span className="px-2 py-0.5 rounded-md bg-purple-50 text-purple-700 text-[10px] font-semibold">
                                Materi: {item.materi}
                              </span>
                            )}
                            <span
                              className={`px-2 py-0.5 rounded-md text-[10px] font-extrabold uppercase ${
                                item.tingkatKesulitan === 'mudah'
                                  ? 'bg-emerald-100 text-emerald-800'
                                  : item.tingkatKesulitan === 'sulit'
                                  ? 'bg-rose-100 text-rose-800'
                                  : 'bg-amber-100 text-amber-800'
                              }`}
                            >
                              {item.tingkatKesulitan}
                            </span>
                          </div>

                          <p className="text-xs sm:text-sm font-semibold text-slate-900 whitespace-pre-line break-words">
                            {item.pertanyaan}
                          </p>

                          {item.gambar && (
                            <img
                              src={item.gambar}
                              alt="Gambar Bank Soal"
                              className="max-h-28 rounded-xl border border-slate-200 object-contain bg-slate-50 p-1"
                            />
                          )}

                          {item.kunciJawaban && (
                            <div className="text-[11px] text-emerald-700 font-bold">
                              Kunci: {item.kunciJawaban}
                            </div>
                          )}
                        </div>

                        <div className="flex items-center gap-1 shrink-0">
                          <button
                            type="button"
                            onClick={() => {
                              setBankEditingItem(item);
                              setBankItemForm({
                                mataPelajaran: item.mataPelajaran,
                                kelas: item.kelas,
                                materi: item.materi || '',
                                tingkatKesulitan: item.tingkatKesulitan,
                                tipe: item.tipe,
                                pertanyaan: item.pertanyaan,
                                pilihanA: item.pilihan?.A || '',
                                pilihanB: item.pilihan?.B || '',
                                pilihanC: item.pilihan?.C || '',
                                pilihanD: item.pilihan?.D || '',
                                pilihanE: item.pilihan?.E || '',
                                kunciJawaban: item.kunciJawaban || '',
                                bobot: item.bobot || 1,
                                pembahasan: item.pembahasan || '',
                                pedomanPenilaian: item.pedomanPenilaian || '',
                              });
                              setBankManualModalOpen(true);
                            }}
                            className="p-1.5 text-slate-500 hover:text-blue-700 hover:bg-blue-50 rounded-lg cursor-pointer"
                            title="Edit Soal"
                          >
                            <Edit className="w-4 h-4" />
                          </button>
                          <button
                            type="button"
                            onClick={() => {
                              db.deleteBankSoalItem(item.id);
                              setBankSoalList(db.getBankSoalList());
                              setSelectedBankIds((prev) => prev.filter((id) => id !== item.id));
                              toast.success('Soal dihapus dari Bank Soal.');
                            }}
                            className="p-1.5 text-slate-400 hover:text-red-600 hover:bg-red-50 rounded-lg cursor-pointer"
                            title="Hapus dari Bank Soal"
                          >
                            <Trash2 className="w-4 h-4" />
                          </button>
                        </div>
                      </div>
                    );
                  })}
                </div>
              ) : (
                <div className="p-12 text-center border border-dashed border-slate-300 rounded-2xl text-slate-400 text-xs space-y-2">
                  <Database className="w-10 h-10 mx-auto text-slate-300" />
                  <p className="font-bold text-slate-600">
                    {bankSoalList.length === 0
                      ? 'Bank Soal Sekolah Masih Kosong'
                      : 'Tidak ada soal yang cocok dengan filter pencarian'}
                  </p>
                  <p>
                    Tambahkan soal secara langsung di sini atau simpan butir soal dari editor pembuatan ujian.
                  </p>
                </div>
              )}
            </div>
          </div>
        );
      })()}

      {/* -------------------------------------------------------------------- */}
      {/* SUBTAB 3: PENGAWASAN & PAIRING MEJA GURU                             */}
      {/* -------------------------------------------------------------------- */}
      {activeSubTab === 'pengawasan' && (
        <div className="space-y-6">
          <div className="bg-white rounded-3xl p-6 border border-slate-200 shadow-xs flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
            <div className="w-full sm:w-auto min-w-0">
              <label className="text-xs font-bold text-slate-500 uppercase tracking-wider block mb-1">
                Pilih Ujian yang Sedang Berlangsung:
              </label>
              <select
                value={selectedUjianId}
                onChange={(e) => setSelectedUjianId(e.target.value)}
                className="w-full sm:w-auto max-w-full p-2.5 rounded-xl border border-slate-200 text-xs sm:text-sm font-extrabold text-slate-900 bg-white"
              >
                {ujianList.map((u) => (
                  <option key={u.id} value={u.id}>
                    {u.judul} ({u.mataPelajaran} - {u.kelasTarget.join(', ')})
                  </option>
                ))}
              </select>
            </div>

            <div className="flex gap-2">
              {!isCameraActive ? (
                <button
                  onClick={startCamera}
                  className="px-4 py-2.5 bg-blue-700 hover:bg-blue-600 text-white rounded-xl text-xs font-bold shadow-md flex items-center gap-2 transition-colors cursor-pointer"
                >
                  <Camera className="w-4 h-4" />
                  <span>Buka Scanner Kamera Guru</span>
                </button>
              ) : (
                <button
                  onClick={stopCamera}
                  className="px-4 py-2.5 bg-red-600 hover:bg-red-500 text-white rounded-xl text-xs font-bold shadow-md flex items-center gap-2 transition-colors cursor-pointer"
                >
                  <CameraOff className="w-4 h-4" />
                  <span>Tutup Kamera</span>
                </button>
              )}
            </div>
          </div>

          {/* Camera Viewport (Always mounted in DOM so videoRef is valid during startCamera) */}
          <div className={isCameraActive ? 'bg-slate-900 rounded-3xl p-6 text-white text-center space-y-4 shadow-xl' : 'hidden'}>
            <div className="max-w-sm mx-auto relative rounded-2xl overflow-hidden aspect-square bg-black border-2 border-blue-500">
              <video ref={videoRef} playsInline muted className="w-full h-full object-cover" />
              <canvas ref={canvasRef} className="hidden" />
              <div className="absolute inset-0 border-2 border-white/30 rounded-2xl pointer-events-none flex items-center justify-center">
                <div className="w-48 h-48 border-2 border-blue-400 rounded-xl animate-pulse" />
              </div>
            </div>
            <p className="text-xs text-blue-200">
              Arahkan kamera ke <strong>Kartu QR Absensi Siswa</strong> untuk menghasilkan kode akses pairing 6-digit secara instan.
            </p>
          </div>

          {/* Session Monitoring Table */}
          <div className="bg-white rounded-3xl p-6 border border-slate-200 shadow-xs space-y-4">
            <h3 className="text-base font-extrabold text-slate-900">
              Daftar Sesi Ujian Siswa ({sessionList.length} Siswa Terdaftar/Aktif)
            </h3>

            <div className="overflow-x-auto">
              <table className="w-full text-xs text-left">
                <thead className="bg-slate-50 text-slate-600 uppercase font-bold border-b border-slate-200">
                  <tr>
                    <th className="p-3">No.</th>
                    <th className="p-3">Nama Siswa</th>
                    <th className="p-3">Kelas</th>
                    <th className="p-3">Kode Akses</th>
                    <th className="p-3">Status</th>
                    <th className="p-3">Pelanggaran</th>
                    <th className="p-3">Aksi Guru</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {sessionList.map((s, idx) => (
                    <tr key={s.id} className="hover:bg-slate-50">
                      <td className="p-3 font-semibold text-slate-500">{idx + 1}</td>
                      <td className="p-3 font-bold text-slate-800">{s.namaSiswa}</td>
                      <td className="p-3 text-slate-600">{s.kelas}</td>
                      <td className="p-3 font-mono font-bold text-blue-700">{s.passCode || '-'}</td>
                      <td className="p-3">
                        <span
                          className={`px-2 py-0.5 rounded-full font-bold text-[10px] ${
                            s.status === 'selesai' || s.status === 'waktu_habis'
                              ? 'bg-emerald-100 text-emerald-800'
                              : s.status === 'terkunci'
                              ? 'bg-red-100 text-red-800'
                              : s.status === 'sedang_mengerjakan' || s.status === 'mengerjakan'
                              ? 'bg-blue-100 text-blue-800'
                              : 'bg-slate-100 text-slate-600'
                          }`}
                        >
                          {s.status.replace(/_/g, ' ').toUpperCase()}
                        </span>
                      </td>
                      <td className="p-3 font-semibold text-amber-700">
                        {(s.jumlahPelanggaran || 0) > 0 && s.logPelanggaran?.length > 0 ? (
                          <button
                            type="button"
                            onClick={() => setViolationDetailSession(s)}
                            className="px-2 py-1 rounded-lg bg-amber-50 hover:bg-amber-100 border border-amber-200 text-amber-800 font-bold text-[11px] inline-flex items-center gap-1 cursor-pointer"
                            title="Lihat rincian catatan pelanggaran"
                          >
                            <ShieldAlert className="w-3 h-3" />
                            <span>{s.jumlahPelanggaran} kali</span>
                          </button>
                        ) : (
                          <span>{s.jumlahPelanggaran || 0} kali</span>
                        )}
                      </td>
                      <td className="p-3">
                        {s.status === 'terkunci' && (
                          <button
                            onClick={async () => {
                              await db.saveSesiUjian({
                                ...s,
                                status: s.waktuMulai ? 'sedang_mengerjakan' : 'terverifikasi',
                                jumlahPelanggaran: 0,
                              });
                              toast.success(`Kunci ujian siswa ${s.namaSiswa} berhasil dibuka kembali.`);
                            }}
                            className="px-2.5 py-1 bg-amber-600 hover:bg-amber-500 text-white rounded-lg font-bold text-[11px] cursor-pointer flex items-center gap-1"
                          >
                            <Unlock className="w-3 h-3" />
                            <span>Buka Kunci</span>
                          </button>
                        )}
                      </td>
                    </tr>
                  ))}
                  {sessionList.length === 0 && (
                    <tr>
                      <td colSpan={7} className="p-8 text-center text-slate-400">
                        Belum ada siswa yang diverifikasi untuk ujian ini.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* -------------------------------------------------------------------- */}
      {/* SUBTAB 4: PENILAIAN & ANALITIK UJIAN                                */}
      {/* -------------------------------------------------------------------- */}
      {activeSubTab === 'penilaian' && (() => {
        const analytics = activeExam
          ? computeExamAnalytics(activeExam, sessionList, db.getSiswaList())
          : null;

        return (
          <div className="space-y-6">
            <div className="bg-white rounded-3xl p-6 sm:p-8 border border-slate-200 shadow-xs space-y-6">
              <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 border-b border-slate-100 pb-4">
                <div className="space-y-2">
                  <h3 className="text-base font-extrabold text-slate-900">
                    Rekapitulasi Nilai, Statistik &amp; Analisis Butir Soal
                  </h3>
                  <p className="text-xs text-slate-500">
                    Penilaian objektif otomatis (PG, Benar/Salah, Isian Singkat), koreksi manual uraian, analitik kelas, serta ekspor Excel 2-sheet.
                  </p>
                  {ujianList.length > 0 && (
                    <select
                      value={selectedUjianId}
                      onChange={(e) => setSelectedUjianId(e.target.value)}
                      className="w-full sm:w-auto max-w-full p-2 rounded-xl border border-slate-200 text-xs font-bold text-slate-800 bg-slate-50"
                    >
                      {ujianList.map((u) => (
                        <option key={u.id} value={u.id}>
                          {u.judul} ({u.mataPelajaran} - {u.kelasTarget.join(', ')})
                        </option>
                      ))}
                    </select>
                  )}
                </div>

                <div className="flex gap-2">
                  <button
                    onClick={handleExportExcel}
                    disabled={sessionList.length === 0}
                    className="px-4 py-2 bg-emerald-700 hover:bg-emerald-600 disabled:opacity-50 text-white rounded-xl text-xs font-bold shadow-md flex items-center gap-2 transition-colors cursor-pointer"
                  >
                    <Download className="w-4 h-4" />
                    <span>Ekspor Nilai &amp; Analisis (.xlsx)</span>
                  </button>
                </div>
              </div>

              {/* Analytics KPI Summary */}
              {analytics && (
                <div className="space-y-4">
                  <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
                    <div className="p-4 rounded-2xl bg-blue-50/70 border border-blue-200">
                      <span className="text-[11px] font-bold text-blue-800 uppercase block">Rata-Rata Kelas</span>
                      <div className="text-2xl font-extrabold text-blue-950 mt-1">{analytics.rataRata}</div>
                      <span className="text-[11px] text-blue-700">
                        Tertinggi: <strong>{analytics.nilaiTertinggi}</strong> &bull; Terendah: <strong>{analytics.nilaiTerendah}</strong>
                      </span>
                    </div>

                    <div className="p-4 rounded-2xl bg-emerald-50/70 border border-emerald-200">
                      <span className="text-[11px] font-bold text-emerald-800 uppercase block">Ketuntasan KKM ({activeExam?.kkm})</span>
                      <div className="text-2xl font-extrabold text-emerald-950 mt-1">{analytics.persenKetuntasan}%</div>
                      <span className="text-[11px] text-emerald-700">
                        Lulus: <strong>{analytics.jumlahLulusKkm}</strong> &bull; Remedial: <strong>{Math.max(0, analytics.pesertaSudahCount - analytics.jumlahLulusKkm)}</strong>
                      </span>
                    </div>

                    <div className="p-4 rounded-2xl bg-indigo-50/70 border border-indigo-200">
                      <span className="text-[11px] font-bold text-indigo-800 uppercase block">Partisipasi Peserta</span>
                      <div className="text-2xl font-extrabold text-indigo-950 mt-1">
                        {analytics.pesertaSudahCount} / {analytics.totalSiswaTarget || (analytics.pesertaSudahCount + analytics.pesertaSedangCount)}
                      </div>
                      <span className="text-[11px] text-indigo-700">
                        Selesai Mengerjakan &bull; {analytics.pesertaBelumList.length} Belum Ikut
                      </span>
                    </div>

                    <div className="p-4 rounded-2xl bg-amber-50/70 border border-amber-200 flex flex-col justify-between">
                      <div>
                        <span className="text-[11px] font-bold text-amber-800 uppercase block">Status Peserta Belum Ikut</span>
                        <div className="text-xl font-extrabold text-amber-950 mt-1">{analytics.pesertaBelumList.length} Siswa</div>
                      </div>
                      {analytics.pesertaBelumList.length > 0 && (
                        <button
                          type="button"
                          onClick={() => setShowUnparticipatedList((v) => !v)}
                          className="text-left text-[11px] font-bold text-amber-800 underline mt-1 cursor-pointer"
                        >
                          {showUnparticipatedList ? 'Sembunyikan Daftar' : 'Lihat Daftar Siswa Belum Ikut'}
                        </button>
                      )}
                    </div>
                  </div>

                  {showUnparticipatedList && analytics.pesertaBelumList.length > 0 && (
                    <div className="p-4 rounded-2xl bg-amber-50 border border-amber-200 space-y-2">
                      <h4 className="text-xs font-extrabold text-amber-900">
                        Daftar Siswa Belum Mengikuti Ujian ({analytics.pesertaBelumList.length} Siswa):
                      </h4>
                      <div className="flex flex-wrap gap-1.5 max-h-40 overflow-y-auto">
                        {analytics.pesertaBelumList.map((st) => (
                          <span
                            key={st.id}
                            className="px-2.5 py-1 rounded-lg bg-white border border-amber-200 text-[11px] font-semibold text-slate-700"
                          >
                            {st.namaLengkap} ({st.kelas})
                          </span>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              )}

              {/* Student Scores Table */}
              <div className="overflow-x-auto">
                <table className="w-full text-xs text-left">
                  <thead className="bg-slate-50 text-slate-600 uppercase font-bold border-b border-slate-200">
                    <tr>
                      <th className="p-3">No.</th>
                      <th className="p-3">Nama Siswa</th>
                      <th className="p-3">Kelas</th>
                      <th className="p-3">B / S / K</th>
                      <th className="p-3">Objektif</th>
                      <th className="p-3">Uraian</th>
                      <th className="p-3">Nilai Akhir</th>
                      <th className="p-3">Kelulusan</th>
                      <th className="p-3 text-right">Koreksi</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {sessionList.map((s, idx) => {
                      const hasEssayQuestions = activeExam?.soalList.some((q) => q.tipe === 'uraian');
                      return (
                        <tr key={s.id} className="hover:bg-slate-50">
                          <td className="p-3 font-semibold text-slate-500">{idx + 1}</td>
                          <td className="p-3 font-bold text-slate-800">
                            <div className="flex flex-wrap items-center gap-1.5">
                              <span>{s.namaSiswa}</span>
                              {(s.attemptNumber || 1) > 1 && (
                                <span className="text-[9px] font-bold px-1.5 py-0.5 rounded bg-indigo-50 text-indigo-700 border border-indigo-200">
                                  Ke-{s.attemptNumber}
                                </span>
                              )}
                              {s.gradedBy && (
                                <span
                                  className={`text-[9px] font-extrabold px-1.5 py-0.5 rounded uppercase ${
                                    s.gradedBy === 'backend'
                                      ? 'bg-emerald-50 text-emerald-700 border border-emerald-200'
                                      : 'bg-slate-100 text-slate-600 border border-slate-200'
                                  }`}
                                >
                                  {s.gradedBy === 'backend' ? 'Server' : 'Lokal'}
                                </span>
                              )}
                              {s.pendingSubmitSync && (
                                <span className="text-[9px] font-extrabold px-1.5 py-0.5 rounded bg-amber-50 text-amber-700 border border-amber-200">
                                  Pending Sync
                                </span>
                              )}
                            </div>
                            {s.adaUraianBelumDinilai && (
                              <span className="inline-block mt-0.5 text-[10px] font-bold text-amber-700 bg-amber-50 px-1.5 py-0.5 rounded border border-amber-200">
                                Perlu Koreksi Uraian
                              </span>
                            )}
                          </td>
                          <td className="p-3 text-slate-600">{s.kelas}</td>
                          <td className="p-3 font-mono text-[11px] font-bold text-slate-700">
                            <span className="text-emerald-700">{s.jumlahBenar ?? '-'}</span>
                            {' / '}
                            <span className="text-red-600">{s.jumlahSalah ?? '-'}</span>
                            {' / '}
                            <span className="text-slate-500">{s.jumlahKosong ?? '-'}</span>
                          </td>
                          <td className="p-3 font-semibold">{s.nilaiPg}</td>
                          <td className="p-3 font-semibold">{s.nilaiUraian}</td>
                          <td className="p-3 font-extrabold text-blue-700 text-sm">{s.nilaiAkhir}</td>
                          <td className="p-3">
                            <span
                              className={`px-2 py-0.5 rounded-full font-bold text-[10px] ${
                                s.lulusKkm ? 'bg-emerald-100 text-emerald-800' : 'bg-amber-100 text-amber-800'
                              }`}
                            >
                              {s.lulusKkm ? 'Lulus KKM' : 'Remedial'}
                            </span>
                          </td>
                          <td className="p-3 text-right">
                            {hasEssayQuestions ? (
                              <button
                                type="button"
                                onClick={() => handleOpenGradingModal(s)}
                                className={`px-3 py-1.5 rounded-xl text-[11px] font-bold transition-colors cursor-pointer inline-flex items-center gap-1 ${
                                  s.adaUraianBelumDinilai
                                    ? 'bg-amber-500 hover:bg-amber-600 text-white shadow-xs'
                                    : 'bg-blue-50 hover:bg-blue-100 text-blue-700'
                                }`}
                              >
                                <Edit className="w-3 h-3" />
                                <span>{s.adaUraianBelumDinilai ? 'Koreksi Uraian' : 'Ubah Nilai'}</span>
                              </button>
                            ) : (
                              <span className="text-[11px] text-slate-400">Otomatis</span>
                            )}
                          </td>
                        </tr>
                      );
                    })}
                    {sessionList.length === 0 && (
                      <tr>
                        <td colSpan={9} className="p-8 text-center text-slate-400">
                          Belum ada rekapan nilai untuk ujian ini.
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            </div>

            {/* Item Analysis Panel */}
            {analytics && analytics.analisisButir.length > 0 && (
              <div className="bg-white rounded-3xl p-6 sm:p-8 border border-slate-200 shadow-xs space-y-4">
                <div>
                  <span className="text-[10px] font-extrabold uppercase tracking-wider text-blue-700 bg-blue-50 px-2.5 py-1 rounded-full">
                    Analisis Daya Serap &amp; Kesulitan
                  </span>
                  <h4 className="text-base font-extrabold text-slate-900 mt-1.5">
                    Analisis Butir Soal ({analytics.analisisButir.length} Butir)
                  </h4>
                  <p className="text-xs text-slate-500">
                    Menampilkan tingkat ketepatan jawaban siswa per nomor soal (Mudah &ge;70%, Sedang 35–69%, Sulit &lt;35%).
                  </p>
                </div>

                <div className="space-y-2.5">
                  {analytics.analisisButir.map((item) => (
                    <div key={item.soalId} className="p-3.5 rounded-2xl border border-slate-200 bg-slate-50/60 space-y-2">
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <div className="flex items-center gap-2 min-w-0">
                          <span className="px-2 py-0.5 rounded-lg bg-slate-900 text-white text-[11px] font-extrabold shrink-0">
                            No. {item.nomor}
                          </span>
                          <span className="text-[10px] font-bold uppercase text-blue-700 bg-blue-50 px-2 py-0.5 rounded shrink-0">
                            {item.tipe.replace('_', ' ')}
                          </span>
                          <span className="text-xs font-semibold text-slate-800 truncate max-w-md">
                            {item.pertanyaanSingkat}
                          </span>
                        </div>

                        <div className="flex items-center gap-2 shrink-0 text-[11px]">
                          <span className="text-slate-600">
                            B: <strong className="text-emerald-700">{item.benarCount}</strong> &bull;
                            S: <strong className="text-rose-600">{item.salahCount}</strong> &bull;
                            K: <strong>{item.kosongCount}</strong>
                          </span>
                          <span
                            className={`px-2 py-0.5 rounded-full font-extrabold text-[10px] ${
                              item.tingkatKesulitan === 'Mudah'
                                ? 'bg-emerald-100 text-emerald-800'
                                : item.tingkatKesulitan === 'Sulit'
                                ? 'bg-rose-100 text-rose-800'
                                : 'bg-amber-100 text-amber-800'
                            }`}
                          >
                            {item.tingkatKesulitan} ({item.persentaseBenar}%)
                          </span>
                        </div>
                      </div>

                      <div className="w-full h-2 rounded-full bg-slate-200 overflow-hidden">
                        <div
                          className={`h-full rounded-full transition-all ${
                            item.tingkatKesulitan === 'Mudah'
                              ? 'bg-emerald-500'
                              : item.tingkatKesulitan === 'Sulit'
                              ? 'bg-rose-500'
                              : 'bg-amber-500'
                          }`}
                          style={{ width: `${Math.max(2, item.persentaseBenar)}%` }}
                        />
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        );
      })()}

      {/* -------------------------------------------------------------------- */}
      {/* SUBTAB 5: UJI BEBAN & SIMULASI SERVER (STRESS TESTING)               */}
      {/* -------------------------------------------------------------------- */}
      {activeSubTab === 'simulasi' && (
        <div className="bg-white rounded-3xl p-6 sm:p-8 border border-slate-200 shadow-xs space-y-6">
          <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 border-b border-slate-100 pb-4">
            <div>
              <span className="text-[10px] font-extrabold uppercase tracking-wider text-blue-700 bg-blue-50 px-2.5 py-1 rounded-full">
                Benchmark Kinerja & Keandalan
              </span>
              <h3 className="text-lg font-extrabold text-slate-900 mt-2">
                Simulasi Uji Beban & Skalabilitas Server (Stress Testing)
              </h3>
              <p className="text-xs text-slate-500 mt-0.5 max-w-2xl">
                Uji ketahanan arsitektur saat puluhan, ratusan, hingga ribuan siswa secara serentak mengakses lembar ujian, melakukan autosave jawaban setiap detik, dan mengumpulkan hasil ujian.
              </p>
            </div>

            <div className="flex items-center gap-2">
              <span className="px-3 py-1.5 rounded-xl bg-emerald-50 text-emerald-700 border border-emerald-200 text-xs font-bold flex items-center gap-1.5">
                <CheckCircle2 className="w-4 h-4 text-emerald-600" />
                <span>Multi-Tenant Ready</span>
              </span>
            </div>
          </div>

          {/* Test Configuration Controls */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4 p-5 bg-slate-50 rounded-2xl border border-slate-200">
            <div className="space-y-1.5">
              <label className="text-xs font-bold text-slate-700">Pilih Naskah Ujian Acuan:</label>
              <select
                value={selectedUjianId}
                onChange={(e) => setSelectedUjianId(e.target.value)}
                className="w-full p-2.5 rounded-xl border border-slate-200 text-xs font-bold text-slate-800 bg-white"
              >
                {ujianList.map((u) => (
                  <option key={u.id} value={u.id}>
                    {u.judul} ({u.soalList.length} Soal)
                  </option>
                ))}
              </select>
            </div>

            <div className="space-y-1.5">
              <label className="text-xs font-bold text-slate-700">Target Peserta Bersamaan:</label>
              <div className="grid grid-cols-5 gap-1.5 pt-0.5">
                {[50, 100, 500, 1000, 2000].map((num) => (
                  <button
                    key={num}
                    type="button"
                    onClick={() => setSimConcurrency(num)}
                    className={`py-2 text-xs font-bold rounded-xl border transition-all cursor-pointer ${
                      simConcurrency === num
                        ? 'bg-blue-700 text-white border-blue-700 shadow-xs'
                        : 'bg-white text-slate-700 border-slate-200 hover:bg-slate-100'
                    }`}
                  >
                    {num}
                  </button>
                ))}
              </div>
            </div>

            <div className="flex items-end">
              <button
                type="button"
                disabled={isRunningSim || ujianList.length === 0}
                onClick={handleRunLoadTest}
                className="w-full py-3 bg-blue-700 hover:bg-blue-600 disabled:opacity-50 text-white rounded-xl text-xs font-bold shadow-md flex items-center justify-center gap-2 transition-all cursor-pointer"
              >
                {isRunningSim ? (
                  <>
                    <RefreshCw className="w-4 h-4 animate-spin" />
                    <span>Menjalankan Simulasi ({simConcurrency} Peserta)...</span>
                  </>
                ) : (
                  <>
                    <Zap className="w-4 h-4 text-amber-300" />
                    <span>Jalankan Uji Beban ({simConcurrency} Siswa)</span>
                  </>
                )}
              </button>
            </div>
          </div>

          {/* Simulation Error Alert */}
          {simError && (
            <div className="p-4 bg-red-50 border border-red-200 rounded-2xl text-xs text-red-700 font-semibold flex items-center gap-2.5">
              <AlertTriangle className="w-4 h-4 text-red-600 flex-shrink-0" />
              <span>{simError}</span>
            </div>
          )}

          {/* Simulation Benchmark Results */}
          {simResult && (
            <div className="space-y-5 animate-in fade-in duration-300">
              <div className="p-4 rounded-2xl border flex flex-col sm:flex-row justify-between sm:items-center gap-3 bg-slate-900 text-white">
                <div className="flex items-center gap-3">
                  <div className={`w-10 h-10 rounded-xl flex items-center justify-center ${
                    simResult.status === 'passed' ? 'bg-emerald-500/20 text-emerald-400' : 'bg-amber-500/20 text-amber-400'
                  }`}>
                    <Activity className="w-5 h-5" />
                  </div>
                  <div>
                    <h4 className="text-sm font-extrabold">Hasil Uji Beban Berhasil Diselesaikan</h4>
                    <p className="text-xs text-slate-300 mt-0.5">{simResult.notes}</p>
                  </div>
                </div>

                <span className={`px-3 py-1 rounded-full text-xs font-extrabold uppercase tracking-wider ${
                  simResult.status === 'passed' ? 'bg-emerald-500 text-white' : 'bg-amber-500 text-slate-900'
                }`}>
                  {simResult.status === 'passed' ? 'STATUS: OPTIMAL & STABIL' : 'STATUS: PERINGATAN BEBAN'}
                </span>
              </div>

              {/* 5 Key Metric Cards */}
              <div className="grid grid-cols-2 sm:grid-cols-5 gap-3">
                <div className="bg-slate-50 p-4 rounded-2xl border border-slate-200">
                  <span className="text-[11px] font-bold text-slate-500 uppercase block">Peserta Serentak</span>
                  <div className="text-xl font-extrabold text-slate-900 mt-1">{simResult.concurrentUsers} Siswa</div>
                  <span className="text-[10px] text-slate-400">Total Concurrent</span>
                </div>

                <div className="bg-slate-50 p-4 rounded-2xl border border-slate-200">
                  <span className="text-[11px] font-bold text-slate-500 uppercase block">Rata-Rata Latensi</span>
                  <div className="text-xl font-extrabold text-blue-700 mt-1">{simResult.avgLatencyMs} ms</div>
                  <span className="text-[10px] text-slate-400">Min: {simResult.minLatencyMs}ms / Max: {simResult.maxLatencyMs}ms</span>
                </div>

                <div className="bg-slate-50 p-4 rounded-2xl border border-slate-200">
                  <span className="text-[11px] font-bold text-slate-500 uppercase block">Tingkat Keberhasilan</span>
                  <div className="text-xl font-extrabold text-emerald-600 mt-1">{simResult.successRate}%</div>
                  <span className="text-[10px] text-slate-400">{simResult.successfulRequests} / {simResult.concurrentUsers} Request Berhasil</span>
                </div>

                <div className="bg-slate-50 p-4 rounded-2xl border border-slate-200">
                  <span className="text-[11px] font-bold text-slate-500 uppercase block">Throughput Autosave</span>
                  <div className="text-xl font-extrabold text-purple-700 mt-1">{simResult.totalAnswersSaved} Jawaban</div>
                  <span className="text-[10px] text-slate-400">Tersimpan Tanpa Hilang</span>
                </div>

                <div className="bg-slate-50 p-4 rounded-2xl border border-slate-200">
                  <span className="text-[11px] font-bold text-slate-500 uppercase block">Total Pengumpulan</span>
                  <div className="text-xl font-extrabold text-indigo-700 mt-1">{simResult.totalSubmissions} Sesi</div>
                  <span className="text-[10px] text-slate-400">Dinilai Otomatis</span>
                </div>
              </div>

              {/* Architectural Technical Audit Breakdown */}
              <div className="p-5 bg-blue-50/60 rounded-2xl border border-blue-200 space-y-3">
                <h5 className="text-xs font-bold text-blue-900 uppercase tracking-wider flex items-center gap-1.5">
                  <Cpu className="w-4 h-4 text-blue-700" />
                  Rekomendasi Arsitektur Skala Besar (Multi-Sekolah & Ribuan Siswa)
                </h5>
                <ul className="text-xs text-blue-950/80 space-y-1.5 list-disc pl-4 leading-relaxed">
                  <li>
                    <strong>In-Memory Sanitized Lookups:</strong> Lembar soal diambil sekali saat siswa memulai ujian tanpa kunci jawaban, meringankan query database hingga 90%.
                  </li>
                  <li>
                    <strong>Dual-Write Autosave:</strong> Setiap jawaban siswa disimpan instan ke <code className="bg-white/80 px-1 py-0.5 rounded font-mono text-[11px]">localStorage</code> perangkat siswa terlebih dahulu kemudian disinkronisasi ke Firestore, mencegah kehilangan data saat jaringan terputus.
                  </li>
                  <li>
                    <strong>School Tenant Isolation:</strong> Data naskah dan sesi terisolasi per <code className="bg-white/80 px-1 py-0.5 rounded font-mono text-[11px]">schoolId</code>, memastikan privasi dan skalabilitas penuh saat digunakan oleh banyak sekolah secara serentak.
                  </li>
                  <li>
                    <strong>Vercel & Firestore Ready:</strong> Endpoint stateless mendukung serverless autoscaling otomatis tanpa batasan connection pooling tradisional.
                  </li>
                </ul>
              </div>
            </div>
          )}
        </div>
      )}

      {/* MODAL: TERAPKAN KUNCI JAWABAN TERPISAH */}
      {showSeparateKeyModal && (
        <div className="fixed inset-0 z-50 bg-slate-950/70 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="max-w-lg w-full bg-white rounded-3xl p-6 sm:p-8 space-y-5 shadow-2xl">
            <div className="flex justify-between items-center pb-2 border-b border-slate-100">
              <div className="flex items-center gap-2">
                <KeyRound className="w-5 h-5 text-amber-600" />
                <h3 className="text-sm font-extrabold text-slate-900">
                  Terapkan Kunci Jawaban Terpisah
                </h3>
              </div>
              <button
                type="button"
                onClick={() => {
                  setShowSeparateKeyModal(false);
                  setSeparateKeyFeedback(null);
                }}
                className="p-1 rounded-lg text-slate-400 hover:bg-slate-100 cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <p className="text-xs text-slate-500 leading-relaxed">
              Jika dokumen asli Anda memiliki kunci jawaban terpisah, tempelkan teks kunci di bawah ini. Sistem akan mencocokkan nomor soal dengan huruf kunci secara tepat tanpa tebakan AI.
            </p>

            <div className="space-y-1.5">
              <label className="text-xs font-bold text-slate-700">Teks Kunci Jawaban:</label>
              <textarea
                rows={6}
                value={separateKeyText}
                onChange={(e) => setSeparateKeyText(e.target.value)}
                placeholder="Contoh format yang didukung:
1. A
2. B
3. C
4. D
Atau: 1.A, 2.B, 3.C, 4.D
Atau tabel kunci jawaban..."
                className="w-full p-3 rounded-xl border border-slate-200 focus:border-amber-500 focus:ring-2 focus:ring-amber-100 outline-none text-xs font-mono"
              />
            </div>

            {separateKeyFeedback && (
              <div
                className={`p-3 rounded-xl text-xs font-semibold flex items-center gap-2 ${
                  separateKeyFeedback.success
                    ? 'bg-emerald-50 text-emerald-800 border border-emerald-200'
                    : 'bg-amber-50 text-amber-800 border border-amber-200'
                }`}
              >
                {separateKeyFeedback.success ? (
                  <CheckCircle2 className="w-4 h-4 text-emerald-600 flex-shrink-0" />
                ) : (
                  <AlertTriangle className="w-4 h-4 text-amber-600 flex-shrink-0" />
                )}
                <span>{separateKeyFeedback.message}</span>
              </div>
            )}

            <div className="flex justify-end gap-2 pt-2">
              <button
                type="button"
                onClick={() => {
                  setShowSeparateKeyModal(false);
                  setSeparateKeyFeedback(null);
                }}
                className="px-4 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-xl text-xs font-bold transition-colors cursor-pointer"
              >
                Batal
              </button>
              <button
                type="button"
                onClick={handleApplySeparateKey}
                className="px-5 py-2 bg-amber-500 hover:bg-amber-600 text-white rounded-xl text-xs font-bold shadow-sm transition-all cursor-pointer flex items-center gap-1.5"
              >
                <Check className="w-4 h-4" />
                <span>Terapkan Kunci Sekarang</span>
              </button>
            </div>
          </div>
        </div>
      )}

      {/* MODAL: PAIRING CODE GENERATOR FROM TEACHER DESK SCAN */}
      {verifiedSessionModal && (
        <div className="fixed inset-0 z-50 bg-slate-950/60 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="max-w-md w-full bg-white rounded-3xl p-6 sm:p-8 space-y-5 text-center shadow-2xl">
            <div className="w-16 h-16 rounded-2xl bg-emerald-50 text-emerald-600 mx-auto flex items-center justify-center">
              <CheckCircle2 className="w-8 h-8" />
            </div>

            <div>
              <span className="text-[11px] font-bold text-emerald-700 bg-emerald-50 px-2.5 py-0.5 rounded-full">
                Siswa Terverifikasi
              </span>
              <h3 className="text-xl font-extrabold text-slate-900 mt-2">
                {verifiedSessionModal.siswa.namaLengkap}
              </h3>
              <p className="text-xs text-slate-500 mt-0.5">
                Kelas: {verifiedSessionModal.siswa.kelas} &bull; NISN:{' '}
                {verifiedSessionModal.siswa.nisn || '-'}
              </p>
            </div>

            {/* 6-digit Code Box */}
            <div className="p-5 bg-blue-50 rounded-2xl border border-blue-200 space-y-1">
              <span className="text-xs font-bold text-blue-900 uppercase tracking-wider">
                Kode Akses Pairing Siswa:
              </span>
              <div className="text-3xl font-extrabold tracking-[0.3em] text-blue-950 font-mono">
                {verifiedSessionModal.session.passCode}
              </div>
              <p className="text-[11px] text-blue-700 mt-1">
                Berikan kode 6 digit ini kepada siswa jika siswa membuka ujian di HP-nya.
              </p>
            </div>

            {verifiedSessionModal.qrDataUrl && (
              <div className="space-y-1">
                <img
                  src={verifiedSessionModal.qrDataUrl}
                  alt="QR Sesi Ujian"
                  className="w-36 h-36 mx-auto rounded-xl border border-slate-200 p-1"
                />
                <span className="text-[10px] text-slate-400">
                  Atau siswa dapat langsung scan QR sesi ini untuk membuka lembar soal
                </span>
              </div>
            )}

            <button
              onClick={() => {
                setVerifiedSessionModal(null);
                startCamera();
              }}
              className="w-full py-3 bg-blue-700 hover:bg-blue-600 text-white rounded-xl text-xs font-bold transition-all shadow-md cursor-pointer"
            >
              Selesai & Scan Siswa Berikutnya
            </button>
          </div>
        </div>
      )}

      {/* MODAL: LARGE QR FOR PROJECTOR / CLASS SCREEN */}
      {qrExamModal && (
        <div className="fixed inset-0 z-50 bg-slate-950/70 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="max-w-md w-full bg-white rounded-3xl p-6 sm:p-8 space-y-5 text-center shadow-2xl">
            <div className="flex justify-between items-center pb-2 border-b border-slate-100">
              <h3 className="text-sm font-extrabold text-slate-900">QR Code Link Ujian Siswa</h3>
              <button
                onClick={() => setQrExamModal(null)}
                className="p-1 rounded-lg text-slate-400 hover:bg-slate-100"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div>
              <h4 className="text-base font-extrabold text-slate-900">{qrExamModal.exam.judul}</h4>
              <p className="text-xs text-blue-700 font-semibold mt-0.5">
                {qrExamModal.exam.mataPelajaran} &bull; {qrExamModal.exam.kelasTarget.join(', ')}
              </p>
            </div>

            <div className="p-4 bg-slate-50 rounded-2xl border border-slate-200 inline-block">
              <img
                src={qrExamModal.qrDataUrl}
                alt="QR Ujian"
                className="w-64 h-64 mx-auto rounded-xl shadow-xs"
              />
            </div>

            <p className="text-xs text-slate-500 leading-relaxed">
              Tampilkan di layar depan kelas. Siswa dapat mengarahkan kamera HP ke QR Code di atas untuk membuka tautan ujian.
            </p>

            <button
              onClick={() => setQrExamModal(null)}
              className="w-full py-2.5 bg-slate-100 hover:bg-slate-200 text-slate-800 rounded-xl text-xs font-bold transition-colors cursor-pointer"
            >
              Tutup
            </button>
          </div>
        </div>
      )}

      {/* MODAL: EXAM IMAGE MANAGER (Fitur Tambah/Ubah/Crop/Galeri/Hapus Gambar Soal & Pilihan) */}
      {activeImageModal && (
        <ExamImageManagerModal
          isOpen={activeImageModal.isOpen}
          schoolId={db.getActiveSchoolId()}
          examId={editingUjian?.id || 'new-exam'}
          soalId={parsedSoalList[activeImageModal.soalIndex]?.id || `soal-${activeImageModal.soalIndex + 1}`}
          targetType={activeImageModal.targetType}
          targetChoiceLetter={activeImageModal.targetChoiceLetter}
          currentImage={activeImageModal.currentImage}
          currentImageId={activeImageModal.currentImageId}
          currentStoragePath={activeImageModal.currentStoragePath}
          currentCaption={activeImageModal.currentCaption}
          currentPosisi={activeImageModal.currentPosisi}
          currentUkuran={activeImageModal.currentUkuran}
          availableImages={availableImagesForPicker}
          createdBy={currentUser.id}
          onSave={handleSaveImageFromModal}
          onRemove={handleRemoveImageFromModal}
          onClose={() => setActiveImageModal(null)}
        />
      )}

      {/* MODAL: ADMIN FULLSCREEN IMAGE LIGHTBOX */}
      <ImageLightboxModal
        isOpen={adminLightbox.isOpen}
        imageUrl={adminLightbox.imageUrl}
        title={adminLightbox.title}
        caption={adminLightbox.caption}
        onClose={() => setAdminLightbox({ isOpen: false, imageUrl: '' })}
      />

      {/* MODAL: BAGIKAN LINK UJIAN KE WHATSAPP / MEDIA LAIN */}
      {shareExamModal && (() => {
        const { link, message, waUrl } = buildWhatsAppSharePayload(shareExamModal);
        return (
          <div className="fixed inset-0 z-50 bg-slate-950/70 backdrop-blur-xs flex items-center justify-center p-4">
            <div className="max-w-lg w-full bg-white rounded-3xl p-6 sm:p-8 space-y-5 shadow-2xl">
              <div className="flex justify-between items-center pb-2 border-b border-slate-100">
                <div className="flex items-center gap-2">
                  <Share2 className="w-5 h-5 text-emerald-600" />
                  <h3 className="text-sm font-extrabold text-slate-900">
                    Bagikan Link Ujian Siswa
                  </h3>
                </div>
                <button
                  type="button"
                  onClick={() => setShareExamModal(null)}
                  className="p-1 rounded-lg text-slate-400 hover:bg-slate-100 cursor-pointer"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>

              <div className="space-y-3">
                <div>
                  <label className="text-[11px] font-bold text-slate-600 uppercase block mb-1">
                    Tautan Langsung Ujian:
                  </label>
                  <div className="flex gap-2">
                    <input
                      type="text"
                      readOnly
                      value={link}
                      className="flex-1 px-3 py-2 bg-slate-100 border border-slate-200 rounded-xl text-xs font-mono text-slate-700 select-all"
                    />
                    <button
                      type="button"
                      onClick={() => handleCopyExamLink(shareExamModal)}
                      className="px-3.5 py-2 bg-blue-700 hover:bg-blue-600 text-white rounded-xl text-xs font-bold flex items-center gap-1.5 cursor-pointer"
                    >
                      <Copy className="w-3.5 h-3.5" />
                      <span>Salin Link</span>
                    </button>
                  </div>
                </div>

                <div>
                  <label className="text-[11px] font-bold text-slate-600 uppercase block mb-1">
                    Pratinjau Pesan WhatsApp:
                  </label>
                  <textarea
                    readOnly
                    rows={8}
                    value={message}
                    className="w-full p-3 bg-slate-50 border border-slate-200 rounded-xl text-xs text-slate-700 leading-relaxed"
                  />
                </div>
              </div>

              <div className="flex flex-wrap justify-end gap-2 pt-2 border-t border-slate-100">
                <button
                  type="button"
                  onClick={async () => {
                    try {
                      await navigator.clipboard.writeText(message);
                      toast.success('Pesan pengumuman WhatsApp berhasil disalin!');
                    } catch {
                      toast.warning('Silakan salin teks pesan secara manual.');
                    }
                  }}
                  className="px-4 py-2.5 bg-slate-100 hover:bg-slate-200 text-slate-800 rounded-xl text-xs font-bold flex items-center gap-1.5 cursor-pointer"
                >
                  <Copy className="w-3.5 h-3.5" />
                  <span>Salin Teks Pesan</span>
                </button>
                <a
                  href={waUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="px-5 py-2.5 bg-emerald-600 hover:bg-emerald-500 text-white rounded-xl text-xs font-bold shadow-md flex items-center gap-1.5 transition-colors"
                >
                  <ExternalLink className="w-3.5 h-3.5" />
                  <span>Buka WhatsApp</span>
                </a>
              </div>
            </div>
          </div>
        );
      })()}

      {/* MODAL: KOREKSI MANUAL JAWABAN URAIAN SISWA */}
      {gradingModalSession && activeExam && (
        <div className="fixed inset-0 z-50 bg-slate-950/70 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="max-w-2xl w-full bg-white rounded-3xl overflow-hidden shadow-2xl border border-slate-200 flex flex-col max-h-[90vh]">
            <div className="p-5 sm:p-6 bg-slate-900 text-white flex items-center justify-between">
              <div>
                <span className="text-[10px] font-bold uppercase tracking-wider text-amber-300">
                  Koreksi Jawaban Uraian
                </span>
                <h3 className="text-base font-extrabold mt-0.5">
                  {gradingModalSession.namaSiswa} ({gradingModalSession.kelas})
                </h3>
                <p className="text-xs text-slate-300">
                  Nilai PG: <strong>{gradingModalSession.nilaiPg}</strong> &bull; Nilai Akhir Saat Ini: <strong>{gradingModalSession.nilaiAkhir}</strong>
                </p>
              </div>
              <button
                type="button"
                onClick={() => setGradingModalSession(null)}
                className="p-1.5 rounded-xl text-slate-300 hover:text-white hover:bg-white/10 cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="p-5 sm:p-6 overflow-y-auto space-y-5 flex-1 bg-slate-50">
              {activeExam.soalList
                .filter((q) => q.tipe === 'uraian')
                .map((q) => {
                  const ans = gradingModalSession.jawaban?.[q.id];
                  const maxBobot = Number(q.bobot) || 1;
                  const currentScore = essayScores[q.id] ?? 0;

                  return (
                    <div
                      key={q.id}
                      className="bg-white rounded-2xl p-5 border border-slate-200 space-y-3 shadow-xs"
                    >
                      <div className="flex items-start justify-between gap-2">
                        <span className="px-2.5 py-0.5 rounded-lg bg-blue-50 text-blue-800 text-xs font-extrabold">
                          Soal Nomor {q.nomor}
                        </span>
                        <span className="text-[11px] font-bold text-slate-500">
                          Bobot Maksimal: {maxBobot}
                        </span>
                      </div>

                      <p className="text-xs sm:text-sm font-semibold text-slate-900 whitespace-pre-line">
                        {q.pertanyaan}
                      </p>

                      {q.pedomanPenilaian && (
                        <div className="p-2.5 rounded-xl bg-amber-50 border border-amber-200 text-[11px] text-amber-900">
                          <strong>Pedoman / Kunci Uraian:</strong> {q.pedomanPenilaian}
                        </div>
                      )}

                      <div className="p-3 rounded-xl bg-slate-50 border border-slate-200 space-y-1">
                        <span className="text-[10px] font-bold uppercase text-slate-500 block">
                          Jawaban Siswa:
                        </span>
                        <p className="text-xs text-slate-800 whitespace-pre-line leading-relaxed">
                          {ans?.jawabanDipilih?.trim() ? ans.jawabanDipilih : '(Siswa tidak mengisi jawaban)'}
                        </p>
                      </div>

                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-1">
                        <div>
                          <label className="text-[11px] font-bold text-slate-700 block mb-1">
                            Skor Diberikan (0 – {maxBobot}):
                          </label>
                          <div className="flex items-center gap-2">
                            <input
                              type="number"
                              min={0}
                              max={maxBobot}
                              step="0.5"
                              value={currentScore}
                              onChange={(e) =>
                                setEssayScores((prev) => ({
                                  ...prev,
                                  [q.id]: Math.max(0, Math.min(maxBobot, Number(e.target.value) || 0)),
                                }))
                              }
                              className="w-24 px-3 py-2 rounded-xl border border-slate-300 text-xs font-extrabold text-blue-800"
                            />
                            <div className="flex gap-1">
                              {[0, 0.5, 1].map((ratio) => (
                                <button
                                  key={ratio}
                                  type="button"
                                  onClick={() =>
                                    setEssayScores((prev) => ({
                                      ...prev,
                                      [q.id]: Math.round(maxBobot * ratio * 10) / 10,
                                    }))
                                  }
                                  className="px-2 py-1.5 rounded-lg bg-slate-100 hover:bg-blue-100 text-slate-700 hover:text-blue-800 text-[10px] font-bold cursor-pointer"
                                >
                                  {Math.round(ratio * 100)}%
                                </button>
                              ))}
                            </div>
                          </div>
                        </div>

                        <div>
                          <label className="text-[11px] font-bold text-slate-700 block mb-1">
                            Catatan Guru (Opsional):
                          </label>
                          <input
                            type="text"
                            placeholder="Masukan singkat untuk siswa..."
                            value={essayNotes[q.id] || ''}
                            onChange={(e) =>
                              setEssayNotes((prev) => ({
                                ...prev,
                                [q.id]: e.target.value,
                              }))
                            }
                            className="w-full px-3 py-2 rounded-xl border border-slate-300 text-xs"
                          />
                        </div>
                      </div>
                    </div>
                  );
                })}
            </div>

            <div className="p-4 sm:p-5 bg-white border-t border-slate-200 flex items-center justify-end gap-2.5">
              <button
                type="button"
                onClick={() => setGradingModalSession(null)}
                className="px-4 py-2.5 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-xl text-xs font-bold cursor-pointer"
              >
                Batal
              </button>
              <button
                type="button"
                disabled={isSavingGrades}
                onClick={handleSaveEssayGrades}
                className="px-5 py-2.5 bg-blue-700 hover:bg-blue-600 disabled:opacity-50 text-white rounded-xl text-xs font-bold shadow-md flex items-center gap-1.5 cursor-pointer"
              >
                <Save className="w-4 h-4" />
                <span>{isSavingGrades ? 'Menyimpan...' : 'Simpan Nilai Uraian'}</span>
              </button>
            </div>
          </div>
        </div>
      )}

      {/* MODAL: PRATINJAU TAMPILAN SISWA (DESKTOP & ANDROID MOBILE 375px) */}
      {showStudentPreviewModal && parsedSoalList.length > 0 && (() => {
        const safeIdx = Math.max(0, Math.min(parsedSoalList.length - 1, studentPreviewIndex));
        const previewSoal = parsedSoalList[safeIdx];
        const previewChoices =
          previewSoal.tipe === 'pilihan_ganda' ? buildDisplayedChoicesForQuestion(previewSoal) : [];

        return (
          <div className="fixed inset-0 z-50 bg-slate-950/75 backdrop-blur-xs flex items-center justify-center p-2 sm:p-4">
            <div className="max-w-4xl w-full bg-white rounded-3xl overflow-hidden shadow-2xl border border-slate-200 flex flex-col max-h-[92vh]">
              <div className="p-4 sm:p-5 bg-slate-900 text-white flex flex-wrap items-center justify-between gap-3">
                <div>
                  <span className="text-[10px] font-extrabold uppercase tracking-wider text-blue-300">
                    Simulasi Tampilan Lembar Ujian Siswa
                  </span>
                  <h3 className="text-sm sm:text-base font-extrabold">
                    {formJudul || 'Pratinjau Naskah Ujian'} ({safeIdx + 1} / {parsedSoalList.length})
                  </h3>
                </div>

                <div className="flex items-center gap-2">
                  <div className="bg-white/10 p-1 rounded-xl flex items-center gap-1">
                    <button
                      type="button"
                      onClick={() => setStudentPreviewViewport('desktop')}
                      className={`px-2.5 py-1 rounded-lg text-xs font-bold flex items-center gap-1 cursor-pointer ${
                        studentPreviewViewport === 'desktop' ? 'bg-blue-600 text-white' : 'text-slate-300 hover:text-white'
                      }`}
                    >
                      <Monitor className="w-3.5 h-3.5" />
                      <span>Desktop</span>
                    </button>
                    <button
                      type="button"
                      onClick={() => setStudentPreviewViewport('mobile')}
                      className={`px-2.5 py-1 rounded-lg text-xs font-bold flex items-center gap-1 cursor-pointer ${
                        studentPreviewViewport === 'mobile' ? 'bg-blue-600 text-white' : 'text-slate-300 hover:text-white'
                      }`}
                    >
                      <Smartphone className="w-3.5 h-3.5" />
                      <span>HP Android (375px)</span>
                    </button>
                  </div>
                  <button
                    type="button"
                    onClick={() => setShowStudentPreviewModal(false)}
                    className="p-1.5 rounded-xl text-slate-300 hover:text-white hover:bg-white/10 cursor-pointer"
                  >
                    <X className="w-5 h-5" />
                  </button>
                </div>
              </div>

              <div className="flex-1 overflow-y-auto bg-slate-100 p-4 flex justify-center">
                <div
                  className={`bg-white rounded-3xl border border-slate-200 shadow-sm p-5 sm:p-6 space-y-5 transition-all ${
                    studentPreviewViewport === 'mobile' ? 'w-[375px] max-w-full' : 'w-full max-w-2xl'
                  }`}
                >
                  <div className="flex items-center justify-between border-b border-slate-100 pb-3">
                    <span className="px-3 py-1 rounded-xl bg-blue-50 text-blue-800 text-xs font-extrabold">
                      Soal Nomor {safeIdx + 1}
                    </span>
                    <span className="text-[11px] font-bold text-slate-500 uppercase">
                      {previewSoal.tipe === 'pilihan_ganda'
                        ? 'Pilihan Ganda'
                        : previewSoal.tipe === 'benar_salah'
                        ? 'Benar / Salah'
                        : previewSoal.tipe === 'isian_singkat'
                        ? 'Isian Singkat'
                        : 'Uraian / Esai'}
                    </span>
                  </div>

                  <ExamRichContent
                    soal={previewSoal}
                    displayNumber={safeIdx + 1}
                    imageLoadErrors={previewImageErrors}
                    imageRetryNonce={previewImageRetryNonce}
                    onImageError={(key) =>
                      setPreviewImageErrors((prev) => ({ ...prev, [key]: true }))
                    }
                    onRetryImage={(key) => {
                      setPreviewImageErrors((prev) => {
                        const next = { ...prev };
                        delete next[key];
                        return next;
                      });
                      setPreviewImageRetryNonce((n) => n + 1);
                    }}
                    onOpenLightbox={(payload) =>
                      setAdminLightbox({
                        isOpen: true,
                        imageUrl: payload.imageUrl,
                        title: payload.title,
                        caption: payload.caption,
                      })
                    }
                  />

                  {previewSoal.tipe === 'pilihan_ganda' ? (
                    <div className="space-y-2.5 pt-2">
                      {previewChoices.map((choice) => (
                        <div
                          key={choice.originalKey}
                          className="p-3 rounded-2xl border-2 border-slate-200 bg-white flex items-start gap-3"
                        >
                          <span className="w-7 h-7 rounded-lg bg-slate-100 text-slate-700 text-xs font-extrabold flex items-center justify-center flex-shrink-0">
                            {choice.displayLetter}
                          </span>
                          <div className="flex-1 space-y-1.5 min-w-0">
                            {choice.text && (
                              <span className="text-xs sm:text-sm font-medium text-slate-800 block break-words">
                                {renderMathAndTextInline(choice.text)}
                              </span>
                            )}
                            {choice.imageUrl && (
                              <img
                                src={choice.imageUrl}
                                alt={`Pilihan ${choice.displayLetter}`}
                                className="max-h-36 max-w-full rounded-xl border border-slate-200 bg-slate-50 p-1 object-contain"
                              />
                            )}
                          </div>
                        </div>
                      ))}
                    </div>
                  ) : previewSoal.tipe === 'benar_salah' ? (
                    <div className="grid grid-cols-2 gap-3 pt-2">
                      <div className="p-3.5 rounded-2xl border-2 border-slate-200 bg-white flex items-center gap-2.5">
                        <span className="w-7 h-7 rounded-lg bg-slate-100 text-slate-700 text-xs font-extrabold flex items-center justify-center">B</span>
                        <span className="text-xs font-extrabold text-slate-800">BENAR</span>
                      </div>
                      <div className="p-3.5 rounded-2xl border-2 border-slate-200 bg-white flex items-center gap-2.5">
                        <span className="w-7 h-7 rounded-lg bg-slate-100 text-slate-700 text-xs font-extrabold flex items-center justify-center">S</span>
                        <span className="text-xs font-extrabold text-slate-800">SALAH</span>
                      </div>
                    </div>
                  ) : previewSoal.tipe === 'isian_singkat' ? (
                    <div className="p-3.5 rounded-2xl border border-slate-300 bg-slate-50 text-xs text-slate-500">
                      Kotak input isian singkat siswa akan tampil di sini...
                    </div>
                  ) : (
                    <div className="p-4 rounded-2xl border border-dashed border-slate-300 bg-slate-50 text-xs text-slate-400">
                      Area kotak jawaban esai siswa akan muncul di sini...
                    </div>
                  )}
                </div>
              </div>

              <div className="p-4 bg-white border-t border-slate-200 flex items-center justify-between gap-2">
                <button
                  type="button"
                  disabled={safeIdx === 0}
                  onClick={() => setStudentPreviewIndex((i) => Math.max(0, i - 1))}
                  className="px-4 py-2 bg-slate-100 hover:bg-slate-200 disabled:opacity-40 text-slate-700 rounded-xl text-xs font-bold cursor-pointer"
                >
                  &larr; Soal Sebelumnya
                </button>
                <span className="text-xs font-bold text-slate-500">
                  Butir {safeIdx + 1} dari {parsedSoalList.length}
                </span>
                <button
                  type="button"
                  disabled={safeIdx >= parsedSoalList.length - 1}
                  onClick={() => setStudentPreviewIndex((i) => Math.min(parsedSoalList.length - 1, i + 1))}
                  className="px-4 py-2 bg-blue-700 hover:bg-blue-600 disabled:opacity-40 text-white rounded-xl text-xs font-bold cursor-pointer"
                >
                  Soal Berikutnya &rarr;
                </button>
              </div>
            </div>
          </div>
        );
      })()}

      {/* MODAL KONFIRMASI PENERBITAN SAAT ADA KUNCI/GAMBAR BELUM LENGKAP */}
      {publishConfirmModal && (
        <div className="fixed inset-0 z-50 bg-slate-950/70 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="max-w-md w-full bg-white rounded-3xl p-6 sm:p-7 space-y-4 shadow-2xl border border-amber-200">
            <div className="flex items-start gap-3">
              <div className="w-11 h-11 rounded-2xl bg-amber-100 text-amber-700 flex items-center justify-center flex-shrink-0">
                <AlertTriangle className="w-6 h-6" />
              </div>
              <div>
                <h3 className="text-base font-extrabold text-slate-900">
                  Periksa Sebelum Menerbitkan Ujian
                </h3>
                <p className="text-xs text-slate-600 mt-1">
                  Ditemukan catatan kelengkapan berikut pada naskah soal:
                </p>
              </div>
            </div>

            <ul className="list-disc pl-5 text-xs text-amber-900 bg-amber-50 p-3.5 rounded-2xl border border-amber-200 space-y-1.5">
              {publishConfirmModal.warnings.map((w, idx) => (
                <li key={idx}>{w}</li>
              ))}
            </ul>

            <div className="flex flex-wrap justify-end gap-2 pt-2">
              <button
                type="button"
                onClick={() => setPublishConfirmModal(null)}
                className="px-4 py-2 bg-slate-100 hover:bg-slate-200 text-slate-800 rounded-xl text-xs font-bold cursor-pointer"
              >
                Periksa &amp; Lengkapi Dulu
              </button>
              <button
                type="button"
                onClick={() => handleSaveExam(publishConfirmModal.targetStatus, true)}
                className="px-4 py-2 bg-blue-700 hover:bg-blue-600 text-white rounded-xl text-xs font-bold cursor-pointer"
              >
                {publishConfirmModal.targetStatus === 'terjadwal' ? 'Tetap Jadwalkan Ujian' : 'Tetap Terbitkan Ujian'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* MODAL: PILIH SOAL DARI BANK SOAL KE NASKAH SAAT INI */}
      {showBankPickerModal && (
        <div className="fixed inset-0 z-50 bg-slate-950/70 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="max-w-2xl w-full bg-white rounded-3xl overflow-hidden shadow-2xl border border-slate-200 flex flex-col max-h-[88vh]">
            <div className="p-5 bg-slate-900 text-white flex items-center justify-between">
              <div>
                <h3 className="text-sm sm:text-base font-extrabold">Pilih Soal dari Bank Soal Sekolah</h3>
                <p className="text-xs text-slate-300">Centang soal yang ingin ditambahkan ke naskah ujian Anda.</p>
              </div>
              <button
                type="button"
                onClick={() => setShowBankPickerModal(false)}
                className="p-1.5 rounded-xl text-slate-300 hover:text-white cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="p-4 border-b border-slate-100 flex gap-2 bg-slate-50">
              <input
                type="text"
                value={bankSearch}
                onChange={(e) => setBankSearch(e.target.value)}
                placeholder="Cari pertanyaan, mapel, atau materi..."
                className="flex-1 p-2 rounded-xl border border-slate-200 bg-white text-xs"
              />
            </div>

            <div className="flex-1 overflow-y-auto p-4 space-y-2.5">
              {bankSoalList
                .filter((b) =>
                  !bankSearch.trim() ||
                  b.pertanyaan.toLowerCase().includes(bankSearch.toLowerCase()) ||
                  b.mataPelajaran.toLowerCase().includes(bankSearch.toLowerCase()) ||
                  (b.materi || '').toLowerCase().includes(bankSearch.toLowerCase())
                )
                .map((item) => {
                  const checked = bankPickerSelectedIds.includes(item.id);
                  return (
                    <label
                      key={item.id}
                      className={`p-3.5 rounded-2xl border flex items-start gap-3 cursor-pointer ${
                        checked ? 'border-emerald-500 bg-emerald-50/50' : 'border-slate-200 bg-white'
                      }`}
                    >
                      <input
                        type="checkbox"
                        checked={checked}
                        onChange={() =>
                          setBankPickerSelectedIds((prev) =>
                            prev.includes(item.id)
                              ? prev.filter((id) => id !== item.id)
                              : [...prev, item.id]
                          )
                        }
                        className="mt-0.5 rounded border-slate-300 text-emerald-600"
                      />
                      <div className="flex-1 text-xs space-y-1">
                        <div className="flex flex-wrap gap-1.5">
                          <span className="font-extrabold text-blue-700 uppercase text-[10px]">
                            {item.tipe.replace('_', ' ')}
                          </span>
                          <span className="text-slate-500">&bull; {item.mataPelajaran} ({item.kelas})</span>
                          <span className="text-slate-500">&bull; {item.tingkatKesulitan}</span>
                        </div>
                        <p className="font-semibold text-slate-900 line-clamp-2">{item.pertanyaan}</p>
                      </div>
                    </label>
                  );
                })}
              {bankSoalList.length === 0 && (
                <div className="text-center py-10 text-xs text-slate-400">
                  Belum ada soal di Bank Soal sekolah.
                </div>
              )}
            </div>

            <div className="p-4 bg-white border-t border-slate-200 flex items-center justify-between">
              <span className="text-xs font-bold text-slate-600">{bankPickerSelectedIds.length} soal terpilih</span>
              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={() => setShowBankPickerModal(false)}
                  className="px-4 py-2 rounded-xl bg-slate-100 text-slate-700 text-xs font-bold cursor-pointer"
                >
                  Batal
                </button>
                <button
                  type="button"
                  disabled={bankPickerSelectedIds.length === 0}
                  onClick={() => handleImportFromBankSelection(bankPickerSelectedIds, false)}
                  className="px-4 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-700 disabled:opacity-40 text-white text-xs font-bold cursor-pointer"
                >
                  Tambahkan ke Ujian
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* MODAL: SIMPAN SOAL DARI EDITOR KE BANK SOAL */}
      {bankSaveModal && (
        <div className="fixed inset-0 z-50 bg-slate-950/70 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="max-w-md w-full bg-white rounded-3xl p-6 space-y-4 shadow-2xl border border-slate-200">
            <div className="flex items-center justify-between border-b border-slate-100 pb-3">
              <h3 className="text-sm font-extrabold text-slate-900">
                {bankSaveModal.mode === 'bulk'
                  ? `Simpan ${parsedSoalList.length} Soal ke Bank Soal`
                  : 'Simpan Butir Soal ke Bank Soal'}
              </h3>
              <button
                type="button"
                onClick={() => setBankSaveModal(null)}
                className="p-1 text-slate-400 hover:text-slate-600 cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="space-y-3 text-xs">
              <div>
                <label className="font-bold text-slate-700 block mb-1">Mata Pelajaran</label>
                <input
                  type="text"
                  value={bankMetaForm.mataPelajaran}
                  onChange={(e) => setBankMetaForm((p) => ({ ...p, mataPelajaran: e.target.value }))}
                  className="w-full p-2.5 rounded-xl border border-slate-200"
                />
              </div>
              <div>
                <label className="font-bold text-slate-700 block mb-1">Kelas</label>
                <input
                  type="text"
                  value={bankMetaForm.kelas}
                  onChange={(e) => setBankMetaForm((p) => ({ ...p, kelas: e.target.value }))}
                  className="w-full p-2.5 rounded-xl border border-slate-200"
                />
              </div>
              <div>
                <label className="font-bold text-slate-700 block mb-1">Topik / Materi (Opsional)</label>
                <input
                  type="text"
                  value={bankMetaForm.materi}
                  onChange={(e) => setBankMetaForm((p) => ({ ...p, materi: e.target.value }))}
                  placeholder="Contoh: Ekosistem, Pecahan, Teks Eksplanasi"
                  className="w-full p-2.5 rounded-xl border border-slate-200"
                />
              </div>
              <div>
                <label className="font-bold text-slate-700 block mb-1">Tingkat Kesulitan</label>
                <select
                  value={bankMetaForm.tingkatKesulitan}
                  onChange={(e) =>
                    setBankMetaForm((p) => ({ ...p, tingkatKesulitan: e.target.value as TingkatKesulitanSoal }))
                  }
                  className="w-full p-2.5 rounded-xl border border-slate-200 bg-white"
                >
                  <option value="mudah">Mudah</option>
                  <option value="sedang">Sedang</option>
                  <option value="sulit">Sulit</option>
                </select>
              </div>
            </div>

            <div className="flex justify-end gap-2 pt-2">
              <button
                type="button"
                onClick={() => setBankSaveModal(null)}
                className="px-4 py-2 rounded-xl bg-slate-100 text-slate-700 text-xs font-bold cursor-pointer"
              >
                Batal
              </button>
              <button
                type="button"
                onClick={async () => {
                  const listToSave =
                    bankSaveModal.mode === 'bulk'
                      ? parsedSoalList
                      : bankSaveModal.soal
                      ? [bankSaveModal.soal]
                      : [];
                  if (listToSave.length > 0) {
                    await db.saveBulkToBankSoal(listToSave, {
                      ...bankMetaForm,
                      dibuatOleh: currentUser.name,
                    });
                    setBankSoalList(db.getBankSoalList());
                    toast.success(`${listToSave.length} soal berhasil disimpan ke Bank Soal!`);
                  }
                  setBankSaveModal(null);
                }}
                className="px-4 py-2 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-bold cursor-pointer"
              >
                Simpan ke Bank Soal
              </button>
            </div>
          </div>
        </div>
      )}

      {/* MODAL: TAMBAH / EDIT BANK SOAL MANUAL */}
      {bankManualModalOpen && (
        <div className="fixed inset-0 z-50 bg-slate-950/70 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="max-w-lg w-full bg-white rounded-3xl overflow-hidden shadow-2xl border border-slate-200 flex flex-col max-h-[90vh]">
            <div className="p-5 bg-slate-900 text-white flex items-center justify-between">
              <h3 className="text-sm font-extrabold">
                {bankEditingItem ? 'Edit Butir Bank Soal' : 'Tambah Butir ke Bank Soal'}
              </h3>
              <button
                type="button"
                onClick={() => setBankManualModalOpen(false)}
                className="p-1 text-slate-300 hover:text-white cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="p-5 overflow-y-auto space-y-3 text-xs flex-1">
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="font-bold text-slate-700 block mb-1">Mata Pelajaran</label>
                  <input
                    type="text"
                    value={bankItemForm.mataPelajaran}
                    onChange={(e) => setBankItemForm((p) => ({ ...p, mataPelajaran: e.target.value }))}
                    className="w-full p-2.5 rounded-xl border border-slate-200"
                  />
                </div>
                <div>
                  <label className="font-bold text-slate-700 block mb-1">Kelas</label>
                  <input
                    type="text"
                    value={bankItemForm.kelas}
                    onChange={(e) => setBankItemForm((p) => ({ ...p, kelas: e.target.value }))}
                    className="w-full p-2.5 rounded-xl border border-slate-200"
                  />
                </div>
                <div>
                  <label className="font-bold text-slate-700 block mb-1">Tipe Soal</label>
                  <select
                    value={bankItemForm.tipe}
                    onChange={(e) =>
                      setBankItemForm((p) => ({
                        ...p,
                        tipe: e.target.value as TipeSoalUjian,
                        kunciJawaban:
                          e.target.value === 'benar_salah'
                            ? 'BENAR'
                            : e.target.value === 'pilihan_ganda'
                            ? 'A'
                            : '',
                      }))
                    }
                    className="w-full p-2.5 rounded-xl border border-slate-200 bg-white"
                  >
                    <option value="pilihan_ganda">Pilihan Ganda</option>
                    <option value="benar_salah">Benar / Salah</option>
                    <option value="isian_singkat">Isian Singkat</option>
                    <option value="uraian">Uraian / Esai</option>
                  </select>
                </div>
                <div>
                  <label className="font-bold text-slate-700 block mb-1">Kesulitan</label>
                  <select
                    value={bankItemForm.tingkatKesulitan}
                    onChange={(e) =>
                      setBankItemForm((p) => ({ ...p, tingkatKesulitan: e.target.value as TingkatKesulitanSoal }))
                    }
                    className="w-full p-2.5 rounded-xl border border-slate-200 bg-white"
                  >
                    <option value="mudah">Mudah</option>
                    <option value="sedang">Sedang</option>
                    <option value="sulit">Sulit</option>
                  </select>
                </div>
              </div>

              <div>
                <label className="font-bold text-slate-700 block mb-1">Materi / Topik</label>
                <input
                  type="text"
                  value={bankItemForm.materi}
                  onChange={(e) => setBankItemForm((p) => ({ ...p, materi: e.target.value }))}
                  placeholder="Contoh: Sistem Tata Surya"
                  className="w-full p-2.5 rounded-xl border border-slate-200"
                />
              </div>

              <div>
                <label className="font-bold text-slate-700 block mb-1">Teks Pertanyaan</label>
                <textarea
                  rows={3}
                  value={bankItemForm.pertanyaan}
                  onChange={(e) => setBankItemForm((p) => ({ ...p, pertanyaan: e.target.value }))}
                  className="w-full p-2.5 rounded-xl border border-slate-200"
                />
              </div>

              {bankItemForm.tipe === 'pilihan_ganda' && (
                <div className="space-y-2">
                  <label className="font-bold text-slate-700 block">Pilihan Jawaban</label>
                  {(['A', 'B', 'C', 'D', 'E'] as const).map((ltr) => {
                    const keyField = `pilihan${ltr}` as keyof typeof bankItemForm;
                    return (
                      <div key={ltr} className="flex items-center gap-2">
                        <span className="w-6 text-center font-extrabold">{ltr}.</span>
                        <input
                          type="text"
                          value={String(bankItemForm[keyField] || '')}
                          onChange={(e) => setBankItemForm((p) => ({ ...p, [keyField]: e.target.value }))}
                          className="flex-1 p-2 rounded-lg border border-slate-200"
                        />
                      </div>
                    );
                  })}
                </div>
              )}

              {bankItemForm.tipe !== 'uraian' && (
                <div>
                  <label className="font-bold text-slate-700 block mb-1">
                    Kunci Jawaban {bankItemForm.tipe === 'benar_salah' ? '(BENAR / SALAH)' : bankItemForm.tipe === 'pilihan_ganda' ? '(A–E)' : ''}
                  </label>
                  <input
                    type="text"
                    value={bankItemForm.kunciJawaban}
                    onChange={(e) => setBankItemForm((p) => ({ ...p, kunciJawaban: e.target.value }))}
                    className="w-full p-2.5 rounded-xl border border-slate-200 font-semibold"
                  />
                </div>
              )}
            </div>

            <div className="p-4 bg-white border-t border-slate-200 flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setBankManualModalOpen(false)}
                className="px-4 py-2 rounded-xl bg-slate-100 text-slate-700 text-xs font-bold cursor-pointer"
              >
                Batal
              </button>
              <button
                type="button"
                onClick={async () => {
                  if (!bankItemForm.pertanyaan.trim()) {
                    toast.warning('Pertanyaan wajib diisi.');
                    return;
                  }
                  const pilihanMap: Record<string, string> | undefined =
                    bankItemForm.tipe === 'pilihan_ganda'
                      ? {
                          A: bankItemForm.pilihanA,
                          B: bankItemForm.pilihanB,
                          C: bankItemForm.pilihanC,
                          D: bankItemForm.pilihanD,
                          ...(bankItemForm.pilihanE ? { E: bankItemForm.pilihanE } : {}),
                        }
                      : bankItemForm.tipe === 'benar_salah'
                      ? { A: 'Benar', B: 'Salah' }
                      : undefined;

                  await db.saveBankSoalItem({
                    id: bankEditingItem?.id,
                    createdAt: bankEditingItem?.createdAt,
                    mataPelajaran: bankItemForm.mataPelajaran || 'Umum',
                    kelas: bankItemForm.kelas || 'Semua Kelas',
                    materi: bankItemForm.materi,
                    tingkatKesulitan: bankItemForm.tingkatKesulitan,
                    tipe: bankItemForm.tipe,
                    pertanyaan: bankItemForm.pertanyaan,
                    pilihan: pilihanMap,
                    kunciJawaban: bankItemForm.kunciJawaban,
                    bobot: Number(bankItemForm.bobot) || 1,
                    pembahasan: bankItemForm.pembahasan,
                    pedomanPenilaian: bankItemForm.pedomanPenilaian,
                    dibuatOleh: currentUser.name,
                  });
                  setBankSoalList(db.getBankSoalList());
                  setBankManualModalOpen(false);
                  toast.success('Butir Bank Soal berhasil disimpan!');
                }}
                className="px-4 py-2 rounded-xl bg-blue-700 hover:bg-blue-600 text-white text-xs font-bold cursor-pointer"
              >
                Simpan Bank Soal
              </button>
            </div>
          </div>
        </div>
      )}

      {/* MODAL RINCIAN LOG PELANGGARAN SISWA */}
      {violationDetailSession && (
        <div className="fixed inset-0 z-50 bg-slate-950/70 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="max-w-lg w-full bg-white rounded-3xl p-6 space-y-4 shadow-2xl border border-slate-200">
            <div className="flex items-center justify-between border-b border-slate-100 pb-3">
              <div>
                <span className="text-[10px] font-extrabold uppercase tracking-wider text-amber-700">
                  Log Pengawasan Anti-Kecurangan
                </span>
                <h3 className="text-base font-extrabold text-slate-900">
                  {violationDetailSession.namaSiswa} ({violationDetailSession.kelas})
                </h3>
              </div>
              <button
                type="button"
                onClick={() => setViolationDetailSession(null)}
                className="p-1.5 rounded-xl text-slate-400 hover:bg-slate-100 cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="max-h-72 overflow-y-auto space-y-2">
              {(violationDetailSession.logPelanggaran || []).map((log, lIdx) => (
                <div
                  key={lIdx}
                  className="p-3 rounded-2xl bg-amber-50/80 border border-amber-200 text-xs space-y-0.5"
                >
                  <div className="flex items-center justify-between font-bold text-amber-900">
                    <span>{log.jenis.replace(/_/g, ' ').toUpperCase()}</span>
                    <span className="text-[11px] font-mono text-amber-700">
                      {log.waktu ? new Date(log.waktu).toLocaleTimeString('id-ID') : '-'}
                    </span>
                  </div>
                  <p className="text-slate-700">{log.keterangan}</p>
                </div>
              ))}
            </div>

            <button
              type="button"
              onClick={() => setViolationDetailSession(null)}
              className="w-full py-2.5 bg-slate-100 hover:bg-slate-200 text-slate-800 rounded-xl text-xs font-bold cursor-pointer"
            >
              Tutup
            </button>
          </div>
        </div>
      )}

      {/* MODAL KONFIRMASI HAPUS UJIAN */}
      <ConfirmModal
        isOpen={Boolean(deleteConfirmExam)}
        title="Hapus Naskah Ujian?"
        message={`Hapus naskah ujian "${deleteConfirmExam?.judul || ''}"? Seluruh data pengerjaan siswa pada ujian ini juga akan dihapus permanen.`}
        confirmText="Ya, Hapus Ujian"
        cancelText="Batal"
        isDestructive={true}
        onCancel={() => setDeleteConfirmExam(null)}
        onConfirm={async () => {
          if (!deleteConfirmExam) return;
          const target = deleteConfirmExam;
          setDeleteConfirmExam(null);
          await db.deleteUjian(target.id);
          toast.success(`Ujian "${target.judul}" berhasil dihapus.`);
        }}
      />
    </div>
  );
};
