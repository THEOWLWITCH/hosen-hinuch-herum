// רשימת כתבי העת המובילים שהספרייה המתחדשת אוספת מהם (31.10.2026: "המאמרים באתר לא באיכות טובה").
// רק כתבי עת עם שיפוט עמיתים, ממוקדים בתחומי הקהילה, מהמובילים בתחומם. כל ה-ISSN אומתו מול אתרי ההוצאות, קטלוגים או ויקיפדיה (31.10.2026).
// שינוי ברשימה: להוסיף שורה עם השם המדויק, ה-ISSN (מודפס ו/או מקוון) והתחום. העדכון השבועי של "חידושים במחקר"
// נשען גם הוא על הרשימה הזו (README, "חידושים במחקר").

export type QualityJournal = { name: string; issn: string[]; area: string; aliases?: string[] };

export const QUALITY_AREAS: Record<string, string> = {
  eie: "חינוך בחירום, אסונות ועקירה",
  org: "חוסן ארגוני, ניהול משברים ובטיחות",
  resilience: "חוסן, טראומה ובריאות נפשית של ילדים ובבית הספר",
  teachers: "מורים, מנהלות ומנהלים, מנהיגות חינוכית",
  policy: "מדיניות ומערכת החינוך",
  tech: "טכנולוגיה, AI, סימולציה ולמידה מרחוק",
  general: "מחקר חינוכי מוביל ולמידה",
  evidence: "סקירות שיטתיות וסינתזות מחקר",
  israel: "כתבי עת ישראליים (עברית)",
};

export const QUALITY_JOURNALS: QualityJournal[] = [
  // חינוך בחירום, משבר ועקירה
  { name: "Journal on Education in Emergencies", issn: ["2518-6833"], area: "eie" },
  { name: "International Journal of Educational Development", issn: ["0738-0593", "1873-4871"], area: "eie" },
  { name: "Comparative Education Review", issn: ["0010-4086", "1545-701X"], area: "eie" },
  { name: "Compare: A Journal of Comparative and International Education", issn: ["0305-7925", "1469-3623"], area: "eie", aliases: ["Compare"] },
  { name: "International Journal of Disaster Risk Reduction", issn: ["2212-4209"], area: "eie" },
  { name: "Disasters", issn: ["0361-3666", "1467-7717"], area: "eie" },
  { name: "Journal of Refugee Studies", issn: ["0951-6328", "1471-6925"], area: "eie" },
  { name: "Conflict and Health", issn: ["1752-1505"], area: "eie" },
  { name: "Intervention", issn: ["1571-8883", "1872-1001"], area: "eie", aliases: ["Intervention: Journal of Mental Health and Psychosocial Support in Conflict Affected Areas"] },
  // חוסן, טראומה ובריאות נפשית בבית הספר
  { name: "Child Development", issn: ["0009-3920", "1467-8624"], area: "resilience" },
  { name: "Development and Psychopathology", issn: ["0954-5794", "1469-2198"], area: "resilience" },
  { name: "Journal of Child Psychology and Psychiatry", issn: ["0021-9630", "1469-7610"], area: "resilience" },
  { name: "Psychological Trauma: Theory, Research, Practice, and Policy", issn: ["1942-9681", "1942-969X"], area: "resilience", aliases: ["Psychological Trauma"] },
  { name: "European Journal of Psychotraumatology", issn: ["2000-8198", "2000-8066"], area: "resilience" },
  { name: "Journal of Traumatic Stress", issn: ["0894-9867", "1573-6598"], area: "resilience" },
  { name: "School Mental Health", issn: ["1866-2625", "1866-2633"], area: "resilience" },
  { name: "Journal of School Psychology", issn: ["0022-4405", "1873-3506"], area: "resilience" },
  { name: "School Psychology Review", issn: ["0279-6015", "2372-966X"], area: "resilience" },
  { name: "Journal of Adolescence", issn: ["0140-1971", "1095-9254"], area: "resilience" },
  { name: "Journal of Youth and Adolescence", issn: ["0047-2891", "1573-6601"], area: "resilience" },
  { name: "Prevention Science", issn: ["1389-4986", "1573-6695"], area: "resilience" },
  // מורים, מנהלות ומנהלים
  { name: "Teaching and Teacher Education", issn: ["0742-051X", "1879-2480"], area: "teachers" },
  { name: "Teachers and Teaching: Theory and Practice", issn: ["1354-0602", "1470-1278"], area: "teachers", aliases: ["Teachers and Teaching"] },
  { name: "Educational Administration Quarterly", issn: ["0013-161X", "1552-3519"], area: "teachers" },
  { name: "Educational Management Administration & Leadership", issn: ["1741-1432", "1741-1440"], area: "teachers" },
  { name: "Journal of Educational Administration", issn: ["0957-8234", "1758-7395"], area: "teachers" },
  { name: "School Leadership & Management", issn: ["1363-2434", "1364-2626"], area: "teachers" },
  // טכנולוגיה ו-AI בחינוך
  { name: "Computers & Education", issn: ["0360-1315", "1873-782X"], area: "tech" },
  { name: "Computers and Education: Artificial Intelligence", issn: ["2666-920X"], area: "tech" },
  { name: "British Journal of Educational Technology", issn: ["0007-1013", "1467-8535"], area: "tech" },
  { name: "International Journal of Artificial Intelligence in Education", issn: ["1560-4292", "1560-4306"], area: "tech" },
  // חינוך בחירום (המשך), אסונות
  { name: "International Journal of Disaster Risk Science", issn: ["2095-0055", "2192-6395"], area: "eie" },
  { name: "Disaster Prevention and Management", issn: ["0965-3562", "1758-6100"], area: "eie" },
  // חוסן ארגוני, ניהול משברים ובטיחות
  { name: "Journal of Contingencies and Crisis Management", issn: ["0966-0879", "1468-5973"], area: "org" },
  { name: "Safety Science", issn: ["0925-7535", "1879-1042"], area: "org" },
  // חוסן, טראומה ובריאות נפשית (המשך): קהילה, בית ספר, התבגרות
  { name: "American Journal of Community Psychology", issn: ["0091-0562", "1573-2770"], area: "resilience" },
  { name: "Journal of Community Psychology", issn: ["0090-4392", "1520-6629"], area: "resilience" },
  { name: "Psychology in the Schools", issn: ["0033-3085", "1520-6807"], area: "resilience" },
  { name: "School Psychology International", issn: ["0143-0343", "1461-7374"], area: "resilience" },
  { name: "Journal of School Violence", issn: ["1538-8220", "1538-8239"], area: "resilience" },
  { name: "Journal of School Health", issn: ["0022-4391", "1746-1561"], area: "resilience" },
  { name: "Children and Youth Services Review", issn: ["0190-7409", "1873-7765"], area: "resilience" },
  { name: "Journal of Research on Adolescence", issn: ["1050-8392", "1532-7795"], area: "resilience" },
  { name: "Journal of Adolescent Health", issn: ["1054-139X", "1879-1972"], area: "resilience" },
  { name: "Developmental Psychology", issn: ["0012-1649", "1939-0599"], area: "resilience" },
  { name: "Child Development Perspectives", issn: ["1750-8592", "1750-8606"], area: "resilience" },
  { name: "Anxiety, Stress, & Coping", issn: ["1061-5806", "1477-2205"], area: "resilience", aliases: ["Anxiety, Stress, and Coping", "Anxiety Stress and Coping"] },
  { name: "Trauma, Violence, & Abuse", issn: ["1524-8380", "1552-8324"], area: "resilience", aliases: ["Trauma, Violence, and Abuse"] },
  { name: "Social and Emotional Learning: Research, Practice, and Policy", issn: ["2773-2339"], area: "resilience" },
  // מורים ומנהיגות (המשך)
  { name: "Journal of Teacher Education", issn: ["0022-4871", "1552-7816"], area: "teachers" },
  { name: "Professional Development in Education", issn: ["1941-5257", "1941-5265"], area: "teachers" },
  { name: "Journal of Educational Change", issn: ["1389-2843", "1573-1812"], area: "teachers" },
  { name: "Leadership and Policy in Schools", issn: ["1570-0763", "1744-5043"], area: "teachers" },
  { name: "International Journal of Leadership in Education", issn: ["1360-3124", "1464-5092"], area: "teachers" },
  { name: "School Effectiveness and School Improvement", issn: ["0924-3453", "1744-5124"], area: "teachers" },
  // מדיניות ומערכת החינוך
  { name: "Educational Researcher", issn: ["0013-189X", "1935-102X"], area: "policy" },
  { name: "American Educational Research Journal", issn: ["0002-8312", "1935-1011"], area: "policy" },
  { name: "Journal of Education Policy", issn: ["0268-0939", "1464-5106"], area: "policy" },
  { name: "Educational Policy", issn: ["0895-9048", "1552-3896"], area: "policy" },
  { name: "Educational Evaluation and Policy Analysis", issn: ["0162-3737", "1935-1062"], area: "policy" },
  { name: "Journal of Research on Educational Effectiveness", issn: ["1934-5747", "1934-5739"], area: "policy" },
  // טכנולוגיה, סימולציה ולמידה מרחוק (המשך)
  { name: "Educational Technology Research and Development", issn: ["1042-1629", "1556-6501"], area: "tech" },
  { name: "Distance Education", issn: ["0158-7919", "1475-0198"], area: "tech" },
  { name: "Learning, Media and Technology", issn: ["1743-9884", "1743-9892"], area: "tech" },
  { name: "Journal of Learning Analytics", issn: ["1929-7750"], area: "tech" },
  { name: "Simulation & Gaming", issn: ["1046-8781", "1552-826X"], area: "tech", aliases: ["Simulation and Gaming"] },
  // מחקר חינוכי מוביל, למידה והשכלה גבוהה
  { name: "Journal of Educational Psychology", issn: ["0022-0663", "1939-2176"], area: "general" },
  { name: "Learning and Instruction", issn: ["0959-4752", "1873-3263"], area: "general" },
  { name: "Contemporary Educational Psychology", issn: ["0361-476X", "1090-2384"], area: "general" },
  // סקירות שיטתיות וסינתזות מחקר
  { name: "Campbell Systematic Reviews", issn: ["1891-1803"], area: "evidence" },
  { name: "Educational Research Review", issn: ["1747-938X", "1878-0385"], area: "evidence" },
  { name: "Review of Educational Research", issn: ["0034-6543", "1935-1046"], area: "evidence" },
  { name: "Educational Psychology Review", issn: ["1040-726X", "1573-336X"], area: "evidence" },
  // כתבי עת ישראליים (עברית; כמעט לא מופיעים ב-OpenAlex ו-Crossref, אבל ההתאמה לפי שם עובדת כשמוסיפים ידנית או מפיד)
  { name: "מגמות", issn: ["0025-8679"], area: "israel", aliases: ["Megamot"] },
  { name: "דפים", issn: ["0334-987X"], area: "israel", aliases: ["Dapim", "דפים: כתב עת לעיון ולמחקר בחינוך"] },
];

const normName = (s: string) => String(s || "").toLowerCase().replace(/&/g, "and").replace(/[^a-z0-9]+/g, "");
const BY_NAME = new Map<string, QualityJournal>();
const BY_ISSN = new Map<string, QualityJournal>();
for (const j of QUALITY_JOURNALS) {
  for (const n of [j.name, ...(j.aliases || [])]) BY_NAME.set(normName(n), j);
  for (const i of j.issn) BY_ISSN.set(i.toUpperCase(), j);
}

export const ALL_ISSNS = QUALITY_JOURNALS.flatMap(j => j.issn);

// כתב עת מהרשימה, לפי ISSN או לפי שם (גם עם תוספות כמו ", 12(3)").
export function qualityJournal(name: string, issns: string[] = []): QualityJournal | null {
  for (const i of issns) { const j = BY_ISSN.get(String(i).toUpperCase()); if (j) return j; }
  const n = normName(String(name || "").split(/[,(]/)[0]);
  return n ? BY_NAME.get(n) || null : null;
}

// סימני איכות לכרטיס בתיבת האישור.
export function qualityBadges(x: { title?: string; abstract?: string; journal?: string; issn?: string[]; peerReviewed?: boolean }): string[] {
  const out: string[] = [];
  const t = `${x.title || ""} ${x.abstract || ""}`;
  if (qualityJournal(x.journal || "", x.issn || [])) out.push("כתב עת מוביל");
  else if (x.peerReviewed) out.push("שיפוט עמיתים");
  if (/systematic review|meta-?analy|scoping review|umbrella review|evidence synthesis/i.test(t)) out.push("סקירה שיטתית");
  if (/randomi[sz]ed|\bRCT\b|cluster-randomi|controlled trial|quasi-experiment/i.test(t)) out.push("ניסוי מבוקר");
  if (/longitudinal|panel data|cohort/i.test(t)) out.push("מחקר אורך");
  return out;
}
