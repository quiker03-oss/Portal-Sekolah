import React, { useState, useEffect, useMemo, useRef } from 'react';
import { db } from '../../services/database';
import { UjianOnline, SoalUjian, JawabanSiswaUjian, Siswa, LogPelanggaranUjian } from '../../types';
import {
  Clock,
  CheckCircle2,
  AlertCircle,
  ChevronLeft,
  ChevronRight,
  Flag,
  Send,
  HelpCircle,
  ZoomIn,
  X,
  User,
  Sparkles,
  Lock,
  ArrowLeft,
  BookOpen,
  Award,
  Check,
  ShieldAlert,
  Maximize2,
  Layers,
  AlertTriangle,
  RefreshCw,
  Eye,
  FileText,
} from 'lucide-react';

export function getOrCreateDeviceId(): string {
  if (typeof window === 'undefined') return 'server-dev';
  try {
    let id = localStorage.getItem('portal_sekolah_device_id');
    if (!id) {
      id =
        'dev-' +
        (typeof crypto !== 'undefined' && crypto.randomUUID
          ? crypto.randomUUID()
          : Math.random().toString(36).substring(2, 10) + Date.now().toString(36));
      localStorage.setItem('portal_sekolah_device_id', id);
    }
    return id;
  } catch {
    return 'temp-dev-' + Date.now();
  }
}

export function collectDeviceInfo() {
  const deviceId = getOrCreateDeviceId();
  const ua = typeof navigator !== 'undefined' ? navigator.userAgent || '' : '';
  let browser = 'Browser Web';
  if (ua.includes('Edg/')) browser = 'Microsoft Edge';
  else if (ua.includes('Chrome/')) browser = 'Google Chrome';
  else if (ua.includes('Safari/') && !ua.includes('Chrome')) browser = 'Apple Safari';
  else if (ua.includes('Firefox/')) browser = 'Mozilla Firefox';

  let os = 'Perangkat';
  if (ua.includes('Windows')) os = 'Windows';
  else if (ua.includes('Android')) os = 'Android';
  else if (ua.includes('iPhone') || ua.includes('iPad')) os = 'iOS';
  else if (ua.includes('Mac OS')) os = 'macOS';
  else if (ua.includes('Linux')) os = 'Linux';

  const screenRes =
    typeof window !== 'undefined' ? `${window.screen.width}x${window.screen.height}` : 'Standar';

  return {
    deviceId,
    userAgent: ua,
    platform: typeof navigator !== 'undefined' ? navigator.platform || os : os,
    screenResolution: screenRes,
    language: typeof navigator !== 'undefined' ? navigator.language || 'id-ID' : 'id-ID',
    browserSummary: `${browser} (${os}, ${screenRes})`,
    loginAt: new Date().toISOString(),
  };
}

interface UjianSiswaViewProps {
  ujianId: string;
  schoolId?: string;
  onExit?: () => void;
}

export const UjianSiswaView: React.FC<UjianSiswaViewProps> = ({ ujianId, schoolId, onExit }) => {
  const [ujian, setUjian] = useState<UjianOnline | null>(null);
  const [allStudents, setAllStudents] = useState<Siswa[]>(() => db.getSiswa());
  const [loading, setLoading] = useState<boolean>(true);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  // Student Identity verification state
  const [selectedSiswa, setSelectedSiswa] = useState<Siswa | null>(null);
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [tokenInput, setTokenInput] = useState<string>('');
  const [tokenError, setTokenError] = useState<string | null>(null);
  const [hasStarted, setHasStarted] = useState<boolean>(false);

  // Exam taking state
  const [activeQuestionIndex, setActiveQuestionIndex] = useState<number>(0);
  const [answers, setAnswers] = useState<{ [soalId: string]: { jawabanDipilih: string; raguRagu?: boolean } }>({});
  const [timeLeftSeconds, setTimeLeftSeconds] = useState<number>(0);
  const [isSubmitting, setIsSubmitting] = useState<boolean>(false);
  const [isSubmitted, setIsSubmitted] = useState<boolean>(false);
  const [submissionResult, setSubmissionResult] = useState<JawabanSiswaUjian | null>(null);
  const [showConfirmModal, setShowConfirmModal] = useState<boolean>(false);
  const [zoomImage, setZoomImage] = useState<string | null>(null);
  const [saveStatus, setSaveStatus] = useState<'tersimpan' | 'menyimpan' | 'offline'>('tersimpan');

  // Mobile Question Navigation Drawer
  const [showMobileNav, setShowMobileNav] = useState<boolean>(false);

  // Dual mode view (if document preview available)
  const [viewMode, setViewMode] = useState<'soal' | 'dokumen'>('soal');

  // Proctoring & Anti-Curang State
  const [violationsCount, setViolationsCount] = useState<number>(0);
  const [showViolationModal, setShowViolationModal] = useState<boolean>(false);
  const [latestViolationMsg, setLatestViolationMsg] = useState<string>('');
  const [isSessionLocked, setIsSessionLocked] = useState<boolean>(false);
  const [lockReason, setLockReason] = useState<string>('');
  const [isFullscreen, setIsFullscreen] = useState<boolean>(false);
  const blurTimeRef = useRef<number | null>(null);
  const maxAllowedViolations = ujian?.maksimalPelanggaran || 3;

  // Load exam and check eligibility asynchronously with cloud fallback
  useEffect(() => {
    let isMounted = true;

    const loadExamAsync = async () => {
      setLoading(true);
      setErrorMsg(null);

      try {
        // Extract schoolId from props, or window.location search/hash
        let effectiveSchoolId = schoolId;
        if (!effectiveSchoolId && typeof window !== 'undefined') {
          const sp = new URLSearchParams(window.location.search);
          effectiveSchoolId = sp.get('school') || sp.get('schoolId') || undefined;
          if (!effectiveSchoolId && window.location.hash.includes('?')) {
            const hashQ = window.location.hash.split('?')[1];
            const hp = new URLSearchParams(hashQ);
            effectiveSchoolId = hp.get('school') || hp.get('schoolId') || undefined;
          }
        }

        const exam = await db.getUjianOnlineByIdAsync(ujianId, effectiveSchoolId);
        if (!isMounted) return;

        if (!exam) {
          setErrorMsg('Akses Ujian Belum Tersedia. Ujian tidak ditemukan atau tautan ujian sudah tidak aktif.');
          setLoading(false);
          return;
        }

        setUjian(exam);

        // Fetch student roster for this exam's school
        const roster = await db.getSiswaForUjianAsync(exam);
        if (isMounted && roster && roster.length > 0) {
          setAllStudents(roster);
        }

        // Check date bounds
        const now = new Date();
        if (exam.tanggalMulai && new Date(exam.tanggalMulai) > now) {
          setErrorMsg(
            `Ujian belum dimulai. Jadwal pelaksanaan ujian: ${new Date(exam.tanggalMulai).toLocaleString('id-ID', {
              dateStyle: 'full',
              timeStyle: 'short',
            })}.`
          );
        } else if (exam.tanggalSelesai && new Date(exam.tanggalSelesai) < now) {
          setErrorMsg(
            `Masa pengerjaan ujian telah berakhir pada ${new Date(exam.tanggalSelesai).toLocaleString('id-ID', {
              dateStyle: 'full',
              timeStyle: 'short',
            })}.`
          );
        } else if (exam.status === 'diarsipkan' || exam.status === 'draf') {
          setErrorMsg('Ujian ini saat ini belum dibuka untuk peserta didik.');
        }
      } catch (err) {
        console.error('Error loading exam async:', err);
        if (isMounted) {
          setErrorMsg('Gagal memuat naskah ujian. Silakan periksa koneksi internet Anda dan muat ulang halaman.');
        }
      } finally {
        if (isMounted) {
          setLoading(false);
        }
      }
    };

    loadExamAsync();

    return () => {
      isMounted = false;
    };
  }, [ujianId, schoolId]);

  // Filter students matching the exam's target classes
  const eligibleSiswaList = useMemo(() => {
    if (!ujian) return [];
    const targets = ujian.kelasTarget || [];
    if (targets.length === 0 || targets.includes('Semua Siswa')) {
      return allStudents;
    }
    return allStudents.filter((s) =>
      targets.some((t) => s.kelas.toLowerCase().includes(t.toLowerCase()) || t.toLowerCase().includes(s.kelas.toLowerCase()))
    );
  }, [ujian, allStudents]);

  const filteredStudents = useMemo(() => {
    if (!searchQuery.trim()) return eligibleSiswaList;
    const q = searchQuery.toLowerCase();
    return eligibleSiswaList.filter(
      (s) =>
        (s.namaLengkap || (s as any).nama || '').toLowerCase().includes(q) ||
        (s.nisn && s.nisn.includes(q)) ||
        (s.nomorInduk && s.nomorInduk.includes(q))
    );
  }, [eligibleSiswaList, searchQuery]);

  // Prepared questions list
  const preparedQuestions = useMemo(() => {
    if (!ujian) return [];
    return [...ujian.soalList];
  }, [ujian]);

  // Countdown timer
  useEffect(() => {
    if (!hasStarted || isSubmitted || timeLeftSeconds <= 0 || isSessionLocked) return;

    const interval = setInterval(() => {
      setTimeLeftSeconds((prev) => {
        if (prev <= 1) {
          clearInterval(interval);
          handleAutoSubmit('Waktu ujian telah berakhir.');
          return 0;
        }
        return prev - 1;
      });
    }, 1000);

    return () => clearInterval(interval);
  }, [hasStarted, isSubmitted, timeLeftSeconds, isSessionLocked]);

  // Realtime session polling & unlock listener
  useEffect(() => {
    if (!hasStarted || !ujian || !selectedSiswa || isSubmitted) return;

    const checkTeacherUnlock = async () => {
      const currentSession = db.getJawabanSiswaByUjian(ujian.id, selectedSiswa.id);
      if (currentSession) {
        if (currentSession.status === 'terkunci') {
          setIsSessionLocked(true);
          setLockReason(
            currentSession.alasanTerkunci ||
              'Ujian dikunci sementara karena terdeteksi akses dari perangkat atau sesi lain. Silakan hubungi guru pengawas.'
          );
        } else if (currentSession.status === 'sedang_mengerjakan' && isSessionLocked) {
          // Teacher unlocked the session!
          setIsSessionLocked(false);
          setLockReason('');
          setShowViolationModal(false);
        }

        if (currentSession.jumlahPelanggaran !== undefined) {
          setViolationsCount(currentSession.jumlahPelanggaran);
        }
      }

      // Query server heartbeat for multi-device detection & remote locks
      try {
        const storedToken = localStorage.getItem(`portal_exam_token_${ujian.id}_${selectedSiswa.id}`);
        const res = await fetch('/api/ujian/session/heartbeat', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            ujianId: ujian.id,
            siswaId: selectedSiswa.id,
            sessionToken: storedToken || undefined,
            deviceId: getOrCreateDeviceId(),
          }),
        });
        if (res.ok) {
          const data = await res.json();
          if (data.isLocked || data.status === 'terkunci') {
            setIsSessionLocked(true);
            setLockReason(
              data.alasanTerkunci ||
                'Ujian dikunci sementara karena terdeteksi akses dari perangkat atau sesi lain. Silakan hubungi guru pengawas.'
            );
          } else if (data.status === 'sedang_mengerjakan' && isSessionLocked) {
            setIsSessionLocked(false);
            setLockReason('');
            setShowViolationModal(false);
          }
        }
      } catch {
        // network resilience
      }
    };

    const interval = setInterval(checkTeacherUnlock, 3000);
    window.addEventListener('jawaban_ujian_updated', checkTeacherUnlock);

    return () => {
      clearInterval(interval);
      window.removeEventListener('jawaban_ujian_updated', checkTeacherUnlock);
    };
  }, [hasStarted, ujian, selectedSiswa, isSubmitted, isSessionLocked]);

  // Proctoring: Tab Switching, Blur, and Fullscreen Tracking
  useEffect(() => {
    if (!hasStarted || isSubmitted || !ujian || !selectedSiswa) return;
    if (ujian.pengawasanAktif === false) return;

    // Track tab switch via visibilitychange
    const handleVisibilityChange = () => {
      if (document.hidden) {
        blurTimeRef.current = Date.now();
      } else {
        if (blurTimeRef.current) {
          const durationSecs = Math.round((Date.now() - blurTimeRef.current) / 1000);
          blurTimeRef.current = null;
          recordViolation(
            'pindah_tab',
            `Berpindah tab atau membuka aplikasi lain selama ${durationSecs} detik`,
            durationSecs
          );
        }
      }
    };

    // Track window blur
    const handleWindowBlur = () => {
      if (!blurTimeRef.current) {
        blurTimeRef.current = Date.now();
      }
    };

    const handleWindowFocus = () => {
      if (blurTimeRef.current) {
        const durationSecs = Math.round((Date.now() - blurTimeRef.current) / 1000);
        blurTimeRef.current = null;
        if (durationSecs >= 1) {
          recordViolation(
            'jendela_blur',
            `Meninggalkan jendela ujian atau membuka jendela lain selama ${durationSecs} detik`,
            durationSecs
          );
        }
      }
    };

    // Track Fullscreen exit
    const handleFullscreenChange = () => {
      const isCurrentlyFullscreen = !!document.fullscreenElement;
      setIsFullscreen(isCurrentlyFullscreen);
      if (ujian.wajibFullscreen !== false && !isCurrentlyFullscreen && !isSessionLocked) {
        recordViolation(
          'keluar_fullscreen',
          'Keluar dari mode layar penuh (fullscreen) saat ujian berlangsung',
          0
        );
      }
    };

    // Block Copy-Paste & Right Click
    const handleCopy = (e: ClipboardEvent) => {
      if (ujian.blokirCopyPaste !== false) {
        e.preventDefault();
        recordViolation('copy_paste', 'Percobaan menyalin (copy) teks soal ujian', 0);
      }
    };

    const handleCut = (e: ClipboardEvent) => {
      if (ujian.blokirCopyPaste !== false) {
        e.preventDefault();
      }
    };

    const handlePaste = (e: ClipboardEvent) => {
      if (ujian.blokirCopyPaste !== false) {
        e.preventDefault();
        recordViolation('copy_paste', 'Percobaan menempelkan (paste) teks dari luar', 0);
      }
    };

    const handleContextMenu = (e: MouseEvent) => {
      if (ujian.blokirCopyPaste !== false) {
        e.preventDefault();
      }
    };

    document.addEventListener('visibilitychange', handleVisibilityChange);
    window.addEventListener('blur', handleWindowBlur);
    window.addEventListener('focus', handleWindowFocus);
    document.addEventListener('fullscreenchange', handleFullscreenChange);
    document.addEventListener('copy', handleCopy);
    document.addEventListener('cut', handleCut);
    document.addEventListener('paste', handlePaste);
    document.addEventListener('contextmenu', handleContextMenu);

    return () => {
      document.removeEventListener('visibilitychange', handleVisibilityChange);
      window.removeEventListener('blur', handleWindowBlur);
      window.removeEventListener('focus', handleWindowFocus);
      document.removeEventListener('fullscreenchange', handleFullscreenChange);
      document.removeEventListener('copy', handleCopy);
      document.removeEventListener('cut', handleCut);
      document.removeEventListener('paste', handlePaste);
      document.removeEventListener('contextmenu', handleContextMenu);
    };
  }, [hasStarted, isSubmitted, ujian, selectedSiswa, isSessionLocked]);

  // Record proctoring violation and trigger lock if needed
  const recordViolation = (
    jenis: LogPelanggaranUjian['jenis'],
    deskripsi: string,
    durasiKeluarDetik: number = 0
  ) => {
    if (!ujian || !selectedSiswa || isSubmitted || isSessionLocked) return;

    try {
      const updated = db.catatPelanggaranSiswa(
        ujian.id,
        selectedSiswa.id,
        {
          jenis,
          deskripsi,
          durasiKeluarDetik,
        },
        ujian.maksimalPelanggaran || 3
      );

      const count = updated.jumlahPelanggaran || 0;
      setViolationsCount(count);
      setLatestViolationMsg(deskripsi);

      if (updated.status === 'terkunci') {
        setIsSessionLocked(true);
        setLockReason(updated.alasanTerkunci || 'Melebihi batas toleransi pelanggaran');
        setShowViolationModal(false);
      } else {
        setShowViolationModal(true);
      }
    } catch (e) {
      console.error('Gagal mencatat pelanggaran:', e);
    }
  };

  // Auto-save changes locally and sync with server
  const saveTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const handleAnswerSelect = (soalId: string, value: string) => {
    if (isSessionLocked) return;
    setSaveStatus('menyimpan');
    setAnswers((prev) => {
      const updated = {
        ...prev,
        [soalId]: {
          ...prev[soalId],
          jawabanDipilih: value,
        },
      };

      if (saveTimeoutRef.current) clearTimeout(saveTimeoutRef.current);
      saveTimeoutRef.current = setTimeout(() => {
        try {
          if (ujian && selectedSiswa) {
            localStorage.setItem(`draft_ujian_${ujian.id}_${selectedSiswa.id}`, JSON.stringify(updated));
            // Update session active timestamp locally
            const currentSession = db.getJawabanSiswaByUjian(ujian.id, selectedSiswa.id);
            if (currentSession && currentSession.status === 'sedang_mengerjakan') {
              db.saveJawabanSiswaUjian({
                ...currentSession,
                terakhirAktif: new Date().toISOString(),
              });
            }

            // Sync answer with server endpoint (strictly rejected if locked on server)
            const token = localStorage.getItem(`portal_exam_token_${ujian.id}_${selectedSiswa.id}`) || undefined;
            fetch('/api/ujian/session/save-answer', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({
                ujianId: ujian.id,
                siswaId: selectedSiswa.id,
                sessionToken: token,
                deviceId: getOrCreateDeviceId(),
                soalId,
                jawaban: { jawabanDipilih: value },
                allAnswers: updated,
              }),
            })
              .then(async (res) => {
                if (res.status === 403) {
                  const data = await res.json();
                  if (data.locked) {
                    setIsSessionLocked(true);
                    setLockReason(
                      data.message ||
                        'Ujian dikunci sementara karena terdeteksi akses dari perangkat atau sesi lain. Silakan hubungi guru pengawas.'
                    );
                  }
                }
              })
              .catch(() => {});
          }
          setSaveStatus('tersimpan');
        } catch {
          setSaveStatus('offline');
        }
      }, 400);

      return updated;
    });
  };

  const handleToggleRagu = (soalId: string) => {
    if (isSessionLocked) return;
    setAnswers((prev) => ({
      ...prev,
      [soalId]: {
        ...prev[soalId],
        jawabanDipilih: prev[soalId]?.jawabanDipilih || '',
        raguRagu: !prev[soalId]?.raguRagu,
      },
    }));
  };

  const requestFullscreen = () => {
    try {
      if (document.documentElement.requestFullscreen) {
        document.documentElement.requestFullscreen().catch(() => {});
      }
    } catch {}
  };

  const handleStartExam = async () => {
    if (!ujian || !selectedSiswa) return;

    // Check token if required
    if (ujian.kodeUjian && ujian.kodeUjian.trim()) {
      if (!tokenInput || tokenInput.trim().toUpperCase() !== ujian.kodeUjian.trim().toUpperCase()) {
        setTokenError('Kode ujian (PIN) yang Anda masukkan tidak cocok.');
        return;
      }
    }

    // Check if student has already completed the exam
    const existing = db.getJawabanSiswaByUjian(ujian.id, selectedSiswa.id);
    if (existing && (existing.status === 'selesai' || existing.status === 'waktu_habis')) {
      if ((ujian.jumlahPercobaan || 1) <= 1) {
        setSubmissionResult(existing);
        setIsSubmitted(true);
        setHasStarted(true);
        return;
      }
    }

    // Check if locked locally
    if (existing && existing.status === 'terkunci') {
      setIsSessionLocked(true);
      setLockReason(
        existing.alasanTerkunci ||
          'Ujian dikunci sementara karena terdeteksi akses dari perangkat atau sesi lain. Silakan hubungi guru pengawas.'
      );
      setViolationsCount(existing.jumlahPelanggaran || 0);
      setHasStarted(true);
      return;
    }

    // Recover draft if previously started locally
    try {
      const savedDraft = localStorage.getItem(`draft_ujian_${ujian.id}_${selectedSiswa.id}`);
      if (savedDraft) {
        setAnswers(JSON.parse(savedDraft));
      }
    } catch {}

    // SERVER-AUTHORITATIVE SESSION VERIFICATION & MULTI-DEVICE DETECTION
    const device = collectDeviceInfo();
    const storedToken = localStorage.getItem(`portal_exam_token_${ujian.id}_${selectedSiswa.id}`) || undefined;

    try {
      const res = await fetch('/api/ujian/session/start', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ujianId: ujian.id,
          siswaId: selectedSiswa.id,
          namaSiswa: selectedSiswa.namaLengkap || (selectedSiswa as any).nama || '',
          nisn: selectedSiswa.nisn,
          nomorInduk: selectedSiswa.nomorInduk || (selectedSiswa as any).nis || '',
          kelas: selectedSiswa.kelas,
          schoolId: ujian.schoolId,
          device,
          sessionToken: storedToken,
        }),
      });

      const serverData = await res.json();

      // Case: Server detected multi-device access or previous lock!
      if (serverData.locked || res.status === 403) {
        setIsSessionLocked(true);
        setLockReason(
          serverData.message ||
            serverData.alasanTerkunci ||
            'Ujian dikunci sementara karena terdeteksi akses dari perangkat atau sesi lain. Silakan hubungi guru pengawas.'
        );
        if (serverData.answers && Object.keys(serverData.answers).length > 0) {
          setAnswers(serverData.answers);
        }
        setHasStarted(true);
        return;
      }

      if (serverData.finished) {
        setIsSubmitted(true);
        setHasStarted(true);
        return;
      }

      if (serverData.success && serverData.sessionToken) {
        localStorage.setItem(`portal_exam_token_${ujian.id}_${selectedSiswa.id}`, serverData.sessionToken);
        if (serverData.answers && Object.keys(serverData.answers).length > 0) {
          setAnswers((prev) => ({ ...prev, ...serverData.answers }));
        }
      }
    } catch (err) {
      console.warn('Verifikasi server session offline/transient:', err);
    }

    // Register active session in local database & sync
    const now = new Date().toISOString();
    const initSession: JawabanSiswaUjian = existing
      ? {
          ...existing,
          status: 'sedang_mengerjakan',
          deviceInfo: device,
          terakhirAktif: now,
          updatedAt: now,
        }
      : {
          id: `ans-${ujian.id}-${selectedSiswa.id}`,
          schoolId: ujian.schoolId,
          ujianId: ujian.id,
          siswaId: selectedSiswa.id,
          namaSiswa: selectedSiswa.namaLengkap || (selectedSiswa as any).nama || '',
          nisn: selectedSiswa.nisn,
          nomorInduk: selectedSiswa.nomorInduk || (selectedSiswa as any).nis || '',
          kelas: selectedSiswa.kelas,
          jawaban: {},
          waktuMulai: now,
          status: 'sedang_mengerjakan',
          deviceInfo: device,
          jumlahPelanggaran: 0,
          logPelanggaran: [],
          terakhirAktif: now,
          createdAt: now,
          updatedAt: now,
        };
    db.saveJawabanSiswaUjian(initSession);

    const totalDurationSeconds = (ujian.durasiMenit || 60) * 60;
    setTimeLeftSeconds(totalDurationSeconds);
    setHasStarted(true);
    setTokenError(null);

    // Request fullscreen if configured
    if (ujian.wajibFullscreen !== false) {
      requestFullscreen();
    }
  };

  const handleAutoSubmit = (reason?: string) => {
    handleSubmitExam(true, reason);
  };

  const handleSubmitExam = (isTimeOut = false, note?: string) => {
    if (!ujian || !selectedSiswa || isSubmitting) return;

    setIsSubmitting(true);
    setShowConfirmModal(false);

    try {
      // Calculate scores
      const grading = db.gradeJawabanSiswa(ujian, answers);

      const existing = db.getJawabanSiswaByUjian(ujian.id, selectedSiswa.id);
      const now = new Date().toISOString();
      const jawabanSiswaRecord: JawabanSiswaUjian = {
        id: existing?.id || `ans-${ujian.id}-${selectedSiswa.id}`,
        schoolId: ujian.schoolId,
        ujianId: ujian.id,
        siswaId: selectedSiswa.id,
        namaSiswa: selectedSiswa.namaLengkap || (selectedSiswa as any).nama || '',
        nisn: selectedSiswa.nisn,
        nomorInduk: selectedSiswa.nomorInduk || (selectedSiswa as any).nis || '',
        kelas: selectedSiswa.kelas,
        jawaban: grading.detailWithScores,
        waktuMulai: existing?.waktuMulai || now,
        waktuSelesai: now,
        durasiDetik: (ujian.durasiMenit || 60) * 60 - timeLeftSeconds,
        status: isTimeOut ? 'waktu_habis' : 'selesai',
        nilaiAkhir: grading.nilaiAkhir,
        jumlahBenar: grading.jumlahBenar,
        jumlahSalah: grading.jumlahSalah,
        jumlahKosong: grading.jumlahKosong,
        lulusKkm: grading.lulusKkm,
        adaEsaiBelumDinilai: grading.adaEsaiBelumDinilai,
        jumlahPelanggaran: violationsCount,
        logPelanggaran: existing?.logPelanggaran || [],
        terkunciOlehSistem: false,
        catatanGuru: note || undefined,
        createdAt: existing?.createdAt || now,
        updatedAt: now,
      };

      const saved = db.saveJawabanSiswaUjian(jawabanSiswaRecord);
      setSubmissionResult(saved);
      setIsSubmitted(true);

      // Clean local storage draft
      localStorage.removeItem(`draft_ujian_${ujian.id}_${selectedSiswa.id}`);

      // Exit fullscreen if active
      if (document.fullscreenElement) {
        document.exitFullscreen().catch(() => {});
      }
    } catch (err: any) {
      alert('Terjadi kendala saat menyimpan jawaban: ' + (err?.message || 'Silakan coba lagi'));
    } finally {
      setIsSubmitting(false);
    }
  };

  // Helper formatting timer MM:SS
  const formatTime = (secs: number) => {
    const m = Math.floor(secs / 60);
    const s = secs % 60;
    return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
  };

  // Stats on questions
  const answeredCount = useMemo(() => {
    return Object.values(answers).filter((a) => a?.jawabanDipilih && a.jawabanDipilih.trim() !== '').length;
  }, [answers]);

  const flaggedCount = useMemo(() => {
    return Object.values(answers).filter((a) => a?.raguRagu).length;
  }, [answers]);

  // Loading Screen
  if (loading) {
    return (
      <div className="min-h-screen bg-slate-900 flex items-center justify-center p-4">
        <div className="bg-slate-800 border border-slate-700 rounded-3xl p-8 max-w-md w-full text-center shadow-2xl">
          <div className="w-12 h-12 border-4 border-blue-500 border-t-transparent rounded-full animate-spin mx-auto mb-4" />
          <h2 className="text-xl font-bold text-white mb-2">Memuat Naskah Ujian...</h2>
          <p className="text-slate-400 text-sm">Menyiapkan butir soal dan data peserta ujian sekolah.</p>
        </div>
      </div>
    );
  }

  // Error Screen
  if (errorMsg || !ujian) {
    return (
      <div className="min-h-screen bg-slate-900 flex items-center justify-center p-4">
        <div className="bg-slate-800 border border-red-500/30 rounded-3xl p-8 max-w-md w-full text-center shadow-2xl">
          <div className="w-14 h-14 bg-red-500/10 border border-red-500/20 text-red-400 rounded-2xl flex items-center justify-center mx-auto mb-4">
            <AlertCircle className="w-8 h-8" />
          </div>
          <h2 className="text-xl font-bold text-white mb-2">Akses Ujian Belum Tersedia</h2>
          <p className="text-slate-300 text-sm mb-6 leading-relaxed">{errorMsg}</p>
          {onExit && (
            <button
              onClick={onExit}
              className="w-full bg-slate-700 hover:bg-slate-600 text-white font-semibold py-3 px-6 rounded-xl transition cursor-pointer"
            >
              Kembali ke Portal Sekolah
            </button>
          )}
        </div>
      </div>
    );
  }

  // 1. Identity Selection & Token Entry Screen (Before starting)
  if (!hasStarted) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-slate-950 via-slate-900 to-blue-950 text-slate-100 flex flex-col justify-between p-3.5 sm:p-6 md:p-8">
        <header className="max-w-3xl mx-auto w-full flex items-center justify-between py-2 border-b border-slate-800">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-blue-600 flex items-center justify-center font-bold text-white shadow-lg shadow-blue-500/20 shrink-0">
              <BookOpen className="w-5 h-5" />
            </div>
            <div>
              <span className="text-[10px] sm:text-xs uppercase tracking-wider text-blue-400 font-semibold">
                Portal CBT Satuan Pendidikan
              </span>
              <h1 className="text-sm sm:text-base font-bold text-white leading-tight">Ujian Online Siswa</h1>
            </div>
          </div>
          {onExit && (
            <button
              onClick={onExit}
              className="text-slate-400 hover:text-white p-2 rounded-xl hover:bg-slate-800 transition text-xs sm:text-sm flex items-center gap-1.5 cursor-pointer"
            >
              <ArrowLeft className="w-4 h-4" />
              <span className="hidden sm:inline">Kembali</span>
            </button>
          )}
        </header>

        <main className="max-w-3xl mx-auto w-full my-6">
          <div className="bg-slate-900/90 backdrop-blur-md border border-slate-800 rounded-3xl p-5 sm:p-8 shadow-2xl relative overflow-hidden">
            {/* Top decorative badge */}
            <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-blue-500/10 border border-blue-500/30 text-blue-400 text-xs font-semibold mb-3">
              <Sparkles className="w-3.5 h-3.5" />
              <span>{ujian.jenisUjian}</span>
            </div>

            <h2 className="text-xl sm:text-2xl md:text-3xl font-extrabold text-white tracking-tight mb-2">
              {ujian.judul}
            </h2>
            {ujian.deskripsi && (
              <p className="text-slate-300 text-xs sm:text-sm mb-5 leading-relaxed bg-slate-800/40 p-3 rounded-xl border border-slate-800">
                {ujian.deskripsi}
              </p>
            )}

            {/* Exam Details Badges */}
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5 mb-6">
              <div className="bg-slate-800/60 p-3 rounded-xl border border-slate-800 text-center">
                <span className="text-[10px] sm:text-[11px] text-slate-400 block font-medium">Mata Pelajaran</span>
                <span className="text-xs sm:text-sm font-bold text-white truncate block">{ujian.mataPelajaran}</span>
              </div>
              <div className="bg-slate-800/60 p-3 rounded-xl border border-slate-800 text-center">
                <span className="text-[10px] sm:text-[11px] text-slate-400 block font-medium">Kelas Sasaran</span>
                <span className="text-xs sm:text-sm font-bold text-white truncate block">
                  {ujian.kelasTarget.join(', ')}
                </span>
              </div>
              <div className="bg-slate-800/60 p-3 rounded-xl border border-slate-800 text-center">
                <span className="text-[10px] sm:text-[11px] text-slate-400 block font-medium">Jumlah Soal</span>
                <span className="text-xs sm:text-sm font-bold text-white block">{ujian.soalList.length} Butir</span>
              </div>
              <div className="bg-slate-800/60 p-3 rounded-xl border border-slate-800 text-center">
                <span className="text-[10px] sm:text-[11px] text-slate-400 block font-medium">Durasi Ujian</span>
                <span className="text-xs sm:text-sm font-bold text-amber-400 block">{ujian.durasiMenit} Menit</span>
              </div>
            </div>

            {/* Step 1: Select Student Identity from School Database */}
            <div className="mb-6">
              <label className="block text-xs sm:text-sm font-semibold text-slate-200 mb-2 flex items-center justify-between">
                <span>Pilih Identitas Siswa Anda:</span>
                <span className="text-[11px] text-blue-400 font-normal">Data Dapodik Sekolah</span>
              </label>

              {eligibleSiswaList.length === 0 ? (
                <div className="p-4 bg-amber-500/10 border border-amber-500/20 text-amber-300 rounded-xl text-xs">
                  Peringatan: Belum ada data siswa yang terdaftar di kelas sasaran ({ujian.kelasTarget.join(', ')}). Silakan hubungi guru atau administrator sekolah.
                </div>
              ) : (
                <div className="space-y-2">
                  <input
                    type="text"
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    placeholder="🔍 Ketik nama siswa atau NISN untuk mencari..."
                    className="w-full bg-slate-800/80 border border-slate-700 text-white px-3.5 py-2.5 rounded-xl text-xs sm:text-sm focus:outline-hidden focus:ring-2 focus:ring-blue-500 placeholder-slate-500"
                  />

                  <div className="max-h-48 overflow-y-auto space-y-1.5 p-1 bg-slate-950/50 rounded-xl border border-slate-800/80">
                    {filteredStudents.length === 0 ? (
                      <div className="p-4 text-center text-xs text-slate-500">
                        Tidak ada siswa yang cocok dengan pencarian "{searchQuery}".
                      </div>
                    ) : (
                      filteredStudents.map((siswa) => {
                        const isSelected = selectedSiswa?.id === siswa.id;
                        return (
                          <button
                            key={siswa.id}
                            type="button"
                            onClick={() => {
                              setSelectedSiswa(siswa);
                              setTokenError(null);
                            }}
                            className={`w-full text-left p-3 rounded-xl border transition flex items-center justify-between cursor-pointer ${
                              isSelected
                                ? 'bg-blue-600/20 border-blue-500 text-white shadow-xs'
                                : 'bg-slate-800/40 border-slate-800 hover:bg-slate-800/80 text-slate-300'
                            }`}
                          >
                            <div className="flex items-center gap-3 truncate">
                              <div
                                className={`w-8 h-8 rounded-lg flex items-center justify-center font-bold text-xs shrink-0 ${
                                  isSelected ? 'bg-blue-600 text-white' : 'bg-slate-700 text-slate-300'
                                }`}
                              >
                                {(siswa.namaLengkap || (siswa as any).nama || 'S').charAt(0)}
                              </div>
                              <div className="truncate">
                                <div className="font-semibold text-xs sm:text-sm truncate text-white">
                                  {siswa.namaLengkap || (siswa as any).nama}
                                </div>
                                <div className="text-[11px] text-slate-400">
                                  Kelas: {siswa.kelas} {siswa.nisn ? `• NISN: ${siswa.nisn}` : ''}
                                </div>
                              </div>
                            </div>
                            {isSelected && (
                              <div className="w-6 h-6 rounded-full bg-blue-500 text-white flex items-center justify-center shrink-0">
                                <Check className="w-3.5 h-3.5" />
                              </div>
                            )}
                          </button>
                        );
                      })
                    )}
                  </div>
                </div>
              )}
            </div>

            {/* Selected Student Confirmation Card */}
            {selectedSiswa && (
              <div className="p-3.5 sm:p-4 bg-gradient-to-r from-blue-950/40 to-indigo-950/40 border border-blue-500/30 rounded-2xl mb-6 flex items-center gap-3">
                <div className="w-11 h-11 rounded-xl bg-blue-600 text-white flex items-center justify-center font-bold text-base shadow-md shrink-0">
                  <User className="w-5 h-5" />
                </div>
                <div className="flex-1 min-w-0">
                  <span className="text-[10px] uppercase tracking-wider text-blue-400 font-bold block">
                    Peserta Ujian Terpilih
                  </span>
                  <div className="font-bold text-white text-sm sm:text-base truncate">
                    {selectedSiswa.namaLengkap || (selectedSiswa as any).nama}
                  </div>
                  <div className="text-xs text-slate-300 flex items-center gap-2">
                    <span>{selectedSiswa.kelas}</span>
                    <span>&bull;</span>
                    <span>NIS/NISN: {selectedSiswa.nisn || selectedSiswa.nomorInduk || '-'}</span>
                  </div>
                </div>
              </div>
            )}

            {/* Step 2: Exam PIN/Token if enforced */}
            {ujian.kodeUjian && ujian.kodeUjian.trim() !== '' && (
              <div className="mb-6">
                <label className="block text-xs sm:text-sm font-semibold text-slate-200 mb-2 flex items-center gap-2">
                  <Lock className="w-4 h-4 text-amber-400" />
                  <span>Kode Token / PIN Ujian (Diberikan oleh Guru Pengawas):</span>
                </label>
                <input
                  type="text"
                  value={tokenInput}
                  onChange={(e) => {
                    setTokenInput(e.target.value.toUpperCase());
                    setTokenError(null);
                  }}
                  placeholder="Masukkan Kode Ujian..."
                  className="w-full bg-slate-800 border border-slate-700 text-white px-4 py-3 rounded-xl text-base tracking-widest font-mono text-center font-bold uppercase focus:outline-hidden focus:ring-2 focus:ring-amber-500 placeholder-slate-600"
                />
                {tokenError && (
                  <p className="text-xs text-red-400 mt-2 flex items-center gap-1">
                    <AlertCircle className="w-3.5 h-3.5" />
                    <span>{tokenError}</span>
                  </p>
                )}
              </div>
            )}

            {/* Proctoring Warning Badge */}
            {ujian.pengawasanAktif !== false && (
              <div className="bg-amber-950/30 border border-amber-500/30 rounded-2xl p-4 mb-6 flex items-start gap-3 text-xs text-amber-200">
                <ShieldAlert className="w-5 h-5 text-amber-400 shrink-0 mt-0.5" />
                <div className="space-y-1">
                  <div className="font-bold text-amber-300">Pengawasan Ujian (Proctoring) Aktif:</div>
                  <div>
                    Sistem mendeteksi jika Anda berpindah tab, keluar jendela, atau membuka aplikasi lain. Toleransi pelanggaran maksimal{' '}
                    <strong>{maxAllowedViolations} kali</strong>. Melebihi batas akan menyebabkan sesi ujian otomatis dikunci.
                  </div>
                </div>
              </div>
            )}

            {/* Rules reminder */}
            <div className="bg-slate-950/60 p-4 rounded-xl border border-slate-800 text-xs text-slate-400 space-y-1.5 mb-6">
              <div className="font-semibold text-slate-300">Tata Tertib Pengerjaan:</div>
              <div>&bull; Waktu otomatis berjalan setelah tombol Mulai ditekan.</div>
              <div>&bull; Jawaban tersimpan otomatis dan berkala ke server sekolah.</div>
              <div>&bull; Tombol Selesai tersedia setelah memeriksa seluruh butir pertanyaan.</div>
            </div>

            {/* Start Button */}
            <button
              onClick={handleStartExam}
              disabled={!selectedSiswa}
              className={`w-full py-4 rounded-2xl font-bold text-sm sm:text-base transition flex items-center justify-center gap-2 shadow-xl cursor-pointer ${
                selectedSiswa
                  ? 'bg-blue-600 hover:bg-blue-500 text-white shadow-blue-500/25'
                  : 'bg-slate-800 text-slate-500 cursor-not-allowed border border-slate-800'
              }`}
            >
              <span>Mulai Kerjakan Ujian Sekarang</span>
              <ChevronRight className="w-5 h-5" />
            </button>
          </div>
        </main>

        <footer className="text-center text-xs text-slate-500 py-3">
          Sistem Ujian Online Terintegrasi &bull; Portal Satuan Pendidikan Digital
        </footer>
      </div>
    );
  }

  // 2. Exam Completed / Score Display Screen
  if (isSubmitted) {
    const isLulus = submissionResult?.lulusKkm;
    const canViewScore = ujian.tampilkanNilaiLangsung;
    const canViewExplanation =
      ujian.tampilkanPembahasan === 'setelah_ujian' ||
      (ujian.tampilkanPembahasan === 'setelah_jadwal_selesai' &&
        ujian.tanggalSelesai &&
        new Date(ujian.tanggalSelesai) < new Date());

    return (
      <div className="min-h-screen bg-slate-950 text-slate-100 flex items-center justify-center p-3.5 sm:p-6">
        <div className="bg-slate-900 border border-slate-800 rounded-3xl p-5 sm:p-8 max-w-xl w-full shadow-2xl text-center">
          <div className="w-16 h-16 bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 rounded-2xl flex items-center justify-center mx-auto mb-4">
            <CheckCircle2 className="w-10 h-10" />
          </div>

          <h2 className="text-xl sm:text-2xl md:text-3xl font-extrabold text-white mb-1">
            Ujian Berhasil Diselesaikan!
          </h2>
          <p className="text-slate-400 text-xs sm:text-sm mb-6">
            Seluruh jawaban lembar ujian Anda telah tersimpan secara permanen di server sekolah.
          </p>

          {/* Student Identity Card */}
          <div className="bg-slate-800/60 p-4 rounded-2xl border border-slate-800 text-left mb-6">
            <div className="text-[11px] text-slate-400">Identitas Peserta Ujian:</div>
            <div className="font-bold text-white text-base">
              {selectedSiswa?.namaLengkap || (selectedSiswa as any)?.nama}
            </div>
            <div className="text-xs text-slate-400">
              {selectedSiswa?.kelas} &bull; NISN: {selectedSiswa?.nisn || '-'}
            </div>
            <div className="text-xs text-slate-400 mt-2 pt-2 border-t border-slate-700/60 flex items-center justify-between">
              <span>Waktu Selesai:</span>
              <span className="font-semibold text-slate-200">
                {new Date().toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit' })} WIB
              </span>
            </div>
            {submissionResult?.jumlahPelanggaran && submissionResult.jumlahPelanggaran > 0 ? (
              <div className="text-xs text-amber-300 mt-1 flex items-center gap-1.5">
                <AlertTriangle className="w-3.5 h-3.5 text-amber-400" />
                <span>Tercatat {submissionResult.jumlahPelanggaran} kali berpindah tab selama ujian</span>
              </div>
            ) : null}
          </div>

          {/* Score Card if teacher allowed immediate score */}
          {canViewScore && submissionResult ? (
            <div
              className={`p-5 sm:p-6 rounded-2xl border mb-6 text-center ${
                isLulus
                  ? 'bg-emerald-950/30 border-emerald-500/40'
                  : 'bg-amber-950/30 border-amber-500/40'
              }`}
            >
              <span className="text-[10px] sm:text-xs uppercase tracking-widest font-semibold text-slate-300 block mb-1">
                Nilai Akhir Ujian Anda
              </span>
              <div
                className={`text-5xl sm:text-6xl font-black mb-2 ${
                  isLulus ? 'text-emerald-400' : 'text-amber-400'
                }`}
              >
                {submissionResult.nilaiAkhir ?? 0}
              </div>

              <div className="flex items-center justify-center gap-2 mb-4">
                <span
                  className={`px-3 py-1 rounded-full text-xs font-bold ${
                    isLulus
                      ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/30'
                      : 'bg-amber-500/20 text-amber-300 border border-amber-500/30'
                  }`}
                >
                  {isLulus ? '🎉 TUNTAS (Mencapai KKM)' : '⚠️ BELUM TUNTAS'}
                </span>
                <span className="text-xs text-slate-400">Batas KKM: {ujian.kkm || 75}</span>
              </div>

              {/* Breakdown stats */}
              <div className="grid grid-cols-3 gap-2 pt-4 border-t border-slate-800 text-xs">
                <div className="bg-slate-900/60 p-2.5 rounded-xl border border-slate-800">
                  <span className="text-emerald-400 font-bold text-lg block">{submissionResult.jumlahBenar || 0}</span>
                  <span className="text-slate-400 text-[10px] sm:text-[11px]">Jawaban Benar</span>
                </div>
                <div className="bg-slate-900/60 p-2.5 rounded-xl border border-slate-800">
                  <span className="text-red-400 font-bold text-lg block">{submissionResult.jumlahSalah || 0}</span>
                  <span className="text-slate-400 text-[10px] sm:text-[11px]">Jawaban Salah</span>
                </div>
                <div className="bg-slate-900/60 p-2.5 rounded-xl border border-slate-800">
                  <span className="text-slate-400 font-bold text-lg block">{submissionResult.jumlahKosong || 0}</span>
                  <span className="text-slate-400 text-[10px] sm:text-[11px]">Kosong / Lewat</span>
                </div>
              </div>

              {submissionResult.adaEsaiBelumDinilai && (
                <p className="text-xs text-blue-300 mt-3 bg-blue-950/40 p-2.5 rounded-lg border border-blue-500/20">
                  * Terdapat butir soal esai yang menunggu penilaian koreksi dari guru. Nilai akhir di atas adalah nilai sementara.
                </p>
              )}
            </div>
          ) : (
            <div className="p-6 bg-slate-800/40 border border-slate-800 rounded-2xl mb-6">
              <Award className="w-10 h-10 text-blue-400 mx-auto mb-2" />
              <div className="font-semibold text-white text-sm mb-1">Nilai Disimpan Secara Aman</div>
              <p className="text-xs text-slate-400">
                Sesuai pengaturan guru pengampu, rekapitulasi nilai ujian akan diumumkan secara serentak setelah masa ujian berakhir.
              </p>
            </div>
          )}

          {/* Review Question Explanations if allowed */}
          {canViewExplanation && (
            <div className="mb-6 text-left">
              <h3 className="font-bold text-white text-sm mb-3 flex items-center gap-2">
                <HelpCircle className="w-4 h-4 text-blue-400" />
                <span>Pembahasan Butir Soal</span>
              </h3>
              <div className="max-h-60 overflow-y-auto space-y-3 pr-1">
                {ujian.soalList.map((soal) => {
                  const studentAns = submissionResult?.jawaban[soal.id]?.jawabanDipilih || '-';
                  const isBenar = submissionResult?.jawaban[soal.id]?.isBenar;
                  return (
                    <div key={soal.id} className="p-3 bg-slate-800/60 rounded-xl border border-slate-800 text-xs">
                      <div className="flex items-center justify-between mb-1">
                        <span className="font-bold text-slate-300">Soal #{soal.nomor}</span>
                        <span
                          className={`font-semibold px-2 py-0.5 rounded-md text-[10px] ${
                            isBenar ? 'bg-emerald-500/20 text-emerald-300' : 'bg-red-500/20 text-red-300'
                          }`}
                        >
                          {isBenar ? 'Benar' : 'Salah'}
                        </span>
                      </div>
                      <p className="text-slate-200 mb-2">{soal.pertanyaan}</p>
                      <div className="text-[11px] text-slate-400 space-y-0.5">
                        <div>
                          Jawaban Anda: <strong className="text-white">{studentAns}</strong>
                        </div>
                        <div>
                          Kunci Jawaban: <strong className="text-emerald-400">{soal.kunciJawaban}</strong>
                        </div>
                        {soal.pembahasan && (
                          <div className="mt-1 pt-1 border-t border-slate-700/60 text-slate-300 italic">
                            Pembahasan: {soal.pembahasan}
                          </div>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          <div className="space-y-3">
            {onExit ? (
              <button
                onClick={onExit}
                className="w-full bg-blue-600 hover:bg-blue-500 text-white font-bold py-3.5 px-6 rounded-2xl transition shadow-lg shadow-blue-500/20 cursor-pointer"
              >
                Kembali ke Halaman Utama
              </button>
            ) : (
              <button
                onClick={() => window.location.reload()}
                className="w-full bg-slate-800 hover:bg-slate-700 text-white font-bold py-3 px-6 rounded-2xl transition cursor-pointer"
              >
                Tutup Halaman Ujian
              </button>
            )}
          </div>
        </div>
      </div>
    );
  }

  // 3. Active Exam View
  const currentQuestion: SoalUjian | undefined = preparedQuestions[activeQuestionIndex];
  const currentAnswer = currentQuestion ? answers[currentQuestion.id] : undefined;

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 flex flex-col antialiased relative">
      {/* Sticky Header (Responsive across 320px to 4K) */}
      <header className="sticky top-0 z-30 bg-slate-900/95 backdrop-blur-md border-b border-slate-800 px-3 sm:px-6 py-2.5 flex items-center justify-between shadow-md">
        <div className="flex items-center gap-2.5 min-w-0">
          <div className="w-8 h-8 rounded-lg bg-blue-600 flex items-center justify-center font-bold text-white text-xs shrink-0 shadow-sm">
            CBT
          </div>
          <div className="min-w-0">
            <h1 className="text-xs sm:text-sm font-bold text-white truncate max-w-[140px] sm:max-w-xs md:max-w-md">
              {ujian.judul}
            </h1>
            <div className="text-[10px] sm:text-[11px] text-slate-400 flex items-center gap-1.5 truncate">
              <span className="truncate">{selectedSiswa?.namaLengkap || (selectedSiswa as any)?.nama}</span>
              <span>&bull;</span>
              <span className="shrink-0">{selectedSiswa?.kelas}</span>
            </div>
          </div>
        </div>

        {/* Center / Right controls */}
        <div className="flex items-center gap-2 sm:gap-3">
          {/* Dual Mode Switch if document available */}
          {ujian.dokumenAsliUrl && (
            <div className="hidden sm:flex items-center bg-slate-800 p-0.5 rounded-lg border border-slate-700 text-xs">
              <button
                onClick={() => setViewMode('soal')}
                className={`px-2.5 py-1 rounded-md font-medium transition cursor-pointer ${
                  viewMode === 'soal' ? 'bg-blue-600 text-white shadow-xs' : 'text-slate-400 hover:text-white'
                }`}
              >
                Soal
              </button>
              <button
                onClick={() => setViewMode('dokumen')}
                className={`px-2.5 py-1 rounded-md font-medium transition cursor-pointer ${
                  viewMode === 'dokumen' ? 'bg-blue-600 text-white shadow-xs' : 'text-slate-400 hover:text-white'
                }`}
              >
                Dokumen
              </button>
            </div>
          )}

          {/* Fullscreen Button */}
          {ujian.wajibFullscreen !== false && !isFullscreen && (
            <button
              onClick={requestFullscreen}
              title="Masuk Mode Layar Penuh"
              className="hidden md:flex items-center gap-1 bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs px-2.5 py-1.5 rounded-xl border border-slate-700 cursor-pointer"
            >
              <Maximize2 className="w-3.5 h-3.5" />
              <span>Fullscreen</span>
            </button>
          )}

          {/* Save Status Badge (desktop) */}
          <div className="hidden lg:flex items-center gap-1.5 text-[11px] text-slate-400">
            {saveStatus === 'tersimpan' && (
              <>
                <Check className="w-3.5 h-3.5 text-emerald-400" />
                <span className="text-emerald-400">Tersimpan</span>
              </>
            )}
            {saveStatus === 'menyimpan' && (
              <>
                <div className="w-2.5 h-2.5 rounded-full border border-blue-400 border-t-transparent animate-spin" />
                <span className="text-blue-400">Menyimpan...</span>
              </>
            )}
            {saveStatus === 'offline' && <span className="text-amber-400">Draft Lokal</span>}
          </div>

          {/* Countdown Clock */}
          <div
            className={`flex items-center gap-1.5 px-2.5 sm:px-3 py-1.5 rounded-xl font-mono text-xs sm:text-sm font-bold border transition shrink-0 ${
              timeLeftSeconds < 300
                ? 'bg-red-500/20 text-red-400 border-red-500/40 animate-pulse'
                : 'bg-slate-800 text-amber-300 border-slate-700'
            }`}
          >
            <Clock className="w-3.5 h-3.5 sm:w-4 sm:h-4" />
            <span>{formatTime(timeLeftSeconds)}</span>
          </div>

          {/* Mobile Question Navigator Toggle Button */}
          <button
            onClick={() => setShowMobileNav(true)}
            className="lg:hidden bg-slate-800 hover:bg-slate-700 text-white text-xs px-2.5 py-1.5 rounded-xl border border-slate-700 flex items-center gap-1.5 cursor-pointer shrink-0"
          >
            <Layers className="w-3.5 h-3.5 text-blue-400" />
            <span>
              {answeredCount}/{preparedQuestions.length}
            </span>
          </button>

          {/* Submit button */}
          <button
            onClick={() => setShowConfirmModal(true)}
            className="bg-emerald-600 hover:bg-emerald-500 text-white font-bold text-xs sm:text-sm px-3 py-1.5 sm:py-2 rounded-xl transition shadow-lg shadow-emerald-600/20 flex items-center gap-1 cursor-pointer shrink-0"
          >
            <Send className="w-3.5 h-3.5" />
            <span className="hidden sm:inline">Kirim</span>
          </button>
        </div>
      </header>

      {/* Proctoring Warning Banner if violations detected */}
      {violationsCount > 0 && !isSessionLocked && (
        <div className="bg-amber-500/10 border-b border-amber-500/30 px-4 py-2 text-xs text-amber-300 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <AlertTriangle className="w-4 h-4 text-amber-400 shrink-0" />
            <span>
              Peringatan: Terdeteksi <strong>{violationsCount} kali</strong> berpindah tab/jendela. Batas toleransi:{' '}
              {maxAllowedViolations} kali.
            </span>
          </div>
          <span className="text-[11px] font-semibold text-amber-400">Tetap berada di halaman ujian!</span>
        </div>
      )}

      {/* Main Body Layout */}
      <div className="flex-1 flex flex-col lg:flex-row max-w-7xl mx-auto w-full p-3 sm:p-6 gap-5 sm:gap-6">
        {/* Left Column: Question Content or Document View */}
        <div className="flex-1 flex flex-col justify-between min-w-0">
          {viewMode === 'dokumen' && ujian.dokumenAsliUrl ? (
            <div className="bg-slate-900 border border-slate-800 rounded-3xl p-4 flex-1 flex flex-col shadow-xl">
              <div className="flex items-center justify-between mb-3 text-xs text-slate-400">
                <span>Tampilan Dokumen Asli ({ujian.dokumenAsliNama || 'Naskah Soal'})</span>
                <span className="text-blue-400 font-semibold">Navigasi nomor soal tersedia di panel</span>
              </div>
              <div className="flex-1 bg-slate-950 rounded-2xl overflow-hidden min-h-[450px] flex items-center justify-center border border-slate-800">
                <iframe src={ujian.dokumenAsliUrl} title="Dokumen Asli" className="w-full h-full min-h-[500px] border-0" />
              </div>
            </div>
          ) : currentQuestion ? (
            <div className="bg-slate-900 border border-slate-800 rounded-3xl p-4 sm:p-7 shadow-xl flex-1 flex flex-col justify-between min-w-0">
              <div>
                {/* Question Header */}
                <div className="flex items-center justify-between pb-3 sm:pb-4 border-b border-slate-800 mb-4 sm:mb-5">
                  <div className="flex items-center gap-2">
                    <span className="w-7 h-7 sm:w-8 sm:h-8 rounded-xl bg-blue-600 text-white font-extrabold flex items-center justify-center text-xs sm:text-sm shadow-md">
                      {currentQuestion.nomor}
                    </span>
                    <span className="text-[11px] sm:text-xs uppercase tracking-wider font-semibold text-slate-400">
                      Soal {currentQuestion.nomor} dari {preparedQuestions.length}
                    </span>
                    <span className="text-[10px] sm:text-[11px] bg-slate-800 text-slate-300 px-2 py-0.5 rounded-full border border-slate-700 capitalize">
                      {currentQuestion.tipe.replace('_', ' ')}
                    </span>
                  </div>
                  <div className="text-xs text-slate-400">
                    Bobot: <strong className="text-white">{currentQuestion.bobot || 1} Poin</strong>
                  </div>
                </div>

                {/* Question Image if present */}
                {currentQuestion.gambar && (
                  <div className="mb-4 sm:mb-5">
                    <div
                      onClick={() => setZoomImage(currentQuestion.gambar || null)}
                      className="group relative inline-block max-w-full rounded-2xl overflow-hidden border border-slate-700 bg-slate-950 cursor-zoom-in"
                    >
                      <img
                        src={currentQuestion.gambar}
                        alt={currentQuestion.gambarCaption || `Gambar Soal ${currentQuestion.nomor}`}
                        className="max-h-60 sm:max-h-72 w-auto max-w-full object-contain rounded-xl transition duration-200 group-hover:opacity-95"
                      />
                      <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 flex items-center justify-center transition text-white text-xs font-semibold gap-1.5">
                        <ZoomIn className="w-4 h-4" />
                        <span>Klik untuk perbesar gambar</span>
                      </div>
                    </div>
                    {currentQuestion.gambarCaption && (
                      <p className="text-xs text-slate-400 italic mt-1.5">{currentQuestion.gambarCaption}</p>
                    )}
                  </div>
                )}

                {/* Question Text with formula & table safety */}
                <div className="text-sm sm:text-base md:text-lg text-slate-100 font-medium leading-relaxed mb-6 whitespace-pre-wrap select-none break-words">
                  {currentQuestion.pertanyaan}
                </div>

                {/* Options / Answer Inputs */}
                {currentQuestion.tipe === 'pilihan_ganda' && currentQuestion.pilihan && (
                  <div className="space-y-2.5 sm:space-y-3">
                    {Object.entries(currentQuestion.pilihan).map(([key, label]) => {
                      const isSelected = currentAnswer?.jawabanDipilih === key;
                      return (
                        <button
                          key={key}
                          type="button"
                          disabled={isSessionLocked}
                          onClick={() => handleAnswerSelect(currentQuestion.id, key)}
                          className={`w-full text-left p-3.5 sm:p-4 rounded-2xl border transition flex items-center gap-3 sm:gap-3.5 cursor-pointer min-h-[48px] ${
                            isSelected
                              ? 'bg-blue-600/20 border-blue-500 text-white shadow-md shadow-blue-600/10'
                              : 'bg-slate-800/40 border-slate-800 hover:bg-slate-800/80 text-slate-200'
                          } ${isSessionLocked ? 'opacity-50 cursor-not-allowed' : ''}`}
                        >
                          <div
                            className={`w-8 h-8 sm:w-9 sm:h-9 rounded-xl flex items-center justify-center font-bold text-xs sm:text-sm transition shrink-0 ${
                              isSelected
                                ? 'bg-blue-600 text-white shadow-md'
                                : 'bg-slate-700 text-slate-300'
                            }`}
                          >
                            {key}
                          </div>
                          <div className="text-xs sm:text-sm md:text-base leading-snug break-words flex-1">
                            {label}
                          </div>
                        </button>
                      );
                    })}
                  </div>
                )}

                {currentQuestion.tipe === 'benar_salah' && (
                  <div className="grid grid-cols-2 gap-3 sm:gap-4">
                    {['Benar', 'Salah'].map((opt) => {
                      const isSelected = currentAnswer?.jawabanDipilih === opt;
                      return (
                        <button
                          key={opt}
                          type="button"
                          disabled={isSessionLocked}
                          onClick={() => handleAnswerSelect(currentQuestion.id, opt)}
                          className={`p-4 sm:p-6 rounded-2xl border font-bold text-sm sm:text-base transition text-center cursor-pointer min-h-[48px] ${
                            isSelected
                              ? opt === 'Benar'
                                ? 'bg-emerald-600/20 border-emerald-500 text-emerald-300'
                                : 'bg-red-600/20 border-red-500 text-red-300'
                              : 'bg-slate-800/40 border-slate-800 hover:bg-slate-800/80 text-slate-300'
                          } ${isSessionLocked ? 'opacity-50 cursor-not-allowed' : ''}`}
                        >
                          {opt}
                        </button>
                      );
                    })}
                  </div>
                )}

                {currentQuestion.tipe === 'isian' && (
                  <div className="space-y-2">
                    <label className="text-xs text-slate-400 font-medium">Tuliskan Jawaban Singkat Anda:</label>
                    <input
                      type="text"
                      disabled={isSessionLocked}
                      value={currentAnswer?.jawabanDipilih || ''}
                      onChange={(e) => handleAnswerSelect(currentQuestion.id, e.target.value)}
                      placeholder="Ketik jawaban di sini..."
                      className="w-full bg-slate-800 border border-slate-700 text-white px-4 py-3 rounded-xl text-sm sm:text-base focus:ring-2 focus:ring-blue-500 focus:outline-hidden"
                    />
                  </div>
                )}

                {currentQuestion.tipe === 'esai' && (
                  <div className="space-y-2">
                    <label className="text-xs text-slate-400 font-medium">Uraian Jawaban Esai:</label>
                    <textarea
                      rows={5}
                      disabled={isSessionLocked}
                      value={currentAnswer?.jawabanDipilih || ''}
                      onChange={(e) => handleAnswerSelect(currentQuestion.id, e.target.value)}
                      placeholder="Tuliskan uraian dan penjelasan lengkap Anda di sini..."
                      className="w-full bg-slate-800 border border-slate-700 text-white p-3.5 sm:p-4 rounded-xl text-xs sm:text-sm focus:ring-2 focus:ring-blue-500 focus:outline-hidden resize-none leading-relaxed"
                    />
                  </div>
                )}
              </div>

              {/* Navigation Controls */}
              <div className="pt-4 sm:pt-6 border-t border-slate-800 mt-5 sm:mt-6 flex items-center justify-between gap-2">
                <button
                  onClick={() => setActiveQuestionIndex((prev) => Math.max(0, prev - 1))}
                  disabled={activeQuestionIndex === 0 || isSessionLocked}
                  className={`px-3 sm:px-4 py-2.5 rounded-xl text-xs sm:text-sm font-semibold flex items-center gap-1 transition cursor-pointer min-h-[44px] ${
                    activeQuestionIndex === 0 || isSessionLocked
                      ? 'bg-slate-800/30 text-slate-600 cursor-not-allowed'
                      : 'bg-slate-800 hover:bg-slate-700 text-white'
                  }`}
                >
                  <ChevronLeft className="w-4 h-4" />
                  <span>Sebelumnya</span>
                </button>

                <button
                  type="button"
                  disabled={isSessionLocked}
                  onClick={() => handleToggleRagu(currentQuestion.id)}
                  className={`px-3 sm:px-4 py-2.5 rounded-xl text-xs sm:text-sm font-bold flex items-center gap-1.5 border transition cursor-pointer min-h-[44px] ${
                    currentAnswer?.raguRagu
                      ? 'bg-amber-500/20 text-amber-300 border-amber-500/40 shadow-xs'
                      : 'bg-slate-800 text-slate-400 border-slate-700 hover:text-white'
                  }`}
                >
                  <Flag className="w-4 h-4" />
                  <span className="hidden sm:inline">
                    {currentAnswer?.raguRagu ? 'Ditandai Ragu' : 'Tandai Ragu'}
                  </span>
                  <span className="sm:hidden">Ragu</span>
                </button>

                {activeQuestionIndex < preparedQuestions.length - 1 ? (
                  <button
                    onClick={() => setActiveQuestionIndex((prev) => Math.min(preparedQuestions.length - 1, prev + 1))}
                    disabled={isSessionLocked}
                    className="bg-blue-600 hover:bg-blue-500 text-white px-4 sm:px-5 py-2.5 rounded-xl text-xs sm:text-sm font-bold flex items-center gap-1.5 transition shadow-md shadow-blue-600/20 cursor-pointer min-h-[44px]"
                  >
                    <span>Berikutnya</span>
                    <ChevronRight className="w-4 h-4" />
                  </button>
                ) : (
                  <button
                    onClick={() => setShowConfirmModal(true)}
                    disabled={isSessionLocked}
                    className="bg-emerald-600 hover:bg-emerald-500 text-white px-4 sm:px-5 py-2.5 rounded-xl text-xs sm:text-sm font-bold flex items-center gap-1.5 transition shadow-md shadow-emerald-600/20 cursor-pointer min-h-[44px]"
                  >
                    <span>Selesai</span>
                    <Send className="w-4 h-4" />
                  </button>
                )}
              </div>
            </div>
          ) : (
            <div className="bg-slate-900 border border-slate-800 rounded-3xl p-8 text-center text-slate-400">
              Tidak ada soal yang tersedia.
            </div>
          )}
        </div>

        {/* Right Column: Question Navigator Palette (Desktop view) */}
        <aside className="hidden lg:flex w-80 bg-slate-900 border border-slate-800 rounded-3xl p-5 shadow-xl flex-col justify-between shrink-0">
          <div>
            <h3 className="text-sm font-bold text-white mb-3 flex items-center justify-between">
              <span>Navigasi Nomor Soal</span>
              <span className="text-xs text-slate-400 font-normal">
                {answeredCount}/{preparedQuestions.length} Terjawab
              </span>
            </h3>

            {/* Status Legend */}
            <div className="grid grid-cols-3 gap-1.5 text-[10px] mb-4 text-center">
              <div className="bg-emerald-500/10 border border-emerald-500/30 text-emerald-400 py-1 rounded-md font-semibold">
                Dijawab ({answeredCount})
              </div>
              <div className="bg-amber-500/10 border border-amber-500/30 text-amber-400 py-1 rounded-md font-semibold">
                Ragu ({flaggedCount})
              </div>
              <div className="bg-slate-800 border border-slate-700 text-slate-400 py-1 rounded-md font-semibold">
                Belum ({preparedQuestions.length - answeredCount})
              </div>
            </div>

            {/* Question Buttons Grid */}
            <div className="grid grid-cols-5 gap-2 max-h-80 overflow-y-auto p-1">
              {preparedQuestions.map((q, idx) => {
                const ans = answers[q.id];
                const isCurrent = idx === activeQuestionIndex;
                const isAnswered = ans?.jawabanDipilih && ans.jawabanDipilih.trim() !== '';
                const isRagu = ans?.raguRagu;

                let btnClass = 'bg-slate-800 text-slate-400 border-slate-700 hover:bg-slate-700';
                if (isCurrent) {
                  btnClass = 'ring-2 ring-blue-500 ring-offset-2 ring-offset-slate-900 font-extrabold text-white';
                }
                if (isRagu) {
                  btnClass += ' bg-amber-500 text-slate-950 font-bold border-amber-400';
                } else if (isAnswered) {
                  btnClass += ' bg-emerald-600 text-white font-bold border-emerald-500';
                }

                return (
                  <button
                    key={q.id}
                    onClick={() => setActiveQuestionIndex(idx)}
                    className={`h-11 rounded-xl text-xs flex items-center justify-center border transition cursor-pointer relative ${btnClass}`}
                  >
                    <span>{q.nomor}</span>
                    {ans?.jawabanDipilih && q.tipe === 'pilihan_ganda' && (
                      <span className="absolute bottom-1 right-1 text-[9px] font-mono opacity-80">
                        {ans.jawabanDipilih}
                      </span>
                    )}
                  </button>
                );
              })}
            </div>
          </div>

          <div className="pt-4 border-t border-slate-800 mt-4 space-y-3">
            <button
              onClick={() => setShowConfirmModal(true)}
              className="w-full bg-emerald-600 hover:bg-emerald-500 text-white font-bold py-3 px-4 rounded-xl text-sm transition shadow-lg shadow-emerald-600/20 flex items-center justify-center gap-2 cursor-pointer"
            >
              <Send className="w-4 h-4" />
              <span>Selesaikan Ujian</span>
            </button>
            <div className="text-[11px] text-slate-500 text-center">
              Sinkronisasi data otomatis ke Firebase.
            </div>
          </div>
        </aside>
      </div>

      {/* Mobile Drawer Navigation (Bottom-sheet modal for screen widths < 1024px) */}
      {showMobileNav && (
        <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-xs flex flex-col justify-end lg:hidden">
          <div className="bg-slate-900 border-t border-slate-700 rounded-t-3xl p-5 max-h-[85vh] flex flex-col shadow-2xl">
            <div className="flex items-center justify-between pb-3 border-b border-slate-800 mb-3">
              <div>
                <h3 className="font-bold text-white text-sm">Daftar Nomor Soal</h3>
                <span className="text-xs text-slate-400">
                  {answeredCount} dari {preparedQuestions.length} Terjawab
                </span>
              </div>
              <button
                onClick={() => setShowMobileNav(false)}
                className="w-8 h-8 rounded-full bg-slate-800 text-slate-300 flex items-center justify-center hover:bg-slate-700 cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {/* Mobile Legend */}
            <div className="grid grid-cols-3 gap-1.5 text-[10px] mb-3 text-center">
              <div className="bg-emerald-500/10 border border-emerald-500/30 text-emerald-400 py-1 rounded-md font-semibold">
                Dijawab ({answeredCount})
              </div>
              <div className="bg-amber-500/10 border border-amber-500/30 text-amber-400 py-1 rounded-md font-semibold">
                Ragu ({flaggedCount})
              </div>
              <div className="bg-slate-800 border border-slate-700 text-slate-400 py-1 rounded-md font-semibold">
                Belum ({preparedQuestions.length - answeredCount})
              </div>
            </div>

            {/* Number Grid */}
            <div className="grid grid-cols-5 gap-2 overflow-y-auto max-h-60 p-1 mb-4">
              {preparedQuestions.map((q, idx) => {
                const ans = answers[q.id];
                const isCurrent = idx === activeQuestionIndex;
                const isAnswered = ans?.jawabanDipilih && ans.jawabanDipilih.trim() !== '';
                const isRagu = ans?.raguRagu;

                let btnClass = 'bg-slate-800 text-slate-400 border-slate-700';
                if (isCurrent) {
                  btnClass = 'ring-2 ring-blue-500 ring-offset-2 ring-offset-slate-900 font-extrabold text-white';
                }
                if (isRagu) {
                  btnClass += ' bg-amber-500 text-slate-950 font-bold border-amber-400';
                } else if (isAnswered) {
                  btnClass += ' bg-emerald-600 text-white font-bold border-emerald-500';
                }

                return (
                  <button
                    key={q.id}
                    onClick={() => {
                      setActiveQuestionIndex(idx);
                      setShowMobileNav(false);
                    }}
                    className={`h-11 rounded-xl text-xs flex items-center justify-center border transition relative cursor-pointer ${btnClass}`}
                  >
                    <span>{q.nomor}</span>
                    {ans?.jawabanDipilih && q.tipe === 'pilihan_ganda' && (
                      <span className="absolute bottom-1 right-1 text-[9px] font-mono opacity-80">
                        {ans.jawabanDipilih}
                      </span>
                    )}
                  </button>
                );
              })}
            </div>

            <button
              onClick={() => {
                setShowMobileNav(false);
                setShowConfirmModal(true);
              }}
              className="w-full bg-emerald-600 hover:bg-emerald-500 text-white font-bold py-3 rounded-xl text-sm transition shadow-lg shadow-emerald-600/20 flex items-center justify-center gap-2 cursor-pointer"
            >
              <Send className="w-4 h-4" />
              <span>Selesaikan Ujian Sekarang</span>
            </button>
          </div>
        </div>
      )}

      {/* Proctoring Violation Warning Modal */}
      {showViolationModal && !isSessionLocked && (
        <div className="fixed inset-0 z-50 bg-black/85 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-slate-900 border-2 border-amber-500/60 rounded-3xl p-6 sm:p-7 max-w-md w-full shadow-2xl text-center animate-in fade-in zoom-in-95 duration-200">
            <div className="w-16 h-16 bg-amber-500/20 border border-amber-500/40 text-amber-400 rounded-2xl flex items-center justify-center mx-auto mb-4 animate-bounce">
              <AlertTriangle className="w-9 h-9" />
            </div>

            <h3 className="text-xl font-black text-amber-400 mb-2">PERINGATAN PELANGGARAN!</h3>
            <p className="text-slate-200 text-sm mb-4 leading-relaxed">
              Anda terdeteksi meninggalkan layar ujian: <br />
              <strong className="text-white">"{latestViolationMsg}"</strong>
            </p>

            <div className="bg-slate-800/80 border border-slate-700 rounded-2xl p-4 mb-5 text-left text-xs space-y-1.5">
              <div className="flex justify-between text-slate-300">
                <span>Pelanggaran Ke:</span>
                <span className="font-bold text-amber-400">
                  {violationsCount} dari batas {maxAllowedViolations} kali
                </span>
              </div>
              <div className="flex justify-between text-slate-300">
                <span>Status Toleransi:</span>
                <span className="font-semibold text-slate-200">
                  Sisa {Math.max(0, maxAllowedViolations - violationsCount)} kesempatan
                </span>
              </div>
              <div className="text-[11px] text-red-300 pt-1 border-t border-slate-700/60">
                * Jika Anda berpindah tab lagi hingga melebihi batas, ujian akan otomatis dikunci oleh sistem pengawas sekolah.
              </div>
            </div>

            <button
              type="button"
              onClick={() => {
                setShowViolationModal(false);
                if (ujian.wajibFullscreen !== false) {
                  requestFullscreen();
                }
              }}
              className="w-full bg-amber-500 hover:bg-amber-400 text-slate-950 font-extrabold py-3.5 px-4 rounded-xl text-sm transition shadow-lg shadow-amber-500/20 cursor-pointer"
            >
              Saya Mengerti dan Kembali ke Ujian
            </button>
          </div>
        </div>
      )}

      {/* Proctoring Locked Screen (Fullscreen overlay when session locked) */}
      {isSessionLocked && (
        <div className="fixed inset-0 z-50 bg-slate-950/95 backdrop-blur-md flex items-center justify-center p-4">
          <div className="bg-slate-900 border-2 border-red-500/70 rounded-3xl p-6 sm:p-8 max-w-xl w-full text-center shadow-2xl animate-in fade-in zoom-in-95 duration-200">
            <div className="w-20 h-20 bg-red-500/20 border-2 border-red-500/50 text-red-400 rounded-3xl flex items-center justify-center mx-auto mb-5 shadow-lg shadow-red-500/20">
              <ShieldAlert className="w-10 h-10 animate-pulse text-red-400" />
            </div>

            <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-red-500/20 border border-red-500/40 text-red-300 text-xs font-bold mb-3">
              <Lock className="w-3.5 h-3.5" />
              <span>PENGUNCIAN OTOMATIS SERVER AKTIF</span>
            </div>

            <h2 className="text-xl sm:text-2xl font-black text-white mb-2 tracking-tight">
              Ujian Dikunci Sementara
            </h2>

            {/* MANDATORY VERBATIM USER MESSAGE */}
            <div className="bg-red-950/60 border-2 border-red-500/60 rounded-2xl p-4 sm:p-5 text-left text-sm text-red-100 mb-5 shadow-md">
              <div className="font-extrabold text-red-200 flex items-start gap-2 text-sm sm:text-base leading-snug">
                <AlertCircle className="w-5 h-5 text-red-400 shrink-0 mt-0.5" />
                <span>
                  Ujian dikunci sementara karena terdeteksi akses dari perangkat atau sesi lain. Silakan hubungi guru pengawas.
                </span>
              </div>
              {lockReason && (
                <div className="mt-2.5 pt-2.5 border-t border-red-500/30 text-xs text-red-300/90">
                  <span className="font-semibold text-red-200">Catatan Sistem: </span>
                  {lockReason}
                </div>
              )}
            </div>

            {/* Answer Preservation & Anti-Bypass Clarification */}
            <div className="bg-slate-800/80 border border-slate-700/80 rounded-2xl p-4 text-xs text-slate-300 text-left mb-6 space-y-2.5">
              <div className="font-bold text-white text-xs sm:text-sm flex items-center gap-1.5">
                <CheckCircle2 className="w-4 h-4 text-emerald-400" />
                <span>Data Jawaban Anda Aman & Terlindungi:</span>
              </div>
              <ul className="space-y-1.5 text-[11px] sm:text-xs text-slate-300 list-disc list-inside">
                <li>
                  <strong className="text-emerald-300">Jawaban tersimpan utuh:</strong> Seluruh butir soal yang telah Anda isi sebelum penguncian tetap tersimpan di server sekolah tanpa ada yang hilang atau terhapus.
                </li>
                <li>
                  <strong className="text-amber-300">Akses perangkat kedua ditolak:</strong> Server menolak perubahan atau pengiriman jawaban dari perangkat lain.
                </li>
                <li>
                  <strong className="text-slate-200">Keamanan server:</strong> Menyegarkan halaman (refresh), login ulang, atau membuka link yang sama tidak akan membuka kunci sebelum diverifikasi oleh guru.
                </li>
              </ul>
            </div>

            <div className="bg-slate-950/60 border border-slate-800 rounded-2xl p-3.5 text-xs text-slate-400 text-left mb-6 flex flex-col sm:flex-row sm:items-center justify-between gap-2">
              <div>
                <span className="text-slate-500 block text-[10px] uppercase font-bold tracking-wider">Guru Pengawas:</span>
                <span className="font-bold text-slate-200">{ujian.guruNama}</span>
              </div>
              <div className="sm:text-right">
                <span className="text-slate-500 block text-[10px] uppercase font-bold tracking-wider">Status Peserta:</span>
                <span className="font-semibold text-slate-300">
                  {selectedSiswa?.namaLengkap || (selectedSiswa as any)?.nama} ({selectedSiswa?.kelas})
                </span>
              </div>
            </div>

            <div className="flex items-center justify-center gap-2 text-xs font-semibold text-blue-400 bg-blue-950/40 border border-blue-500/30 py-2.5 px-4 rounded-xl">
              <RefreshCw className="w-4 h-4 animate-spin text-blue-400" />
              <span>Memantau status pembukaan kunci dari Guru Pengawas secara real-time...</span>
            </div>
          </div>
        </div>
      )}

      {/* Zoom Image Modal */}
      {zoomImage && (
        <div
          onClick={() => setZoomImage(null)}
          className="fixed inset-0 z-50 bg-black/90 backdrop-blur-md flex items-center justify-center p-4 cursor-zoom-out"
        >
          <div className="relative max-w-4xl max-h-[90vh]">
            <img
              src={zoomImage}
              alt="Perbesar Gambar"
              className="max-h-[85vh] w-auto max-w-full object-contain rounded-2xl shadow-2xl"
            />
            <button
              onClick={() => setZoomImage(null)}
              className="absolute -top-3 -right-3 w-9 h-9 bg-slate-800 border border-slate-700 text-white rounded-full flex items-center justify-center hover:bg-slate-700 shadow-lg cursor-pointer"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>
      )}

      {/* Confirmation Submit Modal */}
      {showConfirmModal && (
        <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-slate-900 border border-slate-800 rounded-3xl p-6 sm:p-7 max-w-md w-full shadow-2xl text-center">
            <div className="w-14 h-14 bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 rounded-2xl flex items-center justify-center mx-auto mb-4">
              <CheckCircle2 className="w-8 h-8" />
            </div>

            <h3 className="text-xl font-bold text-white mb-2">Konfirmasi Pengiriman Ujian</h3>
            <p className="text-slate-300 text-xs sm:text-sm mb-5 leading-relaxed">
              Anda telah menjawab <strong className="text-emerald-400">{answeredCount}</strong> dari{' '}
              <strong className="text-white">{preparedQuestions.length}</strong> butir soal.
            </p>

            {answeredCount < preparedQuestions.length && (
              <div className="bg-amber-500/10 border border-amber-500/30 rounded-xl p-3 text-xs text-amber-300 mb-4 flex items-center gap-2 text-left">
                <AlertCircle className="w-5 h-5 shrink-0 text-amber-400" />
                <span>
                  Perhatian: Masih ada <strong>{preparedQuestions.length - answeredCount} butir soal</strong> yang belum
                  dijawab. Yakin ingin mengakhiri?
                </span>
              </div>
            )}

            {flaggedCount > 0 && (
              <div className="bg-blue-500/10 border border-blue-500/30 rounded-xl p-3 text-xs text-blue-300 mb-4 flex items-center gap-2 text-left">
                <Flag className="w-5 h-5 shrink-0 text-blue-400" />
                <span>
                  Terdapat <strong>{flaggedCount} soal</strong> yang masih bertanda ragu-ragu.
                </span>
              </div>
            )}

            <div className="grid grid-cols-2 gap-3 mt-5">
              <button
                type="button"
                onClick={() => setShowConfirmModal(false)}
                className="w-full bg-slate-800 hover:bg-slate-700 text-white font-semibold py-3 px-4 rounded-xl text-xs sm:text-sm transition cursor-pointer"
              >
                Periksa Lagi
              </button>
              <button
                type="button"
                disabled={isSubmitting}
                onClick={() => handleSubmitExam(false)}
                className="w-full bg-emerald-600 hover:bg-emerald-500 text-white font-bold py-3 px-4 rounded-xl text-xs sm:text-sm transition shadow-lg shadow-emerald-600/25 flex items-center justify-center gap-1.5 cursor-pointer disabled:opacity-50"
              >
                {isSubmitting ? 'Menyimpan...' : 'Kirim Sekarang'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
