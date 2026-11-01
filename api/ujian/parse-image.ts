import { handleParseImage } from "../_lib/geminiBackend";

export const config = {
  maxDuration: 60,
  api: {
    bodyParser: {
      sizeLimit: "25mb",
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

    const { fileBase64, fileName = "naskah-ujian.jpg", mimeType = "image/jpeg" } = body || {};

    if (!fileBase64) {
      return res.status(400).json({
        success: false,
        error: "Data berkas gambar (fileBase64) tidak ditemukan dalam permintaan.",
      });
    }

    const result = await handleParseImage(fileBase64, fileName, mimeType);
    return res.status(200).json(result);
  } catch (err: any) {
    console.error("[Vercel API /api/ujian/parse-image Error]:", err);
    return res.status(200).json({
      success: false,
      error: err?.message || "Gagal memproses gambar naskah soal.",
      soalList: [],
    });
  }
}
