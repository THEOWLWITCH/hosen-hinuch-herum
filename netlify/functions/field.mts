// מהשטח: מקרים ובעיות (10.11.2026, מהסקר: "בנק מקרים מתחקירים" ו"בנק בעיות מהשטח", מאוחדים).
// כל אחד ואחת יכולים לשתף. שום דבר לא מתפרסם בלי אישור מנהלת המערכת. שם ומייל לא מוצגים באתר.
// כולם יכולים להצביע (פעם אחת לכל מכשיר). הבעיות שקיבלו הכי הרבה קולות מוצגות ראשונות ויכולות להפוך ליוזמה.
import type { Config } from "@netlify/functions";
import { id, json, looksHuman, store, validToken } from "../lib/shared.mts";
import { addRequest } from "../lib/requests.mts";

const data = () => store("hosen-data");
const clip = (v: unknown, n: number) => String(v ?? "").replace(/\r/g, "").trim().slice(0, n);
const KINDS = ["problem", "case"] as const;
const ROLES = ["מנהל/ת בית ספר", "מורה או איש/ת צוות", "יועץ/ת או פסיכולוג/ית", "רשות מקומית", "עמותה או ארגון", "הורה", "חוקר/ת", "אחר"];
const SETTINGS = ["גן", "בית ספר יסודי", "חטיבת ביניים", "תיכון", "חינוך מיוחד", "רשות או מחוז", "חינוך בלתי פורמלי", "אחר"];
const FIELDS: Record<string, string[]> = {
  problem: ["problem", "who", "tried"],
  case: ["planned", "happened", "why", "next"],
};

type Item = {
  id: string; kind: "problem" | "case"; title: string; role: string; setting: string; sector: string;
  parts: Record<string, string>; status: "pending" | "published" | "rejected";
  voters: string[]; name: string; email: string; createdAt: string; updatedAt: string;
};

async function listAll(): Promise<Item[]> {
  const st = data();
  const { blobs } = await st.list({ prefix: "field/" });
  const rows = await Promise.all(blobs.map(b => st.get(b.key, { type: "json" }).catch(() => null)));
  return (rows.filter(Boolean) as Item[]).sort((a, b) => b.createdAt.localeCompare(a.createdAt));
}
const pub = (x: Item) => ({ id: x.id, kind: x.kind, title: x.title, role: x.role, setting: x.setting, sector: x.sector, parts: x.parts, votes: (x.voters || []).length, createdAt: x.createdAt });

export default async (req: Request) => {
  const u = new URL(req.url);
  if (req.method === "GET") {
    const admin = u.searchParams.get("admin") === "1";
    if (admin) {
      if (!(await validToken(req, "admin"))) return json({ error: "unauthorized" }, 401);
      return json((await listAll()).filter(x => x.status !== "rejected").map(x => ({ ...pub(x), status: x.status, name: x.name, email: x.email })));
    }
    return json({ items: (await listAll()).filter(x => x.status === "published").map(pub), roles: ROLES, settings: SETTINGS });
  }
  if (req.method !== "POST") return json({ error: "method" }, 405);
  const body = await req.json().catch(() => ({} as any));
  const action = clip(body.action, 20);
  const st = data();

  if (action === "submit") {
    if (!looksHuman(body)) return json({ ok: true });
    const kind = KINDS.includes(body.kind) ? body.kind : "";
    if (!kind) return json({ error: "kind", message: "נשמח לבחור: בעיה או מקרה." }, 400);
    const parts: Record<string, string> = {};
    for (const k of FIELDS[kind]) parts[k] = clip(body.parts?.[k], 3000);
    const title = clip(body.title, 200);
    if (!title || !Object.values(parts).some(Boolean)) return json({ error: "missing", message: "נשמח לכותרת ולתיאור קצר." }, 400);
    if (body.consent !== true) return json({ error: "consent", message: "נשמח לאישור שאין בטקסט פרטים מזהים." }, 400);
    const now = new Date().toISOString();
    const x: Item = {
      id: id(), kind, title, role: ROLES.includes(body.role) ? body.role : "", setting: SETTINGS.includes(body.setting) ? body.setting : "",
      sector: clip(body.sector, 80), parts, status: "pending", voters: [], name: clip(body.name, 160), email: clip(body.email, 240), createdAt: now, updatedAt: now,
    };
    await st.setJSON(`field/${x.id}.json`, x);
    await addRequest({ type: "field", name: x.name || "ללא שם", email: x.email, subject: `🌾 ${kind === "case" ? "מקרה" : "בעיה"} מהשטח: ${title}`, body: Object.values(parts).filter(Boolean).join("\n\n"), link: "/field" });
    return json({ ok: true });
  }

  if (action === "vote") {
    const v = clip(body.v, 40);
    if (!/^[a-z0-9]{10,40}$/.test(v)) return json({ error: "bad" }, 400);
    const key = `field/${clip(body.id, 40)}.json`;
    const x = await st.get(key, { type: "json" }) as Item | null;
    if (!x || x.status !== "published") return json({ error: "not_found" }, 404);
    const voters = new Set(x.voters || []);
    if (voters.has(v)) voters.delete(v); else voters.add(v);
    x.voters = [...voters].slice(-5000);
    await st.setJSON(key, x);
    return json({ ok: true, votes: x.voters.length, voted: voters.has(v) });
  }

  // ניהול: אישור, דחייה, מחיקה ועריכת כותרת.
  if (!(await validToken(req, "admin"))) return json({ error: "unauthorized" }, 401);
  const key = `field/${clip(body.id, 40)}.json`;
  const x = await st.get(key, { type: "json" }) as Item | null;
  if (!x) return json({ error: "not_found" }, 404);
  if (action === "delete") { await st.delete(key); return json({ ok: true }); }
  if (action === "approve" || action === "reject") { x.status = action === "approve" ? "published" : "rejected"; }
  else if (action === "edit") {
    if (body.title) x.title = clip(body.title, 200);
    if (body.parts && typeof body.parts === "object") for (const k of FIELDS[x.kind]) if (k in body.parts) x.parts[k] = clip(body.parts[k], 3000);
  } else return json({ error: "action" }, 400);
  x.updatedAt = new Date().toISOString();
  await st.setJSON(key, x);
  return json({ ok: true });
};
export const config: Config = { path: "/api/field" };
