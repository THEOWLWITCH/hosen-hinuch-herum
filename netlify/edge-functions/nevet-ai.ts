import type { Config } from "@netlify/edge-functions";
import Anthropic from "@anthropic-ai/sdk";

// מזרים לדפדפן את התשובה של המודל עבור נבט ומיזי.
// פונקציית קצה ולא פונקציה רגילה: ניתוח מאמר לוקח יותר זמן ממה שפונקציה רגילה מאפשרת,
// וכאן התשובה זורמת לדפדפן תוך כדי שהיא נכתבת. ההרשאות, החיוב והפרומפט נקבעים ב-/api/nevet.
const json = (data: unknown, status = 200) =>
  new Response(JSON.stringify(data), { status, headers: { "content-type": "application/json; charset=utf-8", "cache-control": "no-store" } });

export default async (req: Request) => {
  if (req.method !== "POST") return json({ error: "method" }, 405);
  const apiKey = Netlify.env.get("ANTHROPIC_API_KEY") || "";
  const secret = Netlify.env.get("EDITOR_SECRET") || "";
  let request: unknown;
  try { request = await req.json(); } catch { return json({ error: "nevet", message: "בקשה לא תקינה." }, 400); }

  const forward = (extra: Record<string, unknown>) => fetch(new URL("/api/nevet", req.url), {
    method: "POST",
    headers: {
      "content-type": "application/json", "x-internal": secret,
      "x-nevet-code": req.headers.get("x-nevet-code") || "",
      "x-project-key": req.headers.get("x-project-key") || "",
      authorization: req.headers.get("authorization") || "",
    },
    body: JSON.stringify(extra),
  });

  const prep = await forward({ action: "prepare", request });
  if (!prep.ok) return new Response(prep.body, { status: prep.status, headers: { "content-type": "application/json; charset=utf-8" } });
  const { ticket, params, ...meta } = await prep.json();

  try {
    const client = new Anthropic({ apiKey });
    // asResponse: התשובה עוברת לדפדפן כמו שהיא, בלי פענוח כאן.
    const upstream = await client.beta.messages.create({ ...params, stream: true }).asResponse();
    return new Response(upstream.body, {
      headers: {
        "content-type": "text/event-stream; charset=utf-8", "cache-control": "no-store",
        "x-nevet-ticket": ticket, "x-nevet-meta": encodeURIComponent(JSON.stringify(meta)),
      },
    });
  } catch (e) {
    await forward({ action: "refund", ticket }).catch(() => {});
    let message = "נבט לא הצליח להתחבר למודל השפה. הפעולות הוחזרו לחשבון שלך. אפשר לנסות שוב בעוד כמה דקות.";
    if (e instanceof Anthropic.AuthenticationError) message = "המפתח של מודל השפה (ANTHROPIC_API_KEY) לא תקין. הפעולות הוחזרו לחשבון שלך.";
    else if (e instanceof Anthropic.RateLimitError) message = "יש כרגע עומס, או שהגעתם לתקרת ההוצאה החודשית. הפעולות הוחזרו לחשבון שלך. אפשר לנסות שוב מאוחר יותר.";
    else if (e instanceof Anthropic.BadRequestError) message = "הבקשה למודל נדחתה (ייתכן שהמאמר ארוך מדי). הפעולות הוחזרו לחשבון שלך.";
    console.error("nevet-ai", e instanceof Anthropic.APIError ? `${e.status} ${e.message}` : String(e));
    return json({ error: "nevet", message }, 502);
  }
};

export const config: Config = { path: "/api/nevet-ai" };
