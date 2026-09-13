import express from "express";
import path from "path";
import { createServer as createViteServer } from "vite";
import { GoogleGenAI } from "@google/genai";
import dotenv from "dotenv";

dotenv.config();

function getGeminiClient(): GoogleGenAI {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    throw new Error(
      "GEMINI_API_KEY belum dikonfigurasi di server. Silakan hubungi administrator atau pastikan API key telah aktif di Secrets."
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

// Reliable, high-throughput models prioritizing ultra-fast models to prevent 503 high demand spikes
const AI_FALLBACK_MODELS = [
  "gemini-3.1-flash-lite",
  "gemini-3.6-flash",
  "gemini-3.8-flash",
  "gemini-flash-latest",
];

function cleanAndParseJson(text: string): any {
  if (!text || typeof text !== "string") {
    throw new Error("Teks respons kosong dari AI.");
  }
  let str = text.trim();

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

async function generateContentWithFallback(
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
      "Layanan AI Google saat ini sedang mengalami antrean trafik tinggi. Silakan klik coba lagi dalam beberapa saat."
    );
  }
  throw lastError || new Error("Gagal mendapatkan respons dari model AI.");
}

async function startServer() {
  const app = express();
  const PORT = 3000;

  app.use(express.json({ limit: "15mb" }));

  // Health check
  app.get("/api/health", (req, res) => {
    res.json({
      status: "ok",
      aiAvailable: Boolean(process.env.GEMINI_API_KEY),
      timestamp: new Date().toISOString(),
    });
  });

  // 1. Endpoint: Pembuat Soal Ujian & Ulangan (Pilihan Ganda + Esai)
  app.post("/api/ai/buat-soal", async (req, res) => {
    try {
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
      } = req.body;

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

      let parsedData;
      try {
        parsedData = cleanAndParseJson(responseText);
      } catch (parseError) {
        console.error("Failed to parse Gemini JSON:", responseText);
        throw new Error("Gagal mengurai format soal dari AI. Silakan coba lagi.");
      }

      res.json({
        success: true,
        data: parsedData,
      });
    } catch (err: any) {
      console.error("API /api/ai/buat-soal error:", err);
      res.status(500).json({
        success: false,
        error: err.message || "Terjadi kesalahan saat memproses permintaan soal dengan AI.",
      });
    }
  });

  // 2. Endpoint: Pembuat Modul Ajar / RPP Digital
  app.post("/api/ai/buat-modul", async (req, res) => {
    try {
      const {
        mataPelajaran = "IPAS",
        faseKelas = "Fase B (Kelas 4)",
        alokasiWaktu = "2 x 35 Menit (1 Pertemuan)",
        topikMateri = "",
        profilPancasila = ["Bernalar Kritis", "Gotong Royong", "Mandiri"],
        instruksiTambahan = "",
      } = req.body;

      const ai = getGeminiClient();

      const prompt = `Anda adalah pakar penyusun Modul Ajar Kurikulum Merdeka di Indonesia.
Rancanglah sebuah Modul Ajar / Rencana Pelaksanaan Pembelajaran (RPP Plus) yang komprehensif, inspiratif, dan siap digunakan guru di kelas:
- Mata Pelajaran: ${mataPelajaran}
- Fase & Kelas: ${faseKelas}
- Alokasi Waktu: ${alokasiWaktu}
- Topik / Materi Pembelajaran: ${topikMateri}
- Target Dimensi Profil Pelajar Pancasila: ${Array.isArray(profilPancasila) ? profilPancasila.join(", ") : profilPancasila}
${instruksiTambahan ? `- Instruksi Tambahan Guru: ${instruksiTambahan}` : ""}

Struktur Modul Wajib Terdiri Dari:
1. Judul & Informasi Umum
2. Target Dimensi Profil Pelajar Pancasila
3. Tujuan Pembelajaran (spesifik & terukur)
4. Pemahaman Bermakna & Pertanyaan Pemantik
5. Alur Kegiatan Pembelajaran (Pendahuluan, Kegiatan Inti berpusat pada murid / student-centered, dan Penutup)
6. Asesmen Pembelajaran (Diagnostik, Formatif, dan Sumatif)
7. Ringkasan Lembar Kerja Peserta Didik (LKPD) ringkas untuk latihan siswa di kelas.

Format output WAJIB JSON yang valid sesuai skema berikut tanpa teks tambahan di luar JSON:
{
  "judul": "string",
  "faseKelas": "string",
  "alokasiWaktu": "string",
  "targetProfilPelajar": ["string"],
  "tujuanPembelajaran": ["string"],
  "pemahamanBermakna": "string",
  "pertanyaanPemantik": ["string"],
  "kegiatanPembelajaran": {
    "pendahuluan": ["string langkah-langkah"],
    "inti": ["string langkah-langkah eksplorasi dan kolaborasi"],
    "penutup": ["string refleksi dan apresiasi"]
  },
  "asesmen": {
    "diagnostik": "string",
    "formatif": "string",
    "sumatif": "string"
  },
  "lembarKerjaRingkas": "string (isi tugas atau LKPD singkat)"
}`;

      const responseText = await generateContentWithFallback(ai, {
        contents: prompt,
        config: {
          responseMimeType: "application/json",
        },
      });

      let parsedData;
      try {
        parsedData = cleanAndParseJson(responseText);
      } catch (parseError) {
        console.error("Failed to parse Gemini JSON:", responseText);
        throw new Error("Gagal mengurai format modul ajar dari AI. Silakan coba lagi.");
      }

      res.json({
        success: true,
        data: parsedData,
      });
    } catch (err: any) {
      console.error("API /api/ai/buat-modul error:", err);
      res.status(500).json({
        success: false,
        error: err.message || "Terjadi kesalahan saat menyusun modul ajar dengan AI.",
      });
    }
  });

  // 3. Endpoint: Pembuat Bahan Ajar, Ringkasan Materi, & LKPD
  app.post("/api/ai/buat-materi", async (req, res) => {
    try {
      const {
        mataPelajaran = "Matematika",
        kelas = "5",
        topikMateri = "",
        tipe = "ringkasan", // 'ringkasan' | 'lkpd' | 'remedial'
        instruksiTambahan = "",
      } = req.body;

      const ai = getGeminiClient();

      let tipeDeskripsi = "Ringkasan Materi & Panduan Guru Mengajar";
      if (tipe === "lkpd") {
        tipeDeskripsi = "Lembar Kerja Peserta Didik (LKPD) Interaktif dan Berdiferensiasi";
      } else if (tipe === "remedial") {
        tipeDeskripsi = "Materi Pengayaan & Remedial untuk Siswa yang Membutuhkan Pendampingan";
      }

      const prompt = `Anda adalah asisten guru berpengalaman di sekolah dasar/menengah di Indonesia.
Buatlah materi pembelajaran berkualitas tinggi dalam format Markdown yang rapi dan mudah dibaca:
- Jenis Dokumen: ${tipeDeskripsi}
- Mata Pelajaran: ${mataPelajaran}
- Kelas: ${kelas}
- Topik / Materi: ${topikMateri}
${instruksiTambahan ? `- Catatan Guru: ${instruksiTambahan}` : ""}

Panduan Pembuatan:
1. Gunakan Bahasa Indonesia yang baik, edukatif, dan mudah dipahami siswa sesuai usianya.
2. Gunakan heading (#, ##, ###), poin-poin (bullet points), tabel jika diperlukan, dan kotak sorot (tips/fakta menarik).
3. Berikan contoh konkret yang dekat dengan keseharian siswa.
4. Sajikan secara lengkap, siap cetak atau dibagikan ke siswa.`;

      const responseText = await generateContentWithFallback(ai, {
        contents: prompt,
      });

      res.json({
        success: true,
        markdown: responseText || "",
      });
    } catch (err: any) {
      console.error("API /api/ai/buat-materi error:", err);
      res.status(500).json({
        success: false,
        error: err.message || "Terjadi kesalahan saat membuat materi pembelajaran dengan AI.",
      });
    }
  });

  // Vite middleware setup
  if (process.env.NODE_ENV !== "production") {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa",
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), "dist");
    app.use(express.static(distPath));
    app.get("*", (req, res) => {
      res.sendFile(path.join(distPath, "index.html"));
    });
  }

  app.listen(PORT, "0.0.0.0", () => {
    console.log(`Server running on http://0.0.0.0:${PORT}`);
  });
}

startServer();
