import type { Config } from "@netlify/functions";
import { json, store, validToken } from "../lib/shared.mts";

// כרטיסים בעמוד הראשי (10.11.2026): מנהלת המערכת מסתירה ומחזירה כרטיסים בלי לגעת בקוד.
// נשמרת רק רשימת המזהים המוסתרים (data-card-id בעמוד).
const KEY = "home-cards/hidden.json";
const st = () => store("hosen-data");

export default async (req: Request) => {
  if (req.method === "GET") {
    const hidden = (await st().get(KEY, { type: "json" })) as string[] | null;
    return json({ hidden: Array.isArray(hidden) ? hidden : [] });
  }
  if (req.method === "PUT") {
    if (!(await validToken(req, "admin"))) return json({ error: "unauthorized" }, 401);
    const body = await req.json().catch(() => ({}));
    const hidden = Array.isArray(body.hidden) ? [...new Set(body.hidden.map(String).filter((s: string) => /^[a-z0-9-]{1,40}$/.test(s)))].slice(0, 100) : null;
    if (!hidden) return json({ error: "bad_request" }, 400);
    await st().setJSON(KEY, hidden);
    return json({ hidden });
  }
  return json({ error: "method" }, 405);
};
export const config: Config = { path: "/api/home-cards" };
