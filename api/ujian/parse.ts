import {
  parseExamDocumentWithGemini,
  getGeminiApiKey,
  logBackendError,
} from "../_lib/geminiBackend.ts";

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
      error: "Metode request harus POST.",
    });
  }

  let body = req.body;
  if (typeof body === "string") {
    try {
      body = JSON.parse(body);
    } catch {
      // keep raw
    }
  }

  const { fileBase64, fileName = "dokumen-soal", mimeType, text } = body && typeof body === "object" ? body : {};
  const hasValidBase64 = typeof fileBase64 === "string" && fileBase64.trim().length > 0;
  const hasValidText = typeof text === "string" && text.trim().length > 0;
  const safeFileName = typeof fileName === "string" && fileName.trim() ? fileName.trim() : "dokumen-soal";

  if (!hasValidBase64 && !hasValidText) {
    return res.status(400).json({
      success: false,
      error: "Data berkas (fileBase64) atau teks soal tidak ditemukan dalam request.",
    });
  }

  const resolvedMime =
    typeof mimeType === "string" && mimeType.trim()
      ? mimeType.trim().toLowerCase()
      : safeFileName.toLowerCase().endsWith(".pdf")
      ? "application/pdf"
      : hasValidBase64
      ? "image/jpeg"
      : "text/plain";

  const allowedMimes = new Set([
    "application/pdf",
    "image/jpeg",
    "image/jpg",
    "image/png",
    "image/webp",
    "text/plain",
    "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  ]);

  if (!allowedMimes.has(resolvedMime)) {
    return res.status(400).json({
      success: false,
      error: `Tipe berkas (${resolvedMime}) tidak didukung.`,
    });
  }

  try {
    const apiKey = getGeminiApiKey();
    if (!apiKey) {
      return res.status(200).json({
        success: false,
        fallbackToLocal: true,
        error: "GEMINI_API_KEY belum dikonfigurasi di server. Sistem menggunakan parser dokumen lokal in-browser.",
      });
    }

    const result = await parseExamDocumentWithGemini({
      text: hasValidText ? text : undefined,
      fileBase64: hasValidBase64 ? fileBase64 : undefined,
      mimeType: resolvedMime,
      fileName: safeFileName,
    });

    return res.status(200).json({
      success: true,
      data: result,
    });
  } catch (err: any) {
    const errorInfo = logBackendError("/api/ujian/parse", "gemini_parse_catch", err);
    // Never return 500 error! Return 200 with fallbackToLocal so the client seamlessly continues
    return res.status(200).json({
      success: false,
      fallbackToLocal: true,
      error: errorInfo.message || "Gagal memproses dokumen dengan model AI. Beralih ke parser lokal.",
      diagnostics: errorInfo,
    });
  }
}
