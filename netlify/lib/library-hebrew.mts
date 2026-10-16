// מחקרים חדשים לאישור: לכל מקור שנאסף, מודל השפה מכין מדור מוצע ב"חידושים במחקר",
// "מה חדש" ו"התרומה" בעברית. מנהלת המערכת עורכת אם צריך ומאשרת, והמחקר נכנס למדור הנכון.
// רץ בפונקציית רקע (library-hebrew-background), כי כמה מקורות ביחד לוקחים יותר זמן ממה שפונקציה רגילה מאפשרת.
import Anthropic from "@anthropic-ai/sdk";
import { store } from "./shared.mts";

const data = () => store("hosen-data");
const clip = (v: unknown, n: number) => String(v ?? "").trim().slice(0, n);

export const MODEL = "claude-opus-5-5";
export const RESEARCH_CATS: Record<string, string> = {
  preparedness: "מוכנות", resilience: "חוסן נפשי", continuity: "רציפות למידה",
  teachers: "צוותי חינוך ומנהיגות", tech: "טכנולוגיה AI וסימולציה בחירום", org: "חוסן ארגוני",
};
export type Hebrew = { cat: string; summary: string; why: string; at: string };

const SYSTEM = `את עורכת את המדור "חידושים במחקר" באתר של קהילה אקדמית-מקצועית לחינוך בחירום (חוסן, חינוך וחירום).
לכל מקור מחקרי שמגיע אלייך (כותרת, מחברים, כתב עת, שנה ותקציר באנגלית) כתבי בעברית:
- summary ("מה חדש"): משפט אחד או שניים. מי או מה נחקר, ומה הממצא המרכזי. אם התקציר מציין גודל מדגם או מדינה, כתבי אותם.
- why ("התרומה"): משפט אחד. מה ההשתמעות המעשית לאנשי חינוך, לבתי ספר, לרשויות או למדיניות.
- cat: המדור המתאים ביותר, אחד מאלה:
  preparedness = מוכנות: היערכות של בתי ספר לחירום, תכנון, תרגול, ניהול סיכונים.
  resilience = חוסן נפשי: חוסן חינוכי-קהילתי של תלמידים, צוותים ובתי ספר, שייכות, הסתגלות ולמידה רגשית-חברתית במשבר. לא מחקר קליני.
  continuity = רציפות למידה: למידה בזמן מלחמה, פינוי, אסון או עקירה, ולמידה מרחוק בחירום.
  teachers = צוותי חינוך ומנהיגות: מורים ומנהלים במשבר, רווחה, שחיקה ומנהיגות.
  tech = טכנולוגיה AI וסימולציה בחירום: בינה מלאכותית, טכנולוגיה וסימולציה לחינוך בחירום.
  org = חוסן ארגוני: בית ספר, מוסד חינוכי או רשות כארגון, למידה ארגונית, מסוגלות קולקטיבית, מנגנונים שממשיכים לפעול במשבר.

כללים:
- רק מה שכתוב במקור. אל תוסיפי ממצאים, מספרים או מסקנות שלא מופיעים בתקציר. אם אין תקציר, כתבי בזהירות לפי הכותרת בלבד.
- עברית פשוטה במשפטים מלאים. בלי מקף ארוך (—) כמחבר: נקודה, פסיק או נקודתיים.
- מרכאות רגילות בלבד ("...").
- בלי "צריך", "חייב", "חובה" או "אסור": "אפשר", "כדאי".
- בלי שיפוט של אנשים. מתארים ממצאים ופעולות.`;

const SCHEMA = {
  type: "object",
  properties: {
    cat: { type: "string", enum: Object.keys(RESEARCH_CATS) },
    summary: { type: "string" },
    why: { type: "string" },
  },
  required: ["cat", "summary", "why"],
  additionalProperties: false,
};

type Source = { title: string; authors?: string[] | string; year?: string; journal?: string; abstract?: string; cat?: string };

export async function hebrewFor(x: Source): Promise<Hebrew | null> {
  const apiKey = Netlify.env.get("ANTHROPIC_API_KEY") || "";
  if (!apiKey) return null;
  const client = new Anthropic({ apiKey });
  const authors = Array.isArray(x.authors) ? x.authors.join(", ") : String(x.authors || "");
  const text = [
    `כותרת: ${x.title}`, `מחברים: ${authors}`, `כתב עת או מקור: ${x.journal || ""}`, `שנה: ${x.year || ""}`,
    x.cat && RESEARCH_CATS[x.cat] ? `מדור שהציע האיסוף האוטומטי (אפשר לשנות): ${x.cat}` : "",
    `תקציר: ${x.abstract || "(אין תקציר)"}`,
  ].filter(Boolean).join("\n");
  try {
    const r: any = await client.beta.messages.create({
      model: MODEL,
      max_tokens: 4000,
      thinking: { type: "adaptive" },
      output_config: { effort: "low", format: { type: "json_schema", schema: SCHEMA } },
      // אם מסנן בטיחות יעצור בטעות תשובה לגיטימית, הבקשה עוברת אוטומטית למודל חלופי.
      betas: ["server-side-fallback-2026-07-01"],
      fallbacks: "default",
      system: [{ type: "text", text: SYSTEM, cache_control: { type: "ephemeral" } }],
      messages: [{ role: "user", content: text }],
    } as any);
    if (r.stop_reason === "refusal" || r.stop_reason === "max_tokens") return null;
    const block = (r.content || []).find((b: any) => b.type === "text");
    const j = JSON.parse(block?.text || "{}");
    const cat = RESEARCH_CATS[j.cat] ? j.cat : (x.cat && RESEARCH_CATS[x.cat] ? x.cat : "resilience");
    const summary = clip(j.summary, 1200), why = clip(j.why, 800);
    if (!summary || !why) return null;
    return { cat, summary, why, at: new Date().toISOString() };
  } catch (e) {
    if (e instanceof Anthropic.AuthenticationError) console.error("library-hebrew: ANTHROPIC_API_KEY לא תקין");
    else if (e instanceof Anthropic.RateLimitError) console.error("library-hebrew: עומס או תקרת הוצאה");
    else if (e instanceof Anthropic.APIError) console.error("library-hebrew", e.status, e.message);
    else console.error("library-hebrew", String(e));
    return null;
  }
}

// עד שלושה במקביל, כדי לא להעמיס.
async function each<T>(rows: T[], run: (x: T) => Promise<void>, n = 3) {
  let i = 0;
  await Promise.all(Array.from({ length: Math.min(n, rows.length) }, async () => { while (i < rows.length) await run(rows[i++]); }));
}

// מקורות שמחכים לאישור ועוד אין להם עברית.
export async function fillInbox(limit = 60) {
  const st = data();
  const { blobs } = await st.list({ prefix: "library-inbox/" });
  const rows: any[] = [];
  for (const b of blobs) {
    const v = await st.get(b.key, { type: "json" }) as any;
    if (v?.status === "new" && !v.he && !(v.heTries >= 2)) rows.push(v);
    if (rows.length >= limit) break;
  }
  let done = 0;
  await each(rows, async v => {
    const he = await hebrewFor(v);
    const cur = await st.get(`library-inbox/${v.key}.json`, { type: "json" }) as any;
    if (!cur || cur.status !== "new") return;
    await st.setJSON(`library-inbox/${v.key}.json`, he ? { ...cur, he } : { ...cur, heTries: (cur.heTries || 0) + 1 });
    if (he) done++;
  });
  return done;
}

// מחקרים שאושרו לפני שהעברית הייתה מוכנה: מקבלים אותה עכשיו, ומופיעים בעמוד.
export async function fillPendingResources() {
  const st = data();
  const { blobs } = await st.list({ prefix: "resources/" });
  const rows: any[] = [];
  for (const b of blobs) {
    const v = await st.get(b.key, { type: "json" }) as any;
    if (v?.pendingHebrew) rows.push(v);
  }
  await each(rows, async v => {
    const he = await hebrewFor({ title: v.title, authors: v.authors, year: v.year, journal: v.source, abstract: v.abstract, cat: String(v.category || "").replace(/^research-/, "") });
    if (!he) return;
    const cur = await st.get(`resources/${v.id}.json`, { type: "json" }) as any;
    if (!cur?.pendingHebrew) return;
    await st.setJSON(`resources/${v.id}.json`, {
      ...cur, description: cur.description || he.summary, whyImportant: cur.whyImportant || he.why,
      pendingHebrew: false, active: true, updatedAt: new Date().toISOString(),
    });
  });
  return rows.length;
}

// הפעלת פונקציית הרקע (לא מחכים לה). לכל היותר פעם בשתי דקות, כדי שפתיחה חוזרת של התיבה לא תפעיל אותה שוב ושוב.
export async function kickHebrew(origin: string, force = false) {
  const st = data();
  const last = await st.get("library-feed/hebrew-kick.json", { type: "json" }) as { at?: number } | null;
  if (!force && last?.at && Date.now() - last.at < 120000) return false;
  await st.setJSON("library-feed/hebrew-kick.json", { at: Date.now() });
  try {
    await fetch(new URL("/.netlify/functions/library-hebrew-background", origin), {
      method: "POST", headers: { "x-internal": Netlify.env.get("EDITOR_SECRET") || "" },
    });
    return true;
  } catch (e) {
    console.error("kickHebrew", String(e));
    return false;
  }
}
