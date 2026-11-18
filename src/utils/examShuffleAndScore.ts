import {
  DetailJawabanSiswa,
  ModePengacakanUjian,
  SesiUjianSiswa,
  Siswa,
  SoalUjian,
  TipeSoalUjian,
  UjianOnline,
} from '../types';

const CHOICE_LETTERS = ['A', 'B', 'C', 'D', 'E'] as const;

export function normalizeClassName(cls?: string): string {
  return (cls || '').toLowerCase().replace(/[^a-z0-9]/g, '');
}

export function doesStudentMatchTargetClasses(studentClass: string | undefined, targetClasses: string[]): boolean {
  if (!targetClasses || targetClasses.length === 0) return true;
  if (
    targetClasses.some((c) => {
      const n = normalizeClassName(c);
      return n === 'semuakelas' || n === 'semua' || n === 'all';
    })
  ) {
    return true;
  }
  const normStudent = normalizeClassName(studentClass);
  if (!normStudent) return false;
  return targetClasses.some((c) => {
    const normC = normalizeClassName(c);
    return (
      normC === normStudent ||
      normC === `kelas${normStudent}` ||
      `kelas${normC}` === normStudent
    );
  });
}

/**
 * Normalizes True/False answers and keys to 'BENAR' | 'SALAH' | ''.
 */
export function normalizeTrueFalseValue(val?: string, soal?: Pick<SoalUjian, 'pilihan'>): 'BENAR' | 'SALAH' | '' {
  const clean = (val || '').trim().toUpperCase();
  if (!clean) return '';

  if (/^(?:BENAR|BETUL|TRUE|YA|Y|T|1)$/.test(clean)) return 'BENAR';
  if (/^(?:SALAH|FALSE|TIDAK|F|S|0)$/.test(clean)) return 'SALAH';

  // If represented as option A / B from parsed choices ("A. Benar", "B. Salah")
  const hasOptionB = Boolean(soal?.pilihan?.B && /salah|false|tidak/i.test(soal.pilihan.B));
  const hasOptionA = Boolean(soal?.pilihan?.A && /benar|betul|true|ya/i.test(soal.pilihan.A));
  if (clean === 'A' && hasOptionA) return 'BENAR';
  if (clean === 'B' && hasOptionB) return 'SALAH';
  if (clean === 'B' && !soal?.pilihan?.B) return 'BENAR'; // Shorthand "B" = Benar when no option list
  if (clean === 'A') return 'BENAR';

  return '';
}

/**
 * Normalizes and compares Isian Singkat against one or more keys separated by `;` or `|`.
 */
export function isShortAnswerMatch(studentAnswer?: string, keyPattern?: string): boolean {
  const norm = (s: string) => s.trim().toLowerCase().replace(/\s+/g, ' ');
  const ansNorm = norm(studentAnswer || '');
  if (!ansNorm) return false;
  const acceptedVariants = (keyPattern || '')
    .split(/[;|]/)
    .map((v) => norm(v))
    .filter(Boolean);
  if (acceptedVariants.length === 0) return false;
  return acceptedVariants.includes(ansNorm);
}

/**
 * Checks whether a single question answer is considered correct (`true`), incorrect (`false`), or empty (`null`).
 */
export function evaluateSingleQuestionResponse(
  soal: SoalUjian,
  ans?: DetailJawabanSiswa
): { status: 'benar' | 'salah' | 'kosong' | 'perlu_koreksi'; skorDidapat: number; bobot: number } {
  const bobot = Math.max(0, Number(soal.bobot) || 1);
  const rawSelected = (ans?.opsiAsliDipilih || ans?.jawabanDipilih || '').trim();

  if (soal.tipe === 'pilihan_ganda') {
    if (!rawSelected) return { status: 'kosong', skorDidapat: 0, bobot };
    const cleanKey = (soal.kunciJawaban || '').trim().toUpperCase();
    if (cleanKey && rawSelected.toUpperCase() === cleanKey) {
      return { status: 'benar', skorDidapat: bobot, bobot };
    }
    return { status: 'salah', skorDidapat: 0, bobot };
  }

  if (soal.tipe === 'benar_salah') {
    if (!rawSelected) return { status: 'kosong', skorDidapat: 0, bobot };
    const normAns = normalizeTrueFalseValue(rawSelected, soal);
    const normKey = normalizeTrueFalseValue(soal.kunciJawaban, soal);
    if (normKey && normAns && normAns === normKey) {
      return { status: 'benar', skorDidapat: bobot, bobot };
    }
    return { status: 'salah', skorDidapat: 0, bobot };
  }

  if (soal.tipe === 'isian_singkat') {
    if (!rawSelected) return { status: 'kosong', skorDidapat: 0, bobot };
    if (typeof ans?.nilaiManual === 'number') {
      const clamped = Math.max(0, Math.min(bobot, ans.nilaiManual));
      return {
        status: clamped >= bobot * 0.6 ? 'benar' : 'salah',
        skorDidapat: clamped,
        bobot,
      };
    }
    if (isShortAnswerMatch(rawSelected, soal.kunciJawaban)) {
      return { status: 'benar', skorDidapat: bobot, bobot };
    }
    return { status: 'salah', skorDidapat: 0, bobot };
  }

  // Uraian / Esai (manual teacher grading)
  if (!ans || !rawSelected) {
    return { status: 'kosong', skorDidapat: 0, bobot };
  }
  if (typeof ans.nilaiManual === 'number') {
    const clamped = Math.max(0, Math.min(bobot, ans.nilaiManual));
    return {
      status: clamped >= bobot * 0.6 ? 'benar' : 'salah',
      skorDidapat: clamped,
      bobot,
    };
  }
  return { status: 'perlu_koreksi', skorDidapat: 0, bobot };
}

/**
 * Deterministic 32-bit FNV-1a string hash.
 */
export function hashSeedString(seedStr: string): number {
  let h = 2166136261;
  for (let i = 0; i < seedStr.length; i++) {
    h ^= seedStr.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

/**
 * Unbiased Fisher-Yates shuffle seeded deterministically via Mulberry32 PRNG.
 * Never mutates the source array.
 */
export function seededShuffle<T>(items: readonly T[], seedStr: string): T[] {
  const arr = [...items];
  if (arr.length <= 1) return arr;

  let state = hashSeedString(seedStr) || 1;
  const nextRand = (): number => {
    state = (state + 0x6d2b79f5) >>> 0;
    let t = Math.imul(state ^ (state >>> 15), 1 | state);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };

  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(nextRand() * (i + 1));
    const tmp = arr[i];
    arr[i] = arr[j];
    arr[j] = tmp;
  }

  return arr;
}

/**
 * Resolves effective 3-state shuffle modes while preserving backward compatibility
 * with older exams that only saved boolean acakSoal / acakPilihan flags.
 */
export function resolveEffectiveShuffleModes(
  ujian: Pick<UjianOnline, 'acakSoal' | 'acakPilihan' | 'modeAcakSoal' | 'modeAcakPilihan'>
): {
  modeAcakSoal: ModePengacakanUjian;
  modeAcakPilihan: ModePengacakanUjian;
} {
  const modeAcakSoal: ModePengacakanUjian =
    ujian.modeAcakSoal && ['off', 'sama', 'per_siswa'].includes(ujian.modeAcakSoal)
      ? ujian.modeAcakSoal
      : ujian.acakSoal
      ? 'per_siswa'
      : 'off';

  const modeAcakPilihan: ModePengacakanUjian =
    ujian.modeAcakPilihan && ['off', 'sama', 'per_siswa'].includes(ujian.modeAcakPilihan)
      ? ujian.modeAcakPilihan
      : ujian.acakPilihan
      ? 'per_siswa'
      : 'off';

  return { modeAcakSoal, modeAcakPilihan };
}

/**
 * Extracts original choice keys sorted in standard document order (A, B, C, D, E).
 */
export function getOriginalChoiceKeys(soal: SoalUjian): string[] {
  const rawKeys = new Set<string>([
    ...Object.keys(soal.pilihan || {}),
    ...Object.keys(soal.pilihanGambar || {}),
  ]);

  const ordered: string[] = [];
  for (const letter of CHOICE_LETTERS) {
    const textVal = soal.pilihan?.[letter];
    const imgVal = soal.pilihanGambar?.[letter];
    if (rawKeys.has(letter) && ((textVal !== undefined && textVal.trim() !== '') || Boolean(imgVal))) {
      ordered.push(letter);
    }
  }

  // Fallback for any custom option keys outside A-E
  Array.from(rawKeys).forEach((k) => {
    const upper = k.toUpperCase();
    if (!ordered.includes(upper) && (Boolean(soal.pilihan?.[k]?.trim()) || Boolean(soal.pilihanGambar?.[k]))) {
      ordered.push(upper);
    }
  });

  return ordered;
}

/**
 * Computes and locks question order (`urutanSoalIds`) and option permutations (`urutanPilihanMap`)
 * for a student session. Once persisted on SesiUjianSiswa, browser refresh keeps exact ordering.
 */
export function generateSessionOrderState(
  ujian: UjianOnline,
  sessionKey: string,
  existingSesi?: Pick<SesiUjianSiswa, 'urutanSoalIds' | 'urutanPilihanMap'>
): {
  urutanSoalIds: string[];
  urutanPilihanMap: { [soalId: string]: string[] };
} {
  const rawQuestions = ujian.soalList || [];
  const validIdSet = new Set(rawQuestions.map((q) => q.id));
  const { modeAcakSoal, modeAcakPilihan } = resolveEffectiveShuffleModes(ujian);

  // 1. Question ordering
  let urutanSoalIds: string[] = [];
  if (
    existingSesi?.urutanSoalIds &&
    existingSesi.urutanSoalIds.length > 0 &&
    existingSesi.urutanSoalIds.every((id) => validIdSet.has(id))
  ) {
    urutanSoalIds = [...existingSesi.urutanSoalIds];
    const limit = Number(ujian.jumlahSoalTampil) || 0;
    if (limit === 0) {
      rawQuestions.forEach((q) => {
        if (!urutanSoalIds.includes(q.id)) urutanSoalIds.push(q.id);
      });
    }
  } else {
    const baseIds = rawQuestions.map((q) => q.id);
    if (modeAcakSoal === 'sama') {
      urutanSoalIds = seededShuffle(baseIds, `${ujian.id}:GLOBAL_SOAL_ORDER`);
    } else if (modeAcakSoal === 'per_siswa') {
      urutanSoalIds = seededShuffle(baseIds, `${ujian.id}:${sessionKey}:STUDENT_SOAL_ORDER`);
    } else {
      urutanSoalIds = baseIds;
    }

    const limit = Number(ujian.jumlahSoalTampil) || 0;
    if (limit > 0 && limit < urutanSoalIds.length) {
      urutanSoalIds = urutanSoalIds.slice(0, limit);
    }
  }

  // 2. Option permutation per question (ONLY for Pilihan Ganda)
  const urutanPilihanMap: { [soalId: string]: string[] } = {};
  for (const q of rawQuestions) {
    if (q.tipe !== 'pilihan_ganda') continue;
    const origKeys = getOriginalChoiceKeys(q);
    if (origKeys.length <= 1) {
      urutanPilihanMap[q.id] = origKeys;
      continue;
    }

    const existingOrder = existingSesi?.urutanPilihanMap?.[q.id];
    if (
      Array.isArray(existingOrder) &&
      existingOrder.length === origKeys.length &&
      origKeys.every((k) => existingOrder.includes(k))
    ) {
      urutanPilihanMap[q.id] = [...existingOrder];
    } else if (modeAcakPilihan === 'sama') {
      urutanPilihanMap[q.id] = seededShuffle(origKeys, `${ujian.id}:${q.id}:GLOBAL_CHOICE_ORDER`);
    } else if (modeAcakPilihan === 'per_siswa') {
      urutanPilihanMap[q.id] = seededShuffle(origKeys, `${ujian.id}:${sessionKey}:${q.id}:STUDENT_CHOICE_ORDER`);
    } else {
      urutanPilihanMap[q.id] = origKeys;
    }
  }

  return { urutanSoalIds, urutanPilihanMap };
}

/**
 * Returns the ordered SoalUjian array for a session based on persisted or freshly computed order.
 */
export function getOrderedQuestionsForSession(
  ujian: UjianOnline,
  sessionKey: string,
  sesi?: Pick<SesiUjianSiswa, 'urutanSoalIds' | 'urutanPilihanMap'>
): {
  orderedQuestions: SoalUjian[];
  urutanSoalIds: string[];
  urutanPilihanMap: { [soalId: string]: string[] };
} {
  const { urutanSoalIds, urutanPilihanMap } = generateSessionOrderState(ujian, sessionKey, sesi);
  const byId = new Map((ujian.soalList || []).map((q) => [q.id, q]));
  const orderedQuestions = urutanSoalIds
    .map((id) => byId.get(id))
    .filter((q): q is SoalUjian => Boolean(q));

  return {
    orderedQuestions: orderedQuestions.length > 0 ? orderedQuestions : ujian.soalList || [],
    urutanSoalIds,
    urutanPilihanMap,
  };
}

export interface DisplayedChoiceItem {
  displayLetter: string; // Sequential display label: A, B, C, D, E
  originalKey: string; // Stable original option key from teacher's exam bank
  text: string;
  imageUrl?: string;
}

/**
 * Builds the displayed choice list for a single question using its locked permutation.
 */
export function buildDisplayedChoicesForQuestion(
  soal: SoalUjian,
  urutanPilihanMap?: { [soalId: string]: string[] }
): DisplayedChoiceItem[] {
  const origKeys = getOriginalChoiceKeys(soal);
  const savedOrder = urutanPilihanMap?.[soal.id];
  const activeOrder =
    Array.isArray(savedOrder) &&
    savedOrder.length === origKeys.length &&
    origKeys.every((k) => savedOrder.includes(k))
      ? savedOrder
      : origKeys;

  return activeOrder.map((origKey, idx) => ({
    displayLetter: CHOICE_LETTERS[idx] || origKey,
    originalKey: origKey,
    text: soal.pilihan?.[origKey] ?? soal.pilihan?.[origKey.toLowerCase()] ?? '',
    imageUrl: soal.pilihanGambar?.[origKey] ?? soal.pilihanGambar?.[origKey.toLowerCase()],
  }));
}

export interface ExamEvaluationSummary {
  nilaiPg: number;
  nilaiUraian: number;
  nilaiAkhir: number;
  lulusKkm: boolean;
  adaUraianBelumDinilai: boolean;
  jumlahBenar: number;
  jumlahSalah: number;
  jumlahKosong: number;
  totalPgDinilai: number;
  totalUraianDinilai: number;
}

/**
 * Grades student answers deterministically across Pilihan Ganda, Benar/Salah, Isian Singkat, and Uraian.
 */
export function evaluateExamSessionScore(
  soalList: SoalUjian[],
  jawabanMap: { [soalId: string]: DetailJawabanSiswa },
  kkmInput?: number,
  assignedSoalIds?: string[]
): ExamEvaluationSummary {
  const assignedSet =
    Array.isArray(assignedSoalIds) && assignedSoalIds.length > 0 ? new Set(assignedSoalIds) : null;
  const activeQuestions = assignedSet
    ? soalList.filter((q) => assignedSet.has(q.id))
    : soalList;

  let skorPgDidapat = 0;
  let bobotPgMaks = 0;
  let skorUraianDidapat = 0;
  let bobotUraianMaks = 0;
  let adaUraianBelumDinilai = false;
  let jumlahBenar = 0;
  let jumlahSalah = 0;
  let jumlahKosong = 0;
  let totalPgDinilai = 0;
  let totalUraianDinilai = 0;

  for (const soal of activeQuestions) {
    const ans = jawabanMap?.[soal.id];
    const evalItem = evaluateSingleQuestionResponse(soal, ans);
    const isObjective = soal.tipe === 'pilihan_ganda' || soal.tipe === 'benar_salah' || soal.tipe === 'isian_singkat';

    if (isObjective) {
      totalPgDinilai++;
      bobotPgMaks += evalItem.bobot;
      skorPgDidapat += evalItem.skorDidapat;
    } else {
      totalUraianDinilai++;
      bobotUraianMaks += evalItem.bobot;
      skorUraianDidapat += evalItem.skorDidapat;
    }

    if (evalItem.status === 'benar') {
      jumlahBenar++;
    } else if (evalItem.status === 'salah') {
      jumlahSalah++;
    } else if (evalItem.status === 'kosong') {
      jumlahKosong++;
    } else if (evalItem.status === 'perlu_koreksi') {
      adaUraianBelumDinilai = true;
    }
  }

  const nilaiPg = bobotPgMaks > 0 ? Math.round((skorPgDidapat / bobotPgMaks) * 100) : 0;
  const nilaiUraian = bobotUraianMaks > 0 ? Math.round((skorUraianDidapat / bobotUraianMaks) * 100) : 0;

  let nilaiAkhir = 0;
  if (bobotPgMaks > 0 && bobotUraianMaks > 0) {
    nilaiAkhir = Math.round(nilaiPg * 0.7 + nilaiUraian * 0.3);
  } else if (bobotPgMaks > 0) {
    nilaiAkhir = nilaiPg;
  } else if (bobotUraianMaks > 0) {
    nilaiAkhir = nilaiUraian;
  }

  const kkm = Number(kkmInput) || 75;
  const lulusKkm = nilaiAkhir >= kkm;

  return {
    nilaiPg,
    nilaiUraian,
    nilaiAkhir,
    lulusKkm,
    adaUraianBelumDinilai,
    jumlahBenar,
    jumlahSalah,
    jumlahKosong,
    totalPgDinilai,
    totalUraianDinilai,
  };
}

/**
 * Validates whether current server/client timestamp falls within the exam schedule window.
 */
export function checkExamScheduleWindow(
  ujian: Pick<UjianOnline, 'tanggalMulai' | 'tanggalSelesai' | 'status'>,
  nowMs: number = Date.now()
): { allowed: boolean; reason?: string } {
  if (ujian.status === 'draf') {
    return {
      allowed: false,
      reason: 'Ujian ini masih berstatus DRAF dan belum resmi diterbitkan oleh Guru.',
    };
  }
  if (ujian.status === 'selesai' || ujian.status === 'ditutup') {
    return {
      allowed: false,
      reason: 'Ujian ini sudah ditutup dan masa pengerjaan telah berakhir.',
    };
  }
  if (ujian.status === 'terjadwal' && !ujian.tanggalMulai) {
    return {
      allowed: false,
      reason: 'Ujian terjadwal menunggu penentuan waktu mulai oleh Guru.',
    };
  }

  if (ujian.tanggalMulai) {
    const startMs = new Date(ujian.tanggalMulai).getTime();
    if (Number.isFinite(startMs) && nowMs < startMs) {
      return {
        allowed: false,
        reason: `Ujian belum dibuka. Jadwal mulai: ${new Date(startMs).toLocaleString('id-ID')}.`,
      };
    }
  }

  if (ujian.tanggalSelesai) {
    const endMs = new Date(ujian.tanggalSelesai).getTime();
    if (Number.isFinite(endMs) && nowMs > endMs) {
      return {
        allowed: false,
        reason: `Masa pengerjaan ujian telah berakhir pada ${new Date(endMs).toLocaleString('id-ID')}.`,
      };
    }
  }

  return { allowed: true };
}

/**
 * Strips answer keys, grading rubrics, and teacher verification notes from an exam
 * before sending it to student browsers so kunciJawaban is never exposed on the wire.
 */
export function sanitizeExamForStudent(ujian: UjianOnline): UjianOnline {
  return {
    ...ujian,
    soalList: (ujian.soalList || []).map((q) => ({
      id: q.id,
      nomor: q.nomor,
      tipe: q.tipe,
      pertanyaan: q.pertanyaan,
      kontenElemen: q.kontenElemen,
      pilihan: q.pilihan,
      pilihanGambar: q.pilihanGambar,
      kunciJawaban: '',
      bobot: q.bobot,
      gambar: q.gambar,
      gambarTambahan: q.gambarTambahan,
      gambarPosisi: q.gambarPosisi,
      gambarUkuran: q.gambarUkuran,
      gambarStatus: q.gambarStatus,
    })),
  };
}

export interface QuestionItemAnalysis {
  soalId: string;
  nomor: number;
  tipe: TipeSoalUjian;
  pertanyaanSingkat: string;
  benarCount: number;
  salahCount: number;
  kosongCount: number;
  totalPeserta: number;
  persentaseBenar: number;
  tingkatKesulitan: 'Mudah' | 'Sedang' | 'Sulit';
}

export interface ExamAnalyticsSummary {
  totalSiswaTarget: number;
  pesertaSudahCount: number;
  pesertaSedangCount: number;
  pesertaBelumList: Siswa[];
  rataRata: number;
  nilaiTertinggi: number;
  nilaiTerendah: number;
  jumlahLulusKkm: number;
  persenKetuntasan: number;
  analisisButir: QuestionItemAnalysis[];
}

/**
 * Computes comprehensive exam results & item difficulty analytics for teacher reporting.
 */
export function computeExamAnalytics(
  exam: UjianOnline | undefined,
  sessions: SesiUjianSiswa[],
  allStudents: Siswa[]
): ExamAnalyticsSummary {
  if (!exam) {
    return {
      totalSiswaTarget: 0,
      pesertaSudahCount: 0,
      pesertaSedangCount: 0,
      pesertaBelumList: [],
      rataRata: 0,
      nilaiTertinggi: 0,
      nilaiTerendah: 0,
      jumlahLulusKkm: 0,
      persenKetuntasan: 0,
      analisisButir: [],
    };
  }

  const targetStudents = (allStudents || []).filter((st) =>
    doesStudentMatchTargetClasses(st.kelas, exam.kelasTarget || [])
  );

  // Deduplicate latest/best session per student for class stats
  const latestBySiswa = new Map<string, SesiUjianSiswa>();
  for (const s of sessions || []) {
    const key = s.siswaId || s.id;
    const prev = latestBySiswa.get(key);
    if (!prev) {
      latestBySiswa.set(key, s);
    } else {
      const prevDone = prev.status === 'selesai' || prev.status === 'waktu_habis';
      const curDone = s.status === 'selesai' || s.status === 'waktu_habis';
      if ((curDone && !prevDone) || (s.nilaiAkhir > prev.nilaiAkhir)) {
        latestBySiswa.set(key, s);
      }
    }
  }

  const dedupedSessions = Array.from(latestBySiswa.values());
  const completedSessions = dedupedSessions.filter(
    (s) => s.status === 'selesai' || s.status === 'waktu_habis' || Boolean(s.waktuSelesai)
  );
  const inProgressSessions = dedupedSessions.filter(
    (s) => s.status === 'sedang_mengerjakan' || s.status === 'mengerjakan' || s.status === 'terverifikasi' || s.status === 'terkunci'
  );

  const participatedSiswaIds = new Set(dedupedSessions.map((s) => s.siswaId));
  const pesertaBelumList = targetStudents.filter((st) => !participatedSiswaIds.has(st.id));

  const scores = completedSessions.map((s) => Number(s.nilaiAkhir) || 0);
  const rataRata =
    scores.length > 0 ? Math.round((scores.reduce((a, b) => a + b, 0) / scores.length) * 10) / 10 : 0;
  const nilaiTertinggi = scores.length > 0 ? Math.max(...scores) : 0;
  const nilaiTerendah = scores.length > 0 ? Math.min(...scores) : 0;
  const jumlahLulusKkm = completedSessions.filter((s) => s.lulusKkm).length;
  const persenKetuntasan =
    completedSessions.length > 0 ? Math.round((jumlahLulusKkm / completedSessions.length) * 100) : 0;

  const analisisButir: QuestionItemAnalysis[] = (exam.soalList || []).map((q, idx) => {
    let benarCount = 0;
    let salahCount = 0;
    let kosongCount = 0;
    let totalExposed = 0;

    for (const s of completedSessions) {
      if (Array.isArray(s.urutanSoalIds) && s.urutanSoalIds.length > 0 && !s.urutanSoalIds.includes(q.id)) {
        continue;
      }
      totalExposed++;
      const res = evaluateSingleQuestionResponse(q, s.jawaban?.[q.id]);
      if (res.status === 'benar') benarCount++;
      else if (res.status === 'salah') salahCount++;
      else kosongCount++;
    }

    const persentaseBenar = totalExposed > 0 ? Math.round((benarCount / totalExposed) * 100) : 0;
    const tingkatKesulitan: 'Mudah' | 'Sedang' | 'Sulit' =
      persentaseBenar >= 70 ? 'Mudah' : persentaseBenar >= 30 ? 'Sedang' : 'Sulit';

    const cleanStem = (q.pertanyaan || '').replace(/\s+/g, ' ').trim();
    return {
      soalId: q.id,
      nomor: q.nomor || idx + 1,
      tipe: q.tipe,
      pertanyaanSingkat: cleanStem.length > 85 ? `${cleanStem.slice(0, 82)}...` : cleanStem,
      benarCount,
      salahCount,
      kosongCount,
      totalPeserta: totalExposed,
      persentaseBenar,
      tingkatKesulitan,
    };
  });

  return {
    totalSiswaTarget: Math.max(targetStudents.length, dedupedSessions.length),
    pesertaSudahCount: completedSessions.length,
    pesertaSedangCount: inProgressSessions.length,
    pesertaBelumList,
    rataRata,
    nilaiTertinggi,
    nilaiTerendah,
    jumlahLulusKkm,
    persenKetuntasan,
    analisisButir,
  };
}


