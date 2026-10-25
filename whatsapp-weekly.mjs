// הודעת ווטסאפ ותמונה לעדכון השבועי של "חידושים במחקר".
//
//   node whatsapp-weekly.mjs [תיקיית-פלט]
//     קורא את index.html (אחרי node research-weekly.mjs apply) ויוצר בתיקיית הפלט:
//       whatsapp-message.txt  הודעה מוכנה להדבקה בווטסאפ
//       whatsapp-image.png    תמונה 1080x1080: לוגו, הכותרת והתאריך, במסגרת צבעונית
//     אם בתיקיית הפלט יש titles-he.json ({id: "תרגום קצר של הכותרת"}), התרגום מופיע לפני הכותרת המקורית.
//     הפריטים של השבוע הם אלה שתאריך העדכון שלהם (id w<YYYYMMDD>) הוא של weeklyResearchWeek.
import { readFile, writeFile, mkdir } from "node:fs/promises";
import { createRequire } from "node:module";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";

const SITE = "https://hosen-hinuch-herum.netlify.app/articles";
const CAT = {
  preparedness: "מוכנות", resilience: "חוסן נפשי", continuity: "רציפות למידה",
  teachers: "צוותי חינוך ומנהיגות", tech: "טכנולוגיה AI וסימולציה בחירום", org: "חוסן ארגוני",
};

const grab = (src, name) => {
  const start = src.indexOf("=", src.indexOf(`const ${name}=`)) + 1;
  let depth = 0, quote = null;
  for (let j = start; j < src.length; j++) {
    const c = src[j];
    if (quote) { if (c === "\\") j++; else if (c === quote) quote = null; continue; }
    if (c === '"' || c === "'" || c === "`") quote = c;
    else if (c === "[" || c === "{") depth++;
    else if (c === "]" || c === "}") { depth--; if (depth === 0) return new Function(`return ${src.slice(start, j + 1)}`)(); }
  }
  throw new Error(`${name} לא נמצא`);
};

const src = await readFile("index.html", "utf8");
const week = src.match(/const weeklyResearchWeek='(\d{4})-(\d{2})-(\d{2})'/);
if (!week) throw new Error("weeklyResearchWeek לא נמצא");
const stamp = week.slice(1).join("");
const label = `${+week[3]}.${+week[2]}.${week[1]}`;
const items = grab(src, "researchWorldItems").filter(x => String(x.id).startsWith(`w${stamp}-`));
if (!items.length) throw new Error(`אין פריטים של ${label}`);
const featured = items.filter(x => x.weeklyNew);
const others = items.filter(x => !x.weeklyNew);

const he = await readFile(`${resolve(process.argv[2] || "whatsapp-out")}/titles-he.json`, "utf8").then(JSON.parse, () => ({}));
const title = x => (he[x.id] ? `${he[x.id]} (${x.title})` : x.title);
const line = x => `🔹 *${CAT[x.cat] || x.cat}*: ${title(x)}\n${x.why}`;
const message = [
  "*חידושים במחקר: עדכון שבועי* 📚",
  "",
  `עודכן הדף "חידושים במחקר" באתר חוסן–חינוך–חירום (${label}). נוספו מקורות שאומתו אחד אחד.`,
  "",
  "*מחקרי השבוע:*",
  "",
  ...featured.flatMap(x => [line(x), ""]),
  ...(others.length ? ["*עוד בדף:*", ...others.map(x => `🔸 ${title(x)}`), ""] : []),
  "לכל מקור יש תקציר, משמעות מעשית וקישור למקור.",
  `👈 לקריאה: ${SITE}`,
].join("\n");

const out = resolve(process.argv[2] || "whatsapp-out");
await mkdir(out, { recursive: true });
await writeFile(`${out}/whatsapp-message.txt`, message + "\n");

const logo = (await readFile("assets/community-logo-email.jpg")).toString("base64");
const html = `<!doctype html><html lang="he" dir="rtl"><meta charset="utf-8"><style>
body{margin:0;width:1080px;height:1080px;background:#f7f4ec;font-family:"Noto Sans Hebrew",Arial,sans-serif;color:#17324d;display:flex;flex-direction:column;align-items:center;justify-content:center;box-sizing:border-box}
.frame{position:absolute;inset:0;border:26px solid transparent;border-image:linear-gradient(135deg,#173f67,#7a1f3d 35%,#d99a43 65%,#4a7ba8) 1}
.frame:after{content:"";position:absolute;inset:6px;border:4px solid #fff}
.logo{width:880px;background:#fff;border-radius:24px;padding:20px}.logo img{width:100%;display:block}
.bar{width:140px;height:8px;background:#d99a43;border-radius:4px;margin:60px 0 50px}
h1{font-size:120px;margin:0;line-height:1.1;color:#173f67}
h2{font-size:52px;margin:34px 0 0;font-weight:500;color:#246b8f}
.d{position:absolute;bottom:50px;font-size:38px;color:#657786}
</style><div class="frame"></div><div class="logo"><img src="data:image/jpeg;base64,${logo}"></div><div class="bar"></div>
<h1>חידושים במחקר</h1><h2>עדכון שבועי · ${label}</h2><div class="d">hosen-hinuch-herum.netlify.app</div></html>`;
await writeFile(`${out}/whatsapp-image.html`, html);

const { chromium } = createRequire(import.meta.url)("playwright");
const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1080, height: 1080 } });
await page.goto(pathToFileURL(`${out}/whatsapp-image.html`).href);
await page.screenshot({ path: `${out}/whatsapp-image.png` });
await browser.close();
console.log(`נוצרו ב-${out}: whatsapp-message.txt, whatsapp-image.png (${featured.length} במחקרי השבוע, ${others.length} נוספים)`);
