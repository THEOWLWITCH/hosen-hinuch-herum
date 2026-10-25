// חיפוש מקורות במאגרים אקדמיים פתוחים בעולם (25/10/2026: "פתח את החיפוש והרחב אותו למנועי חיפוש נוספים").
// אותו קובץ בדיוק משמש את אתר חוסן-חינוך-חירום ואת Be Good — שינוי כאן מעתיקים לשניהם.
//
// מאגרים: OpenAlex, Crossref, ERIC, Semantic Scholar, Europe PMC, DOAJ, ו-CORE (רק אם הוגדר CORE_API_KEY).
// כולם חינמיים ובלי מפתח, חוץ מ-CORE. כל מאגר עם הגבלת זמן משלו: מאגר שלא עונה לא מפיל את החיפוש.
// עברית: המילים מתורגמות לאנגלית לפי מילון התחום (חוסן, חינוך, חירום...). מילים שלא במילון מתורגמות
// במודל הזול (Haiku) אם יש ANTHROPIC_API_KEY. השאילתה בעברית נשלחת גם כמו שהיא ל-OpenAlex ול-Crossref,
// כדי למצוא גם פרסומים בעברית.
// התוצאות מאוחדות (אותו DOI או אותה כותרת = פריט אחד, עם כל המאגרים שמצאו אותו) ומדורגות לפי התאמה.
// אלה רשומות אמיתיות מהמאגרים — שום דבר כאן לא נכתב בידי מודל שפה.

const UA = "hosen-hinuch-herum/be-good source search (mailto:yael.sade@gmail.com)";
const MAIL = "yael.sade@gmail.com";
const clip = (v, n) => String(v == null ? "" : v).replace(/\s+/g, " ").trim().slice(0, n);
const strip = (s) => String(s || "").replace(/<[^>]+>/g, " ").replace(/&amp;/g, "&").replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/\s+/g, " ").trim();
const cleanDoi = (d) => String(d || "").trim().replace(/^https?:\/\/(dx\.)?doi\.org\//i, "").replace(/^doi:\s*/i, "").toLowerCase();
const normTitle = (s) => String(s || "").toLowerCase().replace(/[^\p{L}\p{N}]+/gu, "");
const HEB = /[֐-׿]/;

// ---------- מילון התחום: עברית → אנגלית ----------
// צירופים לפני מילים בודדות (ההתאמה הארוכה ביותר קודמת).
const DICT = {
  "בינה מלאכותית יוצרת": "generative AI", "בינה מלאכותית": "artificial intelligence", "בינה מלאכותית בחינוך": "artificial intelligence in education",
  "חינוך בחירום": "education in emergencies", "חינוך בשעת חירום": "education in emergencies", "מצבי חירום": "emergencies", "שעת חירום": "emergency",
  "רציפות למידה": "learning continuity", "רציפות לימודית": "learning continuity", "למידה מרחוק": "remote learning", "הוראה מרחוק": "remote teaching",
  "למידה מקוונת": "online learning", "למידה רגשית חברתית": "social emotional learning", "למידה חברתית רגשית": "social emotional learning",
  "חוסן נפשי": "psychological resilience", "חוסן קהילתי": "community resilience", "חוסן ארגוני": "organizational resilience", "חוסן חברתי": "social resilience",
  "חוסן לאומי": "national resilience", "חוסן מערכתי": "system resilience", "חוסן משפחתי": "family resilience",
  "צוותי חינוך": "educators", "צוות חינוכי": "school staff", "אנשי חינוך": "educators", "מנהלי בתי ספר": "school principals", "מנהלות בתי ספר": "school principals",
  "הכשרת מורים": "teacher education", "פיתוח מקצועי": "professional development", "בית ספר": "school", "בתי ספר": "schools", "בית הספר": "school",
  "גני ילדים": "kindergarten", "גן ילדים": "kindergarten", "גיל הרך": "early childhood", "הגיל הרך": "early childhood", "חינוך מיוחד": "special education",
  "חברה ערבית": "Arab society", "חברה חרדית": "ultra-Orthodox", "רשות מקומית": "local authority", "רשויות מקומיות": "local authorities",
  "פוסט טראומה": "posttraumatic stress", "פוסט טראומטית": "posttraumatic", "צמיחה פוסט טראומטית": "posttraumatic growth", "דחק טראומטי": "traumatic stress",
  "ויסות רגשי": "emotion regulation", "בריאות הנפש": "mental health", "בריאות נפשית": "mental health", "עזרה ראשונה נפשית": "psychological first aid",
  "תמיכה חברתית": "social support", "מעורבות הורים": "parental involvement", "שותפות עם הורים": "family school partnership",
  "עוטף עזה": "Gaza border communities", "מלחמת חרבות ברזל": "Israel Hamas war 2023", "חרבות ברזל": "Israel Hamas war 2023", "שבעה באוקטובר": "October 7",
  "רעידת אדמה": "earthquake", "אסון טבע": "natural disaster", "אסונות טבע": "natural disasters", "שינוי אקלים": "climate change", "משבר האקלים": "climate crisis",
  "מגפת הקורונה": "COVID-19 pandemic", "קורונה": "COVID-19", "סגירת בתי ספר": "school closures", "קבלת החלטות": "decision making",
  "מודלי שפה": "large language models", "מודל שפה": "language model", "צ'אט בוט": "chatbot",
  חוסן: "resilience", חינוך: "education", חינוכי: "educational", חינוכית: "educational", חירום: "emergency", משבר: "crisis", משברים: "crises",
  מלחמה: "war", מלחמות: "wars", טראומה: "trauma", טראומטי: "traumatic", אסון: "disaster", אסונות: "disasters", טרור: "terrorism", טילים: "rocket attacks",
  מורה: "teacher", מורים: "teachers", מורות: "teachers", מחנכים: "educators", מחנכות: "educators", מחנך: "educator", גננות: "preschool teachers",
  תלמיד: "student", תלמידים: "students", תלמידות: "students", סטודנטים: "university students", ילדים: "children", ילד: "child", נוער: "youth", בני: "", מתבגרים: "adolescents",
  הורים: "parents", הורות: "parenting", משפחה: "family", משפחות: "families", קהילה: "community", קהילות: "communities", קהילתי: "community",
  מנהיגות: "leadership", מנהלים: "principals", מנהלות: "principals", ניהול: "management", ארגון: "organization", ארגוני: "organizational",
  מוכנות: "preparedness", היערכות: "preparedness", תרגול: "drill", תרגולים: "drills", תוכנית: "program", תכנית: "program", תוכניות: "programs",
  מדיניות: "policy", רשות: "authority", רשויות: "authorities", ממשלה: "government", משרד: "ministry",
  רווחה: "well-being", רווחת: "well-being", חרדה: "anxiety", דחק: "stress", לחץ: "stress", שחיקה: "burnout", דיכאון: "depression", אובדן: "loss", שכול: "bereavement", אבל: "grief",
  פינוי: "evacuation", מפונים: "evacuees", מפונות: "evacuees", עקורים: "displaced", עקירה: "displacement", פליטים: "refugees", הגירה: "migration",
  שייכות: "belonging", אמון: "trust", תקווה: "hope", אופטימיות: "optimism", אכפתיות: "caring", אמפתיה: "empathy", מסוגלות: "self-efficacy", משמעות: "meaning",
  התערבות: "intervention", התערבויות: "interventions", מניעה: "prevention", תמיכה: "support", ליווי: "mentoring", הדרכה: "training", הכשרה: "training",
  טכנולוגיה: "technology", דיגיטלי: "digital", דיגיטלית: "digital", סימולציה: "simulation", סימולציות: "simulations", משחק: "game", משחקים: "games",
  למידה: "learning", הוראה: "teaching", לימוד: "learning", הערכה: "assessment", מדידה: "measurement", שאלון: "questionnaire", מחקר: "research", סקירה: "review",
  שיח: "dialogue", שיחה: "conversation", תקשורת: "communication", אוריינות: "literacy", יישומים: "applications", יישום: "implementation",
  ישראל: "Israel", ישראלי: "Israeli", ישראלית: "Israeli", ישראלים: "Israeli", ערבים: "Arab", ערבי: "Arab", ערבית: "Arab", חרדים: "ultra-Orthodox", בדואים: "Bedouin",
  פריפריה: "periphery", גבול: "border", ביטחון: "security", ביטחוני: "security", אזעקות: "sirens", מקלט: "shelter", מיגון: "shelter",
  רגשי: "emotional", רגשית: "emotional", חברתי: "social", חברתית: "social", נפשי: "psychological", נפשית: "psychological", פסיכולוגי: "psychological",
  שגרה: "routine", שגרות: "routines", חזרה: "return", גמישות: "flexibility", הסתגלות: "adaptation", התמודדות: "coping",
};
// מילות קישור שאין צורך לחפש
const STOP = new Set(["של", "עם", "על", "את", "או", "גם", "בין", "לפי", "האם", "כיצד", "איך", "מה", "מי", "אשר", "כמו", "לא", "כל", "זה", "זו", "אלה", "יש", "אין", "בזמן", "בעת", "אצל", "לגבי", "בקרב", "and", "or", "the", "of", "in", "on", "for", "to", "a", "an", "with"]);
const PREFIX = /^(ו|ה|ב|ל|מ|ש|כ|וה|וב|ול|ומ|וש|שה|שב|של|מה|בה|לה|כש|וכש|שמ)(?=[֐-׿]{2,})/;

function lookup(word) {
  if (DICT[word] !== undefined) return DICT[word];
  // תחיליות: "והמורים" → "מורים", "בחירום" → "חירום"
  let w = word;
  for (let i = 0; i < 2; i++) {
    const m = w.match(PREFIX);
    if (!m) break;
    w = w.slice(m[0].length);
    if (DICT[w] !== undefined) return DICT[w];
  }
  return null;
}

// מתרגם לפי המילון. מחזיר { english, unknown[] } — unknown: מילים בעברית שלא נמצאו.
export function translateByDictionary(q) {
  const words = String(q || "").replace(/[״"'`,.:;!?()\[\]{}־–—\/\\]/g, " ").split(/\s+/).filter(Boolean);
  const out = [], unknown = [];
  for (let i = 0; i < words.length;) {
    let hit = null, len = 0;
    for (let n = Math.min(4, words.length - i); n >= 2 && !hit; n--) {
      const phrase = words.slice(i, i + n).join(" ");
      const v = lookup(phrase);
      if (v != null) { hit = v; len = n; }
    }
    if (hit != null) { if (hit) out.push(hit); i += len; continue; }
    const w = words[i++];
    if (STOP.has(w.toLowerCase())) continue;
    if (!HEB.test(w)) { out.push(w); continue; }
    const v = lookup(w);
    if (v != null) { if (v) out.push(v); continue; }
    unknown.push(w);
  }
  return { english: [...new Set(out)].join(" ").trim(), unknown };
}

async function translateByModel(q, env, ms) {
  const key = env("ANTHROPIC_API_KEY");
  if (!key) return "";
  const ctl = new AbortController();
  const t = setTimeout(() => ctl.abort(), ms);
  try {
    const r = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST", signal: ctl.signal,
      headers: { "content-type": "application/json", "x-api-key": key, "anthropic-version": "2023-06-01" },
      body: JSON.stringify({
        model: "claude-haiku-5-5", max_tokens: 120,
        system: "Translate the user's Hebrew research topic into a concise English academic search query (keywords only, 3-10 words, no quotes, no explanation). The field is education, resilience and emergencies. Reply with the query only.",
        messages: [{ role: "user", content: clip(q, 400) }],
      }),
    });
    if (!r.ok) return "";
    const j = await r.json();
    const text = (j.content || []).filter((b) => b.type === "text").map((b) => b.text).join(" ");
    return clip(text.replace(/["\n]/g, " "), 200).replace(/[֐-׿]+/g, "").trim();
  } catch { return ""; } finally { clearTimeout(t); }
}

// ---------- המאגרים ----------

async function getJson(url, ms, headers = {}) {
  const ctl = new AbortController();
  const t = setTimeout(() => ctl.abort(), ms);
  try {
    const r = await fetch(url, { signal: ctl.signal, headers: { "user-agent": UA, accept: "application/json", ...headers } });
    if (r.status === 429) throw new Error("עומס במאגר (429)");
    if (!r.ok) throw new Error("HTTP " + r.status);
    return await r.json();
  } catch (e) {
    if (e && e.name === "AbortError") throw new Error("המאגר לא ענה בזמן");
    throw e;
  } finally { clearTimeout(t); }
}

function invertedAbstract(idx) {
  if (!idx || typeof idx !== "object") return "";
  const words = [];
  for (const [w, pos] of Object.entries(idx)) for (const p of pos) words[p] = w;
  return words.filter(Boolean).join(" ");
}

const rec = (o) => ({
  title: clip(strip(o.title), 400), authors: (o.authors || []).map((a) => clip(a, 120)).filter(Boolean).slice(0, 12),
  year: o.year ? String(o.year).slice(0, 4) : "", venue: clip(strip(o.venue), 250), doi: cleanDoi(o.doi),
  url: clip(o.url, 600), oaUrl: clip(o.oaUrl, 600), abstract: clip(strip(o.abstract), 700), type: clip(o.type, 40),
  cites: Number(o.cites) || 0, lang: clip(o.lang, 8),
});

export const ENGINES = {
  openalex: {
    name: "OpenAlex", info: "מאות מיליוני פרסומים מכל התחומים",
    async run(q, { per, from, ms }) {
      const u = new URL("https://api.openalex.org/works");
      u.searchParams.set("search", q); u.searchParams.set("per-page", String(per)); u.searchParams.set("mailto", MAIL);
      if (from) u.searchParams.set("filter", `from_publication_date:${from}-01-01`);
      const j = await getJson(u, ms);
      return (j.results || []).map((w) => rec({
        title: w.display_name || w.title, authors: (w.authorships || []).map((a) => a.author && a.author.display_name),
        year: w.publication_year, venue: w.primary_location && w.primary_location.source && w.primary_location.source.display_name,
        doi: w.doi, url: (w.primary_location && w.primary_location.landing_page_url) || w.doi || w.id,
        oaUrl: w.open_access && w.open_access.oa_url, abstract: invertedAbstract(w.abstract_inverted_index), type: w.type,
        cites: w.cited_by_count, lang: w.language,
      }));
    },
  },
  crossref: {
    name: "Crossref", info: "רישום DOI העולמי של כתבי העת וההוצאות",
    async run(q, { per, from, ms }) {
      const u = new URL("https://api.crossref.org/works");
      u.searchParams.set("query.bibliographic", q); u.searchParams.set("rows", String(per)); u.searchParams.set("mailto", MAIL);
      u.searchParams.set("select", "DOI,title,author,issued,container-title,type,URL,abstract,is-referenced-by-count,language");
      if (from) u.searchParams.set("filter", `from-pub-date:${from}`);
      const j = await getJson(u, ms);
      return ((j.message && j.message.items) || []).map((x) => rec({
        title: (x.title || [])[0], authors: (x.author || []).map((a) => [a.given, a.family].filter(Boolean).join(" ") || a.name),
        year: x.issued && x.issued["date-parts"] && x.issued["date-parts"][0] && x.issued["date-parts"][0][0],
        venue: (x["container-title"] || [])[0], doi: x.DOI, url: x.URL, abstract: x.abstract, type: x.type,
        cites: x["is-referenced-by-count"], lang: x.language,
      }));
    },
  },
  eric: {
    name: "ERIC", info: "מאגר מחקרי החינוך של משרד החינוך האמריקאי",
    async run(q, { per, from, ms }) {
      const u = new URL("https://api.ies.ed.gov/eric/");
      u.searchParams.set("search", from ? `${q} AND publicationdateyear:[${from} TO *]` : q);
      u.searchParams.set("format", "json"); u.searchParams.set("rows", String(per));
      u.searchParams.set("fields", "id,title,author,description,publicationdateyear,source,url,publicationtype,peerreviewed,e_fulltextauth");
      const j = await getJson(u, ms);
      return ((j.response && j.response.docs) || []).map((d) => rec({
        title: d.title, authors: (Array.isArray(d.author) ? d.author : [d.author]).filter(Boolean).map((a) => {
          const [last, first] = String(a).split(",").map((s) => s.trim()); return first ? `${first} ${last}` : last;
        }),
        year: d.publicationdateyear, venue: d.source, url: d.id ? `https://eric.ed.gov/?id=${d.id}` : d.url,
        oaUrl: d.e_fulltextauth && d.id && /^ED/.test(d.id) ? `https://files.eric.ed.gov/fulltext/${d.id}.pdf` : "",
        abstract: d.description, type: Array.isArray(d.publicationtype) ? d.publicationtype[0] : d.publicationtype,
      }));
    },
  },
  semantic: {
    name: "Semantic Scholar", info: "מנוע מחקר אקדמי מבוסס בינה מלאכותית",
    async run(q, { per, from, ms, env }) {
      const u = new URL("https://api.semanticscholar.org/graph/v1/paper/search");
      u.searchParams.set("query", q); u.searchParams.set("limit", String(per));
      u.searchParams.set("fields", "title,year,venue,authors,externalIds,url,abstract,openAccessPdf,citationCount,publicationTypes");
      if (from) u.searchParams.set("year", `${from}-`);
      const key = env("S2_API_KEY");
      const j = await getJson(u, ms, key ? { "x-api-key": key } : {});
      return (j.data || []).map((p) => rec({
        title: p.title, authors: (p.authors || []).map((a) => a.name), year: p.year, venue: p.venue,
        doi: p.externalIds && p.externalIds.DOI, url: p.url, oaUrl: p.openAccessPdf && p.openAccessPdf.url,
        abstract: p.abstract, type: (p.publicationTypes || [])[0], cites: p.citationCount,
      }));
    },
  },
  europepmc: {
    name: "Europe PMC", info: "בריאות, בריאות הנפש ופסיכולוגיה (כולל PubMed)",
    async run(q, { per, from, ms }) {
      const u = new URL("https://www.ebi.ac.uk/europepmc/webservices/rest/search");
      u.searchParams.set("query", from ? `(${q}) AND PUB_YEAR:[${from} TO 3000]` : q);
      u.searchParams.set("format", "json"); u.searchParams.set("pageSize", String(per)); u.searchParams.set("resultType", "core");
      const j = await getJson(u, ms);
      return ((j.resultList && j.resultList.result) || []).map((x) => {
        const ft = ((x.fullTextUrlList && x.fullTextUrlList.fullTextUrl) || []).find((f) => f.availabilityCode === "OA" || f.availability === "Open access");
        return rec({
          title: x.title, authors: String(x.authorString || "").replace(/\.$/, "").split(/,\s*/), year: x.pubYear,
          venue: (x.journalInfo && x.journalInfo.journal && x.journalInfo.journal.title) || x.journalTitle || x.bookOrReportDetails && x.bookOrReportDetails.publisher,
          doi: x.doi, url: x.doi ? `https://doi.org/${x.doi}` : `https://europepmc.org/article/${x.source}/${x.id}`,
          oaUrl: x.isOpenAccess === "Y" && ft ? ft.url : "", abstract: x.abstractText, type: (x.pubTypeList && x.pubTypeList.pubType || [])[0],
          cites: x.citedByCount, lang: x.language,
        });
      });
    },
  },
  doaj: {
    name: "DOAJ", info: "כתבי עת בגישה פתוחה (כל המאמרים חינמיים)",
    async run(q, { per, from, ms }) {
      const query = from ? `${q} AND bibjson.year:[${from} TO *]` : q;
      const u = new URL("https://doaj.org/api/search/articles/" + encodeURIComponent(query));
      u.searchParams.set("pageSize", String(per)); u.searchParams.set("page", "1");
      const j = await getJson(u, ms);
      return (j.results || []).map((r) => {
        const b = r.bibjson || {};
        const doi = ((b.identifier || []).find((i) => String(i.type).toLowerCase() === "doi") || {}).id;
        const link = ((b.link || []).find((l) => l.type === "fulltext") || (b.link || [])[0] || {}).url;
        return rec({
          title: b.title, authors: (b.author || []).map((a) => a.name), year: b.year, venue: b.journal && b.journal.title,
          doi, url: doi ? `https://doi.org/${cleanDoi(doi)}` : link, oaUrl: link, abstract: b.abstract, type: "article",
        });
      });
    },
  },
  core: {
    name: "CORE", info: "מאגרים מוסדיים ותזות בגישה פתוחה", needsKey: "CORE_API_KEY",
    async run(q, { per, from, ms, env }) {
      const key = env("CORE_API_KEY");
      const u = new URL("https://api.core.ac.uk/v3/search/works");
      u.searchParams.set("q", from ? `(${q}) AND yearPublished>=${from}` : q); u.searchParams.set("limit", String(per));
      const j = await getJson(u, ms, { authorization: "Bearer " + key });
      return (j.results || []).map((w) => rec({
        title: w.title, authors: (w.authors || []).map((a) => a.name), year: w.yearPublished, venue: w.publisher || (w.journals || [])[0] && w.journals[0].title,
        doi: w.doi, url: w.doi ? `https://doi.org/${cleanDoi(w.doi)}` : (w.links || []).map((l) => l.url)[0] || `https://core.ac.uk/works/${w.id}`,
        oaUrl: w.downloadUrl, abstract: w.abstract, type: w.documentType,
      }));
    },
  },
};

// ---------- קישורי המשך: מנועים שאין להם ממשק פתוח, ומקורות ישראליים ----------
export function moreLinks(q, english) {
  const e = encodeURIComponent, he = q, en = english || q;
  const g = (site, query) => `https://www.google.com/search?q=${e(query + " site:" + site)}`;
  return [
    { name: "Google Scholar", url: `https://scholar.google.com/scholar?q=${e(en)}` },
    ...(HEB.test(he) ? [{ name: "Google Scholar בעברית", url: `https://scholar.google.com/scholar?q=${e(he)}&hl=iw` }] : []),
    { name: "BASE", url: `https://www.base-search.net/Search/Results?lookfor=${e(en)}` },
    { name: "CORE", url: `https://core.ac.uk/search?q=${e(en)}` },
    { name: "ReliefWeb", url: `https://reliefweb.int/updates?search=${e(en)}` },
    { name: "INEE (חינוך בחירום)", url: g("inee.org", en) },
    { name: "UNESCO", url: g("unesdoc.unesco.org", en) },
    { name: "משרד החינוך", url: g("gov.il", he) },
    { name: "מכון מופ\"ת", url: g("mofet.macam.ac.il", he) },
    { name: "יוזמה (האקדמיה הלאומית)", url: g("education.academy.ac.il", he) },
    { name: "מכון שמואל נאמן", url: g("neaman.org.il", he) },
  ];
}

// ---------- איחוד ודירוג ----------
function terms(s) {
  return [...new Set(String(s || "").toLowerCase().split(/[^\p{L}\p{N}]+/u).filter((w) => w.length > 2 && !STOP.has(w)))];
}

export function mergeAndRank(lists, queryText) {
  const byKey = new Map();
  for (const { engine, items } of lists) {
    for (const it of items) {
      if (!it.title) continue;
      const k1 = it.doi ? "d:" + it.doi : "", k2 = "t:" + normTitle(it.title) + ":" + (it.year || "");
      let cur = (k1 && byKey.get(k1)) || byKey.get(k2);
      if (!cur) {
        cur = { ...it, engines: [] };
        if (k1) byKey.set(k1, cur);
        byKey.set(k2, cur);
      } else {
        for (const f of ["doi", "url", "oaUrl", "venue", "year", "type", "lang"]) if (!cur[f] && it[f]) cur[f] = it[f];
        if ((it.abstract || "").length > (cur.abstract || "").length) cur.abstract = it.abstract;
        if (!cur.authors.length && it.authors.length) cur.authors = it.authors;
        cur.cites = Math.max(cur.cites || 0, it.cites || 0);
        if (cur.doi && !byKey.has("d:" + cur.doi)) byKey.set("d:" + cur.doi, cur);
      }
      if (!cur.engines.includes(engine)) cur.engines.push(engine);
    }
  }
  const T = terms(queryText), now = new Date().getFullYear();
  const rows = [...new Set(byKey.values())];
  for (const r of rows) {
    const title = r.title.toLowerCase(), abs = (r.abstract || "").toLowerCase();
    const inTitle = T.filter((w) => title.includes(w)).length, inAbs = T.filter((w) => abs.includes(w)).length;
    const cover = T.length ? (inTitle * 2 + inAbs) / (T.length * 3) : 0;
    const age = r.year ? Math.max(0, now - Number(r.year)) : 15;
    r.score = Math.round((cover * 10 + (r.engines.length - 1) * 1.5 + Math.log10(1 + (r.cites || 0)) * 0.8 + Math.max(0, 3 - age / 4) + (r.oaUrl ? 0.5 : 0) + (r.abstract ? 0.3 : 0)) * 100) / 100;
    if (!r.url) r.url = r.doi ? `https://doi.org/${r.doi}` : r.oaUrl;
  }
  return rows.filter((r) => r.url).sort((a, b) => b.score - a.score);
}

// ---------- החיפוש ----------
// opts: { engines?: string[], from?: number, per?: number, env?: (k)=>string, translate?: boolean }
export async function searchSources(query, opts = {}) {
  const env = opts.env || ((k) => (typeof process !== "undefined" && process.env ? process.env[k] : "") || "");
  const q = clip(query, 300);
  if (q.length < 2) return { query: q, english: "", results: [], engines: [], links: [] };
  const per = Math.min(Math.max(Number(opts.per) || 10, 3), 25);
  const from = Number(opts.from) > 1900 ? Math.floor(Number(opts.from)) : 0;
  const ms = Number(opts.ms) || 7000;
  let english = q, unknown = [], translatedBy = "";
  if (HEB.test(q)) {
    const d = translateByDictionary(q);
    english = d.english; unknown = d.unknown; translatedBy = "מילון";
    if (unknown.length && opts.translate !== false) {
      const m = await translateByModel(q, env, 3000);
      if (m) { english = m; unknown = []; translatedBy = "מודל"; }
    }
  }
  const wanted = (opts.engines && opts.engines.length ? opts.engines : Object.keys(ENGINES))
    .filter((k) => ENGINES[k] && (!ENGINES[k].needsKey || env(ENGINES[k].needsKey)));
  const jobs = [];
  for (const k of wanted) {
    if (english) jobs.push({ k, q: english });
    if (HEB.test(q) && (k === "openalex" || k === "crossref")) jobs.push({ k, q, he: true }); // פרסומים בעברית
  }
  const t0 = Date.now();
  const settled = await Promise.allSettled(jobs.map((j) => ENGINES[j.k].run(j.q, { per, from, ms, env })));
  const status = new Map();
  const lists = [];
  settled.forEach((s, i) => {
    const j = jobs[i], st = status.get(j.k) || { key: j.k, name: ENGINES[j.k].name, info: ENGINES[j.k].info, ok: false, count: 0, error: "" };
    if (s.status === "fulfilled") { st.ok = true; st.count += s.value.length; st.error = ""; lists.push({ engine: ENGINES[j.k].name, items: s.value }); }
    else if (!st.ok) st.error = clip(s.reason && s.reason.message || s.reason, 120);
    status.set(j.k, st);
  });
  const results = mergeAndRank(lists, [english, q].join(" ")).slice(0, Number(opts.max) || 40);
  return {
    query: q, english, translatedBy, unknown, from, ms: Date.now() - t0,
    engines: [...status.values()], results, links: moreLinks(q, english),
  };
}
