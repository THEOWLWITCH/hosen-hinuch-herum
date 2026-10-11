import type { Config } from "@netlify/functions";
import { communityCodeOK, issueMemberToken, json, looksHuman, memberFromToken, store, validToken } from "../lib/shared.mts";
import { THEME_LABELS, getOptOut, loadPeople, mailConfigured, mailErrorHint, personTopics, sendAll, sendMail, siteUrl } from "../lib/calls.mts";
import { addRequest } from "../lib/requests.mts";
import { createTeam, hashKey as teamHash, newKey as teamKey, saveTeam } from "../lib/teams.mts";
import {
  KINDS, STATUS_LABELS, type CollabStatus, clip, cleanKinds, createCollab, deleteCollab, getCollab, hashKey, isDate, listCollabs, newKey,
  offerOf, openCollab, ownerCollab, publicCollab, saveCollab,
} from "../lib/collab.mts";

// שידוכים בקהילה: מי מקדמת מה, בקשות לשיתוף פעולה והצטרפות.
const norm = (e: unknown) => String(e ?? "").trim().toLowerCase();
const validEmail = (e: string) => /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(e);

function esc(s: string) {
  return String(s || "").replace(/[&<>"]/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c] || c));
}

async function mail(to: string | undefined, subject: string, lines: string[], link?: [string, string]) {
  if (!to || !to.includes("@") || !mailConfigured()) return false;
  const html = `<div dir="rtl" style="font-family:Arial,sans-serif;max-width:600px;margin:auto;padding:8px 18px;color:#1d3445;line-height:1.7;font-size:15px">${lines.map(l => `<p>${esc(l)}</p>`).join("")}${link ? `<p><a href="${esc(link[1])}" style="display:inline-block;padding:10px 18px;border-radius:999px;background:#2f6e4f;color:#fff;text-decoration:none"><strong>${esc(link[0])}</strong></a></p>` : ""}<p style="font-size:12px;color:#6b7d88">בינה מלאכותית: חוסן-חינוך-חרום</p></div>`;
  try {
    await sendMail(to, subject, html, lines.join("\n\n") + (link ? `\n\n${link[0]}: ${link[1]}` : ""));
    return true;
  } catch (e) {
    console.error("collab mail failed", mailErrorHint(e));
    return false;
  }
}

// קישור אישי לעדכון "מה אני יכולה לקדם" (60 יום). זורק שגיאה אם השליחה נכשלה.
async function offerMail(p: { id: string; name: string; email?: string }, site: string) {
  const link = `${site}/people#my-offer=${await issueMemberToken(p.id)}`;
  const lines = [
    `שלום ${p.name},`,
    "בעמוד הנבחרת באתר הקהילה נפתח אזור חדש: 🤝 שידוכים בקהילה. רואים בו מי מקדמת מה, מי מתאימה לעבודה משותפת, ובקשות פתוחות לשיתוף פעולה שאפשר להצטרף אליהן.",
    "התשובות מהטבלה של קבוצת העניין כבר נמצאות שם. בקישור הזה אפשר לבדוק, לעדכן ולהוסיף: לבחור את סוגי הפעילות שתרצי לקדם ולכתוב כמה מילים על הרעיון או הנושא.",
    "הקישור אישי ובתוקף 60 יום. כדאי לא להעביר אותו הלאה.",
  ];
  const html = `<div dir="rtl" style="font-family:Arial,sans-serif;max-width:600px;margin:auto;padding:8px 18px;color:#1d3445;line-height:1.7;font-size:15px">${lines.map(l => `<p>${esc(l)}</p>`).join("")}<p><a href="${esc(link)}" style="display:inline-block;padding:10px 18px;border-radius:999px;background:#2f6e4f;color:#fff;text-decoration:none"><strong>✏️ לעדכון מה שאני יכולה לקדם</strong></a></p><p><a href="${esc(site)}/people" style="color:#17649a">לשידוכים בעמוד הנבחרת</a></p><p style="font-size:12px;color:#6b7d88">בינה מלאכותית: חוסן-חינוך-חרום</p></div>`;
  await sendMail(String(p.email), "מה אני יכולה לקדם: שידוכים בקהילה", html, lines.join("\n\n") + `\n\nלעדכון: ${link}`);
}

const manageLink = (site: string, cid: string, key: string) => `${site}/people#collab=${cid}.${key}`;
const kindLabels = (kinds: string[]) => kinds.map(k => KINDS.find(x => x.key === k)?.label || k).join(", ");

export default async (req: Request) => {
  const u = new URL(req.url);
  const site = siteUrl(u.origin);

  if (req.method === "GET") {
    // חברת נבחרת: הכרטיס שלה, לעדכון "מה אני יכולה לקדם".
    if (u.searchParams.get("me") === "1") {
      const pid = await memberFromToken(clip(req.headers.get("x-member-token"), 400));
      if (!pid) return json({ error: "forbidden", message: "הקישור לא תקין או שפג תוקפו. אפשר לבקש קישור חדש." }, 403);
      const p = (await loadPeople(u.origin)).find(x => x.id === pid);
      if (!p) return json({ error: "not_found", message: "הכרטיס לא נמצא בנבחרת." }, 404);
      return json({ id: p.id, name: p.name, institution: p.institution || "", offer: offerOf(p as any), kinds: KINDS });
    }
    // המבקשת: ניהול הבקשה בקישור הסודי.
    const cid = clip(u.searchParams.get("id"), 80);
    if (cid) {
      const c = await openCollab(cid, clip(req.headers.get("x-collab-key"), 200));
      if (!c) return json({ error: "forbidden", message: "הקישור לניהול הבקשה לא תקין." }, 403);
      return json(ownerCollab(c));
    }
    const admin = u.searchParams.get("admin") === "1" && (await validToken(req, "admin"));
    const [people, collabs] = await Promise.all([loadPeople(u.origin), listCollabs()]);
    return json({
      kinds: KINDS,
      themes: THEME_LABELS,
      statuses: STATUS_LABELS,
      people: people.map(p => {
        const o = offerOf(p as any);
        return {
          id: p.id, name: p.name, institution: p.institution || "", email: String(p.email || "").trim(), phone: String(p.phone || "").trim(),
          kinds: o.kinds, text: o.text, themes: personTopics(p),
        };
      }),
      requests: collabs.filter(c => admin || c.status !== "closed").map(publicCollab),
    });
  }

  if (req.method !== "POST") return json({ error: "method" }, 405);
  const body = await req.json().catch(() => ({} as any));
  const action = clip(body.action, 40);

  // ----- בקשה חדשה לשיתוף פעולה: מתפרסמת מיד, בקוד הקהילה -----
  if (action === "create") {
    if (!looksHuman(body)) return json({ ok: true });
    if (!communityCodeOK(body.communityCode)) return json({ error: "invalid_code", message: "קוד הקהילה לא תואם. אפשר לבדוק ולנסות שוב." }, 401);
    const f = {
      name: clip(body.name, 160), email: clip(body.email, 240), personId: clip(body.personId, 80),
      title: clip(body.title, 200), kinds: cleanKinds(body.kinds), description: clip(body.description, 3000), need: clip(body.need, 800), deadline: clip(body.deadline, 10),
    };
    const missing = [!f.name && "שם", !validEmail(f.email) && "מייל תקין", !f.title && "כותרת", !f.kinds.length && "לפחות סוג פעילות אחד", f.description.length < 10 && "כמה מילים על הרעיון"].filter(Boolean);
    if (missing.length) return json({ error: "missing", message: `כדי לפרסם, נשמח ל: ${missing.join(", ")}.` }, 400);
    if (f.deadline && !isDate(f.deadline)) f.deadline = "";
    const key = newKey();
    const c = await saveCollab(createCollab(f, await hashKey(key)));
    const link = manageLink(site, c.id, key);
    const mailed = await mail(f.email, `הבקשה שלך לשיתוף פעולה פורסמה: ${c.title}`,
      [`שלום ${f.name},`, `הבקשה "${c.title}" פורסמה בעמוד הנבחרת, בלשונית השידוכים.`, "כשמישהי מצטרפת, יגיע אלייך מייל עם הפרטים שלה.", "בקישור הזה אפשר לראות מי הצטרפה, לעדכן את הבקשה, לסגור אותה, או לפתוח קבוצת משימה עם סביבת עבודה משותפת. כדאי לשמור אותו."],
      ["ניהול הבקשה", link]);
    await addRequest({
      type: "idea", name: f.name, email: f.email, subject: `🤝 בקשה לשיתוף פעולה: ${c.title}`,
      body: [`סוג הפעילות: ${kindLabels(c.kinds)}`, `הרעיון: ${c.description}`, c.need ? `את מי מחפשות: ${c.need}` : "", c.deadline ? `עד: ${c.deadline}` : ""].filter(Boolean).join("\n"),
      link: `/people#collab-req-${c.id}`, data: { collabId: c.id },
    }).catch(() => {});
    return json({ ok: true, id: c.id, key, link, mailed });
  }

  // ----- הצטרפות לבקשה: בלי קוד, עם הגנה מספאם -----
  if (action === "join") {
    if (!looksHuman(body)) return json({ ok: true });
    const name = clip(body.name, 160), email = clip(body.email, 240), note = clip(body.note, 800);
    if (!name || !validEmail(email)) return json({ error: "missing", message: "כדי להצטרף, נשמח לשם ולמייל." }, 400);
    const c = await getCollab(clip(body.id, 80));
    if (!c || c.status === "closed") return json({ error: "not_found", message: "הבקשה לא נמצאה או שכבר נסגרה." }, 404);
    if (norm(email) === norm(c.requester.email)) return json({ error: "own", message: "זו הבקשה שלך. את הניהול שלה עושים בקישור שנשלח אלייך." }, 400);
    if (c.joiners.some(j => norm(j.email) === norm(email))) return json({ ok: true, already: true });
    c.joiners.push({ id: crypto.randomUUID().slice(0, 8), name, email, note, at: new Date().toISOString() });
    c.joiners = c.joiners.slice(-60);
    await saveCollab(c);
    const mailed = await mail(c.requester.email, `${name} רוצה להצטרף: ${c.title}`,
      [`שלום ${c.requester.name},`, `${name} רוצה להצטרף לבקשה שלך "${c.title}".`, note ? `מה היא כתבה: ${note}` : "", `אפשר לכתוב לה ישירות: ${email}`, "את כל המצטרפות אפשר לראות בקישור הניהול של הבקשה."].filter(Boolean));
    await mail(email, `הצטרפת: ${c.title}`,
      [`שלום ${name},`, `ההצטרפות שלך לבקשה "${c.title}" נשלחה אל ${c.requester.name}.`, "היא תחזור אלייך כדי לתאם את ההמשך."]);
    // בלי שליחת מיילים מהאתר: המצטרפת מקבלת את המייל של המבקשת, כדי לפתוח טיוטה בעצמה.
    return json({ ok: true, mailed, ...(mailed ? {} : { requesterEmail: c.requester.email, requesterName: c.requester.name }) });
  }

  // ----- "מה אני יכולה לקדם": קישור אישי למייל שבכרטיס -----
  if (action === "offer-link") {
    if (!looksHuman(body)) return json({ ok: true, sent: true });
    const email = norm(body.email);
    if (!email.includes("@")) return json({ error: "invalid", message: "נשמח לכתובת המייל שבכרטיס שלך." }, 400);
    const p = (await loadPeople(u.origin)).find(x => norm(x.email) === email);
    if (!p) return json({ error: "not_member", message: "המייל הזה לא מופיע בכרטיס בנבחרת. אם הכרטיס שלך רשום עם מייל אחר, כדאי לנסות אותו. עוד לא בנבחרת? אפשר לבקש להצטרף בכפתור \"🙋 הצטרפות\"." }, 404);
    if (!mailConfigured()) return json({ error: "mail", message: "שליחת המיילים מהאתר עוד לא פעילה. אפשר לכתוב למנהלת הקהילה, והיא תעדכן את הכרטיס." }, 503);
    try {
      await offerMail(p, site);
      return json({ ok: true, sent: true });
    } catch (e) {
      return json({ error: "mail", message: "השליחה לא הצליחה. " + mailErrorHint(e) }, 502);
    }
  }

  // מנהלת המערכת: קישור אישי לעדכון "מה אני יכולה לקדם" לכל חברות הנבחרת שיש להן מייל.
  if (action === "offer-invite-all") {
    if (!(await validToken(req, "admin"))) return json({ error: "unauthorized" }, 401);
    if (!mailConfigured()) return json({ error: "mail", message: "שליחת המיילים מהאתר עוד לא פעילה (חסרים GMAIL_USER ו-GMAIL_APP_PASSWORD ב-Netlify)." }, 503);
    const optout = new Set(await getOptOut());
    const people = (await loadPeople(u.origin)).filter(p => validEmail(String(p.email || "").trim()) && !optout.has(norm(p.email)));
    const rows = body.onlyNew === true ? people.filter(p => { const o = offerOf(p as any); return !o.kinds.length && !o.text; }) : people;
    const r = await sendAll(rows, p => offerMail(p, site));
    return json({ ok: true, sent: r.ok.length, failed: r.failed.map(p => p.name), reason: r.reason, total: rows.length });
  }

  if (action === "offer-save") {
    const admin = await validToken(req, "admin");
    const pid = admin ? clip(body.personId, 80) : await memberFromToken(clip(req.headers.get("x-member-token"), 400));
    if (!pid) return json({ error: "forbidden", message: "הקישור לא תקין או שפג תוקפו. אפשר לבקש קישור חדש." }, 403);
    const p = (await loadPeople(u.origin)).find(x => x.id === pid);
    if (!p) return json({ error: "not_found", message: "הכרטיס לא נמצא בנבחרת." }, 404);
    const offer = { kinds: cleanKinds(body.kinds), text: clip(body.text, 1500), updatedAt: new Date().toISOString() };
    if (!offer.kinds.length && !offer.text) return json({ error: "missing", message: "נשמח לסוג פעילות אחד לפחות, או לכמה מילים." }, 400);
    const { photoUrl, ...stored } = p as any;
    await store("hosen-data").setJSON(`people/${pid}.json`, { ...stored, offer, updatedAt: offer.updatedAt });
    return json({ ok: true, offer });
  }

  // ----- מנהלת המערכת -----
  if (action === "admin-delete") {
    if (!(await validToken(req, "admin"))) return json({ error: "unauthorized" }, 401);
    const c = await getCollab(clip(body.id, 80));
    if (!c) return json({ error: "not_found" }, 404);
    await deleteCollab(c.id);
    return json({ ok: true });
  }

  // ----- ניהול הבקשה: רק עם המפתח -----
  const c = await openCollab(clip(body.id, 80), clip(req.headers.get("x-collab-key"), 200));
  if (!c) return json({ error: "forbidden", message: "הקישור לניהול הבקשה לא תקין." }, 403);

  switch (action) {
    case "meta": {
      if (body.status && STATUS_LABELS[body.status as CollabStatus]) c.status = body.status;
      if (body.title !== undefined) c.title = clip(body.title, 200) || c.title;
      if (body.description !== undefined) c.description = clip(body.description, 3000) || c.description;
      if (body.need !== undefined) c.need = clip(body.need, 800);
      if (body.deadline !== undefined) c.deadline = isDate(body.deadline) ? String(body.deadline) : "";
      if (body.kinds !== undefined) { const k = cleanKinds(body.kinds); if (k.length) c.kinds = k; }
      break;
    }
    case "joiner-remove":
      c.joiners = c.joiners.filter(j => j.id !== clip(body.joinerId, 20));
      break;
    case "team": {
      // מעבר לקבוצת משימה: סביבת עבודה משותפת (סעיפים, משימות, הודעות וקישורים), עם כל המצטרפות.
      if (c.teamId) return json({ error: "exists", message: "כבר נפתחה קבוצת משימה לבקשה הזאת. הקישור אליה נשלח במייל." }, 409);
      const key = teamKey();
      const t = createTeam({ title: c.title, summary: c.description, need: c.need, deadline: c.deadline, leadName: c.requester.name, leadEmail: c.requester.email }, await teamHash(key));
      const at = new Date().toISOString();
      for (const j of c.joiners) t.members.push({ name: j.name, email: j.email, role: "", joinedAt: at });
      t.status = "writing";
      await saveTeam(t);
      const link = `${site}/calls#team=${t.id}.${key}`;
      c.teamId = t.id;
      c.status = "matched";
      await saveCollab(c);
      let mailed = 0;
      for (const m of t.members) {
        if (await mail(m.email, `סביבת העבודה של "${t.title}"`,
          [`שלום ${m.name},`, `${c.requester.name} פתחה קבוצת משימה לשיתוף הפעולה "${t.title}".`, "זה הקישור לסביבת העבודה המשותפת: סעיפים, משימות, הודעות וקישורים. רק מי שיש לה את הקישור יכולה להיכנס, ולכן כדאי לשמור אותו."],
          ["כניסה לסביבת העבודה", link])) mailed++;
      }
      return json({ ok: true, link, mailed, collab: ownerCollab(c) });
    }
    default:
      return json({ error: "unknown_action" }, 400);
  }

  return json({ ok: true, collab: ownerCollab(await saveCollab(c)) });
};

export const config: Config = { path: "/api/collab", rateLimit: { windowLimit: 60, windowSize: 60, aggregateBy: ["ip"] } };
