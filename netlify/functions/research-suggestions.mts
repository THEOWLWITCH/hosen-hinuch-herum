import type { Config } from "@netlify/functions";
import { cleanLinks, communityCodeOK, id, json, store } from "../lib/shared.mts";
import { addRequest, updateRequest } from "../lib/requests.mts";

function clean(v: unknown, max = 4000) {
  return String(v ?? "").trim().slice(0, max);
}

// מדור בעמוד חידושי המחקר → קטגוריה. כל מאמר מופיע גם ברשימה הכרונולוגית "מחקרים חדשים".
export const SECTION_CATEGORY: Record<string, string> = {
  "מוכנות": "research-preparedness",
  "חוסן נפשי": "research-resilience",
  "רציפות למידה": "research-continuity",
  "צוותי חינוך ומנהיגות": "research-teachers",
  "טכנולוגיה AI וסימולציה בחירום": "research-tech",
  "מכוני מחקר מובילים": "research-institute",
};

// חברי הקהילה מפרסמים בעצמם (בקוד הקהילה). מנהלת המערכת יכולה למחוק כל מקור.
export default async (req: Request) => {
  if (req.method !== "POST") return json({ error: "method" }, 405);
  const body = await req.json().catch(() => ({} as any));
  if (body["bot-field"]) return json({ ok: true });
  if (!communityCodeOK(body.communityCode)) return json({ error: "invalid_code", message: "קוד הקהילה שגוי." }, 401);

  const institute = clean(body.suggestionType, 80) === "מכון";
  const category = institute ? "research-institute" : SECTION_CATEGORY[clean(body.targetSection, 120)];
  if (!category || (!institute && category === "research-institute"))
    return json({ error: "missing_fields", message: "נא לבחור את המדור שאליו שייך המאמר." }, 400);

  const f = {
    title: clean(body.title, 500), authors: clean(body.authors, 700), year: clean(body.year, 20), source: clean(body.source, 500),
    description: clean(body.mainContribution, 5000), whyImportant: clean(body.whyImportant, 5000), suggestedBy: clean(body.submitterName, 200),
  };
  const missing = [
    !f.title && (institute ? "שם המכון" : "כותרת המאמר"),
    !institute && !f.authors && "מחברים",
    !institute && !/^\d{4}$/.test(f.year) && "שנת פרסום (4 ספרות)",
    !institute && !f.source && "כתב עת / מקור",
    institute && !f.description && "מה המכון תורם",
  ].filter(Boolean);
  if (missing.length) return json({ error: "missing_fields", message: `חסר: ${missing.join(", ")}.` }, 400);

  let url: string;
  try {
    const u = new URL(clean(body.url, 1200));
    if (!["http:", "https:"].includes(u.protocol)) throw new Error();
    url = u.toString();
  } catch {
    return json({ error: "invalid_url", message: "יש להזין קישור תקין למקור." }, 400);
  }

  const now = new Date().toISOString();
  const res = { id: id(), ...f, url, links: cleanLinks(body.links), category, type: "link", active: true, gallery: [], createdAt: now, updatedAt: now };
  await store("hosen-data").setJSON(`resources/${res.id}.json`, res);

  // תיעוד בתיבת הפניות (כבר מסומן כטופל — לא צריך אישור), כדי שיהיה קל למצוא ולמחוק אם צריך.
  try {
    const r = await addRequest({
      type: "source", name: f.suggestedBy, email: "", subject: f.title,
      body: [`פורסם במדור: ${clean(body.targetSection, 120) || "מכוני מחקר מובילים"}`, url, f.authors && `${f.authors} (${f.year}). ${f.source}`, f.description, f.whyImportant].filter(Boolean).join("\n"),
      link: "/articles",
    });
    await updateRequest(r.id, { status: "done", note: "פורסם באתר אוטומטית" });
  } catch {}

  return json({ ok: true, resource: { id: res.id, title: res.title, category } });
};

export const config: Config = {
  path: "/api/research-suggestions",
  rateLimit: { windowLimit: 20, windowSize: 60, aggregateBy: ["ip"] },
};
