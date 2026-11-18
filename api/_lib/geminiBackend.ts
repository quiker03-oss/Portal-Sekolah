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

      const rawTipe = typeof q.tipe === "string" ? q.tipe.trim().toLowerCase() : "";
      const isBinaryTfChoices =
        Boolean(pilihan) &&
        Object.keys(pilihan || {}).length === 2 &&
        /^(?:benar|betul|true|ya)$/i.test(pilihan?.A?.trim() || "") &&
        /^(?:salah|false|tidak)$/i.test(pilihan?.B?.trim() || "");

      let effectiveTipe: "pilihan_ganda" | "benar_salah" | "isian_singkat" | "uraian";
      if (rawTipe === "benar_salah" || isBinaryTfChoices) {
        effectiveTipe = "benar_salah";
        if (!pilihan) {
          pilihan = { A: "Benar", B: "Salah" };
        }
      } else if (pilihan && Object.keys(pilihan).length >= 2) {
        effectiveTipe = "pilihan_ganda";
      } else if (rawTipe === "isian_singkat" || rawTipe === "isian") {
        effectiveTipe = "isian_singkat";
      } else if (rawTipe === "uraian" || rawTipe === "esai" || rawTipe === "essay") {
        effectiveTipe = "uraian";
      } else if (/_{3,}|\.{4,}/.test(pertanyaan)) {
        effectiveTipe = "isian_singkat";
      } else {
        effectiveTipe = "uraian";
      }

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
      if (typeof q.kunciJawaban === "string" && q.kunciJawaban.trim()) {
        const rawKey = q.kunciJawaban.trim();
        const upperKey = rawKey.toUpperCase();
        if (effectiveTipe === "pilihan_ganda") {
          const letterMatch = upperKey.match(/^\(?([A-E])(?:[\.\)\:]|\s|$)/);
          const candidateLetter = letterMatch?.[1];
          if (candidateLetter && pilihan?.[candidateLetter]) {
            kunciJawaban = candidateLetter;
          } else {
            // Match exact choice text if AI returned option text instead of letter
            const matchedEntry = Object.entries(pilihan || {}).find(
              ([, v]) => v.trim().toLowerCase() === rawKey.toLowerCase()
            );
            if (matchedEntry) kunciJawaban = matchedEntry[0];
          }
        } else if (effectiveTipe === "benar_salah") {
          if (/^(?:A|BENAR|BETUL|TRUE|B|YA)$/i.test(upperKey) && upperKey !== "B") {
            kunciJawaban = "BENAR";
          } else if (upperKey === "A" && /^(?:benar|betul|true|ya)$/i.test(pilihan?.A || "")) {
            kunciJawaban = "BENAR";
          } else if (/^(?:B|SALAH|FALSE|TIDAK|S)$/i.test(upperKey)) {
            kunciJawaban = "SALAH";
          } else {
            kunciJawaban = upperKey;
          }
        } else {
          kunciJawaban = rawKey;
        }
      }

      return {
        nomor,
        tipe: effectiveTipe,
        pertanyaan,
        pilihan: effectiveTipe === "pilihan_ganda" || effectiveTipe === "benar_salah" ? pilihan : undefined,
        kunciJawaban,
        bobot: Number(q.bobot) > 0 ? Number(q.bobot) : effectiveTipe === "uraian" ? 2 : 1,
        pembahasan:
          typeof q.pembahasan === "string" && q.pembahasan.trim()
            ? q.pembahasan.trim()
            : undefined,
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
9. Klasifikasi "tipe" WAJIB akurat sesuai bentuk soal:
   - "pilihan_ganda": soal memiliki pilihan jawaban huruf A, B, C, D (atau A-E).
   - "benar_salah": soal pernyataan benar/salah (opsi Benar/Salah atau B/S).
   - "isian_singkat": soal melengkapi titik-titik (.... / ____) atau isian singkat satu kata/angka tanpa pilihan A-E.
   - "uraian": soal esai / uraian terbuka tanpa pilihan ganda.
10. Jika dokumen mencantumkan "Pembahasan:", "Penjelasan:", atau "Pedoman Penilaian:", salin ke field "pembahasan" / "pedomanPenilaian".
11. Pertahankan tabel atau data angka dalam teks pertanyaan menggunakan format tabel Markdown (| Kolom 1 | Kolom 2 |).
12. Jika dokumen/halaman hanya berisi tabel atau daftar kunci jawaban tanpa teks soal, kembalikan soalList: [].
13. Kembalikan balasan HANYA dalam format JSON valid sesuai skema.`;

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
                pembahasan: { type: Type.STRING },
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
