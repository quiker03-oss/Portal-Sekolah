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
  });
}

// Official high-throughput @google/genai models supporting multimodal PDF & document parsing
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
      // Add timeout per model attempt (35 seconds for multi-page PDF / OCR)
      const timeoutPromise = new Promise<never>((_, reject) =>
        setTimeout(() => reject(new Error(`Timeout pada model ${model}`)), 35000)
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
        await new Promise((resolve) => setTimeout(resolve, 300));
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
      "Batas waktu permintaan AI habis (Timeout). Silakan coba kembali atau gunakan berkas yang lebih ringkas."
    );
  }
  throw lastError || new Error("Gagal mendapatkan respons dari model AI.");
}

/**
 * Parses exam text or PDF/Image using Gemini Multimodal Model.
 * Returns structured exam questions with strict JSON schema.
 */
export async function parseExamDocumentWithGemini(params: {
  text?: string;
  fileBase64?: string;
  mimeType?: string;
  fileName?: string;
}): Promise<{
  judul?: string;
  mataPelajaran?: string;
  kelas?: string;
  petunjukUmum?: string;
  soalList: any[];
}> {
  const ai = getGeminiClient();

  const prompt = `Anda adalah asisten AI transkripsi dokumen ujian sekolah presisi tinggi di Indonesia.
Tugas Anda adalah membaca naskah soal ujian terlampir secara teliti, akurat, dan setia pada dokumen asli, mengekstrak SEMUA butir soal sesuai urutan dokumen asli.

ATURAN WAJIB & MUTLAK (ANTI-HALUSINASI & SESUAI DOKUMEN ASLI):
1. DILARANG KERAS MENGARANG SOAL BARU ATAU MENGUBAH PERTANYAAN. Tulis teks pertanyaan persis kata-per-kata seperti dokumen aslinya.
2. DILARANG MEMPERBAIKI ATAU MEMPERCANTIK KALIMAT TANPA IZIN. Pertahankan susunan dan gaya bahasa asli.
3. DILARANG MENAMBAH PILIHAN JAWABAN. Jika dokumen asli hanya memuat pilihan A, B, C, D, JANGAN menambahkan opsi E. Jika dokumen asli memuat A sampai E, pertahankan kelimanya.
4. DILARANG MENGHILANGKAN SOAL APAPUN yang dianggap sulit dibaca atau panjang. Ekstrak seluruh nomor dari awal sampai akhir tanpa terlewat.
5. DILARANG MENEBAK ATAU MENGARANG KUNCI JAWABAN. Kunci jawaban HANYA boleh diisi jika tertulis secara nyata pada dokumen (misal ada tulisan "Kunci:", tanda bintang *, atau cetak tebal). Jika naskah dokumen tidak memuat kunci, kosongkan (""). Jangan menebak jawaban!
6. Untuk soal uraian / esai tanpa pilihan ganda, set tipe: "uraian".
7. Pertahankan tabel atau data angka dalam teks pertanyaan menggunakan format Markdown table.
8. Kembalikan balasan HANYA dalam format JSON valid dengan struktur:
{
  "judul": "string judul ujian",
  "mataPelajaran": "string nama mata pelajaran",
  "kelas": "string kelas",
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
      "kunciJawaban": "A",
      "bobot": 1
    },
    {
      "nomor": 2,
      "tipe": "uraian",
      "pertanyaan": "teks pertanyaan uraian persis dokumen",
      "kunciJawaban": "",
      "bobot": 2,
      "pedomanPenilaian": "kriteria skor uraian jika ada"
    }
  ]
}`;

  let contents: any[] = [];
  if (params.fileBase64 && params.mimeType) {
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
          { text: `Naskah Dokumen Soal:\n\n${params.text}\n\n---\n\n${prompt}` },
        ],
      },
    ];
  } else {
    throw new Error("Tidak ada data teks atau berkas yang diberikan untuk diproses.");
  }

  const rawJson = await generateContentWithFallback(ai, {
    contents,
    config: {
      temperature: 0.1,
      responseMimeType: "application/json",
    },
  });

  const parsed = cleanAndParseJson(rawJson);
  return {
    judul: parsed.judul || undefined,
    mataPelajaran: parsed.mataPelajaran || undefined,
    kelas: parsed.kelas || undefined,
    petunjukUmum: parsed.petunjukUmum || undefined,
    soalList: Array.isArray(parsed.soalList) ? parsed.soalList : [],
  };
}
