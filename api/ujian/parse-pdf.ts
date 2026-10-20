import { handleParsePdf } from "../_lib/geminiBackend";

export const config = {
  api: {
    bodyParser: {
      sizeLimit: "25mb",
    },
  },
};

export default async function handler(req: any, res: any) {
  // CORS configuration
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

    const { fileBase64, fileName = "dokumen-soal.pdf" } = body || {};

    if (!fileBase64) {
      return res.status(400).json({
        success: false,
        error: "Data berkas PDF (fileBase64) tidak ditemukan dalam permintaan.",
      });
    }

    const result = await handleParsePdf(fileBase64, fileName);
    return res.status(200).json(result);
  } catch (err: any) {
    console.error("[Vercel API /api/ujian/parse-pdf Error]:", err);
    const msg = err?.message || String(err) || "Gagal memproses dokumen PDF.";
    return res.status(500).json({
      success: false,
      error: msg,
    });
  }
}
