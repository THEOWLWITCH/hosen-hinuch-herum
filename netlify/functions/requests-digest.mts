import type { Config } from "@netlify/functions";
import { mailConfigured, sendMail, siteUrl } from "../lib/calls.mts";
import { TYPE_LABELS, getDigestState, listRequests, setDigestState } from "../lib/requests.mts";
import { listInbox as libraryInbox } from "../lib/library-feed.mts";

// כל בוקר: סיכום אחד של פניות חדשות ופניות שעדיין פתוחות — במקום לחפש אותן בין המיילים.
export default async () => {
  const admin = (Netlify.env.get("GMAIL_USER") || "").trim();
  if (!mailConfigured() || !admin) return new Response(null, { status: 204 });
  const rows = await listRequests();
  const state = await getDigestState();
  const fresh = rows.filter(r => r.at > state.lastAt);
  const open = rows.filter(r => r.status !== "done");
  // גם מקורות חדשים לספרייה שמחכים לאישור.
  const lib = await libraryInbox();
  const libFresh = lib.filter(x => x.foundAt > state.lastAt);
  if (!fresh.length && !libFresh.length) return new Response(null, { status: 204 });
  const site = siteUrl();
  const esc = (s: string) => s.replace(/[&<>]/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;" }[c]!));
  const line = (r: typeof rows[number]) => `${TYPE_LABELS[r.type]} · ${r.name || "ללא שם"}${r.subject ? ` · ${r.subject}` : ""}`;
  const html = `<div dir="rtl" style="font-family:Arial,sans-serif;max-width:620px;margin:auto;line-height:1.7;color:#1d3445">
<p>בוקר טוב,</p>${fresh.length ? `<p>יש <strong>${fresh.length} פניות חדשות</strong> מאז הסיכום הקודם, ובסך הכול <strong>${open.length} פניות פתוחות</strong>.</p>
<ul>${fresh.slice(0, 30).map(r => `<li>${esc(line(r))}</li>`).join("")}</ul>${fresh.length > 30 ? `<p>ועוד ${fresh.length - 30}…</p>` : ""}` : ""}
${lib.length ? `<p>📚 בספרייה מחכים לאישור <strong>${lib.length} מקורות</strong>${libFresh.length ? ` (${libFresh.length} חדשים)` : ""}. <a href="${site}/library#library-admin" style="color:#17649a">לאישור המקורות</a></p>` : ""}
<p><a href="${site}/now#requests" style="display:inline-block;padding:9px 16px;border-radius:999px;background:#245f82;color:#fff;text-decoration:none;font-weight:700">לתיבת הפניות באתר</a></p></div>`;
  const text = `${fresh.length ? `יש ${fresh.length} פניות חדשות, ובסך הכול ${open.length} פתוחות.\n\n${fresh.slice(0, 30).map(r => "- " + line(r)).join("\n")}\n\nלתיבת הפניות: ${site}/now#requests` : ""}${lib.length ? `\n\nבספרייה מחכים לאישור ${lib.length} מקורות: ${site}/library#library-admin` : ""}`;
  try {
    const subject = fresh.length ? `📥 ${fresh.length} פניות חדשות באתר (${open.length} פתוחות)${libFresh.length ? ` · 📚 ${libFresh.length} מקורות לספרייה` : ""}` : `📚 ${libFresh.length} מקורות חדשים לספרייה מחכים לאישור`;
    await sendMail(admin, subject, html, text);
    await setDigestState([fresh[0]?.at || "", ...libFresh.map(x => x.foundAt)].sort().pop()!);
  } catch {}
  return new Response(null, { status: 204 });
};

export const config: Config = { schedule: "41 5 * * *" };
