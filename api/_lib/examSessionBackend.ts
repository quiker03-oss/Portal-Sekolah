import fs from "fs";
import path from "path";
import crypto from "crypto";

export interface DeviceSessionInfo {
  deviceId: string;
  userAgent: string;
  platform: string;
  screenResolution: string;
  language?: string;
  browserSummary?: string;
  ip?: string;
  loginAt: string;
  lastActiveAt?: string;
}

export interface AuditLogUjian {
  id: string;
  ujianId: string;
  siswaId: string;
  namaSiswa: string;
  kelas: string;
  waktu: string;
  tipe:
    | "login_awal"
    | "pemulihan_sesi"
    | "deteksi_perangkat_ganda"
    | "kunci_otomatis"
    | "buka_kunci_guru"
    | "simpan_jawaban_ditolak"
    | "selesai_ujian";
  deskripsi: string;
  alasan?: string;
  deviceAwal?: Partial<DeviceSessionInfo>;
  deviceMencurigakan?: Partial<DeviceSessionInfo>;
  aktor?: string;
}

export interface ServerExamSession {
  id: string;
  schoolId?: string;
  ujianId: string;
  siswaId: string;
  namaSiswa: string;
  nisn?: string;
  nomorInduk?: string;
  kelas: string;
  sessionToken: string;
  status: "sedang_mengerjakan" | "selesai" | "waktu_habis" | "terkunci" | "mencurigakan";
  deviceInfo: DeviceSessionInfo;
  deviceMencurigakan?: DeviceSessionInfo;
  waktuAktivitasMencurigakan?: string;
  terkunciOlehSistem?: boolean;
  alasanTerkunci?: string;
  waktuTerkunci?: string;
  dibukaOlehGuru?: boolean;
  jawaban: Record<string, any>;
  waktuMulai: string;
  waktuSelesai?: string;
  terakhirAktif: string;
  jumlahPelanggaran?: number;
  logPelanggaran?: any[];
  riwayatAudit: AuditLogUjian[];
  nilaiAkhir?: number;
  jumlahBenar?: number;
  jumlahSalah?: number;
  jumlahKosong?: number;
  lulusKkm?: boolean;
  createdAt: string;
  updatedAt: string;
}

// In-memory sessions index: key = `${ujianId}_${siswaId}`
const sessionsStore = new Map<string, ServerExamSession>();

// Global audit log repository
const auditLogsStore: AuditLogUjian[] = [];

// Per-session execution mutex to guarantee strict atomicity across concurrent device requests
const sessionLocks = new Map<string, Promise<void>>();

async function withAtomicLock<T>(key: string, fn: () => Promise<T>): Promise<T> {
  while (sessionLocks.has(key)) {
    try {
      await sessionLocks.get(key);
    } catch {
      // ignore
    }
  }

  let releaseLock: () => void = () => {};
  const lockPromise = new Promise<void>((resolve) => {
    releaseLock = resolve;
  });
  sessionLocks.set(key, lockPromise);

  try {
    return await fn();
  } finally {
    sessionLocks.delete(key);
    releaseLock();
  }
}

// File persistence paths
const DATA_DIR = path.join(process.cwd(), "data");
const SESSIONS_FILE = path.join(DATA_DIR, "ujian_sessions.json");
const AUDIT_FILE = path.join(DATA_DIR, "ujian_audit_logs.json");

// Ensure data directory exists
function ensureDataDir() {
  try {
    if (!fs.existsSync(DATA_DIR)) {
      fs.mkdirSync(DATA_DIR, { recursive: true });
    }
  } catch (err) {
    console.error("[ExamBackend] Failed to ensure data directory:", err);
  }
}

// Load persisted data on server boot
function initPersistence() {
  ensureDataDir();
  try {
    if (fs.existsSync(SESSIONS_FILE)) {
      const raw = fs.readFileSync(SESSIONS_FILE, "utf-8");
      const list: ServerExamSession[] = JSON.parse(raw);
      list.forEach((s) => {
        const key = `${s.ujianId}_${s.siswaId}`;
        sessionsStore.set(key, s);
      });
      console.log(`[ExamBackend] Loaded ${sessionsStore.size} exam sessions from disk.`);
    }
  } catch (err) {
    console.error("[ExamBackend] Error loading sessions file:", err);
  }

  try {
    if (fs.existsSync(AUDIT_FILE)) {
      const raw = fs.readFileSync(AUDIT_FILE, "utf-8");
      const list: AuditLogUjian[] = JSON.parse(raw);
      auditLogsStore.push(...list);
      console.log(`[ExamBackend] Loaded ${auditLogsStore.length} audit logs from disk.`);
    }
  } catch (err) {
    console.error("[ExamBackend] Error loading audit logs file:", err);
  }
}

// Save sessions to disk
function persistSessionsToDisk() {
  try {
    ensureDataDir();
    const list = Array.from(sessionsStore.values());
    fs.writeFileSync(SESSIONS_FILE, JSON.stringify(list, null, 2), "utf-8");
  } catch (err) {
    console.error("[ExamBackend] Error saving sessions to disk:", err);
  }
}

// Save audit logs to disk
function persistAuditLogsToDisk() {
  try {
    ensureDataDir();
    fs.writeFileSync(AUDIT_FILE, JSON.stringify(auditLogsStore, null, 2), "utf-8");
  } catch (err) {
    console.error("[ExamBackend] Error saving audit logs to disk:", err);
  }
}

// Initialize immediately upon loading module
initPersistence();

// Helper to record an audit log
function recordAuditLog(log: Omit<AuditLogUjian, "id" | "waktu"> & { waktu?: string }): AuditLogUjian {
  const newLog: AuditLogUjian = {
    id: `audit-${Date.now()}-${crypto.randomBytes(3).toString("hex")}`,
    waktu: log.waktu || new Date().toISOString(),
    ujianId: log.ujianId,
    siswaId: log.siswaId,
    namaSiswa: log.namaSiswa,
    kelas: log.kelas,
    tipe: log.tipe,
    deskripsi: log.deskripsi,
    alasan: log.alasan,
    deviceAwal: log.deviceAwal,
    deviceMencurigakan: log.deviceMencurigakan,
    aktor: log.aktor || "Sistem Server (Otomatis)",
  };

  auditLogsStore.unshift(newLog);
  // Keep up to 2000 logs in memory
  if (auditLogsStore.length > 2000) {
    auditLogsStore.length = 2000;
  }
  persistAuditLogsToDisk();
  return newLog;
}

/**
 * 1. Endpoint: START / RECOVER EXAM SESSION
 * Detects multiple devices, enforces atomic lock, and allows legitimate same-device reconnects.
 */
export async function handleStartExamSession(
  payload: {
    ujianId: string;
    siswaId: string;
    namaSiswa: string;
    nisn?: string;
    nomorInduk?: string;
    kelas: string;
    schoolId?: string;
    device: DeviceSessionInfo;
    sessionToken?: string;
  },
  clientIp?: string
) {
  const { ujianId, siswaId, namaSiswa, nisn, nomorInduk, kelas, schoolId, device, sessionToken } = payload;

  if (!ujianId || !siswaId) {
    return {
      success: false,
      error: "ID Ujian dan ID Siswa harus disertakan.",
    };
  }

  const sessionKey = `${ujianId}_${siswaId}`;

  return await withAtomicLock(sessionKey, async () => {
    const now = new Date().toISOString();
    const existing = sessionsStore.get(sessionKey);

    // Clean device info with server-detected IP
    const currentDevice: DeviceSessionInfo = {
      ...device,
      ip: clientIp || device.ip || "127.0.0.1",
      loginAt: device.loginAt || now,
      lastActiveAt: now,
    };

    // Case 1: Session is already locked
    if (existing && existing.status === "terkunci") {
      // Reject any new access attempt
      return {
        success: false,
        locked: true,
        status: "terkunci",
        alasanTerkunci:
          existing.alasanTerkunci ||
          "Ujian dikunci sementara karena terdeteksi akses dari perangkat atau sesi lain. Silakan hubungi guru pengawas.",
        waktuTerkunci: existing.waktuTerkunci,
        message:
          "Ujian dikunci sementara karena terdeteksi akses dari perangkat atau sesi lain. Silakan hubungi guru pengawas.",
        answers: existing.jawaban,
        deviceMencurigakan: existing.deviceMencurigakan,
      };
    }

    // Case 2: Session is already finished
    if (existing && (existing.status === "selesai" || existing.status === "waktu_habis")) {
      return {
        success: false,
        finished: true,
        status: existing.status,
        message: "Sesi ujian ini telah selesai dikerjakan.",
        session: existing,
      };
    }

    // Case 3: Session is active ('sedang_mengerjakan')
    if (existing && existing.status === "sedang_mengerjakan") {
      const registeredDeviceId = existing.deviceInfo?.deviceId;
      const incomingDeviceId = currentDevice.deviceId;

      // SUB-CASE 3A: Same device (Legitimate session recovery, page refresh, or brief disconnect)
      if (registeredDeviceId && incomingDeviceId && registeredDeviceId === incomingDeviceId) {
        existing.terakhirAktif = now;
        existing.deviceInfo.lastActiveAt = now;
        if (!existing.sessionToken) {
          existing.sessionToken = crypto.randomUUID();
        }

        const recoveryAudit = recordAuditLog({
          ujianId,
          siswaId,
          namaSiswa: existing.namaSiswa,
          kelas: existing.kelas,
          tipe: "pemulihan_sesi",
          deskripsi: `Siswa memulihkan sesi ujian pada perangkat yang sah (${currentDevice.browserSummary || currentDevice.platform}).`,
          alasan: "Refresh halaman / koneksi terhubung kembali dari perangkat yang sama.",
          deviceAwal: existing.deviceInfo,
          aktor: "Sistem Server (Otomatis)",
        });

        existing.riwayatAudit = [recoveryAudit, ...(existing.riwayatAudit || [])];
        persistSessionsToDisk();

        return {
          success: true,
          resumed: true,
          status: "sedang_mengerjakan",
          sessionToken: existing.sessionToken,
          answers: existing.jawaban,
          session: existing,
        };
      }

      // SUB-CASE 3B: DIFFERENT DEVICE DETECTED!
      // A different device is trying to access an already active exam session!
      // AUTOMATIC ATOMIC LOCKDOWN:
      existing.status = "terkunci";
      existing.terkunciOlehSistem = true;
      existing.alasanTerkunci =
        "Ujian dikunci sementara karena terdeteksi akses dari perangkat atau sesi lain. Silakan hubungi guru pengawas.";
      existing.waktuTerkunci = now;
      existing.waktuAktivitasMencurigakan = now;
      existing.deviceMencurigakan = currentDevice;
      existing.terakhirAktif = now;
      existing.updatedAt = now;

      const lockAudit = recordAuditLog({
        ujianId,
        siswaId,
        namaSiswa: existing.namaSiswa,
        kelas: existing.kelas,
        tipe: "deteksi_perangkat_ganda",
        deskripsi: `Terdeteksi akses dari perangkat lain! Perangkat 1: [${existing.deviceInfo?.browserSummary || "Perangkat A"}], Perangkat 2: [${currentDevice.browserSummary || "Perangkat B"}]. Ujian otomatis dikunci.`,
        alasan:
          "Akun mencoba membuka ujian aktif dari perangkat kedua sementara sesi di perangkat pertama masih berlangsung.",
        deviceAwal: existing.deviceInfo,
        deviceMencurigakan: currentDevice,
        aktor: "Sistem Server (Otomatis)",
      });

      existing.riwayatAudit = [lockAudit, ...(existing.riwayatAudit || [])];
      persistSessionsToDisk();

      return {
        success: false,
        locked: true,
        status: "terkunci",
        alasanTerkunci: existing.alasanTerkunci,
        waktuTerkunci: existing.waktuTerkunci,
        message:
          "Ujian dikunci sementara karena terdeteksi akses dari perangkat atau sesi lain. Silakan hubungi guru pengawas.",
        deviceMencurigakan: currentDevice,
        answers: existing.jawaban,
      };
    }

    // Case 4: Brand new exam session
    const newSessionToken = crypto.randomUUID();
    const newSession: ServerExamSession = {
      id: `ans-${ujianId}-${siswaId}`,
      schoolId: schoolId || "sch-1",
      ujianId,
      siswaId,
      namaSiswa,
      nisn,
      nomorInduk,
      kelas,
      sessionToken: newSessionToken,
      status: "sedang_mengerjakan",
      deviceInfo: currentDevice,
      jawaban: {},
      waktuMulai: now,
      terakhirAktif: now,
      jumlahPelanggaran: 0,
      logPelanggaran: [],
      riwayatAudit: [],
      createdAt: now,
      updatedAt: now,
    };

    const initialAudit = recordAuditLog({
      ujianId,
      siswaId,
      namaSiswa,
      kelas,
      tipe: "login_awal",
      deskripsi: `Siswa memulai pengerjaan ujian pada perangkat [${currentDevice.browserSummary || currentDevice.platform}].`,
      alasan: "Memulai ujian pertama kali",
      deviceAwal: currentDevice,
      aktor: "Sistem Server (Otomatis)",
    });

    newSession.riwayatAudit = [initialAudit];
    sessionsStore.set(sessionKey, newSession);
    persistSessionsToDisk();

    return {
      success: true,
      resumed: false,
      status: "sedang_mengerjakan",
      sessionToken: newSessionToken,
      session: newSession,
    };
  });
}

/**
 * 2. Endpoint: SAVE ANSWER
 * Server checks lock status and device/token validity before storing answer.
 */
export async function handleSaveAnswerSession(payload: {
  ujianId: string;
  siswaId: string;
  sessionToken?: string;
  deviceId?: string;
  soalId?: string;
  jawaban?: any;
  allAnswers?: Record<string, any>;
}) {
  const { ujianId, siswaId, sessionToken, deviceId, soalId, jawaban, allAnswers } = payload;
  const sessionKey = `${ujianId}_${siswaId}`;

  return await withAtomicLock(sessionKey, async () => {
    const existing = sessionsStore.get(sessionKey);
    const now = new Date().toISOString();

    if (!existing) {
      return {
        success: false,
        error: "Sesi ujian tidak ditemukan pada server.",
      };
    }

    // Strict Enforcement: If locked, REJECT any answer updates!
    if (existing.status === "terkunci") {
      recordAuditLog({
        ujianId,
        siswaId,
        namaSiswa: existing.namaSiswa,
        kelas: existing.kelas,
        tipe: "simpan_jawaban_ditolak",
        deskripsi: "Pengiriman jawaban ditolak oleh server karena status ujian sedang TERKUNCI.",
        alasan: existing.alasanTerkunci,
        aktor: "Sistem Server (Otomatis)",
      });

      return {
        success: false,
        locked: true,
        status: "terkunci",
        message:
          "Ujian dikunci sementara karena terdeteksi akses dari perangkat atau sesi lain. Silakan hubungi guru pengawas.",
      };
    }

    // Token and device verification
    if (existing.sessionToken && sessionToken && existing.sessionToken !== sessionToken) {
      return {
        success: false,
        error: "Token sesi tidak valid.",
      };
    }

    if (existing.deviceInfo?.deviceId && deviceId && existing.deviceInfo.deviceId !== deviceId) {
      return {
        success: false,
        locked: true,
        message: "ID Perangkat tidak sesuai dengan sesi terdaftar.",
      };
    }

    // Update answers safely
    if (allAnswers && typeof allAnswers === "object") {
      existing.jawaban = {
        ...existing.jawaban,
        ...allAnswers,
      };
    } else if (soalId && jawaban !== undefined) {
      existing.jawaban = {
        ...existing.jawaban,
        [soalId]: jawaban,
      };
    }

    existing.terakhirAktif = now;
    existing.updatedAt = now;
    persistSessionsToDisk();

    return {
      success: true,
      savedAt: now,
      status: existing.status,
    };
  });
}

/**
 * 3. Endpoint: HEARTBEAT & STATUS CHECK
 * Used by students to monitor lock state and proctor unlocks in real time.
 */
export async function handleHeartbeatSession(payload: {
  ujianId: string;
  siswaId: string;
  sessionToken?: string;
  deviceId?: string;
}) {
  const { ujianId, siswaId, deviceId } = payload;
  const sessionKey = `${ujianId}_${siswaId}`;

  const existing = sessionsStore.get(sessionKey);
  if (!existing) {
    return {
      success: false,
      error: "Sesi belum terdaftar.",
    };
  }

  const now = new Date().toISOString();

  // If locked, return locked state
  if (existing.status === "terkunci") {
    return {
      success: true,
      isLocked: true,
      status: "terkunci",
      alasanTerkunci: existing.alasanTerkunci,
      waktuTerkunci: existing.waktuTerkunci,
      deviceMencurigakan: existing.deviceMencurigakan,
      session: existing,
    };
  }

  // Update last active
  if (deviceId && existing.deviceInfo?.deviceId === deviceId) {
    existing.terakhirAktif = now;
    if (existing.deviceInfo) {
      existing.deviceInfo.lastActiveAt = now;
    }
  }

  return {
    success: true,
    isLocked: false,
    status: existing.status,
    terakhirAktif: existing.terakhirAktif,
    session: existing,
  };
}

/**
 * 4. Endpoint: SUBMIT EXAM
 */
export async function handleSubmitSession(payload: {
  ujianId: string;
  siswaId: string;
  sessionToken?: string;
  deviceId?: string;
  allAnswers?: Record<string, any>;
  scoreResult?: {
    nilaiAkhir: number;
    jumlahBenar: number;
    jumlahSalah: number;
    jumlahKosong: number;
    lulusKkm: boolean;
  };
}) {
  const { ujianId, siswaId, allAnswers, scoreResult } = payload;
  const sessionKey = `${ujianId}_${siswaId}`;

  return await withAtomicLock(sessionKey, async () => {
    const existing = sessionsStore.get(sessionKey);
    const now = new Date().toISOString();

    if (!existing) {
      return {
        success: false,
        error: "Sesi ujian tidak ditemukan.",
      };
    }

    if (existing.status === "terkunci") {
      return {
        success: false,
        locked: true,
        message: "Ujian sedang terkunci, tidak dapat mengumpulkan.",
      };
    }

    if (allAnswers) {
      existing.jawaban = { ...existing.jawaban, ...allAnswers };
    }

    existing.status = "selesai";
    existing.waktuSelesai = now;
    existing.terakhirAktif = now;
    existing.updatedAt = now;

    if (scoreResult) {
      existing.nilaiAkhir = scoreResult.nilaiAkhir;
      existing.jumlahBenar = scoreResult.jumlahBenar;
      existing.jumlahSalah = scoreResult.jumlahSalah;
      existing.jumlahKosong = scoreResult.jumlahKosong;
      existing.lulusKkm = scoreResult.lulusKkm;
    }

    const finishAudit = recordAuditLog({
      ujianId,
      siswaId,
      namaSiswa: existing.namaSiswa,
      kelas: existing.kelas,
      tipe: "selesai_ujian",
      deskripsi: `Siswa telah berhasil mengumpulkan lembar ujian (Nilai: ${scoreResult?.nilaiAkhir ?? "-"}).`,
      aktor: "Siswa (Aksi Selesai)",
    });

    existing.riwayatAudit = [finishAudit, ...(existing.riwayatAudit || [])];
    persistSessionsToDisk();

    return {
      success: true,
      status: "selesai",
      session: existing,
    };
  });
}

/**
 * 5. Endpoint: UNLOCK SESSION (Teacher / Proctor only)
 */
export async function handleUnlockSession(payload: {
  ujianId: string;
  siswaId: string;
  guruId?: string;
  guruNama?: string;
  catatan?: string;
}) {
  const { ujianId, siswaId, guruNama, catatan } = payload;
  const sessionKey = `${ujianId}_${siswaId}`;

  return await withAtomicLock(sessionKey, async () => {
    const existing = sessionsStore.get(sessionKey);
    const now = new Date().toISOString();

    if (!existing) {
      return {
        success: false,
        error: "Sesi siswa tidak ditemukan di server.",
      };
    }

    existing.status = "sedang_mengerjakan";
    existing.terkunciOlehSistem = false;
    existing.dibukaOlehGuru = true;
    existing.alasanTerkunci = undefined;
    existing.waktuTerkunci = undefined;
    existing.waktuAktivitasMencurigakan = undefined;
    existing.terakhirAktif = now;
    existing.updatedAt = now;

    const actor = guruNama ? `Guru Pengawas: ${guruNama}` : "Guru Pengawas";
    const unlockAudit = recordAuditLog({
      ujianId,
      siswaId,
      namaSiswa: existing.namaSiswa,
      kelas: existing.kelas,
      tipe: "buka_kunci_guru",
      deskripsi: `${actor} membuka kembali kunci sesi ujian setelah pemeriksaan fisik/keabsahan.`,
      alasan: catatan || "Pemeriksaan guru pengawas selesai.",
      aktor: actor,
    });

    existing.riwayatAudit = [unlockAudit, ...(existing.riwayatAudit || [])];
    persistSessionsToDisk();

    return {
      success: true,
      status: "sedang_mengerjakan",
      session: existing,
      auditLog: unlockAudit,
    };
  });
}

/**
 * 6. Endpoint: GET PROCTORING AUDIT LOGS & ALL SESSIONS FOR AN EXAM
 */
export function handleGetProctoringAuditLogs(ujianId?: string) {
  let logs = auditLogsStore;
  if (ujianId) {
    logs = logs.filter((l) => l.ujianId === ujianId);
  }

  const sessions = Array.from(sessionsStore.values()).filter(
    (s) => !ujianId || s.ujianId === ujianId
  );

  return {
    success: true,
    logs,
    sessions,
  };
}

/**
 * 7. Endpoint: RESET SESSION (For authorized teacher wanting full re-take)
 */
export async function handleResetExamSession(ujianId: string, siswaId: string, guruNama?: string) {
  const sessionKey = `${ujianId}_${siswaId}`;
  return await withAtomicLock(sessionKey, async () => {
    const existing = sessionsStore.get(sessionKey);
    if (existing) {
      recordAuditLog({
        ujianId,
        siswaId,
        namaSiswa: existing.namaSiswa,
        kelas: existing.kelas,
        tipe: "buka_kunci_guru",
        deskripsi: `Sesi ujian direset ulang oleh ${guruNama || "Guru Pengawas"}.`,
        alasan: "Reset sesi siswa",
        aktor: guruNama ? `Guru Pengawas: ${guruNama}` : "Guru Pengawas",
      });
      sessionsStore.delete(sessionKey);
      persistSessionsToDisk();
    }
    return { success: true };
  });
}
