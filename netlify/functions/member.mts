import type { Config } from "@netlify/functions";
import { issueMemberToken, json, looksHuman, memberFromToken, store, validToken } from "../lib/shared.mts";
import { THEMES, getOptOut, loadPeople, mailConfigured, mailErrorHint, personTopics, sendAll, sendMail, siteUrl } from "../lib/calls.mts";

// בחירת תחומי עניין לחברות הנבחרת: קישור אישי במייל (בלי קוד), והבחירה נשמרת בכרטיס.
const clip = (v: unknown, n: number) => String(v ?? "").trim().slice(0, n);
const norm = (e: unknown) => String(e ?? "").trim().toLowerCase();
const themes = () => THEMES.map(t => ({ key: t.key, label: t.label }));

function esc(s: string) {
  return String(s || "").replace(/[&<>"]/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c] || c));
}

async function linkMail(p: { id: string; name: string; email?: string }, site: string) {
  const link = `${site}/#my-topics=${await issueMemberToken(p.id)}`;
  const lines = [
    `שלום ${p.name},`,
    "באתר הקהילה אפשר עכשיו לבחור את תחומי העניין שלך.",
    "לפי הבחירה שלך נשלח אלייך קולות קוראים, מענקים וכנסים שמתאימים לך, וגם הסיכום השבועי יותאם אלייך.",
    "הבחירה נשמרת בכרטיס שלך בנבחרת, ואפשר לשנות אותה בכל עת דרך אותו קישור.",
    "הקישור אישי. בבקשה לא להעביר אותו הלאה. הוא בתוקף 60 יום.",
  ];
  const html = `<div dir="rtl" style="font-family:Arial,sans-serif;max-width:600px;margin:auto;padding:8px 18px;color:#1d3445;line-height:1.7;font-size:15px">${lines.map(l => `<p>${esc(l)}</p>`).join("")}<p><a href="${esc(link)}" style="display:inline-block;padding:10px 18px;border-radius:999px;background:#2f6e4f;color:#fff;text-decoration:none"><strong>🎯 לבחירת תחומי העניין שלי</strong></a></p><p style="font-size:12px;color:#6b7d88">בינה מלאכותית: חוסן-חינוך-חרום</p></div>`;
  await sendMail(String(p.email), "בחירת תחומי העניין שלך באתר הקהילה", html, lines.join("\n\n") + `\n\nלבחירת תחומי העניין: ${link}`);
}

export default async (req: Request) => {
  const u = new URL(req.url);
  const site = siteUrl(u.origin);

  if (req.method === "GET") {
    const pid = await memberFromToken(clip(req.headers.get("x-member-token"), 400));
    if (!pid) return json({ error: "forbidden", message: "הקישור לא תקין או שפג תוקפו. אפשר לבקש קישור חדש." }, 403);
    const p = (await loadPeople(u.origin)).find(x => x.id === pid);
    if (!p) return json({ error: "not_found", message: "הכרטיס לא נמצא בנבחרת." }, 404);
    return json({ name: p.name, institution: p.institution || "", topics: personTopics(p), chosen: Array.isArray((p as any).topics) && (p as any).topics.length > 0, themes: themes() });
  }

  if (req.method !== "POST") return json({ error: "method" }, 405);
  const body = await req.json().catch(() => ({} as any));
  const action = clip(body.action, 30);

  // בקשת קישור אישי: לפי המייל שבכרטיס.
  if (action === "link") {
    if (!looksHuman(body)) return json({ ok: true, sent: true });
    const email = norm(body.email);
    if (!email.includes("@")) return json({ error: "invalid", message: "נא להזין כתובת מייל." }, 400);
    const p = (await loadPeople(u.origin)).find(x => norm(x.email) === email);
    if (!p) return json({ error: "not_member", message: "המייל הזה לא מופיע בכרטיס בנבחרת. אם עוד לא הצטרפת — אפשר לבקש להצטרף בכפתור \"🙋 הצטרפות לקהילה\". אם הכרטיס שלך רשום עם מייל אחר — כדאי לנסות אותו." }, 404);
    if (!mailConfigured()) return json({ error: "mail", message: "שליחת המיילים מהאתר עוד לא פעילה." }, 503);
    try {
      await linkMail(p, site);
      return json({ ok: true, sent: true });
    } catch (e) {
      return json({ error: "mail", message: "השליחה לא הצליחה. " + mailErrorHint(e) }, 502);
    }
  }

  // שמירת הבחירה בכרטיס.
  if (action === "save") {
    const pid = await memberFromToken(clip(req.headers.get("x-member-token"), 400));
    if (!pid) return json({ error: "forbidden", message: "הקישור לא תקין או שפג תוקפו. אפשר לבקש קישור חדש." }, 403);
    const topics = [...new Set((Array.isArray(body.topics) ? body.topics : []).map(String))].filter(k => THEMES.some(t => t.key === k));
    if (!topics.length) return json({ error: "missing", message: "נא לבחור לפחות תחום אחד." }, 400);
    const p = (await loadPeople(u.origin)).find(x => x.id === pid);
    if (!p) return json({ error: "not_found", message: "הכרטיס לא נמצא בנבחרת." }, 404);
    const { photoUrl, ...stored } = p as any;
    await store("hosen-data").setJSON(`people/${pid}.json`, { ...stored, topics, updatedAt: new Date().toISOString() });
    return json({ ok: true, topics });
  }

  // מנהלת המערכת: שליחת קישור אישי לכל חברות הנבחרת שיש להן מייל.
  if (action === "invite-all") {
    if (!(await validToken(req, "admin"))) return json({ error: "unauthorized" }, 401);
    if (!mailConfigured()) return json({ error: "mail", message: "שליחת המיילים מהאתר עוד לא פעילה." }, 503);
    const optout = new Set(await getOptOut());
    const people = (await loadPeople(u.origin)).filter(p => String(p.email || "").includes("@") && !optout.has(norm(p.email)));
    const onlyNew = body.onlyNew === true;
    const rows = onlyNew ? people.filter(p => !(Array.isArray((p as any).topics) && (p as any).topics.length)) : people;
    const r = await sendAll(rows, p => linkMail(p, site));
    return json({ ok: true, sent: r.ok.length, failed: r.failed.map(p => p.name), reason: r.reason, total: rows.length });
  }

  return json({ error: "unknown_action" }, 400);
};

export const config: Config = { path: "/api/member", rateLimit: { windowLimit: 20, windowSize: 60, aggregateBy: ["ip"] } };
