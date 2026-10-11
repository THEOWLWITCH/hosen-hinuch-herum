// שידוכים בקהילה: מה כל אחת יכולה לקדם, בקשות לשיתוף פעולה והצטרפות אליהן.
// מבוסס על טבלת "קבוצת עניין: בינה מלאכותית, חוסן, חינוך, חירום" (שם, שיוך, מייל, טלפון,
// והפעילות, הרעיון או הנושא שאוכל לקדם).
// אין באתר חשבונות, ולכן ניהול בקשה נעשה בקישור סודי (מפתח), כמו בקבוצות המשימה. בשרת נשמר רק גיבוב.
import { id, store } from "./shared.mts";

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
export const STATUS_LABELS: Record<CollabStatus, string> = { open: "מחפשת שותפות", matched: "נמצאו שותפות", closed: "נסגרה" };

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
