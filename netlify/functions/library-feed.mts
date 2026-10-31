import type { Config } from "@netlify/functions";
import { json, store, validToken } from "../lib/shared.mts";
import { QUALITY_INFO, SECTION_LABELS, SUGGESTED_FEEDS, testFeed, TOPICS, approve, auditKeep, auditLibrary, collect, getFeeds, getHidden, getStatus, listInbox, purgeLowQuality, reject, removeFromLibrary, saveFeeds, setHidden } from "../lib/library-feed.mts";
import { RESEARCH_CATS, hebrewFor, kickHebrew } from "../lib/library-hebrew.mts";

const clip = (v: unknown, n: number) => String(v ?? "").trim().slice(0, n);

export default async (req: Request) => {
  const u = new URL(req.url);
  if (req.method === "GET") {
    // רשימת המקורות המוסתרים — לכולם, כדי שהספרייה לא תציג אותם.
    if (u.searchParams.get("hidden") === "1") return json(await getHidden());
    if (!(await validToken(req, "admin"))) return json({ error: "unauthorized" }, 401);
    const [inbox, status, feeds] = await Promise.all([listInbox(), getStatus(), getFeeds()]);
    if (u.searchParams.get("audit") === "1") return json({ audit: await auditLibrary() });
    return json({ inbox, status, feeds, sections: SECTION_LABELS, researchCats: RESEARCH_CATS, topics: TOPICS.map(t => ({ key: t.key, label: t.label })), quality: QUALITY_INFO, suggestedFeeds: SUGGESTED_FEEDS });
  }
  if (req.method !== "POST") return json({ error: "method" }, 405);
  if (!(await validToken(req, "admin"))) return json({ error: "unauthorized" }, 401);
  const body = await req.json().catch(() => ({} as any));
  const keys: string[] = (Array.isArray(body.keys) ? body.keys : [body.key]).map((k: unknown) => clip(k, 80)).filter(Boolean).slice(0, 200);

  switch (body.action) {
    // "✨ הכנה בעברית" למחקר אחד: מדור מוצע, "מה חדש" ו"התרומה".
    case "hebrew": {
      const st = store("hosen-data");
      const v = await st.get(`library-inbox/${keys[0]}.json`, { type: "json" }) as any;
      if (!v || v.status !== "new") return json({ error: "not_found", message: "המחקר כבר לא בתיבה." }, 404);
      const he = await hebrewFor(v);
      if (!he) return json({ error: "model", message: "ההכנה בעברית לא הצליחה כרגע. אפשר לנסות שוב, או לכתוב בעצמך." }, 502);
      await st.setJSON(`library-inbox/${v.key}.json`, { ...v, he });
      return json({ ok: true, he });
    }
    case "approve": {
      // אישור של מחקר אחד ל"חידושים במחקר" בלי עברית: מכינים אותה עכשיו.
      if (keys.length === 1 && body.edits && RESEARCH_CATS[String(body.edits.researchCat || "")] && !(String(body.edits.heSummary || "").trim() && String(body.edits.heWhy || "").trim())) {
        const v = await store("hosen-data").get(`library-inbox/${keys[0]}.json`, { type: "json" }) as any;
        const he = v?.he || (v ? await hebrewFor(v) : null);
        if (he) body.edits = { ...body.edits, heSummary: String(body.edits.heSummary || "").trim() || he.summary, heWhy: String(body.edits.heWhy || "").trim() || he.why };
      }
      let n = 0, research = 0, pending = 0;
      for (const k of keys) {
        const r = await approve(k, keys.length === 1 ? body.edits || {} : {});
        if (!r) continue;
        n++;
        if (r.research) { research++; if (r.research.pending) pending++; }
      }
      if (pending) await kickHebrew(u.origin, true);
      return json({ ok: true, approved: n, research, pending });
    }
    case "reject": {
      let n = 0;
      for (const k of keys) if (await reject(k)) n++;
      return json({ ok: true, rejected: n });
    }
    case "fetch": return json({ ok: true, status: await collect() });
    // סף האיכות (31.10.2026): ניקוי התיבה, ובדיקת איכות למקורות שכבר בספרייה.
    case "purge": return json({ ok: true, rejected: await purgeLowQuality() });
    case "audit-keep": { const itemId = clip(body.id, 120); if (itemId) await auditKeep(itemId); return json({ ok: true }); }
    case "audit-remove": {
      const ids: string[] = (Array.isArray(body.ids) ? body.ids : [body.id]).map((x: unknown) => clip(x, 120)).filter((x: string) => /^[\w-]{6,120}$/.test(x)).slice(0, 300);
      let n = 0;
      for (const itemId of ids) if (await removeFromLibrary(itemId)) n++;
      return json({ ok: true, removed: n });
    }
    case "feeds": return json({ ok: true, feeds: await saveFeeds(body.feeds) });
    case "testfeed": return json(await testFeed(String(body.url || "")));
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
