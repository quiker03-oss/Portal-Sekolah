import { handleParseTextSoal } from "../_lib/geminiBackend.ts";
import { logBackendStep, logBackendError } from "../_lib/diagnosticHelper.ts";

export const config = {
  maxDuration: 60,
  api: {
    bodyParser: {
      sizeLimit: "10mb",
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
      code: "METHOD_NOT_ALLOWED",
      error: `Metode ${req.method} tidak diizinkan. Gunakan POST.`,
    });
  }

  const endpoint = "/api/ujian/parse-text-soal";

  try {
    logBackendStep(endpoint, "received_request");

    let body = req.body;
    if (typeof body === "string") {
      try {
        body = JSON.parse(body);
      } catch (parseErr) {
        logBackendError(endpoint, "json_parse_body", parseErr, "INPUT_VALIDATION_ERROR");
        return res.status(400).json({
          success: false,
          code: "INVALID_JSON_BODY",
          error: "Format JSON pada body permintaan tidak valid.",
        });
      }
    }

    const { text } = body || {};
    if (!text || !text.trim()) {
      logBackendError(endpoint, "validate_payload", new Error("Teks soal kosong"), "INPUT_VALIDATION_ERROR");
      return res.status(400).json({
        success: false,
        code: "EMPTY_TEXT",
        error: "Teks naskah soal tidak boleh kosong.",
      });
    }

    logBackendStep(endpoint, "start_parsing", { textLength: text.length });
    const result = await handleParseTextSoal(text);

    if (!result.success) {
      const errorInfo = logBackendError(endpoint, "handle_parse_text_result", new Error(result.error || "Gagal memproses teks"));
      return res.status(errorInfo.httpStatus).json({
        ...result,
        category: errorInfo.category,
        timestamp: new Date().toISOString(),
      });
    }

    logBackendStep(endpoint, "parsing_completed", { totalSoal: result?.soalList?.length ?? 0 });
    return res.status(200).json(result);
  } catch (err: any) {
    const errorInfo = logBackendError(endpoint, "handler_catch", err);
    return res.status(errorInfo.httpStatus).json({
      success: false,
      code: errorInfo.code,
      category: errorInfo.category,
      error: errorInfo.message,
      hint: errorInfo.hint,
      timestamp: new Date().toISOString(),
    });
  }
}
