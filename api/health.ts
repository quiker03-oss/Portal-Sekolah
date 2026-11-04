export default function handler(req: any, res: any) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");

  if (req.method === "OPTIONS") {
    return res.status(200).end();
  }

  const hasApiKey = Boolean(
    process.env.GEMINI_API_KEY ||
    process.env.GOOGLE_API_KEY ||
    process.env.VITE_GEMINI_API_KEY ||
    process.env.API_KEY
  );

  return res.status(200).json({
    status: "ok",
    app: "ISTAFA Portal Sekolah",
    aiAvailable: hasApiKey,
    apiKeySource: process.env.GEMINI_API_KEY
      ? "GEMINI_API_KEY"
      : process.env.GOOGLE_API_KEY
      ? "GOOGLE_API_KEY"
      : process.env.VITE_GEMINI_API_KEY
      ? "VITE_GEMINI_API_KEY"
      : hasApiKey
      ? "API_KEY"
      : "NONE",
    timestamp: new Date().toISOString(),
    platform: process.env.VERCEL ? "vercel-serverless" : "local-node",
    nodeVersion: process.version,
  });
}
