// ספרייה שמתחדשת: איסוף אוטומטי של מחקרים, דוחות ומשאבים לתיבת אישור.
// מקורות: OpenAlex ו-ERIC (מאגרים פתוחים וחינמיים), ופידים (RSS) שמנהלת המערכת מוסיפה.
import { id, store } from "./shared.mts";
import { cleanLink, linkKey, parseFeed, plainText } from "./calls.mts";

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
  { key: "parents", label: "הורים וקהילה", cat: "resilience", q: "parent family community engagement school crisis", must: /parent|famil|communit/i },
];
const FIELD = /educat|school|teacher|student|pupil|learning|classroom|kindergarten|principal|חינוך|בית ספר|מורים|תלמיד/i;

export type LibInboxItem = {
  key: string; title: string; authors: string[]; year: string; date: string; journal: string; url: string; doi: string;
  abstract: string; type: string; section: LibSection; topic: string; cat: string; source: "openalex" | "eric" | "rss"; sourceName: string;
  foundAt: string; status: "new" | "approved" | "rejected";
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

export async function fromOpenAlex(topic: typeof TOPICS[number]): Promise<Cand[]> {
  const mail = (Netlify.env.get("GMAIL_USER") || "").trim();
  const u = new URL("works", OPENALEX().replace(/\/?$/, "/"));
  u.searchParams.set("search", topic.q);
  u.searchParams.set("filter", `from_publication_date:${sinceDate()},type:article|report|book|book-chapter|preprint`);
  u.searchParams.set("sort", "publication_date:desc");
  u.searchParams.set("per-page", "15");
  if (mail) u.searchParams.set("mailto", mail);
  const j: any = await (await getJson(u.toString())).json();
  return (j.results || []).map((w: any) => {
    const doi = clip(String(w.doi || "").replace(/^https?:\/\/doi\.org\//i, ""), 200);
    const journal = clip(w.primary_location?.source?.display_name || w.host_venue?.display_name || "", 300);
    return {
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
  const u = new URL(ERIC());
  u.searchParams.set("search", `${topic.q} AND (publicationdateyear:${year} OR publicationdateyear:${year - 1})`);
  u.searchParams.set("format", "json");
  u.searchParams.set("rows", "15");
  u.searchParams.set("fields", "id,title,author,description,publicationdateyear,source,url,publicationtype,peerreviewed");
  const j: any = await (await getJson(u.toString())).json();
  return (j.response?.docs || []).map((d: any) => {
    const pt = Array.isArray(d.publicationtype) ? d.publicationtype.join(" ") : String(d.publicationtype || "");
    return {
      title: clip(plainText(d.title || ""), 400), authors: (Array.isArray(d.author) ? d.author : [d.author]).filter(Boolean).map((a: string) => {
        const [last, first] = String(a).split(",").map(s => s.trim()); return first ? `${first} ${last}` : last; // ERIC: "Last, First"
      }).slice(0, 25),
      year: String(d.publicationdateyear || ""), date: "", journal: clip(d.source || "", 300),
      url: cleanLink(d.url || (d.id ? `https://eric.ed.gov/?id=${d.id}` : "")), doi: "",
      abstract: clip(plainText(d.description || ""), 1500), type: typeOf(pt, d.source || ""),
      topic: topic.key, cat: topic.cat, source: "eric" as const, sourceName: "ERIC",
    };
  });
}

export async function fromFeed(f: FeedSource): Promise<Cand[]> {
  const body = await (await getJson(f.url)).text();
  return parseFeed(body, f.url).slice(0, 30).map(r => ({
    title: clip(r.title, 400), authors: [], year: "", date: "", journal: f.name, url: r.url, doi: "",
    abstract: clip(r.description, 1500), type: f.section === "policy" ? "מדיניות" : f.section === "research-tools" ? "כלי" : f.section === "publications" ? "מאמר" : "משאב",
    topic: "", cat: "", source: "rss" as const, sourceName: f.name, section: f.section,
  }));
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
  return rows.sort((a, b) => (b.date || b.year).localeCompare(a.date || a.year) || b.foundAt.localeCompare(a.foundAt));
}

// איסוף: כל נושא משני המאגרים, ועוד הפידים. רק פריטים חדשים, בתחום, ושעוד לא קיימים בספרייה.
export async function collect(): Promise<FeedStatus[]> {
  const feeds = (await getFeeds()).filter(f => f.enabled);
  const jobs: { name: string; run: () => Promise<Cand[]>; strict: boolean; must?: RegExp }[] = [
    ...TOPICS.map(t => ({ name: `OpenAlex · ${t.label}`, run: () => fromOpenAlex(t), strict: true, must: t.must })),
    ...TOPICS.map(t => ({ name: `ERIC · ${t.label}`, run: () => fromEric(t), strict: true, must: t.must })),
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
    for (const c of r.value) {
      if (!c.title || !c.url) continue;
      const text = `${c.title} ${c.abstract}`;
      if (j.strict && (!FIELD.test(text) || (j.must && !j.must.test(text)))) continue;
      found++;
      const dk = c.doi ? "d:" + norm(c.doi) : "", tk = "t:" + norm(c.title), key = linkKey(c.doi || c.url);
      if (known.has(key) || (dk && known.has(dk)) || known.has(tk)) continue;
      known.add(key); if (dk) known.add(dk); known.add(tk);
      const item: LibInboxItem = { ...c, key, section: c.section || sectionOfType(c.type), foundAt: at, status: "new" };
      await data().setJSON(`library-inbox/${key}.json`, item);
      added++;
    }
    status.push({ name: j.name, at, ok: true, found, added });
  }
  await data().setJSON("library-feed/status.json", status);
  return status;
}

// אישור: הפריט נכנס לספרייה (אותו מבנה כמו מקור שמנהלת המערכת מוסיפה), עם ציטוט APA7 ומדור.
export async function approve(key: string, edits: Partial<LibInboxItem> = {}) {
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
  await st.setJSON(`library-inbox/${key}.json`, { ...v, status: "approved" });
  return row;
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
