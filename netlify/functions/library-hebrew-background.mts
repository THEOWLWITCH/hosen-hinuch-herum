import { fillInbox, fillPendingResources } from "../lib/library-hebrew.mts";

// פונקציית רקע: מכינה בעברית מדור מוצע, "מה חדש" ו"התרומה" למחקרים החדשים שמחכים לאישור,
// ומשלימה מחקרים שאושרו לפני שהעברית הייתה מוכנה. מופעלת אחרי האיסוף היומי ומתיבת האישור.
export default async (req: Request) => {
  const secret = Netlify.env.get("EDITOR_SECRET") || "";
  if (!secret || req.headers.get("x-internal") !== secret) return;
  await fillInbox();
  await fillPendingResources();
};
