import type { Config } from "@netlify/functions";
import { json, store, validToken } from "../lib/shared.mts";
import { SECTION_LABELS, TOPICS, approve, collect, getFeeds, getHidden, getStatus, listInbox, reject, saveFeeds, setHidden } from "../lib/library-feed.mts";

const clip = (v: unknown, n: number) => String(v ?? "").trim().slice(0, n);

export default async (req: Request) => {
  const u = new URL(req.url);
  if (req.method === "GET") {
    // רשימת המקורות המוסתרים — לכולם, כדי שהספרייה לא תציג אותם.
    if (u.searchParams.get("hidden") === "1") return json(await getHidden());
    if (!(await validToken(req, "admin"))) return json({ error: "unauthorized" }, 401);
    const [inbox, status, feeds] = await Promise.all([listInbox(), getStatus(), getFeeds()]);
    return json({ inbox, status, feeds, sections: SECTION_LABELS, topics: TOPICS.map(t => ({ key: t.key, label: t.label })) });
  }
  if (req.method !== "POST") return json({ error: "method" }, 405);
  if (!(await validToken(req, "admin"))) return json({ error: "unauthorized" }, 401);
  const body = await req.json().catch(() => ({} as any));
  const keys: string[] = (Array.isArray(body.keys) ? body.keys : [body.key]).map((k: unknown) => clip(k, 80)).filter(Boolean).slice(0, 200);

  switch (body.action) {
    case "approve": {
      let n = 0;
      for (const k of keys) if (await approve(k, keys.length === 1 ? body.edits || {} : {})) n++;
      return json({ ok: true, approved: n });
    }
    case "reject": {
      let n = 0;
      for (const k of keys) if (await reject(k)) n++;
      return json({ ok: true, rejected: n });
    }
    case "fetch": return json({ ok: true, status: await collect() });
    case "feeds": return json({ ok: true, feeds: await saveFeeds(body.feeds) });
    case "hide": return json({ ok: true, hidden: await setHidden(clip(body.id, 200), true) });
    case "unhide": return json({ ok: true, hidden: await setHidden(clip(body.id, 200), false) });
    case "delete": {
      // מחיקת מקור שנוסף לספרייה (מהשרת). מקור מקוד העמוד — מוסתר במקום.
      const itemId = clip(body.id, 120);
      if (!/^[\w-]{6,120}$/.test(itemId)) return json({ error: "bad_id" }, 400);
      const st = store("hosen-data");
      const old = await st.get(`library/${itemId}.json`, { type: "json" }) as any;
      if (!old) return json({ ok: true, hidden: await setHidden(itemId, true) });
      if (old.fileKey) await store("hosen-files").delete(old.fileKey);
      await st.delete(`library/${itemId}.json`);
      return json({ ok: true, deleted: true });
    }
  }
  return json({ error: "unknown_action" }, 400);
};

export const config: Config = { path: "/api/library-feed" };
