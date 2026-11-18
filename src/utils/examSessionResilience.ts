import { DetailJawabanSiswa, LogPelanggaranSesi, SesiUjianSiswa } from '../types';

export interface ActiveExamPointer {
  sessionId: string;
  ujianId: string;
  schoolId: string;
  sessionToken?: string;
  currentIndex: number;
  readyStarted: boolean;
  updatedAt: number;
}

export interface ExamDraftSnapshot {
  sessionId: string;
  ujianId: string;
  schoolId: string;
  status: SesiUjianSiswa['status'];
  waktuMulai?: string;
  jawaban: { [soalId: string]: DetailJawabanSiswa };
  currentIndex: number;
  readyStarted: boolean;
  pendingCloudSync: boolean;
  pendingSubmitSync?: boolean;
  lastLocalSavedAt: number;
  lastCloudSyncedAt?: number;
}

export interface ServerClockState {
  offsetMs: number;
  anchorServerMs: number;
  anchorPerfMs: number;
  rttMs: number;
  syncedAtClientMs: number;
  hasServerSync: boolean;
}

const ACTIVE_POINTER_KEY = 'cbt_active_session_ptr_v1';
const DRAFT_KEY_PREFIX = 'cbt_session_draft_v1_';
const CLOCK_OFFSET_KEY = 'cbt_server_clock_offset_v1';

function safeParseTimestampMs(iso?: string): number {
  if (!iso) return 0;
  const parsed = Date.parse(iso);
  return Number.isFinite(parsed) ? parsed : 0;
}

function mergeLogPelanggaran(
  localLogs: LogPelanggaranSesi[] = [],
  remoteLogs: LogPelanggaranSesi[] = []
): LogPelanggaranSesi[] {
  const seen = new Set<string>();
  const combined: LogPelanggaranSesi[] = [];
  for (const entry of [...localLogs, ...remoteLogs]) {
    if (!entry) continue;
    const key = `${entry.waktu || ''}_${entry.jenis || ''}_${entry.keterangan || ''}`;
    if (seen.has(key)) continue;
    seen.add(key);
    combined.push(entry);
  }
  combined.sort((a, b) => safeParseTimestampMs(b.waktu) - safeParseTimestampMs(a.waktu));
  return combined.slice(0, 50);
}

/**
 * Monotonically merges a local and remote `SesiUjianSiswa` record so incoming Firestore
 * snapshots during unstable connections NEVER erase newer local student answers or
 * un-synced offline submissions, while still honoring proctor lock/unlock & backend grades.
 */
export function mergeExamSessionMonotonic(
  localSesi: SesiUjianSiswa | undefined,
  remoteSesi: SesiUjianSiswa
): SesiUjianSiswa {
  if (!localSesi) return remoteSesi;

  // 1. Per-question monotonic answer merge using clientUpdatedAt
  const mergedJawaban: { [soalId: string]: DetailJawabanSiswa } = {};
  const allSoalIds = new Set<string>([
    ...Object.keys(remoteSesi.jawaban || {}),
    ...Object.keys(localSesi.jawaban || {}),
  ]);

  allSoalIds.forEach((soalId) => {
    const loc = localSesi.jawaban?.[soalId];
    const rem = remoteSesi.jawaban?.[soalId];
    if (!loc && rem) {
      mergedJawaban[soalId] = rem;
      return;
    }
    if (loc && !rem) {
      mergedJawaban[soalId] = loc;
      return;
    }
    if (loc && rem) {
      const locTs = Number(loc.clientUpdatedAt) || safeParseTimestampMs(loc.waktuJawab);
      const remTs = Number(rem.clientUpdatedAt) || safeParseTimestampMs(rem.waktuJawab);
      const winner = locTs >= remTs ? loc : rem;
      mergedJawaban[soalId] = {
        ...winner,
        // Always keep teacher manual essay score / note if graded remotely or locally
        nilaiManual: typeof rem.nilaiManual === 'number' ? rem.nilaiManual : loc.nilaiManual,
        catatanGuru: rem.catatanGuru || loc.catatanGuru,
      };
    }
  });

  // 2. Preserve earliest valid start time
  const localStartMs = safeParseTimestampMs(localSesi.waktuMulai);
  const remoteStartMs = safeParseTimestampMs(remoteSesi.waktuMulai);
  let waktuMulai = remoteSesi.waktuMulai || localSesi.waktuMulai;
  if (localStartMs > 0 && remoteStartMs > 0) {
    waktuMulai = localStartMs <= remoteStartMs ? localSesi.waktuMulai : remoteSesi.waktuMulai;
  } else if (localStartMs > 0) {
    waktuMulai = localSesi.waktuMulai;
  }

  // 3. Preserve locked question & option order
  const urutanSoalIds =
    remoteSesi.urutanSoalIds && remoteSesi.urutanSoalIds.length > 0
      ? remoteSesi.urutanSoalIds
      : localSesi.urutanSoalIds;
  const urutanPilihanMap =
    remoteSesi.urutanPilihanMap && Object.keys(remoteSesi.urutanPilihanMap).length > 0
      ? remoteSesi.urutanPilihanMap
      : localSesi.urutanPilihanMap;

  // 4. Status & sync-state resolution
  const localUpdatedMs = safeParseTimestampMs(localSesi.updatedAt);
  const remoteUpdatedMs = safeParseTimestampMs(remoteSesi.updatedAt);
  const remoteGradedDone =
    (remoteSesi.status === 'selesai' || remoteSesi.status === 'waktu_habis') &&
    remoteSesi.gradedBy === 'backend' &&
    remoteSesi.pendingSubmitSync === false;

  let status = remoteSesi.status;
  let pendingSubmitSync = remoteSesi.pendingSubmitSync;

  if (remoteGradedDone) {
    status = remoteSesi.status;
    pendingSubmitSync = false;
  } else if (localSesi.pendingSubmitSync) {
    // Student already clicked Submit offline — never let stale in-progress snapshot revert it
    status = localSesi.status;
    pendingSubmitSync = true;
  } else if (remoteSesi.status === 'terkunci' || localSesi.status === 'terkunci') {
    // Proctor Lock or Unlock uses latest updatedAt timestamp
    status = remoteUpdatedMs >= localUpdatedMs ? remoteSesi.status : localSesi.status;
  } else if (
    localSesi.status === 'sedang_mengerjakan' &&
    remoteSesi.status === 'terverifikasi'
  ) {
    status = 'sedang_mengerjakan';
  }

  // Prefer backend-graded numbers if remote has them, else preserve local
  const preferRemoteScores =
    remoteGradedDone ||
    (remoteUpdatedMs >= localUpdatedMs &&
      (remoteSesi.gradedBy === 'backend' || typeof remoteSesi.nilaiAkhir === 'number'));

  return {
    ...localSesi,
    ...remoteSesi,
    status,
    waktuMulai,
    waktuSelesai: remoteSesi.waktuSelesai || localSesi.waktuSelesai,
    durasiDetik: remoteSesi.durasiDetik || localSesi.durasiDetik,
    urutanSoalIds,
    urutanPilihanMap,
    jawaban: mergedJawaban,
    nilaiPg: preferRemoteScores ? remoteSesi.nilaiPg : localSesi.nilaiPg,
    nilaiUraian: preferRemoteScores ? remoteSesi.nilaiUraian : localSesi.nilaiUraian,
    nilaiAkhir: preferRemoteScores ? remoteSesi.nilaiAkhir : localSesi.nilaiAkhir,
    jumlahBenar: preferRemoteScores ? remoteSesi.jumlahBenar : localSesi.jumlahBenar,
    jumlahSalah: preferRemoteScores ? remoteSesi.jumlahSalah : localSesi.jumlahSalah,
    jumlahKosong: preferRemoteScores ? remoteSesi.jumlahKosong : localSesi.jumlahKosong,
    lulusKkm: preferRemoteScores ? remoteSesi.lulusKkm : localSesi.lulusKkm,
    adaUraianBelumDinilai: preferRemoteScores
      ? remoteSesi.adaUraianBelumDinilai
      : localSesi.adaUraianBelumDinilai,
    pendingSubmitSync,
    jumlahPelanggaran: Math.max(
      Number(localSesi.jumlahPelanggaran) || 0,
      Number(remoteSesi.jumlahPelanggaran) || 0
    ),
    logPelanggaran: mergeLogPelanggaran(localSesi.logPelanggaran, remoteSesi.logPelanggaran),
    terakhirAktif:
      safeParseTimestampMs(localSesi.terakhirAktif) >=
      safeParseTimestampMs(remoteSesi.terakhirAktif)
        ? localSesi.terakhirAktif
        : remoteSesi.terakhirAktif,
    updatedAt: localUpdatedMs > remoteUpdatedMs ? localSesi.updatedAt : remoteSesi.updatedAt,
  };
}

/**
 * Merges a remote `exam_sessions` snapshot array with local sessions while preserving
 * local-only sessions (created offline) and monotonic per-answer timestamps.
 */
export function mergeExamSessionListMonotonic(
  localList: SesiUjianSiswa[],
  remoteList: SesiUjianSiswa[]
): {
  mergedList: SesiUjianSiswa[];
  sessionsNeedingUpload: SesiUjianSiswa[];
} {
  const localMap = new Map<string, SesiUjianSiswa>();
  (localList || []).forEach((s) => {
    if (s && s.id) localMap.set(s.id, s);
  });

  const mergedById = new Map<string, SesiUjianSiswa>();
  const sessionsNeedingUpload: SesiUjianSiswa[] = [];

  (remoteList || []).forEach((remoteItem) => {
    if (!remoteItem || !remoteItem.id) return;
    const localItem = localMap.get(remoteItem.id);
    if (!localItem) {
      mergedById.set(remoteItem.id, remoteItem);
      return;
    }
    const merged = mergeExamSessionMonotonic(localItem, remoteItem);
    mergedById.set(remoteItem.id, merged);

    // Detect if local had newer answers or pending submit that remote did not have yet
    const localLatestAnsTs = Object.values(localItem.jawaban || {}).reduce(
      (max, a) => Math.max(max, Number(a?.clientUpdatedAt) || 0),
      0
    );
    const remoteLatestAnsTs = Object.values(remoteItem.jawaban || {}).reduce(
      (max, a) => Math.max(max, Number(a?.clientUpdatedAt) || 0),
      0
    );
    if (
      localLatestAnsTs > remoteLatestAnsTs ||
      (localItem.pendingSubmitSync && !remoteItem.gradedBy) ||
      (localItem.status === 'sedang_mengerjakan' && remoteItem.status === 'terverifikasi')
    ) {
      sessionsNeedingUpload.push(merged);
    }
  });

  // Preserve sessions created locally (e.g. while offline) not yet present in remote snapshot
  localMap.forEach((localItem, id) => {
    if (!mergedById.has(id)) {
      mergedById.set(id, localItem);
      sessionsNeedingUpload.push(localItem);
    }
  });

  return {
    mergedList: Array.from(mergedById.values()),
    sessionsNeedingUpload,
  };
}

/**
 * Merges a synchronous `localStorage` draft snapshot back into a session record
 * during page reload / connection recovery.
 */
export function mergeDraftIntoSession(
  sesi: SesiUjianSiswa,
  draft: ExamDraftSnapshot | null
): SesiUjianSiswa {
  if (!draft || draft.sessionId !== sesi.id) return sesi;

  const mergedJawaban: { [soalId: string]: DetailJawabanSiswa } = {
    ...(sesi.jawaban || {}),
  };

  Object.keys(draft.jawaban || {}).forEach((soalId) => {
    const draftAns = draft.jawaban[soalId];
    const sesiAns = mergedJawaban[soalId];
    if (!draftAns) return;
    const draftTs = Number(draftAns.clientUpdatedAt) || 0;
    const sesiTs = Number(sesiAns?.clientUpdatedAt) || 0;
    if (!sesiAns || draftTs >= sesiTs) {
      mergedJawaban[soalId] = {
        ...draftAns,
        nilaiManual: sesiAns?.nilaiManual ?? draftAns.nilaiManual,
        catatanGuru: sesiAns?.catatanGuru ?? draftAns.catatanGuru,
      };
    }
  });

  const nextStatus =
    sesi.status === 'selesai' || sesi.status === 'waktu_habis' || sesi.status === 'terkunci'
      ? sesi.status
      : draft.status === 'sedang_mengerjakan'
      ? 'sedang_mengerjakan'
      : sesi.status;

  return {
    ...sesi,
    status: nextStatus,
    waktuMulai: sesi.waktuMulai || draft.waktuMulai,
    jawaban: mergedJawaban,
    pendingSubmitSync: sesi.pendingSubmitSync || draft.pendingSubmitSync,
  };
}

// ---------------------------------------------------------------------------
// Monotonic Server Clock Synchronization (immune to device clock tampering)
// ---------------------------------------------------------------------------

export function computeServerSyncSample(params: {
  reqStartPerfMs: number;
  reqEndPerfMs: number;
  reqEndClientMs: number;
  serverTimeMs: number;
}): ServerClockState {
  const rttMs = Math.max(0, params.reqEndPerfMs - params.reqStartPerfMs);
  const estimatedServerAtEndMs = params.serverTimeMs + Math.round(rttMs / 2);
  const offsetMs = estimatedServerAtEndMs - params.reqEndClientMs;

  return {
    offsetMs,
    anchorServerMs: estimatedServerAtEndMs,
    anchorPerfMs: params.reqEndPerfMs,
    rttMs,
    syncedAtClientMs: params.reqEndClientMs,
    hasServerSync: true,
  };
}

export function getAuthoritativeNowFromClock(
  clock: ServerClockState,
  nowPerfMs: number = typeof performance !== 'undefined' ? performance.now() : 0,
  nowClientMs: number = Date.now()
): number {
  if (clock.hasServerSync && clock.anchorServerMs > 0 && nowPerfMs >= clock.anchorPerfMs) {
    return Math.round(clock.anchorServerMs + (nowPerfMs - clock.anchorPerfMs));
  }
  return Math.round(nowClientMs + (clock.offsetMs || 0));
}

export function computeRemainingExamSeconds(params: {
  startIso?: string;
  durasiMenit?: number;
  tanggalSelesai?: string;
  authoritativeNowMs: number;
}): { remainingSec: number; targetEndMs: number } {
  const durasiMs = Math.max(1, Number(params.durasiMenit) || 60) * 60 * 1000;
  const startMs = safeParseTimestampMs(params.startIso);
  const effectiveStartMs = startMs > 0 ? startMs : params.authoritativeNowMs;
  const durationEndMs = effectiveStartMs + durasiMs;

  const scheduleEndMs = safeParseTimestampMs(params.tanggalSelesai);
  const targetEndMs =
    scheduleEndMs > 0 ? Math.min(durationEndMs, scheduleEndMs) : durationEndMs;

  const remainingSec = Math.max(
    0,
    Math.ceil((targetEndMs - params.authoritativeNowMs) / 1000)
  );
  return { remainingSec, targetEndMs };
}

// ---------------------------------------------------------------------------
// Synchronous LocalStorage Persistence Helpers
// ---------------------------------------------------------------------------

function hasLocalStorage(): boolean {
  try {
    return typeof window !== 'undefined' && typeof window.localStorage !== 'undefined';
  } catch {
    return false;
  }
}

export function saveActiveExamPointer(ptr: ActiveExamPointer): void {
  if (!hasLocalStorage()) return;
  try {
    window.localStorage.setItem(ACTIVE_POINTER_KEY, JSON.stringify(ptr));
  } catch {}
}

export function loadActiveExamPointer(): ActiveExamPointer | null {
  if (!hasLocalStorage()) return null;
  try {
    const raw = window.localStorage.getItem(ACTIVE_POINTER_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as ActiveExamPointer;
    if (!parsed || !parsed.sessionId || !parsed.ujianId) return null;
    return parsed;
  } catch {
    return null;
  }
}

export function clearActiveExamPointer(sessionId?: string): void {
  if (!hasLocalStorage()) return;
  try {
    if (sessionId) {
      const current = loadActiveExamPointer();
      if (current && current.sessionId !== sessionId) return;
    }
    window.localStorage.removeItem(ACTIVE_POINTER_KEY);
  } catch {}
}

export function saveExamDraftSnapshot(draft: ExamDraftSnapshot): void {
  if (!hasLocalStorage() || !draft?.sessionId) return;
  try {
    window.localStorage.setItem(`${DRAFT_KEY_PREFIX}${draft.sessionId}`, JSON.stringify(draft));
  } catch {}
}

export function loadExamDraftSnapshot(sessionId: string): ExamDraftSnapshot | null {
  if (!hasLocalStorage() || !sessionId) return null;
  try {
    const raw = window.localStorage.getItem(`${DRAFT_KEY_PREFIX}${sessionId}`);
    if (!raw) return null;
    return JSON.parse(raw) as ExamDraftSnapshot;
  } catch {
    return null;
  }
}

export function clearExamDraftSnapshot(sessionId: string): void {
  if (!hasLocalStorage() || !sessionId) return;
  try {
    window.localStorage.removeItem(`${DRAFT_KEY_PREFIX}${sessionId}`);
  } catch {}
}

export function savePersistedClockOffset(offsetMs: number): void {
  if (!hasLocalStorage() || !Number.isFinite(offsetMs)) return;
  try {
    window.localStorage.setItem(
      CLOCK_OFFSET_KEY,
      JSON.stringify({ offsetMs: Math.round(offsetMs), savedAt: Date.now() })
    );
  } catch {}
}

export function loadPersistedClockOffset(maxAgeMs = 12 * 60 * 60 * 1000): number {
  if (!hasLocalStorage()) return 0;
  try {
    const raw = window.localStorage.getItem(CLOCK_OFFSET_KEY);
    if (!raw) return 0;
    const parsed = JSON.parse(raw);
    if (
      typeof parsed?.offsetMs === 'number' &&
      typeof parsed?.savedAt === 'number' &&
      Date.now() - parsed.savedAt <= maxAgeMs
    ) {
      return parsed.offsetMs;
    }
    return 0;
  } catch {
    return 0;
  }
}
