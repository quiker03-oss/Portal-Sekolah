import { GoogleGenAI } from "@google/genai";
import JSZip from "jszip";

export function getGeminiClient(): GoogleGenAI {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    throw new Error(
      "GEMINI_API_KEY belum dikonfigurasi di server. Jika dideploy di Vercel, pastikan variabel GEMINI_API_KEY sudah disetel di menu Project Settings > Environment Variables, lalu lakukan redeploy."
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

// Reliable, high-throughput models prioritizing official Gemini models from gemini-api skill
export const AI_FALLBACK_MODELS = [
  "gemini-3.8-flash",
  "gemini-3.1-flash-lite",
  "gemini-flash-latest",
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
      // Add timeout per model attempt (18 seconds)
      const timeoutPromise = new Promise<never>((_, reject) =>
        setTimeout(() => reject(new Error(`Timeout pada model ${model}`)), 18000)
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
    originalMsg.includes("503") ||
    originalMsg.includes("UNAVAILABLE") ||
    originalMsg.includes("high demand")
  ) {
    throw new Error(
      "Layanan AI Google saat ini sedang mengalami antrean trafik tinggi. Silakan coba kembali dalam beberapa saat."
    );
  }
  throw lastError || new Error("Gagal mendapatkan respons dari model AI.");
}

// Helper: Extract paragraphs and embedded images from Word (.docx)
export async function extractFromDocx(buffer: Buffer) {
  const zip = await JSZip.loadAsync(buffer);

  // Normalize path helper for reliable cross-matching
  const normalizePath = (p: string): string => {
    return p.replace(/^(\.\.\/)+/, '').replace(/^\//, '').replace(/^word\//, '').toLowerCase().trim();
  };

  const relsFile = zip.file("word/_rels/document.xml.rels");
  const relsMap: { [rId: string]: string } = {};
  if (relsFile) {
    const relsXml = await relsFile.async("string");
    const relMatches = relsXml.matchAll(/<Relationship[^>]*Id="([^"]+)"[^>]*Target="([^"]+)"/g);
    for (const m of relMatches) {
      relsMap[m[1]] = m[2];
    }
  }

  const mediaImages: { [mediaPath: string]: string } = {};
  const mediaFiles = zip.file(/(?:^|\/)media\//);
  for (const f of mediaFiles) {
    const ext = f.name.split(".").pop()?.toLowerCase() || "png";
    let mime = "image/png";
    if (ext === "jpg" || ext === "jpeg") mime = "image/jpeg";
    else if (ext === "gif") mime = "image/gif";
    else if (ext === "webp") mime = "image/webp";
    else if (ext === "svg") mime = "image/svg+xml";
    else if (ext === "bmp") mime = "image/bmp";
    else if (ext === "emf") mime = "image/x-emf";
    else if (ext === "wmf") mime = "image/x-wmf";

    const b64 = await f.async("base64");
    const dataUri = `data:${mime};base64,${b64}`;
    const relativePath = f.name.replace(/^(?:word|ppt)\//, "");
    const baseName = f.name.split("/").pop() || f.name;

    mediaImages[f.name] = dataUri;
    mediaImages[f.name.toLowerCase()] = dataUri;
    mediaImages[relativePath] = dataUri;
    mediaImages[relativePath.toLowerCase()] = dataUri;
    mediaImages[baseName] = dataUri;
    mediaImages[baseName.toLowerCase()] = dataUri;
    mediaImages[normalizePath(f.name)] = dataUri;
    mediaImages[normalizePath(relativePath)] = dataUri;
  }

  const docFile = zip.file("word/document.xml");
  if (!docFile) {
    throw new Error("File .docx tidak memiliki berkas dokumen utama (word/document.xml).");
  }
  const docXml = await docFile.async("string");

  // Helper to extract image URIs from an XML fragment
  const getImagesFromFragment = (frag: string): string[] => {
    const uris: string[] = [];
    const rIdMatches = [...frag.matchAll(/(?:[a-zA-Z0-9_]+:)?(?:embed|id|link|src|href)="([^"]+)"/g)];
    for (const rMatch of rIdMatches) {
      const rId = rMatch[1];
      const target = relsMap[rId];
      if (target) {
        const norm = normalizePath(target);
        const foundUri =
          mediaImages[target] ||
          mediaImages[target.toLowerCase()] ||
          mediaImages[norm] ||
          mediaImages[target.split("/").pop()?.toLowerCase() || ""];
        if (foundUri && !uris.includes(foundUri)) {
          uris.push(foundUri);
        }
      }
    }
    return uris;
  };

  // Helper to extract text from w:t and m:t (formulas / math)
  const getTextFromFragment = (frag: string): string => {
    const textMatches = frag.match(/<[wm]:t[^>]*>(.*?)<\/[wm]:t>/g);
    if (!textMatches) return "";
    return textMatches.map((t) => t.replace(/<[^>]+>/g, "")).join("");
  };

  const extractedParagraphs: { text: string; imageUris: string[] }[] = [];

  // Parse top-level blocks: <w:p> (paragraphs) and <w:tbl> (tables)
  const blockRegex = /<(w:p|w:tbl)[^>]*>([\s\S]*?)<\/\1>/g;
  let blockMatch: RegExpExecArray | null;

  while ((blockMatch = blockRegex.exec(docXml)) !== null) {
    const tag = blockMatch[1];
    const content = blockMatch[2];

    if (tag === "w:p") {
      const imageUris = getImagesFromFragment(content);
      const text = getTextFromFragment(content).trim();
      if (text || imageUris.length > 0) {
        extractedParagraphs.push({ text, imageUris });
      }
    } else if (tag === "w:tbl") {
      const tableImageUris = getImagesFromFragment(content);
      const rows: string[][] = [];
      const trRegex = /<w:tr[^>]*>([\s\S]*?)<\/w:tr>/g;
      let trMatch: RegExpExecArray | null;

      while ((trMatch = trRegex.exec(content)) !== null) {
        const cells: string[] = [];
        const tcRegex = /<w:tc[^>]*>([\s\S]*?)<\/w:tc>/g;
        let tcMatch: RegExpExecArray | null;

        while ((tcMatch = tcRegex.exec(trMatch[1])) !== null) {
          cells.push(getTextFromFragment(tcMatch[1]).trim());
        }
        if (cells.length > 0) {
          rows.push(cells);
        }
      }

      if (rows.length > 0) {
        let mdTable = rows.map((r) => "| " + r.join(" | ") + " |").join("\n");
        if (rows.length > 1) {
          const sep = "| " + rows[0].map(() => "---").join(" | ") + " |";
          const lines = mdTable.split("\n");
          lines.splice(1, 0, sep);
          mdTable = lines.join("\n");
        }
        extractedParagraphs.push({ text: mdTable, imageUris: tableImageUris });
      } else if (tableImageUris.length > 0) {
        extractedParagraphs.push({ text: "", imageUris: tableImageUris });
      }
    }
  }

  // Fallback: If no blocks matched by regex, fall back to split by </w:p>
  if (extractedParagraphs.length === 0) {
    const pMatches = docXml.split(/<\/w:p>/g);
    for (const p of pMatches) {
      const imageUris = getImagesFromFragment(p);
      const text = getTextFromFragment(p).trim();
      if (text || imageUris.length > 0) {
        extractedParagraphs.push({ text, imageUris });
      }
    }
  }

  return { extractedParagraphs, mediaImages };
}

// Helper: Local structural rule-based parser for Word (.docx) when AI is offline or without API key
export function parseDocxLocally(
  extractedParagraphs: { text: string; imageUris: string[] }[],
  mediaImages: { [mediaPath: string]: string },
  fileName: string
) {
  const questions: any[] = [];
  let currentQ: any = null;
  let activeOptions: { [key: string]: string } = {};

  const finalizeCurrentQ = () => {
    if (currentQ) {
      if (Object.keys(activeOptions).length > 0) {
        currentQ.pilihan = { ...activeOptions };
        currentQ.tipe = "pilihan_ganda";
      } else if (!currentQ.tipe) {
        currentQ.tipe = "esai";
      }
      questions.push(currentQ);
      currentQ = null;
      activeOptions = {};
    }
  };

  for (let i = 0; i < extractedParagraphs.length; i++) {
    const item = extractedParagraphs[i];
    const text = item.text.trim();
    const imgs = item.imageUris || [];

    // Check if line matches question start: "1. ", "1) ", "Soal 1: ", "No. 1 ", etc.
    const qMatch = text.match(/^(?:(?:Soal|No\.?|Pertanyaan)\s*)?(\d+)[\.\)]\s*(.*)$/i);
    // Check if line matches an option: "A. ", "B) ", "C. "
    const optMatch = text.match(/^([A-Fa-f])[\.\)]\s*(.*)$/);
    // Check for inline options: e.g. "A. xxx B. yyy C. zzz D. www"
    const inlineOptMatch = text.match(/\b([A-Da-d])[\.\)]\s+([^\b]+)/g);
    // Check for answer keys: "Kunci: A", "Kunci Jawaban: B", "Jawaban: C"
    const keyMatch = text.match(/(?:Kunci(?:\s*Jawaban)?|Jawaban|Kunci)\s*[:\=]\s*([A-Fa-f])/i);
    // Check for explanations
    const pembMatch = text.match(/(?:Pembahasan|Penjelasan)\s*[:\=]\s*(.*)$/i);

    if (qMatch && !optMatch) {
      finalizeCurrentQ();
      const num = parseInt(qMatch[1], 10);
      const qText = qMatch[2];
      currentQ = {
        id: `soal-local-${Date.now()}-${questions.length + 1}`,
        nomor: num || questions.length + 1,
        tipe: "pilihan_ganda",
        pertanyaan: qText || "",
        pilihan: undefined,
        kunciJawaban: "",
        pembahasan: "",
        bobot: 1,
        gambar: imgs.length > 0 ? imgs[0] : undefined,
        gambarList: imgs.length > 0 ? imgs : undefined,
        perluVerifikasi: true,
        catatanVerifikasi: "Diekstrak dengan parser struktur dokumen lokal. Silakan tinjau dan verifikasi kunci jawaban.",
      };
    } else if (optMatch && currentQ) {
      const optKey = optMatch[1].toUpperCase();
      activeOptions[optKey] = optMatch[2].trim();
      if (imgs.length > 0 && !currentQ.gambar) {
        currentQ.gambar = imgs[0];
      }
    } else if (inlineOptMatch && inlineOptMatch.length >= 2 && currentQ) {
      inlineOptMatch.forEach((optStr) => {
        const m = optStr.match(/([A-Da-d])[\.\)]\s+(.*)/);
        if (m) {
          activeOptions[m[1].toUpperCase()] = m[2].trim();
        }
      });
    } else if (keyMatch && currentQ) {
      currentQ.kunciJawaban = keyMatch[1].toUpperCase();
      currentQ.perluVerifikasi = false;
      delete currentQ.catatanVerifikasi;
    } else if (pembMatch && currentQ) {
      currentQ.pembahasan = pembMatch[1].trim();
    } else if (currentQ) {
      if (Object.keys(activeOptions).length > 0) {
        const lastKey = Object.keys(activeOptions)[Object.keys(activeOptions).length - 1];
        if (lastKey) {
          activeOptions[lastKey] += " " + text;
        }
      } else {
        currentQ.pertanyaan += (currentQ.pertanyaan ? "\n" : "") + text;
      }
      if (imgs.length > 0 && !currentQ.gambar) {
        currentQ.gambar = imgs[0];
      }
    }
  }

  finalizeCurrentQ();

  return {
    success: true,
    judul: fileName.replace(/\.[^/.]+$/, ""),
    mataPelajaran: "",
    kelas: "",
    soalList: questions,
    totalSoal: questions.length,
    totalGambarDiekstrak: Object.keys(mediaImages).length,
    rawText: extractedParagraphs.map((p) => p.text).join("\n"),
  };
}

// 1. Core handler: Parse DOCX
export async function handleParseDocx(fileBase64: string, fileName: string = "dokumen-soal.docx") {
  if (!fileBase64) {
    throw new Error("Data fileBase64 tidak ditemukan.");
  }

  const cleanBase64 = fileBase64.replace(/^data:.*?;base64,/, "");
  const buffer = Buffer.from(cleanBase64, "base64");
  const { extractedParagraphs, mediaImages } = await extractFromDocx(buffer);

  // Build structured text representation with image placeholders
  const imageIndexMap: { [marker: string]: string } = {};
  let imgCounter = 1;

  const formattedLines = extractedParagraphs
    .map((p) => {
      let line = p.text;
      if (p.imageUris && p.imageUris.length > 0) {
        const markers = p.imageUris.map((uri) => {
          const marker = `[[IMAGE_SOAL_${imgCounter}]]`;
          imageIndexMap[marker] = uri;
          imgCounter++;
          return marker;
        });
        line = `${line} ${markers.join(" ")}`.trim();
      }
      return line;
    })
    .filter(Boolean);

  const rawDocumentText = formattedLines.join("\n");

  if (!rawDocumentText.trim()) {
    throw new Error("Dokumen Word tidak memiliki teks atau soal yang dapat dibaca.");
  }

  // Attempt AI extraction first if GEMINI_API_KEY is available
  let parsed: any = null;
  let aiSucceeded = false;

  if (process.env.GEMINI_API_KEY) {
    try {
      const ai = getGeminiClient();
      const prompt = `Anda adalah parser naskah ujian sekolah profesional Indonesia.
Bacalah dokumen naskah soal berikut secara teliti:

--- AWAL NASKAH DOKUMEN ---
${rawDocumentText}
--- AKHIR NASKAH DOKUMEN ---

ATURAN WAJIB & INTEGRITAS NASKAH SOAL:
1. JANGAN PERNAH MENGARANG, MERUBAH, ATAU MENGURANGI kata, angka, pilihan jawaban, rumus, atau urutan soal dari dokumen asli!
2. Kenali nomor soal, teks pertanyaan, instruksi, dan tipe soal secara akurat:
   - 'pilihan_ganda' : Pilihan tunggal A, B, C, D, E.
   - 'pilihan_ganda_kompleks' : Pilihan lebih dari satu jawaban benar (checkbox / centang). Contoh: "Pilihlah 2 pernyataan yang benar", "Centang semua yang sesuai". Masukkan daftar kunci benar di 'kunciPilihanKompleks' seperti ["A", "C"].
   - 'benar_salah' : Pernyataan yang dinilai Benar atau Salah. Kunci: "Benar" atau "Salah".
   - 'menjodohkan' : Soal menjodohkan kolom kiri dengan kolom kanan. Masukkan daftar pasangan di 'pasanganMenjodohkan' [{ "id": "1", "kiri": "teks kiri", "kanan": "teks kanan" }] dan 'kunciMenjodohkan'.
   - 'isian' : Soal isian singkat (jawaban berupa kata/istilah/angka).
   - 'esai' : Soal uraian panjang / penjelasan / hitungan.
3. Urutan nomor soal WAJIB dipertahankan persis seperti dokumen asli (1, 2, 3, ...).
4. Jika terdapat penanda gambar seperti '[[IMAGE_SOAL_1]]', tempatkan penanda tersebut pada soal yang tepat di field 'gambarMarker' atau 'gambarMarkers' (array).
5. Deteksi kunci jawaban jika ada pada soal (misalnya cetak tebal, tanda kurung, garis bawah, atau tabel kunci jawaban di akhir dokumen).
6. Hubungkan setiap kunci jawaban dengan nomor soal yang benar. Jika kunci tidak terdeteksi, biarkan string kosong "" dan tandai 'perluVerifikasi': true dengan keterangan di 'catatanVerifikasi'.
7. Format output WAJIB JSON valid sesuai skema:

{
  "judul": "string judul naskah jika ada",
  "mataPelajaran": "string mata pelajaran jika tertera",
  "kelas": "string tingkat kelas jika tertera",
  "soalList": [
    {
      "nomor": 1,
      "tipe": "pilihan_ganda | pilihan_ganda_kompleks | benar_salah | menjodohkan | isian | esai",
      "pertanyaan": "teks pertanyaan lengkap beserta data tabel/rumus",
      "pilihan": {
        "A": "teks opsi A",
        "B": "teks opsi B",
        "C": "teks opsi C",
        "D": "teks opsi D"
      },
      "kunciPilihanKompleks": ["A", "C"],
      "pasanganMenjodohkan": [
        { "id": "1", "kiri": "pernyataan kiri", "kanan": "pasangan kanan" }
      ],
      "kunciMenjodohkan": { "1": "pasangan kanan" },
      "kunciJawaban": "A | B | C | D | teks kunci",
      "pembahasan": "penjelasan jika ada di dokumen",
      "gambarMarker": "[[IMAGE_SOAL_1]] atau null",
      "gambarMarkers": ["[[IMAGE_SOAL_1]]"],
      "bobot": 1,
      "perluVerifikasi": false,
      "catatanVerifikasi": "keterangan jika perlu verifikasi"
    }
  ]
}`;

      const responseText = await generateContentWithFallback(ai, {
        contents: prompt,
        config: {
          responseMimeType: "application/json",
        },
      });

      parsed = cleanAndParseJson(responseText);
      if (parsed && Array.isArray(parsed.soalList) && parsed.soalList.length > 0) {
        aiSucceeded = true;
      }
    } catch (err: any) {
      console.warn("[handleParseDocx] AI parsing did not complete, falling back to local structural parser:", err?.message);
    }
  }

  // Graceful local fallback: Never return 500!
  if (!aiSucceeded || !parsed?.soalList || parsed.soalList.length === 0) {
    console.info("[handleParseDocx] Executing high-accuracy local structural parser...");
    return parseDocxLocally(extractedParagraphs, mediaImages, fileName);
  }

  // Map back image markers to actual Base64 Data URIs
  const questions = (parsed.soalList || []).map((q: any, idx: number) => {
    let finalImage: string | undefined = undefined;
    const allImages: string[] = [];

    // Check gambarMarkers array or singular gambarMarker
    const markers: string[] = Array.isArray(q.gambarMarkers)
      ? q.gambarMarkers
      : q.gambarMarker
      ? [q.gambarMarker]
      : [];

    markers.forEach((m) => {
      if (imageIndexMap[m] && !allImages.includes(imageIndexMap[m])) {
        allImages.push(imageIndexMap[m]);
      }
    });

    // Also scan in question text
    if (q.pertanyaan) {
      for (const [marker, uri] of Object.entries(imageIndexMap)) {
        if (q.pertanyaan.includes(marker)) {
          if (!allImages.includes(uri)) {
            allImages.push(uri);
          }
          q.pertanyaan = q.pertanyaan.replace(marker, "").trim();
        }
      }
    }

    if (allImages.length > 0) {
      finalImage = allImages[0];
    }

    return {
      id: `soal-${Date.now()}-${idx + 1}`,
      nomor: q.nomor || idx + 1,
      tipe: q.tipe || "pilihan_ganda",
      pertanyaan: q.pertanyaan || "",
      pilihan: q.pilihan || undefined,
      pilihanKompleks: q.pilihanKompleks || (q.tipe === 'pilihan_ganda_kompleks' ? q.pilihan : undefined),
      kunciPilihanKompleks: q.kunciPilihanKompleks || undefined,
      pasanganMenjodohkan: q.pasanganMenjodohkan || undefined,
      kunciMenjodohkan: q.kunciMenjodohkan || undefined,
      kunciJawaban: q.kunciJawaban || (q.kunciPilihanKompleks ? q.kunciPilihanKompleks.join(", ") : ""),
      pembahasan: q.pembahasan || "",
      bobot: Number(q.bobot) > 0 ? Number(q.bobot) : 1,
      gambar: finalImage,
      gambarList: allImages.length > 0 ? allImages : undefined,
      perluVerifikasi: Boolean(q.perluVerifikasi || (!q.kunciJawaban && !q.kunciPilihanKompleks)),
      catatanVerifikasi:
        q.catatanVerifikasi ||
        (!q.kunciJawaban && !q.kunciPilihanKompleks
          ? "Kunci jawaban belum terdeteksi dari dokumen"
          : undefined),
    };
  });

  return {
    success: true,
    judul: parsed.judul || fileName.replace(/\.[^/.]+$/, ""),
    mataPelajaran: parsed.mataPelajaran || "",
    kelas: parsed.kelas || "",
    soalList: questions,
    totalSoal: questions.length,
    totalGambarDiekstrak: Object.keys(mediaImages).length,
    rawText: rawDocumentText,
  };
}

// 2. Core handler: Parse PDF
export async function handleParsePdf(fileBase64: string, fileName: string = "dokumen-soal.pdf") {
  if (!fileBase64) {
    return {
      success: false,
      error: "Data berkas PDF (fileBase64) tidak ditemukan dalam permintaan.",
      soalList: [],
    };
  }

  // Safe check if GEMINI_API_KEY is configured
  if (!process.env.GEMINI_API_KEY) {
    return {
      success: false,
      code: "GEMINI_KEY_NOT_CONFIGURED",
      error:
        "Layanan ekstraksi naskah berkas PDF membutuhkan variabel lingkungan GEMINI_API_KEY pada server Vercel (Project Settings > Environment Variables). Untuk solusi instan tanpa perlu API key, silakan gunakan naskah dalam format Word (.docx) yang memiliki parser otomatis lokal.",
      hint: "Buka Vercel Dashboard > Project Settings > Environment Variables, tambahkan GEMINI_API_KEY, lalu lakukan Redeploy.",
      soalList: [],
    };
  }

  const cleanBase64 = fileBase64.replace(/^data:application\/pdf;base64,/, "");
  const ai = getGeminiClient();

  const prompt = `Anda adalah sistem AI pemeriksa naskah ujian resmi sekolah Indonesia.
Analisis berkas PDF terlampir secara menyeluruh (baik halaman berupa teks digital maupun hasil scan/gambar OCR).

ATURAN WAJIB & INTEGRITAS NASKAH SOAL:
1. JANGAN PERNAH MENGARANG ATAU MENGUBAH teks soal, angka, pilihan jawaban, rumus, atau urutan soal dari dokumen asli!
2. Ekstrak nomor soal berurutan persis sesuai naskah dokumen asli (1, 2, 3, ...).
3. Kenali nomor soal, teks pertanyaan, rumus matematika/sains, tabel, dan tipe soal secara akurat:
   - 'pilihan_ganda' : Pilihan tunggal A, B, C, D, E.
   - 'pilihan_ganda_kompleks' : Pilihan dengan lebih dari 1 jawaban benar (centang/checkbox). Kunci di 'kunciPilihanKompleks': ["A", "C"].
   - 'benar_salah' : Pernyataan yang dinilai Benar atau Salah. Kunci: "Benar" atau "Salah".
   - 'menjodohkan' : Soal menjodohkan kolom kiri dan kanan. Masukkan daftar pasangan di 'pasanganMenjodohkan' [{ "id": "1", "kiri": "pernyataan", "kanan": "pasangan" }] dan 'kunciMenjodohkan'.
   - 'isian' : Soal isian singkat (kata/istilah/angka).
   - 'esai' : Soal uraian panjang / penjelasan / hitungan.
4. Deteksi kunci jawaban jika tersedia (pada naskah soal langsung, cetak tebal, atau tabel kunci jawaban di akhir halaman).
5. Jika dokumen memiliki diagram/gambar pada nomor soal tertentu, catat deskripsi visual diagram tersebut pada field 'gambarDeskripsi' dan 'nomorHalaman'.
6. Jika ada soal yang terpotong, buram, tidak terbaca jelas, atau kunci belum cocok, tandai 'perluVerifikasi': true dan isi 'catatanVerifikasi'.
7. Format output WAJIB JSON valid sesuai skema:

{
  "judul": "string judul dokumen ujian",
  "mataPelajaran": "string mata pelajaran jika ada",
  "kelas": "string kelas jika ada",
  "soalList": [
    {
      "nomor": 1,
      "tipe": "pilihan_ganda | pilihan_ganda_kompleks | benar_salah | menjodohkan | isian | esai",
      "pertanyaan": "teks soal lengkap beserta rumus atau data tabel",
      "pilihan": {
        "A": "teks A",
        "B": "teks B",
        "C": "teks C",
        "D": "teks D"
      },
      "kunciPilihanKompleks": ["A", "C"],
      "pasanganMenjodohkan": [
        { "id": "1", "kiri": "pernyataan kiri", "kanan": "pasangan kanan" }
      ],
      "kunciMenjodohkan": { "1": "pasangan kanan" },
      "kunciJawaban": "A | B | C | D | teks kunci",
      "pembahasan": "pembahasan ringkas jika ada",
      "gambarDeskripsi": "keterangan gambar/diagram jika soal merujuk pada gambar tertentu",
      "nomorHalaman": 1,
      "bobot": 1,
      "perluVerifikasi": false,
      "catatanVerifikasi": "catatan jika perlu dicek guru"
    }
  ]
}`;

  const responseText = await generateContentWithFallback(ai, {
    contents: [
      {
        inlineData: {
          mimeType: "application/pdf",
          data: cleanBase64,
        },
      },
      {
        text: prompt,
      },
    ],
    config: {
      responseMimeType: "application/json",
    },
  });

  const parsed = cleanAndParseJson(responseText);

  const questions = (parsed.soalList || []).map((q: any, idx: number) => ({
    id: `soal-${Date.now()}-${idx + 1}`,
    nomor: q.nomor || idx + 1,
    tipe: q.tipe || "pilihan_ganda",
    pertanyaan: q.pertanyaan || "",
    pilihan: q.pilihan || undefined,
    pilihanKompleks: q.pilihanKompleks || (q.tipe === 'pilihan_ganda_kompleks' ? q.pilihan : undefined),
    kunciPilihanKompleks: q.kunciPilihanKompleks || undefined,
    pasanganMenjodohkan: q.pasanganMenjodohkan || undefined,
    kunciMenjodohkan: q.kunciMenjodohkan || undefined,
    kunciJawaban: q.kunciJawaban || (q.kunciPilihanKompleks ? q.kunciPilihanKompleks.join(", ") : ""),
    pembahasan: q.pembahasan || "",
    gambarCaption: q.gambarDeskripsi || undefined,
    nomorHalaman: q.nomorHalaman || undefined,
    bobot: Number(q.bobot) > 0 ? Number(q.bobot) : 1,
    perluVerifikasi: Boolean(q.perluVerifikasi || (!q.kunciJawaban && !q.kunciPilihanKompleks)),
    catatanVerifikasi:
      q.catatanVerifikasi ||
      (!q.kunciJawaban && !q.kunciPilihanKompleks
        ? "Kunci jawaban belum terdeteksi dari dokumen"
        : undefined),
  }));

  return {
    success: true,
    judul: parsed.judul || fileName.replace(/\.[^/.]+$/, ""),
    mataPelajaran: parsed.mataPelajaran || "",
    kelas: parsed.kelas || "",
    soalList: questions,
    totalSoal: questions.length,
  };
}

// 3. Core handler: Parse Raw Text Soal
export async function handleParseTextSoal(text: string) {
  if (!text || !text.trim()) {
    return {
      success: false,
      code: "INVALID_INPUT",
      error: "Teks soal tidak boleh kosong.",
      soalList: [],
    };
  }

  if (!process.env.GEMINI_API_KEY) {
    return {
      success: false,
      code: "GEMINI_KEY_NOT_CONFIGURED",
      isConfigError: true,
      error: "Variabel lingkungan GEMINI_API_KEY belum dikonfigurasi di server.",
      hint: "Silakan tambahkan GEMINI_API_KEY pada Vercel Dashboard > Project Settings > Environment Variables, lalu redeploy.",
      soalList: [],
    };
  }

  const ai = getGeminiClient();
  const prompt = `Anda adalah parser naskah ujian sekolah Indonesia.
Bacalah teks berikut dan ubah menjadi butir soal terstruktur secara akurat:

${text}

ATURAN:
1. Pertahankan isi teks, angka, pilihan jawaban persis seperti aslinya.
2. Kenali nomor soal, teks pertanyaan, pilihan A/B/C/D/E, dan kunci jawaban.
3. Output format JSON valid:
{
  "soalList": [
    {
      "nomor": 1,
      "tipe": "pilihan_ganda | benar_salah | isian | esai",
      "pertanyaan": "teks soal",
      "pilihan": {
        "A": "teks A",
        "B": "teks B",
        "C": "teks C",
        "D": "teks D"
      },
      "kunciJawaban": "kunci",
      "bobot": 1
    }
  ]
}`;

  const responseText = await generateContentWithFallback(ai, {
    contents: prompt,
    config: {
      responseMimeType: "application/json",
    },
  });

  const parsed = cleanAndParseJson(responseText);
  const questions = (parsed.soalList || []).map((q: any, idx: number) => ({
    id: `soal-${Date.now()}-${idx + 1}`,
    nomor: q.nomor || idx + 1,
    tipe: q.tipe || "pilihan_ganda",
    pertanyaan: q.pertanyaan || "",
    pilihan: q.pilihan || undefined,
    kunciJawaban: q.kunciJawaban || "",
    bobot: Number(q.bobot) > 0 ? Number(q.bobot) : 1,
    perluVerifikasi: !q.kunciJawaban,
    catatanVerifikasi: !q.kunciJawaban ? "Kunci jawaban perlu diisi" : undefined,
  }));

  return {
    success: true,
    soalList: questions,
  };
}

// 4. PARSER GAMBAR NASKAH UJIAN (JPG / JPEG / PNG / SCAN MOBILE OCR)
// =========================================================================
export async function handleParseImage(
  fileBase64: string,
  fileName: string = "naskah-ujian.jpg",
  mimeType: string = "image/jpeg"
) {
  if (!fileBase64) {
    return {
      success: false,
      error: "Data gambar berkas (fileBase64) tidak ditemukan dalam permintaan.",
      soalList: [],
    };
  }

  if (!process.env.GEMINI_API_KEY) {
    return {
      success: false,
      code: "GEMINI_KEY_NOT_CONFIGURED",
      error: "Variabel lingkungan GEMINI_API_KEY belum dikonfigurasi di server.",
      soalList: [],
    };
  }

  const cleanBase64 = fileBase64.replace(/^data:image\/[a-zA-Z+]+;base64,/, "");
  let validMime = mimeType;
  if (!validMime || validMime === "application/octet-stream") {
    const ext = fileName.split(".").pop()?.toLowerCase();
    if (ext === "png") validMime = "image/png";
    else if (ext === "webp") validMime = "image/webp";
    else validMime = "image/jpeg";
  }

  const ai = getGeminiClient();

  const prompt = `Anda adalah sistem OCR dan analisis naskah ujian sekolah tingkat profesional di Indonesia.
Analisis gambar naskah ujian terlampir secara teliti (hasil scan atau foto kamera HP/laptop).

ATURAN WAJIB INTEGRITAS NASKAH SOAL:
1. JANGAN PERNAH MENGARANG ATAU MERUBAH teks soal, angka, rumus, atau pilihan jawaban dari naskah asli!
2. Ekstrak butir soal secara berurutan sesuai nomor asli yang tertera pada lembar dokumen (1, 2, 3, ...).
3. Kenali jenis soal:
   - 'pilihan_ganda': Pilihan tunggal A, B, C, D, E.
   - 'pilihan_ganda_kompleks': Jawaban lebih dari 1 pilihan benar.
   - 'benar_salah': Pernyataan Benar/Salah.
   - 'menjodohkan': Pasangan kolom kiri dan kanan.
   - 'isian': Isian singkat.
   - 'esai': Soal uraian/penjelasan/hitungan.
4. DETEKSI KUNCI JAWABAN DARI DOKUMEN ASLI:
   - Jika lembar memuat kunci jawaban (misal tanda centang tebal, lingkaran, atau tabel kunci di bagian bawah):
     set 'kunciResmiDitemukan': true dan masukkan nilai kuncinya.
   - Jika TIDAK ADA kunci jawaban di lembar naskah:
     set 'kunciResmiDitemukan': false, 'kunciJawaban': "", dan berikan saran jawaban Anda di field 'saranKunciAI'. Set 'perluVerifikasi': true, 'catatanVerifikasi': "Kunci resmi tidak ditemukan di dokumen (tersedia rekomendasi AI)".
5. UNTUK SOAL ESAI:
   - Ekstrak teks pertanyaan lengkap.
   - Ekstrak contoh jawaban atau rubrik penilaian jika tertulis di dokumen.
   - Tentukan nilai bobot maksimum yang wajar (default 2 atau 5).
   - Ekstrak indikator atau kata kunci penting yang diharapkan muncul.
6. FORMAT OUTPUT HARUS JSON VALID:
{
  "judul": "string judul naskah",
  "mataPelajaran": "string mata pelajaran",
  "kelas": "string kelas",
  "soalList": [
    {
      "nomor": 1,
      "tipe": "pilihan_ganda | pilihan_ganda_kompleks | benar_salah | menjodohkan | isian | esai",
      "pertanyaan": "teks pertanyaan lengkap",
      "pilihan": {
        "A": "teks A",
        "B": "teks B",
        "C": "teks C",
        "D": "teks D"
      },
      "kunciJawaban": "A",
      "kunciResmiDitemukan": true,
      "saranKunciAI": "A",
      "contohJawaban": "uraian jawaban ideal jika esai",
      "rubrikPenilaian": "pedoman penskoran jika esai",
      "indikatorWajib": ["kata kunci 1", "kata kunci 2"],
      "pembahasan": "penjelasan singkat",
      "bobot": 1,
      "perluVerifikasi": false,
      "catatanVerifikasi": ""
    }
  ]
}`;

  const responseText = await generateContentWithFallback(ai, {
    contents: [
      {
        inlineData: {
          mimeType: validMime,
          data: cleanBase64,
        },
      },
      { text: prompt },
    ],
    config: {
      responseMimeType: "application/json",
    },
  });

  const parsed = cleanAndParseJson(responseText);

  const questions = (parsed.soalList || []).map((q: any, idx: number) => ({
    id: `soal-${Date.now()}-${idx + 1}`,
    nomor: q.nomor || idx + 1,
    tipe: q.tipe || "pilihan_ganda",
    pertanyaan: q.pertanyaan || "",
    pilihan: q.pilihan || undefined,
    pilihanKompleks: q.pilihanKompleks || (q.tipe === 'pilihan_ganda_kompleks' ? q.pilihan : undefined),
    kunciPilihanKompleks: q.kunciPilihanKompleks || undefined,
    pasanganMenjodohkan: q.pasanganMenjodohkan || undefined,
    kunciMenjodohkan: q.kunciMenjodohkan || undefined,
    kunciJawaban: q.kunciResmiDitemukan ? (q.kunciJawaban || "") : (q.saranKunciAI || q.kunciJawaban || ""),
    kunciResmiDitemukan: Boolean(q.kunciResmiDitemukan),
    saranKunciAI: q.saranKunciAI || undefined,
    contohJawaban: q.contohJawaban || (q.tipe === 'esai' ? q.kunciJawaban : undefined),
    rubrikPenilaian: q.rubrikPenilaian || undefined,
    indikatorWajib: Array.isArray(q.indikatorWajib) ? q.indikatorWajib : undefined,
    pembahasan: q.pembahasan || "",
    bobot: Number(q.bobot) > 0 ? Number(q.bobot) : (q.tipe === 'esai' ? 2 : 1),
    nilaiMaksimum: Number(q.bobot) > 0 ? Number(q.bobot) : (q.tipe === 'esai' ? 2 : 1),
    perluVerifikasi: Boolean(q.perluVerifikasi || !q.kunciResmiDitemukan),
    catatanVerifikasi:
      q.catatanVerifikasi ||
      (!q.kunciResmiDitemukan
        ? "Kunci resmi tidak ditemukan di dokumen; verifikasi kunci rekomendasi AI"
        : undefined),
  }));

  return {
    success: true,
    judul: parsed.judul || fileName.replace(/\.[^/.]+$/, ""),
    mataPelajaran: parsed.mataPelajaran || "",
    kelas: parsed.kelas || "",
    soalList: questions,
    totalSoal: questions.length,
  };
}

// =========================================================================
// 5. MATCH KUNCI JAWABAN TERPISAH KE SOAL YANG SUDAH ADA
// =========================================================================
export async function handleMatchAnswerKeys(
  soalList: any[],
  keySource: {
    keyFileBase64?: string;
    keyMimeType?: string;
    keyText?: string;
    fileName?: string;
  }
) {
  if (!soalList || !soalList.length) {
    return {
      success: false,
      code: "INVALID_INPUT",
      error: "Daftar butir soal kosong, tidak dapat mencocokkan kunci.",
      totalMatched: 0,
      soalList: [],
    };
  }

  if (!process.env.GEMINI_API_KEY) {
    return {
      success: false,
      code: "GEMINI_KEY_NOT_CONFIGURED",
      isConfigError: true,
      error: "Variabel lingkungan GEMINI_API_KEY belum dikonfigurasi di server.",
      hint: "Silakan buka Project Settings > Environment Variables di dashboard Vercel, tambahkan GEMINI_API_KEY, lalu redeploy.",
      totalMatched: 0,
      soalList,
    };
  }

  const ai = getGeminiClient();

  const soalSummary = soalList.map((s, idx) => ({
    nomor: s.nomor || idx + 1,
    tipe: s.tipe,
    pertanyaan: s.pertanyaan?.slice(0, 100),
    kunciSaatIni: s.kunciJawaban || "",
  }));

  const prompt = `Anda adalah asisten pemeriksa kunci jawaban ujian sekolah.
Tugas Anda adalah membaca dokumen atau teks kunci jawaban berikut, lalu mencocokkannya secara tepat berdasarkan nomor soal pada daftar butir soal yang sudah ada.

DAFTAR NOMOR SOAL:
${JSON.stringify(soalSummary, null, 2)}

ATURAN PENCOCOKAN:
1. Hubungkan kunci berdasarkan NOMOR SOAL (misal: "1. A", "No 2 -> C", "3. B", dsb.).
2. Untuk soal pilihan ganda, ambil huruf opsi (A, B, C, D, E).
3. Untuk soal esai/uraian, ambil poin pedoman penskoran, kriteria nilai, atau kalimat jawaban acuan.
4. Tandai 'kunciResmiDitemukan': true karena berasal langsung dari dokumen kunci guru.
5. Format output JSON valid:
{
  "matchedKeys": [
    {
      "nomor": 1,
      "kunciJawaban": "A",
      "contohJawaban": "teks jawaban lengkap jika ada",
      "rubrikPenilaian": "pedoman penskoran jika ada",
      "pembahasan": "penjelasan jika ada"
    }
  ]
}`;

  const contents: any[] = [];

  if (keySource.keyFileBase64) {
    const cleanB64 = keySource.keyFileBase64.replace(/^data:[^;]+;base64,/, "");
    contents.push({
      inlineData: {
        mimeType: keySource.keyMimeType || "application/pdf",
        data: cleanB64,
      },
    });
  }

  if (keySource.keyText) {
    contents.push({ text: `TEKS KUNCI JAWABAN:\n${keySource.keyText}` });
  }

  contents.push({ text: prompt });

  const responseText = await generateContentWithFallback(ai, {
    contents,
    config: { responseMimeType: "application/json" },
  });

  const parsed = cleanAndParseJson(responseText);
  const matchedKeys: any[] = parsed.matchedKeys || [];

  const keyMap = new Map<number, any>();
  matchedKeys.forEach((k) => {
    keyMap.set(Number(k.nomor), k);
  });

  const updatedSoalList = soalList.map((soal, idx) => {
    const no = soal.nomor || idx + 1;
    const match = keyMap.get(no);
    if (match && match.kunciJawaban) {
      return {
        ...soal,
        kunciJawaban: match.kunciJawaban,
        contohJawaban: match.contohJawaban || soal.contohJawaban || match.kunciJawaban,
        rubrikPenilaian: match.rubrikPenilaian || soal.rubrikPenilaian,
        pembahasan: match.pembahasan || soal.pembahasan,
        kunciResmiDitemukan: true,
        perluVerifikasi: false,
        catatanVerifikasi: undefined,
      };
    }
    return soal;
  });

  return {
    success: true,
    totalMatched: matchedKeys.length,
    soalList: updatedSoalList,
  };
}

// =========================================================================
// 6. PENILAIAN JAWABAN ESAI SISWA BERBANTU AI (SEMANTIC RUBRIC GRADING)
// =========================================================================
export async function handleGradeEssay(params: {
  pertanyaan: string;
  kunciJawaban?: string;
  contohJawaban?: string;
  rubrikPenilaian?: string;
  indikatorWajib?: string[];
  variasiJawaban?: string[];
  jawabanSiswa: string;
  bobotMaksimal: number;
}) {
  const {
    pertanyaan,
    kunciJawaban = "",
    contohJawaban = "",
    rubrikPenilaian = "",
    indikatorWajib = [],
    variasiJawaban = [],
    jawabanSiswa = "",
    bobotMaksimal = 10,
  } = params;

  if (!jawabanSiswa.trim()) {
    return {
      success: true,
      skorRekomendasi: 0,
      alasanPenilaian: "Siswa tidak mengisi jawaban (jawaban kosong).",
      indikatorDitemukan: [],
      saranFeedbackSiswa: "Silakan jawab pertanyaan uraian dengan lengkap sesuai materi yang dipelajari.",
    };
  }

  if (!process.env.GEMINI_API_KEY) {
    return {
      success: false,
      code: "GEMINI_KEY_NOT_CONFIGURED",
      isConfigError: true,
      error: "Variabel lingkungan GEMINI_API_KEY belum dikonfigurasi di server.",
      hint: "Silakan buka Project Settings > Environment Variables di dashboard Vercel, tambahkan GEMINI_API_KEY, lalu redeploy.",
      skorRekomendasi: 0,
      alasanPenilaian: "Koreksi otomatis membutuhkan GEMINI_API_KEY di server. Anda dapat memberi nilai manual pada kolom skor di atas.",
      indikatorDitemukan: [],
      saranFeedbackSiswa: "",
    };
  }

  const ai = getGeminiClient();

  const prompt = `Anda adalah penilai esai akademik sekolah berstandar nasional Indonesia yang objektif, mendidik, dan adil.
Tugas Anda adalah menilai jawaban esai peserta didik berdasarkan rubrik penilaian dan konsep materi acuan yang telah ditetapkan guru.

DATA SOAL & PEDOMAN GURU:
- Pertanyaan: ${pertanyaan}
- Kunci / Contoh Jawaban Acuan: ${contohJawaban || kunciJawaban || "Tidak ada acuan spesifik"}
- Pedoman / Rubrik Penskoran: ${rubrikPenilaian || "Beri skor proporsional sesuai kebenaran konsep"}
- Indikator Konsep Wajib: ${indikatorWajib.length ? indikatorWajib.join(", ") : "Tidak ditentukan"}
- Variasi Jawaban Diterima: ${variasiJawaban.length ? variasiJawaban.join(", ") : "Gunakan penalaran makna"}
- Bobot Skor Maksimum: ${bobotMaksimal}

JAWABAN PESERTA DIDIK:
"${jawabanSiswa}"

PRINSIP PENILAIAN WAJIB:
1. PENALARAN MAKNA (SEMANTIK): Terima dan hargai susunan kalimat yang berbeda asalkan inti konsep dan esensinya benar! Jangan menuntut kesamaan kata perkata (harfiah).
2. KELENGKAPAN INDIKATOR: Jangan berikan nilai penuh jika konsep esensial yang diminta soal terlewat.
3. ADIL DAN TIDAK NOL INSTAN: Jangan langsung memberikan nilai 0 jika siswa menunjukkan pemahaman sebagian yang relevan. Berikan skor proporsional (misal separuh atau sebagian).
4. REKOMENDASI TERUKUR: Berikan skor bulat atau kelipatan 0.5 antara 0 sampai ${bobotMaksimal}.
5. Berikan alasan penilaian yang jelas, sopan, dan transparan untuk dibaca oleh guru.

FORMAT OUTPUT HARUS JSON VALID:
{
  "skorRekomendasi": ${bobotMaksimal},
  "alasanPenilaian": "penjelasan rinci mengapa skor tersebut direkomendasikan kepada guru",
  "indikatorDitemukan": ["indikator 1 yang berhasil dijawab siswa"],
  "saranFeedbackSiswa": "catatan edukatif untuk siswa meningkatkan pemahamannya"
}`;

  const responseText = await generateContentWithFallback(ai, {
    contents: prompt,
    config: { responseMimeType: "application/json" },
  });

  const parsed = cleanAndParseJson(responseText);

  let skor = Number(parsed.skorRekomendasi);
  if (isNaN(skor) || skor < 0) skor = 0;
  if (skor > bobotMaksimal) skor = bobotMaksimal;

  return {
    success: true,
    skorRekomendasi: Math.round(skor * 10) / 10,
    alasanPenilaian: parsed.alasanPenilaian || "Dinilai berdasarkan kecocokan konsep dengan rubrik.",
    indikatorDitemukan: Array.isArray(parsed.indikatorDitemukan) ? parsed.indikatorDitemukan : [],
    saranFeedbackSiswa: parsed.saranFeedbackSiswa || "Terima kasih telah menjawab.",
  };
}

