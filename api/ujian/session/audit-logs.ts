import { handleGetProctoringAuditLogs } from "../../_lib/examSessionBackend.ts";
import { logBackendError } from "../../_lib/diagnosticHelper.ts";

export const config = {
  maxDuration: 60,
};

export default async function handler(req: any, res: any) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type, Authorization");

  if (req.method === "OPTIONS") return res.status(200).end();

  const endpoint = "/api/ujian/session/audit-logs";
  try {
    const rawUrl = req.url || "/";
    const urlObj = new URL(rawUrl, "http://localhost");
    const ujianId = req.query?.ujianId || urlObj.searchParams.get("ujianId") || undefined;

    const result = handleGetProctoringAuditLogs(ujianId);
    return res.status(200).json(result);
  } catch (err: any) {
    const errorInfo = logBackendError(endpoint, "audit_logs_catch", err);
    return res.status(errorInfo.httpStatus).json({
      success: false,
      code: errorInfo.code,
      category: errorInfo.category,
      error: errorInfo.message,
      timestamp: new Date().toISOString(),
    });
  }
}
