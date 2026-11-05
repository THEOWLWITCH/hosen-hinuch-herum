// קבצים בתוך מרחב עבודה (5.11.2026: "להצעת המחקר ולדיון אפשר להעלות קבצים או קישורים ושישמרו").
// הקבצים נשמרים תחת teamfiles/<team>/ — לא תחת files/, ולכן /api/file הציבורי לא מגיש אותם.
// העלאה והורדה רק עם הקישור של הצוות (x-team-key), ובמרחב סגור גם עם קוד הצוות (x-team-code).
import type { Config } from "@netlify/functions";
import { id, json, safeName, store } from "../lib/shared.mts";
import { clip, lockOK, openTeamAccess } from "../lib/teams.mts";

const OK_EXT = new Set(["pdf", "doc", "docx", "ppt", "pptx", "xls", "xlsx", "csv", "odt", "ods", "odp", "txt", "rtf", "md", "jpg", "jpeg", "png", "webp", "gif", "zip"]);

export default async (req: Request) => {
  const u = new URL(req.url);
  const teamId = clip(u.searchParams.get("id"), 80);
  const access = await openTeamAccess(teamId, clip(req.headers.get("x-team-key"), 200));
  if (!access) return json({ error: "forbidden", message: "הקישור לסביבת העבודה לא תקין." }, 403);
  if (!(await lockOK(access.team, access.role, req.headers.get("x-team-code"))))
    return json({ error: "locked", message: "המרחב סגור לצוות. כדי להיכנס צריך את קוד הצוות." }, 423);
  const files = store("hosen-files");
  const prefix = `teamfiles/${access.team.id}/`;

  if (req.method === "GET") {
    const key = clip(u.searchParams.get("key"), 400);
    if (!key.startsWith(prefix)) return json({ error: "bad_key" }, 400);
    const found = await files.getWithMetadata(key, { type: "blob" });
    if (!found) return json({ error: "not_found", message: "הקובץ לא נמצא." }, 404);
    const name = String(found.metadata?.filename || "file").replace(/["\r\n]/g, "");
    return new Response(found.data, { headers: {
      "content-type": String(found.metadata?.contentType || "application/octet-stream"),
      "content-disposition": `attachment; filename*=UTF-8''${encodeURIComponent(name)}`,
      "cache-control": "private, no-store",
    } });
  }

  if (req.method !== "POST") return json({ error: "method" }, 405);
  const form = await req.formData();
  const f = form.get("file");
  if (!(f instanceof File)) return json({ error: "missing_file" }, 400);
  const ext = (f.name.split(".").pop() || "").toLowerCase();
  if (!OK_EXT.has(ext) && !f.type.startsWith("image/")) return json({ error: "file_type", message: `סוג הקובץ ${f.name} אינו נתמך. אפשר לצרף קישור במקום.` }, 415);
  if (f.size > 4_000_000) return json({ error: "file_too_large", message: `הקובץ ${f.name} גדול מ־4MB. אפשר להעלות אותו ל־Google Drive ולצרף קישור.` }, 413);
  const key = `${prefix}${id().slice(0, 10)}-${safeName(f.name)}`;
  await files.set(key, f, { metadata: { contentType: f.type || "application/octet-stream", filename: f.name } });
  return json({ key, name: clip(f.name, 200), type: f.type, size: f.size }, 201);
};

export const config: Config = {
  path: "/api/team-files",
  rateLimit: { windowLimit: 40, windowSize: 60, aggregateBy: ["ip"] },
};
