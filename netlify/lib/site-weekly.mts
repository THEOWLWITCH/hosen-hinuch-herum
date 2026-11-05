// "מה חדש באתר השבוע" (5.11.2026): עדכון שבועי אחד לכל הקהילה, על מה שנוסף באתר בשבעת הימים האחרונים.
// הטקסט נכתב בפורמט של "עדכון לקהילה" (פסקאות, "- " לתבליטים, **הדגשה**, קישורים), כדי שאפשר יהיה
// לקרוא ולערוך אותו בחלון "עדכון לקהילה" לפני השליחה. שום דבר כאן לא נכתב בידי מודל שפה.
import { store, readLibrary, pool } from "./shared.mts";
import { formatDate, isOpen, israelToday, listCalls, loadPeople } from "./calls.mts";
import { listTeams } from "./teams.mts";
import { listCollabs, listResearch } from "./collab.mts";

const data = () => store("hosen-data");
const clip = (v: unknown, n: number) => { const s = String(v ?? "").replace(/\s+/g, " ").trim(); return s.length > n ? s.slice(0, n - 1) + "…" : s; };

async function listPrefix(prefix: string): Promise<any[]> {
  const st = data();
  const { blobs } = await st.list({ prefix });
  return (await pool(blobs, b => (st.get(b.key, { type: "json" }) as Promise<any>).catch(() => null))).filter(Boolean);
}

export type WeeklySection = { key: string; title: string; lines: string[]; link?: [string, string] };
export type Weekly = { subject: string; body: string; sections: WeeklySection[]; count: number; from: string; to: string };

export async function buildSiteWeekly(site: string, days = 7): Promise<Weekly> {
  const since = new Date(Date.now() - days * 86400000).toISOString();
  const today = israelToday();
  const isNew = (x: any) => String(x?.createdAt || "") >= since;
  const [messages, resources, gallery, library, calls, teams, collabs, research, people] = await Promise.all([
    listPrefix("messages/"), listPrefix("resources/"), listPrefix("gallery/"), readLibrary(),
    listCalls().catch(() => []), listTeams().catch(() => []), listCollabs().catch(() => []), listResearch().catch(() => []),
    loadPeople(site).catch(() => []),
  ]);
  const S: WeeklySection[] = [];
  const add = (key: string, title: string, lines: string[], link?: [string, string]) => { if (lines.length) S.push({ key, title, lines, link }); };

  add("board", "📣 דברי קהילה", messages.filter(isNew).filter(m => !m.expiresAt || m.expiresAt >= new Date().toISOString())
    .slice(0, 6).map(m => `${clip(m.title || m.message, 90)}${m.name ? ` (${clip(m.name, 60)})` : ""}`), ["לכל ההודעות", `${site}/now`]);

  const research_ = resources.filter(isNew).filter(r => String(r.category || "").startsWith("research-") && r.active !== false && !r.pendingHebrew);
  add("research", "🔬 חידושים במחקר", [
    "מחקרי השבוע, עם נקודה לדיון מקצועי",
    ...research_.slice(0, 5).map(r => clip(r.title, 120)),
  ], ["לחידושים במחקר", `${site}/articles`]);

  const lib = library.filter(isNew);
  add("library", `📚 נכנסו לספרייה${lib.length > 1 ? ` (${lib.length} מקורות חדשים)` : ""}`, lib.slice(0, 4).map(x => clip(x.title || x.apa, 120)), ["לספרייה", `${site}/library`]);

  const open = (calls as any[]).filter(c => isOpen(c, today));
  const freshCalls = open.filter(isNew).sort((a, b) => String(a.endDate || "9999").localeCompare(String(b.endDate || "9999")));
  add("calls", "📢 קולות קוראים חדשים", freshCalls.slice(0, 6).map(c => `${clip(c.title, 110)}${c.endDate ? ` · עד ${formatDate(c.endDate)}` : ""}`), ["לכל הקולות הקוראים", `${site}/calls`]);

  const events = resources.filter(isNew).filter(r => ["conferences", "grants"].includes(r.category) && r.active !== false);
  add("events", "🎤 כנסים ומענקי מחקר", events.slice(0, 6).map(r => `${r.category === "grants" ? "מענק" : "כנס"}: ${clip(r.title, 110)}${r.endDate || r.startDate ? ` · ${formatDate(r.startDate || r.endDate)}` : ""}`), ["לכנסים", `${site}/conferences`]);

  const newTeams = (teams as any[]).filter(isNew);
  const activeTeams = (teams as any[]).filter(t => t.status !== "closed" && String(t.activeAt || t.updatedAt || "") >= since);
  const newCollabs = (collabs as any[]).filter(isNew).filter(c => c.status === "open");
  const newIdeas = (research as any[]).filter(r => String(r.publishedAt || "") >= since && r.status === "open");
  add("collab", "🤝 שיתופי פעולה", [
    ...newIdeas.slice(0, 3).map(r => `רעיון חדש למחקר: ${clip(r.title, 110)}`),
    ...newCollabs.slice(0, 3).map(c => `יוזמה חדשה: ${clip(c.title, 110)}${c.need ? ` — מחפשים: ${clip(c.need, 80)}` : ""}`),
    ...newTeams.slice(0, 3).map(t => `נפתח מרחב עבודה: ${clip(t.title, 110)}`),
    ...(activeTeams.length ? [`${activeTeams.length === 1 ? "מרחב עבודה אחד היה פעיל" : `${activeTeams.length} מרחבי עבודה היו פעילים`} השבוע`] : []),
  ], ["לשיתופי פעולה", `${site}/match`]);

  const joined = (people as any[]).filter(isNew).map(p => clip(p.name, 60)).filter(Boolean);
  add("people", "🙋 הצטרפו לנבחרת", joined.length ? [`ברוכים הבאים וברוכות הבאות: ${joined.slice(0, 12).join(", ")}`] : [], ["לנבחרת", `${site}/people`]);

  const albums = gallery.filter(isNew).filter(g => g.active !== false);
  add("gallery", "📷 בגלריה", albums.slice(0, 4).map(g => clip(g.title, 100)), ["לגלריה", `${site}/gallery`]);

  const count = S.filter(s => s.key !== "research").reduce((n, s) => n + s.lines.length, 0);
  const from = formatDate(since.slice(0, 10)), to = formatDate(today);
  const blocks = S.map(s => [`**${s.title}**`, ...s.lines.map(l => "- " + l), s.link ? `${s.link[0]}: ${s.link[1]}` : ""].filter(Boolean).join("\n"));
  const body = [
    "שלום,",
    `מה חדש השבוע באתר הקהילה "בינה מלאכותית: חוסן-חינוך-חרום" (${from}–${to}):`,
    ...blocks,
    `**🧩 רוצים לקחת חלק?**\nבעמוד הנבחרת יש תפקידים פתוחים בקהילה: הובלת הספרייה, קבלת מצטרפים חדשים, ליווי מרחבי עבודה ועוד: ${site}/people#roles`,
    "יש לך משהו לשתף בעדכון הבא? אפשר לפרסם הודעה בדברי קהילה, או פשוט להשיב למייל הזה.",
    "לא רוצה לקבל את העדכון השבועי? אפשר להשיב למייל הזה ולכתוב \"הסרה\".",
  ].join("\n\n");
  return { subject: `מה חדש השבוע בקהילה · ${to}`, body, sections: S, count, from, to };
}

// מצב השליחה השבועית: מתי נשלחה הטיוטה למנהלת, כדי לא לשלוח פעמיים באותו שבוע.
export async function getWeeklyState(): Promise<{ draftSentDay?: string }> {
  return (await data().get("site-weekly/state.json", { type: "json" }) as any) || {};
}
export async function setWeeklyState(x: { draftSentDay?: string }) {
  await data().setJSON("site-weekly/state.json", { ...(await getWeeklyState()), ...x });
}
