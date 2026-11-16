import { GoogleGenAI } from "@google/genai";
import {
  resolveGeminiApiKey,
  getSafeKeyDiagnostics,
  logBackendStep,
  logBackendError,
} from "./diagnosticHelper.ts";

export function getGeminiApiKey(): string | undefined {
  return resolveGeminiApiKey();
}

export { getSafeKeyDiagnostics, logBackendStep, logBackendError };

export function getGeminiClient(): GoogleGenAI {
  const apiKey = getGeminiApiKey();
  if (!apiKey) {
    throw new Error(
      "GEMINI_API_KEY belum dikonfigurasi di server. Silakan periksa pengaturan environment variable GEMINI_API_KEY pada server deployment."
    );
  }
  return new GoogleGenAI({
    apiKey,
    httpOptions: {
      headers: {
        "User-Agent": "aistudio-build",
      },
    },
  });
}

// Official @google/genai models supporting multimodal PDF, image & document parsing
export const AI_FALLBACK_MODELS = [
  "gemini-4-hydrogen",
  "gemini-3.1-flash-lite",
];

export function cleanAndParseJson(text: string): any {
  if (!text || typeof text !== "string") {
    throw new Error("Teks respons kosong dari AI.");
  }
  let str = text.trim();

  // Strip markdown code fences if wrapped in ```json ... ```
  if (str.startsWith("```")) {
    str = str.replace(/^```[a-zA-Z]*\n?/, "").replace(/\n?```$/, "").trim();
  }

  // Extract JSON payload bounded by outermost braces { ... } or brackets [ ... ]
  const firstBrace = str.indexOf("{");
  const lastBrace = str.lastIndexOf("}");
  if (firstBrace !== -1 && lastBrace !== -1 && lastBrace > firstBrace) {
    str = str.substring(firstBrace, lastBrace + 1);
  } else {
    const firstBracket = str.indexOf("[");
    const lastBracket = str.lastIndexOf("]");
    if (firstBracket !== -1 && lastBracket !== -1 && lastBracket > firstBracket) {
      str = str.substring(firstBracket, lastBracket + 1);
    }
  }

  // Remove trailing commas before closing braces/brackets
  str = str.replace(/,\s*([}\]])/g, "$1");

  return JSON.parse(str);
}

export async function generateContentWithFallback(
  ai: GoogleGenAI,
  params: {
    contents: string | any;
    config?: any;
  }
): Promise<string> {
  let lastError: any = null;

  for (let i = 0; i < AI_FALLBACK_MODELS.length; i++) {
    const model = AI_FALLBACK_MODELS[i];
    try {
      // Per-model timeout kept at 24s so 2 attempts stay safely inside Vercel's 60s maxDuration
      const timeoutPromise = new Promise<never>((_, reject) =>
        setTimeout(() => reject(new Error(`Timeout pada model ${model}`)), 24000)
      );

      const generatePromise = ai.models.generateContent({
        model,
        contents: params.contents,
        config: params.config,
      });

      const response = await Promise.race([generatePromise, timeoutPromise]);

      if (response && response.text) {
        return response.text;
      }
    } catch (err: any) {
      lastError = err;
      const errMsg = err?.message || String(err);
      console.warn(
        `[Gemini AI] Model ${model} encountered an issue (${errMsg}). Trying next model...`
      );

      // Brief backoff pause if encountering 503 (high demand) or 429 (rate limit)
      if (
        errMsg.includes("503") ||
        errMsg.includes("429") ||
        errMsg.includes("UNAVAILABLE") ||
        errMsg.includes("high demand")
      ) {
        await new Promise((resolve) => setTimeout(resolve, 350));
      }
    }
  }

  const originalMsg = lastError?.message || String(lastError);
  if (
    originalMsg.includes("API_KEY_INVALID") ||
    originalMsg.includes("API key not valid") ||
    originalMsg.includes("PERMISSION_DENIED")
  ) {
    throw new Error(
      "GEMINI_API_KEY tidak valid atau tidak memiliki izin akses. Pastikan API key Google AI Studio yang Anda setel di Vercel Dashboard aktif dan benar."
    );
  }
  if (
    originalMsg.includes("429") ||
    originalMsg.includes("RESOURCE_EXHAUSTED") ||
    originalMsg.includes("quota") ||
    originalMsg.includes("Quota exceeded")
  ) {
    throw new Error(
      "Kuota permintaan Gemini API terlampaui (Rate Limit / Quota Exceeded). Silakan tunggu beberapa saat atau periksa kuota akun di Google AI Studio."
    );
  }
  if (
    originalMsg.includes("503") ||
    originalMsg.includes("UNAVAILABLE") ||
    originalMsg.includes("high demand")
  ) {
    throw new Error(
      "Layanan AI Google saat ini sedang mengalami antrean trafik tinggi. Silakan coba kembali dalam beberapa saat."
    );
  }
  if (originalMsg.includes("Timeout") || originalMsg.includes("timeout")) {
    throw new Error(
      "Batas waktu permintaan AI habis (Timeout). Silakan coba kembali atau gunakan berkas dengan ukuran halaman lebih ringkas."
    );
  }
  throw lastError || new Error("Gagal mendapatkan respons dari model AI.");
}

export interface PageImagePayload {
  pageNumber?: number;
  imageBase64: string;
  mimeType: string;
}

/**
 * Normalizes extracted questions strictly preserving document content without fabricating keys/choices.
 */
function normalizeParsedQuestions(rawList: any[]): any[] {
  if (!Array.isArray(rawList)) return [];

  return rawList
    .filter((item) => item && typeof item === "object")
    .map((q: any, idx: number) => {
      const tipe = q.tipe === "uraian" ? "uraian" : "pilihan_ganda";
      const pertanyaan = typeof q.pertanyaan === "string" ? q.pertanyaan.trim() : "";

      let pilihan: Record<string, string> | undefined;
      if (tipe === "pilihan_ganda" && q.pilihan && typeof q.pilihan === "object") {
        const cleanedChoices: Record<string, string> = {};
        for (const key of ["A", "B", "C", "D", "E"]) {
          const val = q.pilihan[key] ?? q.pilihan[key.toLowerCase()];
          if (typeof val === "string" && val.trim().length > 0) {
            cleanedChoices[key] = val.trim();
          }
        }
        if (Object.keys(cleanedChoices).length >= 2) {
          pilihan = cleanedChoices;
        }
      }

      const effectiveTipe = tipe === "pilihan_ganda" && pilihan ? "pilihan_ganda" : "uraian";

      let kunciJawaban = "";
      if (typeof q.kunciJawaban === "string") {
        const cleanKey = q.kunciJawaban.trim().toUpperCase();
        if (effectiveTipe === "pilihan_ganda" && /^[A-E]$/.test(cleanKey) && pilihan?.[cleanKey]) {
          kunciJawaban = cleanKey;
        } else if (effectiveTipe === "uraian") {
          kunciJawaban = q.kunciJawaban.trim();
        }
      }

      const rawNum = Number(q.nomor);
      const nomor = Number.isFinite(rawNum) && rawNum > 0 ? rawNum : idx + 1;

      return {
        nomor,
        tipe: effectiveTipe,
        pertanyaan,
        pilihan,
        kunciJawaban,
        bobot: Number(q.bobot) > 0 ? Number(q.bobot) : effectiveTipe === "uraian" ? 2 : 1,
        pedomanPenilaian:
          typeof q.pedomanPenilaian === "string" && q.pedomanPenilaian.trim()
            ? q.pedomanPenilaian.trim()
            : undefined,
      };
    })
    .filter((q) => q.pertanyaan.length > 0 || (q.pilihan && Object.keys(q.pilihan).length >= 2));
}

/**
 * Parses exam text, PDF/Image base64, or batched page images using Gemini Multimodal Model.
 * Returns structured exam questions faithfully matching the uploaded source document.
 */
export async function parseExamDocumentWithGemini(params: {
  text?: string;
  fileBase64?: string;
  mimeType?: string;
  fileName?: string;
  pages?: PageImagePayload[];
}): Promise<{
  judul?: string;
  mataPelajaran?: string;
  kelas?: string;
  petunjukUmum?: string;
  soalList: any[];
}> {
  const ai = getGeminiClient();

  const prompt = `Anda adalah mesin transkripsi dokumen ujian sekolah presisi tinggi di Indonesia.
Tugas Anda adalah membaca naskah soal ujian terlampir secara teliti, akurat, dan 100% setia pada dokumen asli yang diunggah, mengekstrak SEMUA butir soal sesuai urutan dokumen asli.

ATURAN WAJIB & MUTLAK (ANTI-HALUSINASI & HARUS SESUAI FILE ASLI):
1. DILARANG KERAS MENGARANG SOAL BARU ATAU MENGUBAH KALIMAT PERTANYAAN. Salin teks pertanyaan persis kata-per-kata seperti dokumen aslinya.
2. DILARANG MEMPERBAIKI, MENYEDERHANAKAN, ATAU MENGUBAH DATA/ANGKA/RUMUS. Pertahankan susunan kata, simbol, dan angka asli.
3. DILARANG MENAMBAH PILIHAN JAWABAN. Jika dokumen asli hanya memuat pilihan A, B, C, D, JANGAN menambahkan opsi E. Jika hanya A, B, C, pertahankan A, B, C saja.
4. DILARANG MENGHILANGKAN ATAU MELEWATI SOAL APAPUN. Ekstrak seluruh nomor soal yang terlihat pada dokumen/halaman dari awal sampai akhir tanpa terlewat.
5. DILARANG MENEBAK ATAU MENGARANG KUNCI JAWABAN. Kunci jawaban HANYA boleh diisi jika tertulis secara eksplisit pada dokumen (misal ada tulisan "Kunci:", bagian Kunci Jawaban, tanda bintang *, garis bawah, atau penanda kunci nyata). Jika dokumen tidak memuat kunci jawaban, WAJIB isi string kosong "".
6. Untuk soal uraian / esai / isian tanpa pilihan ganda, set tipe: "uraian".
7. Pertahankan tabel atau data angka dalam teks pertanyaan menggunakan format tabel Markdown (| Kolom 1 | Kolom 2 |).
8. Jika dokumen hanya berisi tabel atau daftar kunci jawaban tanpa teks soal, kembalikan soalList: [].
9. Kembalikan balasan HANYA dalam format JSON valid dengan struktur:
{
  "judul": "string judul ujian persis dokumen atau kosong jika tidak ada",
  "mataPelajaran": "string nama mata pelajaran atau kosong jika tidak ada",
  "kelas": "string kelas atau kosong jika tidak ada",
  "petunjukUmum": "string petunjuk jika ada",
  "soalList": [
    {
      "nomor": 1,
      "tipe": "pilihan_ganda",
      "pertanyaan": "teks pertanyaan lengkap persis dokumen",
      "pilihan": {
        "A": "teks pilihan A",
        "B": "teks pilihan B",
        "C": "teks pilihan C",
        "D": "teks pilihan D"
      },
      "kunciJawaban": "",
      "bobot": 1
    }
  ]
}`;

  let contents: any;
  if (Array.isArray(params.pages) && params.pages.length > 0) {
    const parts: any[] = [];
    for (const p of params.pages) {
      if (p.pageNumber) {
        parts.push({ text: `[Halaman ${p.pageNumber}]` });
      }
      parts.push({
        inlineData: {
          data: p.imageBase64,
          mimeType: p.mimeType || "image/jpeg",
        },
      });
    }
    parts.push({ text: prompt });
    contents = [{ role: "user", parts }];
  } else if (params.fileBase64 && params.mimeType) {
    contents = [
      {
        role: "user",
        parts: [
          {
            inlineData: {
              data: params.fileBase64,
              mimeType: params.mimeType,
            },
          },
          { text: prompt },
        ],
      },
    ];
  } else if (params.text) {
    contents = [
      {
        role: "user",
        parts: [
          { text: `Naskah Dokumen Soal (${params.fileName || "dokumen"}):\n\n${params.text}\n\n---\n\n${prompt}` },
        ],
      },
    ];
  } else {
    throw new Error("Tidak ada data teks atau berkas yang diberikan untuk diproses.");
  }

  // Note: Per gemini-api guidelines, do not pass temperature/topP/topK/candidateCount to gemini-4-* models
  const rawJson = await generateContentWithFallback(ai, {
    contents,
    config: {
      responseMimeType: "application/json",
    },
  });

  const parsed = cleanAndParseJson(rawJson);
  const normalizedQuestions = normalizeParsedQuestions(
    Array.isArray(parsed.soalList) ? parsed.soalList : Array.isArray(parsed) ? parsed : []
  );

  return {
    judul: typeof parsed.judul === "string" && parsed.judul.trim() ? parsed.judul.trim() : undefined,
    mataPelajaran:
      typeof parsed.mataPelajaran === "string" && parsed.mataPelajaran.trim()
        ? parsed.mataPelajaran.trim()
        : undefined,
    kelas: typeof parsed.kelas === "string" && parsed.kelas.trim() ? parsed.kelas.trim() : undefined,
    petunjukUmum:
      typeof parsed.petunjukUmum === "string" && parsed.petunjukUmum.trim()
        ? parsed.petunjukUmum.trim()
        : undefined,
    soalList: normalizedQuestions,
  };
}
