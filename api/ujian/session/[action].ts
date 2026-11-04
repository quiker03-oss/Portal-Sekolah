import {
  handleStartExamSession,
  handleSaveAnswerSession,
  handleHeartbeatSession,
  handleSubmitSession,
  handleUnlockSession,
  handleGetProctoringAuditLogs,
  handleResetExamSession,
} from "../../_lib/examSessionBackend";

export const config = {
  maxDuration: 60,
  api: {
    bodyParser: {
      sizeLimit: "5mb",
    },
  },
};

export default async function handler(req: any, res: any) {
  // CORS configuration
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type, Authorization");

  if (req.method === "OPTIONS") {
    return res.status(200).end();
  }

  // Determine action from query or url
  const action = req.query?.action || (req.url ? req.url.split("?")[0].split("/").pop() : "");

  let body = req.body;
  if (typeof body === "string") {
    try {
      body = JSON.parse(body);
    } catch {
      // keep raw
    }
  }

  try {
    switch (action) {
      case "start": {
        if (req.method !== "POST") return res.status(405).json({ success: false, error: "Metode harus POST." });
        const clientIp = (req.headers && req.headers["x-forwarded-for"]) || req.socket?.remoteAddress;
        const result = await handleStartExamSession(body, clientIp);
        if ("locked" in result && result.locked) return res.status(403).json(result);
        return res.status(200).json(result);
      }

      case "save-answer": {
        if (req.method !== "POST") return res.status(405).json({ success: false, error: "Metode harus POST." });
        const result = await handleSaveAnswerSession(body);
        if ("locked" in result && result.locked) return res.status(403).json(result);
        return res.status(200).json(result);
      }

      case "heartbeat": {
        if (req.method !== "POST") return res.status(405).json({ success: false, error: "Metode harus POST." });
        const result = await handleHeartbeatSession(body);
        return res.status(200).json(result);
      }

      case "submit": {
        if (req.method !== "POST") return res.status(405).json({ success: false, error: "Metode harus POST." });
        const result = await handleSubmitSession(body);
        if ("locked" in result && result.locked) return res.status(403).json(result);
        return res.status(200).json(result);
      }

      case "unlock": {
        if (req.method !== "POST") return res.status(405).json({ success: false, error: "Metode harus POST." });
        const result = await handleUnlockSession(body);
        return res.status(200).json(result);
      }

      case "reset": {
        if (req.method !== "POST") return res.status(405).json({ success: false, error: "Metode harus POST." });
        const { ujianId, siswaId, guruNama } = body || {};
        const result = await handleResetExamSession(ujianId, siswaId, guruNama);
        return res.status(200).json(result);
      }

      case "audit-logs": {
        const ujianId = req.query?.ujianId || (req.url ? new URL(req.url, "http://localhost").searchParams.get("ujianId") : undefined);
        const result = handleGetProctoringAuditLogs(ujianId || undefined);
        return res.status(200).json(result);
      }

      default:
        return res.status(404).json({
          success: false,
          error: `Aksi sesi ujian '${action}' tidak dikenal.`,
        });
    }
  } catch (err: any) {
    console.error(`[Vercel API /api/ujian/session/${action} Error]:`, err);
    return res.status(200).json({
      success: false,
      error: err?.message || "Terjadi kesalahan pemrosesan sesi ujian.",
    });
  }
}
