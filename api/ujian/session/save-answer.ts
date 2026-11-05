import { handleSaveAnswerSession } from "../../_lib/examSessionBackend.ts";
import { logBackendStep, logBackendError } from "../../_lib/diagnosticHelper.ts";

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

  if (req.method === "OPTIONS") return res.status(200).end();
  if (req.method !== "POST") {
    return res.status(405).json({ success: false, code: "METHOD_NOT_ALLOWED", error: "Metode harus POST." });
  }

  const endpoint = "/api/ujian/session/save-answer";
  try {
    let body = req.body;
    if (typeof body === "string") {
      try {
        body = JSON.parse(body);
      } catch (err) {
        logBackendError(endpoint, "json_parse_body", err, "INPUT_VALIDATION_ERROR");
        return res.status(400).json({ success: false, code: "INVALID_JSON_BODY", error: "Format JSON tidak valid." });
      }
    }

    const result = await handleSaveAnswerSession(body);
    if ("locked" in result && result.locked) {
      logBackendStep(endpoint, "session_locked", { siswaId: body?.siswaId });
      return res.status(403).json(result);
    }
    if (!result.success) {
      return res.status(400).json(result);
    }
    return res.status(200).json(result);
  } catch (err: any) {
    const errorInfo = logBackendError(endpoint, "save_answer_catch", err);
    return res.status(errorInfo.httpStatus).json({
      success: false,
      code: errorInfo.code,
      category: errorInfo.category,
      error: errorInfo.message,
      timestamp: new Date().toISOString(),
    });
  }
}
