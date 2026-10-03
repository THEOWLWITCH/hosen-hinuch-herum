import type { Config } from "@netlify/functions";
import { communityCodeOK, json, looksHuman, validToken } from "../lib/shared.mts";
import { bareTitle, getCall, isOpen, israelToday, mailConfigured, sendMail, siteUrl } from "../lib/calls.mts";
import {
  TEAM_STATUS, type Team, type TeamStatus, clip, cleanUrl, createTeam, deleteTeam, getTeam, hashKey, listTeams, newItemId, newKey,
  openTeam, publicTeam, saveTeam, workspaceTeam,
} from "../lib/teams.mts";


function workspaceLink(site: string, t: Team, key: string) {
  return `${site}/calls#team=${t.id}.${key}`;
}

function esc(s: string) {
  return String(s || "").replace(/[&<>"]/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c] || c));
}

async function mail(to: string | undefined, subject: string, lines: string[], link?: [string, string]) {
  if (!to || !to.includes("@") || !mailConfigured()) return false;
  const html = `<div dir="rtl" style="font-family:Arial,sans-serif;max-width:600px;margin:auto;padding:8px 18px;color:#1d3445;line-height:1.7;font-size:15px">${lines.map(l => `<p>${esc(l)}</p>`).join("")}${link ? `<p><a href="${esc(link[1])}" style="color:#17649a"><strong>${esc(link[0])}</strong></a></p>` : ""}<p style="font-size:12px;color:#6b7d88">קהילת חוסן · חינוך · חרום</p></div>`;
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
      const t = await openTeam(teamId, clip(req.headers.get("x-team-key"), 200));
      if (!t) return json({ error: "forbidden", message: "הקישור לסביבת העבודה לא תקין." }, 403);
      return json(workspaceTeam(t));
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
    if (action === "create" && !communityCodeOK(body.communityCode)) return json({ error: "invalid_code", message: "קוד הקהילה שגוי." }, 401);
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
      await saveTeam(t);
      const link = workspaceLink(site, t, key);
      const mailed = await mail(email, `סביבת העבודה של קבוצת המשימה: ${t.title}`,
        [`שלום ${name},`, `קבוצת המשימה "${t.title}" הוקמה. זה הקישור לסביבת העבודה של הקבוצה.`, "שמרי אותו. רק מי שיש לה את הקישור יכולה להיכנס ולכתוב."],
        ["כניסה לסביבת העבודה", link]);
      return json({ ok: true, id: t.id, key, link, mailed });
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

  // ----- ניהול מערכת -----
  if (action === "admin-delete" || action === "admin-rekey") {
    if (!(await validToken(req, "admin"))) return json({ error: "unauthorized" }, 401);
    const t = await getTeam(clip(body.id, 80));
    if (!t) return json({ error: "not_found" }, 404);
    if (action === "admin-delete") { await deleteTeam(t.id); return json({ ok: true }); }
    const key = newKey();
    await saveTeam({ ...t, keyHash: await hashKey(key) });
    return json({ ok: true, link: workspaceLink(site, t, key) });
  }

  // ----- פעולות בתוך סביבת העבודה: רק עם המפתח של הקבוצה -----
  const key = clip(req.headers.get("x-team-key"), 200);
  const t = await openTeam(clip(body.id, 80), key);
  if (!t) return json({ error: "forbidden", message: "הקישור לסביבת העבודה לא תקין." }, 403);
  const who = clip(body.name, 160) || "חברת קבוצה";
  const at = new Date().toISOString();

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
        await saveTeam(t);
        const link = workspaceLink(site, t, key);
        const mailed = await mail(r.email, `הצטרפת לקבוצת המשימה: ${t.title}`,
          [`שלום ${r.name},`, `הבקשה שלך להצטרף לקבוצת המשימה "${t.title}" אושרה.`, "זה הקישור לסביבת העבודה. שמרי אותו — רק איתו נכנסים."],
          ["כניסה לסביבת העבודה", link]);
        return json({ ok: true, team: workspaceTeam(t), mailed, member: { name: r.name, email: r.email || "" }, link });
      }
      break;
    }
    case "member-update": {
      const m = t.members.find(x => x.name === clip(body.member, 160));
      if (m) {
        if (body.remove && m.name !== t.lead.name) t.members = t.members.filter(x => x !== m);
        else if (body.role !== undefined) m.role = clip(body.role, 120);
      }
      break;
    }
    default:
      return json({ error: "unknown_action" }, 400);
  }

  return json({ ok: true, team: workspaceTeam(await saveTeam(t)) });
};

export const config: Config = {
  path: "/api/teams",
  rateLimit: { windowLimit: 90, windowSize: 60, aggregateBy: ["ip"] },
};
