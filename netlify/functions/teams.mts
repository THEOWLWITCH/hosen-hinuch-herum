import type { Config } from "@netlify/functions";
import { json, looksHuman, validToken } from "../lib/shared.mts";
import { communityOK } from "../lib/member-code.mts";
import { bareTitle, getCall, isOpen, israelToday, mailConfigured, sendMail, siteUrl } from "../lib/calls.mts";
import {
  TEAM_STATUS, type Team, type TeamAccess, type TeamStatus, clip, cleanUrl, createTeam, deleteTeam, getTeam, hashKey, issueKey, listTeams, newItemId, newKey,
  openTeamAccess, publicTeam, saveTeam, workspaceTeam,
} from "../lib/teams.mts";

// מה שסביבת העבודה מקבלת: הקבוצה, התפקיד של מי שנכנס/ה (מוביל/ה או חבר/ה) והשם שלו/ה.
const view = (t: Team, a: Pick<TeamAccess, "role" | "me">) => ({ ...workspaceTeam(t), role: a.role, me: a.me });

// פעולות שרק המוביל/ה עושה: מחיקה, ניהול הקבוצה והחברים/ות, אישור בקשות.
const LEAD_ONLY = new Set(["section-remove", "task-remove", "link-remove", "meta", "request-approve", "request-decline", "delete"]);


function workspaceLink(site: string, t: Team, key: string) {
  return `${site}/match#team=${t.id}.${key}`;
}

function sameEmail(a: unknown, b: unknown) {
  const n = (s: unknown) => String(s ?? "").trim().toLowerCase();
  return !!n(a) && n(a) === n(b);
}

function esc(s: string) {
  return String(s || "").replace(/[&<>"]/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c] || c));
}

async function mail(to: string | undefined, subject: string, lines: string[], link?: [string, string]) {
  if (!to || !to.includes("@") || !mailConfigured()) return false;
  const html = `<div dir="rtl" style="font-family:Arial,sans-serif;max-width:600px;margin:auto;padding:8px 18px;color:#1d3445;line-height:1.7;font-size:15px">${lines.map(l => `<p>${esc(l)}</p>`).join("")}${link ? `<p><a href="${esc(link[1])}" style="color:#17649a"><strong>${esc(link[0])}</strong></a></p>` : ""}<p style="font-size:12px;color:#6b7d88">בינה מלאכותית: חוסן-חינוך-חרום</p></div>`;
  try {
    await sendMail(to, subject, html, lines.join("\n\n") + (link ? `\n\n${link[0]}: ${link[1]}` : ""));
    return true;
  } catch {
    return false;
  }
}

export default async (req: Request) => {
  const u = new URL(req.url);
  const site = siteUrl(u.origin);

  if (req.method === "GET") {
    if (u.searchParams.get("admin") === "1") {
      if (!(await validToken(req, "admin"))) return json({ error: "unauthorized" }, 401);
      return json((await listTeams()).map(t => ({ ...publicTeam(t), leadEmail: t.lead.email || "", updatedAt: t.updatedAt })));
    }
    const teamId = clip(u.searchParams.get("id"), 80);
    if (teamId) {
      const a = await openTeamAccess(teamId, clip(req.headers.get("x-team-key"), 200));
      if (!a) return json({ error: "forbidden", message: "הקישור לסביבת העבודה לא תקין." }, 403);
      return json(view(a.team, a));
    }
    const all = (await listTeams()).filter(t => t.status !== "closed");
    return json(all.map(publicTeam));
  }

  if (req.method !== "POST") return json({ error: "method" }, 405);
  const body = await req.json().catch(() => ({} as any));
  const action = clip(body.action, 40);

  // ----- הקמת קבוצה ובקשת הצטרפות: בקוד הקהילה -----
  if (action === "create" || action === "join") {
    if (!looksHuman(body)) return json({ ok: true });
    // הקמת קבוצה מתפרסמת מיד — בקוד הקהילה. בקשת הצטרפות מגיעה לאישור המובילה — בלי קוד.
    if (action === "create" && !(await communityOK(req, body.communityCode))) return json({ error: "invalid_code", message: "הקוד שגוי. אפשר להקליד את קוד הקהילה או את הקוד האישי." }, 401);
    const name = clip(body.name, 160);
    const email = clip(body.email, 240);
    if (!name || !email.includes("@")) return json({ error: "missing_fields", message: "נא למלא שם ומייל." }, 400);

    if (action === "create") {
      let callTitle = "", funder = clip(body.funder, 200), deadline = clip(body.deadline, 10);
      const callId = clip(body.callId, 80);
      if (callId) {
        const c = await getCall(callId);
        if (!c || !isOpen(c, israelToday())) return json({ error: "not_found", message: "הקול הקורא לא נמצא או שכבר נסגר." }, 404);
        callTitle = c.title; funder = funder || c.funder || ""; deadline = deadline || c.endDate || "";
      }
      const title = clip(body.title, 200) || (callTitle ? `הגשה משותפת: ${bareTitle(callTitle)}` : "");
      if (!title) return json({ error: "missing_fields", message: "נא לתת שם לקבוצה." }, 400);
      const key = newKey();
      const t = createTeam({ title, summary: clip(body.summary, 1500), need: clip(body.need, 600), callId, callTitle, funder, deadline, leadName: name, leadEmail: email, origin: clip(body.origin, 20) }, await hashKey(key));
      t.keyOwners = { [t.keyHash]: name };
      await saveTeam(t);
      const link = workspaceLink(site, t, key);
      return json({ ok: true, id: t.id, key, link, mailed: false });
    }

    const t = await getTeam(clip(body.id, 80));
    if (!t || t.status === "closed") return json({ error: "not_found", message: "הקבוצה לא נמצאה." }, 404);
    if (t.members.some(m => m.name === name) || t.requests.some(r => r.name === name))
      return json({ ok: true, already: true });
    t.requests.push({ id: newItemId(), name, email, note: clip(body.note, 600), at: new Date().toISOString() });
    t.requests = t.requests.slice(-40);
    await saveTeam(t);
    await mail(t.lead.email, `בקשת הצטרפות לקבוצה "${t.title}"`,
      [`שלום ${t.lead.name},`, `${name} ביקשה להצטרף לקבוצת המשימה "${t.title}".`, body.note ? `מה היא כתבה: ${clip(body.note, 600)}` : "", "אפשר לאשר את הבקשה בסביבת העבודה של הקבוצה."].filter(Boolean),
      ["לאתר", `${site}/calls`]);
    return json({ ok: true });
  }

  // ----- הצטרפות ישירה לצוות: חברות הקהילה, בקוד הקהילה -----
  if (action === "join-direct") {
    if (!looksHuman(body)) return json({ ok: true });
    if (!(await communityOK(req, body.communityCode))) return json({ error: "invalid_code", message: "הקוד שגוי. אפשר להקליד את קוד הקהילה או את הקוד האישי." }, 401);
    const name = clip(body.name, 160);
    const email = clip(body.email, 240);
    if (!name || !email.includes("@")) return json({ error: "missing_fields", message: "נשמח לשם ולמייל." }, 400);
    const t = await getTeam(clip(body.id, 80));
    if (!t || t.status === "closed") return json({ error: "not_found", message: "הקבוצה לא נמצאה." }, 404);
    const at = new Date().toISOString();
    // מי שכבר בצוות (לפי שם או מייל) לא נוסף/ה שוב: מקבל/ת קישור חדש ונכנס/ת.
    const existing = t.members.find(m => m.name === name || (!!m.email && sameEmail(m.email, email)));
    if (!existing) t.members.push({ name, email, role: clip(body.role, 120), joinedAt: at });
    else if (!existing.email) existing.email = email;
    t.requests = t.requests.filter(r => r.name !== name);
    // הרשאת ניהול רק למי שמזוהה במייל של המוביל/ה; כל השאר חברים/ות בצוות.
    const isLead = !!t.lead.email && sameEmail(t.lead.email, email);
    const key = await issueKey(t, isLead ? "lead" : "member", existing?.name || name);
    await saveTeam(t);
    const link = workspaceLink(site, t, key);
    // בלי מייל: מי שמצטרף/ת נכנס/ת מיד, ובפעם הבאה במייל ובקוד הקהילה. מיילים יוצאים רק להזמנות.
    return json({ ok: true, id: t.id, key, link, mailed: false, name: existing?.name || name, returning: !!existing });
  }

  // ----- כניסה חוזרת: מי שכבר בצוות (המוביל/ה או חבר/ה), ממכשיר או מדפדפן אחר -----
  // הזיהוי לפי המייל שאיתו הקים/ה את הקבוצה או הצטרף/ה, יחד עם קוד הקהילה או הקוד האישי.
  if (action === "enter") {
    if (!looksHuman(body)) return json({ ok: true });
    if (!(await communityOK(req, body.communityCode))) return json({ error: "invalid_code", message: "הקוד שגוי. אפשר להקליד את קוד הקהילה או את הקוד האישי." }, 401);
    const email = clip(body.email, 240);
    if (!email.includes("@")) return json({ error: "missing_fields", message: "נשמח למייל שאיתו נכנסת לקבוצה." }, 400);
    const t = await getTeam(clip(body.id, 80));
    if (!t || t.status === "closed") return json({ error: "not_found", message: "הקבוצה לא נמצאה." }, 404);
    const m = t.members.find(x => !!x.email && sameEmail(x.email, email))
      || (t.lead.email && sameEmail(t.lead.email, email) ? t.members.find(x => x.name === t.lead.name) || { name: t.lead.name, email: t.lead.email, joinedAt: t.createdAt } : null);
    if (!m) return json({ error: "not_member", message: "המייל הזה לא מופיע ברשימת הצוות. אם נכנסת עם מייל אחר, אפשר לנסות אותו. מי שעדיין לא בצוות יכול/ה להצטרף בכפתור \"הצטרפות לצוות\"." }, 404);
    if (!t.members.includes(m as any)) t.members.unshift(m as any);
    const isLead = !!t.lead.email && sameEmail(t.lead.email, email);
    const key = await issueKey(t, isLead ? "lead" : "member", m.name);
    await saveTeam(t);
    return json({ ok: true, id: t.id, key, link: workspaceLink(site, t, key), name: m.name });
  }

  // ----- ניהול מערכת -----
  // מנהלת המערכת: הוצאת חבר/ה מקבוצה. כשיוצא/ת המוביל/ה, ההובלה עוברת לחבר/ה הבא/ה ברשימה.
  if (action === "admin-member-remove") {
    if (!(await validToken(req, "admin"))) return json({ error: "unauthorized" }, 401);
    const t = await getTeam(clip(body.id, 80));
    if (!t) return json({ error: "not_found" }, 404);
    const m = t.members.find(x => x.name === clip(body.member, 160));
    if (!m) return json({ error: "not_found", message: "השם לא נמצא ברשימת הקבוצה." }, 404);
    if (m.name === t.lead.name) {
      const next = t.members.find(x => x !== m);
      if (!next) return json({ error: "last_member", message: "זה/זו החבר/ה היחיד/ה בקבוצה. אפשר למחוק את הקבוצה." }, 409);
      t.lead = { name: next.name, email: next.email || "" };
    }
    t.members = t.members.filter(x => x !== m);
    t.messages.push({ id: newItemId(), name: m.name, text: "יצא/ה מהקבוצה.", at: new Date().toISOString() });
    await saveTeam(t);
    return json({ ok: true, lead: t.lead.name });
  }

  if (action === "admin-delete" || action === "admin-rekey") {
    if (!(await validToken(req, "admin"))) return json({ error: "unauthorized" }, 401);
    const t = await getTeam(clip(body.id, 80));
    if (!t) return json({ error: "not_found" }, 404);
    if (action === "admin-delete") { await deleteTeam(t.id); return json({ ok: true }); }
    const key = newKey();
    await saveTeam({ ...t, keyHash: await hashKey(key), keysV2: true, keyOwners: { ...(t.keyOwners || {}), [await hashKey(key)]: t.lead.name } });
    return json({ ok: true, link: workspaceLink(site, t, key) });
  }

  // ----- פעולות בתוך סביבת העבודה: רק עם המפתח של הקבוצה -----
  const key = clip(req.headers.get("x-team-key"), 200);
  const access = await openTeamAccess(clip(body.id, 80), key);
  if (!access) return json({ error: "forbidden", message: "הקישור לסביבת העבודה לא תקין." }, 403);
  const t = access.team;
  const isLead = access.role === "lead";
  if (LEAD_ONLY.has(action) && !isLead)
    return json({ error: "lead_only", message: `רק מי שמוביל/ה את הקבוצה (${t.lead.name}) יכול/ה לעשות את זה. אפשר לכתוב, להוסיף ולהשתתף בדיון.` }, 403);
  const who = access.me || clip(body.name, 160) || "חבר/ת קבוצה";
  const at = new Date().toISOString();
  const norm = (s: unknown) => String(s ?? "").trim().toLowerCase();

  // יציאה מהמרחב: החבר/ה יוצא/ת מרשימת הקבוצה, והדפדפן שוכח את הקישור.
  // מוביל/ה שיוצא/ת מעביר/ה את ההובלה לחבר/ה אחר/ת. מוביל/ה יחיד/ה: מוחקים את המרחב.
  if (action === "leave") {
    const m = t.members.find(x => x.name === clip(body.member, 160));
    if (!m) return json({ ok: true, left: false });
    // חבר/ה יוצא/ת רק בשם שלו/ה. המוביל/ה יכול/ה להוציא כל אחד/ת.
    if (!isLead && (m.name === t.lead.name || (access.me && m.name !== access.me)))
      return json({ error: "forbidden", message: "אפשר לצאת מהקבוצה רק בשם שלך." }, 403);
    // הקישורים של מי שיוצא/ת מפסיקים לעבוד.
    const owners = t.keyOwners || {};
    const mine = new Set(Object.keys(owners).filter(h => owners[h] === m.name));
    if (!isLead) mine.add(access.hash);
    t.memberKeys = (t.memberKeys || []).filter(h => !mine.has(h));
    if (m.name === t.lead.name) {
      const next = t.members.find(x => x !== m && x.name === clip(body.newLead, 160));
      if (!next) {
        if (t.members.length === 1) return json({ error: "last_member", message: "את/ה החבר/ה היחיד/ה במרחב. אם הוא כבר לא נחוץ, אפשר למחוק אותו." }, 409);
        return json({ error: "need_lead", message: "לפני היציאה, נשמח לבחירה: מי מוביל/ה את הקבוצה מעכשיו." }, 400);
      }
      t.lead = { name: next.name, email: next.email || "" };
      next.role = next.role || "מוביל/ה";
      // ההובלה עוברת: הקישורים של המוביל/ה הקודם/ת נסגרים, והקישורים של המוביל/ה החדש/ה מקבלים הרשאת ניהול.
      const nextKeys = Object.keys(owners).filter(h => owners[h] === next.name);
      t.memberKeys = (t.memberKeys || []).filter(h => !nextKeys.includes(h));
      t.leadKeys = nextKeys;
      t.keyHash = await hashKey(newKey());
      t.keysV2 = true;
      await mail(next.email, `את/ה מוביל/ה עכשיו את קבוצת המשימה: ${t.title}`,
        [`שלום ${next.name},`, `${m.name} יצא/ה מקבוצת המשימה "${t.title}" והעביר/ה אליך את ההובלה.`, "בקשות הצטרפות חדשות יגיעו מעכשיו אליך."],
        ["לאתר", `${site}/match#teams`]);
    }
    t.members = t.members.filter(x => x !== m);
    t.messages.push({ id: newItemId(), name: m.name, text: "יצא/ה מהקבוצה.", at });
    await saveTeam(t);
    return json({ ok: true, left: true });
  }

  // מחיקת המרחב: רק המוביל/ה, עם המייל שאיתו הקבוצה הוקמה. המחיקה סופית.
  if (action === "delete") {
    if (!t.lead.email || norm(body.email) !== norm(t.lead.email))
      return json({ error: "forbidden", message: "רק מי שמוביל/ה את הקבוצה יכול/ה למחוק את המרחב, עם המייל שאיתו הקבוצה הוקמה." }, 403);
    await deleteTeam(t.id);
    for (const x of t.members) {
      if (norm(x.email) === norm(t.lead.email)) continue;
      await mail(x.email, `מרחב העבודה "${t.title}" נמחק`,
        [`שלום ${x.name},`, `${t.lead.name} מחק/ה את מרחב העבודה של קבוצת המשימה "${t.title}".`, "הקישור למרחב כבר לא פעיל."]);
    }
    return json({ ok: true, deleted: true });
  }

  // הזמנה במייל: חבר/ה בצוות שולח/ת קישור הצטרפות לאנשים שהוא/היא בוחר/ת. זה המייל היחיד שיוצא בהצטרפות.
  if (action === "invite") {
    const emails = [...new Set(String(body.emails ?? "").split(/[\s,;]+/).map(e => e.trim()).filter(e => /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(e)))].slice(0, 10);
    if (!emails.length) return json({ error: "missing_fields", message: "נשמח לכתובת מייל אחת לפחות." }, 400);
    if (!mailConfigured()) return json({ ok: true, sent: 0, mailConfigured: false, link: `${site}/match#join-team=${t.id}` });
    const note = clip(body.note, 600);
    let sent = 0;
    for (const to of emails) {
      if (await mail(to, `${who} מזמין/ה אותך לקבוצת המשימה: ${t.title}`,
        [`שלום,`, `${who} מזמין/ה אותך להצטרף לקבוצת המשימה "${t.title}" בקהילה "בינה מלאכותית: חוסן-חינוך-חרום".`, note, t.summary ? `על הקבוצה: ${clip(t.summary, 400)}` : "", "מצטרפים בקישור, עם השם, המייל וקוד הקהילה."].filter(Boolean),
        ["להצטרפות לקבוצה", `${site}/match#join-team=${t.id}`])) sent++;
    }
    return json({ ok: true, sent, total: emails.length });
  }

  switch (action) {
    case "section-save": {
      const s = t.sections.find(x => x.id === clip(body.sectionId, 40));
      if (!s) return json({ error: "not_found" }, 404);
      // מניעת דריסה: שומרים רק אם הנוסח לא השתנה מאז שנפתח.
      if (Number(body.version) !== s.version) return json({ error: "conflict", section: s }, 409);
      Object.assign(s, { text: clip(body.text, 40000), version: s.version + 1, updatedBy: who, updatedAt: at });
      break;
    }
    case "section-add": {
      const title = clip(body.title, 120);
      if (!title) return json({ error: "missing_fields" }, 400);
      t.sections.push({ id: "s" + newItemId(), title, hint: "", text: "", version: 0 });
      break;
    }
    case "section-remove": {
      const s = t.sections.find(x => x.id === clip(body.sectionId, 40));
      if (s && !s.text.trim()) t.sections = t.sections.filter(x => x !== s);
      break;
    }
    case "task-add": {
      const text = clip(body.text, 400);
      if (!text) return json({ error: "missing_fields" }, 400);
      t.tasks.push({ id: newItemId(), text, owner: clip(body.owner, 160), due: /^\d{4}-\d{2}-\d{2}$/.test(String(body.due)) ? String(body.due) : "", done: false });
      t.tasks = t.tasks.slice(-200);
      break;
    }
    case "task-toggle": {
      const x = t.tasks.find(k => k.id === clip(body.taskId, 20));
      if (x) x.done = !x.done;
      break;
    }
    case "task-remove":
      t.tasks = t.tasks.filter(k => k.id !== clip(body.taskId, 20));
      break;
    case "message": {
      const text = clip(body.text, 4000);
      if (!text) return json({ error: "missing_fields" }, 400);
      t.messages.push({ id: newItemId(), name: who, text, at });
      t.messages = t.messages.slice(-300);
      break;
    }
    case "link-add": {
      const url = cleanUrl(body.url);
      if (!url) return json({ error: "invalid_url", message: "יש להזין קישור תקין." }, 400);
      t.links.push({ id: newItemId(), label: clip(body.label, 160) || url, url });
      break;
    }
    case "link-remove":
      t.links = t.links.filter(l => l.id !== clip(body.linkId, 20));
      break;
    case "meta": {
      if (body.status && TEAM_STATUS[body.status as TeamStatus]) t.status = body.status;
      if (body.title !== undefined) t.title = clip(body.title, 200) || t.title;
      if (body.summary !== undefined) t.summary = clip(body.summary, 1500);
      if (body.need !== undefined) t.need = clip(body.need, 600);
      if (body.deadline !== undefined) t.deadline = /^\d{4}-\d{2}-\d{2}$/.test(String(body.deadline)) ? String(body.deadline) : "";
      if (body.funder !== undefined) t.funder = clip(body.funder, 200);
      break;
    }
    case "request-approve":
    case "request-decline": {
      const r = t.requests.find(x => x.id === clip(body.requestId, 20));
      if (!r) return json({ error: "not_found" }, 404);
      t.requests = t.requests.filter(x => x !== r);
      if (action === "request-approve") {
        t.members.push({ name: r.name, email: r.email, role: clip(body.role, 120), joinedAt: at });
        // קישור אישי של חבר/ה — לא הקישור של המוביל/ה.
        const memberKey = await issueKey(t, "member", r.name);
        await saveTeam(t);
        const link = workspaceLink(site, t, memberKey);
        const mailed = await mail(r.email, `הצטרפת לקבוצת המשימה: ${t.title}`,
          [`שלום ${r.name},`, `הבקשה שלך להצטרף לקבוצת המשימה "${t.title}" אושרה.`, "זה הקישור לסביבת העבודה. שמרי אותו — רק איתו נכנסים."],
          ["כניסה לסביבת העבודה", link]);
        return json({ ok: true, team: view(t, access), mailed, member: { name: r.name, email: r.email || "" }, link });
      }
      break;
    }
    case "member-join": {
      // הצטרפות מתוך סביבת העבודה: מי שיש לה את הקישור מצטרפת לרשימת חברות הצוות.
      const name = clip(body.member, 160);
      if (!name) return json({ error: "missing_fields", message: "נשמח לשם." }, 400);
      if (!t.members.some(x => x.name === name)) {
        t.members.push({ name, email: clip(body.email, 240), role: clip(body.role, 120), joinedAt: at });
        t.requests = t.requests.filter(r => r.name !== name);
      }
      if (!isLead && !access.me) { t.keyOwners = { ...(t.keyOwners || {}), [access.hash]: name }; access.me = name; }
      break;
    }
    case "member-update": {
      const m = t.members.find(x => x.name === clip(body.member, 160));
      if (m) {
        if (body.remove) {
          if (!isLead) return json({ error: "lead_only", message: "רק המוביל/ה יכול/ה להסיר חברים/ות מהקבוצה." }, 403);
          if (m.name !== t.lead.name) t.members = t.members.filter(x => x !== m);
        } else if (body.role !== undefined) {
          if (!isLead && m.name !== access.me) return json({ error: "forbidden", message: "אפשר לעדכן רק את התפקיד שלך." }, 403);
          m.role = clip(body.role, 120);
        }
      }
      break;
    }
    default:
      return json({ error: "unknown_action" }, 400);
  }

  return json({ ok: true, team: view(await saveTeam(t), access) });
};

export const config: Config = {
  path: "/api/teams",
  rateLimit: { windowLimit: 90, windowSize: 60, aggregateBy: ["ip"] },
};
