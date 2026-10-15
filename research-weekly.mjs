// חידושים במחקר (/articles): עדכון שבועי ובדיקה.
//
//   node research-weekly.mjs check
//     בודק את נתוני העמוד ב-index.html. רץ גם בבנייה (build.mjs), כך שעדכון שבור לא עולה לאתר.
//
//   node research-weekly.mjs apply <new-items.mjs> [YYYY-MM-DD]
//     מוסיף את המקורות החדשים לראש researchWorldItems, מסיר את סימון "חדש בסקירה השבועית"
//     מהסבב הקודם, מוסיף את נקודות הדיון, ומעדכן את שבוע הסקירה ואת שורת "עודכן".
//     הקובץ מייצא items (מערך, באותו מבנה כמו researchWorldItems) ו-notes ({id: "נקודת דיון"}).
//     עד חמישה פריטים עם weeklyNew:true נכנסים ל"מחקרי השבוע".
import { readFile, writeFile } from "node:fs/promises";
import { pathToFileURL } from "node:url";
import { resolve } from "node:path";

const FILE = "index.html";
const CATS = ["preparedness", "resilience", "continuity", "teachers", "tech", "org"];

function range(src, name) {
  const at = src.indexOf(`const ${name}=`);
  if (at < 0) throw new Error(`${name} לא נמצא ב-${FILE}`);
  const start = src.indexOf("=", at) + 1;
  let depth = 0, quote = null;
  for (let j = start; j < src.length; j++) {
    const c = src[j];
    if (quote) {
      if (c === "\\") j++;
      else if (c === quote) quote = null;
      continue;
    }
    if (c === '"' || c === "'" || c === "`") quote = c;
    else if (c === "[" || c === "{") depth++;
    else if (c === "]" || c === "}") {
      depth--;
      if (depth === 0) return { start, end: j + 1 };
    }
  }
  throw new Error(`${name} לא נסגר`);
}

const grab = (src, name) => {
  const r = range(src, name);
  return new Function(`return ${src.slice(r.start, r.end)}`)();
};

const weekOf = src => (src.match(/const weeklyResearchWeek='(\d{4}-\d{2}-\d{2})'/) || [])[1];
const ilDate = iso => { const [y, m, d] = iso.split("-").map(Number); return `${d}.${m}.${y}`; };
const key = s => String(s || "").toLowerCase().replace(/https?:\/\/(dx\.)?doi\.org\//, "doi:").replace(/[^a-z0-9֐-׿:./]+/g, "");

export function check(src) {
  const errors = [];
  const world = grab(src, "researchWorldItems");
  const practical = grab(src, "researchPracticalSources");
  const notes = grab(src, "weeklyResearchNotes");
  const week = weekOf(src);
  const all = [...world, ...practical];

  const seen = new Map();
  for (const x of all) {
    const label = x.id || x.title || "(בלי מזהה)";
    for (const f of ["id", "title", "authors", "year", "source", "summary", "url", "cat"])
      if (!String(x[f] || "").trim()) errors.push(`${label}: חסר ${f}`);
    if (x.cat && !CATS.includes(x.cat)) errors.push(`${label}: מדור לא מוכר ${x.cat}`);
    if (x.url && !/^https:\/\//.test(x.url)) errors.push(`${label}: קישור לא תקין`);
    if (world.includes(x) && !(x.date && /^\d{4}(-\d{2}(-\d{2})?)?$/.test(x.date)))
      errors.push(`${label}: תאריך לא תקין (YYYY, YYYY-MM או YYYY-MM-DD)`);
    for (const k of [`id:${x.id}`, `t:${key(x.title)}`, x.url ? `u:${key(x.url)}` : null].filter(Boolean)) {
      if (seen.has(k)) errors.push(`${label}: כפילות עם ${seen.get(k)}`);
      else seen.set(k, label);
    }
  }

  const weekly = world.filter(x => x.weeklyNew);
  if (weekly.length < 1 || weekly.length > 5) errors.push(`במחקרי השבוע ${weekly.length} פריטים (1 עד 5)`);
  for (const x of weekly) if (!notes[x.id]) errors.push(`${x.id}: חסרה נקודת דיון ב-weeklyResearchNotes`);

  if (!week) errors.push("weeklyResearchWeek לא נמצא");
  else if (!src.includes(`עודכן: ${ilDate(week)} ·`)) errors.push(`שורת "עודכן" לא תואמת לשבוע ${ilDate(week)}`);

  return { errors, world: world.length, weekly: weekly.length, week };
}

export function apply(src, items, notes, iso) {
  const ids = items.map(x => x.id);
  if (!items.length) throw new Error("אין פריטים חדשים");
  if (!items.some(x => x.weeklyNew)) items[0].weeklyNew = true;

  // הסבב הקודם: נשאר במאגר, בלי ההדגשה.
  for (const name of ["researchWorldItems", "researchPracticalSources"]) {
    const r = range(src, name);
    src = src.slice(0, r.start) + src.slice(r.start, r.end).replace(/weeklyNew:true,\s*/g, "") + src.slice(r.end);
  }

  const lines = items.map(x => JSON.stringify(x).replace(/"([A-Za-z]+)":/g, "$1:")).join(",\n");
  const r = range(src, "researchWorldItems");
  src = `${src.slice(0, r.start + 1)}\n// עדכון ${ilDate(iso)}: אומתו (כותרת, מחברים, שנה ותקציר)\n${lines},${src.slice(r.start + 1)}`;

  const n = range(src, "weeklyResearchNotes");
  const add = ids.filter(id => notes[id]).map(id => ` ${JSON.stringify(id)}:${JSON.stringify(notes[id])},`).join("\n");
  if (add) src = `${src.slice(0, n.start + 1)}\n${add}${src.slice(n.start + 1)}`;

  const old = weekOf(src);
  src = src.replace(`const weeklyResearchWeek='${old}'`, `const weeklyResearchWeek='${iso}'`);
  src = src.replace(/עודכן: \d{1,2}\.\d{1,2}\.\d{4} ·/, `עודכן: ${ilDate(iso)} ·`);
  return src;
}

const isMain = process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href;
if (isMain) {
  const [cmd, file, date] = process.argv.slice(2);
  let src = await readFile(FILE, "utf8");
  if (cmd === "apply") {
    if (!file) throw new Error("usage: node research-weekly.mjs apply <new-items.mjs> [YYYY-MM-DD]");
    const iso = date || new Date().toLocaleDateString("en-CA", { timeZone: "Asia/Jerusalem" });
    const mod = await import(pathToFileURL(resolve(file)).href);
    src = apply(src, mod.items, mod.notes || {}, iso);
    const res = check(src);
    if (res.errors.length) { console.error(res.errors.join("\n")); process.exit(1); }
    await writeFile(FILE, src);
    console.log(`עודכן ${ilDate(iso)}: ${mod.items.length} פריטים חדשים, ${res.weekly} במחקרי השבוע, ${res.world} במאגר.`);
  } else if (cmd === "check" || !cmd) {
    const res = check(src);
    if (res.errors.length) { console.error("חידושים במחקר:\n" + res.errors.join("\n")); process.exit(1); }
    console.log(`חידושים במחקר תקין: ${res.world} מחקרים, ${res.weekly} במחקרי השבוע, שבוע ${res.week}.`);
  } else {
    throw new Error(`פקודה לא מוכרת: ${cmd}`);
  }
}
