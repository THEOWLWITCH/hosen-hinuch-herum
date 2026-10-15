import type { Config } from "@netlify/functions";
import { issueMemberToken, json, looksHuman, memberFromToken, store, validToken } from "../lib/shared.mts";
import { THEMES, getOptOut, loadPeople, mailConfigured, mailErrorHint, personTopics, sendAll, sendMail, siteUrl } from "../lib/calls.mts";
import { KINDS, cleanKinds, offerOf } from "../lib/collab.mts";
import { codeFor, codeMail, formatCode, hasCode, pidFromCode } from "../lib/member-code.mts";

// הכרטיס האישי של חברות וחברי הנבחרת.
// כניסה בקוד אישי (נשלח בהצטרפות, ואפשר לשחזר אותו לפי המייל), או בקישור אישי ישן מהמייל.
// הכניסה מחזירה אסימון אישי (x-member-token) שהדפדפן שומר, וכך לא צריך להקליד את הקוד בכל פעם.
const clip = (v: unknown, n: number) => String(v ?? "").trim().slice(0, n);
const norm = (e: unknown) => String(e ?? "").trim().toLowerCase();
const validEmail = (e: string) => /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(e);
const themes = () => THEMES.map(t => ({ key: t.key, label: t.label }));
const SESSION_DAYS = 180;
const EXPIRED = { error: "forbidden", message: "הכניסה לכרטיס הסתיימה. אפשר להיכנס שוב בקוד האישי." };

function cleanUrl(v: unknown): string {
  const raw = String(v || "").trim();
  if (!raw) return "";
  try {
    const u = new URL(/^https?:\/\//i.test(raw) ? raw : `https://${raw}`);
    return u.protocol === "http:" || u.protocol === "https:" ? u.toString().slice(0, 700) : "";
  } catch {
    return "";
  }
}

function esc(s: string) {
  return String(s || "").replace(/[&<>"]/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c] || c));
}

// קישור ישן לבחירת תחומי עניין (נשאר בשימוש בכפתור של מנהלת המערכת).
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

async function me(req: Request) {
  return memberFromToken(clip(req.headers.get("x-member-token"), 400));
}

export default async (req: Request) => {
  const u = new URL(req.url);
  const site = siteUrl(u.origin);

  // הכרטיס המלא של מי שנכנס/ה.
  if (req.method === "GET") {
    const pid = await me(req);
    if (!pid) return json(EXPIRED, 403);
    const p = (await loadPeople(u.origin)).find(x => x.id === pid) as any;
    if (!p) return json({ error: "not_found", message: "הכרטיס לא נמצא בנבחרת." }, 404);
    return json({
      id: p.id, name: p.name, institution: p.institution || "", description: p.description || "", email: p.email || "", phone: p.phone || "",
      motto: p.motto || "", websiteUrl: p.websiteUrl || "", linkedinUrl: p.linkedinUrl || "", facebookUrl: p.facebookUrl || "", instagramUrl: p.instagramUrl || "",
      photoUrl: p.photoUrl || "", topics: personTopics(p), chosen: Array.isArray(p.topics) && p.topics.length > 0, themes: themes(),
      offer: offerOf(p), kinds: KINDS,
    });
  }

  if (req.method !== "POST") return json({ error: "method" }, 405);
  const body = await req.json().catch(() => ({} as any));
  const action = clip(body.action, 30);

  // כניסה בקוד האישי.
  if (action === "login") {
    const pid = await pidFromCode(body.code);
    if (!pid) return json({ error: "bad_code", message: "הקוד לא מתאים. כדאי לבדוק אותו שוב, או לבקש אותו למייל בכפתור \"שכחתי את הקוד\"." }, 401);
    const p = (await loadPeople(u.origin)).find(x => x.id === pid);
    if (!p) return json({ error: "not_found", message: "הכרטיס לא נמצא בנבחרת." }, 404);
    return json({ ok: true, token: await issueMemberToken(pid, SESSION_DAYS), name: p.name });
  }

  // שחזור הקוד: נשלח למייל שבכרטיס (אותו קוד, או קוד חדש אם עוד לא היה).
  // "link" — הכפתור הישן "שליחת קישור", שולח עכשיו את הקוד.
  if (action === "recover" || action === "link") {
    if (!looksHuman(body)) return json({ ok: true, sent: true });
    const email = norm(body.email);
    if (!validEmail(email)) return json({ error: "invalid", message: "נשמח לכתובת מייל תקינה." }, 400);
    const p = (await loadPeople(u.origin)).find(x => norm(x.email) === email);
    if (!p) return json({ error: "not_member", message: "המייל הזה לא מופיע בכרטיס בנבחרת. אם הכרטיס רשום עם מייל אחר, כדאי לנסות אותו. אם עוד לא הצטרפת, אפשר לבקש להצטרף בכפתור \"🙋 הצטרפות לקהילה\"." }, 404);
    if (!mailConfigured()) return json({ error: "mail", message: "שליחת המיילים מהאתר עוד לא פעילה. אפשר לבקש את הקוד ממנהלת הקהילה." }, 503);
    try {
      const { code } = await codeFor(p.id);
      await codeMail(p, code, site, "recover");
      return json({ ok: true, sent: true });
    } catch (e) {
      return json({ error: "mail", message: "השליחה לא הצליחה. " + mailErrorHint(e) }, 502);
    }
  }

  // שמירת הכרטיס (כל השדות שנשלחו). "save" — שמירת תחומי העניין בלבד, כמו בקישור הישן.
  if (action === "card-save" || action === "save") {
    const pid = await me(req);
    if (!pid) return json(EXPIRED, 403);
    const people = await loadPeople(u.origin);
    const p = people.find(x => x.id === pid) as any;
    if (!p) return json({ error: "not_found", message: "הכרטיס לא נמצא בנבחרת." }, 404);
    const { photoUrl, ...stored } = p;
    const now = new Date().toISOString();
    const next: any = { ...stored, updatedAt: now };

    if ("topics" in body) {
      const topics = [...new Set((Array.isArray(body.topics) ? body.topics : []).map(String))].filter(k => THEMES.some(t => t.key === k));
      if (!topics.length) return json({ error: "missing", message: "נשמח לתחום עניין אחד לפחות." }, 400);
      next.topics = topics;
    }
    if (action === "card-save") {
      const name = clip(body.name, 160);
      if (!name) return json({ error: "missing", message: "נשמח לשם, כפי שיופיע בכרטיס." }, 400);
      const email = clip(body.email, 240);
      if (!validEmail(email)) return json({ error: "invalid", message: "נשמח לכתובת מייל תקינה. אליה יישלח הקוד אם יישכח." }, 400);
      if (people.some(x => x.id !== pid && norm(x.email) === norm(email))) return json({ error: "taken", message: "המייל הזה כבר רשום בכרטיס אחר בנבחרת." }, 409);
      Object.assign(next, {
        name, email, institution: clip(body.institution, 220), description: clip(body.description, 6000), phone: clip(body.phone, 80),
        motto: clip(body.motto, 600), websiteUrl: cleanUrl(body.websiteUrl), linkedinUrl: cleanUrl(body.linkedinUrl),
        facebookUrl: cleanUrl(body.facebookUrl), instagramUrl: cleanUrl(body.instagramUrl),
      });
      if (body.offer && typeof body.offer === "object") {
        const offer = { kinds: cleanKinds(body.offer.kinds), text: clip(body.offer.text, 1500), updatedAt: now };
        if (offer.kinds.length || offer.text) next.offer = offer;
      }
    }
    await store("hosen-data").setJSON(`people/${pid}.json`, next);
    return json({ ok: true, topics: next.topics || personTopics(next) });
  }

  // ----- מנהלת המערכת -----
  if (!["invite-all", "code-send", "code-invite-all"].includes(action)) return json({ error: "unknown_action" }, 400);
  if (!(await validToken(req, "admin"))) return json({ error: "unauthorized", message: "כניסת הניהול הסתיימה. אפשר להיכנס שוב לניהול." }, 401);
  const people = await loadPeople(u.origin);
  const optout = new Set(await getOptOut());
  const withMail = people.filter(p => validEmail(String(p.email || "").trim()) && !optout.has(norm(p.email)));

  // קישור לבחירת תחומי עניין לכל הנבחרת (הכפתור הקיים).
  if (action === "invite-all") {
    if (!mailConfigured()) return json({ error: "mail", message: "שליחת המיילים מהאתר עוד לא פעילה." }, 503);
    const rows = body.onlyNew === true ? withMail.filter(p => !(Array.isArray((p as any).topics) && (p as any).topics.length)) : withMail;
    const r = await sendAll(rows, p => linkMail(p, site));
    return json({ ok: true, sent: r.ok.length, failed: r.failed.map(p => p.name), reason: r.reason, total: rows.length });
  }

  // קוד אישי לכרטיס אחד: מוצג למנהלת המערכת, ונשלח במייל כשאפשר. fresh — קוד חדש שמבטל את הקודם.
  if (action === "code-send") {
    const p = people.find(x => x.id === clip(body.personId, 80));
    if (!p) return json({ error: "not_found", message: "הכרטיס לא נמצא בנבחרת." }, 404);
    const { code } = await codeFor(p.id, body.fresh === true);
    let sent = false, reason = "";
    if (body.mail !== false && validEmail(String(p.email || "").trim()) && mailConfigured()) {
      try { await codeMail(p, code, site, "invite"); sent = true; } catch (e) { reason = mailErrorHint(e); }
    }
    return json({ ok: true, code: formatCode(code), name: p.name, sent, reason });
  }

  // קוד אישי לכל הנבחרת (או רק למי שעוד אין לה/לו קוד).
  if (!mailConfigured()) return json({ error: "mail", message: "שליחת המיילים מהאתר עוד לא פעילה." }, 503);
  const rows = [];
  for (const p of withMail) if (body.onlyNew !== true || !(await hasCode(p.id))) rows.push(p);
  const r = await sendAll(rows, async p => { const { code } = await codeFor(p.id); await codeMail(p, code, site, "invite"); });
  return json({ ok: true, sent: r.ok.length, failed: r.failed.map(p => p.name), reason: r.reason, total: rows.length });
};

// מגבלת קצב: ניחוש קוד אינו מעשי (8 תווים מתוך 31, ועד 20 ניסיונות בדקה לכל כתובת).
export const config: Config = { path: "/api/member", rateLimit: { windowLimit: 20, windowSize: 60, aggregateBy: ["ip"] } };
