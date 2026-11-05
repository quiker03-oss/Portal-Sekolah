import { handleParseImage } from "../_lib/geminiBackend.ts";
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

  const endpoint = "/api/ujian/parse-image";

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

    const { fileBase64, fileName = "naskah-ujian.jpg", mimeType = "image/jpeg" } = body || {};

    if (!fileBase64) {
      logBackendError(endpoint, "validate_payload", new Error("fileBase64 missing"), "INPUT_VALIDATION_ERROR");
      return res.status(400).json({
        success: false,
        code: "MISSING_PAYLOAD",
        error: "Data berkas gambar (fileBase64) tidak ditemukan dalam permintaan.",
      });
    }

    logBackendStep(endpoint, "start_parsing", { fileName, mimeType, base64Length: fileBase64.length });
    const result = await handleParseImage(fileBase64, fileName, mimeType);

    if (!result.success) {
      const errorInfo = logBackendError(endpoint, "handle_parse_image_result", new Error(result.error || "Gagal memproses gambar"));
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
