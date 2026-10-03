// עדכון לקהילה: מייל אישי לכל חברה וחבר, נשלח מהאתר דרך חיבור ה-Gmail.
import { id, store } from "./shared.mts";
import { firstName } from "./calls.mts";

const data = () => store("hosen-data");

function esc(s: string) {
  return String(s || "").replace(/[&<>"]/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c] || c));
}

// פנייה אישית: אם השורה הראשונה פותחת ב"שלום" — מחליפים אותה ב"שלום <שם פרטי>,". אחרת מוסיפים אותה.
export function personalize(body: string, name: string): string {
  const first = firstName(name);
  const greeting = first ? `שלום ${first},` : "שלום,";
  const lines = String(body || "").replace(/\r/g, "").split("\n");
  if (/^\s*שלום/.test(lines[0] || "")) lines[0] = greeting;
  else lines.unshift(greeting, "");
  return lines.join("\n");
}

const inline = (s: string) => esc(s)
  .replace(/\*\*(.+?)\*\*/g, "<strong>$1</strong>")
  .replace(/(https?:\/\/[^\s<]+[^\s<.,;:!?)\]])/g, '<a href="$1" style="color:#17649a">$1</a>');

// טקסט פשוט ← HTML: פסקאות, תבליטים ("- "), **הדגשה** וקישורים.
export function renderHtml(text: string, site: string): string {
  let html = "", list = false;
  const close = () => { if (list) { html += "</ul>"; list = false; } };
  for (const raw of String(text || "").split("\n")) {
    const l = raw.trim();
    if (!l) { close(); continue; }
    const m = l.match(/^[-•]\s+(.*)$/);
    if (m) { if (!list) { html += '<ul style="margin:0 0 12px;padding-inline-start:20px">'; list = true; } html += `<li style="margin:0 0 4px">${inline(m[1])}</li>`; continue; }
    close();
    html += `<p style="margin:0 0 12px">${inline(l)}</p>`;
  }
  close();
  return `<div dir="rtl" style="font-family:Arial,sans-serif;max-width:620px;margin:auto;padding:8px 18px;color:#1d3445;line-height:1.7;font-size:15px">${html}
<div style="margin-top:18px"><img src="${site}/assets/community-logo-email.jpg" alt="חוסן חינוך חרום" width="190" style="display:block;width:190px;max-width:190px;height:auto;border:0"></div></div>`;
}

export function plainText(text: string): string {
  return String(text || "").replace(/\*\*(.+?)\*\*/g, "$1");
}

export type MailLog = { id: string; at: string; subject: string; sent: number; failed: string[]; test: boolean };

export async function addLog(x: Omit<MailLog, "id" | "at">) {
  const row: MailLog = { ...x, id: id(), at: new Date().toISOString() };
  await data().setJSON(`community-mail/log/${row.at}-${row.id.slice(0, 6)}.json`, row);
  return row;
}

export async function listLog(limit = 10): Promise<MailLog[]> {
  const st = data();
  const { blobs } = await st.list({ prefix: "community-mail/log/" });
  const keys = blobs.map(b => b.key).sort().reverse().slice(0, limit);
  const rows: MailLog[] = [];
  for (const k of keys) { const v = await st.get(k, { type: "json" }) as MailLog | null; if (v) rows.push(v); }
  return rows;
}
