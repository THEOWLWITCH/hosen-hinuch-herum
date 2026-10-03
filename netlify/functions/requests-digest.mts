import type { Config } from "@netlify/functions";
import { mailConfigured, sendMail, siteUrl } from "../lib/calls.mts";
import { TYPE_LABELS, getDigestState, listRequests, setDigestState } from "../lib/requests.mts";

// כל בוקר: סיכום אחד של פניות חדשות ופניות שעדיין פתוחות — במקום לחפש אותן בין המיילים.
export default async () => {
  const admin = (Netlify.env.get("GMAIL_USER") || "").trim();
  if (!mailConfigured() || !admin) return new Response(null, { status: 204 });
  const rows = await listRequests();
  const state = await getDigestState();
  const fresh = rows.filter(r => r.at > state.lastAt);
  const open = rows.filter(r => r.status !== "done");
  if (!fresh.length) return new Response(null, { status: 204 });
  const site = siteUrl();
  const esc = (s: string) => s.replace(/[&<>]/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;" }[c]!));
  const line = (r: typeof rows[number]) => `${TYPE_LABELS[r.type]} · ${r.name || "ללא שם"}${r.subject ? ` · ${r.subject}` : ""}`;
  const html = `<div dir="rtl" style="font-family:Arial,sans-serif;max-width:620px;margin:auto;line-height:1.7;color:#1d3445">
<p>בוקר טוב,</p><p>יש <strong>${fresh.length} פניות חדשות</strong> מאז הסיכום הקודם, ובסך הכול <strong>${open.length} פניות פתוחות</strong>.</p>
<ul>${fresh.slice(0, 30).map(r => `<li>${esc(line(r))}</li>`).join("")}</ul>${fresh.length > 30 ? `<p>ועוד ${fresh.length - 30}…</p>` : ""}
<p><a href="${site}/now#requests" style="display:inline-block;padding:9px 16px;border-radius:999px;background:#245f82;color:#fff;text-decoration:none;font-weight:700">לתיבת הפניות באתר</a></p></div>`;
  const text = `יש ${fresh.length} פניות חדשות, ובסך הכול ${open.length} פתוחות.\n\n${fresh.slice(0, 30).map(r => "- " + line(r)).join("\n")}\n\nלתיבת הפניות: ${site}/now#requests`;
  try {
    await sendMail(admin, `📥 ${fresh.length} פניות חדשות באתר (${open.length} פתוחות)`, html, text);
    await setDigestState(fresh[0].at);
  } catch {}
  return new Response(null, { status: 204 });
};

export const config: Config = { schedule: "41 5 * * *" };
