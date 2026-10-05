// תיבת פניות: כל הפניות שמגיעות מהאתר במקום אחד, עם סטטוס והערות — למעקב גם כשיש עשרות.
import { id, store } from "./shared.mts";

export type RequestType = "nevet" | "call" | "feedback" | "idea" | "source" | "join";
export type RequestStatus = "new" | "in_progress" | "done";
export type InboxRequest = {
  id: string; type: RequestType; name: string; email: string; subject: string; body: string; link: string;
  at: string; status: RequestStatus; note: string; updatedAt: string; data?: Record<string, unknown>;
  replies?: { at: string; subject: string; text: string }[];
};

export const TYPE_LABELS: Record<RequestType, string> = {
  nevet: "🌱 בקשת גישה לנבט", call: "📢 הצעת קול קורא", feedback: "💬 בקשה / תיקון / רעיון / תקלה",
  idea: "🤝 הצעה לשיתוף פעולה", source: "📚 הצעת מקור למחקר", join: "🙋 בקשת הצטרפות לקהילה",
};

const data = () => store("hosen-data");
const clip = (v: unknown, n: number) => String(v ?? "").trim().slice(0, n);

export async function addRequest(x: { type: RequestType; name: string; email: string; subject: string; body: string; link?: string; data?: Record<string, unknown> }) {
  const at = new Date().toISOString();
  const r: InboxRequest = {
    id: `${at.replace(/[-:.TZ]/g, "").slice(0, 14)}-${id().slice(0, 6)}`, type: x.type,
    name: clip(x.name, 160), email: clip(x.email, 240), subject: clip(x.subject, 300) || TYPE_LABELS[x.type],
    body: clip(x.body, 6000), link: clip(x.link, 300), at, status: "new", note: "", updatedAt: at, ...(x.data ? { data: x.data } : {}),
  };
  await data().setJSON(`requests/${r.id}.json`, r);
  return r;
}

export async function listRequests(): Promise<InboxRequest[]> {
  const st = data();
  const { blobs } = await st.list({ prefix: "requests/" });
  const rows: InboxRequest[] = [];
  for (const b of blobs) { const v = await st.get(b.key, { type: "json" }) as InboxRequest | null; if (v?.id) rows.push(v); }
  return rows.sort((a, b) => b.at.localeCompare(a.at));
}

export async function updateRequest(rid: string, patch: { status?: string; note?: string }) {
  if (!/^[\w-]{6,60}$/.test(rid)) return null;
  const v = await data().get(`requests/${rid}.json`, { type: "json" }) as InboxRequest | null;
  if (!v) return null;
  if (patch.status && ["new", "in_progress", "done"].includes(patch.status)) v.status = patch.status as RequestStatus;
  if (patch.note !== undefined) v.note = clip(patch.note, 2000);
  v.updatedAt = new Date().toISOString();
  await data().setJSON(`requests/${rid}.json`, v);
  return v;
}

// תשובה שנשלחה מתוך תיבת הפניות — נשמרת בהיסטוריה של הפנייה.
export async function addReply(rid: string, reply: { subject: string; text: string }, status?: string) {
  const v = await getRequest(rid);
  if (!v) return null;
  const at = new Date().toISOString();
  v.replies = [...(v.replies || []), { at, subject: clip(reply.subject, 300), text: clip(reply.text, 8000) }].slice(-20);
  if (status && ["new", "in_progress", "done"].includes(status)) v.status = status as RequestStatus;
  else if (v.status === "new") v.status = "in_progress";
  v.updatedAt = at;
  await data().setJSON(`requests/${rid}.json`, v);
  return v;
}

export async function getRequest(rid: string): Promise<InboxRequest | null> {
  if (!/^[\w-]{6,60}$/.test(rid)) return null;
  return await data().get(`requests/${rid}.json`, { type: "json" }) as InboxRequest | null;
}

export async function getDigestState(): Promise<{ lastAt: string }> {
  return (await data().get("requests-meta/digest.json", { type: "json" }) as { lastAt: string } | null) || { lastAt: "" };
}

export async function setDigestState(lastAt: string) {
  await data().setJSON("requests-meta/digest.json", { lastAt });
}
