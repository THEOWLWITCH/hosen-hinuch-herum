// שידוכים בקהילה: מה כל אחת יכולה לקדם, בקשות לשיתוף פעולה והצטרפות אליהן.
// מבוסס על טבלת "קבוצת עניין: בינה מלאכותית, חוסן, חינוך, חירום" (שם, שיוך, מייל, טלפון,
// והפעילות, הרעיון או הנושא שאוכל לקדם).
// אין באתר חשבונות, ולכן ניהול בקשה נעשה בקישור סודי (מפתח), כמו בקבוצות המשימה. בשרת נשמר רק גיבוב.
import { id, store } from "./shared.mts";
import { RESEARCH_SEED } from "./research-seed.mts";

// סוגי הפעילות: הרשימה מהטבלה, ועוד כמה סוגים שעלו בתשובות של חברות הקבוצה.
export const KINDS: { key: string; label: string; icon: string }[] = [
  { key: "ted", label: "הרצאות TED", icon: "🎤" },
  { key: "lectures", label: "הרצאות, וובינרים ואירוח בקורסים", icon: "🗣" },
  { key: "workshop", label: "סדנאות (AI, חוסן)", icon: "🛠" },
  { key: "course", label: "פיתוח קורס", icon: "📘" },
  { key: "calls", label: "הגשת קולות קוראים", icon: "📢" },
  { key: "intl", label: "שת״פ בינלאומי", icon: "🌍" },
  { key: "research", label: "קידום מחקר בישראל ומחקר משותף", icon: "🔬" },
  { key: "eval", label: "מחקרי הערכה ובחינת מודלים בשטח", icon: "📊" },
  { key: "dev", label: "פיתוח תכנים, כלים וסימולציות", icon: "🧩" },
  { key: "field", label: "חיבור לשטח: בתי ספר, רשויות ויוזמות", icon: "🏫" },
  { key: "papers", label: "ניירות עמדה ומסמכי ידע", icon: "📝" },
  { key: "panel", label: "הובלת פאנל", icon: "🎙" },
  { key: "posters", label: "הצגת פוסטרים", icon: "🖼" },
  { key: "page", label: "בניית דף הקהילה", icon: "🧱" },
  { key: "social", label: "הפצת הקהילה ברשתות החברתיות", icon: "📣" },
  { key: "other", label: "אחר", icon: "✨" },
];
export const KIND_KEYS = new Set(KINDS.map(k => k.key));
export const cleanKinds = (v: unknown) =>
  [...new Set((Array.isArray(v) ? v : []).map(String))].filter(k => KIND_KEYS.has(k)).slice(0, KINDS.length);

export type Offer = { kinds: string[]; text: string; updatedAt?: string };

// התשובות מהטבלה, לפי הכרטיס בנבחרת. מה שחברה שומרת בעצמה (person.offer) גובר על זה.
export const OFFER_SEED: Record<string, Offer> = {
  "seed-01": { kinds: ["lectures", "papers", "intl", "panel", "social"], text: "וובינרים, הזמנה להתארח בקורסים, שיתוף בניירות עמדה בנושא הכשרת מורים, אוריינות מדיה ובינה מלאכותית לקראת פיזה 2029. שת״פ בינלאומי, הובלת פאנל, שיתוף הקהילה ברשתות, שת״פ פריזמה לומדת." },
  "seed-03": { kinds: ["course", "research", "intl", "lectures", "social"], text: "פיתוח קורס, קידום מחקר בישראל, שת״פ בינלאומי, הרצאות, הפצת הקהילה ברשתות חברתיות." },
  "seed-04": { kinds: ["research", "calls", "ted", "course", "intl"], text: "הובלת מחקר משותף, קול קורא, הרצאה או TED על אחד ממחקריי, קורס בינלאומי." },
  "seed-05": { kinds: ["calls", "research"], text: "עזרה בהגשת קולות קוראים. קידום מחקר בישראל בתחום, בשיתוף פעולה." },
  "seed-06": { kinds: ["dev", "eval", "research", "workshop", "field"], text: "הובלת האקתונים וקבוצות פיתוח; פיתוח תכנים, מודלים וסימולציות; ייזום והובלת מחקרי הערכה; פיתוח פיילוטים וכלי מדידה; שילוב AI בתהליכי למידה, חוסן ומנהיגות; וחיבור בין אקדמיה, עסקים, חינוך, רשויות ושטח." },
  "seed-07": { kinds: ["eval", "workshop", "field"], text: "בחינת מודלים בשטח, הערכה מעצבת של תכניות בתחומי AI וחוסן, פיתוח סדנאות." },
  "seed-08": { kinds: ["course"], text: "להביא את הידע שלי בתחום, אולי דרך בניית קורס אקדמי שעוסק בחירום וחוסן במערכת החינוך, ושילוב AI." },
  "seed-10": { kinds: [], text: "להתייעץ עם ה-AI (כמה בינות) לגבי הנושאים שכדאי להתמקד בהם." },
  "seed-12": { kinds: ["workshop", "dev", "field"], text: "יזמות בחינוך. מוכנות: חינוך מבוסס סימולציות, עם מערכת AI שכבר עובדת. סדנת חוסן חברתי־קהילתי, וליווי יוזמות בשדה." },
  "seed-13": { kinds: ["page", "papers"], text: "\"גאוות יחידה\": רשימת החוקרים והתחום האקדמי, יחד עם משימת האתר (בביצוע). רשימה של שיטות הערכה חלופיות בעידן ה-AI." },
  "seed-15": { kinds: ["field"], text: "בודקת אפשרות לסייר בבתי ספר שמפעילים תכניות מיוחדות בתחום הבינה המלאכותית." },
};

export function offerOf(p: { id: string; offer?: Offer }): Offer {
  const own = p.offer;
  if (own && (own.kinds?.length || own.text)) return { kinds: cleanKinds(own.kinds), text: String(own.text || ""), updatedAt: own.updatedAt };
  return OFFER_SEED[p.id] || { kinds: [], text: "" };
}

export type CollabStatus = "open" | "matched" | "closed";
export const STATUS_LABELS: Record<CollabStatus, string> = { open: "מחפשת שותפים/ות", matched: "נמצאו שותפים/ות", closed: "נסגרה" };

export type Joiner = { id: string; name: string; email: string; note: string; at: string };
export type Collab = {
  id: string; keyHash: string; title: string; kinds: string[]; description: string; need: string; deadline: string;
  requester: { name: string; email: string; personId: string };
  joiners: Joiner[]; status: CollabStatus; teamId: string;
  createdAt: string; updatedAt: string;
};

const data = () => store("hosen-data");
export const clip = (v: unknown, n: number) => String(v ?? "").trim().slice(0, n);
export const isDate = (v: unknown) => /^\d{4}-\d{2}-\d{2}$/.test(String(v ?? ""));

export function newKey(): string {
  const b = crypto.getRandomValues(new Uint8Array(24));
  return btoa(String.fromCharCode(...b)).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

export async function hashKey(key: string): Promise<string> {
  const d = await crypto.subtle.digest("SHA-256", new TextEncoder().encode("collab:" + key));
  return [...new Uint8Array(d)].map(b => b.toString(16).padStart(2, "0")).join("");
}

export async function getCollab(cid: string): Promise<Collab | null> {
  if (!/^[\w-]{6,80}$/.test(cid)) return null;
  return await data().get(`collab/${cid}.json`, { type: "json" }) as Collab | null;
}

export async function openCollab(cid: string, key: string): Promise<Collab | null> {
  const c = await getCollab(cid);
  if (!c || !key) return null;
  return (await hashKey(key)) === c.keyHash ? c : null;
}

export async function saveCollab(c: Collab): Promise<Collab> {
  const x = { ...c, updatedAt: new Date().toISOString() };
  await data().setJSON(`collab/${x.id}.json`, x);
  return x;
}

export async function deleteCollab(cid: string) {
  await data().delete(`collab/${cid}.json`);
}

export async function listCollabs(): Promise<Collab[]> {
  const st = data();
  const { blobs } = await st.list({ prefix: "collab/" });
  const rows: Collab[] = [];
  for (const b of blobs) {
    const v = await st.get(b.key, { type: "json" }) as Collab | null;
    if (v?.id) rows.push(v);
  }
  return rows.sort((a, b) => b.createdAt.localeCompare(a.createdAt));
}

export function createCollab(x: { title: string; kinds: string[]; description: string; need: string; deadline: string; name: string; email: string; personId: string }, keyHash: string): Collab {
  const at = new Date().toISOString();
  return {
    id: id(), keyHash, title: x.title, kinds: x.kinds, description: x.description, need: x.need, deadline: isDate(x.deadline) ? x.deadline : "",
    requester: { name: x.name, email: x.email, personId: x.personId }, joiners: [], status: "open", teamId: "", createdAt: at, updatedAt: at,
  };
}

// מה שכולם רואים: בלי מיילים ובלי המפתח.
export function publicCollab(c: Collab) {
  return {
    id: c.id, title: c.title, kinds: c.kinds, description: c.description, need: c.need, deadline: c.deadline,
    requester: c.requester.name, requesterId: c.requester.personId, joiners: c.joiners.map(j => j.name),
    status: c.status, statusLabel: STATUS_LABELS[c.status], hasTeam: !!c.teamId, createdAt: c.createdAt,
  };
}

// מה שהמבקשת רואה בקישור הניהול.
export function ownerCollab(c: Collab) {
  const { keyHash, ...rest } = c;
  return { ...rest, statusLabel: STATUS_LABELS[c.status], statuses: STATUS_LABELS };
}

// ---------- רעיונות למחקר: שידוך חוקרות סביב נישה ריקה במחקר ----------
// המודל מקבל את כרטיסי הנבחרת ורשימת מאמרים עדכניים מהאתר, ומציע רעיונות. הוא יכול להפנות רק למאמרים מהרשימה
// (לפי מזהה), ולכן כל קישור בכרטיס הוא קישור אמיתי מהאתר. ההצעות נשמרות כטיוטה, ומנהלת המערכת מפרסמת.
export const RESEARCH_MODEL = "claude-opus-5-5";

export type ResearchStatus = "draft" | "open" | "team" | "closed";
export const RESEARCH_STATUS: Record<ResearchStatus, string> = { draft: "טיוטה (רק את רואה)", open: "מחפש יוזמות ויוזמים", team: "נפתח מרחב עבודה", closed: "נסגר" };

export type ArticleRef = { title: string; authors: string; year: string; source: string; url: string; note: string };
export type Initiator = { id: string; name: string; email: string; note: string; at: string; personId: string };
export type Research = {
  id: string; status: ResearchStatus; title: string; gap: string; idea: string; questions: string[]; approach: string; firstStep: string;
  researchers: { personId: string; name: string; why: string }[]; articles: ArticleRef[]; initiators: Initiator[];
  teamId: string; notified: number; createdAt: string; publishedAt: string; updatedAt: string;
};
export type RunArticle = { ref: string; title: string; authors: string; year: string; source: string; url: string; summary: string };
export type Run = { id: string; at: string; articles: RunArticle[]; people: { id: string; name: string }[] };

// הרעיונות הראשונים (research-seed.mts): טיוטה עד שמפרסמים. מה שנשמר בשרת גובר, ומחיקה נשמרת כסימון.
const SEED_AT = "2026-10-11T09:00:00.000Z";
function seedResearch(x: typeof RESEARCH_SEED[number]): Research {
  const at = (x as { createdAt?: string }).createdAt || SEED_AT;
  return {
    ...JSON.parse(JSON.stringify(x)), status: "draft", initiators: [], teamId: "", notified: 0,
    createdAt: at, publishedAt: "", updatedAt: at,
  };
}

export async function getResearch(rid: string): Promise<Research | null> {
  if (!/^[\w-]{6,80}$/.test(rid)) return null;
  const v = await data().get(`research/${rid}.json`, { type: "json" }) as (Research & { deleted?: boolean }) | null;
  if (v) return v.deleted ? null : v;
  const seed = RESEARCH_SEED.find(x => x.id === rid);
  return seed ? seedResearch(seed) : null;
}
export async function saveResearch(r: Research): Promise<Research> {
  const x = { ...r, updatedAt: new Date().toISOString() };
  await data().setJSON(`research/${x.id}.json`, x);
  return x;
}
export async function deleteResearch(rid: string) {
  if (RESEARCH_SEED.some(x => x.id === rid)) await data().setJSON(`research/${rid}.json`, { id: rid, deleted: true });
  else await data().delete(`research/${rid}.json`);
}
export async function listResearch(): Promise<Research[]> {
  const st = data();
  const { blobs } = await st.list({ prefix: "research/" });
  const rows: Research[] = [];
  const stored = new Set<string>();
  for (const b of blobs) {
    const v = await st.get(b.key, { type: "json" }) as (Research & { deleted?: boolean }) | null;
    if (!v?.id) continue;
    stored.add(v.id);
    if (!v.deleted) rows.push(v);
  }
  for (const x of RESEARCH_SEED) if (!stored.has(x.id)) rows.push(seedResearch(x));
  return rows.sort((a, b) => (b.publishedAt || b.createdAt).localeCompare(a.publishedAt || a.createdAt));
}
export async function saveRun(run: Run) {
  await data().setJSON(`research-runs/${run.id}.json`, run);
}
export async function getRun(runId: string): Promise<Run | null> {
  if (!/^[\w-]{6,80}$/.test(runId)) return null;
  return await data().get(`research-runs/${runId}.json`, { type: "json" }) as Run | null;
}

export function publicResearch(r: Research) {
  return {
    id: r.id, status: r.status, statusLabel: RESEARCH_STATUS[r.status], title: r.title, gap: r.gap, idea: r.idea, questions: r.questions,
    approach: r.approach, firstStep: r.firstStep, researchers: r.researchers, articles: r.articles,
    initiators: r.initiators.map(i => i.name), hasTeam: !!r.teamId, notified: r.notified, createdAt: r.createdAt, publishedAt: r.publishedAt,
  };
}

const str = { type: "string" } as const;
const obj = (props: Record<string, unknown>) => ({ type: "object", additionalProperties: false, required: Object.keys(props), properties: props });
export const RESEARCH_SCHEMA = obj({
  proposals: {
    type: "array",
    items: obj({
      title: str, gap: str, idea: str, questions: { type: "array", items: str }, approach: str, firstStep: str,
      researchers: { type: "array", items: obj({ id: str, why: str }) },
      articles: { type: "array", items: obj({ ref: str, note: str }) },
    }),
  },
});

export const RESEARCH_SYSTEM = `את/ה עוזר/ת מחקר של קהילה אקדמית מקצועית בישראל: "בינה מלאכותית: חוסן-חינוך-חרום". בקהילה חוקרות וחוקרים, מרצות ואנשי שטח בתחומי חוסן, חינוך בחירום, רציפות למידה, צוותי חינוך ומנהיגות, ובינה מלאכותית וסימולציות בחינוך.

המשימה: להציע "שידוכים למחקר". כל הצעה היא רעיון למחקר משותף שנשען על נישה ריקה במחקר העדכני, וצוות מוצע מתוך חברי הקהילה.

מה זו נישה ריקה:
- שאלה שהמחקרים העדכניים ברשימה עוד לא עונים עליה: הקשר שלא נבדק (למשל ישראל, החברה הערבית, הפריפריה, גיל מסוים, צוותי חינוך ולא תלמידים), שיטה שלא נוסתה, חיבור בין שני תחומים שנחקרו כל אחד לחוד, או ממצא שעוד לא נבחן בשטח.
- הנישה מנוסחת מתוך המאמרים: מה הם כבר מראים, ומה חסר. לא ממציאים ממצאים ולא מייחסים למאמר דבר שלא כתוב בתקציר שלו.

הצוות:
- 2 עד 4 חברי קהילה לכל הצעה, רק מהרשימה, לפי המזהה (id).
- משלבים מומחיות משלימה: למשל מי שמכירה את השטח עם מי שמובילה מחקר הערכה, או מי שמפתחת כלים עם מי שמכירה מדיניות.
- נשענים על מה שכל אחד כתב שהוא יכול לקדם ועל תחומי העיסוק שלו. ב-why כותבים בקצרה מה הוא או היא מביאים לרעיון הזה.
- מפזרים: כל חבר/ה בקהילה מופיע/ה לכל היותר בשתי הצעות, וכדאי שכמה שיותר אנשים יקבלו הצעה.

המאמרים:
- 2 עד 4 מאמרים לכל הצעה, רק מהרשימה, לפי ה-ref. אסור להמציא מאמרים או קישורים.
- ב-note: משפט אחד, מה המאמר מראה ולמה הוא רלוונטי לנישה.

הכתיבה:
- עברית פשוטה, ישירה וברורה, משפטים מלאים. בלי מקף ארוך (—).
- title: כותרת קצרה שעומדת בפני עצמה.
- gap: שניים או שלושה משפטים: מה ידוע ומה חסר.
- idea: שניים או שלושה משפטים: מה חוקרים, עם מי ואיפה.
- questions: שאלת מחקר אחת עד שלוש, כל אחת מובנת בלי הסבר.
- approach: איך אפשר לחקור, בשניים או שלושה משפטים (אוכלוסייה, שיטה, כלים).
- firstStep: צעד ראשון קטן לצוות, שאפשר לעשות השבוע.
- כל רעיון שונה מהאחרים ומהרעיונות שכבר הוצעו בקהילה.`;

export function researchPrompt(input: {
  people: { id: string; name: string; institution: string; description: string; offer: string; topics: string }[];
  articles: RunArticle[]; existing: string[]; count: number; focus: string;
}) {
  const people = input.people.map(p => `<person id="${p.id}">\nשם: ${p.name}\nמוסד: ${p.institution}\nתחומי עיסוק: ${p.description}\nמה אני יכול/ה לקדם: ${p.offer || "לא נכתב"}\nתחומי עניין: ${p.topics}\n</person>`).join("\n");
  const articles = input.articles.map(a => `<article ref="${a.ref}">\n${a.title} (${a.year || "שנה לא ידועה"})${a.authors ? `\nמחברים: ${a.authors}` : ""}${a.source ? `\nמקור: ${a.source}` : ""}\nתקציר: ${a.summary || "אין תקציר"}\n</article>`).join("\n");
  return `<members>\n${people}\n</members>\n\n<recent_articles>\n${articles}\n</recent_articles>\n\n${input.existing.length ? `<existing_ideas>\n${input.existing.join("\n")}\n</existing_ideas>\n\n` : ""}הציעו ${input.count} שידוכים למחקר.${input.focus ? `\nכיוון שמנהלת הקהילה ביקשה להתמקד בו: ${input.focus}` : ""}`;
}
