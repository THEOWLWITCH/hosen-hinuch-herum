import { store } from "./shared.mts";
import { sendMail } from "./calls.mts";

// קוד אישי לחברות וחברי הקהילה: נכנסים איתו לעדכון הכרטיס, בלי קישור במייל.
// הקוד נשמר מוצפן (כדי שאפשר יהיה לשלוח אותו שוב לפי המייל), ואינדקס לפי גיבוב
// מוצא את הכרטיס בכניסה. הקוד לא נשמר בכרטיס עצמו, שמוצג באתר.
const ALPHABET = "23456789ABCDEFGHJKMNPQRSTUVWXYZ"; // בלי 0/O ו-1/I/L, שקל לבלבל ביניהם
const data = () => store("hosen-data");
const recKey = (pid: string) => `member-code/p/${pid}.json`;
const idxKey = (hash: string) => `member-code/i/${hash}.json`;

type CodeRecord = { iv: string; enc: string; hash: string; createdAt: string };

const secret = () => Netlify.env.get("EDITOR_SECRET") || "";
const b64 = (u: Uint8Array) => btoa(String.fromCharCode(...u));
const unb64 = (s: string) => Uint8Array.from(atob(s), c => c.charCodeAt(0));

export function normalizeCode(v: unknown): string {
  return String(v ?? "").toUpperCase().replace(/[^A-Z0-9]/g, "").slice(0, 16);
}

export function formatCode(code: string): string {
  return code.length === 8 ? `${code.slice(0, 4)}-${code.slice(4)}` : code;
}

function newCode(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(8));
  return [...bytes].map(b => ALPHABET[b % ALPHABET.length]).join("");
}

async function hashCode(code: string): Promise<string> {
  const key = await crypto.subtle.importKey("raw", new TextEncoder().encode(secret() + ":member-code"), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  const sig = new Uint8Array(await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(code)));
  return [...sig].map(b => b.toString(16).padStart(2, "0")).join("");
}

async function aesKey() {
  const raw = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(secret() + ":member-code-enc"));
  return crypto.subtle.importKey("raw", raw, { name: "AES-GCM" }, false, ["encrypt", "decrypt"]);
}

async function encrypt(code: string) {
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const enc = new Uint8Array(await crypto.subtle.encrypt({ name: "AES-GCM", iv }, await aesKey(), new TextEncoder().encode(code)));
  return { iv: b64(iv), enc: b64(enc) };
}

async function decrypt(r: CodeRecord): Promise<string | null> {
  try {
    const out = await crypto.subtle.decrypt({ name: "AES-GCM", iv: unb64(r.iv) }, await aesKey(), unb64(r.enc));
    return new TextDecoder().decode(out);
  } catch {
    return null;
  }
}

// הקוד הקיים של הכרטיס, או קוד חדש אם עוד אין (או אם fresh: קוד חדש שמבטל את הקודם).
export async function codeFor(pid: string, fresh = false): Promise<{ code: string; created: boolean }> {
  const st = data();
  const old = await st.get(recKey(pid), { type: "json" }) as CodeRecord | null;
  if (old && !fresh) {
    const code = await decrypt(old);
    if (code) return { code, created: false };
  }
  let code = "", hash = "";
  for (let i = 0; i < 5; i++) {
    code = newCode();
    hash = await hashCode(code);
    if (!(await st.get(idxKey(hash), { type: "json" }))) break;
  }
  await st.setJSON(idxKey(hash), { pid });
  await st.setJSON(recKey(pid), { ...(await encrypt(code)), hash, createdAt: new Date().toISOString() });
  if (old?.hash && old.hash !== hash) await st.delete(idxKey(old.hash)).catch(() => {});
  return { code, created: true };
}

export async function pidFromCode(input: unknown): Promise<string | null> {
  const code = normalizeCode(input);
  if (code.length !== 8) return null;
  const st = data();
  const hash = await hashCode(code);
  const idx = await st.get(idxKey(hash), { type: "json" }) as { pid?: string } | null;
  if (!idx?.pid) return null;
  // רק הקוד הנוכחי של הכרטיס פותח אותו.
  const rec = await st.get(recKey(idx.pid), { type: "json" }) as CodeRecord | null;
  return rec?.hash === hash ? idx.pid : null;
}

export async function hasCode(pid: string): Promise<boolean> {
  return !!(await data().get(recKey(pid), { type: "json" }));
}

function esc(s: string) {
  return String(s || "").replace(/[&<>"]/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c] || c));
}

// מייל עם הקוד: welcome (הצטרפות), invite (לחברים קיימים), recover (שחזור לפי המייל).
export async function codeMail(p: { name: string; email?: string }, code: string, site: string, kind: "welcome" | "invite" | "recover") {
  const link = `${site}/#my-card`;
  const intro: Record<typeof kind, string[]> = {
    welcome: ["ברוכה הבאה, וברוך הבא, לקהילה! הכרטיס שלך נפתח בעמוד הנבחרת."],
    invite: ["באתר הקהילה אפשר עכשיו לעדכן את הכרטיס האישי בעצמך, בקוד אישי, בלי לחכות לקישור במייל."],
    recover: ["ביקשת לשחזר את הקוד האישי שלך לאתר הקהילה. זה הקוד:"],
  };
  const lines = [
    `שלום ${p.name},`,
    ...intro[kind],
    `הקוד האישי שלך: ${formatCode(code)}`,
    "עם הקוד אפשר לעדכן את הכרטיס שלך בכל עת: התיאור, פרטי הקשר, תחומי העניין ומה שאפשר לקדם בקהילה. נכנסים בכפתור \"👤 הכרטיס שלי\" באתר.",
    "שכחת את הקוד? בכפתור \"שכחתי את הקוד\" כותבים את המייל שבכרטיס, והקוד נשלח שוב.",
    "הקוד אישי. כדאי לשמור אותו ולא להעביר אותו הלאה.",
  ];
  const html = `<div dir="rtl" style="font-family:Arial,sans-serif;max-width:600px;margin:auto;padding:8px 18px;color:#1d3445;line-height:1.7;font-size:15px">${lines.map(l => l.startsWith("הקוד האישי שלך:")
    ? `<p style="font-size:17px">הקוד האישי שלך: <strong dir="ltr" style="display:inline-block;padding:4px 12px;border-radius:8px;background:#eef6f2;letter-spacing:2px;font-family:monospace;font-size:20px">${esc(formatCode(code))}</strong></p>`
    : `<p>${esc(l)}</p>`).join("")}<p><a href="${esc(link)}" style="display:inline-block;padding:10px 18px;border-radius:999px;background:#2f6e4f;color:#fff;text-decoration:none"><strong>👤 לכרטיס שלי</strong></a></p><p style="font-size:12px;color:#6b7d88">בינה מלאכותית: חוסן-חינוך-חרום</p></div>`;
  const subject = kind === "recover" ? "הקוד האישי שלך לאתר הקהילה" : kind === "welcome" ? "ברוכים הבאים לקהילה: הקוד האישי שלך" : "קוד אישי לעדכון הכרטיס שלך באתר הקהילה";
  await sendMail(String(p.email), subject, html, lines.join("\n\n") + `\n\nלכרטיס שלי: ${link}`);
}
