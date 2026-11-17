import {
  answerQuestionsForAiReaderWithGemini,
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

  const { questions, pageImages } = body && typeof body === "object" ? body : {};
  if (!Array.isArray(questions) || questions.length === 0) {
    return res.status(400).json({
      success: false,
      error: "Daftar soal yang akan dijawab kosong.",
    });
  }

  const normalizedPageImages = Array.isArray(pageImages)
    ? pageImages
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
    : undefined;

  try {
    const apiKey = getGeminiApiKey();
    if (!apiKey) {
      return res.status(503).json({
        success: false,
        error:
          "GEMINI_API_KEY belum dikonfigurasi pada server. Silakan periksa Settings > Secrets atau Environment Variables Vercel.",
      });
    }

    const result = await answerQuestionsForAiReaderWithGemini({
      questions,
      pageImages: normalizedPageImages,
    });

    return res.status(200).json({
      success: true,
      data: result,
    });
  } catch (err: any) {
    const errorInfo = logBackendError("/api/ai-reader/answer", "ai_reader_answer_error", err);
    return res.status(errorInfo.httpStatus || 500).json({
      success: false,
      error: errorInfo.message || "Gagal menjawab dan membahas soal menggunakan AI.",
      diagnostics: errorInfo,
    });
  }
}
