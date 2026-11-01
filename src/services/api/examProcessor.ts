import { SoalUjian, UjianOnline, DetailJawabanSiswa } from '../../types';
import { extractDocxInBrowser, parseQuestionsWithRegex, safeFetchJson, SafeFetchResponse } from '../../utils/apiHelper';
import { db } from '../database';

export interface ExamProcessorResult<T = any> {
  success: boolean;
  data?: T;
  error?: string;
  code?:
    | 'OK'
    | 'GEMINI_KEY_NOT_CONFIGURED'
    | 'TIMEOUT'
    | 'RATE_LIMIT'
    | 'PAYLOAD_TOO_LARGE'
    | 'NETWORK_ERROR'
    | 'PARSE_ERROR'
    | 'INVALID_INPUT'
    | 'FIREBASE_ERROR';
  isConfigError?: boolean;
  hint?: string;
  soalList?: SoalUjian[];
  totalSoal?: number;
  judul?: string;
  mataPelajaran?: string;
  kelas?: string;
  rawText?: string;
  fileBase64?: string;
  fileName?: string;
}

export interface MatchKeysResult {
  success: boolean;
  totalMatched: number;
  soalList: SoalUjian[];
  error?: string;
  code?: string;
}

export interface GradeEssayResult {
  success: boolean;
  skorRekomendasi: number;
  alasanPenilaian: string;
  indikatorDitemukan: string[];
  saranFeedbackSiswa: string;
  error?: string;
  code?: string;
}

/**
 * Validates whether the backend server is reachable and whether GEMINI_API_KEY is configured.
 * Does not throw errors, returns structured JSON.
 */
export async function validateServerConfig(): Promise<{
  available: boolean;
  aiAvailable: boolean;
  platform?: string;
  message: string;
}> {
  try {
    const res = await safeFetchJson<{
      status: string;
      aiAvailable?: boolean;
      platform?: string;
    }>('/api/health', { method: 'GET' }, 8000);

    if (res.ok && res.data) {
      const aiReady = Boolean(res.data.aiAvailable);
      return {
        available: true,
        aiAvailable: aiReady,
        platform: res.data.platform || 'server',
        message: aiReady
          ? 'Koneksi server aktif dan Gemini AI siap digunakan.'
          : 'Server aktif, namun GEMINI_API_KEY belum dikonfigurasi di server. Fitur offline Word (.docx) tetap berfungsi.',
      };
    }
    return {
      available: false,
      aiAvailable: false,
      message: res.error || 'Server backend tidak merespons.',
    };
  } catch (err: any) {
    return {
      available: false,
      aiAvailable: false,
      message: 'Gagal terhubung ke endpoint server.',
    };
  }
}

/**
 * Converts a browser File to Base64 safely.
 */
export function fileToBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as string);
    reader.onerror = () => reject(new Error(`Gagal membaca berkas ${file.name} dari perangkat.`));
    reader.readAsDataURL(file);
  });
}

/**
 * Process Word (.docx) exam document:
 * 1. Pre-extracts paragraphs & embedded images client-side via JSZip for resilience.
 * 2. Attempts server AI parsing for rich structure.
 * 3. Falls back smoothly to local extraction if server fails, timeouts, or GEMINI_API_KEY is missing.
 * Never returns a raw 500 error.
 */
export async function processDocxExam(
  file: File,
  onProgress?: (step: string) => void
): Promise<ExamProcessorResult> {
  if (!file) {
    return {
      success: false,
      code: 'INVALID_INPUT',
      error: 'Berkas Word tidak ditemukan.',
    };
  }

  onProgress?.('Membaca berkas Word dan mengekstrak gambar...');

  // Pre-extract in browser for maximum reliability
  let browserData: {
    text: string;
    mediaImages: Record<string, string>;
    imageMarkerMap?: Record<string, string>;
  } | null = null;

  try {
    browserData = await extractDocxInBrowser(file);
  } catch (err: any) {
    console.warn('[examProcessor] Pre-extract docx warn:', err);
  }

  let base64Data = '';
  try {
    base64Data = await fileToBase64(file);
  } catch (readErr: any) {
    return {
      success: false,
      code: 'INVALID_INPUT',
      error: readErr?.message || 'Gagal membaca berkas Word.',
    };
  }

  // Attempt server AI parsing
  onProgress?.('Menganalisis butir soal dan format kunci jawaban...');
  try {
    const apiRes = await safeFetchJson<{
      success: boolean;
      judul?: string;
      mataPelajaran?: string;
      kelas?: string;
      soalList: SoalUjian[];
      totalSoal: number;
      rawText?: string;
      error?: string;
      code?: string;
      hint?: string;
    }>(
      '/api/ujian/parse-docx',
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          fileBase64: base64Data,
          fileName: file.name,
        }),
      },
      80000
    );

    if (apiRes.ok && apiRes.data?.success && apiRes.data.soalList?.length) {
      return {
        success: true,
        code: 'OK',
        judul: apiRes.data.judul || file.name.replace(/\.[^/.]+$/, ''),
        mataPelajaran: apiRes.data.mataPelajaran || '',
        kelas: apiRes.data.kelas || '',
        soalList: apiRes.data.soalList,
        totalSoal: apiRes.data.totalSoal || apiRes.data.soalList.length,
        rawText: apiRes.data.rawText || browserData?.text || '',
        fileBase64: base64Data.length < 300000 ? base64Data : undefined,
        fileName: file.name,
      };
    }

    // If server returned structured error (e.g. GEMINI_KEY_NOT_CONFIGURED), check if we have browser fallback
    if (browserData && browserData.text) {
      onProgress?.('Mengaktifkan parser otomatis lokal untuk Word...');
      const localSoal = parseQuestionsWithRegex(browserData.text, browserData.imageMarkerMap);
      if (localSoal.length > 0) {
        return {
          success: true,
          code: 'OK',
          judul: file.name.replace(/\.[^/.]+$/, ''),
          soalList: localSoal,
          totalSoal: localSoal.length,
          rawText: browserData.text,
          fileName: file.name,
          hint: 'Berhasil diekstrak menggunakan parser lokal. Periksa kembali kunci jawaban sebelum menyimpan.',
        };
      }
    }

    // Return friendly error
    const msg =
      apiRes.data?.error ||
      apiRes.error ||
      'Gagal mengekstrak soal dari dokumen Word. Pastikan naskah memiliki butir soal yang jelas.';
    return {
      success: false,
      code: (apiRes.data?.code as any) || 'PARSE_ERROR',
      error: msg,
      hint: apiRes.data?.hint,
      isConfigError: apiRes.data?.code === 'GEMINI_KEY_NOT_CONFIGURED',
    };
  } catch (err: any) {
    // If anything fails, try local fallback
    if (browserData && browserData.text) {
      const localSoal = parseQuestionsWithRegex(browserData.text, browserData.imageMarkerMap);
      if (localSoal.length > 0) {
        return {
          success: true,
          code: 'OK',
          judul: file.name.replace(/\.[^/.]+$/, ''),
          soalList: localSoal,
          totalSoal: localSoal.length,
          rawText: browserData.text,
          fileName: file.name,
        };
      }
    }
    return {
      success: false,
      code: 'NETWORK_ERROR',
      error: err?.message || 'Terjadi kendala koneksi saat memproses dokumen Word.',
    };
  }
}

/**
 * Process PDF document:
 * Validates payload size (Vercel max 4.5MB), encodes to base64, dispatches to /api/ujian/parse-pdf.
 * Never returns a raw 500 error.
 */
export async function processPdfExam(
  file: File,
  onProgress?: (step: string) => void
): Promise<ExamProcessorResult> {
  if (!file) {
    return {
      success: false,
      code: 'INVALID_INPUT',
      error: 'Berkas PDF tidak ditemukan.',
    };
  }

  const maxVercelBytes = 4.5 * 1024 * 1024;
  if (file.size > maxVercelBytes) {
    return {
      success: false,
      code: 'PAYLOAD_TOO_LARGE',
      error: `Ukuran berkas PDF Anda (${(file.size / (1024 * 1024)).toFixed(1)} MB) melebihi batas unggah server Vercel (4.5 MB).`,
      hint: 'Silakan kompres berkas PDF menggunakan kompresor online gratis atau konversi naskah ke format Word (.docx).',
    };
  }

  onProgress?.('Membaca berkas PDF...');
  let base64Data = '';
  try {
    base64Data = await fileToBase64(file);
  } catch (err: any) {
    return {
      success: false,
      code: 'INVALID_INPUT',
      error: err?.message || 'Gagal membaca berkas PDF dari perangkat.',
    };
  }

  onProgress?.('Menganalisis naskah PDF dengan kecerdasan buatan...');
  try {
    const apiRes = await safeFetchJson<{
      success: boolean;
      judul?: string;
      mataPelajaran?: string;
      kelas?: string;
      soalList: SoalUjian[];
      totalSoal: number;
      error?: string;
      code?: string;
      hint?: string;
    }>(
      '/api/ujian/parse-pdf',
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          fileBase64: base64Data,
          fileName: file.name,
        }),
      },
      85000
    );

    if (apiRes.ok && apiRes.data?.success && apiRes.data.soalList?.length) {
      return {
        success: true,
        code: 'OK',
        judul: apiRes.data.judul || file.name.replace(/\.[^/.]+$/, ''),
        mataPelajaran: apiRes.data.mataPelajaran || '',
        kelas: apiRes.data.kelas || '',
        soalList: apiRes.data.soalList,
        totalSoal: apiRes.data.totalSoal || apiRes.data.soalList.length,
        fileName: file.name,
      };
    }

    const errCode = apiRes.data?.code;
    const isConfig = errCode === 'GEMINI_KEY_NOT_CONFIGURED';

    return {
      success: false,
      code: (errCode as any) || (apiRes.status === 413 ? 'PAYLOAD_TOO_LARGE' : 'PARSE_ERROR'),
      isConfigError: isConfig,
      error:
        apiRes.data?.error ||
        apiRes.error ||
        'Gagal mengekstrak soal dari dokumen PDF. Pastikan naskah memuat teks/butir soal yang terbaca jelas.',
      hint:
        apiRes.data?.hint ||
        (isConfig
          ? 'Buka Vercel Dashboard > Project Settings > Environment Variables, tambahkan GEMINI_API_KEY, lalu redeploy. Atau gunakan file Word (.docx) untuk parser lokal instan.'
          : undefined),
    };
  } catch (err: any) {
    return {
      success: false,
      code: 'NETWORK_ERROR',
      error: err?.message || 'Terjadi kendala koneksi saat memproses PDF.',
    };
  }
}

/**
 * Process Scanned Image / Photo (JPG, JPEG, PNG, WEBP):
 * Calls /api/ujian/parse-image with OCR extraction.
 */
export async function processImageExam(
  file: File,
  onProgress?: (step: string) => void
): Promise<ExamProcessorResult> {
  if (!file) {
    return {
      success: false,
      code: 'INVALID_INPUT',
      error: 'Berkas gambar tidak ditemukan.',
    };
  }

  onProgress?.('Membaca berkas foto/scan naskah...');
  let base64Data = '';
  try {
    base64Data = await fileToBase64(file);
  } catch (err: any) {
    return {
      success: false,
      code: 'INVALID_INPUT',
      error: err?.message || 'Gagal membaca gambar.',
    };
  }

  onProgress?.('Melakukan OCR dan identifikasi butir soal dari gambar...');
  try {
    const apiRes = await safeFetchJson<{
      success: boolean;
      judul?: string;
      mataPelajaran?: string;
      kelas?: string;
      soalList: SoalUjian[];
      totalSoal: number;
      error?: string;
      code?: string;
      hint?: string;
    }>(
      '/api/ujian/parse-image',
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          fileBase64: base64Data,
          fileName: file.name,
          mimeType: file.type || 'image/jpeg',
        }),
      },
      85000
    );

    if (apiRes.ok && apiRes.data?.success && apiRes.data.soalList?.length) {
      return {
        success: true,
        code: 'OK',
        judul: apiRes.data.judul || file.name.replace(/\.[^/.]+$/, ''),
        mataPelajaran: apiRes.data.mataPelajaran || '',
        kelas: apiRes.data.kelas || '',
        soalList: apiRes.data.soalList,
        totalSoal: apiRes.data.totalSoal || apiRes.data.soalList.length,
        fileName: file.name,
      };
    }

    return {
      success: false,
      code: (apiRes.data?.code as any) || 'PARSE_ERROR',
      isConfigError: apiRes.data?.code === 'GEMINI_KEY_NOT_CONFIGURED',
      error:
        apiRes.data?.error ||
        apiRes.error ||
        'Gagal membaca butir soal dari gambar. Pastikan tulisan pada foto cukup tajam dan terbaca jelas.',
      hint: apiRes.data?.hint,
    };
  } catch (err: any) {
    return {
      success: false,
      code: 'NETWORK_ERROR',
      error: err?.message || 'Gagal menghubungi server saat membaca gambar.',
    };
  }
}

/**
 * Matches separate answer keys (from a separate key document or text) with existing questions.
 */
export async function matchSeparateKeys(
  soalList: SoalUjian[],
  keySource: {
    keyFile?: File;
    keyText?: string;
  },
  onProgress?: (step: string) => void
): Promise<MatchKeysResult> {
  if (!soalList || soalList.length === 0) {
    return {
      success: false,
      code: 'INVALID_INPUT',
      totalMatched: 0,
      soalList,
      error: 'Daftar butir soal kosong.',
    };
  }

  let keyFileBase64: string | undefined;
  let keyMimeType: string | undefined;
  let fileName: string | undefined;

  if (keySource.keyFile) {
    onProgress?.('Membaca berkas kunci jawaban...');
    try {
      keyFileBase64 = await fileToBase64(keySource.keyFile);
      keyMimeType = keySource.keyFile.type || 'application/pdf';
      fileName = keySource.keyFile.name;
    } catch (err: any) {
      return {
        success: false,
        code: 'INVALID_INPUT',
        totalMatched: 0,
        soalList,
        error: 'Gagal membaca berkas kunci jawaban.',
      };
    }
  }

  onProgress?.('Mencocokkan kunci jawaban ke butir soal...');
  try {
    const apiRes = await safeFetchJson<{
      success: boolean;
      totalMatched: number;
      soalList: SoalUjian[];
      error?: string;
      code?: string;
    }>(
      '/api/ujian/match-answer-keys',
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          soalList,
          keyFileBase64,
          keyMimeType,
          keyText: keySource.keyText,
          fileName,
        }),
      },
      60000
    );

    if (apiRes.ok && apiRes.data?.success && apiRes.data.soalList?.length) {
      return {
        success: true,
        code: 'OK',
        totalMatched: apiRes.data.totalMatched || 0,
        soalList: apiRes.data.soalList,
      };
    }

    return {
      success: false,
      code: apiRes.data?.code || 'PARSE_ERROR',
      totalMatched: 0,
      soalList,
      error: apiRes.data?.error || apiRes.error || 'Gagal mencocokkan dokumen kunci jawaban.',
    };
  } catch (err: any) {
    return {
      success: false,
      code: 'NETWORK_ERROR',
      totalMatched: 0,
      soalList,
      error: err?.message || 'Kendala koneksi saat mencocokkan kunci jawaban.',
    };
  }
}

/**
 * Semantic rubric grading for student essay answers using AI.
 */
export async function evaluateStudentEssay(params: {
  pertanyaan: string;
  kunciJawaban?: string;
  contohJawaban?: string;
  rubrikPenilaian?: string;
  indikatorWajib?: string[];
  variasiJawaban?: string[];
  jawabanSiswa: string;
  bobotMaksimal: number;
}): Promise<GradeEssayResult> {
  try {
    const res = await safeFetchJson<GradeEssayResult>(
      '/api/ujian/ai-grade-essay',
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(params),
      },
      45000
    );

    if (res.ok && res.data?.success) {
      return res.data;
    }

    return {
      success: false,
      skorRekomendasi: 0,
      alasanPenilaian: res.data?.error || res.error || 'Gagal mengevaluasi esai dengan AI.',
      indikatorDitemukan: [],
      saranFeedbackSiswa: '',
      code: res.data?.code,
    };
  } catch (err: any) {
    return {
      success: false,
      skorRekomendasi: 0,
      alasanPenilaian: err?.message || 'Kendala koneksi saat menghubungi server AI.',
      indikatorDitemukan: [],
      saranFeedbackSiswa: '',
      code: 'NETWORK_ERROR',
    };
  }
}

/**
 * Guaranteed direct save to Firestore database.
 * Completely eliminates dependence on temporary browser cache alone.
 */
export async function persistExamToFirestore(exam: UjianOnline): Promise<{
  success: boolean;
  savedExam?: UjianOnline;
  error?: string;
}> {
  try {
    if (!exam.id) {
      exam.id = `cbt-${Date.now()}-${Math.random().toString(36).substring(2, 6)}`;
    }
    const saved = await db.saveUjianOnline(exam);
    return {
      success: true,
      savedExam: saved,
    };
  } catch (err: any) {
    console.error('[examProcessor] Failed to persist exam to Firestore:', err);
    return {
      success: false,
      error: err?.message || 'Gagal menyimpan naskah ujian ke Firestore database.',
    };
  }
}
