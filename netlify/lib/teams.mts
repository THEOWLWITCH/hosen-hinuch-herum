// זירת קבוצות משימה להגשות משותפות.
// אין באתר חשבונות משתמשות, ולכן סביבת העבודה של כל קבוצה נפתחת בקישור סודי (מפתח).
// בשרת נשמר רק גיבוב של המפתח.
import { id, store, pool } from "./shared.mts";

export type TeamStatus = "recruiting" | "writing" | "submitted" | "won" | "closed";
export const TEAM_STATUS: Record<TeamStatus, string> = {
  recruiting: "מגייסת שותפות",
  writing: "בכתיבה",
  submitted: "ההצעה הוגשה",
  won: "🏆 זכתה במענק",
  closed: "נסגרה",
};

export type Member = { name: string; email?: string; role?: string; joinedAt: string };
export type JoinRequest = { id: string; name: string; email?: string; note?: string; at: string };
// קובץ או קישור מצורף (5.11.2026): בסעיף של ההצעה, בהודעה בדיון או בלשונית הקישורים.
export type Attachment = { id: string; kind: "file" | "link"; label: string; key?: string; url?: string; size?: number; by?: string; at?: string };
export type Section = { id: string; title: string; hint?: string; text: string; version: number; updatedBy?: string; updatedAt?: string; attachments?: Attachment[] };
export type Task = { id: string; text: string; owner?: string; due?: string; done: boolean };
export type Message = { id: string; name: string; text: string; at: string; attachments?: Attachment[] };
export type Link = { id: string; label: string; url: string; key?: string; size?: number };
export type Team = {
  id: string; keyHash: string; memberKeys?: string[]; leadKeys?: string[]; keyOwners?: Record<string, string>; keysV2?: boolean; title: string; summary: string; need: string;
  callId?: string; callTitle?: string; funder?: string; deadline?: string; internal: boolean; origin?: string;
  status: TeamStatus; lead: { name: string; email?: string };
  // מרחב סגור (5.11.2026): אחרי שהצוות התגבש, המוביל/ה סוגר/ת את המרחב בקוד צוות. אין הצטרפות חדשה,
  // והדיון והחומרים נפתחים לחברי/ות הצוות רק עם הקוד. בכרטיס הציבורי נשארים התקציר ושמות החוקרים/ות.
  locked?: boolean; lockHash?: string; lockedAt?: string;
  // הקוד עצמו נשמר כדי שמנהלת המערכת והמוביל/ה יוכלו לראות אותו ולעזור (5.11.2026). לא נשלח לחברי/ות הצוות ולא לכרטיס הציבורי.
  lockCode?: string;
  // הפעילות האחרונה במרחב (פתיחה או עבודה בו). הנורית בכרטיס דולקת שבוע מאז (5.11.2026).
  activeAt?: string;
  members: Member[]; requests: JoinRequest[]; sections: Section[]; tasks: Task[]; messages: Message[]; links: Link[];
  createdAt: string; updatedAt: string;
};

// מבנה ההצעה: סעיפים מקובלים בהצעות למענקי מחקר, עם הנחיה קצרה לכל סעיף.
const DEFAULT_SECTIONS: [string, string, string][] = [
  ["summary", "תקציר", "עד 300 מילים: הבעיה, שאלת המחקר, השיטה והתרומה הצפויה."],
  ["fit", "התאמה לקול הקורא", "תנאי הסף, דרישות החובה ואמות המידה לשיפוט — ואיך ההצעה עונה על כל אחת מהן."],
  ["background", "רקע וסקירת ספרות", "מה כבר ידוע, מה חסר, ולמה דווקא עכשיו."],
  ["aims", "שאלות ומטרות המחקר", "שאלה מרכזית אחת, ושתיים–שלוש שאלות משנה שאפשר למדוד."],
  ["method", "שיטה", "אוכלוסייה ודגימה, כלים, איסוף נתונים וניתוח."],
  ["innovation", "חדשנות ותרומה צפויה", "מה חדש כאן — לידע, למדיניות ולשדה."],
  ["team", "הצוות וחלוקת התפקידים", "מי מביאה איזו מומחיות, ומי אחראית על מה."],
  ["timeline", "לוח זמנים ואבני דרך", "שלבים, תוצרים ומועדים."],
  ["budget", "תקציב", "כוח אדם, ציוד, נסיעות, השתתפות ותקורה — לפי כללי הגוף המממן."],
  ["dissemination", "הפצה ויישום בשטח", "איך הממצאים יגיעו לבתי ספר, לרשויות ולקובעי מדיניות."],
  ["ethics", "אתיקה", "אישורים נדרשים, הסכמה מדעת ופרטיות."],
  ["refs", "ביבליוגרפיה", "בסגנון APA 7."],
];

const data = () => store("hosen-data");
const now = () => new Date().toISOString();
export const clip = (v: unknown, n: number) => String(v ?? "").trim().slice(0, n);

export function newKey(): string {
  const b = crypto.getRandomValues(new Uint8Array(24));
  return btoa(String.fromCharCode(...b)).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

export async function hashKey(key: string): Promise<string> {
  const d = await crypto.subtle.digest("SHA-256", new TextEncoder().encode("team:" + key));
  return [...new Uint8Array(d)].map(b => b.toString(16).padStart(2, "0")).join("");
}

export async function getTeam(teamId: string): Promise<Team | null> {
  if (!/^[\w-]{6,80}$/.test(teamId)) return null;
  return await data().get(`teams/${teamId}.json`, { type: "json" }) as Team | null;
}

export async function saveTeam(t: Team): Promise<Team> {
  const x = { ...t, updatedAt: now() };
  await data().setJSON(`teams/${x.id}.json`, x);
  return x;
}

export async function deleteTeam(teamId: string) {
  await data().delete(`teams/${teamId}.json`);
}

export async function listTeams(): Promise<Team[]> {
  const st = data();
  const { blobs } = await st.list({ prefix: "teams/" });
  // קריאה במקביל: קריאה אחת-אחת מאטה ככל שיש יותר קבוצות (5.11.2026).
  const rows = (await pool(blobs, b => (st.get(b.key, { type: "json" }) as Promise<Team | null>).catch(() => null))).filter((v): v is Team => !!v?.id);
  return rows.sort((a, b) => b.createdAt.localeCompare(a.createdAt));
}

// תפקיד בסביבת העבודה: "lead" — מי שמנהל/ת את המרחב (מפתח ההקמה, או כניסה חוזרת עם המייל של המוביל/ה);
// "member" — חבר/ה בצוות: כותב/ת, מוסיף/ה ומשתתף/ת בדיון, אבל לא מוחק/ת ולא מנהל/ת.
export type TeamRole = "lead" | "member";
export type TeamAccess = { team: Team; role: TeamRole; hash: string; me: string };

export async function openTeamAccess(teamId: string, key: string): Promise<TeamAccess | null> {
  const t = await getTeam(teamId);
  if (!t || !key) return null;
  const h = await hashKey(key);
  const me = (t.keyOwners || {})[h] || "";
  // קבוצות ותיקות (בלי keysV2): הקישור הישן של המוביל/ה הועבר בעבר גם לשותפים/ות, ולכן הוא כבר לא פותח את המרחב.
  // המוביל/ה נכנס/ת שוב במייל ובקוד הקהילה, וחברים/ות עם קישור אישי ממשיכים/ות כרגיל.
  if ((t.keysV2 && h === t.keyHash) || (t.leadKeys || []).includes(h)) return { team: t, role: "lead", hash: h, me: me || t.lead.name };
  if ((t.memberKeys || []).includes(h)) return { team: t, role: "member", hash: h, me };
  return null;
}

export async function hashLock(teamId: string, code: string): Promise<string> {
  const d = await crypto.subtle.digest("SHA-256", new TextEncoder().encode("teamlock:" + teamId + ":" + String(code || "").trim()));
  return [...new Uint8Array(d)].map(b => b.toString(16).padStart(2, "0")).join("");
}
// מרחב סגור: חבר/ה בצוות צריך/ה גם את קוד הצוות. המוביל/ה נכנס/ת בקישור האישי שלו/ה.
export async function lockOK(t: Team, role: TeamRole, code: unknown): Promise<boolean> {
  if (!t.locked || !t.lockHash || role === "lead") return true;
  return !!String(code || "").trim() && (await hashLock(t.id, String(code))) === t.lockHash;
}

export async function openTeam(teamId: string, key: string): Promise<Team | null> {
  return (await openTeamAccess(teamId, key))?.team || null;
}

// מפתח אישי חדש: נשמר רק הגיבוב, יחד עם השם של מי שקיבל/ה אותו.
export async function issueKey(t: Team, role: TeamRole, owner: string): Promise<string> {
  const key = newKey();
  const h = await hashKey(key);
  if (role === "lead") t.leadKeys = [...(t.leadKeys || []), h].slice(-20);
  else t.memberKeys = [...(t.memberKeys || []), h].slice(-80);
  const live = new Set([t.keyHash, ...(t.leadKeys || []), ...(t.memberKeys || [])]);
  t.keyOwners = Object.fromEntries(Object.entries({ ...(t.keyOwners || {}), [h]: owner }).filter(([k]) => live.has(k)));
  return key;
}

// מה שכולם רואים: מי בקבוצה ומה היא מחפשת — בלי נוסח ההצעה ובלי כתובות מייל.
export function publicTeam(t: Team) {
  return {
    id: t.id, title: t.title, summary: t.summary, need: t.need, status: t.status, statusLabel: TEAM_STATUS[t.status],
    callId: t.callId || "", callTitle: t.callTitle || "", funder: t.funder || "", deadline: t.deadline || "", internal: t.internal, origin: t.origin || "",
    lead: t.lead.name, members: t.members.map(m => m.name), requests: t.requests.length, createdAt: t.createdAt,
    locked: !!t.locked, activeAt: t.activeAt || t.updatedAt || t.createdAt,
  };
}

// מה שחברות הקבוצה רואות בסביבת העבודה.
export function workspaceTeam(t: Team) {
  const { keyHash, memberKeys, leadKeys, keyOwners, lockHash, lockCode, ...rest } = t;
  return { ...rest, statusLabel: TEAM_STATUS[t.status], statuses: TEAM_STATUS };
}

export function createTeam(input: {
  title: string; summary: string; need: string; callId?: string; callTitle?: string; funder?: string; deadline?: string;
  leadName: string; leadEmail?: string; origin?: string;
}, keyHash: string): Team {
  const at = now();
  return {
    id: id(), keyHash, title: input.title, summary: input.summary, need: input.need,
    callId: input.callId || "", callTitle: input.callTitle || "", funder: input.funder || "",
    deadline: /^\d{4}-\d{2}-\d{2}$/.test(input.deadline || "") ? input.deadline : "",
    internal: !input.callId, status: "recruiting", origin: input.origin === "nevet" ? "nevet" : "",
    lead: { name: input.leadName, email: input.leadEmail || "" },
    members: [{ name: input.leadName, email: input.leadEmail || "", role: "מובילה", joinedAt: at }],
    requests: [], tasks: [], messages: [], links: [],
    sections: DEFAULT_SECTIONS.map(([sid, title, hint]) => ({ id: sid, title, hint, text: "", version: 0 })),
    keysV2: true, createdAt: at, updatedAt: at,
  };
}

export function cleanUrl(raw: unknown): string {
  try {
    const u = new URL(clip(raw, 1200));
    return /^https?:$/.test(u.protocol) ? u.toString() : "";
  } catch {
    return "";
  }
}

// מצורפים מהדפדפן: קבצים רק מהתיקייה של הקבוצה, קישורים רק http/https. עד 10.
export function cleanAttachments(teamId: string, rows: unknown, by: string): Attachment[] {
  const at = new Date().toISOString();
  return (Array.isArray(rows) ? rows : []).slice(0, 10).map((r: any) => {
    if (r?.kind === "file") {
      const key = clip(r.key, 400);
      if (!key.startsWith(`teamfiles/${teamId}/`)) return null;
      return { id: newItemId(), kind: "file", label: clip(r.label || r.name, 200) || "קובץ", key, size: Number(r.size) || 0, by, at } as Attachment;
    }
    const url = cleanUrl(r?.url);
    if (!url) return null;
    return { id: newItemId(), kind: "link", label: clip(r.label, 200) || url, url, by, at } as Attachment;
  }).filter(Boolean) as Attachment[];
}

export function newItemId() {
  return id().slice(0, 8);
}
