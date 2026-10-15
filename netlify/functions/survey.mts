import type { Config } from "@netlify/functions";
import { id, json, looksHuman, store, validToken } from "../lib/shared.mts";

// סקר הרעיונות לאתר: בעילום שם. לא נשמרים שם, מייל, כתובת IP או מזהה, ורק תאריך ההגשה (בלי שעה).
// התוצאות: רק למנהלת המערכת, בלשונית "סקר רעיונות" בניהול.
const SURVEY = "ideas2026";
export const IDEA_IDS = ["ask", "onboard", "path", "credit", "orcid", "cases", "problems", "measures", "stewards", "pulse", "codesign", "open", "gadrrres", "langs"];

const data = () => store("hosen-data");
const prefix = `survey/${SURVEY}/`;
const pick = (v: unknown, max: number) => [...new Set((Array.isArray(v) ? v : []).map(String))].filter(k => IDEA_IDS.includes(k)).slice(0, max);

export default async (req: Request) => {
  if (req.method === "GET") {
    if (!(await validToken(req, "admin"))) return json({ error: "unauthorized" }, 401);
    const st = data();
    const { blobs } = await st.list({ prefix });
    const rows: { want: string[]; top: string[]; ideas: string; at: string }[] = [];
    for (const b of blobs) { const v = await st.get(b.key, { type: "json" }) as any; if (v) rows.push(v); }
    const tally = Object.fromEntries(IDEA_IDS.map(k => [k, { want: 0, top: 0 }]));
    for (const r of rows) {
      for (const k of r.want || []) if (tally[k]) tally[k].want++;
      for (const k of r.top || []) if (tally[k]) tally[k].top++;
    }
    const ideas = rows.filter(r => r.ideas).map(r => ({ text: r.ideas, at: r.at })).sort((a, b) => b.at.localeCompare(a.at));
    return json({ responses: rows.length, tally, ideas });
  }

  if (req.method !== "POST") return json({ error: "method" }, 405);
  const body = await req.json().catch(() => ({} as any));
  if (!looksHuman(body)) return json({ ok: true });
  const top = pick(body.top, 3);
  const want = [...new Set([...pick(body.want, IDEA_IDS.length), ...top])];
  const ideas = String(body.ideas ?? "").trim().slice(0, 3000);
  if (!want.length && !ideas) return json({ error: "empty", message: "נשמח לסימון של רעיון אחד לפחות, או לרעיון משלך." }, 400);
  await data().setJSON(`${prefix}${id()}.json`, { want, top, ideas, at: new Date().toISOString().slice(0, 10) });
  return json({ ok: true });
};

export const config: Config = {
  path: "/api/survey",
  rateLimit: { windowLimit: 20, windowSize: 60, aggregateBy: ["ip"] },
};
