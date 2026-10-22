// זירת קבוצות משימה להגשות משותפות.
// אין באתר חשבונות משתמשות, ולכן סביבת העבודה של כל קבוצה נפתחת בקישור סודי (מפתח).
// בשרת נשמר רק גיבוב של המפתח.
import { id, store } from "./shared.mts";

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
export type Section = { id: string; title: string; hint?: string; text: string; version: number; updatedBy?: string; updatedAt?: string };
export type Task = { id: string; text: string; owner?: string; due?: string; done: boolean };
export type Message = { id: string; name: string; text: string; at: string };
export type Link = { id: string; label: string; url: string };
export type Team = {
  id: string; keyHash: string; memberKeys?: string[]; leadKeys?: string[]; keyOwners?: Record<string, string>; title: string; summary: string; need: string;
  callId?: string; callTitle?: string; funder?: string; deadline?: string; internal: boolean; origin?: string;
  status: TeamStatus; lead: { name: string; email?: string };
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
  const rows: Team[] = [];
  for (const b of blobs) {
    const v = await st.get(b.key, { type: "json" }) as Team | null;
    if (v?.id) rows.push(v);
  }
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
  if (h === t.keyHash || (t.leadKeys || []).includes(h)) return { team: t, role: "lead", hash: h, me: me || t.lead.name };
  if ((t.memberKeys || []).includes(h)) return { team: t, role: "member", hash: h, me };
  return null;
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
  };
}

// מה שחברות הקבוצה רואות בסביבת העבודה.
export function workspaceTeam(t: Team) {
  const { keyHash, memberKeys, leadKeys, keyOwners, ...rest } = t;
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
    createdAt: at, updatedAt: at,
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

export function newItemId() {
  return id().slice(0, 8);
}
