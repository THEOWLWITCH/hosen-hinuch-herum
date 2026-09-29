import type { Config } from "@netlify/functions";
import { issueToken, json } from "../lib/shared.mts";

export default async (req: Request) => {
  if (req.method !== "POST") return json({ error: "method" }, 405);
  const { code, mode } = await req.json().catch(() => ({ code: "", mode: "admin" }));
  const requested = mode === "upload" ? "uploader" : "admin";
  const expected = requested === "uploader"
    ? (Netlify.env.get("BOARD_CODE") || "")
    : (Netlify.env.get("EDITOR_CODE") || "");
  if (!expected || String(code) !== expected) return json({ error: "invalid_code" }, 401);
  return json({ token: await issueToken(requested), role: requested });
};

export const config: Config = {
  path: "/api/auth",
  rateLimit: { windowLimit: 15, windowSize: 60, aggregateBy: ["ip"] },
};
