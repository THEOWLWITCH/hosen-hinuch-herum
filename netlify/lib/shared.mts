import { getStore } from "@netlify/blobs";

export function store(name: string) {
  return getStore({ name, consistency: "strong" });
}

export function json(data: unknown, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      "content-type": "application/json; charset=utf-8",
      "cache-control": "no-store",
    },
  });
}

function secret() {
  return Netlify.env.get("EDITOR_SECRET") || "";
}

function hex(buf: ArrayBuffer) {
  return [...new Uint8Array(buf)]
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

async function hmac(payload: string) {
  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(secret()),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  return hex(await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(payload)));
}

// calls — צוות אישור הקולות הקוראים (קוד נפרד, CALLS_CODE): רק ניהול הקולות הקוראים.
export type AccessRole = "admin" | "uploader" | "calls";

export async function issueToken(role: AccessRole = "admin") {
  const exp = Date.now() + 12 * 60 * 60 * 1000;
  const payload = `${role}:${exp}`;
  return `${payload}.${await hmac(payload)}`;
}

export async function validToken(req: Request, allowed: AccessRole | AccessRole[] = "admin") {
  const role = await tokenRole(req);
  const roles = Array.isArray(allowed) ? allowed : [allowed];
  return !!role && roles.includes(role);
}

export async function tokenRole(req: Request): Promise<AccessRole | null> {
  const h = req.headers.get("authorization") || "";
  if (!h.startsWith("Bearer ")) return null;
  const token = h.slice(7);
  const dot = token.lastIndexOf(".");
  if (dot < 1) return null;
  const payload = token.slice(0, dot);
  const sig = token.slice(dot + 1);
  if (!sig || sig !== (await hmac(payload))) return null;

  let role: AccessRole = "admin";
  let exp = 0;
  if (/^\d+$/.test(payload)) {
    // Backward compatibility for editor tokens issued before role separation.
    exp = Number(payload);
  } else {
    const m = payload.match(/^(admin|uploader|calls):(\d+)$/);
    if (!m) return null;
    role = m[1] as AccessRole;
    exp = Number(m[2]);
  }
  if (!Number.isFinite(exp) || exp < Date.now()) return null;
  return role;
}

// קישור אישי לחברת נבחרת (בחירת תחומי עניין): חתום, בתוקף 60 יום, בלי קוד.
export async function issueMemberToken(personId: string, days = 60) {
  const payload = `member:${personId}:${Date.now() + days * 86400000}`;
  return `${payload}.${await hmac(payload)}`;
}

export async function memberFromToken(token: string): Promise<string | null> {
  const dot = String(token || "").lastIndexOf(".");
  if (dot < 1) return null;
  const payload = token.slice(0, dot), sig = token.slice(dot + 1);
  const m = payload.match(/^member:([\w-]{1,80}):(\d+)$/);
  if (!m || !sig || sig !== (await hmac(payload)) || Number(m[2]) < Date.now()) return null;
  return m[1];
}

// טפסים פתוחים לכולן (בלי קוד): הגנה שקטה מספאם — שדה מלכודת שאדם לא רואה,
// ומינימום זמן מילוי. בנוסף יש מגבלת קצב בכל נקודת קצה.
// קוד הקהילה: לפעולות של חברות הקהילה באתר (הודעות, קבוצות משימה, הצעת קול קורא).
export function communityCodeOK(code: unknown): boolean {
  const expected = Netlify.env.get("BOARD_CODE") || "";
  return !!expected && String(code ?? "").trim() === expected;
}

export function looksHuman(body: any): boolean {
  if (body?.website) return false;
  const elapsed = Number(body?.elapsed);
  return Number.isFinite(elapsed) && elapsed >= 2500;
}

export function id() {
  return crypto.randomUUID();
}

export function safeName(name: string) {
  return name.replace(/[^\p{L}\p{N}._-]+/gu, "-").slice(0, 120) || "file";
}
