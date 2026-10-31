// ספרייה שמתחדשת: איסוף אוטומטי של מחקרים, דוחות ומשאבים לתיבת אישור.
// מקורות: OpenAlex ו-ERIC (מאגרים פתוחים וחינמיים), ופידים (RSS) שמנהלת המערכת מוסיפה.
// איכות (31.10.2026): מ-OpenAlex רק מאמרים מכתבי העת המובילים שב-quality-journals.mts, ומ-ERIC רק שיפוט עמיתים.
import { id, store } from "./shared.mts";
import { ALL_ISSNS, QUALITY_AREAS, QUALITY_JOURNALS, qualityBadges, qualityJournal } from "./quality-journals.mts";
import { cleanLink, linkKey, parseFeed, plainText } from "./calls.mts";
import { RESEARCH_CATS, type Hebrew } from "./library-hebrew.mts";

const data = () => store("hosen-data");
const clip = (v: unknown, n: number) => String(v ?? "").trim().slice(0, n);

export type LibSection = "publications" | "policy" | "research-tools" | "professional";
export const SECTION_LABELS: Record<LibSection, string> = {
  publications: "פרסומים — ספרים ומאמרים", policy: "מסמכי מדיניות", "research-tools": "כלי מחקר", professional: "משאבים",
};

// הנושאים שהספרייה עוקבת אחריהם. cat — הציר המקביל ב"חידושים במחקר".
export const TOPICS: { key: string; label: string; cat: string; q: string; must: RegExp }[] = [
  { key: "resilience", label: "חוסן", cat: "resilience", q: "school resilience students teachers", must: /resilien|well-?being/i },
  { key: "emergency", label: "חינוך בחירום", cat: "preparedness", q: "education in emergencies", must: /emergenc|crisis|conflict|war|displace|disaster|refugee/i },
  { key: "continuity", label: "רציפות למידה", cat: "continuity", q: "learning continuity school disruption", must: /continuity|disrupt|closure|remote|distance|interrupt/i },
  { key: "teachers", label: "מורים וצוותים בזמן משבר", cat: "teachers", q: "teachers crisis stress support", must: /teacher|educator|school staff|principal/i },
  { key: "ai", label: "בינה מלאכותית בחינוך", cat: "tech", q: "artificial intelligence education teachers", must: /artificial intelligence|\bAI\b|generative|chatgpt|large language model/i },
  { key: "preparedness", label: "מוכנות והיערכות", cat: "preparedness", q: "school emergency preparedness", must: /prepared|readiness|drill|plan/i },
  { key: "org", label: "חוסן ארגוני", cat: "org", q: "organizational resilience schools crisis", must: /organi[sz]ational resilience|school resilience|institutional resilience|organi[sz]ational learning/i },
  { key: "parents", label: "הורים וקהילה", cat: "resilience", q: "parent family community engagement school crisis", must: /parent|famil|communit/i },
];
const FIELD = /educat|school|teacher|student|pupil|learning|classroom|kindergarten|principal|חינוך|בית ספר|מורים|תלמיד/i;
// לא רלוונטי לקהילה (31.10.2026): השכלה גבוהה. מחקר שהכותרת שלו עוסקת באוניברסיטה או בסטודנטים לא נכנס, אלא אם הוא עוסק גם בבית ספר או בצוותי חינוך.
const HIGHER_ED = /higher education|universit|undergraduate|postgraduate|graduate students?|college students?|medical students?|nursing students?|academic staff|faculty members?|campus|השכלה גבוהה|אוניברסיט|סטודנט/i;
const K12 = /school|teacher|pupil|kindergarten|preschool|early childhood|principal|classroom|adolescen|children|בית ספר|מורים|תלמיד|גן/i;
export function offTopic(c: { title?: string; abstract?: string }) {
  const t = String(c.title || "");
  return HIGHER_ED.test(t) && !K12.test(t);
}

export type LibInboxItem = {
  key: string; title: string; authors: string[]; year: string; date: string; journal: string; url: string; doi: string;
  abstract: string; type: string; section: LibSection; topic: string; cat: string; source: "openalex" | "eric" | "crossref" | "europepmc" | "rss"; sourceName: string;
  foundAt: string; status: "new" | "approved" | "rejected";
  he?: Hebrew; heTries?: number;
  issn?: string[]; peerReviewed?: boolean; quality?: string[]; rejectedFor?: string;
};
export type FeedSource = { name: string; url: string; section: LibSection; enabled: boolean };
export type FeedStatus = { name: string; at: string; ok: boolean; found: number; added: number; error?: string };

// ---------- APA 7 ----------

function apaAuthor(full: string) {
  const parts = String(full || "").replace(/[,.]/g, " ").trim().split(/\s+/).filter(Boolean);
  if (parts.length < 2) return parts[0] || "";
  const last = parts.pop()!;
  return `${last}, ${parts.map(p => p[0].toUpperCase() + ".").join(" ")}`;
}

export function apa7(x: { authors: string[]; year: string; title: string; journal: string; doi: string; url: string }) {
  const names = x.authors.map(apaAuthor).filter(Boolean);
  const authors = names.length > 20 ? [...names.slice(0, 19), "…", names[names.length - 1]].join(", ")
    : names.length > 1 ? names.slice(0, -1).join(", ") + ", & " + names[names.length - 1] : names[0] || "";
  const link = x.doi ? `https://doi.org/${x.doi.replace(/^https?:\/\/doi\.org\//i, "")}` : x.url;
  return [authors ? authors.replace(/\.?$/, ".") : "", `(${x.year || "n.d."}).`, x.title ? x.title.replace(/\.$/, "") + "." : "", x.journal ? x.journal + "." : "", link].filter(Boolean).join(" ");
}

// ---------- סיווג ----------

export function typeOf(raw: string, journal: string): string {
  const s = `${raw} ${journal}`.toLowerCase();
  if (/report|working paper|policy brief|guidance|דוח/.test(s)) return "דוח";
  if (/policy|ministry|unesco|unicef|oecd|world bank|משרד/.test(s)) return "מדיניות";
  if (/book/.test(s)) return "ספר";
  if (/proceedings|conference|congress/.test(s)) return "כנס";
  if (/toolkit|tool|guide|handbook|manual|curriculum|instrument|scale/.test(s)) return "כלי";
  return "מאמר";
}

export function sectionOfType(t: string): LibSection {
  if (t === "דוח" || t === "מדיניות") return "policy";
  if (t === "כלי") return "research-tools";
  if (t === "מאמר" || t === "ספר" || t === "כנס") return "publications";
  return "professional";
}

function invertedAbstract(idx: Record<string, number[]> | null | undefined): string {
  if (!idx) return "";
  const words: string[] = [];
  for (const [w, pos] of Object.entries(idx)) for (const p of pos) words[p] = w;
  return words.filter(Boolean).join(" ");
}

// ---------- מקורות ----------

async function getJson(url: string, ms = 9000) {
  const ctl = new AbortController();
  const t = setTimeout(() => ctl.abort(), ms);
  try {
    const r = await fetch(url, { signal: ctl.signal, headers: { "user-agent": "hosen-hinuch-herum library collector", accept: "application/json, application/rss+xml, text/xml;q=0.9, */*;q=0.5" } });
    if (!r.ok) throw new Error("HTTP " + r.status);
    return r;
  } finally { clearTimeout(t); }
}

const OPENALEX = () => Netlify.env.get("OPENALEX_URL") || "https://api.openalex.org";
const ERIC = () => Netlify.env.get("ERIC_URL") || "https://api.ies.ed.gov/eric/";

export function sinceDate(days = 120) {
  return new Date(Date.now() - days * 86400000).toISOString().slice(0, 10);
}

type Cand = Omit<LibInboxItem, "key" | "foundAt" | "status" | "section"> & { section?: LibSection };

// OpenAlex מאפשר עד 100 ערכים בסינון אחד, ולכן רשימת ה-ISSN מחולקת לקבוצות.
const chunk = <T,>(a: T[], n: number) => Array.from({ length: Math.ceil(a.length / n) }, (_, i) => a.slice(i * n, i * n + n));

export async function fromOpenAlex(topic: typeof TOPICS[number]): Promise<Cand[]> {
  const mail = (Netlify.env.get("GMAIL_USER") || "").trim();
  const key = (Netlify.env.get("OPENALEX_API_KEY") || "").trim();
  const pages = await Promise.all(chunk(ALL_ISSNS, 90).map(async issns => {
    const u = new URL("works", OPENALEX().replace(/\/?$/, "/"));
    u.searchParams.set("search", topic.q);
    // רק כתבי העת שברשימה, רק מאמרים וסקירות עם תקציר, בלי טיוטות (preprints), בלי מאמרים שנמשכו. מיון לפי התאמה.
    u.searchParams.set("filter", [
      `from_publication_date:${sinceDate(120)}`, "type:article|review", "has_abstract:true", "is_retracted:false", "is_paratext:false",
      `primary_location.source.issn:${issns.join("|")}`,
    ].join(","));
    u.searchParams.set("per-page", "25");
    if (mail) u.searchParams.set("mailto", mail);
    if (key) u.searchParams.set("api_key", key);
    const j: any = await (await getJson(u.toString())).json();
    return (j.results || []) as any[];
  }));
  return pages.flat().map((w: any) => {
    const doi = clip(String(w.doi || "").replace(/^https?:\/\/doi\.org\//i, ""), 200);
    const journal = clip(w.primary_location?.source?.display_name || w.host_venue?.display_name || "", 300);
    const issn: string[] = (w.primary_location?.source?.issn || []).map((i: unknown) => clip(i, 12));
    return {
      issn,
      title: clip(plainText(w.display_name || w.title || ""), 400),
      authors: (w.authorships || []).map((a: any) => clip(a.author?.display_name, 120)).filter(Boolean).slice(0, 25),
      year: String(w.publication_year || ""), date: clip(w.publication_date, 10), journal,
      url: cleanLink(w.open_access?.oa_url || w.primary_location?.landing_page_url || (doi ? `https://doi.org/${doi}` : "") || w.id || ""),
      doi, abstract: clip(invertedAbstract(w.abstract_inverted_index), 1500), type: typeOf(String(w.type || ""), journal),
      topic: topic.key, cat: topic.cat, source: "openalex" as const, sourceName: "OpenAlex",
    };
  });
}

export async function fromEric(topic: typeof TOPICS[number]): Promise<Cand[]> {
  const year = new Date().getFullYear();
  const ask = async (peer: boolean) => {
    const u = new URL(ERIC());
    u.searchParams.set("search", `${topic.q} AND (publicationdateyear:${year} OR publicationdateyear:${year - 1})${peer ? " AND peerreviewed:T" : ""}`);
    u.searchParams.set("format", "json");
    u.searchParams.set("rows", "40");
    u.searchParams.set("fields", "id,title,author,description,publicationdateyear,source,url,publicationtype,peerreviewed,issn");
    const j: any = await (await getJson(u.toString())).json();
    return (j.response?.docs || []) as any[];
  };
  // רק שיפוט עמיתים. אם המאגר לא מכיר את הסינון בשאילתה, מסננים לפי השדה עצמו.
  let docs = await ask(true);
  if (!docs.length) docs = await ask(false);
  return docs.filter(d => String(d.peerreviewed || "").toUpperCase().startsWith("T")).map((d: any) => {
    const pt = Array.isArray(d.publicationtype) ? d.publicationtype.join(" ") : String(d.publicationtype || "");
    return {
      title: clip(plainText(d.title || ""), 400), authors: (Array.isArray(d.author) ? d.author : [d.author]).filter(Boolean).map((a: string) => {
        const [last, first] = String(a).split(",").map(s => s.trim()); return first ? `${first} ${last}` : last; // ERIC: "Last, First"
      }).slice(0, 25),
      year: String(d.publicationdateyear || ""), date: "", journal: clip(d.source || "", 300),
      url: cleanLink(d.url || (d.id ? `https://eric.ed.gov/?id=${d.id}` : "")), doi: "",
      abstract: clip(plainText(d.description || ""), 1500), type: typeOf(pt, d.source || ""),
      issn: (Array.isArray(d.issn) ? d.issn : d.issn ? [d.issn] : []).map((i: string) => clip(String(i).replace(/^ISSN-?/i, ""), 12)), peerReviewed: true,
      topic: topic.key, cat: topic.cat, source: "eric" as const, sourceName: "ERIC",
    };
  });
}

// Crossref: רישום ה-DOI של ההוצאות. מתעדכן מהר יותר מ-OpenAlex, ולכן מאמרים חדשים מכתבי העת שברשימה מגיעים ממנו קודם.
// (סינון issn חוזר = "או"; from-pub-date ו-has-abstract מצמצמים לפריטים עם תקציר.)
const jats = (x: string) => plainText(String(x || "").replace(/<jats:title>[^<]*<\/jats:title>/gi, " ").replace(/<[^>]+>/g, " ")).replace(/\s+/g, " ").trim();
export async function fromCrossref(topic: typeof TOPICS[number]): Promise<Cand[]> {
  const mail = (Netlify.env.get("GMAIL_USER") || "").trim();
  const u = new URL("https://api.crossref.org/works");
  u.searchParams.set("query.bibliographic", topic.q);
  u.searchParams.set("filter", [`from-pub-date:${sinceDate(120)}`, "has-abstract:true", "type:journal-article", ...ALL_ISSNS.map(i => `issn:${i}`)].join(","));
  u.searchParams.set("select", "DOI,title,author,issued,published,container-title,ISSN,type,URL,abstract");
  u.searchParams.set("rows", "25");
  if (mail) u.searchParams.set("mailto", mail);
  const j: any = await (await getJson(u.toString(), 12000)).json();
  return ((j.message?.items || []) as any[]).map(x => {
    const dp: number[] = (x.published || x.issued)?.["date-parts"]?.[0] || [];
    const date = dp.length ? dp.map((n, i) => i ? String(n).padStart(2, "0") : String(n)).join("-") : "";
    const journal = clip((x["container-title"] || [])[0], 300);
    return {
      title: clip(plainText((x.title || [])[0] || ""), 400),
      authors: (x.author || []).map((a: any) => clip([a.given, a.family].filter(Boolean).join(" ") || a.name, 120)).filter(Boolean).slice(0, 25),
      year: String(dp[0] || ""), date: clip(date, 10), journal, issn: (x.ISSN || []).map((i: string) => clip(i, 12)),
      url: cleanLink(x.DOI ? `https://doi.org/${x.DOI}` : x.URL || ""), doi: clip(x.DOI, 200),
      abstract: clip(jats(x.abstract), 1500), type: "מאמר",
      topic: topic.key, cat: topic.cat, source: "crossref" as const, sourceName: "Crossref",
    };
  });
}

// Europe PMC: כתבי העת של הפסיכולוגיה ובריאות הנפש שברשימה (חוסן, טראומה, בריאות נפשית בבית הספר), עם תקצירים מלאים.
export async function fromEuropePmc(topic: typeof TOPICS[number]): Promise<Cand[]> {
  const issns = QUALITY_JOURNALS.filter(j => j.area === "resilience").flatMap(j => j.issn);
  const u = new URL("https://www.ebi.ac.uk/europepmc/webservices/rest/search");
  // מילות הנושא ב"או", ובנוסף מילה מתחום החינוך, כי אלה כתבי עת של פסיכולוגיה. הסינון המדויק (must) נעשה אחר כך בקוד.
  u.searchParams.set("query", `(${topic.q.split(/\s+/).join(" OR ")}) AND (school OR schools OR students OR teachers OR education OR classroom) AND (${issns.map(i => `ISSN:"${i}"`).join(" OR ")}) AND FIRST_PDATE:[${sinceDate(120)} TO 3000-01-01] AND HAS_ABSTRACT:Y AND SRC:MED`);
  u.searchParams.set("format", "json"); u.searchParams.set("pageSize", "25"); u.searchParams.set("resultType", "core"); u.searchParams.set("sort", "RELEVANCE");
  const j: any = await (await getJson(u.toString(), 12000)).json();
  return ((j.resultList?.result || []) as any[]).map(x => ({
    title: clip(plainText(x.title || ""), 400),
    authors: String(x.authorString || "").replace(/\.$/, "").split(/,\s*/).map((a: string) => clip(a, 120)).filter(Boolean).slice(0, 25),
    year: String(x.pubYear || ""), date: clip(x.firstPublicationDate || "", 10),
    journal: clip(x.journalInfo?.journal?.title || x.journalTitle || "", 300), issn: [x.journalInfo?.journal?.issn, x.journalInfo?.journal?.essn].filter(Boolean).map((i: string) => clip(i, 12)),
    url: cleanLink(x.doi ? `https://doi.org/${x.doi}` : `https://europepmc.org/article/${x.source}/${x.id}`), doi: clip(x.doi, 200),
    abstract: clip(plainText(x.abstractText || ""), 1500), type: "מאמר",
    topic: topic.key, cat: topic.cat, source: "europepmc" as const, sourceName: "Europe PMC",
  }));
}

export async function fromFeed(f: FeedSource): Promise<Cand[]> {
  const body = await (await getJson(f.url)).text();
  return parseFeed(body, f.url).slice(0, 30).map(r => ({
    title: clip(r.title, 400), authors: [], year: "", date: "", journal: f.name, url: r.url, doi: "",
    abstract: clip(r.description, 1500), type: f.section === "policy" ? "מדיניות" : f.section === "research-tools" ? "כלי" : f.section === "publications" ? "מאמר" : "משאב",
    topic: "", cat: "", source: "rss" as const, sourceName: f.name, section: f.section,
  }));
}

// ---------- סף איכות ----------

// מחקר מהמאגרים נכנס לתיבה רק אם הוא מכתב עת מהרשימה או עבר שיפוט עמיתים (ERIC), ויש לו תקציר של ממש.
export function qualityOK(c: { title?: string; abstract?: string; journal?: string; issn?: string[]; peerReviewed?: boolean; type?: string }) {
  if (String(c.abstract || "").length < 300) return false;
  return !!qualityJournal(c.journal || "", c.issn || []) || !!c.peerReviewed;
}

// ניקוי התיבה: מחקרים מהאיסוף הקודם שלא עומדים בסף מסומנים "נדחה" (לא נמחקים, כדי שלא יחזרו).
// במנות (31.10.2026): עם מאות פריטים בתיבה, ניקוי בבת אחת חרג ממגבלת הזמן של הפונקציה ונעצר באמצע. הדפדפן קורא שוב עד ש-remaining=0.
export async function purgeLowQuality(limit = 25): Promise<{ rejected: number; remaining: number }> {
  const st = data();
  const bad = (await listInbox()).filter(v => v.source !== "rss" && (!qualityOK(v) || offTopic(v)));
  let n = 0;
  for (const v of bad.slice(0, limit)) {
    await st.setJSON(`library-inbox/${v.key}.json`, { ...v, abstract: "", status: "rejected", rejectedFor: offTopic(v) ? "higher-ed" : "quality" });
    n++;
  }
  return { rejected: n, remaining: bad.length - n };
}

// בדיקת איכות לספרייה: מקורות שנכנסו מהאיסוף האוטומטי ולא מכתב עת מהרשימה. מנהלת המערכת מחליטה מה להשאיר.
export async function auditLibrary() {
  const st = data();
  const keep = new Set(await getAuditKeep());
  const { blobs } = await st.list({ prefix: "library/" });
  const rows: { id: string; title: string; journal: string; year: string; origin: string; url: string; research: boolean }[] = [];
  const { blobs: res } = await st.list({ prefix: "resources/" });
  const linked = new Set<string>();
  for (const b of res) { const r = await st.get(b.key, { type: "json" }) as any; if (r?.libraryId) linked.add(r.libraryId); }
  for (const b of blobs) {
    const v = await st.get(b.key, { type: "json" }) as any;
    if (!v || !["openalex", "eric", "crossref", "europepmc"].includes(v.origin) || keep.has(v.id)) continue;
    if (qualityJournal(v.journal || "") && !offTopic(v)) continue;
    rows.push({ id: v.id, title: clip(v.title || v.apa, 400), journal: clip(v.journal, 200), year: clip(v.year, 10), origin: v.origin, url: clip(v.doi, 600), research: linked.has(v.id) });
  }
  return rows.sort((a, b) => b.year.localeCompare(a.year));
}
export async function getAuditKeep(): Promise<string[]> {
  const v = await data().get("library-feed/audit-keep.json", { type: "json" }) as string[] | null;
  return Array.isArray(v) ? v : [];
}
export async function auditKeep(itemId: string) {
  const cur = new Set(await getAuditKeep()); cur.add(clip(itemId, 120));
  await data().setJSON("library-feed/audit-keep.json", [...cur].slice(-5000));
}
// הסרה מהספרייה, וגם מ"חידושים במחקר" אם המחקר פורסם שם.
export async function removeFromLibrary(itemId: string): Promise<boolean> {
  const st = data();
  const old = await st.get(`library/${itemId}.json`, { type: "json" }) as any;
  if (!old) return false;
  if (old.fileKey) await store("hosen-files").delete(old.fileKey);
  await st.delete(`library/${itemId}.json`);
  const { blobs } = await st.list({ prefix: "resources/" });
  for (const b of blobs) { const r = await st.get(b.key, { type: "json" }) as any; if (r?.libraryId === itemId) await st.delete(b.key); }
  return true;
}

export const QUALITY_INFO = { areas: QUALITY_AREAS, journals: QUALITY_JOURNALS.map(j => ({ name: j.name, area: j.area })) };

// פידים מומלצים של גופי מחקר (31.10.2026). "verified": הכתובת אומתה ככתובת פיד; אחרת היא לפי תבנית מוכרת של האתר, ו"בדיקה" מראה אם היא עובדת.
export const SUGGESTED_FEEDS: (FeedSource & { note: string; verified: boolean })[] = [
  { name: "RAND · חינוך", url: "https://www.rand.org/topics/education-and-literacy.xml", section: "policy", enabled: true, verified: true, note: "דוחות ומחקרים של RAND בחינוך (אנגלית)" },
  { name: "Campbell Systematic Reviews", url: "https://onlinelibrary.wiley.com/feed/18911803/most-recent", section: "publications", enabled: true, verified: false, note: "סקירות שיטתיות חדשות (אנגלית)" },
  { name: "ReliefWeb · חינוך", url: "https://reliefweb.int/updates/rss.xml?advanced-search=%28T4592%29", section: "policy", enabled: true, verified: false, note: "דוחות הומניטריים בנושא חינוך בחירום (אנגלית). אם לא עובד: באתר ReliefWeb מסננים Theme: Education ומעתיקים את קישור ה-RSS" },
  { name: "מרכז טאוב", url: "https://www.taubcenter.org.il/feed/", section: "policy", enabled: true, verified: false, note: "מחקרי מדיניות על חינוך וחברה בישראל (עברית). כולל גם חדשות" },
  { name: "מוסד שמואל נאמן", url: "https://www.neaman.org.il/feed/", section: "policy", enabled: true, verified: false, note: "מחקרי מדיניות, טכנולוגיה וחינוך (עברית)" },
  { name: "World Bank · Education blog", url: "https://blogs.worldbank.org/education/rss.xml", section: "professional", enabled: false, verified: true, note: "בלוג (לא דוחות). כבוי כברירת מחדל" },
];

// בדיקת פיד לפני הוספה: כמה פריטים נקראים, ושלוש כותרות לדוגמה.
export async function testFeed(url: string) {
  const f: FeedSource = { name: "בדיקה", url: cleanLink(clip(url, 600)), section: "professional", enabled: true };
  if (!/^https:\/\//.test(f.url)) return { ok: false, error: "כתובת לא תקינה (נדרש https)" };
  try {
    const rows = await fromFeed(f);
    return { ok: rows.length > 0, found: rows.length, sample: rows.slice(0, 3).map(r => r.title), error: rows.length ? "" : "הכתובת נענתה אבל לא נמצאו בה פריטים (כנראה לא פיד RSS)" };
  } catch (e) { return { ok: false, found: 0, error: String((e as Error)?.message || e).slice(0, 160) }; }
}

// ---------- אחסון ----------

export async function getFeeds(): Promise<FeedSource[]> {
  const v = await data().get("library-feed/feeds.json", { type: "json" }) as FeedSource[] | null;
  return Array.isArray(v) ? v : [];
}
export async function saveFeeds(rows: unknown): Promise<FeedSource[]> {
  const list = (Array.isArray(rows) ? rows : []).slice(0, 20).map((x: any) => ({
    name: clip(x?.name, 120) || "פיד", url: cleanLink(clip(x?.url, 600)),
    section: (Object.keys(SECTION_LABELS).includes(x?.section) ? x.section : "professional") as LibSection, enabled: x?.enabled !== false,
  })).filter(x => x.url);
  await data().setJSON("library-feed/feeds.json", list);
  return list;
}
export async function getStatus(): Promise<FeedStatus[]> {
  return (await data().get("library-feed/status.json", { type: "json" }) as FeedStatus[] | null) || [];
}

const norm = (s: string) => String(s || "").toLowerCase().replace(/[^\p{L}\p{N}]+/gu, "");

async function knownKeys(): Promise<Set<string>> {
  const st = data(), keys = new Set<string>();
  for (const prefix of ["library-inbox/", "library/"]) {
    const { blobs } = await st.list({ prefix });
    for (const b of blobs) {
      if (prefix === "library-inbox/") { keys.add(b.key.slice(prefix.length).replace(/\.json$/, "")); continue; }
      const v = await st.get(b.key, { type: "json" }) as any;
      if (v?.doi) keys.add("d:" + norm(String(v.doi).replace(/^https?:\/\/(dx\.)?doi\.org\//i, "")));
      if (v?.title) keys.add("t:" + norm(v.title));
    }
  }
  return keys;
}

export async function listInbox(): Promise<LibInboxItem[]> {
  const st = data();
  const { blobs } = await st.list({ prefix: "library-inbox/" });
  const rows: LibInboxItem[] = [];
  for (const b of blobs) { const v = await st.get(b.key, { type: "json" }) as LibInboxItem | null; if (v?.status === "new") rows.push(v); }
  // האיכותיים קודם (סקירות שיטתיות, כתבי עת מובילים), ואז לפי תאריך.
  const q = (x: LibInboxItem) => (x.quality || qualityBadges(x)).length;
  return rows.sort((a, b) => q(b) - q(a) || (b.date || b.year).localeCompare(a.date || a.year) || b.foundAt.localeCompare(a.foundAt));
}

// איסוף: כל נושא משני המאגרים, ועוד הפידים. רק פריטים חדשים, בתחום, ושעוד לא קיימים בספרייה.
export async function collect(): Promise<FeedStatus[]> {
  const feeds = (await getFeeds()).filter(f => f.enabled);
  const jobs: { name: string; run: () => Promise<Cand[]>; strict: boolean; must?: RegExp }[] = [
    ...TOPICS.map(t => ({ name: `OpenAlex · ${t.label}`, run: () => fromOpenAlex(t), strict: true, must: t.must })),
    ...TOPICS.map(t => ({ name: `ERIC · ${t.label}`, run: () => fromEric(t), strict: true, must: t.must })),
    ...TOPICS.map(t => ({ name: `Crossref · ${t.label}`, run: () => fromCrossref(t), strict: true, must: t.must })),
    ...TOPICS.filter(t => ["resilience", "teachers", "parents", "emergency"].includes(t.key)).map(t => ({ name: `Europe PMC · ${t.label}`, run: () => fromEuropePmc(t), strict: true, must: t.must })),
    ...feeds.map(f => ({ name: `RSS · ${f.name}`, run: () => fromFeed(f), strict: false })),
  ];
  const results = await Promise.allSettled(jobs.map(j => j.run()));
  const known = await knownKeys();
  const status: FeedStatus[] = [];
  const at = new Date().toISOString();
  for (let i = 0; i < jobs.length; i++) {
    const j = jobs[i], r = results[i];
    if (r.status === "rejected") { status.push({ name: j.name, at, ok: false, found: 0, added: 0, error: String((r.reason as Error)?.message || r.reason).slice(0, 160) }); continue; }
    let found = 0, added = 0;
    // סינון, ואז דירוג: התאמה לנושא בכותרת, סימני איכות, ותאריך. מכל מאגר נכנסים לתיבה עד 8 לנושא, כדי שהתיבה תישאר קריאה.
    const pass: Cand[] = [];
    for (const c of r.value) {
      if (!c.title || !c.url) continue;
      const text = `${c.title} ${c.abstract}`;
      if (j.strict && (!FIELD.test(text) || (j.must && !j.must.test(text)))) continue;
      if (j.strict && (!qualityOK(c) || offTopic(c))) continue;
      pass.push(c);
    }
    found = pass.length;
    const score = (c: Cand) => (j.must && j.must.test(c.title) ? 3 : 0) + (FIELD.test(c.title) ? 1 : 0) + qualityBadges(c).length * 2;
    pass.sort((a, b) => score(b) - score(a) || String(b.date || b.year).localeCompare(String(a.date || a.year)));
    for (const c of j.strict ? pass.slice(0, 8) : pass) {
      const dk = c.doi ? "d:" + norm(c.doi) : "", tk = "t:" + norm(c.title), key = linkKey(c.doi || c.url);
      if (known.has(key) || (dk && known.has(dk)) || known.has(tk)) continue;
      known.add(key); if (dk) known.add(dk); known.add(tk);
      const item: LibInboxItem = { ...c, key, section: c.section || sectionOfType(c.type), foundAt: at, status: "new", quality: qualityBadges(c) };
      await data().setJSON(`library-inbox/${key}.json`, item);
      added++;
    }
    status.push({ name: j.name, at, ok: true, found, added });
  }
  await data().setJSON("library-feed/status.json", status);
  return status;
}

// אישור: הפריט נכנס לספרייה (אותו מבנה כמו מקור שמנהלת המערכת מוסיפה), עם ציטוט APA7 ומדור,
// וגם למדור שלו ב"חידושים במחקר", עם "מה חדש" ו"התרומה" בעברית (researchCat: "none" = ספרייה בלבד).
// אם העברית עוד לא מוכנה, המחקר נשמר מוסתר (pendingHebrew), ופונקציית הרקע משלימה ומציגה אותו.
export type ApproveEdits = Partial<LibInboxItem> & { researchCat?: string; heSummary?: string; heWhy?: string };
export async function approve(key: string, edits: ApproveEdits = {}) {
  const st = data();
  const v = await st.get(`library-inbox/${key}.json`, { type: "json" }) as LibInboxItem | null;
  if (!v || v.status !== "new") return null;
  const x = { ...v, ...Object.fromEntries(Object.entries(edits).filter(([k]) => ["title", "section", "type", "abstract"].includes(k))) } as LibInboxItem;
  if (!Object.keys(SECTION_LABELS).includes(x.section)) x.section = sectionOfType(x.type);
  const now = new Date().toISOString();
  const row = {
    id: id(), apa: apa7(x), title: clip(x.title, 400), authors: x.authors.join(", "), year: x.year, journal: x.journal,
    doi: x.doi ? `https://doi.org/${x.doi}` : x.url, abstract: clip(x.abstract, 1500), type: x.type, section: x.section,
    researchCategory: x.cat, subject: [x.title, x.abstract].join(" ").slice(0, 2000), publicationDate: x.date || x.year,
    origin: x.source, createdAt: now, updatedAt: now,
  };
  await st.setJSON(`library/${row.id}.json`, row);
  let research: { id: string; category: string; pending: boolean } | null = null;
  const rc = String(edits.researchCat ?? v.he?.cat ?? v.cat ?? "");
  if (RESEARCH_CATS[rc]) {
    const summary = clip(edits.heSummary ?? v.he?.summary ?? "", 2000), why = clip(edits.heWhy ?? v.he?.why ?? "", 2000);
    const pending = !(summary && why);
    const res = {
      id: id(), title: row.title, authors: row.authors, year: x.year, source: x.journal, url: row.doi,
      description: summary, whyImportant: why, abstract: row.abstract, category: `research-${rc}`, type: "link",
      startDate: /^\d{4}-\d{2}-\d{2}$/.test(x.date || "") ? x.date : "",
      active: !pending, pendingHebrew: pending, gallery: [], links: [], suggestedBy: "הספרייה המתחדשת", libraryId: row.id,
      createdAt: now, updatedAt: now,
    };
    await st.setJSON(`resources/${res.id}.json`, res);
    research = { id: res.id, category: res.category, pending };
  }
  await st.setJSON(`library-inbox/${key}.json`, { ...v, status: "approved" });
  return { ...row, research };
}

export async function reject(key: string) {
  const st = data();
  const v = await st.get(`library-inbox/${key}.json`, { type: "json" }) as LibInboxItem | null;
  if (!v) return false;
  // נשאר כ"נדחה" כדי שלא יחזור באיסוף הבא; התקציר נמחק לחיסכון במקום.
  await st.setJSON(`library-inbox/${key}.json`, { ...v, abstract: "", status: "rejected" });
  return true;
}

// הסתרת מקור מהספרייה — גם מקור שכתוב בקוד העמוד (כמו "חידושים במחקר"), שאי אפשר למחוק מהשרת.
export async function getHidden(): Promise<string[]> {
  const v = await data().get("library-feed/hidden.json", { type: "json" }) as string[] | null;
  return Array.isArray(v) ? v : [];
}
export async function setHidden(itemId: string, hide: boolean): Promise<string[]> {
  const cur = new Set(await getHidden());
  const k = clip(itemId, 200);
  if (!k) return [...cur];
  if (hide) cur.add(k); else cur.delete(k);
  const list = [...cur].slice(-2000);
  await data().setJSON("library-feed/hidden.json", list);
  return list;
}
