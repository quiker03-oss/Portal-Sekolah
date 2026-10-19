import { handleParseTextSoal } from "../_lib/geminiBackend.ts";

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

    const { text } = body || {};
    if (!text || !text.trim()) {
      return res.status(400).json({
        success: false,
        error: "Teks soal tidak boleh kosong.",
      });
    }

    const result = await handleParseTextSoal(text);
    return res.status(200).json(result);
  } catch (err: any) {
    console.error("[Vercel API /api/ujian/parse-text-soal Error]:", err);
    return res.status(500).json({
      success: false,
      error: err?.message || "Gagal memproses teks soal.",
    });
  }
}
