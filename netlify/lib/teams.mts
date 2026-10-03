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
  id: string; keyHash: string; title: string; summary: string; need: string;
  callId?: string; callTitle?: string; funder?: string; deadline?: string; internal: boolean;
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

export async function openTeam(teamId: string, key: string): Promise<Team | null> {
  const t = await getTeam(teamId);
  if (!t || !key) return null;
  return (await hashKey(key)) === t.keyHash ? t : null;
}

// מה שכולם רואים: מי בקבוצה ומה היא מחפשת — בלי נוסח ההצעה ובלי כתובות מייל.
export function publicTeam(t: Team) {
  return {
    id: t.id, title: t.title, summary: t.summary, need: t.need, status: t.status, statusLabel: TEAM_STATUS[t.status],
    callId: t.callId || "", callTitle: t.callTitle || "", funder: t.funder || "", deadline: t.deadline || "", internal: t.internal,
    lead: t.lead.name, members: t.members.map(m => m.name), requests: t.requests.length, createdAt: t.createdAt,
  };
}

// מה שחברות הקבוצה רואות בסביבת העבודה.
export function workspaceTeam(t: Team) {
  const { keyHash, ...rest } = t;
  return { ...rest, statusLabel: TEAM_STATUS[t.status], statuses: TEAM_STATUS };
}

export function createTeam(input: {
  title: string; summary: string; need: string; callId?: string; callTitle?: string; funder?: string; deadline?: string;
  leadName: string; leadEmail?: string;
}, keyHash: string): Team {
  const at = now();
  return {
    id: id(), keyHash, title: input.title, summary: input.summary, need: input.need,
    callId: input.callId || "", callTitle: input.callTitle || "", funder: input.funder || "",
    deadline: /^\d{4}-\d{2}-\d{2}$/.test(input.deadline || "") ? input.deadline : "",
    internal: !input.callId, status: "recruiting",
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
