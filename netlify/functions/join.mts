import type { Config } from "@netlify/functions";
import { json, looksHuman } from "../lib/shared.mts";
import { THEMES } from "../lib/calls.mts";
import { addRequest } from "../lib/requests.mts";

const clip = (v: unknown, n: number) => String(v ?? "").trim().slice(0, n);
export const TITLES = ["ד״ר", "פרופ׳", "גב׳", "מר", "עו״ד", "אחר"];

// בקשת הצטרפות לקהילה: נשמרת בתיבת הפניות, ונכנסת לנבחרת רק אחרי אישור של מנהלת המערכת.
export default async (req: Request) => {
  if (req.method === "GET") return json({ themes: THEMES.map(t => ({ key: t.key, label: t.label })), titles: TITLES });
  if (req.method !== "POST") return json({ error: "method" }, 405);
  const b = await req.json().catch(() => ({} as any));
  if (!looksHuman(b)) return json({ ok: true });
  const f = {
    title: TITLES.includes(b.title) ? b.title : "", fullName: clip(b.fullName, 120), affiliation: clip(b.affiliation, 220),
    phone: clip(b.phone, 40), email: clip(b.email, 240), expertise: clip(b.expertise, 3000),
    topics: (Array.isArray(b.topics) ? b.topics : []).filter((k: string) => THEMES.some(t => t.key === k)).slice(0, 17),
  };
  const missing = [
    !f.fullName && "שם מלא", !f.title && "תואר", !f.affiliation && "מוסד או ארגון", !/^[\d+\-\s()]{7,}$/.test(f.phone) && "מספר נייד",
    !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(f.email) && "מייל", f.expertise.length < 10 && "תחומי עיסוק ומחקר", !f.topics.length && "לפחות תחום עניין אחד",
  ].filter(Boolean);
  if (missing.length) return json({ error: "missing", message: `חסר: ${missing.join(", ")}.` }, 400);
  if (b.consent !== true) return json({ error: "consent", message: "נדרש אישור להצגת הפרטים בכרטיס." }, 400);
  const name = `${f.title === "אחר" ? "" : f.title + " "}${f.fullName}`.trim();
  const labels = f.topics.map((k: string) => THEMES.find(t => t.key === k)!.label);
  await addRequest({
    type: "join", name, email: f.email, subject: `בקשת הצטרפות: ${name} · ${f.affiliation}`,
    body: [`מוסד / ארגון: ${f.affiliation}`, `נייד: ${f.phone}`, `מייל: ${f.email}`, `תחומי עיסוק ומחקר: ${f.expertise}`, `תחומי עניין: ${labels.join(", ")}`].join("\n"),
    link: "/people", data: { ...f, name },
  });
  return json({ ok: true });
};

export const config: Config = { path: "/api/join", rateLimit: { windowLimit: 10, windowSize: 60, aggregateBy: ["ip"] } };
