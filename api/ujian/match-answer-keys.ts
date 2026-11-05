import { handleMatchAnswerKeys } from "../_lib/geminiBackend.ts";
import { logBackendStep, logBackendError } from "../_lib/diagnosticHelper.ts";

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
      code: "METHOD_NOT_ALLOWED",
      error: `Metode ${req.method} tidak diizinkan. Gunakan POST.`,
    });
  }

  const endpoint = "/api/ujian/match-answer-keys";

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
          error: "Format JSON pada request body tidak valid.",
        });
      }
    }

    const { soalList, keyFileBase64, keyMimeType, keyText, fileName } = body || {};

    if (!soalList || !Array.isArray(soalList) || soalList.length === 0) {
      logBackendError(endpoint, "validate_payload", new Error("soalList kosong"), "INPUT_VALIDATION_ERROR");
      return res.status(400).json({
        success: false,
        code: "EMPTY_SOAL_LIST",
        error: "Daftar butir soal tidak boleh kosong.",
      });
    }

    logBackendStep(endpoint, "start_matching", { totalSoal: soalList.length, fileName });
    const result = await handleMatchAnswerKeys(soalList, {
      keyFileBase64,
      keyMimeType,
      keyText,
      fileName,
    });

    if (!result.success) {
      const errorInfo = logBackendError(endpoint, "handle_match_result", new Error(result.error || "Gagal mencocokkan kunci"));
      return res.status(errorInfo.httpStatus).json({
        ...result,
        category: errorInfo.category,
        timestamp: new Date().toISOString(),
      });
    }

    logBackendStep(endpoint, "matching_completed", { totalMatched: result?.totalMatched ?? 0 });
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
