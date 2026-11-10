// ספירת מבקרים פשוטה וחינמית (5.11.2026). Netlify Analytics בתשלום (9$ לאתר בחודש), ולכן סופרים כאן:
// כל דפדפן שולח פעם אחת ביום מזהה אקראי (נוצר בדפדפן, בלי שם, בלי IP ובלי עוגיות), ונשמר visits/<יום>/<מזהה>.json.
// מספר המזהים השונים בשבוע = כמה אנשים (דפדפנים) ביקרו. הנתונים נמחקים אחרי 60 יום (site-weekly).
import type { Config } from "@netlify/functions";
import { json, store } from "../lib/shared.mts";

const PAGES = new Set(["now", "match", "gallery", "people", "articles", "library", "compass", "apps", "tasks", "kikar", "calls", "conferences", "grants"]);

export default async (req: Request) => {
  if (req.method !== "POST") return json({ error: "method" }, 405);
  const body = await req.json().catch(() => ({} as any));
  const v = String(body?.v || "");
  if (!/^[a-z0-9]{10,32}$/.test(v)) return json({ ok: true });
  const day = new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Jerusalem" }).format(new Date());
  // צפייה בעמוד (10.11.2026): pages/<יום>/<עמוד>/<מזהה>.json. מכשיר נספר פעם אחת ביום בכל עמוד.
  const p = String(body?.p || "");
  if (p) {
    if (PAGES.has(p)) await store("hosen-data").setJSON(`pages/${day}/${p}/${v}.json`, {}).catch(() => {});
    return json({ ok: true });
  }
  await store("hosen-data").setJSON(`visits/${day}/${v}.json`, { m: body?.m === 1 ? 1 : 0 }).catch(() => {});
  return json({ ok: true });
};

export const config: Config = { path: "/api/visit", rateLimit: { windowLimit: 20, windowSize: 60, aggregateBy: ["ip"] } };
