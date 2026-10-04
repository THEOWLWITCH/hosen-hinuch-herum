import type { Config } from "@netlify/functions";
import { json } from "../lib/shared.mts";
import { addRequest } from "../lib/requests.mts";

function communityCodeOK(code: unknown) {
  const expected = Netlify.env.get("BOARD_CODE") || "";
  return !!expected && String(code || "") === expected;
}

function clean(v: unknown, max = 4000) {
  return String(v ?? "").trim().slice(0, max);
}

export default async (req: Request) => {
  if (req.method !== "POST") return json({ error: "method" }, 405);

  const body = await req.json().catch(() => ({} as any));

  if (!communityCodeOK(body.communityCode)) {
    return json({ error: "invalid_code", message: "קוד הקהילה שגוי." }, 401);
  }

  const required = [
    ["suggestionType", "סוג ההצעה"],
    ["targetSection", "החלק בעמוד"],
    ["url", "קישור למקור"],
    ["title", "כותרת / שם"]
  ] as const;

  const missing = required.filter(([k]) => !clean(body[k], 500)).map(([, label]) => label);
  if (missing.length) {
    return json({ error: "missing_fields", message: `חסרים שדות חובה: ${missing.join(", ")}.` }, 400);
  }

  let parsedUrl: URL;
  try {
    parsedUrl = new URL(clean(body.url, 1200));
    if (!["http:", "https:"].includes(parsedUrl.protocol)) throw new Error();
  } catch {
    return json({ error: "invalid_url", message: "יש להזין קישור תקין למקור." }, 400);
  }

  const params = new URLSearchParams();
  params.set("form-name", "research-suggestions");
  params.set("suggestionType", clean(body.suggestionType, 80));
  params.set("targetSection", clean(body.targetSection, 120));
  params.set("url", parsedUrl.toString());
  params.set("title", clean(body.title, 500));
  params.set("authors", clean(body.authors, 700));
  params.set("year", clean(body.year, 20));
  params.set("source", clean(body.source, 500));
  params.set("mainContribution", clean(body.mainContribution, 5000));
  params.set("whyImportant", clean(body.whyImportant, 5000));
  params.set("submitterName", clean(body.submitterName, 200));
  params.set("submittedAt", new Date().toISOString());

  const origin = new URL(req.url).origin;
  const r = await fetch(origin + "/", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: params.toString()
  });

  if (!r.ok) {
    return json({ error: "form_submit_failed", message: "שמירת ההצעה נכשלה. נסו שוב." }, 502);
  }

  // גם לתיבת הפניות של מנהלת המערכת.
  await addRequest({
    type: "source", name: clean(body.submitterName, 200), email: "", subject: clean(body.title, 300),
    body: [`סוג: ${clean(body.suggestionType, 80)}`, `לחלק: ${clean(body.targetSection, 120)}`, parsedUrl.toString(), clean(body.mainContribution, 2000), clean(body.whyImportant, 2000)].filter(Boolean).join("\n"),
    link: "/articles",
    data: {
      suggestionType: clean(body.suggestionType, 80), targetSection: clean(body.targetSection, 120), url: parsedUrl.toString(),
      title: clean(body.title, 500), authors: clean(body.authors, 700), year: clean(body.year, 20), source: clean(body.source, 500),
      mainContribution: clean(body.mainContribution, 5000), whyImportant: clean(body.whyImportant, 5000), submitterName: clean(body.submitterName, 200),
    },
  }).catch(() => {});

  return json({ ok: true });
};

export const config: Config = {
  path: "/api/research-suggestions",
  rateLimit: { windowLimit: 20, windowSize: 60, aggregateBy: ["ip"] }
};
