import { handleGradeEssay } from "../_lib/geminiBackend";

export const config = {
  maxDuration: 60,
  api: {
    bodyParser: {
      sizeLimit: "5mb",
    },
  },
};

export default async function handler(req: any, res: any) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type, Authorization");

  if (req.method === "OPTIONS") {
    return res.status(200).end();
  }

  if (req.method !== "POST") {
    return res.status(405).json({
      success: false,
      error: `Metode ${req.method} tidak diizinkan. Gunakan POST.`,
    });
  }

  try {
    let body = req.body;
    if (typeof body === "string") {
      try {
        body = JSON.parse(body);
      } catch {
        // keep as is
      }
    }

    const {
      pertanyaan,
      kunciJawaban,
      contohJawaban,
      rubrikPenilaian,
      indikatorWajib,
      variasiJawaban,
      jawabanSiswa,
      bobotMaksimal,
    } = body || {};

    if (!pertanyaan) {
      return res.status(400).json({
        success: false,
        error: "Teks pertanyaan wajib disertakan.",
      });
    }

    const result = await handleGradeEssay({
      pertanyaan,
      kunciJawaban,
      contohJawaban,
      rubrikPenilaian,
      indikatorWajib,
      variasiJawaban,
      jawabanSiswa: jawabanSiswa || "",
      bobotMaksimal: Number(bobotMaksimal) || 10,
    });
    return res.status(200).json(result);
  } catch (err: any) {
    console.error("[Vercel API /api/ujian/ai-grade-essay Error]:", err);
    return res.status(200).json({
      success: false,
      skorRekomendasi: 0,
      alasanPenilaian: err?.message || "Gagal mengevaluasi jawaban esai siswa.",
      indikatorDitemukan: [],
      saranFeedbackSiswa: "",
      error: err?.message || "Gagal mengevaluasi jawaban esai siswa.",
    });
  }
}
