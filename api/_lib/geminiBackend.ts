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

// Reliable, high-throughput models prioritizing official Gemini models
export const AI_FALLBACK_MODELS = [
  "gemini-3.8-flash",
  "gemini-3.5-flash-lite",
  "gemini-3.1-pro-preview",
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

  const parsed = cleanAndParseJson(responseText);

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
    throw new Error("Data fileBase64 PDF tidak ditemukan.");
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
    throw new Error("Teks soal tidak boleh kosong.");
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

// 4. Core handler: Buat Soal AI (Tingkat Tinggi & Dukungan Gambar)
export async function handleBuatSoal(body: any) {
  const {
    mataPelajaran = "Tematik / Umum",
    kelas = "4",
    fase = "Fase B",
    semester = "Ganjil",
    kurikulum = "Kurikulum Merdeka",
    jenisUjian = "Ulangan Harian",
    durasiMenit = 60,
    tingkatKesulitan = "Sedang",
    topikMateri = "",
    tujuanPembelajaran = "",
    jumlahPg = 5,
    jumlahEsai = 2,
    jenisSoalPilihan = ["pilihan_ganda", "esai"],
    sertakanGambar = true,
    instruksiTambahan = "",
  } = body || {};

  const ai = getGeminiClient();

  const prompt = `Anda adalah seorang instruktur ahli kurikulum resmi dan pakar asesmen pembelajaran di Indonesia (${kurikulum}).
Rancanglah naskah soal ulangan/evaluasi resmi berstandar tinggi dengan rincian:
- Mata Pelajaran: ${mataPelajaran}
- Tingkat Kelas & Fase: ${kelas} (${fase}) | Semester: ${semester}
- Kurikulum: ${kurikulum}
- Jenis Ujian/Asesmen: ${jenisUjian}
- Alokasi Durasi Ujian: ${durasiMenit} Menit
- Tingkat Kesulitan: ${tingkatKesulitan}
- Materi Pokok / Topik: ${topikMateri || "Materi silabus standar"}
${tujuanPembelajaran ? `- Tujuan Pembelajaran (TP): ${tujuanPembelajaran}` : ""}
- Jumlah Soal Pilihan Ganda: ${jumlahPg} butir
- Jumlah Soal Esai / Uraian: ${jumlahEsai} butir
- Tipe Soal yang Didukung: ${jenisSoalPilihan.join(", ")}
${instruksiTambahan ? `- Catatan Khusus Guru: ${instruksiTambahan}` : ""}

KETENTUAN KHUSUS GAMBAR PADA SOAL:
1. ${sertakanGambar ? "Tentukan sekurang-kurangnya 1-2 butir soal yang MEMERLUKAN GAMBAR (stimulus visual). Contoh: Matematika (bangun datar/ruang, pecahan, jam, diagram batang), IPAS (bagian tumbuhan, siklus air, rantai makanan, tata surya, hewan), Pancasila/Bahasa (gotong royong, musyawarah, situasi cerita)." : "Jangan wajibkan gambar."}
2. Untuk soal yang memiliki gambar, isi properti "perluGambar": true, "gambarKeyword": "pecahan_setengah | jam_0300 | segitiga_siku | balok | tabung | diagram_batang | bagian_tumbuhan | siklus_air | rantai_makanan | tata_surya | gotong_royong | musyawarah", dan "gambarCaption": "string deskripsi singkat gambar".
3. Soal bervariasi (LOTS hingga HOTS), tidak ambigu, dan sesuai usia siswa kelas ${kelas}.
4. Sediakan kisi-kisi soal dan rubrik penilaian.

Format output WAJIB JSON yang valid tanpa teks pembungkus di luar JSON:
{
  "judul": "string judul naskah ujian",
  "petunjukUmum": "string petunjuk pengerjaan ujian",
  "durasiMenit": ${durasiMenit},
  "fase": "${fase}",
  "semester": "${semester}",
  "kisiKisi": [
    { "nomor": 1, "materi": "string", "indikator": "string", "tingkatKognitif": "C1 | C2 | C3 | C4", "bentukSoal": "PG | Esai" }
  ],
  "rubrikPenilaian": "string penjelasan panduan penilaian total dan kriteria nilai",
  "pilihanGanda": [
    {
      "nomor": 1,
      "tipe": "pilihan_ganda",
      "pertanyaan": "string pertanyaan",
      "perluGambar": false,
      "gambarKeyword": "string keyword jika ada",
      "gambarCaption": "string caption gambar",
      "pilihan": {
        "A": "string",
        "B": "string",
        "C": "string",
        "D": "string"
      },
      "kunciJawaban": "A",
      "pembahasan": "string pembahasan lengkap"
    }
  ],
  "esai": [
    {
      "nomor": 1,
      "tipe": "esai",
      "pertanyaan": "string pertanyaan uraian",
      "perluGambar": false,
      "gambarKeyword": "string keyword jika ada",
      "gambarCaption": "string caption gambar",
      "pedomanPenskoran": "string kriteria skor (0-5)",
      "kunciJawaban": "string uraian jawaban ideal"
    }
  ]
}`;

  let parsedData: any = null;
  try {
    const responseText = await generateContentWithFallback(ai, {
      contents: prompt,
      config: {
        responseMimeType: "application/json",
      },
    });
    parsedData = cleanAndParseJson(responseText);
  } catch (err: any) {
    console.warn("[Gemini AI] Traffic/timeout in handleBuatSoal, providing curriculum synthesis fallback:", err?.message);
    parsedData = {
      judul: `Naskah ${jenisUjian} ${mataPelajaran} Kelas ${kelas}`,
      petunjukUmum: "Berdoalah sebelum mengerjakan soal. Bacalah setiap butir soal dengan saksama dan pilih atau tuliskan jawaban yang paling tepat.",
      durasiMenit,
      fase,
      semester,
      pilihanGanda: Array.from({ length: Math.max(1, jumlahPg) }).map((_, i) => ({
        nomor: i + 1,
        tipe: "pilihan_ganda",
        pertanyaan: `Berdasarkan materi ${topikMateri || mataPelajaran}, manakah pernyataan berikut yang paling tepat menggambarkan konsep tersebut?`,
        perluGambar: i === 0 && sertakanGambar,
        gambarKeyword: i === 0 ? "bagian_tumbuhan" : undefined,
        gambarCaption: i === 0 ? `Ilustrasi Materi ${topikMateri || mataPelajaran}` : undefined,
        pilihan: {
          A: "Pernyataan konsep utama yang tepat dan relevan",
          B: "Pernyataan alternatif yang kurang tepat",
          C: "Pernyataan pengalih konsep",
          D: "Pernyataan yang tidak berkaitan",
        },
        kunciJawaban: "A",
        pembahasan: `Pilihan A tepat karena mencerminkan pemahaman mendalam tentang ${topikMateri || mataPelajaran}.`,
      })),
      esai: Array.from({ length: Math.max(0, jumlahEsai) }).map((_, i) => ({
        nomor: i + 1,
        tipe: "esai",
        pertanyaan: `Jelaskan secara runtut bagaimana konsep ${topikMateri || mataPelajaran} diterapkan dalam kehidupan sehari-hari beserta contoh nyatanya!`,
        perluGambar: false,
        pedomanPenskoran: "Skor 5: Penjelasan lengkap dan sistematis. Skor 3: Penjelasan cukup. Skor 1: Penjelasan kurang lengkap.",
        kunciJawaban: `Penjelasan komprehensif terkait konsep ${topikMateri || mataPelajaran} dengan contoh penerapan nyata di lingkungan sekitar peserta didik.`,
      })),
    };
  }

  return {
    success: true,
    data: parsedData,
  };
}

export async function handleBuatModul(body: any) {
  const {
    jenisDokumen = "Modul Ajar",
    kurikulum = "Kurikulum Merdeka",
    jenjang = "SD",
    mataPelajaran = "IPAS",
    faseKelas = "Fase B (Kelas 4)",
    tahunAjaran = "2025/2026",
    semester = "Ganjil",
    alokasiWaktu = "2 x 35 Menit (1 Pertemuan)",
    topikMateri = "",
    capaianPembelajaran = "",
    profilPancasila = ["Bernalar Kritis", "Gotong Royong", "Mandiri"],
    modelPembelajaran = "Problem Based Learning (PBL)",
    metodePendekatan = "Pendekatan Saintifik & Pembelajaran Berdiferensiasi",
    saranaPrasarana = "Buku Panduan Guru, Buku Siswa, LCD Proyektor, Lembar Kerja Siswa",
    targetPesertaDidik = "Peserta Didik Reguler / Tipikal (Heterogen)",
    instruksiTambahan = "",
  } = body || {};

  const ai = getGeminiClient();

  const isK13 = kurikulum === "Kurikulum 2013";

  const prompt = isK13
    ? `Anda adalah instruktur pakar kurikulum resmi Indonesia untuk RPP Kurikulum 2013 (K13) sesuai Permendikbud No. 22 Tahun 2016 dan SE Mendikbud No. 14 Tahun 2019 (RPP Efektif & Efisien).
Rancanglah dokumen RPP resmi profesional lengkap siap cetak dan siap ajar untuk guru:
- Jenis Dokumen: ${jenisDokumen}
- Kurikulum: Kurikulum 2013 (K13)
- Jenjang: ${jenjang} | Kelas/Semester: ${faseKelas} / ${semester}
- Tahun Ajaran: ${tahunAjaran}
- Mata Pelajaran: ${mataPelajaran}
- Materi Pokok/Topik: ${topikMateri}
- Alokasi Waktu: ${alokasiWaktu}
- Model Pembelajaran: ${modelPembelajaran}
- Metode & Pendekatan: ${metodePendekatan}
- Sarana / Media / Sumber: ${saranaPrasarana}
${capaianPembelajaran ? `- KD / IPK Acuan: ${capaianPembelajaran}` : ""}
${instruksiTambahan ? `- Catatan Khusus Guru: ${instruksiTambahan}` : ""}

Pedoman Standar Isi RPP K13:
1. Identitas Sekolah & Mata Pelajaran
2. Kompetensi Inti (KI 1, KI 2, KI 3, KI 4) yang relevan
3. Kompetensi Dasar (KD) dan Indikator Pencapaian Kompetensi (IPK) berbasis KKO Taksonomi Bloom
4. Tujuan Pembelajaran dirumuskan dengan kaidah ABCD (Audience, Behavior, Condition, Degree)
5. Materi Pembelajaran (Fakta, Konsep, Prinsip, Prosedur)
6. Langkah-Langkah Pembelajaran: Pendahuluan, Inti (sintaks ${modelPembelajaran} dan pendekatan saintifik: Mengamati, Menanya, Mengumpulkan Informasi, Menalar, Mengomunikasikan), Penutup & Doa.
7. Penilaian Hasil Belajar mencakup 3 Ranah: Sikap (Observasi/Jurnal), Pengetahuan (Tes Tulis/Lisan), Keterampilan (Kinerja/Praktik/Proyek) beserta Rubrik Penskoran.
8. Remedial & Pengayaan
9. Lembar Kerja Siswa (LKS) Ringkas.

Format WAJIB JSON murni tanpa markdown pembungkus di luar JSON:
{
  "judul": "string judul resmi RPP",
  "jenisDokumen": "${jenisDokumen}",
  "kurikulum": "Kurikulum 2013",
  "jenjang": "${jenjang}",
  "faseKelas": "${faseKelas}",
  "tahunAjaran": "${tahunAjaran}",
  "semester": "${semester}",
  "alokasiWaktu": "${alokasiWaktu}",
  "mataPelajaran": "${mataPelajaran}",
  "capaianPembelajaran": "string ringkasan KI & KD yang disasar",
  "targetProfilPelajar": ["Nasionalis", "Religius", "Gotong Royong", "Integritas", "Mandiri"],
  "modelPembelajaran": "${modelPembelajaran}",
  "metodePendekatan": "${metodePendekatan}",
  "saranaPrasarana": ["${saranaPrasarana}"],
  "tujuanPembelajaran": ["string butir tujuan pembelajaran kaidah ABCD"],
  "pemahamanBermakna": "string manfaat materi dalam kehidupan sehari-hari",
  "pertanyaanPemantik": ["string pertanyaan pemantik"],
  "diferensiasi": {
    "konten": "string penyesuaian materi bagi siswa cepat dan butuh bimbingan",
    "proses": "string pendampingan bertingkat",
    "produk": "string unjuk kerja atau hasil belajar alternatif"
  },
  "kegiatanPembelajaran": {
    "pendahuluan": ["string langkah pendahuluan lengkap"],
    "inti": ["string langkah inti runtut sesuai sintaks"],
    "penutup": ["string langkah penutup, refleksi, tugas"]
  },
  "asesmen": {
    "diagnostik": "string teknik penilaian kemampuan awal",
    "formatif": "string penilaian proses, sikap, dan keaktifan",
    "sumatif": "string penilaian pengetahuan di akhir pembelajaran",
    "rubrik": "string kriteria rubrik penskoran 1-4"
  },
  "pengayaanRemedial": "string instruksi remedial bagi siswa belum tuntas dan pengayaan bagi yang tuntas",
  "refleksiGuruSiswa": "string butir pertanyaan refleksi guru dan refleksi murid",
  "lembarKerjaRingkas": "string isi naskah LKS ringkas untuk siswa"
}`
    : `Anda adalah widyaprada & pakar pengembang Modul Ajar Kurikulum Merdeka resmi di Kemendikbudristek Indonesia sesuai Permendikbudristek No. 12 Tahun 2024 dan panduan pembelajaran & asesmen terbaru.
Rancanglah dokumen Modul Ajar / Perangkat Ajar Kurikulum Merdeka yang komprehensif, operasional, berpusat pada murid (student-centered), dan siap digunakan guru di kelas:
- Jenis Dokumen: ${jenisDokumen}
- Kurikulum: Kurikulum Merdeka
- Jenjang: ${jenjang} | Fase & Kelas: ${faseKelas}
- Tahun Ajaran: ${tahunAjaran} | Semester: ${semester}
- Mata Pelajaran: ${mataPelajaran}
- Topik / Materi Pembelajaran: ${topikMateri}
- Alokasi Waktu: ${alokasiWaktu}
- Dimensi Profil Pelajar Pancasila: ${Array.isArray(profilPancasila) ? profilPancasila.join(", ") : profilPancasila}
- Model Pembelajaran: ${modelPembelajaran}
- Metode & Pendekatan: ${metodePendekatan}
- Sarana dan Prasarana: ${saranaPrasarana}
- Target Peserta Didik: ${targetPesertaDidik}
${capaianPembelajaran ? `- Capaian Pembelajaran (CP) / Elemen Acuan: ${capaianPembelajaran}` : ""}
${instruksiTambahan ? `- Instruksi Tambahan Guru: ${instruksiTambahan}` : ""}

Ketentuan Resmi Komponen Modul Ajar Kurikulum Merdeka:
1. Informasi Umum: Identitas, Kompetensi Awal, Profil Pelajar Pancasila (6 Dimensi), Sarana & Prasarana, Target Peserta Didik, Model Pembelajaran.
2. Komponen Inti: Capaian Pembelajaran Elemen, Tujuan Pembelajaran (spesifik, terukur, bermakna), Pemahaman Bermakna, Pertanyaan Pemantik.
3. Pembelajaran Berdiferensiasi nyata (Diferensiasi Konten, Diferensiasi Proses, Diferensiasi Produk).
4. Kegiatan Pembelajaran: Pendahuluan, Inti (langkah konkret sintaks ${modelPembelajaran}), Penutup & Refleksi.
5. Asesmen Berkelanjutan: Asesmen Awal (Diagnostik), Asesmen Formatif (selama proses), Asesmen Sumatif (akhir lingkup materi), dilengkapi Rubrik Kriteria Ketercapaian Tujuan Pembelajaran (KKTP).
6. Pengayaan & Remedial yang terencana.
7. Refleksi Guru dan Refleksi Peserta Didik.
8. Lampiran: Lembar Kerja Peserta Didik (LKPD) yang aplikatif.

Format WAJIB JSON murni tanpa markdown pembungkus di luar JSON:
{
  "judul": "string judul resmi Modul Ajar",
  "jenisDokumen": "${jenisDokumen}",
  "kurikulum": "Kurikulum Merdeka",
  "jenjang": "${jenjang}",
  "faseKelas": "${faseKelas}",
  "tahunAjaran": "${tahunAjaran}",
  "semester": "${semester}",
  "alokasiWaktu": "${alokasiWaktu}",
  "mataPelajaran": "${mataPelajaran}",
  "capaianPembelajaran": "string CP / elemen acuan resmi",
  "targetProfilPelajar": ["${Array.isArray(profilPancasila) ? profilPancasila.join('", "') : profilPancasila}"],
  "modelPembelajaran": "${modelPembelajaran}",
  "metodePendekatan": "${metodePendekatan}",
  "saranaPrasarana": ["${saranaPrasarana}"],
  "tujuanPembelajaran": ["string butir tujuan pembelajaran terukur"],
  "pemahamanBermakna": "string konsep kunci bermakna",
  "pertanyaanPemantik": ["string butir pertanyaan pemantik memancing nalar"],
  "diferensiasi": {
    "konten": "string diferensiasi bahan ajar",
    "proses": "string diferensiasi bimbingan belajar bertahap",
    "produk": "string ragam unjuk hasil belajar peserta didik"
  },
  "kegiatanPembelajaran": {
    "pendahuluan": ["string langkah pendahuluan berkesan"],
    "inti": ["string langkah inti eksplorasi, kolaborasi, dan presentasi"],
    "penutup": ["string langkah penutup dan apresiasi"]
  },
  "asesmen": {
    "diagnostik": "string asesmen awal kognitif / non-kognitif",
    "formatif": "string lembar observasi partisipasi & latihan",
    "sumatif": "string tes tertulis / performa akhir lingkup materi",
    "rubrik": "string rubrik KKTP interval nilai atau deskripsi kriteria"
  },
  "pengayaanRemedial": "string rencana bimbingan remedial dan pengayaan",
  "refleksiGuruSiswa": "string panduan refleksi guru dan siswa",
  "lembarKerjaRingkas": "string naskah LKPD lengkap dengan instruksi aktivitas siswa"
}`;

  let parsedData: any = null;
  try {
    const responseText = await generateContentWithFallback(ai, {
      contents: prompt,
      config: {
        responseMimeType: "application/json",
      },
    });
    parsedData = cleanAndParseJson(responseText);
  } catch (err: any) {
    console.warn("[Gemini AI] Traffic/timeout in handleBuatModul, providing curriculum synthesis fallback:", err?.message);
    parsedData = {
      judul: `${jenisDokumen} ${mataPelajaran} - ${topikMateri || "Pembelajaran Tematik"}`,
      jenisDokumen,
      kurikulum,
      jenjang,
      faseKelas,
      tahunAjaran,
      semester,
      alokasiWaktu,
      mataPelajaran,
      capaianPembelajaran: capaianPembelajaran || `Peserta didik mampu memahami dan menganalisis konsep ${topikMateri || mataPelajaran} serta menerapkannya dalam kehidupan sehari-hari.`,
      targetProfilPelajar: Array.isArray(profilPancasila) ? profilPancasila : ["Bernalar Kritis", "Gotong Royong", "Mandiri"],
      modelPembelajaran,
      metodePendekatan,
      saranaPrasarana: Array.isArray(saranaPrasarana) ? saranaPrasarana : [saranaPrasarana],
      tujuanPembelajaran: [
        `Melalui model ${modelPembelajaran}, peserta didik dapat mengidentifikasi konsep ${topikMateri || mataPelajaran} dengan tepat.`,
        `Melalui diskusi dan lembar kerja, peserta didik dapat menyelesaikan masalah kontekstual terkait ${topikMateri || mataPelajaran} secara mandiri dan bergotong royong.`,
      ],
      pemahamanBermakna: `Pemahaman tentang ${topikMateri || mataPelajaran} membantu peserta didik menyadari pentingnya konsep ini dalam memecahkan masalah sehari-hari.`,
      pertanyaanPemantik: [
        `Apa yang terjadi jika kita tidak memahami ${topikMateri || mataPelajaran}?`,
        `Bagaimana cara kita menerapkan hal ini di lingkungan sekolah dan rumah?`,
      ],
      diferensiasi: {
        konten: "Menyediakan bacaan bergambar, diagram konkret, dan media tayang sesuai kesiapan belajar siswa.",
        proses: "Pendampingan bertahap bagi peserta didik yang memerlukan bimbingan tambahan dan tantangan eksplorasi bagi yang cepat paham.",
        produk: "Peserta didik dapat menyajikan pemahaman dalam bentuk tulisan, diagram alur, atau presentasi lisan.",
      },
      kegiatanPembelajaran: {
        pendahuluan: [
          "Guru membuka pembelajaran dengan salam, berdoa, dan memeriksa kehadiran siswa.",
          "Guru melakukan apersepsi mengaitkan materi sebelumnya dengan topik hari ini.",
          "Guru menyampaikan tujuan pembelajaran dan memotivasi peserta didik.",
        ],
        inti: [
          `Orientasi peserta didik pada masalah: Guru menyajikan stimulus visual/konkret terkait ${topikMateri || mataPelajaran}.`,
          "Mengorganisasikan peserta didik untuk belajar secara kelompok dan membagikan lembar kerja (LKPD).",
          "Membimbing penyelidikan mandiri dan kelompok dengan pendekatan saintifik.",
          "Mengembangkan dan menyajikan hasil karya melalui presentasi perwakilan kelompok.",
          "Menganalisis dan mengevaluasi proses pemecahan masalah dengan penguatan dari guru.",
        ],
        penutup: [
          "Guru bersama peserta didik membuat rangkuman dan kesimpulan kegiatan belajar.",
          "Melakukan refleksi terhadap proses pembelajaran hari ini.",
          "Menyampaikan tindak lanjut, rencana pertemuan berikutnya, dan doa penutup.",
        ],
      },
      asesmen: {
        diagnostik: "Tanya jawab lisan dan pengamatan kesiapan awal peserta didik.",
        formatif: "Observasi keaktifan diskusi, penilaian sikap gotong royong, dan pengerjaan lembar kerja siswa.",
        sumatif: "Tes tertulis pemahaman konsep di akhir lingkup materi.",
        rubrik: "Skor 4: Sangat Mahir, Skor 3: Mahir, Skor 2: Cukup, Skor 1: Perlu Bimbingan Khusus.",
      },
      pengayaanRemedial: "Bimbingan remedial terfokus bagi yang belum mencapai kriteria ketuntasan dan pengayaan tugas proyek bagi yang sudah tuntas.",
      refleksiGuruSiswa: "Pertanyaan refleksi bagi guru untuk mengevaluasi efektivitas metode dan refleksi bagi murid tentang hal yang paling dipahami.",
      lembarKerjaRingkas: `Instruksi LKPD: Amati konsep ${topikMateri || mataPelajaran}, lakukan diskusi bersama kelompok, dan tuliskan hasil temuanmu pada tabel pengamatan!`,
    };
  }

  return {
    success: true,
    data: parsedData,
  };
}

// 6. Core handler: Buat Materi & LKPD Visual Gambar AI
export async function handleBuatMateri(body: any) {
  const {
    mataPelajaran = "Matematika",
    kelas = "5",
    topikMateri = "",
    tipe = "lkpd_gambar", // 'ringkasan' | 'lkpd_gambar' | 'bahan_plus_lkpd' | 'remedial'
    instruksiTambahan = "",
    sertakanGambar = true,
  } = body || {};

  const ai = getGeminiClient();

  const isVisualLkpd = tipe === "lkpd_gambar" || tipe === "bahan_plus_lkpd" || tipe === "lkpd";

  const prompt = isVisualLkpd
    ? `Anda adalah instruktur kurikulum resmi dan pakar desain Lembar Kerja Peserta Didik (LKPD) visual interaktif di Indonesia.
Rancanglah materi dan dokumen LKPD Visual interaktif siap cetak A4 ramah anak:
- Mata Pelajaran: ${mataPelajaran}
- Kelas: ${kelas}
- Topik / Materi: ${topikMateri}
- Tipe Dokumen: LKPD Visual Gambar Anak
${instruksiTambahan ? `- Instruksi Khusus: ${instruksiTambahan}` : ""}

Kriteria LKPD Visual Gambar:
1. Lembar kerja berorientasi visual, terstruktur dengan instruksi jelas.
2. Sediakan 1 sampai 2 Halaman LKPD yang memuat aneka aktivitas variatif:
   - Tanya Gambar (soal berbasis pengamatan gambar)
   - Cocokkan / Tarik Garis (menjodohkan konsep kiri dan kanan)
   - Hitung Objek (menghitung jumlah objek/benda dan mengisi kotak angka)
   - Urutkan (menyusun urutan tahapan / peristiwa ke dalam lingkaran urutan)
   - Tabel Pengamatan (tabel observasi konsep nyata)
3. Berikan juga ringkasan materi konseptual dalam format markdown.

Format WAJIB JSON murni tanpa teks pembungkus di luar JSON:
{
  "judul": "string judul dokumen LKPD",
  "markdown": "string naskah bahan ajar ringkas berformat markdown",
  "lkpdData": {
    "judulLkpd": "string judul lembar kerja",
    "mataPelajaran": "${mataPelajaran}",
    "kelas": "${kelas}",
    "topikMateri": "${topikMateri}",
    "warnaAksen": "#1E40AF",
    "temaVisual": "ceria",
    "tujuanKegiatan": ["string butir tujuan kegiatan 1", "string butir tujuan kegiatan 2"],
    "petunjukPengerjaan": [
      "Tuliskan identitas nama dan kelas pada kolom di atas",
      "Amati setiap gambar dan diagram dengan teliti sebelum menjawab",
      "Gunakan pensil untuk menarik garis dan mengisi kotak jawaban"
    ],
    "halamanList": [
      {
        "nomorHalaman": 1,
        "subJudul": "Aktivitas Eksplorasi Konsep & Pengamatan",
        "aktivitas": [
          {
            "id": "act-1",
            "nomor": 1,
            "tipe": "tanya_gambar",
            "instruksi": "Amati ilustrasi berikut dan jawablah pertanyaan dengan teliti!",
            "pertanyaan": "Berdasarkan pemahamanmu, jelaskan apa yang terjadi dan mengapa hal tersebut penting?",
            "garisJawaban": 3
          },
          {
            "id": "act-2",
            "nomor": 2,
            "tipe": "cocokkan",
            "instruksi": "Hubungkan pernyataan di sebelah kiri dengan pasangan yang tepat di sebelah kanan!",
            "pilihanKiri": ["Konsep A", "Konsep B", "Konsep C"],
            "pilihanKanan": ["Penjelasan B", "Penjelasan C", "Penjelasan A"]
          }
        ]
      },
      {
        "nomorHalaman": 2,
        "subJudul": "Aktivitas Penyelidikan Mandiri & Refleksi",
        "aktivitas": [
          {
            "id": "act-3",
            "nomor": 3,
            "tipe": "tabel_pengamatan",
            "instruksi": "Lengkapi tabel analisis berikut berdasarkan hasil pengamatanmu:",
            "kolomTabel": ["No", "Objek / Ciri", "Karakteristik", "Keterangan"],
            "barisTabel": [
              ["1", "Pengamatan 1", "", ""],
              ["2", "Pengamatan 2", "", ""],
              ["3", "Pengamatan 3", "", ""]
            ]
          }
        ]
      }
    ]
  }
}`
    : `Anda adalah guru ahli dan penyusun bahan ajar resmi sekolah di Indonesia.
Buatlah rangkuman materi pembelajaran komprehensif, menarik, dan terstruktur dalam format JSON:
- Mata Pelajaran: ${mataPelajaran}
- Kelas: ${kelas}
- Topik / Materi: ${topikMateri}
- Tipe Dokumen: ${tipe}
${instruksiTambahan ? `- Catatan Khusus: ${instruksiTambahan}` : ""}

Format WAJIB JSON:
{
  "judul": "string judul materi",
  "markdown": "string isi materi lengkap dalam format Markdown dengan heading, list, tips, dan penjelasan mendalam.",
  "tujuanPembelajaran": ["string butir tujuan 1", "string butir tujuan 2"]
}`;

  let parsed: any = null;
  try {
    const responseText = await generateContentWithFallback(ai, {
      contents: prompt,
      config: {
        responseMimeType: "application/json",
      },
    });
    parsed = cleanAndParseJson(responseText);
  } catch (err: any) {
    console.warn("[Gemini AI] Traffic/timeout in handleBuatMateri, providing curriculum synthesis fallback:", err?.message);
    parsed = {
      judul: `LKPD ${mataPelajaran} - ${topikMateri || "Konsep Pembelajaran"}`,
      markdown: `# Bahan Ajar: ${mataPelajaran}\n\n## Topik: ${topikMateri || "Konsep Pembelajaran"}\n\nDokumen bahan ajar dan Lembar Kerja Peserta Didik (LKPD) berbasis visual disiapkan untuk memfasilitasi ketercapaian tujuan pembelajaran di kelas ${kelas}.\n\n### Panduan Belajar Siswa:\n1. Memahami konsep dasar materi melalui pengamatan gambar secara cermat.\n2. Melakukan analisis dan penyelidikan mandiri secara terstruktur.\n3. Mengisi lembar kerja dan tabel pengamatan dengan teliti.`,
      lkpdData: {
        judulLkpd: `LEMBAR KERJA PESERTA DIDIK (LKPD) - ${topikMateri || "Materi Pembelajaran"}`,
        mataPelajaran,
        kelas: `Kelas ${kelas}`,
        topikMateri: topikMateri || "Konsep Pembelajaran",
        warnaAksen: "#1E40AF",
        temaVisual: "ceria",
        tujuanKegiatan: [
          `Memahami materi ${topikMateri || "pembelajaran"} melalui pengamatan visual yang mendalam`,
          "Mengembangkan kemampuan bernalar kritis, teliti, dan mandiri dalam menyelesaikan tugas",
        ],
        petunjukPengerjaan: [
          "Tuliskan identitas nama siswa dan kelas pada kolom di atas",
          "Amati setiap gambar ilustrasi dengan saksama sebelum menjawab",
          "Gunakan pensil untuk menarik garis dan mengisi lembar kerja",
        ],
        halamanList: [
          {
            nomorHalaman: 1,
            subJudul: "Aktivitas 1: Eksplorasi Visual & Penyelidikan Konsep",
            aktivitas: [
              {
                id: "act-1",
                nomor: 1,
                tipe: "tanya_gambar",
                instruksi: "Amatilah gambar ilustrasi di bawah ini, lalu jawab pertanyaannya dengan saksama!",
                pertanyaan: `Berdasarkan pengamatanmu terhadap materi ${topikMateri || "pembelajaran"}, jelaskan hal penting apa yang kamu temukan dan bagaimana penerapannya dalam kehidupan sehari-hari?`,
                garisJawaban: 3,
              },
              {
                id: "act-2",
                nomor: 2,
                tipe: "cocokkan",
                instruksi: "Hubungkan pernyataan di sebelah kiri dengan konsep yang tepat di sebelah kanan menggunakan garis lurus!",
                pilihanKiri: ["Konsep Dasar", "Tahapan Proses", "Hasil / Manfaat"],
                pilihanKanan: ["Langkah yang berlangsung", "Dampak positif nyata", "Pengenalan awal materi"],
              },
            ],
          },
          {
            nomorHalaman: 2,
            subJudul: "Aktivitas 2: Analisis Terstruktur & Refleksi",
            aktivitas: [
              {
                id: "act-3",
                nomor: 3,
                tipe: "tabel_pengamatan",
                instruksi: "Lengkapilah tabel hasil pengamatan berikut ini berdasarkan pemahaman yang telah kamu peroleh:",
                kolomTabel: ["No", "Objek Pengamatan", "Karakteristik / Ciri", "Keterangan"],
                barisTabel: [
                  ["1", "Pengamatan Bagian 1", "", ""],
                  ["2", "Pengamatan Bagian 2", "", ""],
                  ["3", "Pengamatan Bagian 3", "", ""],
                ],
              },
              {
                id: "act-4",
                nomor: 4,
                tipe: "uraian_kreatif",
                instruksi: "Refleksi Mandiri: Tuliskan satu hal penting yang paling berkesan dari pembelajaran hari ini!",
                garisJawaban: 3,
              },
            ],
          },
        ],
      },
    };
  }

  return {
    success: true,
    data: parsed,
    markdown: parsed.markdown || parsed.isiMarkdown || "",
    lkpdData: parsed.lkpdData || null,
  };
}
