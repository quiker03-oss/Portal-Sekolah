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

// Reliable, high-throughput models prioritizing gemini-3.8-flash and official fallbacks
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
  const mediaFiles = zip.file(/^word\/media\//);
  for (const f of mediaFiles) {
    const ext = f.name.split(".").pop()?.toLowerCase() || "png";
    const mime =
      ext === "jpg" || ext === "jpeg"
        ? "image/jpeg"
        : ext === "gif"
        ? "image/gif"
        : ext === "webp"
        ? "image/webp"
        : "image/png";
    const b64 = await f.async("base64");
    const relativePath = f.name.replace(/^word\//, "");
    const dataUri = `data:${mime};base64,${b64}`;
    mediaImages[relativePath] = dataUri;
    mediaImages[f.name] = dataUri;
  }

  const docFile = zip.file("word/document.xml");
  if (!docFile) {
    throw new Error("File .docx tidak memiliki berkas dokumen utama (word/document.xml).");
  }
  const docXml = await docFile.async("string");

  const pMatches = docXml.split(/<\/w:p>/g);
  const extractedParagraphs: { text: string; imageUri?: string }[] = [];

  for (const p of pMatches) {
    let imageUri: string | undefined = undefined;
    const rIdMatch = p.match(/r:embed="([^"]+)"/);
    if (rIdMatch) {
      const rId = rIdMatch[1];
      const target = relsMap[rId];
      if (target && mediaImages[target]) {
        imageUri = mediaImages[target];
      }
    }

    const textMatches = p.match(/<w:t[^>]*>(.*?)<\/w:t>/g);
    let text = "";
    if (textMatches) {
      text = textMatches.map((t) => t.replace(/<[^>]+>/g, "")).join("");
    }

    const cleanText = text.trim();
    if (cleanText || imageUri) {
      extractedParagraphs.push({ text: cleanText, imageUri });
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
      if (p.imageUri) {
        const marker = `[[IMAGE_SOAL_${imgCounter}]]`;
        imageIndexMap[marker] = p.imageUri;
        line = `${line} ${marker}`.trim();
        imgCounter++;
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

ATURAN WAJIB & KETAT:
1. JANGAN PERNAH MENGARANG, MERUBAH, ATAU MENGGANTI kata, angka, pilihan jawaban, rumus, atau urutan soal dari dokumen asli!
2. Kenali nomor soal, teks pertanyaan, pilihan A/B/C/D/E, instruksi, dan jenis soal ('pilihan_ganda' | 'benar_salah' | 'isian' | 'esai').
3. Urutan nomor soal WAJIB dipertahankan persis seperti dokumen asli (1, 2, 3, ...).
4. Jika terdapat penanda gambar seperti '[[IMAGE_SOAL_1]]', tempatkan penanda tersebut pada soal yang tepat di field 'gambarMarker'.
5. Deteksi kunci jawaban jika ada pada soal (misalnya cetak tebal, garis bawah, atau tabel kunci jawaban di akhir dokumen).
6. Hubungkan setiap kunci jawaban dengan nomor soal yang benar. Jika kunci tidak terdeteksi, biarkan string kosong "" dan berikan peringatan di 'catatanVerifikasi'.
7. Jika ada soal yang ambigu, nomor terpotong, atau kunci jawaban meragukan, tandai 'perluVerifikasi': true dengan 'catatanVerifikasi'.
8. Format output WAJIB JSON valid:

{
  "judul": "string judul naskah jika ada",
  "mataPelajaran": "string mata pelajaran jika tertera",
  "kelas": "string tingkat kelas jika tertera",
  "soalList": [
    {
      "nomor": 1,
      "tipe": "pilihan_ganda | benar_salah | isian | esai",
      "pertanyaan": "teks pertanyaan lengkap",
      "pilihan": {
        "A": "teks opsi A",
        "B": "teks opsi B",
        "C": "teks opsi C",
        "D": "teks opsi D"
      },
      "kunciJawaban": "A | B | C | D | teks kunci",
      "pembahasan": "penjelasan jika ada di dokumen",
      "gambarMarker": "[[IMAGE_SOAL_1]] jika ada pada soal ini, atau null",
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
    if (q.gambarMarker && imageIndexMap[q.gambarMarker]) {
      finalImage = imageIndexMap[q.gambarMarker];
    } else if (!finalImage && Object.keys(imageIndexMap).length > 0) {
      for (const [marker, uri] of Object.entries(imageIndexMap)) {
        if (q.pertanyaan && q.pertanyaan.includes(marker)) {
          finalImage = uri;
          q.pertanyaan = q.pertanyaan.replace(marker, "").trim();
          break;
        }
      }
    }

    return {
      id: `soal-${Date.now()}-${idx + 1}`,
      nomor: q.nomor || idx + 1,
      tipe: q.tipe || "pilihan_ganda",
      pertanyaan: q.pertanyaan || "",
      pilihan: q.pilihan || undefined,
      kunciJawaban: q.kunciJawaban || "",
      pembahasan: q.pembahasan || "",
      bobot: Number(q.bobot) > 0 ? Number(q.bobot) : 1,
      gambar: finalImage,
      perluVerifikasi: Boolean(q.perluVerifikasi || !q.kunciJawaban),
      catatanVerifikasi:
        q.catatanVerifikasi ||
        (!q.kunciJawaban ? "Kunci jawaban belum terdeteksi dari dokumen" : undefined),
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

ATURAN WAJIB & INTEGRITAS SOAL:
1. JANGAN PERNAH MENGARANG ATAU MENGUBAH teks soal, angka, pilihan jawaban, rumus, atau urutan soal dari dokumen asli!
2. Ekstrak nomor soal berurutan persis sesuai naskah dokumen asli.
3. Kenali nomor soal, teks pertanyaan, rumus matematika/sains, tabel, dan pilihan A/B/C/D/E.
4. Tentukan tipe soal: 'pilihan_ganda' | 'benar_salah' | 'isian' | 'esai'.
5. Deteksi kunci jawaban jika tersedia (pada naskah soal langsung, cetak tebal, atau tabel kunci jawaban di akhir halaman).
6. Jika dokumen memiliki diagram/gambar pada nomor soal tertentu, jelaskan deskripsi visual diagram tersebut pada field 'gambarDeskripsi'.
7. Jika ada soal yang terpotong, buram, tidak terbaca jelas, atau kunci belum cocok, tandai 'perluVerifikasi': true dan isi 'catatanVerifikasi'.
8. Format output WAJIB JSON valid sesuai skema:

{
  "judul": "string judul dokumen ujian",
  "mataPelajaran": "string mata pelajaran jika ada",
  "kelas": "string kelas jika ada",
  "soalList": [
    {
      "nomor": 1,
      "tipe": "pilihan_ganda | benar_salah | isian | esai",
      "pertanyaan": "teks soal lengkap beserta rumus atau data tabel",
      "pilihan": {
        "A": "teks A",
        "B": "teks B",
        "C": "teks C",
        "D": "teks D"
      },
      "kunciJawaban": "A | B | C | D | teks kunci",
      "pembahasan": "pembahasan ringkas jika ada",
      "gambarDeskripsi": "keterangan gambar/diagram jika soal merujuk pada gambar tertentu",
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
    kunciJawaban: q.kunciJawaban || "",
    pembahasan: q.pembahasan || "",
    gambarCaption: q.gambarDeskripsi || undefined,
    bobot: Number(q.bobot) > 0 ? Number(q.bobot) : 1,
    perluVerifikasi: Boolean(q.perluVerifikasi || !q.kunciJawaban),
    catatanVerifikasi:
      q.catatanVerifikasi ||
      (!q.kunciJawaban ? "Kunci jawaban belum terdeteksi dari dokumen" : undefined),
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

// 4. Core handler: Buat Soal AI
export async function handleBuatSoal(body: any) {
  const {
    mataPelajaran = "Tematik / Umum",
    kelas = "4",
    kurikulum = "Kurikulum Merdeka",
    jenisUjian = "Ulangan Harian",
    tingkatKesulitan = "Sedang",
    topikMateri = "",
    jumlahPg = 5,
    jumlahEsai = 2,
    instruksiTambahan = "",
  } = body || {};

  const ai = getGeminiClient();

  const prompt = `Anda adalah seorang instruktur ahli kurikulum dan pembuat instrumen evaluasi pembelajaran di Indonesia (${kurikulum}).
Buatlah naskah soal ulangan/evaluasi resmi dengan rincian berikut:
- Mata Pelajaran: ${mataPelajaran}
- Tingkat Kelas: ${kelas}
- Kurikulum: ${kurikulum}
- Jenis Ujian/Asesmen: ${jenisUjian}
- Tingkat Kesulitan: ${tingkatKesulitan}
- Topik / Materi Pembahasan: ${topikMateri || "Materi standar sesuai silabus"}
- Jumlah Soal Pilihan Ganda: ${jumlahPg} butir (opsi pilihan A, B, C, D)
- Jumlah Soal Esai / Uraian: ${jumlahEsai} butir
${instruksiTambahan ? `- Catatan Khusus Guru: ${instruksiTambahan}` : ""}

Kriteria Kualitas Soal:
1. Soal harus relevan dengan usia siswa dan capaian pembelajaran tingkat kelas ${kelas}.
2. Untuk tingkat kesulitan ${tingkatKesulitan}, sertakan stimulus kontekstual (studi kasus singkat, teks bacaan, atau ilustrasi situasi nyata) terutama pada soal HOTS.
3. Kunci jawaban harus tepat dan tidak ambigu.
4. Sertakan penjelasan/pembahasan ringkas untuk setiap butir soal sebagai pegangan guru.
5. Format output WAJIB JSON yang valid sesuai skema berikut tanpa teks di luar JSON:

{
  "judul": "string (Contoh: Naskah Ulangan Harian IPAS Kelas 4 - Siklus Air)",
  "petunjukUmum": "string (Petunjuk pengerjaan bagi siswa)",
  "pilihanGanda": [
    {
      "nomor": 1,
      "pertanyaan": "string",
      "pilihan": {
        "A": "string",
        "B": "string",
        "C": "string",
        "D": "string"
      },
      "kunciJawaban": "A | B | C | D",
      "pembahasan": "string"
    }
  ],
  "esai": [
    {
      "nomor": 1,
      "pertanyaan": "string",
      "pedomanPenskoran": "string (contoh: Skor 0-5, penjelasan kriteria skor)",
      "kunciJawaban": "string (uraian jawaban ideal)"
    }
  ]
}`;

  const responseText = await generateContentWithFallback(ai, {
    contents: prompt,
    config: {
      responseMimeType: "application/json",
    },
  });

  const parsedData = cleanAndParseJson(responseText);
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

  const responseText = await generateContentWithFallback(ai, {
    contents: prompt,
    config: {
      responseMimeType: "application/json",
    },
  });

  const parsedData = cleanAndParseJson(responseText);
  return {
    success: true,
    data: parsedData,
  };
}

// 6. Core handler: Buat Materi / LKPD AI
export async function handleBuatMateri(body: any) {
  const {
    mataPelajaran = "Matematika",
    kelas = "5",
    topikMateri = "",
    tipe = "ringkasan",
    instruksiTambahan = "",
    sertakanGambar = true,
  } = body || {};

  const ai = getGeminiClient();

  let tipeDeskripsi = "Ringkasan Materi & Panduan Guru Mengajar";
  if (tipe === "lkpd") {
    tipeDeskripsi = "Lembar Kerja Peserta Didik (LKPD) Interaktif Bergambar dan Berdiferensiasi";
  } else if (tipe === "remedial") {
    tipeDeskripsi = "Materi Pengayaan & Remedial untuk Siswa yang Membutuhkan Pendampingan";
  }

  const getSubjectIllustration = (sub: string, top: string) => {
    const query = (sub + " " + top).toLowerCase();
    if (query.includes("matematika") || query.includes("hitung") || query.includes("geometri") || query.includes("pecahan")) {
      return {
        url: "https://images.unsplash.com/photo-1635070041078-e363dbe005cb?auto=format&fit=crop&w=700&q=80",
        caption: "Ilustrasi Konsep Pola dan Geometri Matematika",
      };
    } else if (query.includes("tumbuhan") || query.includes("flora") || query.includes("daun") || query.includes("pohon")) {
      return {
        url: "https://images.unsplash.com/photo-1530595467537-0b5996c41f2d?auto=format&fit=crop&w=700&q=80",
        caption: "Pengamatan Morfologi Tumbuhan dan Bagian-Bagian Tanaman",
      };
    } else if (query.includes("hewan") || query.includes("fauna") || query.includes("satwa") || query.includes("rantai makanan")) {
      return {
        url: "https://images.unsplash.com/photo-1535083783855-76ae62b2914e?auto=format&fit=crop&w=700&q=80",
        caption: "Pengamatan Keanekaragaman Hewan dan Ekosistem",
      };
    } else if (query.includes("ipa") || query.includes("sains") || query.includes("percobaan") || query.includes("eksperimen")) {
      return {
        url: "https://images.unsplash.com/photo-1532094349884-543bc11b234d?auto=format&fit=crop&w=700&q=80",
        caption: "Eksplorasi Sains dan Penyelidikan Ilmiah",
      };
    } else if (query.includes("bumi") || query.includes("tata surya") || query.includes("planet") || query.includes("cuaca")) {
      return {
        url: "https://images.unsplash.com/photo-1614728894747-a83421e2b9c9?auto=format&fit=crop&w=700&q=80",
        caption: "Eksplorasi Ruang Angkasa dan Fenomena Bumi",
      };
    } else if (query.includes("seni") || query.includes("sbdp") || query.includes("gambar") || query.includes("rupa")) {
      return {
        url: "https://images.unsplash.com/photo-1513364776144-60967b0f800f?auto=format&fit=crop&w=700&q=80",
        caption: "Aktivitas Seni Rupa dan Kreativitas Siswa",
      };
    }
    return {
      url: "https://images.unsplash.com/photo-1497633762265-9d179a990aa6?auto=format&fit=crop&w=700&q=80",
      caption: "Media Belajar dan Penyelidikan Peserta Didik",
    };
  };

  const illustration = getSubjectIllustration(mataPelajaran, topikMateri);

  const prompt = `Anda adalah asisten guru profesional sekolah dasar dan menengah di Indonesia yang ahli dalam Kurikulum Merdeka.
Buatlah materi pembelajaran berkualitas tinggi dalam format Markdown yang rapi, lengkap, dan siap dicetak:
- Jenis Dokumen: ${tipeDeskripsi}
- Mata Pelajaran: ${mataPelajaran}
- Kelas: ${kelas}
- Topik / Materi: ${topikMateri}
${instruksiTambahan ? `- Catatan Khusus Guru: ${instruksiTambahan}` : ""}

PANDUAN KHUSUS LKPD & BAHAN AJAR BERGAMBAR:
1. SERTAKAN GAMBAR & ILUSTRASI VISUAL:
   Untuk LKPD atau bahan ajar bergambar, sertakan gambar pendukung menggunakan format Markdown:
   ![${illustration.caption}](${illustration.url})
   Berikan keterangan gambar yang jelas, ajak siswa mengamati gambar tersebut ("Amati gambar di atas: apa yang kamu temukan?").
2. AKTIVITAS SISWA BERGAMBAR / LEMBAR PENGAMATAN:
   Sertakan bagian aktivitas visual untuk anak, seperti:
   - "🖼️ Lembar Pengamatan & Analisis Gambar"
   - "🎨 Ruang Menggambar / Diagram Siswa" (berupa instruksi menggambar konsep/bagian yang dipelajari)
   - Tabel lembar kerja siswa yang siap diisi langsung
3. FORMAT KONTEN:
   Gunakan heading (#, ##, ###), daftar bernomor, kotak perhatian/tips, dan petunjuk langkah pengerjaan yang ramah anak.
4. Sajikan naskah lengkap dari identitas lembar kerja sampai rubrik penilaian sederhana.`;

  const responseText = await generateContentWithFallback(ai, {
    contents: prompt,
  });

  let finalMarkdown = responseText || "";

  if (sertakanGambar && !finalMarkdown.includes("![")) {
    const imgMarkdown = `\n\n![${illustration.caption}](${illustration.url})\n*Gambar: ${illustration.caption}*\n\n`;
    const firstHeadingIndex = finalMarkdown.indexOf("\n## ");
    if (firstHeadingIndex !== -1) {
      finalMarkdown =
        finalMarkdown.slice(0, firstHeadingIndex) +
        imgMarkdown +
        finalMarkdown.slice(firstHeadingIndex);
    } else {
      finalMarkdown = imgMarkdown + finalMarkdown;
    }
  }

  return {
    success: true,
    markdown: finalMarkdown,
  };
}
