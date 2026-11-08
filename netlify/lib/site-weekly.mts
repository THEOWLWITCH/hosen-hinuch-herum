// "מה חדש באתר השבוע" (5.11.2026): עדכון שבועי אחד לכל הקהילה, על מה שנוסף באתר בשבעת הימים האחרונים.
// הטקסט נכתב בפורמט של "עדכון לקהילה" (פסקאות, "- " לתבליטים, **הדגשה**, קישורים), כדי שאפשר יהיה
// לקרוא ולערוך אותו בחלון "עדכון לקהילה" לפני השליחה. שום דבר כאן לא נכתב בידי מודל שפה.
import { store, readLibrary, pool } from "./shared.mts";
import { formatDate, isOpen, israelToday, listCalls, loadPeople } from "./calls.mts";
import { listTeams } from "./teams.mts";
import { listCollabs, listResearch } from "./collab.mts";
import { currentTopic } from "./kikar-topics.mts";

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
  const sinceDay = since.slice(0, 10);
  const isNew = (x: any) => String(x?.createdAt || "") >= since;
  const [messages, resources, gallery, library, calls, teams, collabs, research, people, seen, discussions, requests] = await Promise.all([
    listPrefix("messages/"), listPrefix("resources/"), listPrefix("gallery/"), readLibrary(),
    listCalls().catch(() => []), listTeams().catch(() => []), listCollabs().catch(() => []), listResearch().catch(() => []),
    loadPeople(site).catch(() => []),
    listPrefix("member-seen/"), listPrefix("research-discussions/"), listPrefix("requests/"),
  ]);
  const S: WeeklySection[] = [];
  const add = (key: string, title: string, lines: string[], link?: [string, string]) => { if (lines.length) S.push({ key, title, lines, link }); };

  add("board", "📣 דברי קהילה", messages.filter(isNew).filter(m => !m.expiresAt || m.expiresAt >= new Date().toISOString())
    .slice(0, 6).map(m => `${clip(m.title || m.message, 90)}${m.name ? ` (${clip(m.name, 60)})` : ""}`), ["לכל ההודעות", `${site}/now`]);

  // חידושים במחקר: מחקרי השבוע מהעדכון של יום ראשון (research-weekly.json נוצר בבנייה), ומחקרים שחברי הקהילה הוסיפו.
  const rw = await fetch(`${site}/research-weekly.json`, { headers: { "cache-control": "no-cache" } }).then(r => r.ok ? r.json() : null).catch(() => null) as
    { week: string; added: number; total?: number; highlights: { title: string; source: string; summary: string; why: string; url: string; note: string }[] } | null;
  const fresh = !!rw?.week && rw.week >= since.slice(0, 10);
  const research_ = resources.filter(isNew).filter(r => String(r.category || "").startsWith("research-") && r.active !== false && !r.pendingHebrew);
  const rLines: string[] = [];
  if (fresh && rw!.highlights.length) {
    if (rw!.added > rw!.highlights.length) rLines.push(`השבוע נוספו ${rw!.added} מחקרים חדשים. אלה מחקרי השבוע:`);
    for (const x of rw!.highlights) rLines.push(`**${clip(x.title, 160)}** (${clip(x.source, 90)}). ${clip(x.summary, 320)}${x.why ? ` ${clip(x.why, 220)}` : ""}${x.note ? ` נקודה לדיון: ${clip(x.note, 200)}` : ""} ${x.url}`);
  }
  for (const r of research_.slice(0, 4)) rLines.push(`נוסף בידי הקהילה: ${clip(r.title, 120)}`);
  if (!rLines.length) rLines.push("השבוע לא נוספו מחקרים חדשים. אפשר לקרוא את מחקרי השבועות הקודמים ולהגיב בדיון");
  S.unshift({ key: "research", title: "🔬 חידושים במחקר: מחקרי השבוע", lines: rLines, link: ["לכל המחקרים ולדיון", `${site}/articles`] });


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
    ...(teams as any[]).filter(t => !t.locked && t.status !== "closed" && !newTeams.includes(t)).slice(0, 5).map(t => `מוזמנות.ים להצטרף: ${clip(t.title, 110)}${t.need ? ` — מחפשים: ${clip(t.need, 80)}` : ""}`),
    ...(activeTeams.length ? [`${activeTeams.length === 1 ? "מרחב עבודה אחד היה פעיל" : `${activeTeams.length} מרחבי עבודה היו פעילים`} השבוע`] : []),
  ], ["לשיתופי פעולה", `${site}/match`]);

  // הודעות ידניות מהנהלת הקהילה (weekly-notes.json): section "people" נכנס ל"הצטרפו לנבחרת", כל השאר ל"📌 מהנהלת הקהילה".
  // ברכה למצטרף/ת עם "person" (חלק מהשם): הפרטים (שם מלא, מוסד, תחום מחקר) נלקחים מהכרטיס בנבחרת או מבקשת ההצטרפות,
  // ונכנסים ל-"template" במקום {שם} {מוסד} {תחום}. לא נמצאו פרטים: נכנס "text".
  const wnotes = (await fetch(`${site}/weekly-notes.json`, { headers: { "cache-control": "no-cache" } }).then(r => r.ok ? r.json() : []).catch(() => [])) as { date: string; section?: string; text: string; person?: string | string[]; template?: string }[];
  const myNotes = (Array.isArray(wnotes) ? wnotes : []).filter(x => String(x?.date || "") > since.slice(0, 10) && x.text); // ">" ולא ">=": הודעה מיום ראשון לא חוזרת בעדכון של השבוע הבא
  const keysOf = (x: { person?: string | string[] }) => (Array.isArray(x.person) ? x.person : x.person ? [x.person] : []).filter(Boolean);
  const hit = (name: unknown, keys: string[]) => keys.some(k => String(name || "").includes(k));
  const firstPart = (v: unknown) => clip(String(v || "").split(/\n|(?<=[.!?])\s/)[0], 220).replace(/[.\s]+$/, "");
  const personInfo = (keys: string[]) => {
    if (!keys.length) return null;
    const p = (people as any[]).find(x => hit(x.name, keys));
    if (p) return { name: clip(p.name, 120), inst: clip(p.institution, 160), field: firstPart(p.description) };
    const r = (requests as any[]).filter(x => x.type === "join" && hit(x.data?.name || x.name, keys)).sort((a, b) => String(b.at).localeCompare(String(a.at)))[0];
    return r ? { name: clip(r.data?.name || r.name, 120), inst: clip(r.data?.affiliation, 160), field: firstPart(r.data?.expertise) } : null;
  };
  const noteText = (x: (typeof myNotes)[number]) => {
    const info = personInfo(keysOf(x));
    if (!info || !x.template) return x.text;
    let t = x.template.replace(/\{שם\}/g, info.name);
    t = info.inst ? t.replace(/\{מוסד\}/g, info.inst) : t.replace(/\s*\([^()]*\{מוסד\}[^()]*\)/g, "").replace(/\{מוסד\}/g, "");
    t = info.field ? t.replace(/\{תחום\}/g, info.field) : t.replace(/[^.!]*\{תחום\}[^.!]*[.!]?/g, "");
    return t.replace(/\s{2,}/g, " ").trim();
  };
  const noteKeys = myNotes.filter(x => x.section === "people").flatMap(keysOf);
  const peopleNotes = myNotes.filter(x => x.section === "people").map(x => clip(noteText(x), 600));
  add("notes", "📌 מהנהלת הקהילה", myNotes.filter(x => x.section !== "people").map(x => clip(x.text, 600)));

  // מצטרפים השבוע (8.11.2026): גם מי שנפתח לו כרטיס בנבחרת וגם מי ששלח/ה בקשת הצטרפות (עוד בלי כרטיס), עם המוסד.
  const seenKey = new Set<string>();
  const joinedRows: { name: string; inst: string }[] = [];
  const pushJ = (name: unknown, inst: unknown, email: unknown) => {
    const nm = clip(name, 80); if (!nm) return;
    const k = String(email || "").trim().toLowerCase() || nm.replace(/[״"'׳\s.]/g, "");
    if (seenKey.has(k) || seenKey.has(nm.replace(/[״"'׳\s.]/g, ""))) return;
    seenKey.add(k); seenKey.add(nm.replace(/[״"'׳\s.]/g, ""));
    joinedRows.push({ name: nm, inst: clip(inst, 90) });
  };
  for (const p of (people as any[]).filter(isNew)) pushJ(p.name, p.institution, p.email);
  for (const r of (requests as any[]).filter(r => r.type === "join" && String(r.at || r.createdAt || "") >= since)) pushJ(r.data?.name || r.name, r.data?.affiliation, r.data?.email || r.email);
  const joined = joinedRows.map(x => x.name);
  const joinedOthers = joinedRows.filter(x => !hit(x.name, noteKeys)).map(x => x.inst ? `${x.name} (${x.inst})` : x.name); // מי שכבר קיבל/ה ברכה אישית לא חוזר/ת ברשימה
  add("people", "🙋 הצטרפו לקהילה השבוע", [...peopleNotes, ...(joinedOthers.length ? [`ברוכים הבאים וברוכות הבאות: ${joinedOthers.slice(0, 12).join("; ")}`] : [])], ["לנבחרת", `${site}/people`]);

  // 🏛 כיכר הקהילה (8.11.2026): הנושא הפתוח, השיחות סביבו ומה נכתב השבוע.
  try {
    const kt = currentTopic();
    if (kt) {
      const kposts = await listPrefix(`kikar/posts/${kt.id}/`);
      const kweek = kposts.filter(x => String(x.createdAt || "") >= since);
      // כשיש השבוע הסבר מורחב על הכיכר (guides ב-site-changes.json), כאן רק מה שקורה בה, בלי לחזור על הנושא והשיחות.
      const kGuide = (await fetch(`${site}/site-changes.json`, { headers: { "cache-control": "no-cache" } }).then(r => r.ok ? r.json() : []).catch(() => []) as any[])
        .filter(c => String(c?.date || "") >= sinceDay).some(c => (c.guides || []).some((g: any) => String(g?.title || "").includes("כיכר")));
      const isNewTopic = !kGuide && (String(kt.opens || "") > sinceDay || String(kt.opens || "") === today);
      const kl: string[] = [];
      kl.push(`${isNewTopic ? "נפתח נושא חדש בכיכר" : "הנושא הפתוח בכיכר"}: **${clip(kt.title, 120)}**${kt.host ? ` (מארחת: ${clip(kt.host, 60)})` : ""}. ${clip(kt.question, 200)}`);
      if (isNewTopic) for (const c of kt.convs.slice(0, 6)) kl.push(`שיחה: ${clip(c.title, 110)}`);
      kl.push(kweek.length ? `${kweek.length === 1 ? "נכתבה תגובה אחת" : `נכתבו ${kweek.length.toLocaleString("he-IL")} תגובות`} השבוע${kposts.length > kweek.length ? ` (${kposts.length.toLocaleString("he-IL")} בסך הכול)` : ""}. מצטרפים לשיחה עם הקוד האישי או קוד הקהילה` : "עוד אין תגובות. אפשר לפתוח את השיחה: בוחרים שיחה, לוחצים \"🔑 כניסה לכתיבה\" וכותבים");
      add("kikar", "🏛 כיכר הקהילה: שיח מקצועי לשיתוף ידע והעברתו לשדה", kl, ["לכיכר הקהילה", `${site}/kikar`]);
    }
  } catch { /* הכיכר לא זמינה: ממשיכים בלי המדור */ }

  const albums = gallery.filter(isNew).filter(g => g.active !== false);
  add("gallery", "📷 בגלריה", albums.slice(0, 4).map(g => clip(g.title, 100)), ["לגלריה", `${site}/gallery`]);

  // 📊 הקהילה במספרים (5.11.2026). "נכנסו השבוע" = מי שנכנס/ה לאתר עם הקוד האישי (member-seen/), כי בלי קוד אין דרך לדעת מי ביקר.
  const n = (x: number) => x.toLocaleString("he-IL");
  const liveTeams = (teams as any[]).filter(t => t.status !== "closed");
  const ideasOpen = (research as any[]).filter(r => r.status === "open").length + (collabs as any[]).filter(c => c.status === "open").length;
  const closingSoon = open.filter(c => c.endDate && c.endDate >= today && c.endDate <= new Date(Date.now() + 14 * 86400000).toISOString().slice(0, 10)).length;
  // ניסוח נכון ליחיד ולרבים.
  const q = (x: number, one: string, many: string) => x === 1 ? one : `${n(x)} ${many}`;
  const added = (x: number) => x ? ` (${x === 1 ? "אחד נוסף" : `${n(x)} נוספו`} השבוע)` : "";
  const seenWeek = (seen as any[]).filter(x => String(x.day || "") >= sinceDay).length;
  const comments = (discussions as any[]).filter(isNew).length;
  const roles = (requests as any[]).filter(r => r.type === "role" && isNew(r)).length;
  const boardNew = messages.filter(isNew).length;
  // מבקרים (visits/<יום>/<מזהה>): כמה דפדפנים שונים ביקרו בשבעת הימים האחרונים.
  const visitDays = Array.from({ length: days }, (_, i) => new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Jerusalem" }).format(new Date(Date.now() - i * 86400000)));
  const vst = data();
  const visitKeys = (await Promise.all(visitDays.map(d => vst.list({ prefix: `visits/${d}/` }).then(r => r.blobs.map(b => b.key)).catch(() => [] as string[])))).flat();
  const visitors = new Set(visitKeys.map(k => k.split("/").pop())).size;
  const stats = [
    ...(visitors ? [`${q(visitKeys.length, "כניסה אחת", "כניסות")} לאתר השבוע, ${visitors === 1 ? "ממכשיר אחד" : `מ־${n(visitors)} מכשירים שונים`} (כל מכשיר נספר פעם אחת ביום)`] : []),
    `${q(people.length, "חבר/ה אחד/ת בנבחרת", "חברות וחברים בנבחרת")}${joined.length ? ` (${q(joined.length, "הצטרף/ה אחד/ת", "הצטרפו")} השבוע)` : ""}. ${seenWeek ? `${q(seenWeek, "אחד/ת נכנס/ה", "נכנסו")} לאתר השבוע עם הקוד האישי` : "השבוע אף אחד לא נכנס לאתר עם הקוד האישי"}`,
    `${q(library.length, "מקור אחד בספרייה", "מקורות בספרייה")}${added(lib.length)}`,
    ...(rw?.total ? [`${q(rw.total, "מחקר אחד", "מחקרים")} ב"חידושים במחקר"${fresh ? added(rw.added) : ""}${comments ? `. ${q(comments, "תגובה אחת", "תגובות")} בדיון השבוע` : ""}`] : []),
    `${q(liveTeams.length, "מרחב עבודה אחד", "מרחבי עבודה")}${added(newTeams.length)}${activeTeams.length ? (liveTeams.length === 1 ? ", והוא היה פעיל השבוע" : `. ${activeTeams.length === 1 ? "אחד מהם היה פעיל" : `${n(activeTeams.length)} מהם היו פעילים`} השבוע`) : ""}`,
    ...(ideasOpen ? [`${q(ideasOpen, "רעיון או יוזמה אחת שמחפשים", "רעיונות למחקר ויוזמות שמחפשים")} שותפים`] : []),
    `${q(open.length, "קול קורא פתוח אחד", "קולות קוראים פתוחים")}${added(freshCalls.length)}${closingSoon ? `. ${closingSoon === 1 ? "אחד נסגר" : `${n(closingSoon)} נסגרים`} בשבועיים הקרובים` : ""}`,
    ...(boardNew ? [`${q(boardNew, "הודעה חדשה אחת", "הודעות חדשות")} בדברי קהילה`] : []),
    ...(roles ? [`${roles === 1 ? "חבר/ת קהילה אחד/ת התנדב/ה" : `${n(roles)} חברי וחברות קהילה התנדבו`} השבוע לתפקיד`] : []),
  ];
  S.splice(1, 0, { key: "stats", title: "📊 הקהילה במספרים", lines: stats });

  // 🛠 מה חדש באתר עצמו: מתוך site-changes.json שבמאגר (כל שינוי שהקהילה רואה נרשם שם).
  const changes = await fetch(`${site}/site-changes.json`, { headers: { "cache-control": "no-cache" } }).then(r => r.ok ? r.json() : []).catch(() => []) as { date: string; items: string[]; guides?: { title: string; lines: string[]; image?: string; alt?: string; link?: string }[] }[];
  const changed = (Array.isArray(changes) ? changes : []).filter(c => String(c?.date || "") >= sinceDay).flatMap(c => Array.isArray(c.items) ? c.items : []).map(x => clip(x, 300)).filter(Boolean);
  if (changed.length) S.splice(2, 0, { key: "site", title: "🛠 מה חדש באתר עצמו", lines: changed.slice(0, 15), link: ["לאתר", site] });
  // הסבר מורחב על שינוי (guides ב-site-changes.json): מדור משלו מיד אחרי "מה חדש באתר עצמו" (5.11.2026).
  const guides = (Array.isArray(changes) ? changes : []).filter(c => String(c?.date || "") >= sinceDay).flatMap(c => Array.isArray(c.guides) ? c.guides : [])
    .filter(g => g?.title && Array.isArray(g.lines) && g.lines.length).slice(0, 5); // עד חמישה הסברים בשבוע
  // איור להסבר (7.11.2026): image = נתיב באתר (למשל /assets/x.jpg), link = לאן לוחצים. נכנס כשורה ראשונה במדור.
  const abs = (u?: string) => !u ? "" : /^https?:\/\//.test(u) ? u : `${site}${u.startsWith("/") ? "" : "/"}${u}`;
  const pic = (g: { image?: string; alt?: string; link?: string; title: string }) => g.image ? [`![${clip(g.alt || g.title, 140).replace(/[\[\]]/g, "")}](${abs(g.image)})${g.link ? `(${abs(g.link)})` : ""}`] : [];
  guides.forEach((g, i) => S.splice((changed.length ? 3 : 2) + i, 0, { key: "guide", title: clip(g.title, 120), lines: [...pic(g), ...g.lines.slice(0, 10).map(x => clip(x, 400))] }));

  // סדר המדורים (8.11.2026): מה שהקהילה צריכה לראות קודם, ולא לפי סדר החישוב.
  const ORDER = ["notes", "people", "research", "stats", "kikar", "site", "guide", "board", "collab", "calls", "events", "library", "gallery"];
  const rank = (k: string) => { const i = ORDER.indexOf(k); return i < 0 ? ORDER.length : i; };
  S.splice(0, S.length, ...S.map((s, i) => ({ s, i })).sort((a, b) => rank(a.s.key) - rank(b.s.key) || a.i - b.i).map(x => x.s));
  const count = S.filter(s => s.key !== "research" && s.key !== "stats" && s.key !== "guide").reduce((n, s) => n + s.lines.length, 0) + (fresh ? (rw?.highlights.length || 0) : 0);
  const from = formatDate(since.slice(0, 10)), to = formatDate(today);
  const blocks = S.map(s => [`**${s.title}**`, ...s.lines.map(l => l.startsWith("![") ? l : "- " + l), s.link ? `${s.link[0]}: ${s.link[1]}` : ""].filter(Boolean).join("\n"));
  const body = [
    "שלום,",
    `מה חדש השבוע באתר הקהילה "בינה מלאכותית: חוסן-חינוך-חרום" (${from}–${to}):`,
    ...blocks,
    `**🧩 חדש: תפקידים בקהילה**\nהקהילה פעילה כשחברות וחברים לוקחים על עצמם תפקיד, קטן או גדול. בעמוד הנבחרת, מתחת לכרטיסים האישיים, יש עכשיו תפקידים פתוחים:\n- מובילי ומובילות מרחב הנבחרת: מקבלים את המצטרפים והמצטרפות החדשים\n- מובילי ומובילות הספרייה: שומרים על ספרייה איכותית ועדכנית\n- עורכי ועורכות "חידושים במחקר": בוחרים את מחקרי השבוע ומעוררים דיון\n- רכזי ורכזות קולות קוראים, כנסים ומענקים\n- מלווי ומלוות צוותים: עוזרים לצוותים לצאת לדרך\n- מתעדי ומתעדות המפגשים\n- אחראים ואחראיות על המייל השבועי הזה\n- מפיצי ומפיצות הקהילה ברשתות\nבוחרים תפקיד, לוחצים "אני רוצה", והפנייה מגיעה להנהלת הקהילה. יש רעיון לתפקיד אחר? אפשר להציע אותו שם: ${site}/people#roles`,    "יש לך משהו לשתף בעדכון הבא? אפשר לפרסם הודעה בדברי קהילה, או פשוט להשיב למייל הזה.",
    "לא רוצה לקבל את העדכון השבועי? אפשר להשיב למייל הזה ולכתוב \"הסרה\".",
  ].join("\n\n");
  return { subject: `מה חדש השבוע בקהילה · ${to}`, body, sections: S, count, from, to };
}

// מצב השליחה השבועית: מתי נשלחה הטיוטה למנהלת, כדי לא לשלוח פעמיים באותו שבוע.
// ניקוי ספירת המבקרים: נשמרים רק 60 הימים האחרונים.
export async function pruneVisits(keepDays = 60) {
  const st = data(), cut = new Date(Date.now() - keepDays * 86400000).toISOString().slice(0, 10);
  const { blobs } = await st.list({ prefix: "visits/" });
  const old = blobs.filter(b => (b.key.split("/")[1] || "9999") < cut);
  await pool(old, b => st.delete(b.key).catch(() => {}), 20);
  return old.length;
}

export async function getWeeklyState(): Promise<{ draftSentDay?: string }> {
  return (await data().get("site-weekly/state.json", { type: "json" }) as any) || {};
}
export async function setWeeklyState(x: { draftSentDay?: string }) {
  await data().setJSON("site-weekly/state.json", { ...(await getWeeklyState()), ...x });
}
