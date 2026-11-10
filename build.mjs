import { mkdir, rm, copyFile, cp, access, readFile } from "node:fs/promises";
import { check, weeklySnapshot } from "./research-weekly.mjs";
import { writeFile } from "node:fs/promises";

// חידושים במחקר: עדכון שבור לא עולה לאתר (Netlify משאיר את הגרסה הקודמת).
const research = check(await readFile("index.html", "utf8"));
if (research.errors.length) {
  console.error("חידושים במחקר:\n" + research.errors.join("\n"));
  process.exit(1);
}

await rm("dist", { recursive: true, force: true });
await mkdir("dist", { recursive: true });

await copyFile("index.html", "dist/index.html");
// מחקרי השבוע, לעדכון השבועי במייל (netlify/lib/site-weekly.mts).
await writeFile("dist/research-weekly.json", JSON.stringify(weeklySnapshot(await readFile("index.html", "utf8"))));
await copyFile("guide.html", "dist/guide.html"); // המדריך לקהילה: /guide
// אימות האתר ב-Google Search Console (5.11.2026). לא למחוק: בלי הקובץ גוגל מבטל את האימות.
await copyFile("googled52023a596e653b1.html", "dist/googled52023a596e653b1.html");
// מה השתנה באתר, למדור "🛠 מה חדש באתר עצמו" בעדכון השבועי (netlify/lib/site-weekly.mts).
JSON.parse(await readFile("site-changes.json", "utf8")); // קובץ שבור עוצר את הבנייה
await copyFile("site-changes.json", "dist/site-changes.json");
// הודעות ידניות לעדכון השבועי (weekly-notes.json): ברכה למצטרפים, הודעות מהנהלת הקהילה. 7.11.2026.
const notes = JSON.parse(await readFile("weekly-notes.json", "utf8"));
if (!Array.isArray(notes) || notes.some(n => !/^\d{4}-\d{2}-\d{2}$/.test(n.date) || !n.text)) { console.error("weekly-notes.json לא תקין"); process.exit(1); }
await copyFile("weekly-notes.json", "dist/weekly-notes.json");
// עדכון שבועי שנכתב ביד (weekly-draft.json, 10.11.2026): נטען לחלון העדכון במקום הטיוטה האוטומטית עד "until".
const wd = JSON.parse(await readFile("weekly-draft.json", "utf8"));
if (!/^\d{4}-\d{2}-\d{2}$/.test(wd.date) || !/^\d{4}-\d{2}-\d{2}$/.test(wd.until) || !wd.subject || !wd.body) { console.error("weekly-draft.json לא תקין"); process.exit(1); }
await copyFile("weekly-draft.json", "dist/weekly-draft.json");
// גוגל: robots.txt ו-sitemap.xml
await copyFile("robots.txt", "dist/robots.txt");
await copyFile("sitemap.xml", "dist/sitemap.xml");

try {
  await access("_redirects");
  await copyFile("_redirects", "dist/_redirects");
} catch {
  // Optional Netlify clean-route rewrites.
}

for (const dir of ["assets", "public"]) {
  try {
    await access(dir);
    await cp(dir, `dist/${dir}`, { recursive: true });
  } catch {
    // Optional directory: ignore when absent.
  }
}

console.log("Static site copied to dist/");
