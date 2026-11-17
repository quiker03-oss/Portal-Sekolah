import { GoogleGenAI, Type, ThinkingLevel } from "@google/genai";
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

const BACKEND_INSTRUCTION_RE =
  /(?:berdo[a']|tulislah\s+nama|tulis\s+nama|nomor\s+peserta|periksalah\s+(?:naskah|kelengkapan|halaman)|dahulukan\s+(?:soal|menjawab)|kerjakan\s+(?:terlebih\s+dahulu|soal\s+yang)|lembar\s+jawaban|tanyakan\s+kepada\s+pengawas|tidak\s+diperkenankan|waktu\s+mengerjakan|gunakan\s+pensil|bulatkan\s+pilihan)/i;

const BACKEND_ABBREV_RE =
  /^(?:[a-z]{1,4}\.|dkk\b|dll\b|dsb\b|dst\b|tsb\b|karena\b|antara\b|yaitu\b|yakni\b|dan\b|atau\b|adalah\b)/i;

function stripRedundantOptionPrefix(letter: string, rawVal: string): string {
  const clean = (rawVal || "").trim();
  if (!clean) return "";
  const re = new RegExp(`^[\\(\\[]?${letter}\\s*[\\.\\)\\:\\]]\\s+`, "i");
  return clean.replace(re, "").trim();
}

function stripRedundantQuestionNumberPrefix(nomor: number, rawText: string): string {
  const clean = (rawText || "").trim();
  if (!clean) return "";
  // Preserve multi-line internal sub-statements like "1) ... \n 2) ..."
  if (/\n\s*2[\.\)]\s+/.test(clean)) return clean;

  const explicit = clean.match(
    /^(?:soal\s*(?:no\.?|nomor)?\s*|no\.?\s*|nomor\s+)[\(\[]?(\d{1,3})[\)\]]?\s*[\.\)\:\]]?\s+(?![0-9])([\s\S]*)/i
  );
  if (explicit && explicit[2].trim().length > 0) {
    return explicit[2].trim();
  }

  const numeric = clean.match(/^[\(\[]?(\d{1,3})\s*[\.\)\:\]]\s+(?![0-9])([\s\S]*)/);
  if (numeric) {
    const matchedNum = parseInt(numeric[1], 10);
    if (matchedNum === nomor && !/^[\.,]\d/.test(numeric[2].trim()) && numeric[2].trim().length > 0) {
      return numeric[2].trim();
    }
  }
  return clean;
}

function splitEmbeddedChoicesFromStem(rawStem: string): {
  stem: string;
  choices?: Record<string, string>;
} {
  const text = (rawStem || "").trim();
  if (!text) return { stem: "" };

  const anchorRe = /(?:^|(?<=[\s\n]))([\(\[]?)([A-Ea-e])([\.\)\]])(?=\s+\S)/g;
  const candidates: Array<{ index: number; letter: string }> = [];
  let m: RegExpExecArray | null;
  while ((m = anchorRe.exec(text)) !== null) {
    if (m[1] === "(" && m[3] !== ")") continue;
    if (m[1] === "[" && m[3] !== "]") continue;
    const after = text.slice(m.index + m[0].length).trimStart();
    if (m[3] === "." && BACKEND_ABBREV_RE.test(after)) continue;
    candidates.push({ index: m.index, letter: m[2].toUpperCase() });
  }

  const startA = candidates.findIndex((c) => c.letter === "A");
  if (startA === -1) return { stem: text };

  const order = ["A", "B", "C", "D", "E"];
  let orderIdx = 0;
  const seq: Array<{ index: number; letter: string }> = [];
  for (let i = startA; i < candidates.length && orderIdx < order.length; i++) {
    if (candidates[i].letter === order[orderIdx]) {
      if (
        orderIdx === 0 &&
        candidates[i].index > 0 &&
        /(?:Dr|Prof|Ir|Hj|H|Ny|Tn|S|M|Bpk|Ibu|PT|CV)\.\s*$/i.test(text.slice(0, candidates[i].index))
      ) {
        continue;
      }
      seq.push(candidates[i]);
      orderIdx++;
    }
  }

  if (seq.length < 2) return { stem: text };

  const cleanStem = text.slice(0, seq[0].index).trim();
  const extracted: Record<string, string> = {};
  for (let i = 0; i < seq.length; i++) {
    const start = seq[i].index;
    const end = i + 1 < seq.length ? seq[i + 1].index : text.length;
    const rawSeg = text.slice(start, end).trim();
    extracted[seq[i].letter] = stripRedundantOptionPrefix(seq[i].letter, rawSeg);
  }

  return Object.keys(extracted).length >= 2
    ? { stem: cleanStem, choices: extracted }
    : { stem: text };
}

function sanitizeChoiceMap(rawPilihan: any): Record<string, string> | undefined {
  if (!rawPilihan || typeof rawPilihan !== "object") return undefined;
  const order = ["A", "B", "C", "D", "E"];
  const cleaned: Record<string, string> = {};

  for (const key of order) {
    const val = rawPilihan[key] ?? rawPilihan[key.toLowerCase()];
    if (typeof val === "string" && val.trim().length > 0) {
      cleaned[key] = stripRedundantOptionPrefix(key, val);
    }
  }

  // Repair accidental merged next option inside a choice value (e.g. A: "Jakarta   B. Bandung")
  for (let i = 0; i < order.length - 1; i++) {
    const currKey = order[i];
    const nextKey = order[i + 1];
    if (cleaned[currKey] && !cleaned[nextKey]) {
      const leakRe = new RegExp(`([\\s\\t\\n]+)[\\(\\[]?${nextKey}[\\.\\)\\]]\\s+(\\S[\\s\\S]*)$`, "i");
      const leakMatch = cleaned[currKey].match(leakRe);
      if (leakMatch) {
        const beforePart = cleaned[currKey].slice(0, leakMatch.index).trim();
        const afterPart = stripRedundantOptionPrefix(nextKey, leakMatch[2]);
        if (beforePart && afterPart) {
          cleaned[currKey] = beforePart;
          cleaned[nextKey] = afterPart;
        }
      }
    }
  }

  return Object.keys(cleaned).length >= 2 ? cleaned : undefined;
}

function validateNormalizedQuestions(
  items: Array<{ nomor: number; tipe: string; pertanyaan: string; pilihan?: Record<string, string> }>
): string[] {
  const warnings: string[] = [];
  for (const q of items) {
    if (!q.pertanyaan && q.pilihan) {
      warnings.push(`Soal No. ${q.nomor}: Teks pertanyaan kosong meskipun pilihan jawaban ditemukan.`);
    }
    if (q.tipe === "pilihan_ganda" && q.pilihan) {
      const keys = ["A", "B", "C", "D", "E"].filter((k) => Boolean(q.pilihan?.[k]));
      if (keys.length < 3) {
        warnings.push(`Soal No. ${q.nomor}: Pilihan jawaban hanya terbaca ${keys.length} opsi (${keys.join(", ")}).`);
      } else {
        const order = ["A", "B", "C", "D", "E"];
        const maxIdx = Math.max(...keys.map((k) => order.indexOf(k)));
        const skipped = order.slice(0, maxIdx + 1).filter((l) => !keys.includes(l));
        if (skipped.length > 0) {
          warnings.push(`Soal No. ${q.nomor}: Label opsi ${skipped.join(", ")} hilang/melompat pada pilihan ganda.`);
        }
      }
    }
  }
  return warnings;
}

/**
 * Normalizes extracted questions strictly preserving document content without fabricating keys/choices.
 */
function normalizeParsedQuestions(rawList: any[]): {
  questions: any[];
  validationWarnings: string[];
} {
  if (!Array.isArray(rawList)) return { questions: [], validationWarnings: [] };

  let lastValidNomor = 0;
  const mapped = rawList
    .filter((item) => item && typeof item === "object")
    .map((q: any, idx: number) => {
      const rawNum = Number(q.nomor);
      const nomor =
        Number.isFinite(rawNum) && rawNum > 0
          ? Math.floor(rawNum)
          : lastValidNomor > 0
          ? lastValidNomor + 1
          : idx + 1;
      lastValidNomor = nomor;

      let pertanyaan = typeof q.pertanyaan === "string" ? q.pertanyaan.trim() : "";
      pertanyaan = stripRedundantQuestionNumberPrefix(nomor, pertanyaan);

      let pilihan = sanitizeChoiceMap(q.pilihan);

      // Rescue choices if AI left inline A./B./C./D. inside pertanyaan
      if (!pilihan && pertanyaan) {
        const splitRes = splitEmbeddedChoicesFromStem(pertanyaan);
        if (splitRes.choices) {
          pertanyaan = stripRedundantQuestionNumberPrefix(nomor, splitRes.stem);
          pilihan = sanitizeChoiceMap(splitRes.choices);
        }
      }

      const effectiveTipe =
        (q.tipe === "pilihan_ganda" || Boolean(pilihan)) && pilihan ? "pilihan_ganda" : "uraian";

      // Drop accidental exam rules/instructions parsed without choices
      if (
        !pilihan &&
        pertanyaan.length < 180 &&
        BACKEND_INSTRUCTION_RE.test(pertanyaan) &&
        !/\?$/.test(pertanyaan)
      ) {
        return null;
      }

      let kunciJawaban = "";
      if (typeof q.kunciJawaban === "string") {
        const cleanKey = q.kunciJawaban.trim().toUpperCase();
        if (effectiveTipe === "pilihan_ganda" && /^[A-E]$/.test(cleanKey) && pilihan?.[cleanKey]) {
          kunciJawaban = cleanKey;
        } else if (effectiveTipe === "uraian") {
          kunciJawaban = q.kunciJawaban.trim();
        }
      }

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
    .filter(
      (q): q is NonNullable<typeof q> =>
        Boolean(q) && (q.pertanyaan.length > 0 || (q.pilihan && Object.keys(q.pilihan).length >= 2))
    );

  return {
    questions: mapped,
    validationWarnings: validateNormalizedQuestions(mapped),
  };
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
  previousTailContext?: string;
}): Promise<{
  judul?: string;
  mataPelajaran?: string;
  kelas?: string;
  petunjukUmum?: string;
  soalList: any[];
}> {
  const ai = getGeminiClient();

  const tailNote = params.previousTailContext
    ? `\nKONTEKS AKHIR BAGIAN SEBELUMNYA:\n${params.previousTailContext}\nJika halaman/bagian ini diawali lanjutan pertanyaan atau pilihan jawaban dari nomor terakhir di atas, pertahankan nomor soal tersebut agar tidak hilang atau terpecah.\n`
    : "";

  const prompt = `Anda adalah mesin transkripsi dokumen ujian sekolah presisi tinggi di Indonesia.
Tugas Anda adalah membaca naskah soal ujian terlampir secara teliti, akurat, dan 100% setia pada dokumen asli yang diunggah, mengekstrak SEMUA butir soal sesuai urutan dokumen asli.
${tailNote}
ATURAN WAJIB & MUTLAK (ANTI-HALUSINASI & HARUS SESUAI FILE ASLI):
1. DILARANG KERAS MENGARANG SOAL BARU ATAU MENGUBAH KALIMAT PERTANYAAN. Salin teks pertanyaan persis seperti dokumen aslinya.
2. DILARANG MEMPERBAIKI, MENYEDERHANAKAN, ATAU MENGUBAH DATA/ANGKA/RUMUS. Pertahankan susunan kata, simbol matematika, pecahan, pangkat, dan angka asli.
3. DILARANG MENAMBAH PILIHAN JAWABAN. Jika dokumen asli hanya memuat pilihan A, B, C, D, JANGAN menambahkan opsi E. Jika hanya A, B, C, pertahankan A, B, C saja.
4. ABAIKAN header/kop sekolah, tata tertib, dan "PETUNJUK UMUM" bernomor di awal naskah (seperti "1. Berdoalah...", "2. Tulislah nama...", "3. Periksalah naskah..."). Jangan pernah memasukkan petunjuk ujian sebagai butir soal.
5. JANGAN MEMECAH sub-pernyataan/daftar bernomor di dalam badan soal menjadi soal terpisah (contoh: "Perhatikan pernyataan berikut: 1) ... 2) ... 3) ..."). Tetap gabungkan seluruhnya ke dalam teks "pertanyaan" soal induknya.
6. JIKA TATA LETAK 2 KOLOM: baca seluruh kolom KIRI dari atas ke bawah sampai selesai terlebih dahulu, lalu baca kolom KANAN dari atas ke bawah.
7. JIKA ADA GAMBAR HALAMAN DAN TEKS PENDAMPING: utamakan APA YANG TERLIHAT PADA GAMBAR HALAMAN sebagai sumber kebenaran utama apabila teks pendamping memiliki spasi/simbol/kolom yang kurang rapi.
8. DILARANG MENEBAK ATAU MENGARANG KUNCI JAWABAN. Kunci jawaban HANYA boleh diisi jika tertulis secara eksplisit pada dokumen. Jika tidak tertulis, WAJIB isi string kosong "".
9. Untuk soal uraian / esai / isian tanpa pilihan ganda, set tipe: "uraian".
10. Pertahankan tabel atau data angka dalam teks pertanyaan menggunakan format tabel Markdown (| Kolom 1 | Kolom 2 |).
11. Jika dokumen/halaman hanya berisi tabel atau daftar kunci jawaban tanpa teks soal, kembalikan soalList: [].
12. Kembalikan balasan HANYA dalam format JSON valid dengan struktur:
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
    if (params.text && params.text.trim()) {
      parts.push({ text: `Teks digital pendamping (jadikan gambar halaman sebagai referensi utama jika ada perbedaan):\n${params.text.trim()}` });
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
          ...(params.text && params.text.trim() ? [{ text: `Teks pendamping:\n${params.text.trim()}` }] : []),
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
      thinkingConfig: { thinkingLevel: ThinkingLevel.MEDIUM },
      responseSchema: {
        type: Type.OBJECT,
        properties: {
          judul: { type: Type.STRING },
          mataPelajaran: { type: Type.STRING },
          kelas: { type: Type.STRING },
          petunjukUmum: { type: Type.STRING },
          peringatanFormat: { type: Type.STRING },
          soalList: {
            type: Type.ARRAY,
            items: {
              type: Type.OBJECT,
              properties: {
                nomor: { type: Type.INTEGER },
                tipe: { type: Type.STRING },
                pertanyaan: {
                  type: Type.STRING,
                  description: "Teks pertanyaan saja TANPA nomor soal di depan dan TANPA pilihan A/B/C/D.",
                },
                pilihan: {
                  type: Type.OBJECT,
                  properties: {
                    A: { type: Type.STRING, description: "Isi opsi A tanpa awalan 'A.'" },
                    B: { type: Type.STRING, description: "Isi opsi B tanpa awalan 'B.'" },
                    C: { type: Type.STRING, description: "Isi opsi C tanpa awalan 'C.'" },
                    D: { type: Type.STRING, description: "Isi opsi D tanpa awalan 'D.'" },
                    E: { type: Type.STRING, description: "Isi opsi E jika ada tanpa awalan 'E.'" },
                  },
                },
                kunciJawaban: { type: Type.STRING },
                bobot: { type: Type.NUMBER },
                pedomanPenilaian: { type: Type.STRING },
              },
              required: ["nomor", "tipe", "pertanyaan"],
            },
          },
        },
        required: ["soalList"],
      },
    },
  });

  const parsed = cleanAndParseJson(rawJson);
  const { questions: normalizedQuestions, validationWarnings } = normalizeParsedQuestions(
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
    ...(typeof parsed.peringatanFormat === "string" && parsed.peringatanFormat.trim()
      ? { peringatanFormat: parsed.peringatanFormat.trim() }
      : {}),
    ...(validationWarnings.length > 0 ? { validationWarnings } : {}),
    soalList: normalizedQuestions,
  };
}

/**
 * Extracts all questions verbatim from uploaded pages, images, or text chunks
 * for the AI Pembaca Soal Otomatis feature.
 */
export async function readQuestionsForAiReaderWithGemini(params: {
  text?: string;
  fileBase64?: string;
  mimeType?: string;
  fileName: string;
  pages?: PageImagePayload[];
  chunkLabel?: string;
  previousTailContext?: string;
}): Promise<{
  judul?: string;
  soalList: Array<{
    nomor: number;
    nomorTeksAsli?: string;
    halaman?: number;
    tipe: "pilihan_ganda" | "uraian";
    pertanyaan: string;
    pilihan?: Record<string, string>;
    kunciAsliDokumen?: string;
    statusTerbaca: "terbaca" | "kurang_jelas" | "tidak_terbaca";
    catatanPembacaan?: string;
    mengandungVisual?: boolean;
  }>;
  peringatanHalaman: string[];
}> {
  const ai = getGeminiClient();

  const tailSection = params.previousTailContext
    ? `\nKONTEKS AKHIR BAGIAN SEBELUMNYA:\n${params.previousTailContext}\nJika bagian ini diawali lanjutan pertanyaan atau pilihan jawaban (A/B/C/D) untuk soal nomor terakhir tersebut, kembalikan dengan nomor yang sama agar sistem dapat menggabungkannya dengan utuh.\n`
    : "";

  const prompt = `Anda adalah sistem AI Pembaca Soal Otomatis berpresisi tinggi.
Tugas Anda adalah membaca SELURUH isi berkas/halaman/bagian soal yang dilampirkan (${params.chunkLabel || params.fileName}) lalu menyalin semua butir soal yang ada dengan 100% setia pada dokumen asli.
${tailSection}
KETENTUAN MUTLAK (ANTI-HALUSINASI & KESETIAAN DOKUMEN):
1. GAMBAR SEBAGAI SUMBER UTAMA: Apabila tersedia lampiran gambar halaman DAN teks digital pendamping, GAMBAR HALAMAN adalah sumber kebenaran utama. Jika teks digital memiliki spasi rusak, rumus pecahan terpecah, atau kolom tercampur, ikuti 100% apa yang terbaca di gambar halaman!
2. TATA LETAK 2 KOLOM: Jika halaman memiliki 2 kolom soal, baca kolom KIRI dari atas ke bawah sampai selesai terlebih dahulu, baru kemudian kolom KANAN dari atas ke bawah.
3. JANGAN MEMASUKKAN HEADER / PETUNJUK: Abaikan kop sekolah, identitas lembar ujian, tata tertib, dan poin "PETUNJUK UMUM" bernomor (seperti "1. Berdoalah...", "2. Tulislah nama...", "3. Dahulukan soal mudah...").
4. JANGAN MEMECAH SUB-POIN DI DALAM SOAL: Jika sebuah soal memiliki daftar pernyataan bernomor atau angka (seperti "Perhatikan pernyataan berikut: 1) ... 2) ... 3) ..."), JANGAN dijadikan soal terpisah; tetap masukkan ke dalam pertanyaan soal induknya.
5. Pertahankan nomor soal asli persis seperti dokumen (termasuk bila halaman dimulai dari nomor 11, 25, dst. — jangan mengubah menjadi nomor 1!) dan salin kalimat pertanyaan persis kata demi kata tanpa mengubah angka/rumus/maksud soal.
6. JANGAN mengarang soal baru yang tidak ada di berkas.
7. Kenali pilihan jawaban A, B, C, D (serta E jika memang tertulis di dokumen). JANGAN menambahkan opsi baru yang tidak tertulis.
8. Jika terdapat tabel data soal, salin isi tabel dalam format Markdown (| Kolom | ... |) yang rapi pada pertanyaan. Jika ada diagram, grafik, ilustrasi, atau penanda [GAMBAR_DOCX_N], tandai mengandungVisual = true dan jelaskan data/label yang terbaca dari gambar di catatanPembacaan tanpa mengubah kalimat pertanyaan aslinya.
9. Jika bagian ini HANYA berisi daftar/tabel Kunci Jawaban tanpa teks pertanyaan soal, kembalikan soalList: [] dan sebutkan ringkasan kunci jawaban yang terlihat pada peringatanHalaman.
10. Jika dokumen memuat kunci jawaban eksplisit pada butir soal tersebut, tuliskan ke kunciAsliDokumen; jika tidak tertulis, isi string kosong "".
11. Jika ada bagian/halaman/soal yang buram, terpotong, atau tidak terbaca dengan jelas, JANGAN menebak teks yang hilang; beri statusTerbaca = "kurang_jelas" atau "tidak_terbaca", isi catatanPembacaan, serta laporkan pada peringatanHalaman.
12. Kembalikan respons HANYA dalam JSON valid.`;

  const parts: any[] = [];
  if (Array.isArray(params.pages) && params.pages.length > 0) {
    for (const p of params.pages) {
      if (p.pageNumber) {
        parts.push({ text: `[Lampiran Gambar/Halaman ${p.pageNumber}]` });
      }
      parts.push({
        inlineData: {
          data: p.imageBase64,
          mimeType: p.mimeType || "image/jpeg",
        },
      });
    }
    if (params.text && params.text.trim()) {
      parts.push({
        text: `Teks digital pendamping (hanya referensi tambahan — jika berbeda atau terpotong dibanding gambar, prioritaskan gambar di atas):\n${params.text.trim()}`,
      });
    }
    parts.push({ text: prompt });
  } else if (params.fileBase64 && params.mimeType) {
    parts.push({
      inlineData: {
        data: params.fileBase64,
        mimeType: params.mimeType,
      },
    });
    if (params.text && params.text.trim()) {
      parts.push({ text: `Teks pendamping:\n${params.text.trim()}` });
    }
    parts.push({ text: prompt });
  } else if (params.text && params.text.trim()) {
    parts.push({
      text: `Isi Dokumen (${params.chunkLabel || params.fileName}):\n\n${params.text.trim()}\n\n---\n\n${prompt}`,
    });
  } else {
    throw new Error("Tidak ada konten dokumen yang dapat dibaca oleh AI.");
  }

  const rawJson = await generateContentWithFallback(ai, {
    contents: [{ role: "user", parts }],
    config: {
      responseMimeType: "application/json",
      thinkingConfig: { thinkingLevel: ThinkingLevel.MEDIUM },
      responseSchema: {
        type: Type.OBJECT,
        properties: {
          judul: { type: Type.STRING },
          peringatanHalaman: {
            type: Type.ARRAY,
            items: { type: Type.STRING },
          },
          soalList: {
            type: Type.ARRAY,
            items: {
              type: Type.OBJECT,
              properties: {
                nomor: { type: Type.INTEGER },
                nomorTeksAsli: { type: Type.STRING },
                halaman: { type: Type.INTEGER },
                tipe: { type: Type.STRING },
                pertanyaan: { type: Type.STRING },
                pilihan: {
                  type: Type.OBJECT,
                  properties: {
                    A: { type: Type.STRING },
                    B: { type: Type.STRING },
                    C: { type: Type.STRING },
                    D: { type: Type.STRING },
                    E: { type: Type.STRING },
                  },
                },
                kunciAsliDokumen: { type: Type.STRING },
                statusTerbaca: { type: Type.STRING },
                catatanPembacaan: { type: Type.STRING },
                mengandungVisual: { type: Type.BOOLEAN },
              },
              required: ["nomor", "tipe", "pertanyaan", "statusTerbaca"],
            },
          },
        },
        required: ["soalList"],
      },
    },
  });

  const parsed = cleanAndParseJson(rawJson);
  const rawList = Array.isArray(parsed?.soalList) ? parsed.soalList : [];

  let lastValidNomor = 0;
  const normalized = rawList
    .filter((item: any) => item && typeof item === "object")
    .map((q: any, idx: number) => {
      const parsedNum = Number(q.nomor);
      const nomor =
        Number.isFinite(parsedNum) && parsedNum > 0
          ? Math.floor(parsedNum)
          : lastValidNomor > 0
          ? lastValidNomor + 1
          : idx + 1;
      lastValidNomor = nomor;

      let pertanyaan = typeof q.pertanyaan === "string" ? q.pertanyaan.trim() : "";
      pertanyaan = stripRedundantQuestionNumberPrefix(nomor, pertanyaan);

      let pilihan = sanitizeChoiceMap(q.pilihan);

      if (!pilihan && pertanyaan) {
        const rescued = splitEmbeddedChoicesFromStem(pertanyaan);
        if (rescued.choices) {
          pertanyaan = stripRedundantQuestionNumberPrefix(nomor, rescued.stem);
          pilihan = sanitizeChoiceMap(rescued.choices);
        }
      }

      const hasChoices = Boolean(pilihan && Object.keys(pilihan).length >= 2);
      const tipe: "pilihan_ganda" | "uraian" =
        q.tipe === "uraian" || !hasChoices ? "uraian" : "pilihan_ganda";

      if (
        !hasChoices &&
        pertanyaan.length < 180 &&
        BACKEND_INSTRUCTION_RE.test(pertanyaan) &&
        !/\?$/.test(pertanyaan)
      ) {
        return null;
      }

      let statusTerbaca: "terbaca" | "kurang_jelas" | "tidak_terbaca" =
        q.statusTerbaca === "tidak_terbaca"
          ? "tidak_terbaca"
          : q.statusTerbaca === "kurang_jelas"
          ? "kurang_jelas"
          : "terbaca";

      let catatanPembacaan =
        typeof q.catatanPembacaan === "string" && q.catatanPembacaan.trim()
          ? q.catatanPembacaan.trim()
          : undefined;

      if (!pertanyaan && hasChoices && statusTerbaca === "terbaca") {
        statusTerbaca = "kurang_jelas";
        catatanPembacaan =
          catatanPembacaan || "Teks pertanyaan tidak terbaca, hanya pilihan jawaban yang ditemukan.";
      }

      return {
        nomor,
        nomorTeksAsli:
          typeof q.nomorTeksAsli === "string" && q.nomorTeksAsli.trim()
            ? q.nomorTeksAsli.trim()
            : String(nomor),
        halaman: Number.isFinite(Number(q.halaman)) && Number(q.halaman) > 0 ? Number(q.halaman) : undefined,
        tipe,
        pertanyaan,
        pilihan: hasChoices ? pilihan : undefined,
        kunciAsliDokumen:
          typeof q.kunciAsliDokumen === "string" && q.kunciAsliDokumen.trim()
            ? q.kunciAsliDokumen.trim()
            : undefined,
        statusTerbaca,
        catatanPembacaan,
        mengandungVisual: Boolean(q.mengandungVisual),
      };
    })
    .filter(
      (q: any): q is NonNullable<typeof q> =>
        Boolean(q) &&
        (q.pertanyaan.length > 0 ||
          q.statusTerbaca === "tidak_terbaca" ||
          (q.pilihan && Object.keys(q.pilihan).length >= 2))
    );

  const backendValidationWarnings = validateNormalizedQuestions(normalized);
  const warnings = Array.isArray(parsed?.peringatanHalaman)
    ? parsed.peringatanHalaman.filter((w: any) => typeof w === "string" && w.trim().length > 0)
    : [];

  return {
    judul: typeof parsed?.judul === "string" && parsed.judul.trim() ? parsed.judul.trim() : undefined,
    soalList: normalized,
    peringatanHalaman: Array.from(new Set([...warnings, ...backendValidationWarnings])),
  };
}

/**
 * Answers and explains a batch of extracted questions with step-by-step math workings.
 * Refuses to guess if a question is unreadable or lacks essential visual/textual context.
 */
export async function answerQuestionsForAiReaderWithGemini(params: {
  questions: Array<{
    id: string;
    nomor: number;
    tipe: "pilihan_ganda" | "uraian";
    pertanyaan: string;
    pilihan?: Record<string, string | undefined>;
    kunciAsliDokumen?: string;
    statusTerbaca?: string;
    mengandungVisual?: boolean;
    catatanPembacaan?: string;
  }>;
  pageImages?: PageImagePayload[];
}): Promise<{
  answers: Array<{
    id: string;
    jawaban: string;
    pembahasan: string;
    langkahMatematika: string[];
    statusJawaban: "terjawab" | "informasi_tidak_cukup" | "tidak_terbaca";
  }>;
}> {
  const ai = getGeminiClient();

  const questionListPrompt = params.questions
    .map((q) => {
      const opts = q.pilihan
        ? Object.entries(q.pilihan)
            .filter(([, v]) => Boolean(v && String(v).trim()))
            .map(([k, v]) => `${k}. ${v}`)
            .join("\n")
        : "(Soal Uraian / Esai)";
      return [
        `ID: ${q.id}`,
        `NOMOR SOAL: ${q.nomor}`,
        `TIPE: ${q.tipe}`,
        `STATUS TERBACA: ${q.statusTerbaca || "terbaca"}`,
        q.mengandungVisual ? `CATATAN VISUAL: Soal ini merujuk pada gambar/tabel/diagram (${q.catatanPembacaan || "lihat lampiran halaman bila ada"})` : "",
        q.kunciAsliDokumen ? `KUNCI TERTULIS DI DOKUMEN: ${q.kunciAsliDokumen}` : "",
        `PERTANYAAN:\n${q.pertanyaan}`,
        `PILIHAN:\n${opts}`,
      ]
        .filter(Boolean)
        .join("\n");
    })
    .join("\n\n====================\n\n");

  const prompt = `Anda adalah guru ahli dan pembahas soal akademik di Indonesia.
Jawablah setiap soal di bawah ini secara AKURAT, OBJEKTIF, dan MUDAH DIPAHAMI berdasarkan isi soal (dan gambar halaman terlampir jika ada).

ATURAN KETAT:
1. Untuk soal pilihan ganda yang informasi soalnya lengkap dan dapat dipastikan jawabannya:
   - Tuliskan jawaban diawali huruf pilihan yang benar diikuti teks pilihannya, misal: "B. Fotosintesis pada tumbuhan".
   - Pastikan huruf pilihan yang dipilih benar-benar ada di daftar pilihan soal tersebut.
2. Untuk setiap soal yang dapat dijawab, tuliskan PEMBAHASAN yang lengkap, jelas, dan mendidik.
3. Khusus soal matematika, fisika, kimia hitungan, atau penalaran numerik: WAJIB tuliskan langkah penyelesaian bertahap yang runtut ke dalam array langkahMatematika (misal ["Diketahui: ...", "Rumus: ...", "Hitung: ...", "Kesimpulan: ..."]). Untuk soal non-hitungan, isi langkahMatematika: [].
4. ANTI-HALUSINASI / DILARANG MENEBAK:
   - Apabila soal berstatus "tidak_terbaca", teks terpotong/rusak, atau soal merujuk pada gambar/diagram/tabel yang TIDAK tersedia atau tidak cukup jelas untuk menentukan jawaban pasti, WAJIB set statusJawaban: "informasi_tidak_cukup" (atau "tidak_terbaca"), tulis jawaban: "Tidak dapat dijawab (informasi pada soal atau gambar belum mencukupi)", dan jelaskan informasi apa yang kurang di pembahasan.
5. Kembalikan respons HANYA dalam JSON valid untuk seluruh ID soal yang dikirim.`;

  const parts: any[] = [];
  if (Array.isArray(params.pageImages) && params.pageImages.length > 0) {
    for (const p of params.pageImages) {
      if (p.pageNumber) {
        parts.push({ text: `[Gambar Pendukung Halaman ${p.pageNumber}]` });
      }
      parts.push({
        inlineData: {
          data: p.imageBase64,
          mimeType: p.mimeType || "image/jpeg",
        },
      });
    }
  }
  parts.push({ text: `${prompt}\n\nDAFTAR SOAL YANG HARUS DIJAWAB:\n\n${questionListPrompt}` });

  const rawJson = await generateContentWithFallback(ai, {
    contents: [{ role: "user", parts }],
    config: {
      responseMimeType: "application/json",
      thinkingConfig: { thinkingLevel: ThinkingLevel.MEDIUM },
      responseSchema: {
        type: Type.OBJECT,
        properties: {
          answers: {
            type: Type.ARRAY,
            items: {
              type: Type.OBJECT,
              properties: {
                id: { type: Type.STRING },
                jawaban: { type: Type.STRING },
                pembahasan: { type: Type.STRING },
                langkahMatematika: {
                  type: Type.ARRAY,
                  items: { type: Type.STRING },
                },
                statusJawaban: { type: Type.STRING },
              },
              required: ["id", "jawaban", "pembahasan", "statusJawaban"],
            },
          },
        },
        required: ["answers"],
      },
    },
  });

  const parsed = cleanAndParseJson(rawJson);
  const rawAnswers = Array.isArray(parsed?.answers) ? parsed.answers : [];

  const normalizedAnswers = rawAnswers
    .filter((a: any) => a && typeof a === "object" && typeof a.id === "string")
    .map((a: any) => {
      const statusJawaban: "terjawab" | "informasi_tidak_cukup" | "tidak_terbaca" =
        a.statusJawaban === "tidak_terbaca"
          ? "tidak_terbaca"
          : a.statusJawaban === "informasi_tidak_cukup"
          ? "informasi_tidak_cukup"
          : "terjawab";

      return {
        id: a.id,
        jawaban: typeof a.jawaban === "string" ? a.jawaban.trim() : "",
        pembahasan: typeof a.pembahasan === "string" ? a.pembahasan.trim() : "",
        langkahMatematika: Array.isArray(a.langkahMatematika)
          ? a.langkahMatematika.filter((s: any) => typeof s === "string" && s.trim().length > 0)
          : [],
        statusJawaban,
      };
    });

  return { answers: normalizedAnswers };
}
