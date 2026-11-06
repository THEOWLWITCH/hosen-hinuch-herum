// ייבוא מסמך Word לסעיפי ההצעה במרחב עבודה (6.11.2026: "לפי הסעיפים תעתיק כל חלק למקומו הנכון בתבנית הכתיבה").
// קורא את הכותרות (Heading 1/2/3) ואת הטבלאות, מחלק את המסמך לחלקים, ומציע לכל חלק סעיף בתבנית לפי מילות מפתח
// בכותרת. כותרת משנה שלא מתאימה לשום סעיף נשארת עם הסעיף של הכותרת שמעליה. בלי מודל שפה: הכל לפי הכותרות.
import { unzipSync, strFromU8 } from "fflate";

export type DocPart = { heading: string; level: number; text: string; target: string };

const dec = (s: string) => s.replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&quot;/g, '"').replace(/&apos;/g, "'").replace(/&amp;/g, "&");

// מילות מפתח בכותרת → מזהה הסעיף בתבנית (DEFAULT_SECTIONS ב-teams.mts). הסדר חשוב: הספציפי לפני הכללי.
const RULES: [RegExp, string][] = [
  [/תקציר|abstract|summary/i, "summary"],
  [/קול(ות)? קורא|התאמה ל|תנאי סף|fit/i, "fit"],
  [/לוח זמנים|אבני דרך|גאנט|timeline|schedule/i, "timeline"],
  [/תקציב|budget/i, "budget"],
  [/אתיקה|ethic/i, "ethics"],
  [/הפצה|יישום בשטח|dissemination/i, "dissemination"],
  [/הצוות|חלוקת התפקידים|team/i, "team"],
  [/רשימת מקורות|ביבליוגרפיה|מקורות$|references|bibliography/i, "refs"],
  [/חדשנות|חידוש|תרומה|contribution|innovation/i, "innovation"],
  [/מתודולוגי|שיטה|שיטת|method/i, "method"],
  [/שאלות|שאלת|מטרות|השערות|מסגרת מושגית|aims|questions|hypothes/i, "aims"],
  [/מבוא|רקע|סקירת|ספרות|בסיס תאורטי|introduction|background|literature/i, "background"],
];
export function guessTarget(heading: string, ids: Set<string>): string {
  for (const [re, id] of RULES) if (re.test(heading) && ids.has(id)) return id;
  return "";
}

function paraText(xml: string): string {
  // טקסט, טאבים ושבירות שורה של פסקה אחת, לפי הסדר.
  let out = "";
  for (const m of xml.matchAll(/<w:t(?: [^>]*)?>([\s\S]*?)<\/w:t>|<w:tab\/>|<w:br[^>]*\/>/g)) out += m[1] !== undefined ? m[1] : m[0].startsWith("<w:tab") ? "\t" : "\n";
  return dec(out).trim();
}

export function parseDocx(buf: Uint8Array, sectionIds: string[]): { title: string; parts: DocPart[] } {
  const zip = unzipSync(buf, { filter: f => f.name === "word/document.xml" || f.name === "word/styles.xml" || f.name === "word/numbering.xml" });
  const doc = zip["word/document.xml"] ? strFromU8(zip["word/document.xml"]) : "";
  if (!doc) throw new Error("not_docx");
  const styles = zip["word/styles.xml"] ? strFromU8(zip["word/styles.xml"]) : "";
  // מזהה סגנון → רמת כותרת (בעברית Word מזהה הסגנון יכול להיות "1", לכן קוראים לפי השם).
  const level = new Map<string, number>();
  for (const m of styles.matchAll(/<w:style [^>]*w:styleId="([^"]+)"[^>]*>\s*<w:name w:val="([^"]+)"/g)) {
    const name = m[2].toLowerCase();
    const h = name.match(/^heading (\d)$/); if (h) level.set(m[1], Number(h[1]));
    if (name === "title") level.set(m[1], 0);
  }
  const ids = new Set(sectionIds);
  const body = doc.slice(doc.indexOf("<w:body>"));
  const parts: DocPart[] = [];
  let title = "", cur: DocPart | null = null, topTarget = "";
  const push = (s: string) => { if (!s) return; if (!cur) { cur = { heading: "", level: 1, text: "", target: "" }; parts.push(cur); } cur.text += (cur.text ? "\n\n" : "") + s; };
  // עוברים על הפסקאות והטבלאות לפי הסדר.
  for (const m of body.matchAll(/<w:tbl>[\s\S]*?<\/w:tbl>|<w:p[ >][\s\S]*?<\/w:p>/g)) {
    const x = m[0];
    if (x.startsWith("<w:tbl>")) {
      const rows = [...x.matchAll(/<w:tr[ >][\s\S]*?<\/w:tr>/g)].map(r => [...r[0].matchAll(/<w:tc>[\s\S]*?<\/w:tc>/g)]
        .map(c => [...c[0].matchAll(/<w:p[ >][\s\S]*?<\/w:p>/g)].map(p => paraText(p[0])).filter(Boolean).join(" ")));
      if (!rows.length) continue;
      // בטבלה בעברית העמודה האחרונה היא העמודה הימנית (שם הפריט). שורת הכותרות מושמטת.
      const rtl = /[֐-׿]/.test(rows.flat().join(""));
      const lines = rows.slice(1).map(r => { const c = (rtl ? [...r].reverse() : r).filter(Boolean); return c.length > 1 ? `${c[0]}: ${c.slice(1).join(" · ")}` : c[0] || ""; }).filter(Boolean);
      push(lines.map(l => "• " + l).join("\n"));
      continue;
    }
    const sid = (x.match(/<w:pStyle w:val="([^"]+)"/) || [])[1] || "";
    const lv = level.has(sid) ? level.get(sid)! : -1;
    const text = paraText(x);
    if (!text) continue;
    if (lv === 0 && !title) { title = text; continue; }
    if (lv >= 1 && lv <= 3) {
      const guess = guessTarget(text, ids);
      // כותרת ראשית שאין לה סעיף מתאים בתבנית: מציעים סעיף חדש בשם הכותרת ("הוסף מסגרות אם צריך", 6.11.2026).
      if (lv === 1) topTarget = guess || "new:" + text.replace(/^[א-ת]\.\s*/, "").slice(0, 120);
      cur = { heading: text, level: lv, text: "", target: lv === 1 ? topTarget : (guess || topTarget) };
      parts.push(cur);
      continue;
    }
    const isList = /<w:numPr>/.test(x);
    push(isList ? "• " + text : text);
  }
  // חלק ראשון בלי כותרת (למשל כותרת משנה ותאריך מתחת לשם המסמך): לא מייבאים כברירת מחדל.
  return { title, parts: parts.filter(p => p.text.trim() || p.heading) };
}

// הטקסט שנכנס לסעיף: כותרות משנה נשארות כשורת כותרת, כדי שהמבנה יישמר.
export function partText(p: DocPart): string {
  return (p.level > 1 && p.heading ? p.heading + "\n" : "") + p.text.trim();
}
