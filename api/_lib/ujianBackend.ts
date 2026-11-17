import {
  db as firestoreDb,
  doc,
  getDoc,
  setDoc,
  collectionGroup,
  getDocs,
  query,
  where,
} from "../../src/services/firebase.ts";
import type {
  DetailJawabanSiswa,
  LogPelanggaranSesi,
  SesiUjianSiswa,
  UjianOnline,
} from "../../src/types.ts";
import {
  checkExamScheduleWindow,
  evaluateExamSessionScore,
  sanitizeExamForStudent,
} from "../../src/utils/examShuffleAndScore.ts";

function sanitizeForFirestoreServer(val: any): any {
  if (val === undefined) return null;
  if (val === null || typeof val === "boolean" || typeof val === "number") {
    return val;
  }
  if (typeof val === "string") {
    if (val.length > 900000) {
      return val.slice(0, 900000);
    }
    return val;
  }
  if (val instanceof Date) return val.toISOString();
  if (Array.isArray(val)) {
    return val
      .filter((x) => x !== undefined)
      .map((x) =>
        Array.isArray(x)
          ? { cells: x.map((c) => sanitizeForFirestoreServer(c)) }
          : sanitizeForFirestoreServer(x)
      );
  }
  const out: Record<string, any> = {};
  for (const k of Object.keys(val)) {
    const v = val[k];
    if (v === undefined) continue;
    out[k] = sanitizeForFirestoreServer(v);
  }
  return out;
}

export async function fetchRawExamFromFirestore(
  examId: string,
  preferredSchoolId?: string
): Promise<{ exam: UjianOnline; schoolId: string } | null> {
  if (!examId) return null;
  const cleanId = examId.trim();
  const cleanSchool = preferredSchoolId?.trim();

  if (cleanSchool) {
    try {
      const snap = await getDoc(doc(firestoreDb, `schools/${cleanSchool}/exams`, cleanId));
      if (snap.exists()) {
        const exam = snap.data() as UjianOnline;
        return { exam, schoolId: exam.schoolId || cleanSchool };
      }
    } catch (err) {
      console.warn("[ujianBackend] Direct exam fetch warning:", err);
    }
  }

  try {
    const cgSnap = await getDocs(
      query(collectionGroup(firestoreDb, "exams"), where("id", "==", cleanId))
    );
    if (!cgSnap.empty) {
      const firstDoc = cgSnap.docs[0];
      const exam = firstDoc.data() as UjianOnline;
      const derivedSchool = firstDoc.ref.parent.parent?.id || exam.schoolId || cleanSchool || "sch-1";
      return { exam, schoolId: derivedSchool };
    }
  } catch (err) {
    console.warn("[ujianBackend] CollectionGroup exam fetch warning:", err);
  }

  return null;
}

export async function getSanitizedExamPayloadForStudent(
  examId: string,
  preferredSchoolId?: string
): Promise<{
  found: boolean;
  schoolId?: string;
  exam?: UjianOnline;
  serverTimeMs: number;
  scheduleCheck?: { allowed: boolean; reason?: string };
}> {
  const serverTimeMs = Date.now();
  const found = await fetchRawExamFromFirestore(examId, preferredSchoolId);
  if (!found) {
    return { found: false, serverTimeMs };
  }

  const sanitized = sanitizeExamForStudent(found.exam);
  const scheduleCheck = checkExamScheduleWindow(found.exam, serverTimeMs);
  return {
    found: true,
    schoolId: found.schoolId,
    exam: sanitized,
    serverTimeMs,
    scheduleCheck,
  };
}

export interface BackendSubmitPayload {
  schoolId?: string;
  ujianId: string;
  sessionId: string;
  siswaId?: string;
  namaSiswa?: string;
  nisn?: string;
  kelas?: string;
  sessionToken?: string;
  passCode?: string;
  jawaban?: { [soalId: string]: DetailJawabanSiswa };
  urutanSoalIds?: string[];
  urutanPilihanMap?: { [soalId: string]: string[] };
  waktuMulai?: string;
  jumlahPelanggaran?: number;
  logPelanggaran?: LogPelanggaranSesi[];
}

export async function submitAndGradeExamOnBackend(payload: BackendSubmitPayload) {
  const nowMs = Date.now();
  const nowIso = new Date(nowMs).toISOString();

  if (!payload.ujianId || !payload.sessionId) {
    throw new Error("Parameter ujianId dan sessionId wajib disertakan.");
  }

  const found = await fetchRawExamFromFirestore(payload.ujianId, payload.schoolId);
  if (!found) {
    return {
      success: false,
      code: "EXAM_NOT_FOUND_ON_SERVER",
      error: "Naskah ujian tidak ditemukan di server Firestore.",
      serverTimeMs: nowMs,
    };
  }

  const { exam, schoolId } = found;
  const sessionRef = doc(firestoreDb, `schools/${schoolId}/exam_sessions`, payload.sessionId);

  let existingSession: Partial<SesiUjianSiswa> | null = null;
  try {
    const existingSnap = await getDoc(sessionRef);
    if (existingSnap.exists()) {
      existingSession = existingSnap.data() as SesiUjianSiswa;
    }
  } catch (err) {
    console.warn("[ujianBackend] Failed reading existing session:", err);
  }

  // Monotonic merge between incoming client answers & stored session answers
  const mergedJawaban: { [soalId: string]: DetailJawabanSiswa } = {
    ...(existingSession?.jawaban || {}),
  };
  const incomingJawaban = payload.jawaban || {};
  for (const soalId of Object.keys(incomingJawaban)) {
    const inc = incomingJawaban[soalId];
    const prev = mergedJawaban[soalId];
    if (!prev) {
      mergedJawaban[soalId] = inc;
    } else {
      const incTs = Number(inc?.clientUpdatedAt) || 0;
      const prevTs = Number(prev?.clientUpdatedAt) || 0;
      const chosen = incTs >= prevTs ? inc : prev;
      mergedJawaban[soalId] = {
        ...chosen,
        nilaiManual: typeof prev.nilaiManual === "number" ? prev.nilaiManual : chosen.nilaiManual,
        catatanGuru: prev.catatanGuru || chosen.catatanGuru,
      };
    }
  }

  const effectiveUrutanSoalIds =
    (Array.isArray(existingSession?.urutanSoalIds) && existingSession!.urutanSoalIds!.length > 0
      ? existingSession!.urutanSoalIds
      : Array.isArray(payload.urutanSoalIds) && payload.urutanSoalIds.length > 0
      ? payload.urutanSoalIds
      : undefined);

  const effectiveUrutanPilihanMap =
    existingSession?.urutanPilihanMap && Object.keys(existingSession.urutanPilihanMap).length > 0
      ? existingSession.urutanPilihanMap
      : payload.urutanPilihanMap;

  const evaluation = evaluateExamSessionScore(
    exam.soalList || [],
    mergedJawaban,
    exam.kkm,
    effectiveUrutanSoalIds
  );

  const effectiveStart = existingSession?.waktuMulai || payload.waktuMulai || nowIso;
  const startMs = new Date(effectiveStart).getTime();
  const durasiDetik =
    Number.isFinite(startMs) && startMs > 0
      ? Math.max(1, Math.round((nowMs - startMs) / 1000))
      : existingSession?.durasiDetik || 1;

  const mergedLogs: LogPelanggaranSesi[] = Array.isArray(payload.logPelanggaran)
    ? payload.logPelanggaran.slice(0, 50)
    : Array.isArray(existingSession?.logPelanggaran)
    ? existingSession!.logPelanggaran!.slice(0, 50)
    : [];

  const nextStatus: SesiUjianSiswa["status"] =
    existingSession?.status === "terkunci" ? "terkunci" : "selesai";

  const updatedSession: SesiUjianSiswa = {
    id: payload.sessionId,
    schoolId,
    ujianId: exam.id,
    siswaId: existingSession?.siswaId || payload.siswaId || "",
    namaSiswa: existingSession?.namaSiswa || payload.namaSiswa || "Siswa",
    nisn: existingSession?.nisn || payload.nisn || "",
    kelas: existingSession?.kelas || payload.kelas || "",
    sessionToken: existingSession?.sessionToken || payload.sessionToken || `cbt_${exam.id}_${payload.sessionId}`,
    passCode: existingSession?.passCode || payload.passCode || "",
    status: nextStatus,
    waktuMulai: effectiveStart,
    waktuSelesai: existingSession?.waktuSelesai || nowIso,
    durasiDetik: existingSession?.durasiDetik || durasiDetik,
    jawaban: mergedJawaban,
    urutanSoalIds: effectiveUrutanSoalIds,
    urutanPilihanMap: effectiveUrutanPilihanMap,
    nilaiPg: evaluation.nilaiPg,
    nilaiUraian: evaluation.nilaiUraian,
    nilaiAkhir: evaluation.nilaiAkhir,
    lulusKkm: evaluation.lulusKkm,
    adaUraianBelumDinilai: evaluation.adaUraianBelumDinilai,
    jumlahBenar: evaluation.jumlahBenar,
    jumlahSalah: evaluation.jumlahSalah,
    jumlahKosong: evaluation.jumlahKosong,
    gradedBy: "backend",
    gradedAt: nowIso,
    pendingSubmitSync: false,
    jumlahPelanggaran: Math.max(
      Number(existingSession?.jumlahPelanggaran) || 0,
      Number(payload.jumlahPelanggaran) || 0,
      mergedLogs.length
    ),
    logPelanggaran: mergedLogs,
    terakhirAktif: nowIso,
    createdAt: existingSession?.createdAt || nowIso,
    updatedAt: nowIso,
  };

  try {
    await setDoc(sessionRef, sanitizeForFirestoreServer(updatedSession));
  } catch (writeErr) {
    console.warn("[ujianBackend] Firestore session submit write warning:", writeErr);
  }

  // Only include answer-key review if teacher explicitly enabled tampilkanPembahasan AND student finished
  const pembahasanMap: Record<string, { kunciJawaban?: string; benar?: boolean }> | undefined =
    Boolean(exam.tampilkanPembahasan) && Boolean(exam.tampilkanNilaiLangsung)
      ? (exam.soalList || []).reduce((acc, q) => {
          const ans = mergedJawaban[q.id];
          const chosen = (ans?.opsiAsliDipilih || ans?.jawabanDipilih || "").trim().toUpperCase();
          const key = (q.kunciJawaban || "").trim().toUpperCase();
          acc[q.id] = {
            kunciJawaban: q.tipe === "pilihan_ganda" ? key : undefined,
            benar: q.tipe === "pilihan_ganda" && Boolean(key) ? chosen === key : undefined,
          };
          return acc;
        }, {} as Record<string, { kunciJawaban?: string; benar?: boolean }>)
      : undefined;

  return {
    success: true,
    serverTimeMs: nowMs,
    gradedBy: "backend" as const,
    evaluation,
    sessionPatch: updatedSession,
    ...(pembahasanMap ? { pembahasanMap } : {}),
  };
}
