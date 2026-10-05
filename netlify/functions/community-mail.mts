import type { Config } from "@netlify/functions";
import { json, validToken } from "../lib/shared.mts";
import { getOptOut, loadPeople, mailConfigured, sendAll, sendMail, siteUrl } from "../lib/calls.mts";
import { addLog, listLog, personalize, plainText, renderHtml } from "../lib/community-mail.mts";

const clip = (v: unknown, n: number) => String(v ?? "").trim().slice(0, n);

export default async (req: Request) => {
  if (!(await validToken(req, "admin"))) return json({ error: "unauthorized" }, 401);
  const u = new URL(req.url);
  const site = siteUrl(u.origin);

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
      catch { return json({ error: "mail", message: "שליחת הבדיקה נכשלה. בדקי את חיבור ה-Gmail." }, 502); }
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
