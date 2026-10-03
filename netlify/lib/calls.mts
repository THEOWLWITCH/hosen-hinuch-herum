// מרכז קולות קוראים: איסוף ממקורות, תיבת אישור, התאמה לחוקרות, יומן ומיילים.
// מקור אמת יחיד לנושאים ולהתאמה — גם המסך הציבורי וגם המיילים נשענים עליו.
import { id, issueToken, store } from "./shared.mts";
import { type Team, listTeams } from "./teams.mts";

export type Call = {
  id: string; title: string; description?: string; category: string; type?: string;
  url?: string; fileKey?: string; startDate?: string; endDate?: string; active?: boolean;
  funder?: string; amount?: string; eligibility?: string; language?: string;
  topics?: string[]; outcome?: string;
  source?: "admin" | "auto" | "member"; sourceName?: string; suggestedBy?: string;
  notified?: { email: string; at: string }[];
  createdAt?: string; updatedAt?: string;
};
export type InboxItem = {
  id: string; key: string; title: string; url: string; description: string;
  endDate: string; funder: string; source: "auto" | "member"; sourceName: string;
  suggestedBy?: string; suggestedEmail?: string; foundAt: string;
  status: "new" | "approved" | "rejected"; callId?: string;
};
export type Source = { name: string; url: string; filter: boolean; enabled: boolean };
export type SourceStatus = { url: string; at: string; ok: boolean; found: number; added: number; error?: string };
export type Person = { id: string; name: string; email?: string; description?: string; institution?: string };

export const CALL_CATEGORIES = ["calls", "grants", "conferences"];
export const CATEGORY_LABELS: Record<string, string> = { calls: "קול קורא", grants: "מענק מחקר", conferences: "כנס" };

const data = () => store("hosen-data");

// ---------- נושאים והתאמה ----------

export const THEMES: { key: string; label: string; re: RegExp }[] = [
  { key: "resilience", label: "חוסן ורווחה", re: /חוסן|רווחה|well-?being|resilien/i },
  { key: "emergency", label: "חינוך בחירום ומשבר", re: /חירום|חרום|משבר|מלחמ|אסון|פינוי|מפונ|emergenc|crisis|crises|disaster|war\b|conflict|displace/i },
  { key: "ai", label: "בינה מלאכותית", re: /בינה מלאכותית|\bAI\b|\bGenAI\b|artificial intelligence|גנרטיב|machine learning|למידת מכונה/ },
  { key: "tech", label: "טכנולוגיה ולמידה מרחוק", re: /טכנולוג|דיגיטל|למידה מרחוק|היברידי|digital|technolog|ed-?tech|online learning|remote learning|hybrid/i },
  { key: "policy", label: "מדיניות חינוך", re: /מדיניות|רגולצי|policy|policies|regulat/i },
  { key: "leadership", label: "מנהיגות וניהול", re: /מנהיגות|ניהול|מנהל(?:ת|י)? בית|leadership|principal|school management/i },
  { key: "teachers", label: "מורים וצוותי חינוך", re: /מורים|מורות|הכשרת מורים|צוותי? חינוך|צוותים חינוכיים|הוראה|teacher|educator|teaching|professional development/i },
  { key: "diversity", label: "רב־תרבותיות ושילוב", re: /רב[\s־-]?תרבות|חברה ערבית|הגירה|עלייה|קליטת|מודר|שילוב|multicultur|diversit|minorit|arab|immigra|inclusi|equity/i },
  { key: "community", label: "קהילה ורשויות", re: /קהיל|רשות מקומית|רשויות|community|communities|municipal|local authorit/i },
  { key: "media", label: "מדיה ואוריינות", re: /מדיה|קולנוע|אוריינות|media|film|literacy/i },
  { key: "stem", label: "מדעים, מתמטיקה ומדעי המחשב", re: /מדעים|מתמטיק|מדעי המחשב|\bSTEM\b|science education|mathemat|computer science/i },
  { key: "innovation", label: "חדשנות, יזמות ועיצוב", re: /חדשנות|יזמות|חשיבה עיצובית|עיצוב|innovat|entrepreneur|design thinking/i },
  { key: "organizational", label: "ייעוץ ופיתוח ארגוני", re: /ייעוץ ארגוני|ארגוני|משאבי אנוש|organi[sz]ational|human resources/i },
  { key: "welfare", label: "נוער בסיכון, מוגנות ובריאות נפשית", re: /עבודה סוציאלית|נוער בסיכון|ילדים בסיכון|מוגנות|בריאות נפשית|social work|at[\s-]risk|child protection|mental health/i },
  { key: "environment", label: "סביבה ואקלים", re: /סביב(?:ה|תי)|אקלים|קיימות|climate|environment|sustainab/i },
  { key: "evaluation", label: "הערכה ומדדים", re: /הערכה|מדדים|מדידה|evaluat|assessment|indicator|\bPISA\b/i },
  { key: "simulation", label: "סימולציות", re: /סימולצי|simulation/i },
];
export const THEME_LABELS: Record<string, string> = Object.fromEntries(THEMES.map(t => [t.key, t.label]));

export function inferTopics(text: string): string[] {
  const s = String(text || "");
  return THEMES.filter(t => t.re.test(s)).map(t => t.key);
}

export function callTopics(c: Partial<Call>): string[] {
  if (Array.isArray(c.topics) && c.topics.length) return c.topics.filter(k => THEME_LABELS[k]);
  return inferTopics([c.title, c.description, c.funder, c.eligibility].join(" "));
}

export function personTopics(p: Person): string[] {
  return inferTopics([p.description, p.institution].join(" "));
}

export type Match = { id: string; name: string; email: string; score: number; shared: string[] };

// התאמה = נושאים משותפים בין הקול הקורא לתחומי העיסוק של החוקרת.
export function matchPeople(c: Partial<Call>, people: Person[]): Match[] {
  const topics = new Set(callTopics(c));
  if (!topics.size) return [];
  return people
    .map(p => {
      const shared = personTopics(p).filter(k => topics.has(k));
      return { id: p.id, name: p.name, email: String(p.email || "").trim(), score: shared.length, shared };
    })
    .filter(m => m.score > 0)
    .sort((a, b) => b.score - a.score || a.name.localeCompare(b.name, "he"));
}

export async function loadPeople(origin: string): Promise<Person[]> {
  try {
    // כאן צריך גם את כתובות המייל, ולכן הפנייה נעשית בהרשאת ניהול שנוצרת בשרת.
    const r = await fetch(new URL("/api/people?admin=1", origin), { headers: { authorization: "Bearer " + (await issueToken("admin")) } });
    if (!r.ok) return [];
    const rows = await r.json();
    return Array.isArray(rows) ? rows : [];
  } catch {
    return [];
  }
}

// ---------- תאריכים ----------

export function israelToday(): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Jerusalem", year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date());
}

export function daysBetween(fromIso: string, toIso: string): number {
  return Math.round((Date.parse(toIso + "T00:00:00Z") - Date.parse(fromIso + "T00:00:00Z")) / 86400000);
}

export function formatDate(iso: string): string {
  const m = String(iso || "").match(/^(\d{4})-(\d{2})-(\d{2})$/);
  return m ? `${Number(m[3])}.${Number(m[2])}.${m[1]}` : "";
}

const MONTHS: Record<string, number> = {
  jan: 1, feb: 2, mar: 3, apr: 4, may: 5, jun: 6, jul: 7, aug: 8, sep: 9, oct: 10, nov: 11, dec: 12,
  ינואר: 1, פברואר: 2, מרץ: 3, מרס: 3, אפריל: 4, מאי: 5, יוני: 6, יולי: 7, אוגוסט: 8, ספטמבר: 9, אוקטובר: 10, נובמבר: 11, דצמבר: 12,
};

function isoOf(y: number, m: number, d: number): string {
  if (y < 100) y += 2000;
  if (m < 1 || m > 12 || d < 1 || d > 31) return "";
  const dt = new Date(Date.UTC(y, m - 1, d));
  if (dt.getUTCMonth() !== m - 1) return "";
  return dt.toISOString().slice(0, 10);
}

// מוצא את המועד האחרון להגשה בטקסט. מעדיף תאריך שמופיע אחרי "עד", "מועד" או "deadline".
export function extractDeadline(text: string, today = israelToday()): string {
  const s = String(text || "");
  const found: { iso: string; near: boolean }[] = [];
  const push = (iso: string, index: number) => {
    if (!iso) return;
    const days = daysBetween(today, iso);
    if (days < 0 || days > 730) return;
    const before = s.slice(Math.max(0, index - 45), index);
    found.push({ iso, near: /עד|מועד|אחרון|הגשה|להגיש|deadline|due|until|closes|close on|submi/i.test(before) });
  };
  for (const m of s.matchAll(/\b(\d{1,2})[./](\d{1,2})[./](\d{2,4})\b/g)) push(isoOf(+m[3], +m[2], +m[1]), m.index || 0);
  for (const m of s.matchAll(/\b(\d{4})-(\d{2})-(\d{2})\b/g)) push(isoOf(+m[1], +m[2], +m[3]), m.index || 0);
  const monthNames = Object.keys(MONTHS).join("|");
  for (const m of s.matchAll(new RegExp(`(\\d{1,2})\\s*(?:ב|ל)?(${monthNames})[a-z]*\\.?,?\\s*(\\d{4})`, "gi")))
    push(isoOf(+m[3], MONTHS[m[2].toLowerCase().slice(0, /^[a-z]/i.test(m[2]) ? 3 : undefined)] || 0, +m[1]), m.index || 0);
  for (const m of s.matchAll(/\b(jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)[a-z]*\.?\s+(\d{1,2}),?\s+(\d{4})/gi))
    push(isoOf(+m[3], MONTHS[m[1].toLowerCase()], +m[2]), m.index || 0);
  if (!found.length) return "";
  const pool = found.some(f => f.near) ? found.filter(f => f.near) : found;
  return pool.map(f => f.iso).sort()[0];
}

// ---------- איסוף ממקורות ----------

const CALL_WORDS = /קול(?:ות)? קור(?:א|אים)|הגשת הצעות|הצעות מחקר|מענק|מלג(?:ה|ת|ות)|הגשת תקצירים|קול קורא|call for (?:papers|proposals|applications|abstracts|submissions)|\bCFP\b|funding opportunit|\bgrants?\b|fellowships?|request for proposals|\bRFP\b/i;
const FIELD_WORDS = /חינוך|בית[\s-]?ספר|בתי[\s-]?ספר|מורים|למידה|חוסן|חירום|חרום|education|school|teacher|learning|resilien|emergenc|crisis/i;

export function relevantToField(text: string): boolean {
  return CALL_WORDS.test(text) && FIELD_WORDS.test(text);
}

const ENTITIES: Record<string, string> = { amp: "&", lt: "<", gt: ">", quot: '"', apos: "'", nbsp: " ", rsquo: "’", lsquo: "‘", ndash: "–", mdash: "—", hellip: "…" };

export function plainText(html: string): string {
  return String(html || "")
    .replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, "$1")
    .replace(/<(script|style)[\s\S]*?<\/\1>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/&#(\d+);/g, (_, n) => String.fromCodePoint(+n))
    .replace(/&#x([0-9a-f]+);/gi, (_, n) => String.fromCodePoint(parseInt(n, 16)))
    .replace(/&([a-z]+);/gi, (m, n) => ENTITIES[n.toLowerCase()] ?? m)
    // בפידים (למשל Google Alerts) ה-HTML מקודד — אחרי הפענוח מסירים שוב תגיות.
    .replace(/<\/?[a-z][^>]*>/gi, " ")
    .replace(/\s+/g, " ")
    .trim();
}

// קישורי Google Alerts עטופים בכתובת הפניה — מחלצים את הכתובת האמיתית.
export function cleanLink(raw: string, base?: string): string {
  try {
    let u = new URL(plainText(raw), base);
    if (/(^|\.)google\.[a-z.]+$/.test(u.hostname) && u.pathname === "/url") {
      const inner = u.searchParams.get("url") || u.searchParams.get("q");
      if (inner) u = new URL(inner);
    }
    if (!/^https?:$/.test(u.protocol)) return "";
    for (const k of [...u.searchParams.keys()]) if (/^(utm_|fbclid|gclid)/i.test(k)) u.searchParams.delete(k);
    u.hash = "";
    return u.toString();
  } catch {
    return "";
  }
}

export function linkKey(url: string): string {
  const u = String(url || "").toLowerCase().replace(/^https?:\/\/(www\.)?/, "").replace(/\/+$/, "");
  let h = 0x811c9dc5;
  for (let i = 0; i < u.length; i++) { h ^= u.charCodeAt(i); h = Math.imul(h, 0x01000193); }
  return (h >>> 0).toString(36) + "-" + u.length.toString(36);
}

export type Candidate = { title: string; url: string; description: string };

export function parseFeed(xml: string, base: string): Candidate[] {
  const out: Candidate[] = [];
  const blocks = xml.match(/<(item|entry)\b[\s\S]*?<\/\1>/gi) || [];
  for (const b of blocks) {
    const pick = (tag: string) => (b.match(new RegExp(`<${tag}\\b[^>]*>([\\s\\S]*?)<\\/${tag}>`, "i")) || [])[1] || "";
    const title = plainText(pick("title"));
    const href = (b.match(/<link\b[^>]*href=["']([^"']+)["']/i) || [])[1] || pick("link") || pick("guid");
    const url = cleanLink(href, base);
    const description = plainText(pick("description") || pick("summary") || pick("content") || pick("content:encoded")).slice(0, 1500);
    if (title && url) out.push({ title, url, description });
  }
  return out;
}

export function parsePage(html: string, base: string): Candidate[] {
  const out: Candidate[] = [];
  for (const m of html.matchAll(/<a\b[^>]*href=["']([^"'#][^"']*)["'][^>]*>([\s\S]*?)<\/a>/gi)) {
    const title = plainText(m[2]);
    if (title.length < 8 || title.length > 300) continue;
    const url = cleanLink(m[1], base);
    if (!url) continue;
    const at = m.index || 0;
    const description = plainText(html.slice(at, at + 1200)).slice(0, 600);
    out.push({ title, url, description });
  }
  return out;
}

async function fetchText(url: string, ms = 8000): Promise<string> {
  const ctl = new AbortController();
  const t = setTimeout(() => ctl.abort(), ms);
  try {
    const r = await fetch(url, { signal: ctl.signal, headers: { "user-agent": "hosen-hinuch-herum calls collector", accept: "application/rss+xml, application/atom+xml, text/html;q=0.9, */*;q=0.5" } });
    if (!r.ok) throw new Error("HTTP " + r.status);
    return (await r.text()).slice(0, 1_500_000);
  } finally {
    clearTimeout(t);
  }
}

// רשימת פתיחה מומלצת. נטענת רק כל עוד מנהלת המערכת לא שמרה רשימה משלה;
// אחרי השמירה הראשונה הרשימה כולה בידיה. בסטטוס של כל מקור רואים אם הוא עובד.
const gnews = (q: string, lang: "he" | "en") => lang === "he"
  ? `https://news.google.com/rss/search?q=${encodeURIComponent(q + " when:30d")}&hl=he&gl=IL&ceid=IL:he`
  : `https://news.google.com/rss/search?q=${encodeURIComponent(q + " when:30d")}&hl=en-US&gl=US&ceid=US:en`;

export const DEFAULT_SOURCES: Source[] = [
  { name: "חדשות Google: קול קורא + חינוך", url: gnews('"קול קורא" חינוך', "he"), filter: true, enabled: true },
  { name: "חדשות Google: קול קורא + חוסן", url: gnews('"קול קורא" חוסן', "he"), filter: true, enabled: true },
  { name: "חדשות Google: הצעות מחקר בחינוך", url: gnews('"הצעות מחקר" חינוך', "he"), filter: true, enabled: true },
  { name: "חדשות Google: מענק מחקר חינוך חירום", url: gnews("מענק מחקר חינוך חירום", "he"), filter: true, enabled: true },
  { name: "Google News: education in emergencies calls", url: gnews('"call for proposals" "education in emergencies"', "en"), filter: true, enabled: true },
  { name: "Google News: education resilience grants", url: gnews('"research grant" education resilience', "en"), filter: true, enabled: true },
  { name: "Google News: education call for papers", url: gnews('"call for papers" education crisis OR emergency OR resilience', "en"), filter: true, enabled: true },
  { name: "Google News: AI in education calls", url: gnews('"call for proposals" "artificial intelligence" education', "en"), filter: true, enabled: true },
  { name: "הקרן הלאומית למדע (ISF)", url: "https://www.isf.org.il/", filter: true, enabled: true },
  { name: "מכון מופ\"ת", url: "https://mofet.macam.ac.il/", filter: true, enabled: true },
  { name: "מוסד שמואל נאמן", url: "https://www.neaman.org.il/", filter: true, enabled: true },
  { name: "ISERD — הורייזן אירופה", url: "https://www.iserd.org.il/", filter: true, enabled: true },
  { name: "יד הנדיב", url: "https://www.yadhanadiv.org.il/", filter: true, enabled: true },
  { name: "Spencer Foundation", url: "https://www.spencer.org/", filter: true, enabled: true },
];

export async function getSources(): Promise<Source[]> {
  const v = await data().get("call-sources/list.json", { type: "json" }) as Source[] | null;
  return Array.isArray(v) ? v : DEFAULT_SOURCES;
}

export async function saveSources(rows: unknown): Promise<Source[]> {
  const list = (Array.isArray(rows) ? rows : []).slice(0, 25).map((x: any) => ({
    name: String(x?.name || "").trim().slice(0, 120),
    url: cleanLink(String(x?.url || "").trim()),
    filter: x?.filter !== false,
    enabled: x?.enabled !== false,
  })).filter(x => x.url);
  await data().setJSON("call-sources/list.json", list);
  return list;
}

export async function getSourceStatus(): Promise<SourceStatus[]> {
  const v = await data().get("call-sources/status.json", { type: "json" }) as SourceStatus[] | null;
  return Array.isArray(v) ? v : [];
}

async function existingKeys(): Promise<Set<string>> {
  const keys = new Set<string>();
  const { blobs } = await data().list({ prefix: "call-inbox/" });
  for (const b of blobs) keys.add(b.key.slice("call-inbox/".length).replace(/\.json$/, ""));
  for (const c of await listCalls()) {
    if (c.url) keys.add(linkKey(c.url));
    keys.add("t:" + normTitle(c.title));
  }
  return keys;
}

function normTitle(t: string) {
  return String(t || "").toLowerCase().replace(/[^\p{L}\p{N}]+/gu, "");
}

// רץ פעם ביום ומכל מקור מוסיף לתיבת האישור רק פריטים חדשים ורלוונטיים.
export async function collectFromSources(): Promise<SourceStatus[]> {
  const sources = (await getSources()).filter(s => s.enabled);
  const known = await existingKeys();
  const today = israelToday();
  const results = await Promise.allSettled(sources.map(async s => {
    const body = await fetchText(s.url);
    const isFeed = /<(rss|feed|rdf:RDF)\b/i.test(body.slice(0, 2000));
    const rows = (isFeed ? parseFeed(body, s.url) : parsePage(body, s.url)).slice(0, 60);
    return { s, rows: rows.filter(r => !s.filter || relevantToField(r.title + " " + r.description)) };
  }));
  const status: SourceStatus[] = [];
  for (let i = 0; i < sources.length; i++) {
    const s = sources[i], r = results[i];
    if (r.status === "rejected") {
      status.push({ url: s.url, at: new Date().toISOString(), ok: false, found: 0, added: 0, error: String((r.reason as Error)?.message || r.reason).slice(0, 200) });
      continue;
    }
    let added = 0;
    for (const row of r.value.rows) {
      const key = linkKey(row.url), tkey = "t:" + normTitle(row.title);
      if (known.has(key) || known.has(tkey)) continue;
      known.add(key); known.add(tkey);
      const endDate = extractDeadline(row.title + " " + row.description, today);
      const item: InboxItem = {
        id: key, key, title: row.title.slice(0, 300), url: row.url, description: row.description,
        endDate, funder: "", source: "auto", sourceName: s.name || new URL(s.url).hostname,
        foundAt: new Date().toISOString(), status: "new",
      };
      await data().setJSON(`call-inbox/${key}.json`, item);
      added++;
    }
    status.push({ url: s.url, at: new Date().toISOString(), ok: true, found: r.value.rows.length, added });
  }
  await data().setJSON("call-sources/status.json", status);
  return status;
}

// ---------- תיבת אישור וקולות קוראים ----------

export async function listInbox(): Promise<InboxItem[]> {
  const st = data();
  const { blobs } = await st.list({ prefix: "call-inbox/" });
  const rows: InboxItem[] = [];
  for (const b of blobs) {
    const v = await st.get(b.key, { type: "json" }) as InboxItem | null;
    if (v && v.status === "new") rows.push(v);
  }
  return rows.sort((a, b) => (a.endDate || "9999").localeCompare(b.endDate || "9999") || b.foundAt.localeCompare(a.foundAt));
}

export async function addMemberSuggestion(x: { title: string; url: string; endDate: string; funder: string; description: string; name: string; email: string }) {
  const url = cleanLink(x.url);
  if (!url) throw new Error("invalid_url");
  const key = linkKey(url);
  const known = await existingKeys();
  if (known.has(key) || known.has("t:" + normTitle(x.title))) return { duplicate: true };
  const item: InboxItem = {
    id: key, key, title: x.title, url, description: x.description,
    endDate: /^\d{4}-\d{2}-\d{2}$/.test(x.endDate) ? x.endDate : extractDeadline(x.description),
    funder: x.funder, source: "member", sourceName: "הצעה מחברת קהילה",
    suggestedBy: x.name, suggestedEmail: x.email, foundAt: new Date().toISOString(), status: "new",
  };
  await data().setJSON(`call-inbox/${key}.json`, item);
  return { duplicate: false };
}

export async function setInboxStatus(key: string, status: InboxItem["status"], callId?: string) {
  const st = data();
  const v = await st.get(`call-inbox/${key}.json`, { type: "json" }) as InboxItem | null;
  if (!v) return null;
  const next = { ...v, status, callId: callId || v.callId };
  await st.setJSON(`call-inbox/${key}.json`, next);
  return next;
}

export async function listCalls(): Promise<Call[]> {
  const st = data();
  const { blobs } = await st.list({ prefix: "resources/" });
  const rows: Call[] = [];
  for (const b of blobs) {
    const v = await st.get(b.key, { type: "json" }) as Call | null;
    if (v && CALL_CATEGORIES.includes(v.category)) rows.push(v);
  }
  return rows;
}

export async function getCall(callId: string): Promise<Call | null> {
  return await data().get(`resources/${callId}.json`, { type: "json" }) as Call | null;
}

export async function saveCall(c: Call): Promise<Call> {
  const x = { ...c, updatedAt: new Date().toISOString() };
  await data().setJSON(`resources/${x.id}.json`, x);
  return x;
}

export function cleanCallFields(body: any): Partial<Call> {
  const t = (v: unknown, n: number) => String(v ?? "").trim().slice(0, n);
  const out: Partial<Call> = {
    title: t(body.title, 300), description: t(body.description, 3000),
    funder: t(body.funder, 200), amount: t(body.amount, 200), eligibility: t(body.eligibility, 500), language: t(body.language, 80),
    outcome: t(body.outcome, 600),
  };
  if (body.url !== undefined) out.url = cleanLink(t(body.url, 1200));
  if (body.endDate !== undefined) out.endDate = /^\d{4}-\d{2}-\d{2}$/.test(String(body.endDate)) ? String(body.endDate) : "";
  if (body.category !== undefined) out.category = CALL_CATEGORIES.includes(body.category) ? body.category : "calls";
  if (Array.isArray(body.topics)) out.topics = body.topics.filter((k: string) => THEME_LABELS[k]);
  return out;
}

export function newCall(fields: Partial<Call>, origin: Partial<Call>): Call {
  const now = new Date().toISOString();
  return {
    type: "link", active: true, notified: [], ...origin, ...fields,
    id: id(), title: fields.title || origin.title || "", category: fields.category || "calls",
    createdAt: now, updatedAt: now,
  };
}

export function isOpen(c: Call, today: string): boolean {
  if (c.active === false) return false;
  if (c.startDate && c.startDate > today) return false;
  return !c.endDate || c.endDate >= today;
}

export async function getOptOut(): Promise<string[]> {
  const v = await data().get("call-mail/optout.json", { type: "json" }) as string[] | null;
  return Array.isArray(v) ? v : [];
}

export async function saveOptOut(list: unknown): Promise<string[]> {
  const rows = [...new Set((Array.isArray(list) ? list : []).map(x => String(x || "").trim().toLowerCase()).filter(x => x.includes("@")))];
  await data().setJSON("call-mail/optout.json", rows);
  return rows;
}

// ---------- יומן ----------

function icsText(s: string) {
  return String(s || "").replace(/\\/g, "\\\\").replace(/\n/g, "\\n").replace(/[,;]/g, m => "\\" + m);
}

function icsFold(line: string) {
  const out: string[] = [];
  let cur = "";
  for (const ch of line) {
    if (new TextEncoder().encode(cur + ch).length > 73) { out.push(cur); cur = " " + ch; } else cur += ch;
  }
  out.push(cur);
  return out.join("\r\n");
}

export function buildIcs(calls: Call[], site: string, calName = "קולות קוראים — חוסן חינוך חרום"): string {
  const stamp = new Date().toISOString().replace(/[-:]/g, "").replace(/\.\d+Z$/, "Z");
  const lines = ["BEGIN:VCALENDAR", "VERSION:2.0", "PRODID:-//hosen-hinuch-herum//calls//HE", "CALSCALE:GREGORIAN", "METHOD:PUBLISH", `X-WR-CALNAME:${icsText(calName)}`, "X-WR-TIMEZONE:Asia/Jerusalem"];
  for (const c of calls) {
    if (!c.endDate) continue;
    const d = c.endDate.replace(/-/g, "");
    const next = new Date(Date.parse(c.endDate + "T00:00:00Z") + 86400000).toISOString().slice(0, 10).replace(/-/g, "");
    const desc = [c.funder ? "גוף מממן: " + c.funder : "", c.description || "", c.url ? "לפרטים ולהגשה: " + c.url : "", site + "/calls"].filter(Boolean).join("\n\n");
    lines.push("BEGIN:VEVENT", `UID:call-${c.id}@hosen-hinuch-herum`, `DTSTAMP:${stamp}`, `DTSTART;VALUE=DATE:${d}`, `DTEND;VALUE=DATE:${next}`,
      `SUMMARY:${icsText("מועד אחרון: " + c.title)}`, `DESCRIPTION:${icsText(desc)}`);
    if (c.url) lines.push(`URL:${c.url}`);
    for (const before of ["-P14D", "-P3D"]) lines.push("BEGIN:VALARM", "ACTION:DISPLAY", `TRIGGER:${before}`, `DESCRIPTION:${icsText("תזכורת: " + c.title)}`, "END:VALARM");
    lines.push("END:VEVENT");
  }
  lines.push("END:VCALENDAR");
  return lines.map(icsFold).join("\r\n") + "\r\n";
}

// ---------- מיילים ----------

export function mailConfigured(): boolean {
  return !!(Netlify.env.get("GMAIL_USER") && Netlify.env.get("GMAIL_APP_PASSWORD"));
}

export async function sendMail(to: string, subject: string, html: string, text: string) {
  const nodemailer = (await import("nodemailer")).default;
  const user = Netlify.env.get("GMAIL_USER") || "";
  const transport = nodemailer.createTransport({ service: "gmail", auth: { user, pass: Netlify.env.get("GMAIL_APP_PASSWORD") || "" } });
  await transport.sendMail({ from: { name: "קהילת חוסן חינוך חרום", address: user }, to, subject, html, text });
}

function escHtml(s: string) {
  return String(s || "").replace(/[&<>"]/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c] || c));
}

// "קול קורא: X" → "X", כדי שבנושא המייל לא יופיע "קול קורא" פעמיים.
export function bareTitle(title: string) {
  return String(title || "").replace(/^\s*(קול קורא|קולות קוראים|call for [a-z]+)\s*[:\-–—]\s*/i, "") || title;
}

function firstName(name: string) {
  return String(name || "").replace(/^(ד״ר|ד"ר|פרופ׳|פרופ'|פרופ\.?)\s*/, "").trim().split(/\s+/)[0] || "";
}

function callLines(c: Call, today: string) {
  const left = c.endDate ? daysBetween(today, c.endDate) : null;
  const when = c.endDate ? `${formatDate(c.endDate)}${left !== null && left <= 30 ? ` (עוד ${left} ימים)` : ""}` : "";
  return [
    c.funder ? ["גוף מממן", c.funder] : null,
    when ? ["מועד אחרון להגשה", when] : null,
    c.amount ? ["היקף", c.amount] : null,
    c.eligibility ? ["מי יכולה להגיש", c.eligibility] : null,
  ].filter(Boolean) as [string, string][];
}

function wrapHtml(inner: string, site: string) {
  return `<div dir="rtl" style="font-family:Arial,sans-serif;max-width:600px;margin:auto;padding:8px 18px;color:#1d3445;line-height:1.7;font-size:15px">${inner}
<hr style="border:0;border-top:1px solid #dde6ea;margin:26px 0 12px">
<p style="font-size:12px;color:#6b7d88;margin:0">קהילת חוסן · חינוך · חרום — <a href="${site}/calls" style="color:#17649a">כל הקולות הקוראים באתר</a>.<br>לא רוצה לקבל התראות כאלה? אפשר פשוט להשיב למייל הזה ולכתוב "הסרה".</p></div>`;
}

function callBlockHtml(c: Call, today: string, site: string) {
  const rows = callLines(c, today).map(([k, v]) => `<li><strong>${escHtml(k)}:</strong> ${escHtml(v)}</li>`).join("");
  return `<div style="border:1px solid #dce7ec;border-radius:10px;padding:12px 16px;margin:12px 0;page-break-inside:avoid">
<p style="margin:0 0 6px;font-size:16px"><strong>${escHtml(c.title)}</strong></p>
${rows ? `<ul style="margin:0 0 8px;padding-inline-start:18px">${rows}</ul>` : ""}
${c.description ? `<p style="margin:0 0 8px">${escHtml(c.description.slice(0, 400))}</p>` : ""}
<p style="margin:0"><a href="${escHtml(c.url || site + "/calls")}" style="color:#17649a">לפרטים ולהגשה</a> · <a href="${site}/calls#call-${escHtml(c.id)}" style="color:#17649a">לקבוצות המשימה באתר</a></p></div>`;
}

function callBlockText(c: Call, today: string, site: string) {
  return [c.title, ...callLines(c, today).map(([k, v]) => `- ${k}: ${v}`), c.url ? `- לפרטים ולהגשה: ${c.url}` : "", `- לקבוצות המשימה באתר: ${site}/calls#call-${c.id}`].filter(Boolean).join("\n");
}

// מייל אישי לחוקרת על קול קורא אחד שמתאים לה.
export function callEmail(c: Call, m: Match, site: string, today = israelToday()) {
  const name = firstName(m.name);
  const why = m.shared.map(k => THEME_LABELS[k]).filter(Boolean).join(", ");
  const subject = `קול קורא שמתאים לתחום שלך: ${bareTitle(c.title)}`.slice(0, 160);
  const html = wrapHtml(`<p>שלום${name ? " " + escHtml(name) : ""},</p>
<p>פורסם קול קורא חדש, ונראה לנו שהוא <strong>מתאים לתחומי העיסוק שלך</strong>${why ? ` (${escHtml(why)})` : ""}.</p>
${callBlockHtml(c, today, site)}
<p>אם את מתכוונת להגיש, אפשר להקים באתר קבוצת משימה להגשה, או להצטרף לקבוצה שכבר קמה. בקבוצה כותבות את ההצעה יחד.</p>`, site);
  const text = `שלום${name ? " " + name : ""},\n\nפורסם קול קורא חדש, ונראה לנו שהוא מתאים לתחומי העיסוק שלך${why ? ` (${why})` : ""}.\n\n${callBlockText(c, today, site)}\n\nאם את מתכוונת להגיש, אפשר להקים באתר קבוצת משימה להגשה, או להצטרף לקבוצה שכבר קמה. בקבוצה כותבות את ההצעה יחד.\n\nלא רוצה לקבל התראות כאלה? אפשר להשיב "הסרה".`;
  return { subject, html, text };
}

// טיוטה כללית (בלי פנייה אישית) — לשליחה דרך Gmail כשאין חיבור מיילים.
export function callEmailGeneric(c: Call, site: string, today = israelToday()) {
  const subject = `קול קורא חדש: ${bareTitle(c.title)}`.slice(0, 160);
  const text = `שלום,\n\nפורסם קול קורא חדש, ונראה לנו שהוא מתאים לתחומי העיסוק שלך.\n\n${callBlockText(c, today, site)}\n\nאם את מתכוונת להגיש, אפשר להקים באתר קבוצת משימה להגשה, או להצטרף לקבוצה שכבר קמה. בקבוצה כותבות את ההצעה יחד.\n\nקהילת חוסן · חינוך · חרום`;
  return { subject, text };
}

export type Digest = { subject: string; html: string; text: string; count: number };

// סיכום שבועי אישי: מה מתאים לך, מה נסגר בקרוב ומה חדש.
export function weeklyDigest(person: Person | null, calls: Call[], site: string, today = israelToday(), teams: Team[] = []): Digest | null {
  const open = calls.filter(c => isOpen(c, today)).sort((a, b) => (a.endDate || "9999").localeCompare(b.endDate || "9999"));
  const weekAgo = new Date(Date.now() - 7 * 86400000).toISOString();
  const mine = person ? open.filter(c => matchPeople(c, [person]).length) : [];
  const mineIds = new Set(mine.map(c => c.id));
  const closing = open.filter(c => !mineIds.has(c.id) && c.endDate && daysBetween(today, c.endDate) <= 14);
  const shown = new Set([...mineIds, ...closing.map(c => c.id)]);
  const fresh = open.filter(c => !shown.has(c.id) && String(c.createdAt || "") >= weekAgo);
  const recruiting = teams.filter(t => t.status === "recruiting" && (!t.deadline || t.deadline >= today) && !(person && t.members.some(m => m.name === person.name)));
  const count = mine.length + closing.length + fresh.length + recruiting.length;
  if (!count) return null;
  const name = person ? firstName(person.name) : "";
  const sec = (title: string, rows: Call[]) => rows.length ? `<h3 style="font-size:16px;margin:22px 0 4px;color:#244b61">${title}</h3>${rows.map(c => callBlockHtml(c, today, site)).join("")}` : "";
  const secT = (title: string, rows: Call[]) => rows.length ? `${title}\n\n${rows.map(c => callBlockText(c, today, site)).join("\n\n")}\n\n` : "";
  const teamLine = (t: Team) => `${t.title}${t.funder ? " · " + t.funder : ""}${t.deadline ? " · עד " + formatDate(t.deadline) : ""}${t.need ? " — מחפשות: " + t.need : ""}`;
  const teamsHtml = recruiting.length ? `<h3 style="font-size:16px;margin:22px 0 4px;color:#244b61">🤝 קבוצות משימה שמחפשות שותפות</h3><ul style="padding-inline-start:18px">${recruiting.map(t => `<li>${escHtml(teamLine(t))}</li>`).join("")}</ul><p><a href="${site}/calls#teams" style="color:#17649a">לבקשת הצטרפות באתר</a></p>` : "";
  const teamsText = recruiting.length ? `קבוצות משימה שמחפשות שותפות\n\n${recruiting.map(t => "- " + teamLine(t)).join("\n")}\nלבקשת הצטרפות: ${site}/calls#teams\n\n` : "";
  const subject = mine.length ? `קולות קוראים השבוע: ${mine.length} מתאימים לתחום שלך` : "קולות קוראים השבוע בקהילה";
  const html = wrapHtml(`<p>שלום${name ? " " + escHtml(name) : ""},</p><p>זה הסיכום השבועי של <strong>הקולות הקוראים</strong> בקהילה.</p>
${sec("✨ מתאימים לתחום שלך", mine)}${sec("⏳ נסגרים בשבועיים הקרובים", closing)}${sec("🆕 חדשים השבוע", fresh)}${teamsHtml}`, site);
  const text = `שלום${name ? " " + name : ""},\n\nזה הסיכום השבועי של הקולות הקוראים בקהילה.\n\n${secT("מתאימים לתחום שלך", mine)}${secT("נסגרים בשבועיים הקרובים", closing)}${secT("חדשים השבוע", fresh)}${teamsText}לא רוצה לקבל? אפשר להשיב "הסרה".`;
  return { subject, html, text, count };
}

export async function sendWeeklyDigests(site: string): Promise<{ sent: number; skipped: number; failed: number }> {
  const [calls, people, optout, teams] = [await listCalls(), await loadPeople(site), new Set(await getOptOut()), await listTeams()];
  let sent = 0, skipped = 0, failed = 0;
  for (const p of people) {
    const email = String(p.email || "").trim();
    if (!email.includes("@") || optout.has(email.toLowerCase())) { skipped++; continue; }
    const d = weeklyDigest(p, calls, site, israelToday(), teams);
    if (!d) { skipped++; continue; }
    try { await sendMail(email, d.subject, d.html, d.text); sent++; } catch { failed++; }
  }
  await data().setJSON("call-mail/last-digest.json", { at: new Date().toISOString(), sent, skipped, failed });
  return { sent, skipped, failed };
}

export function siteUrl(fallback?: string): string {
  return (Netlify.env.get("URL") || fallback || "https://hosen-hinuch-herum.netlify.app").replace(/\/+$/, "");
}
