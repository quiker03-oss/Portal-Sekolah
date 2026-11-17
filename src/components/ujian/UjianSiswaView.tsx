import React, { useState, useEffect, useRef, useMemo } from 'react';
import jsQR from 'jsqr';
import confetti from 'canvas-confetti';
import { db } from '../../services/database';
import { sound } from '../../services/audio';
import { toast } from '../../utils/toast';
import { UjianOnline, SesiUjianSiswa, SoalUjian, DetailJawabanSiswa, Siswa, Settings } from '../../types';
import { ImageLightboxModal } from './ImageLightboxModal';
import { ExamRichContent, renderMathAndTextInline } from './ExamRichContent';
import {
  buildDisplayedChoicesForQuestion,
  checkExamScheduleWindow,
  getOrderedQuestionsForSession,
} from '../../utils/examShuffleAndScore';
import {
  Clock,
  CheckCircle,
  AlertTriangle,
  ChevronLeft,
  ChevronRight,
  ShieldAlert,
  LogOut,
  Send,
  HelpCircle,
  Sparkles,
  BookOpen,
  User,
  KeyRound,
  CheckCircle2,
  RefreshCw,
  Camera,
  CameraOff,
  QrCode,
  School,
  Lock,
  Unlock,
  UploadCloud,
  ZoomIn,
  Maximize2,
  LayoutGrid,
  X,
  XCircle,
} from 'lucide-react';

interface UjianSiswaViewProps {
  initialUjianId?: string;
  initialSessionToken?: string;
  onExit: () => void;
}

export const UjianSiswaView: React.FC<UjianSiswaViewProps> = ({
  initialUjianId,
  initialSessionToken,
  onExit,
}) => {
  const [settings, setSettings] = useState<Settings>(() => db.getSettings());

  // Exam Selection & Info
  const [selectedExamId, setSelectedExamId] = useState<string>(initialUjianId || '');
  const [ujian, setUjian] = useState<UjianOnline | null>(null);
  const [availableExams, setAvailableExams] = useState<UjianOnline[]>([]);
  const [isLoadingExam, setIsLoadingExam] = useState<boolean>(true);
  const [logoError, setLogoError] = useState<boolean>(false);

  // Verification & Pairing State (Tahap 2 & Tahap 3)
  const [verifyMode, setVerifyMode] = useState<'camera' | 'passcode' | 'nisn'>('camera');
  const [passCodeInput, setPassCodeInput] = useState('');
  const [nisnInput, setNisnInput] = useState('');
  const [verificationError, setVerificationError] = useState<string | null>(null);
  const [isVerifying, setIsVerifying] = useState(false);
  const [verifiedSiswa, setVerifiedSiswa] = useState<Siswa | null>(null);

  // Student Camera Scanner (always-mounted <video> + ref-based loop for reliability)
  const [isCameraActive, setIsCameraActive] = useState(false);
  const [cameraLoading, setCameraLoading] = useState(false);
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const isScanningRef = useRef<boolean>(false);
  const lastScanTimeRef = useRef<number>(0);
  const animFrameIdRef = useRef<number | null>(null);
  const qrFileInputRef = useRef<HTMLInputElement | null>(null);
  const lastViolationAtRef = useRef<number>(0);

  // Active Session & Exam Taking (Tahap 4)
  const [sesi, setSesi] = useState<SesiUjianSiswa | null>(null);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [jawabanState, setJawabanState] = useState<{ [soalId: string]: DetailJawabanSiswa }>({});
  const [timeLeftSeconds, setTimeLeftSeconds] = useState<number>(0);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [showSubmitModal, setShowSubmitModal] = useState(false);
  const [showMobileNavModal, setShowMobileNavModal] = useState(false);
  const [readyStarted, setReadyStarted] = useState(false);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [isCompleted, setIsCompleted] = useState(false);
  const [saveStatus, setSaveStatus] = useState<'saved' | 'saving' | 'offline'>('saved');
  const [pembahasanMap, setPembahasanMap] = useState<
    Record<string, { kunciJawaban?: string; benar?: boolean }> | undefined
  >(undefined);
  const serverOffsetMsRef = useRef<number>(0);
  const essaySaveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const getAuthoritativeNowMs = () => Date.now() + serverOffsetMsRef.current;

  const tryEnterFullscreen = async () => {
    try {
      const el: any = document.documentElement;
      if (document.fullscreenElement) {
        setIsFullscreen(true);
        return;
      }
      if (el.requestFullscreen) {
        await el.requestFullscreen();
        setIsFullscreen(true);
      } else if (el.webkitRequestFullscreen) {
        el.webkitRequestFullscreen();
        setIsFullscreen(true);
      }
    } catch {
      // Browser/iOS may block fullscreen cleanly; exam stays fully playable
    }
  };

  const tryExitFullscreen = () => {
    try {
      const doc: any = document;
      if (doc.fullscreenElement && doc.exitFullscreen) {
        doc.exitFullscreen().catch(() => {});
      } else if (doc.webkitFullscreenElement && doc.webkitExitFullscreen) {
        doc.webkitExitFullscreen();
      }
    } catch {}
  };

  // Anti-cheat Proctoring Warning Modal
  const [cheatWarning, setCheatWarning] = useState<string | null>(null);

  // Fullscreen Image Lightbox Modal State
  const [lightboxData, setLightboxData] = useState<{
    isOpen: boolean;
    imageUrl: string;
    title?: string;
    caption?: string;
  }>({ isOpen: false, imageUrl: '' });

  // Track broken/failed image loads so student gets a clear retry button
  const [imageLoadErrors, setImageLoadErrors] = useState<Record<string, boolean>>({});
  const [imageRetryNonce, setImageRetryNonce] = useState<number>(0);

  // Online / Offline State
  const [isOnline, setIsOnline] = useState<boolean>(typeof navigator !== 'undefined' ? navigator.onLine : true);

  useEffect(() => {
    const syncClock = async () => {
      try {
        const resp = await fetch('/api/ujian/time');
        if (resp.ok) {
          const json = await resp.json().catch(() => null);
          if (typeof json?.serverTimeMs === 'number') {
            serverOffsetMsRef.current = json.serverTimeMs - Date.now();
          }
        }
      } catch {}
    };
    syncClock();
  }, []);

  useEffect(() => {
    const handleOnline = async () => {
      setIsOnline(true);
      setSaveStatus('saved');
      if (sesi && ujian) {
        if (sesi.pendingSubmitSync) {
          const synced = await db.submitUjianKeBackend(sesi.id).catch(() => null);
          if (synced?.sesi) {
            setSesi(synced.sesi);
            if (synced.pembahasanMap) setPembahasanMap(synced.pembahasanMap);
          }
        } else {
          db.saveSesiUjian({ ...sesi, jawaban: jawabanState }).catch(() => {});
        }
      }
    };
    const handleOffline = () => {
      setIsOnline(false);
      setSaveStatus('offline');
    };

    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);
    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
    };
  }, [sesi, ujian, jawabanState]);

  // --------------------------------------------------------------------------
  // 1. URL ROUTING & CROSS-DEVICE FIRESTORE RESOLUTION
  // --------------------------------------------------------------------------
  useEffect(() => {
    let isCancelled = false;

    const bootstrapExamRoute = async () => {
      setIsLoadingExam(true);
      let targetExamId = initialUjianId || '';
      let targetToken = initialSessionToken || '';
      let targetSchoolId = '';

      if (typeof window !== 'undefined') {
        const searchParams = new URLSearchParams(window.location.search);
        const hash = window.location.hash || '';

        targetExamId = targetExamId || searchParams.get('ujian') || searchParams.get('id') || searchParams.get('examId') || '';
        targetToken = targetToken || searchParams.get('session') || searchParams.get('token') || '';
        targetSchoolId = searchParams.get('school') || searchParams.get('schoolId') || '';

        if (hash.includes('?')) {
          const hashQuery = hash.split('?')[1];
          const hashParams = new URLSearchParams(hashQuery);
          if (!targetExamId) targetExamId = hashParams.get('id') || hashParams.get('ujian') || hashParams.get('examId') || '';
          if (!targetToken) targetToken = hashParams.get('session') || hashParams.get('token') || '';
          if (!targetSchoolId) targetSchoolId = hashParams.get('school') || hashParams.get('schoolId') || '';
        }
      }

      if (targetSchoolId) {
        db.setActiveSchoolId(targetSchoolId);
      }

      if (!isCancelled) {
        setSettings(db.getSettings());
        setAvailableExams(db.getUjianList());
      }

      if (targetToken) {
        const resolvedSession = await db.resolveSessionFromFirestore({
          token: targetToken,
          schoolId: targetSchoolId || undefined,
        });
        if (!isCancelled && resolvedSession) {
          initSession(resolvedSession);
          setIsLoadingExam(false);
          return;
        }
      }

      if (targetExamId) {
        setSelectedExamId(targetExamId);
        const resolvedExam = await db.resolveExamFromFirestore(targetExamId, targetSchoolId || undefined);
        if (!isCancelled) {
          if (resolvedExam) {
            setUjian(resolvedExam);
            setSettings(db.getSettings());
          } else {
            setVerificationError('Tautan ujian tidak ditemukan atau sekolah belum menerbitkan ujian tersebut.');
          }
          setAvailableExams(db.getUjianList());
        }
      } else {
        const list = db.getUjianList();
        if (!isCancelled && list.length > 0) {
          const activeOne = list.find((u) => u.status === 'aktif' || u.status === 'terbit') || list[0];
          setSelectedExamId(activeOne.id);
          const sanitized = db.getUjianForStudent(activeOne.id);
          if (sanitized) setUjian(sanitized);
        }
      }

      if (!isCancelled) {
        setIsLoadingExam(false);
      }
    };

    bootstrapExamRoute();

    return () => {
      isCancelled = true;
    };
  }, [initialUjianId, initialSessionToken]);

  // Real-time synchronization listener (settings, exams, proctor unlock)
  useEffect(() => {
    const handleLiveSync = () => {
      setSettings(db.getSettings());
      setLogoError(false);
      const latestExams = db.getUjianList();
      setAvailableExams(latestExams);

      if (selectedExamId && !sesi) {
        const refreshedExam = db.getUjianForStudent(selectedExamId);
        if (refreshedExam) setUjian(refreshedExam);
      }

      if (sesi) {
        const latestSesi = db.getSesiById(sesi.id);
        if (latestSesi) {
          // Automatically unlock student screen when teacher clicks "Buka Kunci" in Pengawasan
          if (sesi.status === 'terkunci' && latestSesi.status !== 'terkunci') {
            setSesi(latestSesi);
            toast.success('Sesi ujian Anda telah dibuka kembali oleh Guru Pengawas.');
          } else if (latestSesi.status === 'terkunci' && sesi.status !== 'terkunci') {
            setSesi(latestSesi);
          }
        }
      }
    };

    window.addEventListener('ujian_online_updated', handleLiveSync);
    window.addEventListener('sesi_ujian_updated', handleLiveSync);
    window.addEventListener('settings_updated', handleLiveSync);
    window.addEventListener('sekolah_updated', handleLiveSync);
    window.addEventListener('school_changed', handleLiveSync);

    return () => {
      window.removeEventListener('ujian_online_updated', handleLiveSync);
      window.removeEventListener('sesi_ujian_updated', handleLiveSync);
      window.removeEventListener('settings_updated', handleLiveSync);
      window.removeEventListener('sekolah_updated', handleLiveSync);
      window.removeEventListener('school_changed', handleLiveSync);
    };
  }, [selectedExamId, sesi]);

  // When selected exam changes
  const handleSelectExam = (examId: string) => {
    setSelectedExamId(examId);
    setVerificationError(null);
    const found = db.getUjianForStudent(examId);
    if (found) {
      setUjian(found);
    }
  };

  // --------------------------------------------------------------------------
  // 2. CAMERA SCANNER FOR STUDENT QR ABSENSI (Tahap 3)
  // --------------------------------------------------------------------------
  const startCamera = async () => {
    setVerificationError(null);
    setCameraLoading(true);
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
      setCameraLoading(false);
      scanQrCodeLoop();
    } catch (err: any) {
      console.warn('Gagal menyalakan kamera siswa:', err);
      isScanningRef.current = false;
      setIsCameraActive(false);
      setCameraLoading(false);
      setVerificationError(
        'Tidak dapat mengakses kamera perangkat. Silakan izinkan akses kamera pada browser, atau gunakan metode Upload Foto QR / Kode Guru / Input NISN di bawah.'
      );
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
    setCameraLoading(false);
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
          try {
            sound.playSuccess();
          } catch {}
          stopCamera();
          handleVerifyQrData(code.data);
          return;
        }
      }
    }

    animFrameIdRef.current = requestAnimationFrame(scanQrCodeLoop);
  };

  // Upload Photo of QR Card
  const handleUploadQrFile = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (event) => {
      const img = new Image();
      img.onload = () => {
        const canvas = document.createElement('canvas');
        canvas.width = img.width;
        canvas.height = img.height;
        const ctx = canvas.getContext('2d');
        if (!ctx) return;
        ctx.drawImage(img, 0, 0);
        const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
        const code = jsQR(imageData.data, imageData.width, imageData.height);
        if (code && code.data) {
          try {
            sound.playSuccess();
          } catch {}
          handleVerifyQrData(code.data);
        } else {
          setVerificationError(
            'QR Code tidak terdeteksi pada gambar yang diunggah. Pastikan foto kartu QR Absensi terlihat terang dan jelas.'
          );
        }
      };
      img.src = event.target?.result as string;
    };
    reader.readAsDataURL(file);
    e.target.value = '';
  };

  // --------------------------------------------------------------------------
  // 3. VERIFY STUDENT IDENTITY & AUTHORIZATION (Strict Validation)
  // --------------------------------------------------------------------------
  const handleVerifyQrData = async (qrString: string) => {
    setVerificationError(null);
    setIsVerifying(true);

    try {
      if (!ujian) {
        throw new Error('Naskah ujian belum dipilih atau tautan tidak valid.');
      }

      // Check exam status & authoritative schedule window
      const sched = checkExamScheduleWindow(ujian, getAuthoritativeNowMs());
      if (!sched.allowed) {
        throw new Error(sched.reason || 'Ujian belum dibuka atau masa pengerjaan telah berakhir.');
      }

      // 1. Look up student identity from database (with Firestore fallback on fresh devices)
      const cleanQr = qrString.trim();
      const siswa = await db.resolveSiswaForVerification(cleanQr, ujian.schoolId);

      if (!siswa) {
        throw new Error(
          `Kartu QR Absensi "${cleanQr}" tidak terdaftar dalam database siswa sekolah ini. Pastikan Anda memindai Kartu QR Absensi resmi.`
        );
      }

      // 2. Validate student class matches exam target classes
      const examClasses = ujian.kelasTarget || [];
      if (examClasses.length > 0) {
        const studentClass = siswa.kelas || '';
        const normStudentClass = studentClass.toLowerCase().replace(/[^a-z0-9]/g, '');
        const isMatched = examClasses.some((c) => {
          const normC = c.toLowerCase().replace(/[^a-z0-9]/g, '');
          return (
            normC === normStudentClass ||
            normC === `kelas${normStudentClass}` ||
            `kelas${normC}` === normStudentClass
          );
        });

        if (!isMatched) {
          throw new Error(
            `Kartu QR terdaftar atas nama ${siswa.namaLengkap} (Kelas ${siswa.kelas || '-'}). Namun ujian ini dikhususkan untuk ${examClasses.join(', ')}. Anda tidak memiliki hak akses untuk mengerjakan ujian ini.`
          );
        }
      }

      setVerifiedSiswa(siswa);

      // 3. Create or get existing exam session
      const session = await db.createOrGetSesiUjian(ujian.id, siswa);

      // Check if session is already completed
      if (session.status === 'selesai' || session.status === 'waktu_habis') {
        initSession(session);
        setIsCompleted(true);
        return;
      }

      // Check if locked
      if (session.status === 'terkunci') {
        setSesi(session);
        return;
      }

      // Direct entry to exam!
      initSession(session);
    } catch (err: any) {
      setVerificationError(err?.message || 'Verifikasi gagal.');
    } finally {
      setIsVerifying(false);
    }
  };

  // Verify by manual NISN / Nomor Induk
  const handleVerifyManualNisn = (e: React.FormEvent) => {
    e.preventDefault();
    if (!nisnInput.trim()) {
      setVerificationError('Silakan masukkan NISN atau Nomor Induk Siswa.');
      return;
    }
    handleVerifyQrData(nisnInput.trim());
  };

  // Verify by 6-digit passcode provided by teacher
  const handleVerifyPasscode = async (e: React.FormEvent) => {
    e.preventDefault();
    setVerificationError(null);
    setIsVerifying(true);

    try {
      const code = passCodeInput.trim();
      if (!code) {
        throw new Error('Silakan masukkan Kode Akses 6-Digit dari Guru.');
      }

      const match = await db.resolveSessionFromFirestore({
        passCode: code,
        schoolId: ujian?.schoolId || undefined,
      });

      if (!match) {
        throw new Error(
          'Kode Akses tidak ditemukan. Pastikan Anda sudah menunjukkan QR Absensi kepada Guru Pengawas.'
        );
      }

      initSession(match);
    } catch (err: any) {
      setVerificationError(err?.message || 'Kode akses tidak cocok.');
    } finally {
      setIsVerifying(false);
    }
  };

  // --------------------------------------------------------------------------
  // 4. ACTIVE SESSION INITIALIZATION (Lock Question & Choice Ordering)
  // --------------------------------------------------------------------------
  const initSession = async (session: SesiUjianSiswa) => {
    let exam = db.getUjianForStudent(session.ujianId);
    if (!exam) {
      exam = await db.resolveExamFromFirestore(session.ujianId, session.schoolId);
    }
    if (!exam) {
      setVerificationError('Data naskah ujian tidak ditemukan.');
      return;
    }

    const sched = checkExamScheduleWindow(exam, getAuthoritativeNowMs());
    if (!sched.allowed && session.status !== 'selesai' && session.status !== 'waktu_habis') {
      setVerificationError(sched.reason || 'Masa pengerjaan ujian belum dibuka atau telah berakhir.');
      return;
    }

    const sessionSeedKey = session.id || session.siswaId;
    const { urutanSoalIds, urutanPilihanMap } = getOrderedQuestionsForSession(
      exam,
      sessionSeedKey,
      session
    );

    const needsOrderPersist =
      !session.urutanSoalIds ||
      session.urutanSoalIds.length === 0 ||
      !session.urutanPilihanMap ||
      Object.keys(session.urutanPilihanMap).length === 0;

    let lockedSession = {
      ...session,
      urutanSoalIds,
      urutanPilihanMap,
    };

    if (needsOrderPersist) {
      lockedSession = await db.saveSesiUjian(lockedSession).catch(() => lockedSession);
    }

    setSesi(lockedSession);
    setUjian(exam);
    setJawabanState(lockedSession.jawaban || {});

    const durasiTotalSec = (exam.durasiMenit || 60) * 60;
    if (lockedSession.waktuMulai) {
      const startMs = new Date(lockedSession.waktuMulai).getTime();
      const elapsedSec = Math.floor((getAuthoritativeNowMs() - startMs) / 1000);
      setTimeLeftSeconds(Math.max(0, durasiTotalSec - elapsedSec));
    } else {
      setTimeLeftSeconds(durasiTotalSec);
    }

    if (lockedSession.status === 'selesai' || lockedSession.status === 'waktu_habis') {
      setReadyStarted(true);
      setIsCompleted(true);
    } else {
      setReadyStarted(false);
    }
  };

  const handleStartExamWithFullscreen = async () => {
    if (!sesi || !ujian) return;
    if (ujian.modeFullscreen !== false) {
      await tryEnterFullscreen();
    }
    if (!sesi.waktuMulai || sesi.status === 'terverifikasi') {
      const startedSesi: SesiUjianSiswa = {
        ...sesi,
        status: 'sedang_mengerjakan',
        waktuMulai: sesi.waktuMulai || new Date(getAuthoritativeNowMs()).toISOString(),
      };
      setSesi(startedSesi);
      db.saveSesiUjian(startedSesi).catch(() => {});
    }
    setReadyStarted(true);
  };

  // --------------------------------------------------------------------------
  // 5. COUNTDOWN TIMER (Server-offset wall-clock synchronized)
  // --------------------------------------------------------------------------
  useEffect(() => {
    if (!sesi || !ujian || !readyStarted || isCompleted || sesi.status === 'terkunci') return;

    const durasiTotalMs = (ujian.durasiMenit || 60) * 60 * 1000;
    const startMs = sesi.waktuMulai ? new Date(sesi.waktuMulai).getTime() : getAuthoritativeNowMs();
    const targetEndMs = startMs + durasiTotalMs;

    const tick = () => {
      const remainingSec = Math.max(0, Math.ceil((targetEndMs - getAuthoritativeNowMs()) / 1000));
      setTimeLeftSeconds(remainingSec);
      if (remainingSec <= 0) {
        clearInterval(timer);
        handleTimeExpired();
      }
    };

    tick();
    const timer = setInterval(tick, 1000);

    return () => clearInterval(timer);
  }, [sesi?.id, sesi?.status, sesi?.waktuMulai, ujian?.id, ujian?.durasiMenit, readyStarted, isCompleted]);

  const handleTimeExpired = async () => {
    if (!sesi) return;
    setIsSubmitting(true);
    try {
      const res = await db.submitUjianKeBackend(sesi.id);
      if (res.sesi) setSesi(res.sesi);
      if (res.pembahasanMap) setPembahasanMap(res.pembahasanMap);
    } finally {
      tryExitFullscreen();
      setIsCompleted(true);
      setIsSubmitting(false);
    }
  };

  // --------------------------------------------------------------------------
  // 6. PROCTORING & FULLSCREEN MONITORING
  // --------------------------------------------------------------------------
  useEffect(() => {
    if (!sesi || !readyStarted || isCompleted || sesi.status === 'terkunci') return;

    const handleFsChange = () => {
      const doc: any = document;
      const active = Boolean(doc.fullscreenElement || doc.webkitFullscreenElement);
      setIsFullscreen(active);
      if (!active && ujian?.modeFullscreen !== false) {
        triggerViolation(
          'keluar_fullscreen',
          'Anda keluar dari mode layar penuh ujian.'
        );
      }
    };

    const handleVisibilityChange = () => {
      if (document.hidden) {
        triggerViolation(
          'pindah_tab',
          'Terdeteksi meninggalkan layar ujian atau membuka tab/aplikasi lain.'
        );
      }
    };

    const handleWindowBlur = () => {
      triggerViolation('jendela_blur', 'Jendela ujian kehilangan fokus aktif.');
    };

    const handleCopyPaste = (e: ClipboardEvent) => {
      e.preventDefault();
      triggerViolation('copy_paste', 'Tindakan menyalin atau menempel teks dinonaktifkan selama ujian.');
    };

    document.addEventListener('fullscreenchange', handleFsChange);
    document.addEventListener('webkitfullscreenchange', handleFsChange);
    document.addEventListener('visibilitychange', handleVisibilityChange);
    window.addEventListener('blur', handleWindowBlur);
    document.addEventListener('copy', handleCopyPaste);
    document.addEventListener('paste', handleCopyPaste);

    return () => {
      document.removeEventListener('fullscreenchange', handleFsChange);
      document.removeEventListener('webkitfullscreenchange', handleFsChange);
      document.removeEventListener('visibilitychange', handleVisibilityChange);
      window.removeEventListener('blur', handleWindowBlur);
      document.removeEventListener('copy', handleCopyPaste);
      document.removeEventListener('paste', handleCopyPaste);
    };
  }, [sesi, ujian?.modeFullscreen, readyStarted, isCompleted]);

  const triggerViolation = (jenis: any, keterangan: string) => {
    if (!sesi || isCompleted || sesi.status === 'terkunci') return;

    const now = Date.now();
    if (jenis !== 'copy_paste' && now - lastViolationAtRef.current < 2500) {
      return;
    }
    lastViolationAtRef.current = now;

    const maxViolations = Math.max(1, Number(ujian?.batasPelanggaran) || 3);
    const optimisticCount = (sesi.jumlahPelanggaran || 0) + 1;
    setCheatWarning(`${keterangan} (Peringatan ke-${optimisticCount} dari batas ${maxViolations} kali)`);

    try {
      sound.playError();
    } catch {}

    db.catatPelanggaranSiswa(sesi.id, jenis, keterangan)
      .then((updatedSesi) => {
        if (updatedSesi) {
          setSesi(updatedSesi);
        } else if (optimisticCount >= maxViolations) {
          setSesi((prev) => (prev ? { ...prev, status: 'terkunci', jumlahPelanggaran: optimisticCount } : null));
        }
      })
      .catch(() => {});
  };

  // --------------------------------------------------------------------------
  // 7. ANSWER SUBMISSION & SEQUENCE-GUARDED AUTOSAVE
  // --------------------------------------------------------------------------
  const handleSelectAnswer = async (
    soalId: string,
    answerOriginalKeyOrText: string,
    displayLetter?: string,
    debounceWrite = false
  ) => {
    if (!sesi || isCompleted || sesi.status === 'terkunci') return;

    const nowTs = Date.now();
    setSaveStatus('saving');
    const existing = jawabanState[soalId] || { jawabanDipilih: '' };
    const updatedDetail: DetailJawabanSiswa = {
      ...existing,
      jawabanDipilih: answerOriginalKeyOrText,
      opsiAsliDipilih: displayLetter ? answerOriginalKeyOrText : existing.opsiAsliDipilih,
      opsiTampilDipilih: displayLetter ?? existing.opsiTampilDipilih,
      waktuJawab: new Date(nowTs).toISOString(),
      clientUpdatedAt: nowTs,
    };

    setJawabanState((prev) => ({
      ...prev,
      [soalId]: updatedDetail,
    }));

    const persistNow = async () => {
      try {
        await db.saveJawabanSiswa(sesi.id, soalId, updatedDetail);
        setSaveStatus(navigator.onLine ? 'saved' : 'offline');
      } catch {
        setSaveStatus('offline');
      }
    };

    if (debounceWrite) {
      if (essaySaveTimerRef.current) clearTimeout(essaySaveTimerRef.current);
      essaySaveTimerRef.current = setTimeout(persistNow, 350);
    } else {
      await persistNow();
    }
  };

  const handleToggleRagu = async (soalId: string) => {
    if (!sesi || isCompleted) return;

    const nowTs = Date.now();
    const existing = jawabanState[soalId] || { jawabanDipilih: '' };
    const updatedDetail: DetailJawabanSiswa = {
      ...existing,
      raguRagu: !existing.raguRagu,
      clientUpdatedAt: nowTs,
    };

    setJawabanState((prev) => ({
      ...prev,
      [soalId]: updatedDetail,
    }));
    await db.saveJawabanSiswa(sesi.id, soalId, updatedDetail);
  };

  const handleSubmitExam = async () => {
    if (!sesi || !ujian) return;
    setIsSubmitting(true);
    try {
      const submitRes = await db.submitUjianKeBackend(sesi.id);
      if (submitRes.sesi) {
        setSesi(submitRes.sesi);
      }
      if (submitRes.pembahasanMap) {
        setPembahasanMap(submitRes.pembahasanMap);
      }
      if (!submitRes.syncedToServer) {
        toast.info('Jawaban disimpan di perangkat dan akan tersinkronisasi ke server begitu internet aktif.');
      }
      tryExitFullscreen();
      setIsCompleted(true);
      setShowSubmitModal(false);
      try {
        confetti({
          particleCount: 90,
          spread: 75,
          origin: { y: 0.6 },
        });
      } catch {}
    } catch (err: any) {
      toast.error(`Gagal mengumpulkan lembar jawaban: ${err?.message || 'Periksa koneksi internet Anda.'}`);
    } finally {
      setIsSubmitting(false);
    }
  };

  const formatTimer = (sec: number) => {
    const hours = Math.floor(sec / 3600);
    const minutes = Math.floor((sec % 3600) / 60);
    const seconds = sec % 60;
    if (hours > 0) {
      return `${hours.toString().padStart(2, '0')}:${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}`;
    }
    return `${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}`;
  };

  // Locked ordered questions from SesiUjianSiswa (`urutanSoalIds` + `jumlahSoalTampil`)
  const orderedSoalList = useMemo<SoalUjian[]>(() => {
    if (!ujian) return [];
    const key = sesi?.id || sesi?.siswaId || 'preview';
    return getOrderedQuestionsForSession(ujian, key, sesi || undefined).orderedQuestions;
  }, [ujian, sesi?.id, sesi?.siswaId, sesi?.urutanSoalIds, sesi?.urutanPilihanMap]);

  // --------------------------------------------------------------------------
  // SCREEN 1: VERIFIKASI QR ABSENSI & IDENTITAS SISWA (URUTAN WAJIB TAHAP 2 & 3)
  // SISWA BELUM BISA MELIHAT ATAU MENGERJAKAN SOAL SEBELUM TERVERIFIKASI
  // --------------------------------------------------------------------------
  if (!sesi) {
    return (
      <div className="min-h-screen bg-slate-900 flex flex-col justify-between p-4 font-sans selection:bg-blue-600 selection:text-white">
        {/* Top Header */}
        <header className="max-w-4xl w-full mx-auto py-4 flex items-center justify-between">
          <div className="flex items-center gap-3">
            {!logoError && settings.logoUrl ? (
              <img
                src={settings.logoUrl}
                alt="Logo Sekolah"
                onError={() => setLogoError(true)}
                className="w-10 h-10 object-contain rounded-xl bg-white/10 p-1 border border-white/20"
              />
            ) : (
              <div className="w-10 h-10 rounded-xl bg-white/10 border border-white/20 flex items-center justify-center text-white">
                <School className="w-5 h-5" />
              </div>
            )}
            <div>
              <h1 className="text-base font-extrabold text-white tracking-tight leading-tight">
                {settings.namaSekolah}
              </h1>
              <p className="text-xs text-blue-200">Portal Ujian Online (CBT)</p>
            </div>
          </div>

          <button
            onClick={onExit}
            className="px-3 py-1.5 rounded-xl bg-white/10 hover:bg-white/20 text-white text-xs font-semibold transition-colors flex items-center gap-1.5 cursor-pointer"
          >
            <LogOut className="w-3.5 h-3.5" />
            <span>Keluar</span>
          </button>
        </header>

        {/* Main Card */}
        <main className="max-w-xl w-full mx-auto my-6 bg-white rounded-3xl shadow-2xl overflow-hidden border border-slate-200/80">
          {/* Exam Header Banner */}
          <div className="p-6 sm:p-8 bg-gradient-to-r from-blue-900 via-blue-800 to-indigo-900 text-white relative">
            <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-white/15 text-blue-200 text-[11px] font-bold uppercase tracking-wider backdrop-blur-xs">
              <Sparkles className="w-3 h-3 text-amber-300" />
              Verifikasi Masuk Ujian
            </span>

            <h2 className="text-xl sm:text-2xl font-extrabold text-white mt-2 tracking-tight">
              {ujian ? ujian.judul : 'Pilih Ujian yang Tersedia'}
            </h2>

            {isLoadingExam ? (
              <div className="mt-3 flex items-center gap-2 text-xs text-blue-200">
                <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                <span>Menghubungkan ke naskah ujian sekolah...</span>
              </div>
            ) : ujian ? (
              <div className="mt-3 space-y-2.5">
                <div className="flex flex-wrap gap-2 text-xs text-blue-200">
                  <span className="bg-white/10 px-2.5 py-1 rounded-lg">
                    Mapel: <strong>{ujian.mataPelajaran}</strong>
                  </span>
                  <span className="bg-white/10 px-2.5 py-1 rounded-lg">
                    Kelas: <strong>{ujian.kelasTarget.join(', ')}</strong>
                  </span>
                  <span className="bg-white/10 px-2.5 py-1 rounded-lg flex items-center gap-1">
                    <Clock className="w-3.5 h-3.5 text-blue-300" />
                    <strong>{ujian.durasiMenit} Menit</strong>
                  </span>
                  <span className="bg-white/10 px-2.5 py-1 rounded-lg">
                    Total: <strong>{ujian.soalList.length} Soal</strong>
                  </span>
                </div>
                {ujian.petunjukPengerjaan && (
                  <p className="text-[11px] text-blue-100/90 bg-white/10 px-3 py-2 rounded-xl border border-white/10 leading-relaxed">
                    <strong>Petunjuk:</strong> {ujian.petunjukPengerjaan}
                  </p>
                )}
              </div>
            ) : (
              <p className="text-xs text-blue-200 mt-1">
                Silakan pilih naskah ujian yang ingin Anda ikuti di bawah.
              </p>
            )}
          </div>

          {/* Exam Selector if multiple or not targeted */}
          {!isLoadingExam && !ujian && availableExams.length > 0 && (
            <div className="p-6 border-b border-slate-100 bg-slate-50">
              <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-2">
                Pilih Naskah Ujian
              </label>
              <select
                value={selectedExamId}
                onChange={(e) => handleSelectExam(e.target.value)}
                className="w-full p-3 rounded-xl border border-slate-300 text-sm font-semibold text-slate-800 bg-white"
              >
                <option value="">-- Pilih Ujian --</option>
                {availableExams.map((ex) => (
                  <option key={ex.id} value={ex.id}>
                    {ex.judul} ({ex.mataPelajaran} - {ex.kelasTarget.join(', ')})
                  </option>
                ))}
              </select>
            </div>
          )}

          {/* Notice: Exam is locked until identity verified */}
          <div className="p-4 bg-amber-50 border-b border-amber-200/70 text-amber-900 text-xs flex items-start gap-2.5">
            <Lock className="w-4 h-4 text-amber-700 flex-shrink-0 mt-0.5" />
            <div className="leading-relaxed">
              <strong>Lembar Soal Ujian Terkunci.</strong> Sesuai protokol ujian sekolah, siswa wajib
              menunjukkan atau memindai <strong>Kartu QR Absensi Siswa</strong> untuk memverifikasi
              identitas sebelum lembar soal dapat dibuka.
            </div>
          </div>

          {/* Verification Methods Tabs */}
          <div className="p-6 sm:p-8 space-y-6">
            <div className="flex flex-wrap sm:flex-nowrap rounded-2xl bg-slate-100 p-1 gap-1 border border-slate-200">
              <button
                type="button"
                onClick={() => {
                  setVerifyMode('camera');
                  setVerificationError(null);
                }}
                className={`flex-1 py-2 text-xs font-bold rounded-xl transition-all flex items-center justify-center gap-1.5 cursor-pointer ${
                  verifyMode === 'camera'
                    ? 'bg-white text-blue-800 shadow-xs'
                    : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                <Camera className="w-3.5 h-3.5" />
                <span>Kamera QR Siswa</span>
              </button>

              <button
                type="button"
                onClick={() => {
                  stopCamera();
                  setVerifyMode('passcode');
                  setVerificationError(null);
                }}
                className={`flex-1 py-2 text-xs font-bold rounded-xl transition-all flex items-center justify-center gap-1.5 cursor-pointer ${
                  verifyMode === 'passcode'
                    ? 'bg-white text-blue-800 shadow-xs'
                    : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                <KeyRound className="w-3.5 h-3.5" />
                <span>Kode Guru (6 Digit)</span>
              </button>

              <button
                type="button"
                onClick={() => {
                  stopCamera();
                  setVerifyMode('nisn');
                  setVerificationError(null);
                }}
                className={`flex-1 py-2 text-xs font-bold rounded-xl transition-all flex items-center justify-center gap-1.5 cursor-pointer ${
                  verifyMode === 'nisn'
                    ? 'bg-white text-blue-800 shadow-xs'
                    : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                <User className="w-3.5 h-3.5" />
                <span>Input NISN / NIS</span>
              </button>
            </div>

            {/* Error Message */}
            {verificationError && (
              <div className="p-3.5 bg-red-50 border border-red-200 rounded-xl text-xs text-red-700 font-medium flex items-start gap-2.5 animate-in fade-in">
                <AlertTriangle className="w-4 h-4 text-red-600 flex-shrink-0 mt-0.5" />
                <div className="leading-relaxed">
                  <strong className="block">Verifikasi Gagal:</strong>
                  {verificationError}
                </div>
              </div>
            )}

            {/* METHOD 1: SCAN WITH STUDENT CAMERA */}
            {verifyMode === 'camera' && (
              <div className="space-y-4 text-center">
                <div className="border-2 border-dashed border-slate-300 rounded-3xl p-4 bg-slate-50 relative overflow-hidden flex flex-col items-center justify-center min-h-[220px]">
                  <div
                    className={
                      isCameraActive
                        ? 'w-full relative rounded-2xl overflow-hidden bg-black aspect-video flex items-center justify-center shadow-inner'
                        : 'hidden'
                    }
                  >
                    <video ref={videoRef} playsInline muted className="w-full h-full object-cover" />
                    <canvas ref={canvasRef} className="hidden" />
                    {/* Aiming Frame Overlay */}
                    <div className="absolute inset-0 border-2 border-white/30 flex items-center justify-center pointer-events-none">
                      <div className="w-44 h-44 border-2 border-blue-400 rounded-2xl shadow-[0_0_0_9999px_rgba(0,0,0,0.5)] animate-pulse" />
                    </div>
                  </div>
                  {!isCameraActive && (
                    <div className="space-y-3 py-4">
                      <div className="w-16 h-16 rounded-2xl bg-blue-100 text-blue-700 mx-auto flex items-center justify-center">
                        <QrCode className="w-8 h-8" />
                      </div>
                      <div>
                        <h4 className="text-sm font-bold text-slate-800">
                          Arahkan Kartu QR Absensi Anda ke Kamera
                        </h4>
                        <p className="text-xs text-slate-500 mt-1 max-w-xs mx-auto">
                          Gunakan kamera HP atau laptop Anda untuk memindai QR Code yang ada pada Kartu
                          Absensi Siswa.
                        </p>
                      </div>
                    </div>
                  )}
                </div>

                <div className="flex gap-2.5">
                  {isCameraActive ? (
                    <button
                      type="button"
                      onClick={stopCamera}
                      className="w-full py-3 bg-slate-200 hover:bg-slate-300 text-slate-800 rounded-xl text-xs font-bold transition-all flex items-center justify-center gap-2 cursor-pointer"
                    >
                      <CameraOff className="w-4 h-4" />
                      <span>Matikan Kamera</span>
                    </button>
                  ) : (
                    <button
                      type="button"
                      onClick={startCamera}
                      disabled={cameraLoading || isVerifying}
                      className="flex-1 py-3 bg-blue-700 hover:bg-blue-600 disabled:opacity-50 text-white rounded-xl text-xs font-bold transition-all flex items-center justify-center gap-2 shadow-md cursor-pointer"
                    >
                      {cameraLoading ? (
                        <>
                          <RefreshCw className="w-4 h-4 animate-spin" />
                          <span>Menyiapkan Kamera...</span>
                        </>
                      ) : (
                        <>
                          <Camera className="w-4 h-4" />
                          <span>Nyalakan Kamera Pemindai</span>
                        </>
                      )}
                    </button>
                  )}

                  <input
                    ref={qrFileInputRef}
                    type="file"
                    accept="image/*"
                    onChange={handleUploadQrFile}
                    className="hidden"
                  />
                  <button
                    type="button"
                    onClick={() => qrFileInputRef.current?.click()}
                    className="px-4 py-3 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-xl text-xs font-bold transition-all flex items-center gap-1.5 cursor-pointer border border-slate-200"
                    title="Upload Foto Kartu QR"
                  >
                    <UploadCloud className="w-4 h-4 text-slate-600" />
                    <span>Upload Foto QR</span>
                  </button>
                </div>
              </div>
            )}

            {/* METHOD 2: 6-DIGIT PASSCODE FROM TEACHER */}
            {verifyMode === 'passcode' && (
              <form onSubmit={handleVerifyPasscode} className="space-y-4">
                <div className="p-3.5 bg-blue-50 border border-blue-200 rounded-2xl text-xs text-blue-900 leading-relaxed">
                  <strong>Verifikasi Meja Guru:</strong> Tunjukkan Kartu QR Absensi Anda ke meja Guru
                  Pengawas. Guru akan memindai kartu Anda dan memberikan <strong>Kode Akses 6-Digit</strong>.
                </div>

                <div className="space-y-1.5 text-left">
                  <label className="text-xs font-bold text-slate-700">Kode Akses 6-Digit Siswa</label>
                  <input
                    type="text"
                    maxLength={6}
                    value={passCodeInput}
                    onChange={(e) => setPassCodeInput(e.target.value.replace(/[^0-9]/g, ''))}
                    placeholder="Contoh: 849201"
                    className="w-full text-center text-2xl tracking-[0.3em] font-extrabold py-3.5 px-4 rounded-xl border-2 border-slate-200 focus:border-blue-600 focus:ring-4 focus:ring-blue-100 outline-none transition-all"
                  />
                </div>

                <button
                  type="submit"
                  disabled={isVerifying || passCodeInput.length < 4}
                  className="w-full py-3.5 bg-blue-700 hover:bg-blue-600 disabled:opacity-50 text-white rounded-xl text-xs font-bold transition-all flex items-center justify-center gap-2 shadow-md cursor-pointer"
                >
                  {isVerifying ? (
                    <>
                      <RefreshCw className="w-4 h-4 animate-spin" />
                      <span>Memverifikasi Kode...</span>
                    </>
                  ) : (
                    <>
                      <Unlock className="w-4 h-4" />
                      <span>Verifikasi & Buka Soal Ujian</span>
                    </>
                  )}
                </button>
              </form>
            )}

            {/* METHOD 3: MANUAL NISN / NOMOR INDUK */}
            {verifyMode === 'nisn' && (
              <form onSubmit={handleVerifyManualNisn} className="space-y-4">
                <div className="p-3.5 bg-slate-50 border border-slate-200 rounded-2xl text-xs text-slate-700 leading-relaxed">
                  Masukkan NISN atau Nomor Induk Siswa (NIS) yang tertera pada Kartu QR Absensi Anda
                  sebagai alternatif verifikasi.
                </div>

                <div className="space-y-1.5 text-left">
                  <label className="text-xs font-bold text-slate-700">NISN / Nomor Induk Siswa</label>
                  <input
                    type="text"
                    value={nisnInput}
                    onChange={(e) => setNisnInput(e.target.value)}
                    placeholder="Contoh: 0081234567 atau STU-00001"
                    className="w-full py-3 px-4 rounded-xl border border-slate-300 text-sm font-semibold focus:border-blue-600 focus:ring-4 focus:ring-blue-100 outline-none transition-all"
                  />
                </div>

                <button
                  type="submit"
                  disabled={isVerifying || !nisnInput.trim()}
                  className="w-full py-3.5 bg-blue-700 hover:bg-blue-600 disabled:opacity-50 text-white rounded-xl text-xs font-bold transition-all flex items-center justify-center gap-2 shadow-md cursor-pointer"
                >
                  {isVerifying ? (
                    <>
                      <RefreshCw className="w-4 h-4 animate-spin" />
                      <span>Memverifikasi Identitas Siswa...</span>
                    </>
                  ) : (
                    <>
                      <CheckCircle2 className="w-4 h-4" />
                      <span>Verifikasi Identitas & Buka Soal</span>
                    </>
                  )}
                </button>
              </form>
            )}
          </div>
        </main>

        <footer className="max-w-4xl w-full mx-auto py-3 text-center text-xs text-slate-400">
          Sistem Ujian Online CBT &bull; {settings.namaSekolah} &copy; 2026
        </footer>
      </div>
    );
  }

  // --------------------------------------------------------------------------
  // SCREEN 2: LOCKED BY PROCTOR (Terkunci karena pelanggaran berulang)
  // --------------------------------------------------------------------------
  if (sesi.status === 'terkunci') {
    return (
      <div className="min-h-screen bg-slate-900 flex items-center justify-center p-4">
        <div className="max-w-md w-full bg-white rounded-3xl p-8 text-center space-y-5 shadow-2xl">
          <div className="w-16 h-16 rounded-2xl bg-red-100 text-red-600 mx-auto flex items-center justify-center">
            <ShieldAlert className="w-8 h-8" />
          </div>
          <div>
            <h2 className="text-xl font-bold text-slate-900">Lembar Ujian Terkunci</h2>
            <p className="text-xs text-slate-600 mt-2 leading-relaxed">
              Sesi ujian Anda dikunci oleh sistem pengawasan karena terdeteksi pelanggaran berulang kali
              (berpindah tab / keluar layar ujian). Silakan melapor kepada Guru Pengawas di ruangan untuk
              membuka kembali kunci ujian Anda.
            </p>
          </div>
          <button
            onClick={onExit}
            className="w-full py-3 bg-slate-800 hover:bg-slate-700 text-white rounded-xl text-xs font-bold transition-all cursor-pointer"
          >
            Kembali ke Portal
          </button>
        </div>
      </div>
    );
  }

  // --------------------------------------------------------------------------
  // SCREEN 3: EXAM COMPLETED SCREEN (Hasil / Bukti Pengiriman)
  // --------------------------------------------------------------------------
  if (isCompleted) {
    const activeQuestionIds = new Set(orderedSoalList.map((q) => q.id));
    const totalSoal = orderedSoalList.length || (ujian ? ujian.soalList.length : 0);
    const dijawabCount = Object.keys(jawabanState).filter(
      (k) =>
        (activeQuestionIds.size === 0 || activeQuestionIds.has(k)) &&
        jawabanState[k] &&
        Boolean(jawabanState[k].jawabanDipilih?.trim())
    ).length;

    return (
      <div className="min-h-[100dvh] bg-slate-900 flex items-center justify-center p-4">
        <div className="max-w-lg w-full bg-white rounded-3xl p-6 sm:p-8 text-center space-y-5 shadow-2xl max-h-[92dvh] overflow-y-auto">
          <div className="w-16 h-16 rounded-2xl bg-emerald-100 text-emerald-600 mx-auto flex items-center justify-center">
            <CheckCircle2 className="w-8 h-8" />
          </div>

          <div>
            <h2 className="text-2xl font-extrabold text-slate-900">Ujian Telah Selesai</h2>
            <p className="text-xs text-slate-500 mt-1">
              Lembar jawaban Anda telah berhasil disimpan dan diserahkan kepada Guru Pengawas.
            </p>
          </div>

          {sesi.pendingSubmitSync && (
            <div className="p-3 bg-amber-50 border border-amber-200 rounded-2xl text-xs text-amber-800 flex items-center justify-between gap-2 text-left">
              <span>Jawaban tersimpan lokal & menunggu koneksi untuk sinkronisasi ke server.</span>
              <button
                type="button"
                onClick={async () => {
                  const res = await db.submitUjianKeBackend(sesi.id);
                  if (res.sesi) setSesi(res.sesi);
                  if (res.pembahasanMap) setPembahasanMap(res.pembahasanMap);
                  if (res.syncedToServer) toast.success('Berhasil disinkronkan ke server!');
                }}
                className="px-2.5 py-1 bg-amber-600 text-white rounded-lg font-bold shrink-0 cursor-pointer"
              >
                Kirim Ulang
              </button>
            </div>
          )}

          <div className="p-4 bg-slate-50 rounded-2xl border border-slate-100 space-y-2.5 text-left text-xs">
            <div className="flex justify-between">
              <span className="text-slate-500">Nama Siswa:</span>
              <strong className="text-slate-800">{sesi.namaSiswa}</strong>
            </div>
            <div className="flex justify-between">
              <span className="text-slate-500">Mata Pelajaran:</span>
              <strong className="text-slate-800">{ujian?.mataPelajaran}</strong>
            </div>
            <div className="flex justify-between">
              <span className="text-slate-500">Total Soal Terjawab:</span>
              <strong className="text-slate-800">
                {dijawabCount} / {totalSoal} Soal
              </strong>
            </div>

            {ujian?.tampilkanNilaiLangsung && !sesi.pendingSubmitSync && (
              <div className="pt-3 border-t border-slate-200 space-y-2">
                <div className="flex justify-between items-center">
                  <span className="font-bold text-slate-700">Nilai Akhir:</span>
                  <span
                    className={`text-xl font-extrabold px-3 py-0.5 rounded-lg ${
                      sesi.lulusKkm ? 'bg-emerald-100 text-emerald-800' : 'bg-amber-100 text-amber-800'
                    }`}
                  >
                    {sesi.nilaiAkhir}
                  </span>
                </div>
                {typeof sesi.jumlahBenar === 'number' && (
                  <div className="grid grid-cols-3 gap-2 pt-1 text-center">
                    <div className="p-2 rounded-xl bg-emerald-50 border border-emerald-200 text-emerald-800">
                      <span className="block font-extrabold text-sm">{sesi.jumlahBenar}</span>
                      <span className="text-[10px]">Benar</span>
                    </div>
                    <div className="p-2 rounded-xl bg-rose-50 border border-rose-200 text-rose-800">
                      <span className="block font-extrabold text-sm">{sesi.jumlahSalah ?? 0}</span>
                      <span className="text-[10px]">Salah</span>
                    </div>
                    <div className="p-2 rounded-xl bg-slate-100 border border-slate-200 text-slate-700">
                      <span className="block font-extrabold text-sm">{sesi.jumlahKosong ?? 0}</span>
                      <span className="text-[10px]">Kosong</span>
                    </div>
                  </div>
                )}
                {sesi.adaUraianBelumDinilai && (
                  <p className="text-[11px] text-amber-700 bg-amber-50 px-2.5 py-1.5 rounded-xl border border-amber-200">
                    Nilai akhir final menunggu pemeriksaan soal uraian oleh Guru.
                  </p>
                )}
              </div>
            )}
          </div>

          {ujian?.tampilkanNilaiLangsung && ujian?.tampilkanPembahasan && pembahasanMap && (
            <div className="text-left space-y-2">
              <h3 className="text-xs font-extrabold text-slate-700 uppercase tracking-wider">
                Ringkasan Hasil Per Nomor
              </h3>
              <div className="max-h-52 overflow-y-auto space-y-1.5 pr-1">
                {orderedSoalList.map((q, idx) => {
                  const ans = jawabanState[q.id];
                  const rev = pembahasanMap[q.id];
                  return (
                    <div
                      key={q.id}
                      className="flex items-center justify-between text-xs px-3 py-2 rounded-xl border border-slate-200 bg-slate-50"
                    >
                      <span className="font-bold text-slate-700">Soal No. {idx + 1}</span>
                      <div className="flex items-center gap-2">
                        <span className="text-slate-600">
                          Pilihan: <strong>{ans?.opsiTampilDipilih || ans?.jawabanDipilih || '-'}</strong>
                        </span>
                        {rev?.benar === true ? (
                          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-emerald-100 text-emerald-800 font-bold text-[10px]">
                            <CheckCircle className="w-3 h-3" /> Benar
                          </span>
                        ) : rev?.benar === false ? (
                          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-rose-100 text-rose-800 font-bold text-[10px]">
                            <XCircle className="w-3 h-3" /> Salah
                          </span>
                        ) : (
                          <span className="px-2 py-0.5 rounded-full bg-slate-200 text-slate-700 font-bold text-[10px]">
                            Uraian
                          </span>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          <button
            onClick={() => {
              tryExitFullscreen();
              onExit();
            }}
            className="w-full py-3 bg-blue-700 hover:bg-blue-600 text-white rounded-xl text-xs font-bold transition-all shadow-md cursor-pointer"
          >
            Kembali ke Portal Sekolah
          </button>
        </div>
      </div>
    );
  }

  // --------------------------------------------------------------------------
  // SCREEN 3B: READY TO START FULLSCREEN GATEWAY
  // --------------------------------------------------------------------------
  if (!readyStarted && ujian) {
    const isResuming = sesi.status === 'sedang_mengerjakan' && Boolean(sesi.waktuMulai);
    return (
      <div className="min-h-[100dvh] bg-slate-900 flex items-center justify-center p-4">
        <div className="max-w-lg w-full bg-white rounded-3xl p-6 sm:p-8 space-y-6 shadow-2xl border border-slate-200">
          <div className="flex items-center gap-3">
            <div className="w-12 h-12 rounded-2xl bg-blue-100 text-blue-700 flex items-center justify-center shrink-0">
              <Maximize2 className="w-6 h-6" />
            </div>
            <div>
              <span className="text-[11px] font-bold uppercase tracking-wider text-blue-700">
                Persiapan Memulai Ujian
              </span>
              <h2 className="text-lg sm:text-xl font-extrabold text-slate-900 leading-tight">
                {ujian.judul}
              </h2>
            </div>
          </div>

          <div className="p-4 rounded-2xl bg-slate-50 border border-slate-200 space-y-2 text-xs">
            <div className="flex justify-between">
              <span className="text-slate-500">Peserta</span>
              <strong className="text-slate-900">{sesi.namaSiswa} ({sesi.kelas})</strong>
            </div>
            <div className="flex justify-between">
              <span className="text-slate-500">Mata Pelajaran</span>
              <strong className="text-slate-900">{ujian.mataPelajaran}</strong>
            </div>
            <div className="flex justify-between">
              <span className="text-slate-500">Jumlah Soal</span>
              <strong className="text-slate-900">{orderedSoalList.length} Butir Soal</strong>
            </div>
            <div className="flex justify-between">
              <span className="text-slate-500">Sisa Waktu Pengerjaan</span>
              <strong className="text-blue-700">{formatTimer(timeLeftSeconds)}</strong>
            </div>
          </div>

          {ujian.petunjukPengerjaan && (
            <div className="p-3.5 rounded-2xl bg-blue-50 border border-blue-200 text-xs text-blue-950 leading-relaxed">
              <strong className="block mb-1">Petunjuk Pengerjaan:</strong>
              {ujian.petunjukPengerjaan}
            </div>
          )}

          {ujian.modeFullscreen !== false && (
            <div className="p-3.5 rounded-2xl bg-amber-50 border border-amber-200 text-xs text-amber-900 leading-relaxed flex items-start gap-2.5">
              <ShieldAlert className="w-4 h-4 text-amber-700 shrink-0 mt-0.5" />
              <span>
                Ujian akan dijalankan dalam <strong>Mode Layar Penuh (Fullscreen)</strong>. Jangan
                berpindah tab, membuka aplikasi lain, atau keluar dari layar ujian selama pengerjaan.
              </span>
            </div>
          )}

          <div className="flex flex-col sm:flex-row gap-2.5">
            <button
              type="button"
              onClick={onExit}
              className="sm:w-36 py-3 rounded-xl border border-slate-300 bg-white hover:bg-slate-50 text-slate-700 text-xs font-bold cursor-pointer"
            >
              Keluar
            </button>
            <button
              type="button"
              onClick={handleStartExamWithFullscreen}
              className="flex-1 py-3.5 px-5 rounded-xl bg-blue-700 hover:bg-blue-600 text-white text-xs sm:text-sm font-extrabold shadow-lg flex items-center justify-center gap-2 cursor-pointer"
            >
              <Maximize2 className="w-4 h-4" />
              <span>
                {isResuming
                  ? 'Lanjutkan Ujian (Layar Penuh)'
                  : ujian.modeFullscreen !== false
                  ? 'Mulai Kerjakan Ujian (Layar Penuh)'
                  : 'Mulai Kerjakan Ujian'}
              </span>
            </button>
          </div>
        </div>
      </div>
    );
  }

  // --------------------------------------------------------------------------
  // SCREEN 4: ACTIVE EXAM TAKING VIEW (Responsive Mobile-First + Fullscreen)
  // --------------------------------------------------------------------------
  const soalList = orderedSoalList;
  const currentSoal = soalList[currentIndex] || soalList[0];
  const currentDetail = currentSoal
    ? jawabanState[currentSoal.id] || { jawabanDipilih: '' }
    : { jawabanDipilih: '' };
  const totalSoal = soalList.length;

  const activeIdsSet = new Set(soalList.map((q) => q.id));
  const answeredCount = Object.keys(jawabanState).filter(
    (k) => activeIdsSet.has(k) && jawabanState[k] && Boolean(jawabanState[k].jawabanDipilih?.trim())
  ).length;
  const raguCount = Object.keys(jawabanState).filter(
    (k) => activeIdsSet.has(k) && jawabanState[k]?.raguRagu
  ).length;
  const unansweredCount = Math.max(0, totalSoal - answeredCount);

  const displayedChoices =
    currentSoal && currentSoal.tipe === 'pilihan_ganda'
      ? buildDisplayedChoicesForQuestion(currentSoal, sesi.urutanPilihanMap)
      : [];
  const hasAnyChoiceImage = displayedChoices.some((c) => Boolean(c.imageUrl));
  const selectedOriginalKey = currentDetail.opsiAsliDipilih || currentDetail.jawabanDipilih;

  const isLastQuestion = currentIndex === totalSoal - 1;
  const isTimeCritical = timeLeftSeconds < 300;

  return (
    <div className="min-h-[100dvh] bg-slate-100 flex flex-col font-sans selection:bg-blue-600 selection:text-white overflow-x-hidden">
      {/* Re-enter Fullscreen Banner if user exited fullscreen */}
      {ujian?.modeFullscreen !== false && !isFullscreen && (
        <div className="bg-amber-500 text-slate-950 px-3 py-2 text-xs font-bold flex items-center justify-between gap-2 z-50">
          <div className="flex items-center gap-2 min-w-0">
            <ShieldAlert className="w-4 h-4 shrink-0" />
            <span className="truncate">Mode layar penuh sedang nonaktif.</span>
          </div>
          <button
            type="button"
            onClick={tryEnterFullscreen}
            className="px-3 py-1 rounded-lg bg-slate-950 text-white text-[11px] font-bold shrink-0 cursor-pointer flex items-center gap-1"
          >
            <Maximize2 className="w-3.5 h-3.5" />
            <span>Masuk Layar Penuh</span>
          </button>
        </div>
      )}

      {/* Top Bar Navigation */}
      <header className="sticky top-0 z-40 bg-white border-b border-slate-200 shadow-xs px-3 sm:px-6 pt-[env(safe-area-inset-top)] h-16 flex items-center justify-between gap-2">
        <div className="flex items-center gap-2.5 min-w-0">
          <div className="w-9 h-9 rounded-xl bg-blue-700 text-white flex items-center justify-center font-bold text-sm shadow-xs shrink-0">
            <BookOpen className="w-5 h-5" />
          </div>
          <div className="min-w-0">
            <h1 className="text-xs sm:text-sm font-extrabold text-slate-900 leading-tight truncate max-w-[160px] sm:max-w-xs md:max-w-md">
              {ujian?.judul}
            </h1>
            <div className="flex items-center gap-1.5 text-[11px] text-slate-500 mt-0.5 truncate">
              <span className="truncate">{ujian?.mataPelajaran}</span>
              <span className="hidden sm:inline">&bull;</span>
              <span className="hidden sm:inline truncate">
                {sesi.namaSiswa} ({sesi.kelas})
              </span>
            </div>
          </div>
        </div>

        {/* Timer & Cloud Save Indicator */}
        <div className="flex items-center gap-2 sm:gap-3 shrink-0">
          <div
            className={`flex items-center gap-1.5 px-2.5 sm:px-3 py-1.5 rounded-xl text-xs font-bold shadow-xs transition-colors ${
              isTimeCritical
                ? 'bg-red-50 text-red-700 border border-red-200 animate-pulse'
                : 'bg-blue-50 text-blue-900 border border-blue-200'
            }`}
          >
            <Clock className="w-4 h-4 shrink-0" />
            <span className="tabular-nums">{formatTimer(timeLeftSeconds)}</span>
          </div>

          <div className="hidden sm:flex items-center gap-1.5 text-[11px] text-slate-500">
            {saveStatus === 'saved' ? (
              <>
                <CheckCircle className="w-3.5 h-3.5 text-emerald-600" />
                <span className="text-emerald-700 font-semibold">Tersimpan</span>
              </>
            ) : saveStatus === 'saving' ? (
              <>
                <RefreshCw className="w-3.5 h-3.5 text-blue-600 animate-spin" />
                <span>Menyimpan...</span>
              </>
            ) : (
              <>
                <AlertTriangle className="w-3.5 h-3.5 text-amber-600" />
                <span className="text-amber-700 font-semibold">Mode Offline</span>
              </>
            )}
          </div>

          <button
            onClick={() => setShowSubmitModal(true)}
            className="px-3 sm:px-3.5 py-2 bg-emerald-600 hover:bg-emerald-500 text-white rounded-xl text-xs font-bold shadow-xs flex items-center gap-1.5 transition-colors cursor-pointer min-h-[38px]"
          >
            <Send className="w-3.5 h-3.5" />
            <span>Kumpulkan</span>
          </button>
        </div>
      </header>

      {/* Main Container: Question Card + Desktop Number Palette */}
      <main className="flex-1 max-w-6xl w-full mx-auto p-3 sm:p-6 lg:p-8 grid grid-cols-1 lg:grid-cols-4 gap-6">
        {/* Left Column: Question Area */}
        <div className="lg:col-span-3 space-y-4">
          {currentSoal ? (
            <div className="bg-white rounded-3xl p-4 sm:p-7 border border-slate-200 shadow-xs space-y-5">
              {/* Question Header */}
              <div className="flex items-center justify-between pb-3 border-b border-slate-100 gap-2">
                <div className="flex items-center gap-2">
                  <span className="w-8 h-8 rounded-lg bg-blue-100 text-blue-900 font-extrabold flex items-center justify-center text-sm shrink-0">
                    {currentIndex + 1}
                  </span>
                  <span className="text-xs font-bold uppercase tracking-wider text-slate-500">
                    {currentSoal.tipe === 'pilihan_ganda' ? 'Pilihan Ganda' : 'Uraian / Esai'}
                  </span>
                </div>

                <div className="flex items-center gap-2">
                  <span className="text-[11px] text-slate-400">
                    Bobot: <strong>{currentSoal.bobot || 1}</strong>
                  </span>
                  <button
                    type="button"
                    onClick={() => handleToggleRagu(currentSoal.id)}
                    className={`px-3 py-1.5 rounded-xl text-xs font-bold border transition-colors flex items-center gap-1.5 cursor-pointer min-h-[36px] ${
                      currentDetail.raguRagu
                        ? 'bg-amber-100 border-amber-300 text-amber-800'
                        : 'bg-slate-50 border-slate-200 text-slate-600 hover:bg-slate-100'
                    }`}
                  >
                    <HelpCircle className="w-3.5 h-3.5" />
                    <span>Ragu-ragu</span>
                  </button>
                </div>
              </div>

              {/* Ordered Rich Content Renderer (Multi-image, Tables, Math, Text) */}
              <ExamRichContent
                soal={currentSoal}
                displayNumber={currentIndex + 1}
                imageLoadErrors={imageLoadErrors}
                imageRetryNonce={imageRetryNonce}
                onImageError={(imgKey) =>
                  setImageLoadErrors((prev) => ({ ...prev, [imgKey]: true }))
                }
                onRetryImage={(imgKey) => {
                  setImageLoadErrors((prev) => ({ ...prev, [imgKey]: false }));
                  setImageRetryNonce((n) => n + 1);
                }}
                onOpenLightbox={({ imageUrl, title, caption }) =>
                  setLightboxData({ isOpen: true, imageUrl, title, caption })
                }
              />

              {/* Answer Choices Form (Locked Shuffled Permutations Re-labeled A-E) */}
              {currentSoal.tipe === 'pilihan_ganda' && displayedChoices.length > 0 ? (
                <div
                  className={`pt-2 ${
                    hasAnyChoiceImage ? 'grid grid-cols-1 sm:grid-cols-2 gap-3' : 'space-y-2.5'
                  }`}
                >
                  {displayedChoices.map((choice) => {
                    const isSelected = selectedOriginalKey === choice.originalKey;
                    const choiceImg = choice.imageUrl;
                    const choiceErrKey = `${currentSoal.id}_${choice.originalKey}_${imageRetryNonce}`;

                    return (
                      <button
                        key={choice.originalKey}
                        type="button"
                        onClick={() =>
                          handleSelectAnswer(
                            currentSoal.id,
                            choice.originalKey,
                            choice.displayLetter,
                            false
                          )
                        }
                        className={`w-full p-3.5 sm:p-4 rounded-2xl border text-left transition-all flex flex-col justify-between gap-3 cursor-pointer min-h-[52px] ${
                          isSelected
                            ? 'bg-blue-50 border-blue-600 ring-2 ring-blue-600/20 text-blue-950 font-bold shadow-xs'
                            : 'bg-white border-slate-200 hover:border-slate-300 text-slate-800'
                        }`}
                      >
                        <div className="flex items-start justify-between w-full gap-2.5">
                          <div className="flex items-start gap-2.5 min-w-0">
                            <span
                              className={`w-8 h-8 rounded-xl flex items-center justify-center text-xs font-extrabold flex-shrink-0 transition-colors ${
                                isSelected ? 'bg-blue-700 text-white shadow-xs' : 'bg-slate-100 text-slate-700'
                              }`}
                            >
                              {choice.displayLetter}
                            </span>
                            {choice.text && !choice.text.startsWith('(Gambar Pilihan') && (
                              <span className="text-sm pt-1 leading-snug break-words">
                                {renderMathAndTextInline(choice.text)}
                              </span>
                            )}
                          </div>

                          {choiceImg && (
                            <span
                              onClick={(e) => {
                                e.stopPropagation();
                                setLightboxData({
                                  isOpen: true,
                                  imageUrl: choiceImg,
                                  title: `Pilihan ${choice.displayLetter} - Soal Nomor ${currentIndex + 1}`,
                                });
                              }}
                              className="p-1.5 text-slate-400 hover:text-blue-700 hover:bg-blue-50 rounded-lg cursor-zoom-in transition-colors shrink-0"
                              title="Perbesar Gambar Pilihan"
                            >
                              <ZoomIn className="w-4 h-4" />
                            </span>
                          )}
                        </div>

                        {choiceImg && (
                          <div className="rounded-xl overflow-hidden border border-slate-200 bg-slate-50 p-2 flex items-center justify-center max-h-48 w-full">
                            {imageLoadErrors[choiceErrKey] ? (
                              <span
                                onClick={(e) => {
                                  e.stopPropagation();
                                  setImageLoadErrors((prev) => ({
                                    ...prev,
                                    [choiceErrKey]: false,
                                  }));
                                  setImageRetryNonce((n) => n + 1);
                                }}
                                className="text-[11px] font-bold text-amber-700 hover:underline flex items-center gap-1 py-4"
                              >
                                <RefreshCw className="w-3.5 h-3.5" /> Muat ulang gambar pilihan {choice.displayLetter}
                              </span>
                            ) : (
                              <img
                                key={choiceErrKey}
                                src={choiceImg}
                                alt={`Pilihan ${choice.displayLetter}`}
                                className="max-h-40 w-auto max-w-full object-contain rounded-lg"
                                loading="lazy"
                                onError={() =>
                                  setImageLoadErrors((prev) => ({
                                    ...prev,
                                    [choiceErrKey]: true,
                                  }))
                                }
                              />
                            )}
                          </div>
                        )}
                      </button>
                    );
                  })}
                </div>
              ) : (
                <div className="space-y-2 pt-2">
                  <label className="text-xs font-bold text-slate-700">Tuliskan Jawaban Uraian Anda:</label>
                  <textarea
                    rows={6}
                    value={currentDetail.jawabanDipilih || ''}
                    onChange={(e) => handleSelectAnswer(currentSoal.id, e.target.value, undefined, true)}
                    placeholder="Ketik uraian jawaban secara rinci dan teliti di sini..."
                    className="w-full p-4 rounded-2xl border border-slate-200 focus:border-blue-600 focus:ring-4 focus:ring-blue-100 outline-none text-sm transition-all resize-y"
                  />
                  <div className="flex justify-between text-[11px] text-slate-400">
                    <span>Gunakan bahasa yang jelas dan santun.</span>
                    <span>{(currentDetail.jawabanDipilih || '').length} karakter</span>
                  </div>
                </div>
              )}

              {/* Desktop Bottom Actions */}
              <div className="hidden lg:flex pt-6 border-t border-slate-100 items-center justify-between">
                <button
                  type="button"
                  onClick={() => setCurrentIndex((prev) => Math.max(0, prev - 1))}
                  disabled={currentIndex === 0}
                  className="px-4 py-2.5 rounded-xl border border-slate-200 text-xs font-bold text-slate-700 hover:bg-slate-50 disabled:opacity-40 disabled:pointer-events-none transition-colors flex items-center gap-1.5 cursor-pointer"
                >
                  <ChevronLeft className="w-4 h-4" />
                  <span>Sebelumnya</span>
                </button>

                {isLastQuestion ? (
                  <button
                    type="button"
                    onClick={() => setShowSubmitModal(true)}
                    className="px-5 py-2.5 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-bold shadow-md transition-colors flex items-center gap-1.5 cursor-pointer"
                  >
                    <span>Selesai & Kumpulkan</span>
                    <Send className="w-4 h-4" />
                  </button>
                ) : (
                  <button
                    type="button"
                    onClick={() => setCurrentIndex((prev) => Math.min(totalSoal - 1, prev + 1))}
                    className="px-5 py-2.5 rounded-xl bg-blue-700 hover:bg-blue-600 text-white text-xs font-bold shadow-md transition-colors flex items-center gap-1.5 cursor-pointer"
                  >
                    <span>Berikutnya</span>
                    <ChevronRight className="w-4 h-4" />
                  </button>
                )}
              </div>
            </div>
          ) : (
            <div className="text-center py-12 text-slate-400">Soal tidak ditemukan.</div>
          )}
        </div>

        {/* Right Column (Desktop): Numbers Palette */}
        <div className="hidden lg:block space-y-4">
          <div className="bg-white rounded-3xl p-5 border border-slate-200 shadow-xs space-y-4 sticky top-24">
            <div className="flex items-center justify-between pb-3 border-b border-slate-100">
              <h3 className="text-xs font-bold text-slate-900 uppercase tracking-wider">
                Navigasi Soal
              </h3>
              <span className="text-[11px] font-semibold text-blue-700 bg-blue-50 px-2 py-0.5 rounded-full">
                {answeredCount} / {totalSoal}
              </span>
            </div>

            <div className="grid grid-cols-5 gap-2 max-h-80 overflow-y-auto pr-1">
              {soalList.map((q, idx) => {
                const ans = jawabanState[q.id];
                const hasAnswer = ans && ans.jawabanDipilih && ans.jawabanDipilih.trim().length > 0;
                const isRagu = ans && ans.raguRagu;
                const isCurrent = idx === currentIndex;

                return (
                  <button
                    key={q.id}
                    type="button"
                    onClick={() => setCurrentIndex(idx)}
                    className={`h-10 rounded-xl text-xs font-bold transition-all flex items-center justify-center cursor-pointer ${
                      isCurrent ? 'ring-2 ring-blue-600 ring-offset-2' : ''
                    } ${
                      isRagu
                        ? 'bg-amber-400 text-slate-900'
                        : hasAnswer
                        ? 'bg-emerald-600 text-white'
                        : 'bg-slate-100 text-slate-700 hover:bg-slate-200'
                    }`}
                  >
                    {idx + 1}
                  </button>
                );
              })}
            </div>

            <div className="pt-3 border-t border-slate-100 space-y-1.5 text-[11px] text-slate-500">
              <div className="flex items-center gap-2">
                <span className="w-3 h-3 rounded bg-emerald-600 flex-shrink-0" />
                <span>Sudah Dijawab ({answeredCount})</span>
              </div>
              <div className="flex items-center gap-2">
                <span className="w-3 h-3 rounded bg-amber-400 flex-shrink-0" />
                <span>Ragu-ragu ({raguCount})</span>
              </div>
              <div className="flex items-center gap-2">
                <span className="w-3 h-3 rounded bg-slate-100 border border-slate-200 flex-shrink-0" />
                <span>Belum Dijawab ({unansweredCount})</span>
              </div>
            </div>
          </div>
        </div>
      </main>

      {/* Mobile / Tablet Sticky Bottom Navigation Bar (Android Friendly 44px+ Tap Targets) */}
      <div className="lg:hidden sticky bottom-0 z-30 bg-white/95 backdrop-blur border-t border-slate-200 px-3 pt-2.5 pb-[max(0.625rem,env(safe-area-inset-bottom))] flex items-center justify-between gap-2 shadow-[0_-4px_12px_rgba(15,23,42,0.06)]">
        <button
          type="button"
          onClick={() => setCurrentIndex((prev) => Math.max(0, prev - 1))}
          disabled={currentIndex === 0}
          className="px-3.5 min-h-[44px] rounded-xl border border-slate-200 text-xs font-bold text-slate-700 hover:bg-slate-50 disabled:opacity-40 disabled:pointer-events-none flex items-center gap-1 cursor-pointer"
        >
          <ChevronLeft className="w-4 h-4" />
          <span>Prev</span>
        </button>

        <button
          type="button"
          onClick={() => setShowMobileNavModal(true)}
          className="flex-1 min-h-[44px] px-3 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-800 text-xs font-bold flex items-center justify-center gap-1.5 cursor-pointer"
        >
          <LayoutGrid className="w-4 h-4 text-blue-700" />
          <span>
            Soal {currentIndex + 1}/{totalSoal} &bull; {answeredCount} Terjawab
          </span>
        </button>

        {isLastQuestion ? (
          <button
            type="button"
            onClick={() => setShowSubmitModal(true)}
            className="px-4 min-h-[44px] rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-bold shadow-sm flex items-center gap-1.5 cursor-pointer"
          >
            <span>Kumpulkan</span>
            <Send className="w-3.5 h-3.5" />
          </button>
        ) : (
          <button
            type="button"
            onClick={() => setCurrentIndex((prev) => Math.min(totalSoal - 1, prev + 1))}
            className="px-4 min-h-[44px] rounded-xl bg-blue-700 hover:bg-blue-600 text-white text-xs font-bold shadow-sm flex items-center gap-1 cursor-pointer"
          >
            <span>Next</span>
            <ChevronRight className="w-4 h-4" />
          </button>
        )}
      </div>

      {/* Mobile Question Navigator Drawer Modal */}
      {showMobileNavModal && (
        <div className="fixed inset-0 z-50 bg-slate-950/60 backdrop-blur-xs flex items-end sm:items-center justify-center p-0 sm:p-4 lg:hidden">
          <div className="w-full sm:max-w-md bg-white rounded-t-3xl sm:rounded-3xl p-5 pb-[max(1.25rem,env(safe-area-inset-bottom))] space-y-4 shadow-2xl max-h-[82dvh] flex flex-col">
            <div className="flex items-center justify-between border-b border-slate-100 pb-3">
              <div>
                <h3 className="text-sm font-extrabold text-slate-900">Peta Nomor Soal</h3>
                <p className="text-[11px] text-slate-500">
                  Terjawab {answeredCount} &bull; Kosong {unansweredCount} &bull; Ragu {raguCount}
                </p>
              </div>
              <button
                type="button"
                onClick={() => setShowMobileNavModal(false)}
                className="p-2 rounded-xl bg-slate-100 text-slate-600 cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="grid grid-cols-5 gap-2 overflow-y-auto py-1">
              {soalList.map((q, idx) => {
                const ans = jawabanState[q.id];
                const hasAnswer = ans && ans.jawabanDipilih && ans.jawabanDipilih.trim().length > 0;
                const isRagu = ans && ans.raguRagu;
                const isCurrent = idx === currentIndex;

                return (
                  <button
                    key={q.id}
                    type="button"
                    onClick={() => {
                      setCurrentIndex(idx);
                      setShowMobileNavModal(false);
                    }}
                    className={`h-11 rounded-xl text-xs font-bold transition-all flex items-center justify-center cursor-pointer ${
                      isCurrent ? 'ring-2 ring-blue-600 ring-offset-2' : ''
                    } ${
                      isRagu
                        ? 'bg-amber-400 text-slate-900'
                        : hasAnswer
                        ? 'bg-emerald-600 text-white'
                        : 'bg-slate-100 text-slate-700'
                    }`}
                  >
                    {idx + 1}
                  </button>
                );
              })}
            </div>

            <div className="flex items-center justify-between text-[11px] text-slate-500 pt-2 border-t border-slate-100">
              <span className="flex items-center gap-1.5"><span className="w-3 h-3 rounded bg-emerald-600" /> Terjawab</span>
              <span className="flex items-center gap-1.5"><span className="w-3 h-3 rounded bg-amber-400" /> Ragu-ragu</span>
              <span className="flex items-center gap-1.5"><span className="w-3 h-3 rounded bg-slate-200" /> Kosong</span>
            </div>
          </div>
        </div>
      )}

      {/* Confirmation Submit Modal */}
      {showSubmitModal && (
        <div className="fixed inset-0 z-50 bg-slate-950/60 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="max-w-md w-full bg-white rounded-3xl p-6 sm:p-8 space-y-5 shadow-2xl">
            <div className="w-12 h-12 rounded-2xl bg-emerald-50 text-emerald-600 flex items-center justify-center">
              <Send className="w-6 h-6" />
            </div>

            <div>
              <h3 className="text-lg font-bold text-slate-900">Konfirmasi Kumpulkan Ujian</h3>
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 my-3 text-center">
                <div className="p-2.5 rounded-xl bg-slate-50 border border-slate-200">
                  <span className="block text-base font-extrabold text-slate-900">{totalSoal}</span>
                  <span className="text-[10px] text-slate-500">Total Soal</span>
                </div>
                <div className="p-2.5 rounded-xl bg-emerald-50 border border-emerald-200">
                  <span className="block text-base font-extrabold text-emerald-700">{answeredCount}</span>
                  <span className="text-[10px] text-emerald-700">Terjawab</span>
                </div>
                <div className="p-2.5 rounded-xl bg-rose-50 border border-rose-200">
                  <span className="block text-base font-extrabold text-rose-700">{unansweredCount}</span>
                  <span className="text-[10px] text-rose-700">Belum Dijawab</span>
                </div>
                <div className="p-2.5 rounded-xl bg-amber-50 border border-amber-200">
                  <span className="block text-base font-extrabold text-amber-700">{raguCount}</span>
                  <span className="text-[10px] text-amber-700">Ragu-ragu</span>
                </div>
              </div>
              <p className="text-xs text-slate-600 leading-relaxed">
                {unansweredCount > 0 && (
                  <span className="block mb-1 text-amber-700 font-semibold">
                    Perhatian: Masih ada {unansweredCount} butir soal yang belum Anda isi!
                  </span>
                )}
                Apakah Anda yakin ingin menyelesaikan dan mengumpulkan lembar jawaban sekarang?
              </p>
            </div>

            <div className="flex gap-2.5 pt-2">
              <button
                type="button"
                onClick={() => setShowSubmitModal(false)}
                className="flex-1 py-2.5 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-xl text-xs font-bold transition-colors cursor-pointer"
              >
                Periksa Kembali
              </button>
              <button
                type="button"
                onClick={handleSubmitExam}
                disabled={isSubmitting}
                className="flex-1 py-2.5 bg-emerald-600 hover:bg-emerald-500 text-white rounded-xl text-xs font-bold shadow-md transition-colors cursor-pointer flex items-center justify-center gap-1.5"
              >
                {isSubmitting ? (
                  <>
                    <RefreshCw className="w-4 h-4 animate-spin" />
                    <span>Mengirim...</span>
                  </>
                ) : (
                  <span>Ya, Kumpulkan</span>
                )}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Proctoring Warning Toast */}
      {cheatWarning && (
        <div className="fixed bottom-20 lg:bottom-6 right-4 left-4 sm:left-auto z-50 sm:max-w-sm bg-red-600 text-white p-4 rounded-2xl shadow-xl flex items-start gap-3 animate-in fade-in slide-in-from-bottom">
          <ShieldAlert className="w-5 h-5 flex-shrink-0 mt-0.5 text-amber-300" />
          <div className="flex-1 text-xs">
            <h4 className="font-bold">Peringatan Pengawasan!</h4>
            <p className="mt-0.5 text-red-100">{cheatWarning}</p>
          </div>
          <button
            type="button"
            onClick={() => setCheatWarning(null)}
            className="text-white hover:text-red-200 text-xs font-bold shrink-0 cursor-pointer"
          >
            Tutup
          </button>
        </div>
      )}

      {/* Fullscreen Responsive Image Lightbox Modal */}
      <ImageLightboxModal
        isOpen={lightboxData.isOpen}
        imageUrl={lightboxData.imageUrl}
        title={lightboxData.title}
        caption={lightboxData.caption}
        onClose={() => setLightboxData({ isOpen: false, imageUrl: '' })}
      />
    </div>
  );
};
