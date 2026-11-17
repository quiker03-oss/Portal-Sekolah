import {
  readQuestionsForAiReaderWithGemini,
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
    return res.status(405).json({ success: false, error: "Metode request harus POST." });
  }

  let body = req.body;
  if (typeof body === "string") {
    try {
      body = JSON.parse(body);
    } catch {
      // keep raw
    }
  }

  const {
    fileBase64,
    fileName = "dokumen-soal",
    mimeType,
    text,
    pages,
    chunkLabel,
    previousTailContext,
  } = body && typeof body === "object" ? body : {};

  const hasValidBase64 = typeof fileBase64 === "string" && fileBase64.trim().length > 0;
  const hasValidText = typeof text === "string" && text.trim().length > 0;
  const normalizedPages = Array.isArray(pages)
    ? pages
        .filter(
          (p: any) =>
            p &&
            typeof p === "object" &&
            typeof p.imageBase64 === "string" &&
            p.imageBase64.trim().length > 0
        )
        .map((p: any) => ({
          pageNumber: typeof p.pageNumber === "number" ? p.pageNumber : undefined,
          imageBase64: p.imageBase64.trim(),
          mimeType:
            typeof p.mimeType === "string" && p.mimeType.trim()
              ? p.mimeType.trim().toLowerCase()
              : "image/jpeg",
        }))
    : [];

  if (!hasValidBase64 && !hasValidText && normalizedPages.length === 0) {
    return res.status(400).json({
      success: false,
      error: "Konten berkas, halaman gambar, atau teks soal tidak ditemukan dalam permintaan.",
    });
  }

  try {
    const apiKey = getGeminiApiKey();
    if (!apiKey) {
      return res.status(503).json({
        success: false,
        error:
          "GEMINI_API_KEY belum dikonfigurasi pada server. Silakan periksa Settings > Secrets atau Environment Variables Vercel.",
      });
    }

    const result = await readQuestionsForAiReaderWithGemini({
      text: hasValidText ? text : undefined,
      fileBase64: hasValidBase64 ? fileBase64 : undefined,
      mimeType: typeof mimeType === "string" ? mimeType.trim().toLowerCase() : undefined,
      fileName: typeof fileName === "string" && fileName.trim() ? fileName.trim() : "dokumen-soal",
      pages: normalizedPages.length > 0 ? normalizedPages : undefined,
      chunkLabel: typeof chunkLabel === "string" ? chunkLabel : undefined,
      previousTailContext: typeof previousTailContext === "string" && previousTailContext.trim() ? previousTailContext.trim() : undefined,
    });

    return res.status(200).json({
      success: true,
      data: result,
    });
  } catch (err: any) {
    const errorInfo = logBackendError("/api/ai-reader/read", "ai_reader_read_error", err);
    return res.status(errorInfo.httpStatus || 500).json({
      success: false,
      error: errorInfo.message || "Gagal membaca berkas soal menggunakan AI.",
      diagnostics: errorInfo,
    });
  }
}
