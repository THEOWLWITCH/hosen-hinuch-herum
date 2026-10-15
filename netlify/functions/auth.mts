import type { Config } from "@netlify/functions";
import { issueToken, json } from "../lib/shared.mts";
import { communityOK } from "../lib/member-code.mts";

export default async (req: Request) => {
  if (req.method !== "POST") return json({ error: "method" }, 405);
  const { code, mode } = await req.json().catch(() => ({ code: "", mode: "admin" }));
  const requested = mode === "upload" ? "uploader" : mode === "calls" ? "calls" : "admin";
  // הרשאת העלאה: גם בקוד האישי של חבר/ת נבחרת, או בכניסה קיימת איתו.
  if (requested === "uploader") {
    if (!(await communityOK(req, code))) return json({ error: "invalid_code" }, 401);
    return json({ token: await issueToken(requested), role: requested });
  }
  const expected = requested === "calls"
    ? (Netlify.env.get("CALLS_CODE") || "")
    : (Netlify.env.get("EDITOR_CODE") || "");
  if (!expected || String(code) !== expected) return json({ error: "invalid_code" }, 401);
  return json({ token: await issueToken(requested), role: requested });
};

export const config: Config = {
  path: "/api/auth",
  rateLimit: { windowLimit: 15, windowSize: 60, aggregateBy: ["ip"] },
};
