import { getSafeKeyDiagnostics } from "./_lib/diagnosticHelper.ts";

export default function handler(req: any, res: any) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");

  if (req.method === "OPTIONS") {
    return res.status(200).end();
  }

  const diag = getSafeKeyDiagnostics();

  return res.status(200).json({
    status: "ok",
    app: "ISTAFA Portal Sekolah",
    aiAvailable: diag.exists,
    platform: process.env.VERCEL ? "vercel-serverless" : "local-node",
    timestamp: new Date().toISOString(),
    diagnostics: {
      aiAvailable: diag.exists,
      platform: process.env.VERCEL ? "vercel-serverless" : "local-node",
      nodeVersion: process.version,
      timestamp: new Date().toISOString(),
    },
  });
}
