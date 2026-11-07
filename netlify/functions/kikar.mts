// כיכר הקהילה (7.11.2026): נושא אחד, כמה מקורות, הרבה נקודות מבט.
// קריאה פתוחה לכולם. כתיבה: חברי וחברות הקהילה (קוד אישי, אסימון אישי או קוד הקהילה + שם).
// מקורות: מהספרייה, קישור חיצוני או קובץ (עד 4MB). מקור חדש נכנס גם לתיבת הפניות כהצעת מקור לספרייה.
// "מה למדנו": מנהלת המערכת מצמידה תובנות. הצעת נושא חדש נכנסת לתיבת הפניות.
import type { Config } from "@netlify/functions";
import { communityCodeOK, id, json, looksHuman, safeName, store, validToken } from "../lib/shared.mts";
import { loadPeople } from "../lib/calls.mts";
import { memberIdFromRequest } from "../lib/member-code.mts";
import { addRequest } from "../lib/requests.mts";
import { KIKAR_TOPICS, currentTopic, topicById } from "../lib/kikar-topics.mts";

const data = () => store("hosen-data");
const clip = (v: unknown, n: number) => String(v ?? "").replace(/\r/g, "").trim().slice(0, n);

type Source = { kind: "library" | "link" | "file"; title: string; url: string };
type Post = { id: string; topic: string; conv: string; text: string; name: string; linkTo: string; sources: Source[]; createdAt: string };
type Insight = { id: string; text: string; createdAt: string };

function cleanSources(v: unknown): Source[] {
  if (!Array.isArray(v)) return [];
  return v.slice(0, 5).map((s: any) => {
    const kind = ["library", "link", "file"].includes(s?.kind) ? s.kind : "link";
    let url = clip(s?.url, 600);
    if (kind === "file") { if (!/^\/api\/file\?key=files%2Fkikar-/.test(url)) url = ""; }
    else if (!/^https?:\/\//i.test(url) && !(kind === "library" && url.startsWith("/"))) url = "";
    return { kind, title: clip(s?.title, 300) || url, url } as Source;
  }).filter(s => s.url);
}

async function listPosts(topic: string): Promise<Post[]> {
  const st = data();
  const { blobs } = await st.list({ prefix: `kikar/posts/${topic}/` });
  const rows = await Promise.all(blobs.map(b => st.get(b.key, { type: "json" }).catch(() => null)));
  return (rows.filter(Boolean) as Post[]).sort((a, b) => a.createdAt.localeCompare(b.createdAt));
}
async function getInsights(topic: string): Promise<Insight[]> {
  return ((await data().get(`kikar/insights/${topic}.json`, { type: "json" }).catch(() => null)) as Insight[] | null) || [];
}

// מי כותב/ת: קוד אישי או אסימון ← השם מהנבחרת. קוד הקהילה ← השם שהוקלד. מנהלת המערכת ← השם שהוקלד.
async function author(req: Request, body: any): Promise<{ ok: boolean; name: string; message?: string }> {
  const pid = await memberIdFromRequest(req, body.communityCode);
  if (pid) {
    const p = (await loadPeople(new URL(req.url).origin)).find(x => x.id === pid) as any;
    return { ok: true, name: clip(p?.name, 160) || clip(body.name, 160) || "חבר/ת קהילה" };
  }
  if (communityCodeOK(body.communityCode) || await validToken(req, "admin")) {
    const name = clip(body.name, 160);
    return name ? { ok: true, name } : { ok: false, name: "", message: "יש לכתוב שם." };
  }
  return { ok: false, name: "", message: "הכתיבה בכיכר לחברי וחברות הקהילה. אפשר להקליד את הקוד האישי או את קוד הקהילה." };
}

export default async (req: Request) => {
  const url = new URL(req.url);

  if (req.method === "GET") {
    const topic = topicById(clip(url.searchParams.get("topic"), 80)) || currentTopic();
    const [posts, insights] = await Promise.all([listPosts(topic.id), getInsights(topic.id)]);
    const archive = KIKAR_TOPICS.slice(1).map(t => ({ id: t.id, title: t.title, host: t.host, opens: t.opens, closes: t.closes }));
    return json({ topic, posts, insights, archive, current: topic.id === currentTopic().id });
  }
  if (req.method !== "POST") return json({ error: "method" }, 405);

  // העלאת קובץ כמקור (multipart): action=file, file, communityCode.
  if ((req.headers.get("content-type") || "").includes("multipart/form-data")) {
    const form = await req.formData();
    const who = await author(req, { communityCode: form.get("communityCode"), name: form.get("name") || "x" });
    if (!who.ok) return json({ error: "unauthorized", message: who.message }, 401);
    const f = form.get("file");
    if (!(f instanceof File)) return json({ error: "missing_file", message: "לא נבחר קובץ." }, 400);
    if (f.size > 4_000_000) return json({ error: "file_too_large", message: "הקובץ גדול מ־4MB. אפשר לצרף קישור במקום." }, 413);
    if (!/\.(pdf|docx?|pptx?|xlsx?|png|jpe?g|webp)$/i.test(f.name)) return json({ error: "file_type", message: "אפשר לצרף PDF, Word, PowerPoint, Excel או תמונה." }, 400);
    const key = `files/kikar-${id()}-${safeName(f.name)}`;
    await store("hosen-files").set(key, f, { metadata: { contentType: f.type || "application/octet-stream", filename: f.name } });
    return json({ kind: "file", title: f.name, url: `/api/file?key=${encodeURIComponent(key)}` }, 201);
  }

  const body = await req.json().catch(() => ({} as any));
  const action = clip(body.action, 30);

  // כניסה לכתיבה (7.11.2026): בדיקת הקוד מיד, בלי לחכות לפרסום התגובה.
  if (action === "check") {
    const who = await author(req, body);
    if (who.ok) return json({ ok: true, name: who.name });
    return json({ error: "unauthorized", message: who.message === "יש לכתוב שם." ? who.message : "הקוד לא נכון. אפשר להקליד את הקוד האישי (שמגיע במייל) או את קוד הקהילה." }, 401);
  }

  if (action === "post") {
    if (!looksHuman(body)) return json({ ok: true });
    const topic = currentTopic();
    const conv = topic.convs.find(c => c.id === clip(body.conv, 20));
    if (!conv) return json({ error: "conv", message: "השיחה לא נמצאה." }, 400);
    if (topic.closes && new Date().toISOString().slice(0, 10) > topic.closes && !(await validToken(req, "admin")))
      return json({ error: "closed", message: "הנושא הזה נסגר לכתיבה. אפשר להמשיך לקרוא." }, 403);
    const who = await author(req, body);
    if (!who.ok) return json({ error: "unauthorized", message: who.message }, 401);
    const text = clip(body.text, 4000);
    if (text.length < 2) return json({ error: "text", message: "יש לכתוב תגובה." }, 400);
    const linkTo = topic.convs.some(c => c.id === body.linkTo && c.id !== conv.id) ? String(body.linkTo) : "";
    const sources = cleanSources(body.sources);
    const at = new Date().toISOString();
    const row: Post = { id: id(), topic: topic.id, conv: conv.id, text, name: who.name, linkTo, sources, createdAt: at };
    await data().setJSON(`kikar/posts/${topic.id}/${at.replace(/[-:.TZ]/g, "")}-${row.id.slice(0, 8)}.json`, row);
    // מקור חיצוני חדש: הצעה לספרייה בתיבת הפניות (מקור מהספרייה כבר שם).
    for (const s of sources.filter(s => s.kind !== "library")) {
      await addRequest({ type: "source", name: who.name, email: "", subject: `מקור מכיכר הקהילה: ${s.title}`,
        body: `צורף לשיחה "${conv.title}" בכיכר הקהילה.\n${s.url.startsWith("/") ? url.origin + s.url : s.url}`, link: "/kikar" }).catch(() => {});
    }
    return json(row, 201);
  }

  if (action === "suggest") {
    if (!looksHuman(body)) return json({ ok: true });
    const who = await author(req, body);
    if (!who.ok) return json({ error: "unauthorized", message: who.message }, 401);
    const title = clip(body.title, 200);
    if (!title) return json({ error: "title", message: "יש לכתוב את הנושא." }, 400);
    // השם שנכתב בטופס ההצעה קובע, גם בכניסה עם קוד אישי (7.11.2026)
    await addRequest({ type: "idea", name: clip(body.name, 160) || who.name, email: clip(body.email, 240), subject: `הצעת נושא לכיכר הקהילה: ${title}`,
      body: [clip(body.details, 3000), clip(body.sources, 1500) ? `מקורות: ${clip(body.sources, 1500)}` : ""].filter(Boolean).join("\n\n"), link: "/kikar" });
    return json({ ok: true }, 201);
  }

  // ניהול: הצמדת תובנה ל"מה למדנו", מחיקת תובנה או תגובה.
  if (!(await validToken(req, "admin"))) return json({ error: "unauthorized" }, 401);
  const topicId = topicById(clip(body.topic, 80))?.id || currentTopic().id;
  if (action === "insight") {
    const text = clip(body.text, 1500);
    if (!text) return json({ error: "text" }, 400);
    const list = await getInsights(topicId);
    list.push({ id: id(), text, createdAt: new Date().toISOString() });
    await data().setJSON(`kikar/insights/${topicId}.json`, list);
    return json(list);
  }
  if (action === "insight-delete") {
    const list = (await getInsights(topicId)).filter(x => x.id !== body.id);
    await data().setJSON(`kikar/insights/${topicId}.json`, list);
    return json(list);
  }
  if (action === "post-delete") {
    const st = data();
    const { blobs } = await st.list({ prefix: `kikar/posts/${topicId}/` });
    const hit = blobs.find(b => b.key.endsWith(`-${String(body.id || "").slice(0, 8)}.json`));
    if (hit) await st.delete(hit.key);
    return json({ ok: !!hit });
  }
  return json({ error: "action" }, 400);
};

export const config: Config = {
  path: "/api/kikar",
  rateLimit: { windowLimit: 30, windowSize: 60, aggregateBy: ["ip"] },
};
