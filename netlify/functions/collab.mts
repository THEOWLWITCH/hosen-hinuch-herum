import type { Config } from "@netlify/functions";
import { issueMemberToken, json, looksHuman, memberFromToken, store, validToken } from "../lib/shared.mts";
import { THEME_LABELS, getOptOut, loadPeople, mailConfigured, mailErrorHint, personTopics, sendAll, sendMail, siteUrl } from "../lib/calls.mts";
import { addRequest } from "../lib/requests.mts";
import { communityOK } from "../lib/member-code.mts";
import { createTeam, hashKey as teamHash, newKey as teamKey, saveTeam } from "../lib/teams.mts";
import {
  KINDS, STATUS_LABELS, type CollabStatus, clip, cleanKinds, createCollab, deleteCollab, getCollab, hashKey, isDate, listCollabs, newKey,
  offerOf, openCollab, ownerCollab, publicCollab, saveCollab,
  RESEARCH_MODEL, RESEARCH_SCHEMA, RESEARCH_SYSTEM, type Research, type RunArticle, deleteResearch, getResearch, getRun, listResearch,
  publicResearch, researchPrompt, saveResearch, saveRun,
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
  const link = `${site}/match#my-offer=${await issueMemberToken(p.id)}`;
  const lines = [
    `שלום ${p.name},`,
    "בעמוד שיתופי פעולה באתר הקהילה נפתח אזור חדש: 🤝 שידוכים בקהילה. רואים בו מי מקדמת מה, מי מתאימה לעבודה משותפת, ובקשות פתוחות לשיתוף פעולה שאפשר להצטרף אליהן.",
    "התשובות מהטבלה של קבוצת העניין כבר נמצאות שם. בקישור הזה אפשר לבדוק, לעדכן ולהוסיף: לבחור את סוגי הפעילות שתרצי לקדם ולכתוב כמה מילים על הרעיון או הנושא.",
    "הקישור אישי ובתוקף 60 יום. כדאי לא להעביר אותו הלאה.",
  ];
  const html = `<div dir="rtl" style="font-family:Arial,sans-serif;max-width:600px;margin:auto;padding:8px 18px;color:#1d3445;line-height:1.7;font-size:15px">${lines.map(l => `<p>${esc(l)}</p>`).join("")}<p><a href="${esc(link)}" style="display:inline-block;padding:10px 18px;border-radius:999px;background:#2f6e4f;color:#fff;text-decoration:none"><strong>✏️ לעדכון מה שאני יכולה לקדם</strong></a></p><p><a href="${esc(site)}/match" style="color:#17649a">לשידוכים בעמוד שיתופי פעולה</a></p><p style="font-size:12px;color:#6b7d88">בינה מלאכותית: חוסן-חינוך-חרום</p></div>`;
  await sendMail(String(p.email), "מה אני יכולה לקדם: שידוכים בקהילה", html, lines.join("\n\n") + `\n\nלעדכון: ${link}`);
}

// כניסת ניהול שפג תוקפה (12 שעות): הודעה ברורה במקום "הקישור לא תקין".
const ADMIN_EXPIRED = { error: "admin_expired", message: "כניסת הניהול הסתיימה (היא בתוקף 12 שעות). אפשר להיכנס שוב לניהול ולנסות שוב." };
const hasBearer = (req: Request) => /^Bearer\b/i.test(req.headers.get("authorization") || "");

// קריאה פנימית מפונקציית הקצה (collab-ai), כמו בנבט.
const internalOK = (req: Request) => { const s = Netlify.env.get("EDITOR_SECRET") || ""; return !!s && req.headers.get("x-internal") === s; };
const researchLink = (site: string, rid: string) => `${site}/match#research-${rid}`;

// מאמרים לרעיונות: מה שהדפדפן שלח (חידושים במחקר) ומה שבספרייה בשרת, עדכניים, בלי כפילויות.
async function collectArticles(fromClient: unknown): Promise<RunArticle[]> {
  const out: RunArticle[] = [];
  const seen = new Set<string>();
  const add = (x: any) => {
    let url = clip(x?.url ?? x?.doi, 600);
    if (url && !/^https?:\/\//i.test(url)) url = /^10\.\d+\//.test(url) ? `https://doi.org/${url}` : "";
    const title = clip(x?.title, 400);
    if (!title || !url) return;
    const key = url.toLowerCase().replace(/\/+$/, "") + "|" + title.toLowerCase().slice(0, 60);
    const k2 = title.toLowerCase().replace(/[^\p{L}\p{N}]+/gu, " ").trim().slice(0, 80);
    if (seen.has(key) || (k2 && seen.has(k2))) return;
    seen.add(key); seen.add(k2);
    out.push({ ref: "", title, authors: clip(x?.authors, 300), year: clip(x?.year, 10), source: clip(x?.source ?? x?.journal, 200), url, summary: clip(x?.summary ?? x?.abstract, 700) });
  };
  for (const x of (Array.isArray(fromClient) ? fromClient : []).slice(0, 80)) add(x);
  const st = store("hosen-data");
  const { blobs } = await st.list({ prefix: "library/" });
  const lib: any[] = [];
  for (const b of blobs) { const v = await st.get(b.key, { type: "json" }) as any; if (v?.title) lib.push(v); }
  const yearOf = (x: any) => Number(String(x.publicationDate || x.year || "").slice(0, 4)) || 0;
  const minYear = new Date().getFullYear() - 3;
  lib.filter(x => yearOf(x) >= minYear).sort((a, b) => String(b.publicationDate || b.year || "").localeCompare(String(a.publicationDate || a.year || ""))).slice(0, 60).forEach(add);
  return out.slice(0, 90).map((a, i) => ({ ...a, ref: "a" + (i + 1) }));
}

async function researchMail(site: string, r: Research, p: { name: string; email?: string }) {
  const others = r.researchers.filter(x => x.name !== p.name).map(x => x.name);
  const mine = r.researchers.find(x => x.name === p.name);
  return mail(p.email, `שידוך למחקר: ${r.title}`, [
    `שלום ${p.name},`,
    "במערכת השידוכים של הקהילה עלה רעיון למחקר, ואת/ה בין החברים שמתאימים לו.",
    `הרעיון: ${r.title}`,
    `הנישה במחקר: ${r.gap}`,
    mine?.why ? `מה את/ה יכול/ה להביא: ${mine.why}` : "",
    others.length ? `מוצעים יחד איתך: ${others.join(", ")}.` : "",
    "בכרטיס יש גם מאמרים עדכניים בתחום. אם זה מעניין אותך, אפשר להצטרף לרשימת היוזמים, ומשם לפתוח מרחב עבודה לצוות.",
  ].filter(Boolean), ["לכרטיס הרעיון", researchLink(site, r.id)]);
}

const manageLink = (site: string, cid: string, key: string) => `${site}/match#collab=${cid}.${key}`;
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
      research: (await listResearch()).filter(r => admin || (r.status !== "draft" && r.status !== "closed")).map(publicResearch),
      admin,
    });
  }

  if (req.method !== "POST") return json({ error: "method" }, 405);
  const body = await req.json().catch(() => ({} as any));
  const action = clip(body.action, 40);

  // ----- בקשה חדשה לשיתוף פעולה: מתפרסמת מיד, בקוד הקהילה -----
  if (action === "create") {
    if (!looksHuman(body)) return json({ ok: true });
    if (!(await communityOK(req, body.communityCode))) return json({ error: "invalid_code", message: "הקוד לא תואם. אפשר להקליד את קוד הקהילה או את הקוד האישי, ולנסות שוב." }, 401);
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
      [`שלום ${f.name},`, `הבקשה "${c.title}" פורסמה בעמוד שיתופי פעולה, בשידוכים בקהילה.`, "כשמישהי מצטרפת, יגיע אלייך מייל עם הפרטים שלה.", "בקישור הזה אפשר לראות מי הצטרפה, לעדכן את הבקשה, לסגור אותה, או לפתוח קבוצת משימה עם סביבת עבודה משותפת. כדאי לשמור אותו."],
      ["ניהול הבקשה", link]);
    await addRequest({
      type: "idea", name: f.name, email: f.email, subject: `🤝 בקשה לשיתוף פעולה: ${c.title}`,
      body: [`סוג הפעילות: ${kindLabels(c.kinds)}`, `הרעיון: ${c.description}`, c.need ? `את מי מחפשות: ${c.need}` : "", c.deadline ? `עד: ${c.deadline}` : ""].filter(Boolean).join("\n"),
      link: `/match#collab-req-${c.id}`, data: { collabId: c.id },
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
    if (!(await validToken(req, "admin"))) return json(ADMIN_EXPIRED, 401);
    if (!mailConfigured()) return json({ error: "mail", message: "שליחת המיילים מהאתר עוד לא פעילה (חסרים GMAIL_USER ו-GMAIL_APP_PASSWORD ב-Netlify)." }, 503);
    const optout = new Set(await getOptOut());
    const people = (await loadPeople(u.origin)).filter(p => validEmail(String(p.email || "").trim()) && !optout.has(norm(p.email)));
    const rows = body.onlyNew === true ? people.filter(p => { const o = offerOf(p as any); return !o.kinds.length && !o.text; }) : people;
    const r = await sendAll(rows, p => offerMail(p, site));
    return json({ ok: true, sent: r.ok.length, failed: r.failed.map(p => p.name), reason: r.reason, total: rows.length });
  }

  if (action === "offer-save") {
    const admin = await validToken(req, "admin");
    if (!admin && hasBearer(req)) return json(ADMIN_EXPIRED, 401);
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

  // ----- רעיונות למחקר -----
  // הכנה (מפונקציית הקצה, בכניסת ניהול): אוספים את הכרטיסים והמאמרים, שומרים את הריצה, ומחזירים את הבקשה למודל.
  if (action === "research-prepare") {
    if (!internalOK(req)) return json({ error: "forbidden" }, 403);
    if (!(await validToken(req, "admin"))) return json(ADMIN_EXPIRED, 401);
    const count = Math.min(6, Math.max(2, Number(body.count) || 4));
    const focus = clip(body.focus, 400);
    const people = (await loadPeople(u.origin)).map(p => {
      const o = offerOf(p as any);
      return { id: p.id, name: p.name, institution: p.institution || "", description: clip(p.description, 800),
        offer: [o.kinds.map(k => KINDS.find(x => x.key === k)?.label || k).join(", "), o.text].filter(Boolean).join(" · "),
        topics: personTopics(p).map(t => THEME_LABELS[t] || t).join(", ") };
    });
    const articles = await collectArticles(body.articles);
    if (articles.length < 3) return json({ error: "no_articles", message: "לא נמצאו מספיק מאמרים עדכניים באתר כדי לזהות נישות במחקר." }, 400);
    const existing = (await listResearch()).map(r => r.title);
    const runId = crypto.randomUUID();
    await saveRun({ id: runId, at: new Date().toISOString(), articles, people: people.map(p => ({ id: p.id, name: p.name })) });
    return json({
      runId, articles: articles.length, people: people.length,
      params: {
        model: RESEARCH_MODEL, max_tokens: 32000, thinking: { type: "adaptive" },
        output_config: { effort: "high", format: { type: "json_schema", schema: RESEARCH_SCHEMA } },
        // אם מסנני הבטיחות יעצרו בטעות תשובה לגיטימית, הבקשה עוברת אוטומטית למודל חלופי.
        betas: ["server-side-fallback-2026-07-01"], fallbacks: "default",
        system: [{ type: "text", text: RESEARCH_SYSTEM, cache_control: { type: "ephemeral" } }],
        messages: [{ role: "user", content: researchPrompt({ people, articles, existing, count, focus }) }],
      },
    });
  }

  // שמירת ההצעות כטיוטות: רק חברי קהילה ומאמרים מהריצה, כך שאין שמות או קישורים מומצאים.
  if (action === "research-save") {
    if (!(await validToken(req, "admin"))) return json(ADMIN_EXPIRED, 401);
    const run = await getRun(clip(body.runId, 80));
    if (!run) return json({ error: "not_found", message: "הריצה לא נמצאה. אפשר ליצור רעיונות מחדש." }, 404);
    const people = new Map(run.people.map(p => [p.id, p.name]));
    const arts = new Map(run.articles.map(a => [a.ref, a]));
    const at = new Date().toISOString();
    const saved: Research[] = [];
    for (const x of (Array.isArray(body.result?.proposals) ? body.result.proposals : []).slice(0, 8)) {
      const researchers = (Array.isArray(x?.researchers) ? x.researchers : [])
        .filter((r: any) => people.has(String(r?.id))).slice(0, 5)
        .map((r: any) => ({ personId: String(r.id), name: people.get(String(r.id))!, why: clip(r.why, 400) }))
        .filter((r: any, i: number, all: any[]) => all.findIndex(o => o.personId === r.personId) === i);
      const articles = (Array.isArray(x?.articles) ? x.articles : [])
        .filter((a: any) => arts.has(String(a?.ref))).slice(0, 5)
        .map((a: any) => { const m = arts.get(String(a.ref))!; return { title: m.title, authors: m.authors, year: m.year, source: m.source, url: m.url, note: clip(a.note, 400) }; })
        .filter((a: any, i: number, all: any[]) => all.findIndex(o => o.url === a.url) === i);
      const title = clip(x?.title, 200);
      if (!title || !researchers.length || !articles.length) continue;
      saved.push(await saveResearch({
        id: crypto.randomUUID(), status: "draft", title, gap: clip(x.gap, 1500), idea: clip(x.idea, 1500),
        questions: (Array.isArray(x.questions) ? x.questions : []).map((q: unknown) => clip(q, 400)).filter(Boolean).slice(0, 4),
        approach: clip(x.approach, 1500), firstStep: clip(x.firstStep, 600), researchers, articles, initiators: [],
        teamId: "", notified: 0, createdAt: at, publishedAt: "", updatedAt: at,
      }));
    }
    if (!saved.length) return json({ error: "empty", message: "לא התקבלו הצעות שאפשר לשמור. אפשר לנסות שוב." }, 422);
    return json({ ok: true, saved: saved.length });
  }

  // פרסום: הכרטיס גלוי לכולם, ונשלחת הודעה לחברים שהוצעו (בלי מי שהוסר/ה מרשימות הדיוור).
  if (action === "research-publish" || action === "research-delete" || action === "research-close") {
    if (!(await validToken(req, "admin"))) return json(ADMIN_EXPIRED, 401);
    const r = await getResearch(clip(body.id, 80));
    if (!r) return json({ error: "not_found", message: "הרעיון לא נמצא." }, 404);
    if (action === "research-delete") { await deleteResearch(r.id); return json({ ok: true }); }
    if (action === "research-close") { r.status = "closed"; await saveResearch(r); return json({ ok: true }); }
    if (r.status !== "draft") return json({ ok: true, already: true, mailed: r.notified });
    r.status = "open";
    r.publishedAt = new Date().toISOString();
    const optout = new Set(await getOptOut());
    const people = await loadPeople(u.origin);
    let mailed = 0;
    if (body.notify !== false) {
      for (const x of r.researchers) {
        const p = people.find(pp => pp.id === x.personId);
        if (p && validEmail(String(p.email || "")) && !optout.has(norm(p.email)) && await researchMail(site, r, p)) mailed++;
      }
    }
    r.notified = mailed;
    await saveResearch(r);
    return json({ ok: true, mailed, total: r.researchers.length, mailConfigured: mailConfigured() });
  }

  // הצטרפות לרשימת היוזמים: לחברי הקהילה בלבד, בקוד הקהילה (ועם הגנה מספאם).
  if (action === "research-join") {
    if (!looksHuman(body)) return json({ ok: true });
    if (!(await communityOK(req, body.communityCode))) return json({ error: "invalid_code", message: "הקוד לא תואם. אפשר להקליד את קוד הקהילה או את הקוד האישי, ולנסות שוב." }, 401);
    const name = clip(body.name, 160), email = clip(body.email, 240), note = clip(body.note, 800);
    if (!name || !validEmail(email)) return json({ error: "missing", message: "כדי להצטרף, נשמח לשם ולמייל." }, 400);
    const r = await getResearch(clip(body.id, 80));
    if (!r || r.status !== "open") return json({ error: "not_found", message: "הרעיון לא נמצא, או שכבר נפתח לו מרחב עבודה. אפשר לבקש להצטרף לצוות בעמוד שיתופי פעולה." }, 404);
    if (r.initiators.some(i => norm(i.email) === norm(email))) return json({ ok: true, already: true });
    r.initiators.push({ id: crypto.randomUUID().slice(0, 8), name, email, note, at: new Date().toISOString(), personId: clip(body.personId, 80) });
    r.initiators = r.initiators.slice(-60);
    await saveResearch(r);
    return json({ ok: true });
  }

  // פתיחת מרחב עבודה מתוך הרעיון: קבוצת משימה בעמוד שיתופי פעולה, עם כל היוזמים. בקוד הקהילה, כמו כל קבוצה.
  if (action === "research-team") {
    if (!looksHuman(body)) return json({ ok: true });
    if (!(await communityOK(req, body.communityCode))) return json({ error: "invalid_code", message: "הקוד לא תואם. אפשר להקליד את קוד הקהילה או את הקוד האישי, ולנסות שוב." }, 401);
    const name = clip(body.name, 160), email = clip(body.email, 240);
    if (!name || !validEmail(email)) return json({ error: "missing", message: "כדי לפתוח מרחב עבודה, נשמח לשם ולמייל." }, 400);
    const r = await getResearch(clip(body.id, 80));
    if (!r || r.status !== "open") return json({ error: "not_found", message: "הרעיון לא נמצא, או שכבר נפתח לו מרחב עבודה." }, 404);
    const key = teamKey();
    const t = createTeam({
      title: r.title, summary: [r.idea, r.gap ? `הנישה במחקר: ${r.gap}` : ""].filter(Boolean).join("\n\n"),
      need: `חוקרים ויוזמים לצוות. הוצעו: ${r.researchers.map(x => x.name).join(", ")}`, leadName: name, leadEmail: email,
    }, await teamHash(key));
    const at = new Date().toISOString();
    for (const i of r.initiators) if (norm(i.email) !== norm(email)) t.members.push({ name: i.name, email: i.email, role: "", joinedAt: at });
    t.links = r.articles.map(a => ({ id: crypto.randomUUID().slice(0, 8), label: [a.title, a.year].filter(Boolean).join(" · "), url: a.url }));
    t.status = "writing";
    await saveTeam(t);
    r.teamId = t.id;
    r.status = "team";
    if (!r.initiators.some(i => norm(i.email) === norm(email))) r.initiators.push({ id: crypto.randomUUID().slice(0, 8), name, email, note: "פתח/ה את מרחב העבודה", at, personId: clip(body.personId, 80) });
    await saveResearch(r);
    const link = `${site}/match#team=${t.id}.${key}`;
    let mailed = 0;
    for (const m of t.members) {
      if (await mail(m.email, `מרחב העבודה של "${t.title}"`,
        [`שלום ${m.name},`, `${name} פתח/ה מרחב עבודה לרעיון המחקר "${t.title}", ואת/ה ברשימת היוזמים.`, "במרחב יש סעיפים לכתיבת ההצעה, משימות, הודעות, והמאמרים מהכרטיס. רק מי שיש לו או לה את הקישור יכול להיכנס, ולכן כדאי לשמור אותו."],
        ["כניסה למרחב העבודה", link])) mailed++;
    }
    return json({ ok: true, link, mailed, members: t.members.length });
  }

  // ----- יציאה מרשימה: מצטרפים/ות לבקשה, או יוזמים/ות של רעיון למחקר, לפי המייל שאיתו נרשמו -----
  // מנהלת המערכת מוציאה לפי שם (admin-person-remove).
  if (action === "leave" || action === "admin-person-remove") {
    const isAdmin = action === "admin-person-remove";
    if (isAdmin && !(await validToken(req, "admin"))) return json(ADMIN_EXPIRED, 401);
    const email = norm(body.email), name = clip(body.name, 160);
    if (!isAdmin && !email.includes("@")) return json({ error: "missing_fields", message: "נשמח למייל שאיתו הצטרפת." }, 400);
    const hit = (p: { name: string; email: string }) => isAdmin ? p.name === name : norm(p.email) === email;
    const notFound = json({ error: "not_found", message: isAdmin ? "השם לא נמצא ברשימה." : "המייל לא נמצא ברשימה. אפשר לנסות את המייל שאיתו הצטרפת, או לכתוב בכפתור המשוב בתחתית האתר." }, 404);
    if (body.kind === "research") {
      const r = await getResearch(clip(body.id, 80));
      if (!r) return json({ error: "not_found" }, 404);
      const left = r.initiators.filter(i => !hit(i));
      if (left.length === r.initiators.length) return notFound;
      r.initiators = left;
      await saveResearch(r);
    } else {
      const c = await getCollab(clip(body.id, 80));
      if (!c) return json({ error: "not_found" }, 404);
      const left = c.joiners.filter(j => !hit(j));
      if (left.length === c.joiners.length) return notFound;
      c.joiners = left;
      await saveCollab(c);
    }
    return json({ ok: true });
  }

  // ----- מנהלת המערכת -----
  if (action === "admin-delete") {
    if (!(await validToken(req, "admin"))) return json(ADMIN_EXPIRED, 401);
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
      const link = `${site}/match#team=${t.id}.${key}`;
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
