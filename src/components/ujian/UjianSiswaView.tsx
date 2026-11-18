import React, { useState, useEffect, useRef, useMemo, useCallback } from 'react';
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
  doesStudentMatchTargetClasses,
  getOrderedQuestionsForSession,
} from '../../utils/examShuffleAndScore';
import {
  ServerClockState,
  clearActiveExamPointer,
  clearExamDraftSnapshot,
  computeRemainingExamSeconds,
  computeServerSyncSample,
  getAuthoritativeNowFromClock,
  loadActiveExamPointer,
  loadExamDraftSnapshot,
  loadPersistedClockOffset,
  mergeDraftIntoSession,
  saveActiveExamPointer,
  saveExamDraftSnapshot,
  savePersistedClockOffset,
} from '../../utils/examSessionResilience';
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
  const [saveStatus, setSaveStatus] = useState<'saved' | 'saving' | 'pending' | 'offline'>(
    typeof navigator !== 'undefined' && !navigator.onLine ? 'offline' : 'saved'
  );
  const [isServerClockSynced, setIsServerClockSynced] = useState(false);
  const [pembahasanMap, setPembahasanMap] = useState<
    Record<string, { kunciJawaban?: string; benar?: boolean; pembahasan?: string }> | undefined
  >(undefined);

  const clockStateRef = useRef<ServerClockState>({
    offsetMs: loadPersistedClockOffset(),
    anchorServerMs: 0,
    anchorPerfMs: 0,
    rttMs: 0,
    syncedAtClientMs: 0,
    hasServerSync: false,
  });
  const essaySaveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const dirtySyncRef = useRef<boolean>(false);
  const isFlushingRef = useRef<boolean>(false);
  const timeExpiredFiredRef = useRef<boolean>(false);
  const prevFullscreenRef = useRef<boolean>(false);
  const sesiRef = useRef<SesiUjianSiswa | null>(null);
  const ujianRef = useRef<UjianOnline | null>(null);
  const jawabanRef = useRef<{ [soalId: string]: DetailJawabanSiswa }>({});
  const currentIndexRef = useRef<number>(0);
  const readyStartedRef = useRef<boolean>(false);

  useEffect(() => {
    sesiRef.current = sesi;
  }, [sesi]);
  useEffect(() => {
    ujianRef.current = ujian;
  }, [ujian]);
  useEffect(() => {
    jawabanRef.current = jawabanState;
  }, [jawabanState]);
  useEffect(() => {
    currentIndexRef.current = currentIndex;
  }, [currentIndex]);
  useEffect(() => {
    readyStartedRef.current = readyStarted;
  }, [readyStarted]);

  const getAuthoritativeNowMs = useCallback(() => {
    return getAuthoritativeNowFromClock(clockStateRef.current);
  }, []);

  const applyServerTimeSample = useCallback(
    (sampleInput: {
      serverTimeMs: number;
      reqStartPerfMs: number;
      reqEndPerfMs: number;
      reqEndClientMs: number;
    }) => {
      if (typeof sampleInput.serverTimeMs !== 'number' || !Number.isFinite(sampleInput.serverTimeMs)) {
        return;
      }
      const nextClock = computeServerSyncSample(sampleInput);
      clockStateRef.current = nextClock;
      savePersistedClockOffset(nextClock.offsetMs);
      setIsServerClockSynced(true);
    },
    []
  );

  const syncServerClock = useCallback(async () => {
    if (typeof navigator !== 'undefined' && !navigator.onLine) return;
    try {
      const reqStartPerfMs = typeof performance !== 'undefined' ? performance.now() : 0;
      const resp = await fetch('/api/ujian/time', { cache: 'no-store' });
      const reqEndPerfMs = typeof performance !== 'undefined' ? performance.now() : 0;
      const reqEndClientMs = Date.now();
      if (resp.ok) {
        const json = await resp.json().catch(() => null);
        if (typeof json?.serverTimeMs === 'number') {
          applyServerTimeSample({
            serverTimeMs: json.serverTimeMs,
            reqStartPerfMs,
            reqEndPerfMs,
            reqEndClientMs,
          });
        }
      }
    } catch {}
  }, [applyServerTimeSample]);

  const tryEnterFullscreen = useCallback(async () => {
    try {
      const el: any = document.documentElement;
      const doc: any = document;
      if (doc.fullscreenElement || doc.webkitFullscreenElement) {
        prevFullscreenRef.current = true;
        setIsFullscreen(true);
        return;
      }
      if (el.requestFullscreen) {
        await el.requestFullscreen();
        prevFullscreenRef.current = true;
        setIsFullscreen(true);
      } else if (el.webkitRequestFullscreen) {
        el.webkitRequestFullscreen();
        prevFullscreenRef.current = true;
        setIsFullscreen(true);
      }
    } catch {
      // Browser/iOS may block fullscreen without user gesture; exam stays playable with 1-tap re-entry bar
    }
  }, []);

  const tryExitFullscreen = useCallback(() => {
    try {
      prevFullscreenRef.current = false;
      const doc: any = document;
      if (doc.fullscreenElement && doc.exitFullscreen) {
        doc.exitFullscreen().catch(() => {});
      } else if (doc.webkitFullscreenElement && doc.webkitExitFullscreen) {
        doc.webkitExitFullscreen();
      }
      setIsFullscreen(false);
    } catch {}
  }, []);

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

  // Synchronous local draft & active session pointer writer
  const persistLocalDraftSync = useCallback(
    (overrides?: {
      sesiObj?: SesiUjianSiswa;
      jawaban?: { [soalId: string]: DetailJawabanSiswa };
      currentIndex?: number;
      readyStarted?: boolean;
      pendingCloudSync?: boolean;
      pendingSubmitSync?: boolean;
    }) => {
      const targetSesi = overrides?.sesiObj || sesiRef.current;
      if (!targetSesi) return;
      const nextJawaban = overrides?.jawaban || jawabanRef.current || targetSesi.jawaban || {};
      const nextIndex = overrides?.currentIndex ?? currentIndexRef.current;
      const nextReady = overrides?.readyStarted ?? readyStartedRef.current;
      const isPendingCloud = overrides?.pendingCloudSync ?? dirtySyncRef.current;
      const isPendingSubmit = overrides?.pendingSubmitSync ?? targetSesi.pendingSubmitSync;

      const isTerminalSynced =
        (targetSesi.status === 'selesai' || targetSesi.status === 'waktu_habis') &&
        !isPendingSubmit;

      if (isTerminalSynced) {
        clearActiveExamPointer(targetSesi.id);
        clearExamDraftSnapshot(targetSesi.id);
        return;
      }

      saveExamDraftSnapshot({
        sessionId: targetSesi.id,
        ujianId: targetSesi.ujianId,
        schoolId: targetSesi.schoolId || db.getActiveSchoolId(),
        status: targetSesi.status,
        waktuMulai: targetSesi.waktuMulai,
        jawaban: nextJawaban,
        currentIndex: nextIndex,
        readyStarted: nextReady,
        pendingCloudSync: isPendingCloud,
        pendingSubmitSync: isPendingSubmit,
        lastLocalSavedAt: Date.now(),
      });

      saveActiveExamPointer({
        sessionId: targetSesi.id,
        ujianId: targetSesi.ujianId,
        schoolId: targetSesi.schoolId || db.getActiveSchoolId(),
        sessionToken: targetSesi.sessionToken,
        currentIndex: nextIndex,
        readyStarted: nextReady,
        updatedAt: Date.now(),
      });
    },
    []
  );

  // Confirmed Cloud Flush Helper
  const flushCloudSync = useCallback(
    async (explicitSession?: SesiUjianSiswa): Promise<boolean> => {
      const baseSesi = explicitSession || sesiRef.current;
      if (!baseSesi) return true;

      if (essaySaveTimerRef.current) {
        clearTimeout(essaySaveTimerRef.current);
        essaySaveTimerRef.current = null;
      }

      const latestFromDb = db.getSesiById(baseSesi.id) || baseSesi;
      const mergedJawaban = {
        ...(latestFromDb.jawaban || {}),
        ...(jawabanRef.current || {}),
      };
      // Ensure latest clientUpdatedAt wins per question
      Object.keys(latestFromDb.jawaban || {}).forEach((qId) => {
        const dbAns = latestFromDb.jawaban[qId];
        const stateAns = jawabanRef.current?.[qId];
        if (dbAns && stateAns) {
          const dbTs = Number(dbAns.clientUpdatedAt) || 0;
          const stTs = Number(stateAns.clientUpdatedAt) || 0;
          mergedJawaban[qId] = stTs >= dbTs ? stateAns : dbAns;
        }
      });

      const snapshotToSync: SesiUjianSiswa = {
        ...latestFromDb,
        status:
          baseSesi.status === 'sedang_mengerjakan' && latestFromDb.status === 'terverifikasi'
            ? 'sedang_mengerjakan'
            : latestFromDb.status,
        waktuMulai: latestFromDb.waktuMulai || baseSesi.waktuMulai,
        jawaban: mergedJawaban,
      };

      const persistedLocal = db.saveSesiUjianLocal(snapshotToSync);

      if (typeof navigator !== 'undefined' && !navigator.onLine) {
        dirtySyncRef.current = true;
        persistLocalDraftSync({ sesiObj: persistedLocal, pendingCloudSync: true });
        setSaveStatus('offline');
        return false;
      }

      if (isFlushingRef.current) return false;
      isFlushingRef.current = true;
      setSaveStatus('saving');

      try {
        const synced = await db.syncSesiUjianToCloud(persistedLocal, 8000);
        if (synced) {
          dirtySyncRef.current = false;
          persistLocalDraftSync({ sesiObj: persistedLocal, pendingCloudSync: false });
          setSaveStatus('saved');
          return true;
        } else {
          dirtySyncRef.current = true;
          persistLocalDraftSync({ sesiObj: persistedLocal, pendingCloudSync: true });
          setSaveStatus(navigator.onLine ? 'pending' : 'offline');
          return false;
        }
      } finally {
        isFlushingRef.current = false;
      }
    },
    [persistLocalDraftSync]
  );

  // Initial & reactive server clock calibration
  useEffect(() => {
    syncServerClock();

    const handleExamTimeEvent = (e: Event) => {
      const detail = (e as CustomEvent)?.detail;
      if (detail && typeof detail.serverTimeMs === 'number') {
        applyServerTimeSample(detail);
      }
    };

    const handleVisibilityResync = () => {
      if (!document.hidden) {
        syncServerClock();
      }
    };

    window.addEventListener('ujian_server_time_sync', handleExamTimeEvent);
    document.addEventListener('visibilitychange', handleVisibilityResync);

    const periodicSync = setInterval(() => {
      if (sesiRef.current && readyStartedRef.current && !document.hidden) {
        syncServerClock();
      }
    }, 30000);

    return () => {
      window.removeEventListener('ujian_server_time_sync', handleExamTimeEvent);
      document.removeEventListener('visibilitychange', handleVisibilityResync);
      clearInterval(periodicSync);
    };
  }, [syncServerClock, applyServerTimeSample]);

  // Connection fluctuation listeners, background retry queue, & heartbeat
  useEffect(() => {
    const handleOnline = async () => {
      setIsOnline(true);
      syncServerClock();
      const activeSesi = sesiRef.current;
      if (!activeSesi) {
        setSaveStatus('saved');
        return;
      }
      if (activeSesi.pendingSubmitSync) {
        const synced = await db.submitUjianKeBackend(activeSesi.id).catch(() => null);
        if (synced?.sesi) {
          setSesi(synced.sesi);
          if (synced.pembahasanMap) setPembahasanMap(synced.pembahasanMap);
          if (synced.syncedToServer) {
            clearActiveExamPointer(synced.sesi.id);
            clearExamDraftSnapshot(synced.sesi.id);
            setSaveStatus('saved');
          }
        }
      } else {
        await flushCloudSync(activeSesi);
      }
    };

    const handleOffline = () => {
      setIsOnline(false);
      dirtySyncRef.current = true;
      persistLocalDraftSync({ pendingCloudSync: true });
      setSaveStatus('offline');
    };

    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);

    const retryInterval = setInterval(async () => {
      const activeSesi = sesiRef.current;
      if (!activeSesi || (typeof navigator !== 'undefined' && !navigator.onLine)) return;

      if (activeSesi.pendingSubmitSync) {
        const synced = await db.submitUjianKeBackend(activeSesi.id).catch(() => null);
        if (synced?.sesi) {
          setSesi(synced.sesi);
          if (synced.pembahasanMap) setPembahasanMap(synced.pembahasanMap);
          if (synced.syncedToServer) {
            clearActiveExamPointer(synced.sesi.id);
            clearExamDraftSnapshot(synced.sesi.id);
            setSaveStatus('saved');
          }
        }
      } else if (dirtySyncRef.current) {
        await flushCloudSync(activeSesi);
      }
    }, 8000);

    const heartbeatInterval = setInterval(() => {
      const activeSesi = sesiRef.current;
      if (
        !activeSesi ||
        !readyStartedRef.current ||
        activeSesi.status === 'selesai' ||
        activeSesi.status === 'waktu_habis' ||
        activeSesi.status === 'terkunci'
      ) {
        return;
      }
      if (typeof navigator !== 'undefined' && navigator.onLine && !dirtySyncRef.current) {
        db.syncSesiUjianToCloud(
          db.saveSesiUjianLocal({ ...activeSesi, jawaban: jawabanRef.current }),
          6000
        ).catch(() => false);
      }
    }, 30000);

    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
      clearInterval(retryInterval);
      clearInterval(heartbeatInterval);
    };
  }, [flushCloudSync, persistLocalDraftSync, syncServerClock]);

  // --------------------------------------------------------------------------
  // 1. URL ROUTING, REFRESH AUTO-RESUME & CROSS-DEVICE FIRESTORE RESOLUTION
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

      const activePointer = loadActiveExamPointer();

      // Priority 1: Explicit session token in URL
      if (targetToken) {
        const resolvedSession =
          db.getSesiByToken(targetToken) ||
          (await db.resolveSessionFromFirestore({
            token: targetToken,
            schoolId: targetSchoolId || undefined,
          }));
        if (!isCancelled && resolvedSession) {
          const matchedPointer =
            activePointer && activePointer.sessionId === resolvedSession.id ? activePointer : null;
          await initSession(resolvedSession, {
            restoreQuestionIndex: matchedPointer?.currentIndex,
            autoResumeActive:
              Boolean(matchedPointer?.readyStarted) ||
              resolvedSession.status === 'sedang_mengerjakan',
          });
          setIsLoadingExam(false);
          return;
        }
      }

      // Priority 2: Recover in-progress or pending-submit session after browser refresh
      if (
        activePointer &&
        (!targetExamId || activePointer.ujianId === targetExamId)
      ) {
        if (activePointer.schoolId && !targetSchoolId) {
          db.setActiveSchoolId(activePointer.schoolId);
        }
        let localSession = db.getSesiById(activePointer.sessionId);
        if (!localSession && activePointer.sessionToken && navigator.onLine) {
          localSession = await db.resolveSessionFromFirestore({
            token: activePointer.sessionToken,
            schoolId: activePointer.schoolId || undefined,
          });
        }

        const draft = loadExamDraftSnapshot(activePointer.sessionId);
        if (localSession) {
          const mergedSession = mergeDraftIntoSession(localSession, draft);
          const isStillRecoverable =
            mergedSession.status === 'sedang_mengerjakan' ||
            mergedSession.status === 'terverifikasi' ||
            mergedSession.status === 'terkunci' ||
            Boolean(mergedSession.pendingSubmitSync);

          if (isStillRecoverable && !isCancelled) {
            await initSession(mergedSession, {
              restoreQuestionIndex: draft?.currentIndex ?? activePointer.currentIndex,
              autoResumeActive:
                Boolean(draft?.readyStarted ?? activePointer.readyStarted) ||
                mergedSession.status === 'sedang_mengerjakan',
            });
            // If offline drafts were dirty, immediately attempt background sync
            if (draft?.pendingCloudSync) {
              dirtySyncRef.current = true;
              setSaveStatus(navigator.onLine ? 'pending' : 'offline');
              if (navigator.onLine) {
                flushCloudSync(mergedSession).catch(() => {});
              }
            }
            setIsLoadingExam(false);
            return;
          } else if (
            mergedSession.status === 'selesai' ||
            mergedSession.status === 'waktu_habis'
          ) {
            clearActiveExamPointer(mergedSession.id);
            clearExamDraftSnapshot(mergedSession.id);
          }
        }
      }

      // Priority 3: Specific exam ID link
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
          const activeOne =
            list.find((u) => u.status === 'aktif' || u.status === 'terbit' || u.status === 'terjadwal') ||
            list[0];
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
            const draft = loadExamDraftSnapshot(latestSesi.id);
            const merged = mergeDraftIntoSession(latestSesi, draft);
            setSesi(merged);
            setJawabanState(merged.jawaban || {});
            toast.success('Sesi ujian Anda telah dibuka kembali oleh Guru Pengawas.');
          } else if (latestSesi.status === 'terkunci' && sesi.status !== 'terkunci') {
            tryExitFullscreen();
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
      if (examClasses.length > 0 && !doesStudentMatchTargetClasses(siswa.kelas, examClasses)) {
        throw new Error(
          `Kartu QR terdaftar atas nama ${siswa.namaLengkap} (Kelas ${siswa.kelas || '-'}). Namun ujian ini dikhususkan untuk ${examClasses.join(', ')}. Anda tidak memiliki hak akses untuk mengerjakan ujian ini.`
        );
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
  // 4. ACTIVE SESSION INITIALIZATION (Lock Question & Choice Ordering + Recovery)
  // --------------------------------------------------------------------------
  const initSession = async (
    session: SesiUjianSiswa,
    options?: { restoreQuestionIndex?: number; autoResumeActive?: boolean }
  ) => {
    timeExpiredFiredRef.current = false;

    let exam = db.getUjianForStudent(session.ujianId);
    if (!exam) {
      exam = await db.resolveExamFromFirestore(session.ujianId, session.schoolId);
    }
    if (!exam) {
      setVerificationError('Data naskah ujian tidak ditemukan.');
      return;
    }

    // Reconcile any un-synced localStorage draft for this session first
    const localDraft = loadExamDraftSnapshot(session.id);
    const recoveredSession = mergeDraftIntoSession(session, localDraft);

    const sched = checkExamScheduleWindow(exam, getAuthoritativeNowMs());
    if (
      !sched.allowed &&
      recoveredSession.status !== 'selesai' &&
      recoveredSession.status !== 'waktu_habis' &&
      !recoveredSession.pendingSubmitSync
    ) {
      setVerificationError(sched.reason || 'Masa pengerjaan ujian belum dibuka atau telah berakhir.');
      return;
    }

    const sessionSeedKey = recoveredSession.id || recoveredSession.siswaId;
    const { urutanSoalIds, urutanPilihanMap } = getOrderedQuestionsForSession(
      exam,
      sessionSeedKey,
      recoveredSession
    );

    const needsOrderPersist =
      !recoveredSession.urutanSoalIds ||
      recoveredSession.urutanSoalIds.length === 0 ||
      !recoveredSession.urutanPilihanMap ||
      Object.keys(recoveredSession.urutanPilihanMap).length === 0;

    let lockedSession: SesiUjianSiswa = {
      ...recoveredSession,
      urutanSoalIds,
      urutanPilihanMap,
    };

    if (needsOrderPersist || localDraft?.pendingCloudSync) {
      lockedSession = db.saveSesiUjianLocal(lockedSession);
      if (navigator.onLine) {
        db.syncSesiUjianToCloud(lockedSession, 6000).catch(() => false);
      }
    }

    const totalQuestions = urutanSoalIds.length || exam.soalList?.length || 1;
    const safeRestoredIdx = Math.max(
      0,
      Math.min(
        totalQuestions - 1,
        Number(options?.restoreQuestionIndex ?? localDraft?.currentIndex ?? 0) || 0
      )
    );

    setSesi(lockedSession);
    setUjian(exam);
    setJawabanState(lockedSession.jawaban || {});
    setCurrentIndex(safeRestoredIdx);

    const { remainingSec } = computeRemainingExamSeconds({
      startIso: lockedSession.waktuMulai,
      durasiMenit: exam.durasiMenit,
      tanggalSelesai: exam.tanggalSelesai,
      authoritativeNowMs: getAuthoritativeNowMs(),
    });
    setTimeLeftSeconds(remainingSec);

    if (lockedSession.status === 'selesai' || lockedSession.status === 'waktu_habis') {
      setReadyStarted(true);
      setIsCompleted(true);
      if (exam.tampilkanNilaiLangsung && exam.tampilkanPembahasan && !lockedSession.pendingSubmitSync) {
        db.submitUjianKeBackend(lockedSession.id)
          .then((res) => {
            if (res.pembahasanMap) setPembahasanMap(res.pembahasanMap);
          })
          .catch(() => {});
      }
      return;
    }

    const shouldResumeImmediately =
      Boolean(options?.autoResumeActive) ||
      (lockedSession.status === 'sedang_mengerjakan' && Boolean(lockedSession.waktuMulai));

    if (shouldResumeImmediately) {
      setReadyStarted(true);
      persistLocalDraftSync({
        sesiObj: lockedSession,
        jawaban: lockedSession.jawaban || {},
        currentIndex: safeRestoredIdx,
        readyStarted: true,
        pendingCloudSync: Boolean(localDraft?.pendingCloudSync),
      });
      // Attempt fullscreen quietly; if browser requires user gesture on reload, banner lets student enter with 1 tap
      if (exam.modeFullscreen !== false) {
        const doc: any = document;
        prevFullscreenRef.current = Boolean(doc.fullscreenElement || doc.webkitFullscreenElement);
        setIsFullscreen(prevFullscreenRef.current);
      }
    } else {
      setReadyStarted(false);
    }
  };

  const handleStartExamWithFullscreen = async () => {
    if (!sesi || !ujian) return;
    if (ujian.modeFullscreen !== false) {
      await tryEnterFullscreen();
    }
    let activeSesi = sesi;
    if (!sesi.waktuMulai || sesi.status === 'terverifikasi') {
      const startedSesi: SesiUjianSiswa = {
        ...sesi,
        status: 'sedang_mengerjakan',
        waktuMulai: sesi.waktuMulai || new Date(getAuthoritativeNowMs()).toISOString(),
      };
      activeSesi = db.saveSesiUjianLocal(startedSesi);
      setSesi(activeSesi);
    }
    setReadyStarted(true);
    persistLocalDraftSync({
      sesiObj: activeSesi,
      jawaban: jawabanRef.current,
      currentIndex: currentIndexRef.current,
      readyStarted: true,
      pendingCloudSync: true,
    });
    flushCloudSync(activeSesi).catch(() => {});
  };

  // --------------------------------------------------------------------------
  // 5. PERSISTENT SERVER-SYNCHRONIZED COUNTDOWN TIMER
  // --------------------------------------------------------------------------
  const handleTimeExpired = useCallback(async () => {
    const activeSesi = sesiRef.current;
    if (!activeSesi || timeExpiredFiredRef.current) return;
    timeExpiredFiredRef.current = true;

    if (essaySaveTimerRef.current) {
      clearTimeout(essaySaveTimerRef.current);
      essaySaveTimerRef.current = null;
    }

    setIsSubmitting(true);
    try {
      db.saveSesiUjianLocal({
        ...activeSesi,
        jawaban: jawabanRef.current,
      });
      const res = await db.submitUjianKeBackend(activeSesi.id);
      if (res.sesi) {
        setSesi(res.sesi);
        if (res.syncedToServer) {
          clearActiveExamPointer(res.sesi.id);
          clearExamDraftSnapshot(res.sesi.id);
        } else {
          persistLocalDraftSync({
            sesiObj: res.sesi,
            pendingCloudSync: true,
            pendingSubmitSync: true,
          });
        }
      }
      if (res.pembahasanMap) setPembahasanMap(res.pembahasanMap);
    } finally {
      tryExitFullscreen();
      setIsCompleted(true);
      setIsSubmitting(false);
    }
  }, [persistLocalDraftSync, tryExitFullscreen]);

  useEffect(() => {
    if (!sesi || !ujian || !readyStarted || isCompleted || sesi.status === 'terkunci') return;

    const tick = () => {
      const { remainingSec } = computeRemainingExamSeconds({
        startIso: sesi.waktuMulai,
        durasiMenit: ujian.durasiMenit,
        tanggalSelesai: ujian.tanggalSelesai,
        authoritativeNowMs: getAuthoritativeNowMs(),
      });
      setTimeLeftSeconds(remainingSec);
      if (remainingSec <= 0) {
        clearInterval(timer);
        handleTimeExpired();
      }
    };

    tick();
    const timer = setInterval(tick, 1000);

    return () => clearInterval(timer);
  }, [
    sesi?.id,
    sesi?.status,
    sesi?.waktuMulai,
    ujian?.id,
    ujian?.durasiMenit,
    ujian?.tanggalSelesai,
    readyStarted,
    isCompleted,
    getAuthoritativeNowMs,
    handleTimeExpired,
  ]);

  // --------------------------------------------------------------------------
  // 6. FULLSCREEN MONITORING, HIDDEN/LOCKED NAVIGATION & ANTI-CHEAT GUARDS
  // --------------------------------------------------------------------------
  const triggerViolation = useCallback(
    (jenis: any, keterangan: string) => {
      const activeSesi = sesiRef.current;
      const activeUjian = ujianRef.current;
      if (!activeSesi || isCompleted || activeSesi.status === 'terkunci') return;

      const now = Date.now();
      if (jenis !== 'copy_paste' && now - lastViolationAtRef.current < 2500) {
        return;
      }
      lastViolationAtRef.current = now;

      const maxViolations = Math.max(1, Number(activeUjian?.batasPelanggaran) || 3);
      const optimisticCount = (activeSesi.jumlahPelanggaran || 0) + 1;
      setCheatWarning(
        `${keterangan} (Peringatan ke-${optimisticCount} dari batas ${maxViolations} kali)`
      );

      try {
        sound.playError();
      } catch {}

      db.catatPelanggaranSiswa(activeSesi.id, jenis, keterangan)
        .then((updatedSesi) => {
          if (updatedSesi) {
            setSesi(updatedSesi);
          } else if (optimisticCount >= maxViolations) {
            setSesi((prev) =>
              prev ? { ...prev, status: 'terkunci', jumlahPelanggaran: optimisticCount } : null
            );
          }
        })
        .catch(() => {});
    },
    [isCompleted]
  );

  useEffect(() => {
    if (!sesi || !readyStarted || isCompleted || sesi.status === 'terkunci') return;

    // Trap browser Back button while exam is active (Hidden Navigation Enforcement)
    try {
      window.history.pushState({ cbtExamLocked: true }, '', window.location.href);
    } catch {}

    const handlePopState = () => {
      try {
        window.history.pushState({ cbtExamLocked: true }, '', window.location.href);
      } catch {}
      toast.warning(
        'Navigasi browser dikunci selama ujian berlangsung. Gunakan tombol "Kumpulkan" saat selesai.'
      );
    };

    const handleBeforeUnload = (e: BeforeUnloadEvent) => {
      // Flush draft synchronously to localStorage before reload/close
      persistLocalDraftSync({ pendingCloudSync: dirtySyncRef.current });
      if (dirtySyncRef.current && navigator.onLine) {
        flushCloudSync().catch(() => {});
      }
      e.preventDefault();
      e.returnValue = '';
    };

    const handlePageHide = () => {
      persistLocalDraftSync({ pendingCloudSync: dirtySyncRef.current });
      if (dirtySyncRef.current && navigator.onLine) {
        flushCloudSync().catch(() => {});
      }
    };

    const handleFsChange = () => {
      const doc: any = document;
      const active = Boolean(doc.fullscreenElement || doc.webkitFullscreenElement);
      const wasFullscreen = prevFullscreenRef.current;
      prevFullscreenRef.current = active;
      setIsFullscreen(active);
      // Only penalize exiting fullscreen when transitioning out of active fullscreen (never on page refresh restore)
      if (wasFullscreen && !active && ujian?.modeFullscreen !== false) {
        triggerViolation(
          'keluar_fullscreen',
          'Anda keluar dari mode layar penuh ujian.'
        );
      }
    };

    const handleVisibilityChange = () => {
      if (document.hidden) {
        persistLocalDraftSync({ pendingCloudSync: dirtySyncRef.current });
        if (dirtySyncRef.current && navigator.onLine) {
          flushCloudSync().catch(() => {});
        }
        triggerViolation(
          'pindah_tab',
          'Terdeteksi meninggalkan layar ujian atau membuka tab/aplikasi lain.'
        );
      }
    };

    const handleWindowBlur = () => {
      triggerViolation('jendela_blur', 'Jendela ujian kehilangan fokus aktif.');
    };

    const handleCopyPasteCut = (e: ClipboardEvent) => {
      e.preventDefault();
      triggerViolation(
        'copy_paste',
        'Tindakan menyalin, memotong, atau menempel teks dinonaktifkan selama ujian.'
      );
    };

    const handleContextMenu = (e: MouseEvent) => {
      e.preventDefault();
    };

    const handleKeyDownLock = (e: KeyboardEvent) => {
      const key = (e.key || '').toLowerCase();
      const mod = e.ctrlKey || e.metaKey;
      const isBlockedShortcut =
        e.key === 'F12' ||
        (mod && e.shiftKey && ['i', 'j', 'c'].includes(key)) ||
        (mod && ['u', 's', 'p'].includes(key)) ||
        (e.altKey && (e.key === 'ArrowLeft' || e.key === 'ArrowRight'));
      if (isBlockedShortcut) {
        e.preventDefault();
      }
    };

    window.addEventListener('popstate', handlePopState);
    window.addEventListener('beforeunload', handleBeforeUnload);
    window.addEventListener('pagehide', handlePageHide);
    document.addEventListener('fullscreenchange', handleFsChange);
    document.addEventListener('webkitfullscreenchange', handleFsChange);
    document.addEventListener('visibilitychange', handleVisibilityChange);
    window.addEventListener('blur', handleWindowBlur);
    document.addEventListener('copy', handleCopyPasteCut);
    document.addEventListener('cut', handleCopyPasteCut);
    document.addEventListener('paste', handleCopyPasteCut);
    document.addEventListener('contextmenu', handleContextMenu);
    window.addEventListener('keydown', handleKeyDownLock);

    return () => {
      window.removeEventListener('popstate', handlePopState);
      window.removeEventListener('beforeunload', handleBeforeUnload);
      window.removeEventListener('pagehide', handlePageHide);
      document.removeEventListener('fullscreenchange', handleFsChange);
      document.removeEventListener('webkitfullscreenchange', handleFsChange);
      document.removeEventListener('visibilitychange', handleVisibilityChange);
      window.removeEventListener('blur', handleWindowBlur);
      document.removeEventListener('copy', handleCopyPasteCut);
      document.removeEventListener('cut', handleCopyPasteCut);
      document.removeEventListener('paste', handleCopyPasteCut);
      document.removeEventListener('contextmenu', handleContextMenu);
      window.removeEventListener('keydown', handleKeyDownLock);
    };
  }, [
    sesi?.id,
    sesi?.status,
    ujian?.modeFullscreen,
    readyStarted,
    isCompleted,
    triggerViolation,
    persistLocalDraftSync,
    flushCloudSync,
  ]);

  // --------------------------------------------------------------------------
  // 7. ANSWER SUBMISSION & SEQUENCE-GUARDED RESILIENT AUTOSAVE
  // --------------------------------------------------------------------------
  const goToQuestion = useCallback(
    (nextIdx: number) => {
      const clamped = Math.max(0, nextIdx);
      setCurrentIndex(clamped);
      currentIndexRef.current = clamped;
      persistLocalDraftSync({
        currentIndex: clamped,
        pendingCloudSync: dirtySyncRef.current,
      });
      // Immediately flush any pending debounced text input when switching questions
      if (essaySaveTimerRef.current) {
        clearTimeout(essaySaveTimerRef.current);
        essaySaveTimerRef.current = null;
        flushCloudSync().catch(() => {});
      }
    },
    [persistLocalDraftSync, flushCloudSync]
  );

  const handleSelectAnswer = async (
    soalId: string,
    answerOriginalKeyOrText: string,
    displayLetter?: string,
    debounceWrite = false
  ) => {
    const activeSesi = sesiRef.current;
    if (!activeSesi || isCompleted || activeSesi.status === 'terkunci') return;

    const nowTs = Date.now();
    const existing = jawabanRef.current[soalId] || { jawabanDipilih: '' };
    const updatedDetail: DetailJawabanSiswa = {
      ...existing,
      jawabanDipilih: answerOriginalKeyOrText,
      opsiAsliDipilih: displayLetter ? answerOriginalKeyOrText : existing.opsiAsliDipilih,
      opsiTampilDipilih: displayLetter ?? existing.opsiTampilDipilih,
      waktuJawab: new Date(nowTs).toISOString(),
      clientUpdatedAt: nowTs,
    };

    const nextJawaban = {
      ...jawabanRef.current,
      [soalId]: updatedDetail,
    };
    jawabanRef.current = nextJawaban;
    setJawabanState(nextJawaban);

    // 1. Synchronous instant local persistence (never loses data even on immediate F5)
    dirtySyncRef.current = true;
    const updatedLocal = db.saveJawabanSiswaLocalSync(activeSesi.id, soalId, updatedDetail);
    persistLocalDraftSync({
      sesiObj: updatedLocal || activeSesi,
      jawaban: nextJawaban,
      pendingCloudSync: true,
    });

    if (typeof navigator !== 'undefined' && !navigator.onLine) {
      setSaveStatus('offline');
      return;
    }

    setSaveStatus('saving');

    // 2. Push to Firestore with confirmed status & backoff retry queue
    if (debounceWrite) {
      if (essaySaveTimerRef.current) clearTimeout(essaySaveTimerRef.current);
      essaySaveTimerRef.current = setTimeout(() => {
        essaySaveTimerRef.current = null;
        flushCloudSync(updatedLocal || activeSesi);
      }, 400);
    } else {
      await flushCloudSync(updatedLocal || activeSesi);
    }
  };

  const handleToggleRagu = async (soalId: string) => {
    const activeSesi = sesiRef.current;
    if (!activeSesi || isCompleted || activeSesi.status === 'terkunci') return;

    const nowTs = Date.now();
    const existing = jawabanRef.current[soalId] || { jawabanDipilih: '' };
    const updatedDetail: DetailJawabanSiswa = {
      ...existing,
      raguRagu: !existing.raguRagu,
      clientUpdatedAt: nowTs,
    };

    const nextJawaban = {
      ...jawabanRef.current,
      [soalId]: updatedDetail,
    };
    jawabanRef.current = nextJawaban;
    setJawabanState(nextJawaban);

    dirtySyncRef.current = true;
    const updatedLocal = db.saveJawabanSiswaLocalSync(activeSesi.id, soalId, updatedDetail);
    persistLocalDraftSync({
      sesiObj: updatedLocal || activeSesi,
      jawaban: nextJawaban,
      pendingCloudSync: true,
    });

    await flushCloudSync(updatedLocal || activeSesi);
  };

  const handleSubmitExam = async () => {
    const activeSesi = sesiRef.current;
    if (!activeSesi || !ujian) return;
    if (essaySaveTimerRef.current) {
      clearTimeout(essaySaveTimerRef.current);
      essaySaveTimerRef.current = null;
    }

    setIsSubmitting(true);
    try {
      db.saveSesiUjianLocal({
        ...activeSesi,
        jawaban: jawabanRef.current,
      });
      const submitRes = await db.submitUjianKeBackend(activeSesi.id);
      if (submitRes.sesi) {
        setSesi(submitRes.sesi);
        if (submitRes.syncedToServer) {
          dirtySyncRef.current = false;
          setSaveStatus('saved');
          clearActiveExamPointer(submitRes.sesi.id);
          clearExamDraftSnapshot(submitRes.sesi.id);
        } else {
          persistLocalDraftSync({
            sesiObj: submitRes.sesi,
            pendingCloudSync: true,
            pendingSubmitSync: true,
          });
        }
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
            type="button"
            onClick={() => {
              tryExitFullscreen();
              clearActiveExamPointer(sesi.id);
              onExit();
            }}
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
                  if (res.syncedToServer && res.sesi) {
                    clearActiveExamPointer(res.sesi.id);
                    clearExamDraftSnapshot(res.sesi.id);
                    toast.success('Berhasil disinkronkan ke server!');
                  }
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
                Ringkasan Hasil &amp; Pembahasan Per Nomor
              </h3>
              <div className="max-h-64 overflow-y-auto space-y-2 pr-1">
                {orderedSoalList.map((q, idx) => {
                  const ans = jawabanState[q.id];
                  const rev = pembahasanMap[q.id];
                  const explanationText = rev?.pembahasan || q.pembahasan;
                  return (
                    <div
                      key={q.id}
                      className="text-xs px-3.5 py-2.5 rounded-xl border border-slate-200 bg-slate-50 space-y-1.5"
                    >
                      <div className="flex items-center justify-between gap-2">
                        <span className="font-bold text-slate-800">Soal No. {idx + 1}</span>
                        <div className="flex items-center gap-2">
                          <span className="text-slate-600 max-w-[140px] truncate">
                            {q.tipe === 'isian_singkat' ? 'Jawaban: ' : q.tipe === 'benar_salah' ? 'Dipilih: ' : 'Pilihan: '}
                            <strong>{ans?.opsiTampilDipilih || ans?.jawabanDipilih || '-'}</strong>
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
                              {q.tipe === 'uraian' ? 'Uraian' : 'Tersimpan'}
                            </span>
                          )}
                        </div>
                      </div>
                      {(rev?.kunciJawaban || explanationText) && (
                        <div className="pt-1 border-t border-slate-200/80 text-[11px] text-slate-600 space-y-0.5">
                          {rev?.kunciJawaban && (
                            <div>
                              <span className="font-bold text-emerald-700">Kunci Jawaban: </span>
                              <span className="font-semibold text-slate-800">{rev.kunciJawaban}</span>
                            </div>
                          )}
                          {explanationText && (
                            <div className="leading-relaxed">
                              <span className="font-bold text-blue-700">Pembahasan: </span>
                              <span>{explanationText}</span>
                            </div>
                          )}
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {(() => {
            const maxAttempts = Math.max(1, Number(ujian?.jumlahPercobaan) || 1);
            const currentAttemptsCount = verifiedSiswa && ujian
              ? db.getSesiListBySiswaAndUjian(ujian.id, verifiedSiswa.id).length
              : Number(sesi.attemptNumber) || 1;
            const remainingAttempts = maxAttempts - currentAttemptsCount;
            const schedOk = ujian ? checkExamScheduleWindow(ujian, getAuthoritativeNowMs()).allowed : false;
            if (remainingAttempts <= 0 || !schedOk || !ujian) return null;

            return (
              <button
                type="button"
                onClick={async () => {
                  try {
                    const targetSiswa =
                      verifiedSiswa ||
                      (await db.resolveSiswaForVerification(sesi.nisn || sesi.siswaId, sesi.schoolId));
                    if (!targetSiswa) {
                      toast.error('Data siswa tidak ditemukan untuk memulai percobaan baru.');
                      return;
                    }
                    const nextSession = await db.createOrGetSesiUjian(ujian.id, targetSiswa, {
                      forceNewAttempt: true,
                    });
                    setIsCompleted(false);
                    setPembahasanMap(undefined);
                    setCurrentIndex(0);
                    await initSession(nextSession);
                  } catch (err: any) {
                    toast.error(err?.message || 'Gagal memulai ulang ujian.');
                  }
                }}
                className="w-full py-3 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl text-xs font-bold transition-all shadow-sm flex items-center justify-center gap-2 cursor-pointer"
              >
                <RefreshCw className="w-3.5 h-3.5" />
                <span>Kerjakan Ulang (Sisa Kesempatan: {remainingAttempts}x)</span>
              </button>
            );
          })()}

          <button
            type="button"
            onClick={() => {
              if (!sesi.pendingSubmitSync) {
                clearActiveExamPointer(sesi.id);
                clearExamDraftSnapshot(sesi.id);
              }
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
              onClick={() => {
                clearActiveExamPointer(sesi.id);
                onExit();
              }}
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
      {/* Re-enter Fullscreen Banner if user exited or reloaded without fullscreen gesture */}
      {ujian?.modeFullscreen !== false && !isFullscreen && (
        <div className="bg-amber-500 text-slate-950 px-3 py-2 text-xs font-bold flex items-center justify-between gap-2 z-50">
          <div className="flex items-center gap-2 min-w-0">
            <ShieldAlert className="w-4 h-4 shrink-0" />
            <span className="truncate">Mode layar penuh belum aktif. Ketuk tombol di kanan untuk mengaktifkan.</span>
          </div>
          <button
            type="button"
            onClick={tryEnterFullscreen}
            className="px-3 py-1.5 rounded-lg bg-slate-950 text-white text-[11px] font-bold shrink-0 cursor-pointer flex items-center gap-1 min-h-[34px]"
          >
            <Maximize2 className="w-3.5 h-3.5" />
            <span>Masuk Layar Penuh</span>
          </button>
        </div>
      )}

      {/* Top Bar (Portal Navigation Hidden During Active Exam) */}
      <header className="sticky top-0 z-40 bg-white border-b border-slate-200 shadow-xs px-3 sm:px-6 pt-[env(safe-area-inset-top)] h-14 sm:h-16 flex items-center justify-between gap-2">
        <div className="flex items-center gap-2.5 min-w-0">
          <div className="w-9 h-9 rounded-xl bg-blue-700 text-white flex items-center justify-center font-bold text-sm shadow-xs shrink-0">
            <BookOpen className="w-5 h-5" />
          </div>
          <div className="min-w-0">
            <h1 className="text-xs sm:text-sm font-extrabold text-slate-900 leading-tight truncate max-w-[140px] sm:max-w-xs md:max-w-md">
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

        {/* Persistent Server-Synced Timer & Auto-Save Status */}
        <div className="flex items-center gap-1.5 sm:gap-3 shrink-0">
          <div
            title={
              isServerClockSynced
                ? 'Waktu tersinkronisasi dengan server ujian'
                : 'Menggunakan penanda waktu sesi tersimpan'
            }
            className={`flex items-center gap-1.5 px-2.5 sm:px-3 py-1.5 rounded-xl text-xs font-bold shadow-xs transition-colors ${
              isTimeCritical
                ? 'bg-rose-50 text-rose-700 border border-rose-300'
                : 'bg-blue-50 text-blue-900 border border-blue-200'
            }`}
          >
            {isTimeCritical ? (
              <AlertTriangle className="w-3.5 h-3.5 shrink-0 text-rose-600" />
            ) : (
              <Clock className="w-3.5 h-3.5 shrink-0" />
            )}
            <span className="tabular-nums">{formatTimer(timeLeftSeconds)}</span>
            {isTimeCritical && (
              <span className="hidden md:inline text-[10px] font-extrabold uppercase tracking-wide">
                &bull; Segera
              </span>
            )}
          </div>

          <button
            type="button"
            onClick={() => flushCloudSync()}
            title={
              saveStatus === 'saved'
                ? 'Semua jawaban aman tersimpan di server & perangkat'
                : saveStatus === 'saving'
                ? 'Sedang mengirim jawaban ke server...'
                : saveStatus === 'pending'
                ? 'Tersimpan di perangkat — menunggu sinkronisasi server (ketuk untuk coba lagi)'
                : 'Koneksi terputus — jawaban tersimpan aman di perangkat'
            }
            className="flex items-center gap-1 px-2 py-1.5 rounded-lg text-[11px] font-semibold border border-slate-200 bg-slate-50 hover:bg-slate-100 transition-colors cursor-pointer"
          >
            {saveStatus === 'saved' ? (
              <>
                <CheckCircle className="w-3.5 h-3.5 text-emerald-600 shrink-0" />
                <span className="hidden sm:inline text-emerald-700">Tersimpan</span>
              </>
            ) : saveStatus === 'saving' ? (
              <>
                <RefreshCw className="w-3.5 h-3.5 text-blue-600 animate-spin shrink-0" />
                <span className="hidden sm:inline text-slate-600">Menyimpan...</span>
              </>
            ) : saveStatus === 'pending' ? (
              <>
                <UploadCloud className="w-3.5 h-3.5 text-amber-600 shrink-0" />
                <span className="hidden sm:inline text-amber-700">Antre Sync</span>
              </>
            ) : (
              <>
                <AlertTriangle className="w-3.5 h-3.5 text-amber-600 shrink-0" />
                <span className="hidden sm:inline text-amber-700">Lokal (Offline)</span>
              </>
            )}
          </button>

          <button
            type="button"
            onClick={() => {
              if (dirtySyncRef.current && navigator.onLine) {
                flushCloudSync().catch(() => {});
              }
              setShowSubmitModal(true);
            }}
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
                    {currentSoal.tipe === 'pilihan_ganda'
                      ? 'Pilihan Ganda'
                      : currentSoal.tipe === 'benar_salah'
                      ? 'Benar / Salah'
                      : currentSoal.tipe === 'isian_singkat'
                      ? 'Isian Singkat'
                      : 'Uraian / Esai'}
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
              ) : currentSoal.tipe === 'benar_salah' ? (
                <div className="pt-2 grid grid-cols-1 sm:grid-cols-2 gap-3">
                  {(['BENAR', 'SALAH'] as const).map((tfVal) => {
                    const isSelected = (currentDetail.jawabanDipilih || '').toUpperCase() === tfVal;
                    return (
                      <button
                        key={tfVal}
                        type="button"
                        onClick={() => handleSelectAnswer(currentSoal.id, tfVal, tfVal, false)}
                        className={`p-4 rounded-2xl border text-left transition-all flex items-center gap-3 cursor-pointer min-h-[56px] ${
                          isSelected
                            ? tfVal === 'BENAR'
                              ? 'bg-emerald-50 border-emerald-600 ring-2 ring-emerald-600/20 text-emerald-950 font-bold shadow-xs'
                              : 'bg-rose-50 border-rose-600 ring-2 ring-rose-600/20 text-rose-950 font-bold shadow-xs'
                            : 'bg-white border-slate-200 hover:border-slate-300 text-slate-800'
                        }`}
                      >
                        <span
                          className={`w-9 h-9 rounded-xl flex items-center justify-center text-sm font-extrabold shrink-0 ${
                            isSelected
                              ? tfVal === 'BENAR'
                                ? 'bg-emerald-600 text-white'
                                : 'bg-rose-600 text-white'
                              : 'bg-slate-100 text-slate-700'
                          }`}
                        >
                          {tfVal === 'BENAR' ? 'B' : 'S'}
                        </span>
                        <div>
                          <span className="block text-sm font-extrabold">
                            {tfVal === 'BENAR' ? 'BENAR' : 'SALAH'}
                          </span>
                          <span className="text-[11px] text-slate-500 font-normal">
                            {tfVal === 'BENAR' ? 'Pernyataan di atas sesuai / benar' : 'Pernyataan di atas tidak sesuai / salah'}
                          </span>
                        </div>
                      </button>
                    );
                  })}
                </div>
              ) : currentSoal.tipe === 'isian_singkat' ? (
                <div className="space-y-2 pt-2">
                  <label className="text-xs font-bold text-slate-700">
                    Tuliskan Jawaban Singkat Anda:
                  </label>
                  <input
                    type="text"
                    value={currentDetail.jawabanDipilih || ''}
                    onChange={(e) => handleSelectAnswer(currentSoal.id, e.target.value, undefined, true)}
                    placeholder="Ketik jawaban singkat dengan ejaan yang tepat..."
                    className="w-full py-3.5 px-4 rounded-2xl border border-slate-200 focus:border-blue-600 focus:ring-4 focus:ring-blue-100 outline-none text-sm font-semibold transition-all"
                  />
                  <div className="flex justify-between text-[11px] text-slate-400">
                    <span>Isi dengan kata, angka, atau istilah singkat yang tepat.</span>
                    <span>{(currentDetail.jawabanDipilih || '').length} karakter</span>
                  </div>
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
                  onClick={() => goToQuestion(Math.max(0, currentIndex - 1))}
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
                    onClick={() => goToQuestion(Math.min(totalSoal - 1, currentIndex + 1))}
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
              <span className="text-[11px] font-semibold text-blue-700 bg-blue-50 px-2 py-0.5 rounded-full tabular-nums">
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
                    onClick={() => goToQuestion(idx)}
                    className={`h-10 rounded-xl text-xs font-bold transition-all flex items-center justify-center cursor-pointer tabular-nums ${
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
          onClick={() => goToQuestion(Math.max(0, currentIndex - 1))}
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
          <span className="tabular-nums">
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
            onClick={() => goToQuestion(Math.min(totalSoal - 1, currentIndex + 1))}
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
                <p className="text-[11px] text-slate-500 tabular-nums">
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
                      goToQuestion(idx);
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
