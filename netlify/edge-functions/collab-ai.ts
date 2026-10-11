import type { Config } from "@netlify/edge-functions";
import Anthropic from "@anthropic-ai/sdk";

// רעיונות למחקר בשידוכים: מזרים לדפדפן את התשובה של המודל (כמו נבט).
// פונקציית קצה ולא פונקציה רגילה, כי כתיבת כמה רעיונות לוקחת יותר זמן ממה שפונקציה רגילה מאפשרת.
// ההרשאה (כניסת ניהול), איסוף הכרטיסים והמאמרים, והפרומפט נקבעים ב-/api/collab.
const json = (data: unknown, status = 200) =>
  new Response(JSON.stringify(data), { status, headers: { "content-type": "application/json; charset=utf-8", "cache-control": "no-store" } });

export default async (req: Request) => {
  if (req.method !== "POST") return json({ error: "method" }, 405);
  const apiKey = Netlify.env.get("ANTHROPIC_API_KEY") || "";
  const secret = Netlify.env.get("EDITOR_SECRET") || "";
  let body: any;
  try { body = await req.json(); } catch { return json({ error: "collab", message: "בקשה לא תקינה." }, 400); }

  const prep = await fetch(new URL("/api/collab", req.url), {
    method: "POST",
    headers: { "content-type": "application/json", "x-internal": secret, authorization: req.headers.get("authorization") || "" },
    body: JSON.stringify({ action: "research-prepare", count: body?.count, focus: body?.focus, articles: body?.articles }),
  });
  if (!prep.ok) return new Response(prep.body, { status: prep.status, headers: { "content-type": "application/json; charset=utf-8" } });
  const { runId, params, articles, people } = await prep.json();

  try {
    const client = new Anthropic({ apiKey });
    // asResponse: התשובה עוברת לדפדפן כמו שהיא, בלי פענוח כאן.
    const upstream = await client.beta.messages.create({ ...params, stream: true }).asResponse();
    return new Response(upstream.body, {
      headers: {
        "content-type": "text/event-stream; charset=utf-8", "cache-control": "no-store",
        "x-run-id": runId, "x-run-meta": encodeURIComponent(JSON.stringify({ articles, people })),
      },
    });
  } catch (e) {
    let message = "לא הצלחנו להתחבר למודל השפה. אפשר לנסות שוב בעוד כמה דקות.";
    if (e instanceof Anthropic.AuthenticationError) message = "המפתח של מודל השפה (ANTHROPIC_API_KEY) לא תקין.";
    else if (e instanceof Anthropic.RateLimitError) message = "יש כרגע עומס, או שהגעתם לתקרת ההוצאה החודשית. אפשר לנסות שוב מאוחר יותר.";
    else if (e instanceof Anthropic.BadRequestError) message = "הבקשה למודל נדחתה. אפשר לנסות שוב עם פחות רעיונות.";
    console.error("collab-ai", e instanceof Anthropic.APIError ? `${e.status} ${e.message}` : String(e));
    return json({ error: "collab", message }, 502);
  }
};

export const config: Config = { path: "/api/collab-ai" };
