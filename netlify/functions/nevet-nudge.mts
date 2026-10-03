import type { Config } from "@netlify/functions";
import { mailConfigured, sendMail, siteUrl } from "../lib/calls.mts";
import { projectsToNudge, saveProject } from "../lib/nevet.mts";

// "עצירת התרעננות" ☕ — כשמיזם לא התעדכן שבועיים, מיזי שולחת מייל עדין עם שאלה אחת.
export default async () => {
  if (!mailConfigured()) return new Response(null, { status: 204 });
  const site = siteUrl();
  for (const p of await projectsToNudge(14)) {
    const next = p.stages.find(s => s.status !== "done");
    const first = p.ownerName.replace(/^(ד״ר|ד"ר|פרופ׳|פרופ')\s*/, "").split(/\s+/)[0];
    const lines = [
      `שלום ${first},`,
      `עבר קצת זמן מאז העדכון האחרון במיזם "${p.guide?.productName || p.title}". זה בסדר גמור — עצירת התרעננות היא חלק מהדרך ☕`,
      next ? `כשתרצי לחזור, השלב הבא הוא "${next.title}". שאלה אחת קטנה: מה הדבר הכי קטן שאפשר לעשות בו השבוע?` : "כשתרצי לחזור, אני כאן.",
      "אפשר פשוט לכתוב לי עדכון קצר בתיק היישום — גם \"אני תקועה\" זה עדכון טוב.",
      "מיזי 🌱",
    ];
    const html = `<div dir="rtl" style="font-family:Arial,sans-serif;max-width:600px;margin:auto;line-height:1.7;color:#1d3445">${lines.map(l => `<p>${l.replace(/[&<>]/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;" }[c]!))}</p>`).join("")}<p><a href="${site}/apps" style="color:#17649a">לתיק היישום</a></p></div>`;
    try {
      await sendMail(p.ownerEmail, `מיזי: עצירת התרעננות ב"${p.guide?.productName || p.title}" ☕`, html, lines.join("\n\n"));
      await saveProject({ ...p, nudgedAt: new Date().toISOString() }, false);
    } catch {}
  }
  return new Response(null, { status: 204 });
};

export const config: Config = { schedule: "13 7 * * *" };
