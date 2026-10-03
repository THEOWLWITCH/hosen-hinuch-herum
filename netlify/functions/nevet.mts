import type { Config } from "@netlify/functions";
import { id, json, validToken } from "../lib/shared.mts";
import { mailConfigured, sendMail, siteUrl } from "../lib/calls.mts";
import {
  COST, type Op, type Project, type Stage, addRequest, analyzePrompt, certificatePrompt, charge, clip, codeUsable, createProject,
  creditsLeft, getCode, getProject, getTicket, guidePrompt, hashKey, listCodes, listProjects, listRequests, miziPrompt,
  newCodeString, newProjectKey, normCode, openProject, publicCode, publicProject, refundTicket, requestParams, saveCode,
  saveProject, setRequestHandled, settleTicket, SYSTEM_MIZI, SYSTEM_NEVET,
} from "../lib/nevet.mts";

const aiConfigured = () => !!Netlify.env.get("ANTHROPIC_API_KEY");
const internalOK = (req: Request) => {
  const s = Netlify.env.get("EDITOR_SECRET") || "";
  return !!s && req.headers.get("x-internal") === s;
};
const shortId = () => id().slice(0, 8);

function esc(s: string) {
  return String(s || "").replace(/[&<>"]/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c] || c));
}

async function auth(req: Request) {
  const admin = await validToken(req, "admin");
  const codeStr = normCode(req.headers.get("x-nevet-code"));
  const code = codeStr ? await getCode(codeStr) : null;
  return { admin, codeStr, code, key: clip(req.headers.get("x-project-key"), 200) };
}

function err(message: string, status = 400) {
  return json({ error: "nevet", message }, status);
}

export default async (req: Request) => {
  const u = new URL(req.url);
  const site = siteUrl(u.origin);

  if (req.method === "GET") {
    const a = await auth(req);

    if (u.searchParams.get("admin") === "1") {
      if (!a.admin) return json({ error: "unauthorized" }, 401);
      const [codes, requests, projects] = await Promise.all([listCodes(), listRequests(), listProjects()]);
      return json({
        codes: codes.map(c => ({ ...c, left: creditsLeft(c) })),
        requests,
        projects: projects.map(p => ({ id: p.id, title: p.title, ownerName: p.ownerName, status: p.status, updatedAt: p.updatedAt, lastActivityAt: p.lastActivityAt, journal: p.journal.length, galleryConsent: p.galleryConsent })),
        ai: { configured: aiConfigured() }, mail: { configured: mailConfigured() }, cost: COST,
      });
    }

    if (u.searchParams.get("me") === "1") {
      const problem = codeUsable(a.code);
      if (problem && !a.admin) return err(problem, 403);
      const projects = (await listProjects()).filter(p => a.admin ? true : p.ownerHash === a.code!.hash)
        .map(p => ({ id: p.id, title: p.title, status: p.status, updatedAt: p.updatedAt, ownerName: p.ownerName }));
      return json({ code: a.code ? publicCode(a.code) : { name: "מנהלת המערכת", left: null }, admin: a.admin, projects, cost: COST, ai: aiConfigured() });
    }

    const pid = clip(u.searchParams.get("project"), 80);
    if (pid) {
      const p = await openProject(pid, a.key, a.codeStr, a.admin);
      if (!p) return err("אין גישה לתיק הזה. אפשר לבקש מהיוזמת את הקישור.", 403);
      return json({ project: publicProject(p), cost: COST, ai: aiConfigured() });
    }

    const vid = clip(u.searchParams.get("verify"), 80);
    if (vid) {
      const p = await getProject(vid);
      const c = clip(u.searchParams.get("c"), 20).toUpperCase();
      if (!p?.certificate || p.certificate.code !== c) return err("התעודה לא נמצאה.", 404);
      return json({ title: p.guide?.productName || p.title, articleTitle: p.analysis.article.title, owner: p.ownerName, members: p.certificate.members, issuedAt: p.certificate.issuedAt, praise: p.certificate.praise, summary: p.certificate.projectSummary, teamPraise: p.certificate.teamPraise });
    }

    if (u.searchParams.get("gallery") === "1") {
      const rows = (await listProjects()).filter(p => p.status === "done" && p.galleryConsent && p.certificate);
      return json(rows.map(p => ({ id: p.id, title: p.guide?.productName || p.title, articleTitle: p.analysis.article.title, summary: p.certificate!.gallerySummary, members: p.certificate!.members, doneAt: p.certificate!.issuedAt })));
    }

    return json({ ai: aiConfigured(), cost: COST });
  }

  if (req.method !== "POST") return json({ error: "method" }, 405);
  const body = await req.json().catch(() => ({} as any));
  const action = clip(body.action, 40);
  const a = await auth(req);

  // ----- בקשת גישה: כל אחת יכולה לפנות -----
  if (action === "request-access") {
    if (body.website) return json({ ok: true });
    const name = clip(body.name, 160), email = clip(body.email, 240);
    if (!name || !email.includes("@")) return err("נא למלא שם ומייל.");
    const r = await addRequest({ name, email, institution: clip(body.institution, 200), note: clip(body.note, 1500) });
    const admin = (Netlify.env.get("GMAIL_USER") || "").trim();
    if (admin && mailConfigured()) {
      const lines = [`${r.name}${r.institution ? ` (${r.institution})` : ""} מבקשת קוד גישה לנבט.`, `מייל: ${r.email}`, r.note ? `מה היא כתבה: ${r.note}` : ""].filter(Boolean);
      await sendMail(admin, `בקשת גישה לנבט: ${r.name}`, `<div dir="rtl" style="font-family:Arial,sans-serif;line-height:1.7">${lines.map(l => `<p>${esc(l)}</p>`).join("")}<p><a href="${site}/apps#nevet-admin">ניהול נבט באתר</a></p></div>`, lines.join("\n")).catch(() => {});
    }
    return json({ ok: true });
  }

  // ----- הכנת קריאה למודל: רק מפונקציית הקצה -----
  if (action === "prepare") {
    if (!internalOK(req)) return json({ error: "forbidden" }, 403);
    if (!aiConfigured()) return err("נבט עוד לא מחובר למודל השפה. ד״ר יעל שדה צריכה להוסיף מפתח (ANTHROPIC_API_KEY) בהגדרות האתר.", 503);
    const r = body.request || {};
    const op = clip(r.op, 20) as Op;
    if (!COST[op]) return err("פעולה לא מוכרת.");
    if (!a.admin) { const problem = codeUsable(a.code); if (problem && op === "analyze") return err(problem, 403); }

    try {
      if (op === "analyze") {
        const text = clip(r.text, 400000);
        if (text.length < 400) return err("לא נמצא מספיק טקסט במאמר. אפשר להדביק את הטקסט ידנית.");
        const t = await charge(a.code, a.admin, op, "");
        return json({ ticket: t.id, params: requestParams(op, SYSTEM_NEVET, analyzePrompt(text, clip(r.setting, 200), clip(r.ageGroup, 100), clip(r.notes, 1500))) });
      }

      const p = await openProject(clip(r.projectId, 80), a.key, a.codeStr, a.admin);
      if (!p) return err("אין גישה לתיק הזה.", 403);
      // הפעולות מחויבות מהקוד של היוזמת — גם כשחברת צוות פועלת דרך הקישור.
      // תיק שמנהלת המערכת פתחה לא מחויב.
      const free = a.admin || p.ownerHash === "admin";
      const owner = free ? null : (a.code && a.code.hash === p.ownerHash ? a.code : await ownerCode(p));
      if (!free) { const problem = codeUsable(owner); if (problem) return err(problem, 403); }

      if (op === "guide") {
        if (r.chosenIdeaId) p.chosenIdeaId = clip(r.chosenIdeaId, 20);
        if (r.checks && typeof r.checks === "object") p.checks = Object.fromEntries(Object.entries(r.checks).slice(0, 40).map(([k, v]) => [clip(k, 30), !!v]));
        if (!p.analysis.ideas.some(x => x.id === p.chosenIdeaId)) return err("יש לבחור רעיון ליישום.");
        await saveProject(p);
        const t = await charge(owner, free, op, p.id);
        return json({ ticket: t.id, params: requestParams(op, SYSTEM_NEVET, await guidePrompt(p, u.origin)) });
      }

      if (op === "mizi") {
        if (!p.guide) return err("קודם צריך להפיק מדריך פיתוח.");
        const kinds = ["update", "doc", "barrier", "question", "reflection"];
        const entry = {
          id: shortId(), at: new Date().toISOString(), kind: (kinds.includes(r.kind) ? r.kind : "update") as any,
          author: clip(r.author, 120) || p.ownerName, text: clip(r.text, 6000),
          links: (Array.isArray(r.links) ? r.links : []).map((x: unknown) => clip(x, 600)).filter((x: string) => /^https?:\/\//.test(x)).slice(0, 8),
        };
        if (!entry.text) return err("מה תרצי לספר למיזי?");
        const t = await charge(owner, free, op, p.id);
        p.journal.push(entry);
        if (p.status === "guide") p.status = "active";
        await saveProject(p);
        return json({ ticket: t.id, entryId: entry.id, params: requestParams(op, SYSTEM_MIZI, miziPrompt(p, entry)) });
      }

      if (op === "certificate") {
        if (!p.guide) return err("קודם צריך להפיק מדריך פיתוח.");
        const members = [...new Set([p.ownerName, ...(Array.isArray(r.members) ? r.members : []).map((x: unknown) => clip(x, 120)).filter(Boolean)])].slice(0, 40);
        const t = await charge(owner, free, op, p.id);
        return json({ ticket: t.id, members, params: requestParams(op, SYSTEM_MIZI, certificatePrompt(p, members)) });
      }
    } catch (e) {
      return err((e as Error).message || "שגיאה.", 402);
    }
    return err("פעולה לא מוכרת.");
  }

  if (action === "refund") {
    if (!internalOK(req)) return json({ error: "forbidden" }, 403);
    const t = await getTicket(clip(body.ticket, 80));
    if (t) await refundTicket(t);
    return json({ ok: true });
  }

  // ----- שמירת תוצאה של המודל בתיק -----
  if (action === "save") {
    const t = await getTicket(clip(body.ticket, 80));
    if (!t || t.settled || t.refunded) return err("הבקשה הזו כבר נשמרה או בוטלה.");
    const result = body.result;
    if (!result || typeof result !== "object") return err("התשובה של נבט לא התקבלה במלואה. אפשר לנסות שוב.");

    if (t.op === "analyze") {
      if (!a.admin && (!a.code || a.code.hash !== t.codeHash)) return err("אין גישה.", 403);
      if (!Array.isArray(result.ideas) || !result.article) return err("התשובה של נבט לא שלמה. אפשר לנסות שוב.");
      const key = newProjectKey();
      const p = createProject({
        owner: a.admin && !a.code ? { hash: "admin", name: "ד״ר יעל שדה", email: (Netlify.env.get("GMAIL_USER") || "").trim() } : { hash: a.code!.hash, name: a.code!.name, email: a.code!.email },
        analysis: result, setting: clip(body.setting, 200), ageGroup: clip(body.ageGroup, 100), notes: clip(body.notes, 1500),
      }, await hashKey(key));
      await saveProject(p);
      await settleTicket(t);
      return json({ ok: true, projectId: p.id, key, link: `${site}/apps#project=${p.id}.${key}` });
    }

    const p = await openProject(t.projectId, a.key, a.codeStr, a.admin);
    if (!p) return err("אין גישה לתיק הזה.", 403);
    const at = new Date().toISOString();

    if (t.op === "guide") {
      if (!Array.isArray(result.stages) || !result.productName) return err("המדריך לא התקבל במלואו. אפשר לנסות שוב.");
      p.guide = result;
      p.stages = result.stages.map((s: Stage, i: number) => ({ ...s, id: s.id || `s${i + 1}`, status: "not_started" as const }));
      p.status = "guide";
      p.journal.push({ id: shortId(), at, kind: "milestone", author: "נבט", text: `נבט הפיק מדריך פיתוח ליישום: "${clip(result.productName, 200)}", ב־${p.stages.length} שלבים.` });
    } else if (t.op === "mizi") {
      const stage = p.stages.find(s => s.id === clip(result.stageId, 30));
      if (stage && ["not_started", "in_progress", "done"].includes(result.stageStatus) && stage.status !== result.stageStatus) {
        stage.status = result.stageStatus;
        if (result.stageStatus === "in_progress" && !stage.startedAt) stage.startedAt = at;
        if (result.stageStatus === "done") {
          stage.doneAt = at;
          p.journal.push({ id: shortId(), at, kind: "milestone", author: "מיזי", text: `🎉 השלב "${stage.title}" הושלם.`, stageId: stage.id });
        }
      }
      p.journal.push({
        id: shortId(), at, kind: "mizi", author: "מיזי", text: clip(result.reply, 8000), stageId: stage?.id,
        mizi: { nextActions: (result.nextActions || []).slice(0, 12), requests: (result.requests || []).slice(0, 8), estimate: clip(result.estimate, 300), reflectionQuestions: (result.reflectionQuestions || []).slice(0, 5) },
      });
      p.status = "active";
    } else if (t.op === "certificate") {
      const abc = "ABCDEFGHJKMNPQRSTUVWXYZ23456789";
      const code = [...crypto.getRandomValues(new Uint8Array(8))].map(x => abc[x % abc.length]).join("");
      p.certificate = { code, issuedAt: at, members: Array.isArray(body.members) ? body.members.map((x: unknown) => clip(x, 120)).filter(Boolean).slice(0, 40) : [p.ownerName], ...result };
      p.status = "done";
      p.journal.push({ id: shortId(), at, kind: "milestone", author: "מיזי", text: "🏅 המיזם הושלם, והתעודות הופקו. כל הכבוד לכל הצוות!" });
    }
    await saveProject(p);
    await settleTicket(t);
    return json({ ok: true, project: publicProject(p) });
  }

  // ----- עדכונים בתיק (בלי מודל) -----
  if (action === "update") {
    const p = await openProject(clip(body.projectId, 80), a.key, a.codeStr, a.admin);
    if (!p) return err("אין גישה לתיק הזה.", 403);
    const x = body.patch || {};
    if (x.chosenIdeaId !== undefined && p.analysis.ideas.some(i => i.id === x.chosenIdeaId)) p.chosenIdeaId = x.chosenIdeaId;
    if (x.checks && typeof x.checks === "object") p.checks = Object.fromEntries(Object.entries(x.checks).slice(0, 40).map(([k, v]) => [clip(k, 30), !!v]));
    if (x.teamFill && p.guide) { const r = p.guide.team[Number(x.teamFill.index)]; if (r) r.filledBy = clip(x.teamFill.name, 160); }
    if (x.galleryConsent !== undefined) p.galleryConsent = !!x.galleryConsent;
    if (x.stage) {
      const s = p.stages.find(s => s.id === clip(x.stage.id, 30));
      if (s && ["not_started", "in_progress", "done"].includes(x.stage.status)) {
        s.status = x.stage.status;
        if (s.status === "in_progress" && !s.startedAt) s.startedAt = new Date().toISOString();
        if (s.status === "done") s.doneAt = new Date().toISOString();
      }
    }
    if (x.entry) {
      const kinds = ["update", "doc", "barrier", "question", "reflection"];
      const text = clip(x.entry.text, 6000);
      if (text) p.journal.push({
        id: shortId(), at: new Date().toISOString(), kind: kinds.includes(x.entry.kind) ? x.entry.kind : "update",
        author: clip(x.entry.author, 120) || p.ownerName, text,
        links: (Array.isArray(x.entry.links) ? x.entry.links : []).map((l: unknown) => clip(l, 600)).filter((l: string) => /^https?:\/\//.test(l)).slice(0, 8),
      });
    }
    if (x.title !== undefined) p.title = clip(x.title, 300) || p.title;
    return json({ ok: true, project: publicProject(await saveProject(p)) });
  }

  // ----- ניהול: קודים, בקשות ותיקים -----
  if (!a.admin) return json({ error: "unauthorized" }, 401);

  if (action === "code-create") {
    const name = clip(body.name, 160);
    if (!name) return err("נא למלא שם.");
    const c = await saveCode({
      code: newCodeString(), name, email: clip(body.email, 240), credits: Math.max(0, Math.min(1000, Number(body.credits) || 20)), used: 0,
      expires: /^\d{4}-\d{2}-\d{2}$/.test(String(body.expires)) ? String(body.expires) : "", active: true, note: clip(body.note, 500), createdAt: new Date().toISOString(),
    });
    if (body.requestId) await setRequestHandled(clip(body.requestId, 80));
    return json({ ok: true, code: c });
  }
  if (action === "code-update") {
    const c = await getCode(clip(body.code, 40));
    if (!c) return err("הקוד לא נמצא.", 404);
    const { hash, ...rec } = c;
    if (body.addCredits) rec.credits = Math.max(0, Math.min(5000, rec.credits + Number(body.addCredits || 0)));
    if (body.active !== undefined) rec.active = !!body.active;
    if (body.expires !== undefined) rec.expires = /^\d{4}-\d{2}-\d{2}$/.test(String(body.expires)) ? String(body.expires) : "";
    return json({ ok: true, code: await saveCode(rec) });
  }
  if (action === "request-handled") { await setRequestHandled(clip(body.id, 80)); return json({ ok: true }); }

  return json({ error: "unknown_action" }, 400);
};

async function ownerCode(p: Project) {
  if (p.ownerHash === "admin") return null;
  const { store } = await import("../lib/shared.mts");
  const c = await store("hosen-data").get(`nevet/codes/${p.ownerHash}.json`, { type: "json" }) as any;
  return c ? { ...c, hash: p.ownerHash } : null;
}

export const config: Config = {
  path: "/api/nevet",
  rateLimit: { windowLimit: 60, windowSize: 60, aggregateBy: ["ip"] },
};
