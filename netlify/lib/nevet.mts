// נבט — ממאמר אל השטח. ומיזי, העוזרת האישית של המיזם.
// כאן: קודי גישה ופעולות, תיקי יישום, חיוב פעולות, והבקשות למודל (פרומפטים וסכמות).
// הקריאה למודל עצמה נעשית בפונקציית הקצה nevet-ai, שמזרימה את התשובה לדפדפן.
import { id, store } from "./shared.mts";
import { THEME_LABELS, callTopics, isOpen, israelToday, listCalls, loadPeople, personTopics } from "./calls.mts";

const data = () => store("hosen-data");
const now = () => new Date().toISOString();
export const clip = (v: unknown, n: number) => String(v ?? "").trim().slice(0, n);

export const MODEL = "claude-opus-5-5";
export const COST: Record<Op, number> = { analyze: 2, guide: 3, mizi: 1, certificate: 1 };
export type Op = "analyze" | "guide" | "mizi" | "certificate";

// ---------- קודי גישה ----------

export type AccessCode = {
  code: string; name: string; email: string; credits: number; used: number;
  expires: string; active: boolean; note: string; createdAt: string; lastUsedAt?: string;
};

async function sha(s: string) {
  const d = await crypto.subtle.digest("SHA-256", new TextEncoder().encode("nevet:" + s));
  return [...new Uint8Array(d)].map(b => b.toString(16).padStart(2, "0")).join("");
}

export function normCode(code: unknown) {
  return String(code ?? "").trim().toUpperCase().replace(/\s+/g, "");
}

export function newCodeString() {
  const abc = "ABCDEFGHJKMNPQRSTUVWXYZ23456789";
  const b = crypto.getRandomValues(new Uint8Array(8));
  const s = [...b].map(x => abc[x % abc.length]).join("");
  return `NEVET-${s.slice(0, 4)}-${s.slice(4)}`;
}

export async function getCode(code: string): Promise<(AccessCode & { hash: string }) | null> {
  const c = normCode(code);
  if (!/^NEVET-[A-Z0-9]{4}-[A-Z0-9]{4}$/.test(c)) return null;
  const hash = await sha(c);
  const v = await data().get(`nevet/codes/${hash}.json`, { type: "json" }) as AccessCode | null;
  return v ? { ...v, hash } : null;
}

export async function saveCode(c: AccessCode) {
  await data().setJSON(`nevet/codes/${await sha(c.code)}.json`, c);
  return c;
}

export async function listCodes(): Promise<AccessCode[]> {
  const st = data();
  const { blobs } = await st.list({ prefix: "nevet/codes/" });
  const rows: AccessCode[] = [];
  for (const b of blobs) { const v = await st.get(b.key, { type: "json" }) as AccessCode | null; if (v) rows.push(v); }
  return rows.sort((a, b) => b.createdAt.localeCompare(a.createdAt));
}

export function codeUsable(c: AccessCode | null, today = israelToday()): string {
  if (!c) return "הקוד לא נמצא. בדקי שהעתקת אותו במלואו.";
  if (!c.active) return "הקוד הזה הושבת. אפשר לפנות לד״ר יעל שדה.";
  if (c.expires && c.expires < today) return "תוקף הקוד הסתיים. אפשר לפנות לד״ר יעל שדה לחידוש.";
  return "";
}

export const creditsLeft = (c: AccessCode) => Math.max(0, c.credits - c.used);

export function publicCode(c: AccessCode) {
  return { name: c.name, credits: c.credits, used: c.used, left: creditsLeft(c), expires: c.expires };
}

// ---------- בקשות גישה ----------

export type AccessRequest = { id: string; name: string; email: string; institution: string; note: string; at: string; handled: boolean };

export async function addRequest(r: Omit<AccessRequest, "id" | "at" | "handled">) {
  const x: AccessRequest = { ...r, id: id(), at: now(), handled: false };
  await data().setJSON(`nevet/requests/${x.id}.json`, x);
  return x;
}

export async function listRequests(): Promise<AccessRequest[]> {
  const st = data();
  const { blobs } = await st.list({ prefix: "nevet/requests/" });
  const rows: AccessRequest[] = [];
  for (const b of blobs) { const v = await st.get(b.key, { type: "json" }) as AccessRequest | null; if (v) rows.push(v); }
  return rows.sort((a, b) => b.at.localeCompare(a.at));
}

export async function setRequestHandled(rid: string) {
  const v = await data().get(`nevet/requests/${rid}.json`, { type: "json" }) as AccessRequest | null;
  if (v) await data().setJSON(`nevet/requests/${rid}.json`, { ...v, handled: true });
}

// ---------- תיק יישום ----------

export type Idea = {
  id: string; title: string; essence: string; howToApply: string; audience: string[]; setting: string;
  resources: { people: string; time: string; budget: string; materials: string };
  prerequisites: { id: string; text: string }[]; effort: "low" | "medium" | "high"; impact: string; evidence: string; risks: string;
};
export type Analysis = {
  article: { title: string; authors: string; year: string; field: string; summary: string; keyFindings: string[]; context: string };
  ideas: Idea[];
};
export type Stage = {
  id: string; title: string; goal: string; actions: string[]; deliverables: string[]; resources: string[];
  duration: string; successCriteria: string; status: "not_started" | "in_progress" | "done"; startedAt?: string; doneAt?: string;
};
export type TeamRole = {
  role: string; why: string; sourceType: string; profile: string; communityMatches: string[]; filledBy?: string;
};
export type Guide = {
  productName: string; productDescription: string; productComponents: { name: string; description: string }[];
  userJourney: string; goals: string[]; audience: string; gapsPlan: { prerequisite: string; howToClose: string }[];
  team: TeamRole[]; stages: Stage[]; totalDuration: string; budget: { item: string; estimate: string }[];
  metrics: { what: string; how: string; when: string }[]; ethics: string[]; risks: { risk: string; mitigation: string }[];
  funding: { callTitle: string; why: string }[]; dissemination: string[]; firstStepThisWeek: string;
};
export type JournalEntry = {
  id: string; at: string; kind: "update" | "doc" | "barrier" | "question" | "reflection" | "mizi" | "milestone";
  author: string; text: string; links?: string[]; stageId?: string;
  mizi?: { nextActions: string[]; requests: string[]; estimate: string; reflectionQuestions: string[] };
};
export type Certificate = {
  code: string; issuedAt: string; members: string[]; praise: string; projectSummary: string;
  teamPraise: { name: string; praise: string }[]; reflectiveArticle: { title: string; outline: string[] }; gallerySummary: string;
};
export type Project = {
  id: string; keyHash: string; ownerHash: string; ownerName: string; ownerEmail: string;
  title: string; setting: string; ageGroup: string; notes: string;
  status: "ideas" | "guide" | "active" | "done";
  analysis: Analysis; chosenIdeaId: string; checks: Record<string, boolean>;
  guide: Guide | null; stages: Stage[]; journal: JournalEntry[];
  certificate: Certificate | null; galleryConsent: boolean;
  createdAt: string; updatedAt: string; lastActivityAt: string; nudgedAt?: string;
};

export async function hashKey(key: string) { return sha("project:" + key); }

export function newProjectKey() {
  const b = crypto.getRandomValues(new Uint8Array(18));
  return btoa(String.fromCharCode(...b)).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

export async function getProject(pid: string): Promise<Project | null> {
  if (!/^[\w-]{6,80}$/.test(pid)) return null;
  return await data().get(`nevet/projects/${pid}.json`, { type: "json" }) as Project | null;
}

export async function saveProject(p: Project, touch = true): Promise<Project> {
  const x = { ...p, updatedAt: now(), ...(touch ? { lastActivityAt: now() } : {}) };
  await data().setJSON(`nevet/projects/${x.id}.json`, x);
  return x;
}

export async function listProjects(): Promise<Project[]> {
  const st = data();
  const { blobs } = await st.list({ prefix: "nevet/projects/" });
  const rows: Project[] = [];
  for (const b of blobs) { const v = await st.get(b.key, { type: "json" }) as Project | null; if (v?.id) rows.push(v); }
  return rows.sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
}

// גישה לתיק: בקישור הסודי של התיק (לחברות הצוות), או בקוד של היוזמת.
export async function openProject(pid: string, key: string, code: string, admin: boolean): Promise<Project | null> {
  const p = await getProject(pid);
  if (!p) return null;
  if (admin) return p;
  if (key && (await hashKey(key)) === p.keyHash) return p;
  const c = code ? await getCode(code) : null;
  if (c && c.hash === p.ownerHash) return p;
  return null;
}

export function publicProject(p: Project) {
  const { keyHash, ownerHash, ownerEmail, ...rest } = p;
  return rest;
}

export function createProject(input: { owner: { hash: string; name: string; email: string }; analysis: Analysis; setting: string; ageGroup: string; notes: string }, keyHash: string): Project {
  const at = now();
  const ideas = (input.analysis.ideas || []).map((x, i) => ({ ...x, id: x.id || `i${i + 1}`, prerequisites: (x.prerequisites || []).map((q, j) => ({ ...q, id: q.id || `p${i + 1}-${j + 1}` })) }));
  return {
    id: id(), keyHash, ownerHash: input.owner.hash, ownerName: input.owner.name, ownerEmail: input.owner.email,
    title: clip(input.analysis.article?.title, 300) || "מיזם חדש", setting: input.setting, ageGroup: input.ageGroup, notes: input.notes,
    status: "ideas", analysis: { ...input.analysis, ideas }, chosenIdeaId: "", checks: {},
    guide: null, stages: [], journal: [{ id: id().slice(0, 8), at, kind: "milestone", author: "נבט", text: `נבט קרא את המאמר "${clip(input.analysis.article?.title, 200)}" והציע ${ideas.length} רעיונות ליישום.` }],
    certificate: null, galleryConsent: false, createdAt: at, updatedAt: at, lastActivityAt: at,
  };
}

// ---------- כרטיסי חיוב (פעולה = קריאה אחת למודל) ----------

export type Ticket = { id: string; op: Op; cost: number; codeHash: string; projectId: string; at: string; settled: boolean; refunded: boolean };

export async function charge(c: (AccessCode & { hash: string }) | null, admin: boolean, op: Op, projectId: string): Promise<Ticket> {
  const cost = admin ? 0 : COST[op];
  if (!admin) {
    if (!c) throw new Error("נדרש קוד גישה.");
    if (creditsLeft(c) < cost) throw new Error(`לפעולה הזו נדרשות ${cost} פעולות, ובקוד נותרו ${creditsLeft(c)}. אפשר לפנות לד״ר יעל שדה להוספת פעולות.`);
    const { hash, ...rec } = c;
    await saveCode({ ...rec, used: rec.used + cost, lastUsedAt: now() });
  }
  const t: Ticket = { id: id(), op, cost, codeHash: admin ? "admin" : c!.hash, projectId, at: now(), settled: false, refunded: false };
  await data().setJSON(`nevet/tickets/${t.id}.json`, t);
  return t;
}

export async function getTicket(tid: string) {
  if (!/^[\w-]{6,80}$/.test(tid)) return null;
  return await data().get(`nevet/tickets/${tid}.json`, { type: "json" }) as Ticket | null;
}

export async function settleTicket(t: Ticket) {
  await data().setJSON(`nevet/tickets/${t.id}.json`, { ...t, settled: true });
}

// אם הקריאה למודל נכשלה — מחזירים את הפעולות לקוד.
export async function refundTicket(t: Ticket) {
  if (t.refunded || t.settled) return;
  await data().setJSON(`nevet/tickets/${t.id}.json`, { ...t, refunded: true });
  if (t.codeHash === "admin" || !t.cost) return;
  const c = await data().get(`nevet/codes/${t.codeHash}.json`, { type: "json" }) as AccessCode | null;
  if (c) await data().setJSON(`nevet/codes/${t.codeHash}.json`, { ...c, used: Math.max(0, c.used - t.cost) });
}

// ---------- הקשר קהילתי: מי בקהילה יכולה לעזור, ואילו קולות קוראים פתוחים ----------

async function communityContext(origin: string) {
  const [people, calls] = await Promise.all([loadPeople(origin), listCalls()]);
  const today = israelToday();
  const peopleLines = people.map(p => `- ${p.name}${p.institution ? ` (${p.institution})` : ""}: ${personTopics(p).map(k => THEME_LABELS[k]).join(", ") || "—"}`).join("\n");
  const callLines = calls.filter(c => isOpen(c, today)).slice(0, 25)
    .map(c => `- ${c.title}${c.funder ? ` · ${c.funder}` : ""}${c.endDate ? ` · עד ${c.endDate}` : ""} · נושאים: ${callTopics(c).map(k => THEME_LABELS[k]).join(", ")}`).join("\n");
  return { peopleLines: peopleLines || "(אין כרגע)", callLines: callLines || "(אין כרגע קולות קוראים פתוחים)" };
}

// ---------- פרומפטים ----------

const VALUES = `
ערכי הקהילה, שחלים על כל תשובה:
- הקהילה היא קהילה אקדמית־מקצועית לחוסן, חינוך וחירום. המטרה היא להעצים חוקרות ואנשי חינוך להוביל יישום בשטח.
- תמיד מעודדים עבודה בצוות מגוון: אנשי אקדמיה ואנשי שדה, מורות ומנהלות, תלמידים, הורים, רשויות, ארגונים — כל מי שיכול וכדאי שיעזור.
- לא ממציאים עובדות, נתונים, שמות, ציטוטים או מקורות. כשמשהו לא ידוע — אומרים זאת, או כותבים [להשלמה].
- אם התוכן נוגע בילדים, בתלמידים או בהורים — מזכירים אתיקה, הסכמה מדעת ופרטיות.
- כותבים בעברית, בשפה בהירה, חמה ומעשית. פונים בלשון נקבה ליוזמת.
- עיצוב טקסט בשדות ארוכים: פסקאות קצרות; שורות שמתחילות ב"- " הן תבליטים; **מודגש** למילות מפתח בלבד; בלי כותרות עם #.
`;

export const SYSTEM_NEVET = `את/ה "נבט" — יועץ יישום של קהילת "חוסן · חינוך · חרום". התפקיד שלך: לקרוא מאמר מחקר ולמצוא בו רעיונות שאפשר ליישם בשטח החינוכי, ולתרגם רעיון שנבחר למדריך פיתוח מפורט ומעשי.
${VALUES}`;

export const SYSTEM_MIZI = `את "מיזי" — העוזרת האישית של מיזם יישום בקהילת "חוסן · חינוך · חרום". את מלווה את היוזמת וצוותה שלב אחר שלב, מתוך מדריך הפיתוח של המיזם.
בכל תגובה:
- מגיבה בחום ובקצרה למה שסופר, ומכירה בהתקדמות ובקשיים.
- מסבירה מה השלב הבא, ומה הפעולות הקונקרטיות מול היעדים — ואיך זה מתחבר לתמונה הכללית של הפרויקט.
- מציינת משאבים ומשך זמן צפוי.
- מבקשת מסמכים, תיעודים או מידע שיעזרו (למשל קישור לטיוטה, תמונה מהשטח, תוצאות שאלון) — רק מה שבאמת נחוץ.
- כשמתוארים חסם או בעיה: מציעה 2–3 דרכים להתמודד, ושואלת מי בצוות או בקהילה יכולה לעזור.
- כשמסתיים שלב: מבקשת רפלקציה קצרה — מה עבד? מה הפתיע? מה היינו עושות אחרת?
- לא לוחצת ולא מאשימה. עצירה היא חלק מהדרך.
${VALUES}`;

const str = { type: "string" } as const;
const strArr = { type: "array", items: str } as const;
const obj = (props: Record<string, unknown>) => ({ type: "object", additionalProperties: false, required: Object.keys(props), properties: props });

export const SCHEMAS: Record<Op, unknown> = {
  analyze: obj({
    article: obj({ title: str, authors: str, year: str, field: str, summary: str, keyFindings: strArr, context: str }),
    ideas: {
      type: "array", items: obj({
        id: str, title: str, essence: str, howToApply: str, audience: strArr, setting: str,
        resources: obj({ people: str, time: str, budget: str, materials: str }),
        prerequisites: { type: "array", items: obj({ id: str, text: str }) },
        effort: { type: "string", enum: ["low", "medium", "high"] }, impact: str, evidence: str, risks: str,
      }),
    },
  }),
  guide: obj({
    productName: str, productDescription: str, productComponents: { type: "array", items: obj({ name: str, description: str }) },
    userJourney: str, goals: strArr, audience: str,
    gapsPlan: { type: "array", items: obj({ prerequisite: str, howToClose: str }) },
    team: { type: "array", items: obj({ role: str, why: str, sourceType: { type: "string", enum: ["academia", "field", "teachers", "principals", "students", "parents", "authorities", "organizations", "community", "other"] }, profile: str, communityMatches: strArr }) },
    stages: { type: "array", items: obj({ id: str, title: str, goal: str, actions: strArr, deliverables: strArr, resources: strArr, duration: str, successCriteria: str }) },
    totalDuration: str, budget: { type: "array", items: obj({ item: str, estimate: str }) },
    metrics: { type: "array", items: obj({ what: str, how: str, when: str }) }, ethics: strArr,
    risks: { type: "array", items: obj({ risk: str, mitigation: str }) },
    funding: { type: "array", items: obj({ callTitle: str, why: str }) }, dissemination: strArr, firstStepThisWeek: str,
  }),
  mizi: obj({
    reply: str, nextActions: strArr, requests: strArr, stageId: str,
    stageStatus: { type: "string", enum: ["not_started", "in_progress", "done"] }, estimate: str, reflectionQuestions: strArr, journalTitle: str,
  }),
  certificate: obj({
    praise: str, projectSummary: str, teamPraise: { type: "array", items: obj({ name: str, praise: str }) },
    reflectiveArticle: obj({ title: str, outline: strArr }), gallerySummary: str,
  }),
};

const MAX_TOKENS: Record<Op, number> = { analyze: 24000, guide: 48000, mizi: 12000, certificate: 12000 };
const EFFORT: Record<Op, "medium" | "high"> = { analyze: "high", guide: "high", mizi: "medium", certificate: "medium" };

export function requestParams(op: Op, system: string, userText: string) {
  return {
    model: MODEL,
    max_tokens: MAX_TOKENS[op],
    thinking: { type: "adaptive" },
    output_config: { effort: EFFORT[op], format: { type: "json_schema", schema: SCHEMAS[op] } },
    // אם מסנני הבטיחות יעצרו בטעות תשובה לגיטימית — הבקשה עוברת אוטומטית למודל חלופי.
    betas: ["server-side-fallback-2026-07-01"],
    fallbacks: "default",
    system: [{ type: "text", text: system, cache_control: { type: "ephemeral" } }],
    messages: [{ role: "user", content: userText }],
  };
}

const ideaText = (x: Idea) => [
  `כותרת: ${x.title}`, `העיקר: ${x.essence}`, `איך מיישמים: ${x.howToApply}`, `למי: ${x.audience.join(", ")}`, `מסגרת: ${x.setting}`,
  `משאבים — אנשים: ${x.resources.people}; זמן: ${x.resources.time}; תקציב: ${x.resources.budget}; חומרים: ${x.resources.materials}`,
  `ביסוס במאמר: ${x.evidence}`, `סיכונים: ${x.risks}`,
].join("\n");

export function analyzePrompt(text: string, setting: string, ageGroup: string, notes: string) {
  return `<article>
${text}
</article>

היוזמת מתכוונת ליישם במסגרת: ${setting || "לא צוין"}${ageGroup ? ` · גילאים: ${ageGroup}` : ""}
${notes ? `הערות שלה: ${notes}` : ""}

המשימה:
1. סכמי את המאמר (article): כותרת, מחברים ושנה כפי שמופיעים במאמר (אם חסר — "[לא צוין]"), תחום, תקציר של 4–6 משפטים, 3–7 ממצאים מרכזיים, ומה ההקשר שבו נערך המחקר.
2. הציעי 3–6 רעיונות יישומיים (ideas) שנובעים ישירות מהמאמר ומתאימים למסגרת שלה. לכל רעיון:
   - essence: מה הרעיון בשני משפטים.
   - howToApply: איך מיישמים בפועל — צעדים ראשונים, מבנה, משך (פסקאות קצרות ותבליטים).
   - audience: למי הכלי מתאים (קהלי יעד ספציפיים).
   - resources: אנשים, זמן, תקציב משוער (טווח), חומרים.
   - prerequisites: 3–6 תנאים מקדימים שאפשר לסמן כ"קיים / לא קיים" (למשל: "יש מנהלת שתומכת", "יש שעה שבועית במערכת"). id קצר וייחודי.
   - effort: low / medium / high. impact: מה ישתנה אם זה יצליח.
   - evidence: על מה במאמר הרעיון נשען (ממצא או טענה, בלי להמציא ציטוט).
   - risks: מה עלול להשתבש.
   id של כל רעיון: i1, i2, ...`;
}

export async function guidePrompt(p: Project, origin: string) {
  const idea = p.analysis.ideas.find(x => x.id === p.chosenIdeaId) || p.analysis.ideas[0];
  const checks = idea.prerequisites.map(q => `- ${q.text}: ${p.checks[q.id] ? "קיים ✓" : "עדיין לא קיים ✗"}`).join("\n");
  const ctx = await communityContext(origin);
  return `המאמר: "${p.analysis.article.title}" (${p.analysis.article.authors}, ${p.analysis.article.year})
תקציר: ${p.analysis.article.summary}
ממצאים מרכזיים:
${p.analysis.article.keyFindings.map(f => "- " + f).join("\n")}

הרעיון שהיוזמת בחרה ליישם:
${ideaText(idea)}

מסגרת היישום: ${p.setting || "לא צוין"}${p.ageGroup ? ` · גילאים: ${p.ageGroup}` : ""}
${p.notes ? `הערות היוזמת: ${p.notes}` : ""}

תנאים מקדימים, כפי שהיוזמת סימנה:
${checks}

חוקרות וחברי הקהילה (שם, מוסד, תחומים):
${ctx.peopleLines}

קולות קוראים פתוחים כרגע באתר הקהילה:
${ctx.callLines}

כתבי מדריך פיתוח ליישום — מפורט מאוד, מעשי, שאפשר לעבוד לפיו מחר בבוקר:
- productName ו-productDescription: תיאור התוצר בפרטי פרטים — מה זה, איך זה נראה, איך משתמשים בו, מה החוויה של כל משתמש. productComponents: כל רכיבי התוצר.
- userJourney: המסע של המשתמש/ת המרכזי/ת, צעד אחר צעד.
- goals: 3–6 יעדים מדידים. audience: למי.
- gapsPlan: לכל תנאי מקדים שעדיין לא קיים — איך סוגרים את הפער.
- team: אילו בעלי תפקידים כדאי לצרף, ולמה. חשבי רחב: אקדמיה, שדה, מורות, מנהלות, תלמידים, הורים, רשויות, ארגונים, ועוד. sourceType מתוך הרשימה. communityMatches: שמות מתוך רשימת חברי הקהילה שלמעלה שמתאימים לתפקיד (רק שמות שמופיעים ברשימה; אם אין — מערך ריק).
- stages: 4–8 שלבים מסודרים. לכל שלב id קצר (s1, s2...), מטרה, פעולות קונקרטיות, תוצרים, משאבים, משך משוער ואמת מידה להצלחה.
- totalDuration, budget (פריטים עם טווח משוער בש״ח), metrics (מה מודדים, איך ומתי — כבסיס גם למאמר המשך), ethics (אישורים, הסכמות ופרטיות), risks ודרכי התמודדות.
- funding: קולות קוראים מהרשימה שלמעלה שיכולים לממן את המיזם (רק מתוך הרשימה; אם אין מתאים — מערך ריק).
- dissemination: איך משתפים את התוצאות. firstStepThisWeek: צעד ראשון אחד, קטן ובר־ביצוע, לשבוע הקרוב.`;
}

export function miziPrompt(p: Project, entry: JournalEntry) {
  const g = p.guide!;
  const stages = p.stages.map(s => `- [${s.id}] ${s.title} · ${s.status === "done" ? "הושלם" : s.status === "in_progress" ? "בתהליך" : "טרם התחיל"} · משך: ${s.duration}\n  מטרה: ${s.goal}\n  פעולות: ${s.actions.join("; ")}\n  תוצרים: ${s.deliverables.join("; ")}`).join("\n");
  const recent = p.journal.slice(-14).map(j => `[${j.at.slice(0, 10)}] ${j.author} (${j.kind}): ${j.text.slice(0, 700)}`).join("\n");
  const kinds: Record<string, string> = { update: "עדכון התקדמות", doc: "מסמך או תיעוד", barrier: "חסם או בעיה", question: "שאלה", reflection: "רפלקציה" };
  return `המיזם: ${g.productName} — ${p.title}
תיאור התוצר (בקיצור): ${g.productDescription.slice(0, 1200)}
יעדים: ${g.goals.join("; ")}
משך כולל משוער: ${g.totalDuration}
הצוות: ${g.team.map(t => `${t.role}${t.filledBy ? ` (${t.filledBy})` : " (טרם גויס/ה)"}`).join(", ")}

שלבי המיזם:
${stages}

סיפור הדרך עד עכשיו (האחרונים):
${recent}

עכשיו ${entry.author} כתבה (${kinds[entry.kind] || entry.kind}):
"""${entry.text}"""
${entry.links?.length ? `קישורים שצורפו: ${entry.links.join(", ")}` : ""}

השיבי כמיזי:
- reply: התגובה שלך (פסקאות קצרות ותבליטים).
- nextActions: הפעולות הבאות, קונקרטיות. requests: מה לבקש מהן לצרף או לתעד (אפשר מערך ריק).
- stageId: מזהה השלב שהעדכון שייך אליו. stageStatus: הסטטוס שלו עכשיו לפי מה שסופר.
- estimate: משך זמן צפוי לפעולות הבאות. reflectionQuestions: אם שלב הסתיים — שלוש שאלות רפלקציה; אחרת מערך ריק.
- journalTitle: כותרת קצרה לרשומה ביומן הדרך.`;
}

export function certificatePrompt(p: Project, members: string[]) {
  const g = p.guide!;
  const story = p.journal.map(j => `[${j.at.slice(0, 10)}] ${j.author} (${j.kind}): ${j.text.slice(0, 500)}`).join("\n");
  return `המיזם "${g.productName}" (${p.title}) הסתיים. היוזמת: ${p.ownerName}. חברי הצוות: ${members.join(", ")}.
יעדים: ${g.goals.join("; ")}
שלבים: ${p.stages.map(s => `${s.title} (${s.status === "done" ? "הושלם" : "חלקי"})`).join("; ")}

סיפור הדרך:
${story}

כתבי:
- praise: שבחים חמים ומדויקים ליוזמת ולצוות — מה הם עשו, מה התגברו עליו ומה ההישג (3–5 משפטים, לפי סיפור הדרך בלבד).
- projectSummary: תקציר המיזם לתעודה (2–3 משפטים).
- teamPraise: לכל שם ברשימת חברי הצוות — משפט שבח אישי לפי מה שתרם/ה (אם אין מידע — שבח כללי על ההשתתפות).
- reflectiveArticle: כותרת ושלד (6–10 סעיפים) למאמר רפלקטיבי על המיזם, מתוך סיפור הדרך.
- gallerySummary: תיאור קצר לספריית המיזמים של הקהילה (3–4 משפטים).`;
}

// ---------- נדנוד עדין: "עצירת התרעננות" ----------

export async function projectsToNudge(days = 14): Promise<Project[]> {
  const cutoff = new Date(Date.now() - days * 86400000).toISOString();
  return (await listProjects()).filter(p => (p.status === "active" || p.status === "guide") && p.lastActivityAt < cutoff && (!p.nudgedAt || p.nudgedAt < p.lastActivityAt) && p.ownerEmail.includes("@"));
}
