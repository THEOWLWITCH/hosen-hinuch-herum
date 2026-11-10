import type { Config } from "@netlify/functions";
import { json, validToken } from "../lib/shared.mts";
import { getOptOut, loadPeople, mailConfigured, mailErrorHint, sendAll, sendMail, siteUrl } from "../lib/calls.mts";
import { addLog, listLog, personalize, plainText, renderHtml } from "../lib/community-mail.mts";
import { buildSiteWeekly } from "../lib/site-weekly.mts";

const clip = (v: unknown, n: number) => String(v ?? "").trim().slice(0, n);

export default async (req: Request) => {
  if (!(await validToken(req, "admin"))) return json({ error: "unauthorized" }, 401);
  const u = new URL(req.url);
  const site = siteUrl(u.origin);

  // "מה חדש באתר השבוע": טיוטה מוכנה מהשבוע האחרון, נטענת לחלון "עדכון לקהילה" לעריכה ולשליחה.
  if (req.method === "GET" && u.searchParams.get("weekly") === "1") {
    // עדכון שנכתב ביד (weekly-draft.json, 10.11.2026): כשהטיוטה האוטומטית לא טובה מספיק, נוסח מלא שנכתב מחדש
    // נטען לחלון במקומה, עד התאריך שב-"until". אחרי כן חוזרים לטיוטה האוטומטית.
    const today = new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Jerusalem" }).format(new Date());
    const manual = await fetch(`${site}/weekly-draft.json`, { headers: { "cache-control": "no-cache" } }).then(r => r.ok ? r.json() : null).catch(() => null) as
      { date: string; until: string; subject: string; body: string } | null;
    if (!u.searchParams.get("auto") && manual?.body && manual.date <= today && today <= manual.until) {
      const d = (x: string) => x.split("-").reverse().map(Number).join(".");
      const from = d(new Date(Date.parse(manual.date) - 9 * 86400000).toISOString().slice(0, 10));
      // {{מספרים}} בנוסח: מוחלף בנתונים העדכניים מ"הקהילה במספרים" (10.11.2026).
      let body = manual.body;
      if (body.includes("{{מספרים}}")) {
        const st = (await buildSiteWeekly(site, 7).catch(() => null))?.sections.find(s => s.key === "stats");
        body = body.replace("{{מספרים}}", st ? st.lines.map(l => "- " + l).join("\n") : "");
      }
      return json({ subject: manual.subject, body, sections: [], count: 1, from, to: d(manual.date), manual: true });
    }
    const w = await buildSiteWeekly(site, Math.min(Math.max(Number(u.searchParams.get("days")) || 7, 1), 31));
    return json(w);
  }

  if (req.method === "GET") {
    const [people, optout, log] = await Promise.all([loadPeople(u.origin), getOptOut(), listLog()]);
    const off = new Set(optout);
    return json({
      configured: mailConfigured(), from: (Netlify.env.get("GMAIL_USER") || "").trim(), log,
      people: people.map(p => {
        const email = String(p.email || "").trim();
        return { id: p.id, name: p.name, email, hasEmail: email.includes("@"), optedOut: off.has(email.toLowerCase()) };
      }),
    });
  }

  if (req.method !== "POST") return json({ error: "method" }, 405);
  const body = await req.json().catch(() => ({} as any));
  const subject = clip(body.subject, 200), text = clip(body.body, 20000);

  if (body.action === "preview") {
    return json({ html: renderHtml(personalize(text, clip(body.name, 160) || "ד״ר ישראלה ישראלי"), site) });
  }

  if (body.action === "send") {
    if (!mailConfigured()) return json({ error: "mail", message: "חיבור Gmail לא פעיל." }, 503);
    if (!subject || !text) return json({ error: "missing", message: "חסרים נושא או טקסט." }, 400);
    if (body.test) {
      const me = (Netlify.env.get("GMAIL_USER") || "").trim();
      const t = personalize(text, "ד״ר יעל שדה");
      try { await sendMail(me, "[בדיקה] " + subject, renderHtml(t, site), plainText(t)); }
      // הסיבה האמיתית מוצגת (10.11.2026), ולא רק "בדקי את החיבור".
      catch (e) { console.error("test mail failed", String((e as Error)?.message || e)); return json({ error: "mail", message: "שליחת הבדיקה נכשלה: " + mailErrorHint(e) }, 502); }
      await addLog({ subject, sent: 1, failed: [], test: true });
      return json({ ok: true, sent: 1, failed: [] });
    }
    // נשלח בקבוצות קטנות מהדפדפן, כדי שכל קריאה תסתיים מהר.
    const ids = new Set((Array.isArray(body.personIds) ? body.personIds : []).slice(0, 12).map(String));
    const off = new Set(await getOptOut());
    const people = (await loadPeople(u.origin)).filter(p => ids.has(p.id) && String(p.email || "").includes("@") && !off.has(String(p.email).trim().toLowerCase()));
    const r = await sendAll(people, p => {
      const t = personalize(text, p.name);
      return sendMail(String(p.email).trim(), subject, renderHtml(t, site), plainText(t));
    });
    if (body.logAs) await addLog({ subject, sent: Number(body.logAs.sent || 0) + r.ok.length, failed: [...(body.logAs.failed || []), ...r.failed.map(p => p.name)].slice(0, 50), test: false });
    return json({ ok: true, sent: r.ok.length, failed: r.failed.map(p => p.name), reason: r.reason });
  }

  return json({ error: "unknown_action" }, 400);
};

export const config: Config = { path: "/api/community-mail" };
