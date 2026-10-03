import type { Config } from "@netlify/functions";
import { json, looksHuman, tokenRole, validToken } from "../lib/shared.mts";
import { addRequest } from "../lib/requests.mts";
import {
  CALL_CATEGORIES, CATEGORY_LABELS, THEME_LABELS, type Call, addMemberSuggestion, buildIcs, callEmail, callEmailGeneric, callTopics,
  cleanCallFields, collectFromSources, sendAll, daysBetween, getCall, getOptOut, getSourceStatus, getSources, isOpen, israelToday, listCalls,
  listInbox, loadPeople, mailConfigured, matchPeople, newCall, personTopics, saveCall, saveOptOut, saveSources, sendMail,
  sendWeeklyDigests, setInboxStatus, siteUrl, weeklyDigest,
} from "../lib/calls.mts";
import { listTeams } from "../lib/teams.mts";


const t = (v: unknown, n: number) => String(v ?? "").trim().slice(0, n);

function publicCall(c: Call, today: string, people: Awaited<ReturnType<typeof loadPeople>>) {
  const { notified, fileKey, ...rest } = c;
  return {
    ...rest,
    fileUrl: fileKey ? `/api/file?key=${encodeURIComponent(fileKey)}` : "",
    topics: callTopics(c),
    daysLeft: c.endDate ? daysBetween(today, c.endDate) : null,
    matches: matchPeople(c, people).slice(0, 6).map(m => ({ id: m.id, name: m.name })),
  };
}

function byDeadline(a: Call, b: Call) {
  return (a.endDate || "9999").localeCompare(b.endDate || "9999") || a.title.localeCompare(b.title, "he");
}

export default async (req: Request) => {
  const u = new URL(req.url);
  const site = siteUrl(u.origin);
  const today = israelToday();

  if (req.method === "GET") {
    // יומן: כל המועדים הפתוחים, או קול קורא אחד (?id=).
    if (u.searchParams.get("format") === "ics") {
      const one = u.searchParams.get("id");
      let rows = (await listCalls()).filter(c => isOpen(c, today) && c.category === "calls");
      if (one) rows = rows.filter(c => c.id === one);
      return new Response(buildIcs(rows.sort(byDeadline), site), {
        headers: {
          "content-type": "text/calendar; charset=utf-8",
          "content-disposition": `${one ? "attachment" : "inline"}; filename="${one ? "call" : "calls"}.ics"`,
          "cache-control": "public, max-age=1800",
        },
      });
    }

    if (u.searchParams.get("admin") === "1") {
      const role = await tokenRole(req);
      if (role !== "admin" && role !== "calls") return json({ error: "unauthorized" }, 401);
      const [inbox, calls, people, sources, sourceStatus, optout] = await Promise.all([
        listInbox(), listCalls(), loadPeople(u.origin), getSources(), getSourceStatus(), getOptOut(),
      ]);
      const cutoff = new Date(Date.now() - 400 * 86400000).toISOString().slice(0, 10);
      return json({
        today, themes: THEME_LABELS, categories: CATEGORY_LABELS,
        inbox: inbox.map(x => ({ ...x, topics: callTopics(x) })),
        calls: calls.filter(c => !c.endDate || c.endDate >= cutoff).sort(byDeadline).map(c => ({
          ...c, topics: callTopics(c), open: isOpen(c, today),
          matches: matchPeople(c, people).map(m => ({ ...m, hasEmail: m.email.includes("@") })),
        })),
        people: people.map(p => ({ id: p.id, name: p.name, hasEmail: String(p.email || "").includes("@"), topics: personTopics(p) })),
        sources, sourceStatus, optout,
        mail: { configured: mailConfigured() }, role,
      });
    }

    const category = CALL_CATEGORIES.includes(u.searchParams.get("category") || "") ? u.searchParams.get("category")! : "calls";
    const [calls, people] = await Promise.all([listCalls(), loadPeople(u.origin)]);
    const mine = calls.filter(c => c.category === category && c.active !== false && !(c.startDate && c.startDate > today));
    const open = mine.filter(c => isOpen(c, today)).sort(byDeadline);
    const cutoff = new Date(Date.now() - 730 * 86400000).toISOString().slice(0, 10);
    const archive = mine.filter(c => c.endDate && c.endDate < today && c.endDate >= cutoff).sort((a, b) => b.endDate!.localeCompare(a.endDate!));
    return json({
      today, themes: THEME_LABELS,
      open: open.map(c => publicCall(c, today, people)),
      archive: archive.map(c => publicCall(c, today, people)),
      people: people.map(p => ({ id: p.id, name: p.name })),
    });
  }

  if (req.method !== "POST") return json({ error: "method" }, 405);
  const body = await req.json().catch(() => ({} as any));
  const action = String(body.action || "");

  // ----- הצעת קול קורא מחברת קהילה (בקוד קהילה) -----
  if (action === "suggest") {
    // בלי קוד: הקול הקורא מגיע לתיבת האישור לפני פרסום.
    if (!looksHuman(body)) return json({ ok: true }); // מלכודת לבוטים
    const name = t(body.name, 160);
    if (!name) return json({ error: "missing_fields", message: "נא למלא שם." }, 400);

    const title = t(body.title, 300), url = t(body.url, 1200);
    if (!title || !url) return json({ error: "missing_fields", message: "נא למלא כותרת וקישור." }, 400);
    try {
      const r = await addMemberSuggestion({ title, url, endDate: t(body.endDate, 10), funder: t(body.funder, 200), description: t(body.description, 3000), name, email: t(body.email, 240) });
      if (!r.duplicate) await addRequest({ type: "call", name, email: t(body.email, 240), subject: title, body: [t(body.funder, 200), t(body.endDate, 10) ? `מועד: ${t(body.endDate, 10)}` : "", t(body.description, 3000), url].filter(Boolean).join("\n"), link: "/calls#calls-admin" });
      return json({ ok: true, duplicate: r.duplicate });
    } catch {
      return json({ error: "invalid_url", message: "יש להזין קישור תקין." }, 400);
    }
  }

  // ----- פעולות ניהול: מנהלת המערכת או צוות אישור הקולות הקוראים -----
  const role = await tokenRole(req);
  if (role !== "admin" && role !== "calls") return json({ error: "unauthorized" }, 401);
  if ((action === "optout" || action === "digest") && role !== "admin") return json({ error: "unauthorized" }, 401);

  if (action === "approve") {
    const key = t(body.id, 80);
    const fields = cleanCallFields(body.call || {});
    if (!fields.title) return json({ error: "missing_fields", message: "חסרה כותרת." }, 400);
    const inbox = (await listInbox()).find(x => x.key === key);
    if (!inbox) return json({ error: "not_found" }, 404);
    const call = newCall(fields, { source: inbox.source, sourceName: inbox.sourceName, suggestedBy: inbox.suggestedBy, url: inbox.url });
    await saveCall(call);
    await setInboxStatus(key, "approved", call.id);
    return json({ ok: true, call });
  }

  if (action === "reject") {
    await setInboxStatus(t(body.id, 80), "rejected");
    return json({ ok: true });
  }

  if (action === "create") {
    const fields = cleanCallFields(body.call || {});
    if (!fields.title) return json({ error: "missing_fields", message: "חסרה כותרת." }, 400);
    const call = newCall(fields, { source: "admin" });
    await saveCall(call);
    return json({ ok: true, call });
  }

  if (action === "save-call") {
    const c = await getCall(t(body.call?.id, 80));
    if (!c) return json({ error: "not_found" }, 404);
    const fields = cleanCallFields(body.call);
    return json({ ok: true, call: await saveCall({ ...c, ...fields }) });
  }

  if (action === "sources") return json({ ok: true, sources: await saveSources(body.sources) });
  if (action === "fetch") return json({ ok: true, status: await collectFromSources() });
  if (action === "optout") return json({ ok: true, optout: await saveOptOut(body.optout) });

  if (action === "notify") {
    const c = await getCall(t(body.callId, 80));
    if (!c) return json({ error: "not_found" }, 404);
    const ids = new Set((Array.isArray(body.personIds) ? body.personIds : []).map(String));
    const optout = new Set(await getOptOut());
    const people = await loadPeople(u.origin);
    const chosen = people.filter(p => ids.has(p.id) && String(p.email || "").includes("@") && !optout.has(String(p.email).toLowerCase()));
    if (!chosen.length) return json({ error: "no_recipients", message: "לא נבחרו חוקרות עם כתובת מייל." }, 400);

    if (!mailConfigured() || body.mode === "compose") {
      const g = callEmailGeneric(c, site, today);
      const href = "https://mail.google.com/mail/?view=cm&fs=1&bcc=" + encodeURIComponent(chosen.map(p => p.email).join(",")) +
        "&su=" + encodeURIComponent(g.subject) + "&body=" + encodeURIComponent(g.text);
      await saveCall({ ...c, notified: [...(c.notified || []), ...chosen.map(p => ({ email: String(p.email), at: new Date().toISOString() }))] });
      return json({ ok: true, mode: "compose", href, count: chosen.length });
    }

    const notified = [...(c.notified || [])];
    const byId = new Map(matchPeople({ ...c, topics: callTopics(c) }, people).map(m => [m.id, m]));
    const r = await sendAll(chosen, async p => {
      const m = byId.get(p.id) || { id: p.id, name: p.name, email: String(p.email), score: 0, shared: [] };
      const mail = callEmail(c, m, site, today);
      await sendMail(String(p.email), mail.subject, mail.html, mail.text);
    });
    for (const p of r.ok) notified.push({ email: String(p.email), at: new Date().toISOString() });
    const sent = r.ok.length, failed = r.failed.map(p => p.name), reason = r.reason;
    await saveCall({ ...c, notified });
    return json({ ok: true, mode: "sent", sent, failed, reason });
  }

  if (action === "digest") {
    if (body.send && mailConfigured()) return json({ ok: true, mode: "sent", ...(await sendWeeklyDigests(site)) });
    const calls = await listCalls();
    const d = weeklyDigest(null, calls, site, today, await listTeams());
    if (!d) return json({ ok: true, mode: "empty" });
    const people = await loadPeople(u.origin);
    const optout = new Set(await getOptOut());
    const emails = people.map(p => String(p.email || "").trim()).filter(e => e.includes("@") && !optout.has(e.toLowerCase()));
    const href = "https://mail.google.com/mail/?view=cm&fs=1&bcc=" + encodeURIComponent(emails.join(",")) +
      "&su=" + encodeURIComponent(d.subject) + "&body=" + encodeURIComponent(d.text);
    return json({ ok: true, mode: "compose", href, html: d.html });
  }

  return json({ error: "unknown_action" }, 400);
};

export const config: Config = {
  path: "/api/calls",
  rateLimit: { windowLimit: 40, windowSize: 60, aggregateBy: ["ip"] },
};
