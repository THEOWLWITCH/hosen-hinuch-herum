import type { Config } from "@netlify/functions";
import { id, json, looksHuman, store, validToken } from "../lib/shared.mts";
import { loadPeople } from "../lib/calls.mts";
import { mailConfigured, mailErrorHint, sendMail, siteUrl } from "../lib/calls.mts";
import { TYPE_LABELS, addReply, addRequest, getRequest, listRequests, updateRequest } from "../lib/requests.mts";

const clip = (v: unknown, n: number) => String(v ?? "").trim().slice(0, n);
const SOURCE_CATEGORIES = ["research-institute", "research-preparedness", "research-resilience", "research-continuity", "research-teachers", "research-tech", "publications", "professional", "policy", "research-tools"];

export default async (req: Request) => {
  if (req.method === "GET") {
    if (!(await validToken(req, "admin"))) return json({ error: "unauthorized" }, 401);
    return json({ requests: await listRequests(), types: TYPE_LABELS });
  }
  if (req.method !== "POST") return json({ error: "method" }, 405);
  const body = await req.json().catch(() => ({} as any));

  // העתק של טפסי האתר (פידבק, הצעת שיתוף פעולה, הצעת מקור) — כדי שיופיעו גם בתיבת הפניות.
  if (body.action === "add") {
    if (!looksHuman(body)) return json({ ok: true });
    const type = ["feedback", "idea", "source"].includes(body.type) ? body.type : "feedback";
    const fields = body.fields && typeof body.fields === "object" ? body.fields : {};
    const pick = (...keys: string[]) => keys.map(k => clip(fields[k], 300)).find(Boolean) || "";
    const name = pick("name", "submitterName", "fullName", "שם");
    const email = pick("email", "mail", "מייל");
    const kind = pick("type", "request_type", "suggestionType", "category");
    const lead = pick("title", "subject", "topic") || pick("prompt", "details", "message", "offer").slice(0, 90);
    const subject = [kind, lead].filter(Boolean).join(": ");
    const text = Object.entries(fields)
      .filter(([k, v]) => !["name", "email", "submitterName", "communityCode", "bot-field", "form-name", "website"].includes(k) && String(v || "").trim())
      .map(([k, v]) => `${k}: ${clip(v, 2000)}`).join("\n").slice(0, 6000);
    await addRequest({ type, name, email, subject, body: text, link: type === "source" ? "/articles" : "" });
    return json({ ok: true });
  }

  if (!(await validToken(req, "admin"))) return json({ error: "unauthorized" }, 401);
  // אישור בקשת הצטרפות: כרטיס חדש בנבחרת, עם המייל — וכך גם בכל רשימות השליחה האוטומטית.
  if (body.action === "approve-join") {
    const r = await getRequest(clip(body.id, 60));
    if (!r || r.type !== "join" || !r.data) return json({ error: "not_found", message: "הבקשה לא נמצאה." }, 404);
    if (r.status === "done" && r.note.includes("נוסף לנבחרת")) return json({ ok: true, already: true });
    const d = r.data as any, now = new Date().toISOString();
    const st = store("hosen-data");
    const people = await loadPeople(new URL(req.url).origin);
    const email = clip(d.email, 240), topics: string[] = Array.isArray(d.topics) ? d.topics : [];
    // כבר בנבחרת עם אותו מייל: לא יוצרים כרטיס כפול — רק מוסיפים את תחומי העניין.
    const same = people.find(p => String(p.email || "").trim().toLowerCase() === email.toLowerCase());
    let person: any;
    if (same) {
      const { photoUrl, ...stored } = same as any;
      person = { ...stored, topics: [...new Set([...(stored.topics || []), ...topics])], updatedAt: now };
    } else {
      person = {
        id: id(), name: clip(d.name, 160), institution: clip(d.affiliation, 220), description: clip(d.expertise, 6000),
        email, phone: clip(d.phone, 80), motto: "", topics,
        order: people.reduce((m, p) => Math.max(m, Number(p.order || 0)), 0) + 1, createdAt: now, updatedAt: now, deleted: false,
      };
    }
    await st.setJSON(`people/${person.id}.json`, person);
    await updateRequest(r.id, { status: "done", note: `נוסף לנבחרת ${new Date().toLocaleDateString("he-IL")}${r.note ? " · " + r.note : ""}` });
    return json({ ok: true, merged: !!same, person: { id: person.id, name: person.name } });
  }

  // פרסום מקור שהוצע ("שליחת מאמר או מכון מחקר"): המקור עולה לאתר, והפנייה מסומנת כטופלה.
  if (body.action === "publish-source") {
    const r = await getRequest(clip(body.id, 60));
    if (!r || r.type !== "source") return json({ error: "not_found", message: "הפנייה לא נמצאה." }, 404);
    const it = body.item || {};
    const category = clip(it.category, 60);
    if (!SOURCE_CATEGORIES.includes(category)) return json({ error: "invalid", message: "נא לבחור לאן לפרסם." }, 400);
    const item = {
      title: clip(it.title, 500), authors: clip(it.authors, 700), year: clip(it.year, 20), source: clip(it.source, 500),
      url: clip(it.url, 1200), description: clip(it.description, 5000), whyImportant: clip(it.whyImportant, 5000),
    };
    if (!item.title) return json({ error: "missing", message: "חסרה כותרת." }, 400);
    if (!/^https?:\/\//i.test(item.url)) return json({ error: "missing", message: "חסר קישור תקין." }, 400);
    if (category.startsWith("research-") && category !== "research-institute" && (!item.authors || !item.year || !item.source))
      return json({ error: "missing", message: "במדורי המחקר צריך מחברים, שנה ומקור." }, 400);
    const now = new Date().toISOString();
    const res = { ...item, id: id(), category, type: "link", active: true, gallery: [], suggestedBy: r.name || "", createdAt: now, updatedAt: now };
    await store("hosen-data").setJSON(`resources/${res.id}.json`, res);
    await updateRequest(r.id, { status: "done", note: `פורסם באתר ${new Date().toLocaleDateString("he-IL")}${r.note ? " · " + r.note : ""}` });
    return json({ ok: true, resource: { id: res.id, title: res.title, category } });
  }

  // תשובה במייל למי שפנה/תה — נשלחת מהאתר (Gmail) ונשמרת בהיסטוריית הפנייה.
  if (body.action === "reply") {
    const r = await getRequest(clip(body.id, 60));
    if (!r) return json({ error: "not_found", message: "הפנייה לא נמצאה." }, 404);
    if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(r.email || "")) return json({ error: "no_email", message: "אין לפנייה הזו כתובת מייל." }, 400);
    const subject = clip(body.subject, 300), text = String(body.text ?? "").trim().slice(0, 8000);
    if (!subject || text.length < 2) return json({ error: "missing", message: "חסרים נושא או טקסט." }, 400);
    if (!mailConfigured()) return json({ error: "mail", message: "שליחת המיילים מהאתר לא פעילה (חיבור Gmail)." }, 503);
    const esc = (s: string) => s.replace(/[&<>"]/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c] || c));
    const site = siteUrl(new URL(req.url).origin);
    const html = `<div dir="rtl" style="font-family:Arial,sans-serif;max-width:600px;margin:auto;padding:8px 18px;color:#1d3445;line-height:1.7;font-size:15px">${text.split(/\n{2,}/).map(p => `<p>${esc(p).replace(/\n/g, "<br>")}</p>`).join("")}<p style="margin-top:22px"><img src="${site}/assets/community-logo-email.jpg" alt="בינה מלאכותית: חוסן-חינוך-חרום" width="300" style="display:block;width:300px;max-width:100%;height:auto;border:0"></p></div>`;
    try { await sendMail(r.email.trim(), subject, html, text); }
    catch (e) { return json({ error: "mail", message: "השליחה לא הצליחה. " + mailErrorHint(e) }, 502); }
    const v = await addReply(r.id, { subject, text }, clip(body.status, 20));
    return json({ ok: true, request: v });
  }

  if (body.action === "update") {
    const ids: string[] = Array.isArray(body.ids) ? body.ids.slice(0, 200) : [clip(body.id, 60)];
    const rows = [];
    for (const rid of ids) { const r = await updateRequest(clip(rid, 60), { status: body.status, note: body.note }); if (r) rows.push(r); }
    return json({ ok: true, updated: rows.length });
  }
  return json({ error: "unknown_action" }, 400);
};

export const config: Config = { path: "/api/requests", rateLimit: { windowLimit: 30, windowSize: 60, aggregateBy: ["ip"] } };
