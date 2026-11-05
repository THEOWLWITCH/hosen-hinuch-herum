import type { Config } from "@netlify/functions";
import { israelToday, mailConfigured, sendMail, siteUrl } from "../lib/calls.mts";
import { renderHtml, plainText } from "../lib/community-mail.mts";
import { buildSiteWeekly, getWeeklyState, pruneVisits, setWeeklyState } from "../lib/site-weekly.mts";

// כל יום ראשון בבוקר: טיוטת "מה חדש באתר השבוע" נשלחת רק למנהלת המערכת (GMAIL_USER), לקריאה ולאישור.
// לכל הקהילה העדכון יוצא רק כשהמנהלת שולחת אותו בחלון "עדכון לקהילה" (/#weekly-mail). פעם אחת בשבוע לכל היותר.
export default async () => {
  await pruneVisits().catch(() => 0);
  if (!mailConfigured()) return new Response(null, { status: 204 });
  const today = israelToday();
  if ((await getWeeklyState()).draftSentDay === today) return new Response(null, { status: 204 });
  await setWeeklyState({ draftSentDay: today }); // מסמנים לפני השליחה, כדי שהפעלה חוזרת לא תשלח שוב
  const site = siteUrl();
  const w = await buildSiteWeekly(site);
  const me = (Netlify.env.get("GMAIL_USER") || "").trim();
  const intro = [
    "שלום יעל,",
    w.count
      ? `זו טיוטת העדכון השבועי לקהילה (${w.from}–${w.to}). שום דבר עוד לא נשלח לקהילה.`
      : `השבוע (${w.from}–${w.to}) כמעט לא נוסף תוכן חדש באתר. אפשר לדלג על העדכון, או להוסיף לו מילה אישית.`,
    `לעריכה ולשליחה לכל הקהילה: ${site}/#weekly-mail (בניהול מערכת: "✉ עדכון לקהילה" ← "📰 העדכון השבועי").`,
    "— — —",
  ].join("\n\n");
  const text = intro + "\n\n" + w.body;
  try { await sendMail(me, "[טיוטה] " + w.subject, renderHtml(text, site), plainText(text)); } catch {}
  return new Response(null, { status: 204 });
};

// יום ראשון 11:40 שעון ישראל (בחורף UTC+2): אחרי העדכון השבועי של "חידושים במחקר" (08:23) והפריסה, כדי שמחקרי השבוע ייכנסו לטיוטה.
export const config: Config = { schedule: "40 9 * * 0" };
